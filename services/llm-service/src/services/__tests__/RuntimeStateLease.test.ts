import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireRuntimeStateLease,
  installRuntimeLeaseSignalHandlers,
} from '../RuntimeStateLease.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('RuntimeStateLease', () => {
  it('excludes a concurrent service or operator until release', async () => {
    const root = await fixtureRoot();
    const first = acquireRuntimeStateLease(root, 'operator');

    expect(() => acquireRuntimeStateLease(root, 'service')).toThrow('live or unverified');
    first.release();

    const second = acquireRuntimeStateLease(root, 'service');
    second.release();
  });

  it('fails closed on a stale lease instead of racing another acquirer', async () => {
    const root = await fixtureRoot();
    await fs.writeFile(
      join(root, '.llm-runtime.lease'),
      JSON.stringify({
        version: 1,
        leaseId: 'stale-fixture',
        owner: 'service',
        pid: 2_147_483_647,
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    );

    expect(() => acquireRuntimeStateLease(root, 'operator')).toThrow('live or unverified');
  });

  it('fails closed on an unverified lease record', async () => {
    const root = await fixtureRoot();
    await fs.writeFile(join(root, '.llm-runtime.lease'), 'not-a-valid-lease');

    expect(() => acquireRuntimeStateLease(root, 'operator')).toThrow('live or unverified');
  });

  it('refuses a symlinked or junction runtime root', async () => {
    const parent = await fixtureRoot();
    const target = join(parent, 'target');
    const linkedRoot = join(parent, 'linked');
    await fs.mkdir(target);
    await fs.symlink(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => acquireRuntimeStateLease(linkedRoot, 'operator')).toThrow('direct directory');
  });

  it('intercepts repeated SIGTERM while draining, then releases before exiting', async () => {
    const root = await fixtureRoot();
    const lease = acquireRuntimeStateLease(root, 'service');
    const signalSource = new EventEmitter();
    let serviceClosed = false;
    let resolveClose: () => void = () => undefined;
    const closeGate = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    let resolveExit: (code: number) => void = () => undefined;
    const exited = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });

    installRuntimeLeaseSignalHandlers({
      lease,
      closeService: async () => {
        serviceClosed = true;
        await closeGate;
      },
      signalSource: signalSource as Pick<NodeJS.Process, 'on' | 'removeListener'>,
      exit: resolveExit,
    });
    signalSource.emit('SIGTERM');
    signalSource.emit('SIGTERM');

    await Promise.resolve();
    expect(serviceClosed).toBe(true);
    expect(() => acquireRuntimeStateLease(root, 'operator')).toThrow('live or unverified');
    resolveClose();

    await expect(exited).resolves.toBe(143);
    const reacquired = acquireRuntimeStateLease(root, 'operator');
    reacquired.release();
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'holoscript-llm-lease-'));
  roots.push(root);
  return root;
}
