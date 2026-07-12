import { promises as fs } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatScrubFailure,
  RuntimeScrubError,
  scrubRuntimeState,
} from '../scrub-runtime-state.js';
import { acquireRuntimeStateLease } from '../../services/RuntimeStateLease.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('scrubRuntimeState', () => {
  it('reports a dry run without changing persisted state', async () => {
    const root = await fixtureRoot();
    const before = await readFixtureBytes(root);

    const receipt = await scrubRuntimeState({
      runtimeRoot: root,
      dryRun: true,
      port: 8000,
      probePort: async () => false,
      now: () => new Date('2026-07-12T00:00:00.000Z'),
    });

    expect(receipt).toMatchObject({
      mode: 'dry-run',
      stateClassCount: 3,
      existingPathCount: 3,
      lockPathCount: 0,
      serviceListenerDetected: false,
      completedAt: '2026-07-12T00:00:00.000Z',
    });
    expect(await readFixtureBytes(root)).toEqual(before);
    await expect(fs.access(join(root, '.llm-runtime.lease'))).rejects.toThrow();
  });

  it('stages and replaces all supported state classes with empty schemas', async () => {
    const root = await fixtureRoot();

    const receipt = await scrubRuntimeState({
      runtimeRoot: root,
      port: 8000,
      probePort: async () => false,
    });

    expect(receipt.mode).toBe('scrub');
    expect(receipt.stateClasses).toEqual([
      'auth_session_store',
      'auth_user_store',
      'rate_limit_store',
    ]);
    await expect(readJson(join(root, 'auth', 'users.json'))).resolves.toEqual({
      version: 1,
      users: {},
    });
    await expect(readJson(join(root, 'auth', 'sessions.json'))).resolves.toEqual({
      version: 1,
      sessions: {},
    });
    await expect(readJson(join(root, 'rate-limits', 'windows.json'))).resolves.toEqual({
      version: 1,
      windows: {},
    });
    expect((await fs.readdir(join(root, 'auth'))).filter((name) => name.endsWith('.tmp'))).toEqual(
      []
    );
  });

  it('fails closed before mutation when a store lock exists', async () => {
    const root = await fixtureRoot();
    const before = await readFixtureBytes(root);
    await fs.writeFile(join(root, 'auth', 'sessions.json.lock'), 'fixture-lock');

    await expect(
      scrubRuntimeState({ runtimeRoot: root, port: 8000, probePort: async () => false })
    ).rejects.toMatchObject({ code: 'state_store_locked' });
    expect(await readFixtureBytes(root)).toEqual(before);
  });

  it('uses the service lease even for a dry run', async () => {
    const root = await fixtureRoot();
    const lease = acquireRuntimeStateLease(root, 'service');
    try {
      await expect(
        scrubRuntimeState({
          runtimeRoot: root,
          dryRun: true,
          port: 8000,
          probePort: async () => false,
        })
      ).rejects.toMatchObject({ code: 'runtime_lease_unavailable' });
    } finally {
      lease.release();
    }
  });

  it('fails closed before mutation when the configured service port is live', async () => {
    const root = await fixtureRoot();
    const before = await readFixtureBytes(root);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test listener.');

    try {
      await expect(
        scrubRuntimeState({ runtimeRoot: root, port: address.port })
      ).rejects.toMatchObject({ code: 'service_listener_detected' });
      expect(await readFixtureBytes(root)).toEqual(before);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it('invalidates sessions first and fails secure after a mid-commit error', async () => {
    const root = await fixtureRoot();
    let renameCount = 0;

    let failure: unknown;
    try {
      await scrubRuntimeState({
        runtimeRoot: root,
        port: 8000,
        probePort: async () => false,
        renameFile: async (source, destination) => {
          renameCount += 1;
          if (renameCount === 2) throw new Error('fixture rename failure');
          await fs.rename(source, destination);
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(RuntimeScrubError);
    expect(failure).toMatchObject({ code: 'state_commit_failed', committedStateClassCount: 1 });
    await expect(readJson(join(root, 'auth', 'sessions.json'))).resolves.toEqual({
      version: 1,
      sessions: {},
    });
    await expect(readJson(join(root, 'auth', 'users.json'))).resolves.toEqual({
      version: 1,
      users: { fixture: {} },
    });
    expect(await findTemporaryFiles(root)).toEqual([]);
  });

  it('rejects a symlinked state parent before mutation', async () => {
    const root = await fixtureRoot();
    const outside = await fs.mkdtemp(join(tmpdir(), 'holoscript-llm-outside-'));
    roots.push(outside);
    await fs.rm(join(root, 'auth'), { recursive: true, force: true });
    await fs.symlink(
      outside,
      join(root, 'auth'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    await expect(
      scrubRuntimeState({ runtimeRoot: root, port: 8000, probePort: async () => false })
    ).rejects.toMatchObject({ code: 'state_path_invalid' });
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('redacts raw filesystem details from the CLI failure envelope', () => {
    const output = formatScrubFailure(
      new Error('EACCES: C:\\private\\auth\\sessions.json contained fixture-secret'),
      new Date('2026-07-12T00:00:00.000Z')
    );

    expect(JSON.parse(output)).toEqual({
      schema: 'holoscript.llm-runtime-scrub.v1',
      outcome: 'failure',
      errorCode: 'scrub_failed',
      committedStateClassCount: 0,
      completedAt: '2026-07-12T00:00:00.000Z',
    });
    expect(output).not.toContain('private');
    expect(output).not.toContain('sessions.json');
    expect(output).not.toContain('fixture-secret');
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'holoscript-llm-scrub-'));
  roots.push(root);
  await fs.mkdir(join(root, 'auth'), { recursive: true });
  await fs.mkdir(join(root, 'rate-limits'), { recursive: true });
  await fs.writeFile(
    join(root, 'auth', 'users.json'),
    JSON.stringify({ version: 1, users: { fixture: {} } })
  );
  await fs.writeFile(
    join(root, 'auth', 'sessions.json'),
    JSON.stringify({ version: 1, sessions: { fixture: {} } })
  );
  await fs.writeFile(
    join(root, 'rate-limits', 'windows.json'),
    JSON.stringify({ version: 1, windows: { fixture: [1] } })
  );
  return root;
}

async function readFixtureBytes(root: string): Promise<string[]> {
  return Promise.all([
    fs.readFile(join(root, 'auth', 'users.json'), 'utf8'),
    fs.readFile(join(root, 'auth', 'sessions.json'), 'utf8'),
    fs.readFile(join(root, 'rate-limits', 'windows.json'), 'utf8'),
  ]);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function findTemporaryFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const directory of [join(root, 'auth'), join(root, 'rate-limits')]) {
    for (const file of await fs.readdir(directory)) {
      if (file.endsWith('.tmp')) files.push(file);
    }
  }
  return files;
}
