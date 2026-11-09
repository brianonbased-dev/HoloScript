/**
 * State-file lock (Mapping N5, #617): every writer takes the lock, takeover
 * and release check the owner token, and a timeout is a typed error.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as state from './projectState';

const timing = (state as Record<string, unknown>).__absorbStateLockTiming as
  { timeoutMs: number; staleMs: number } | undefined;
const saved = timing ? { ...timing } : null;

describe('absorb project state lock', () => {
  let root: string;
  let savedDir: string | undefined;
  let savedFile: string | undefined;

  beforeEach(() => {
    savedDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    savedFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-lock-test-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
  });

  afterEach(() => {
    if (timing && saved) Object.assign(timing, saved);
    if (savedDir === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = savedDir;
    if (savedFile === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = savedFile;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const lockPath = () => path.join(root, '.absorb-projects.json.lock');
  const makeOld = (p: string) => {
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(p, old, old);
  };

  it('concurrent writers in separate processes lose no updates', async () => {
    const moduleUrl = pathToFileURL(path.join(__dirname, 'projectState.ts')).href;
    const workers = 4;
    const perWorker = 30;
    const run = (w: number) =>
      new Promise<void>((resolve, reject) => {
        const script = `
          const s = await import(${JSON.stringify(moduleUrl)});
          for (let i = 0; i < ${perWorker}; i++) {
            if (i % 2) s.upsertDurableAbsorbProject({ id: 'p-${w}-' + i, name: 'n', ownerId: 'u' });
            else s.recordAbsorbJob({ projectId: 'p-${w}-' + i, source: 'local', result: { status: 'complete' } });
          }`;
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
          env: { ...process.env, HOLOSCRIPT_WORKSPACES_DIR: root },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let err = '';
        child.stderr.on('data', (c) => (err += String(c)));
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
      });
    await Promise.all(Array.from({ length: workers }, (_, w) => run(w)));
    const ids = new Set(
      JSON.parse(fs.readFileSync(path.join(root, '.absorb-projects.json'), 'utf-8')).projects.map(
        (p: { id: string }) => p.id
      )
    );
    expect(ids.size).toBe(workers * perWorker);
    expect(fs.existsSync(lockPath())).toBe(false);
  }, 60_000);

  it('stale-lock takeover race: only the taker that saw the current lock wins', () => {
    fs.writeFileSync(lockPath(), 'dead-holder');
    makeOld(lockPath());
    // A and B both observed the stale 'dead-holder' lock. A goes first and
    // takes the lock; B's takeover must not remove A's lock.
    expect(state.__takeOverStaleLock(lockPath(), 'dead-holder', 'taker-a')).toBe(true);
    fs.writeFileSync(lockPath(), 'taker-a');
    makeOld(lockPath()); // even if A's lock also looks old, the token differs
    expect(state.__takeOverStaleLock(lockPath(), 'dead-holder', 'taker-b')).toBe(false);
    expect(fs.readFileSync(lockPath(), 'utf-8')).toBe('taker-a');
  });

  it('a fresh lock is never taken over', () => {
    fs.writeFileSync(lockPath(), 'live-holder');
    expect(state.__takeOverStaleLock(lockPath(), 'live-holder', 'taker')).toBe(false);
    expect(fs.readFileSync(lockPath(), 'utf-8')).toBe('live-holder');
  });

  it('a holder does not release a lock owned by someone else', () => {
    fs.writeFileSync(lockPath(), 'other-owner');
    expect(state.__releaseStateLock(lockPath(), 'my-token')).toBe(false);
    expect(fs.readFileSync(lockPath(), 'utf-8')).toBe('other-owner');
    expect(state.__releaseStateLock(lockPath(), 'other-owner')).toBe(true);
    expect(fs.existsSync(lockPath())).toBe(false);
  });

  it('writers wait for a live foreign lock and time out with a typed error, leaving it in place', () => {
    if (timing) timing.timeoutMs = 100;
    fs.writeFileSync(lockPath(), 'other-owner');
    let thrown: unknown = null;
    try {
      state.upsertDurableAbsorbProject({ id: 'p1', name: 'n', ownerId: 'u' });
    } catch (err) {
      thrown = err;
    }
    expect(state.isAbsorbStateLockTimeout(thrown)).toBe(true);
    expect(() => state.recordAbsorbJob({ projectId: 'p1', source: 'local' })).toThrow(/locked/);
    expect(() => state.removeDurableAbsorbProject('p1', 'u')).toThrow(/locked/);
    expect(fs.existsSync(path.join(root, '.absorb-projects.json'))).toBe(false);
    expect(fs.readFileSync(lockPath(), 'utf-8')).toBe('other-owner');
  });

  it('a stale foreign lock is taken over and the write succeeds', () => {
    fs.writeFileSync(lockPath(), 'crashed-holder');
    makeOld(lockPath());
    state.upsertDurableAbsorbProject({ id: 'p1', name: 'n', ownerId: 'u' });
    expect(state.findDurableAbsorbProject({ projectId: 'p1' })?.ownerId).toBe('u');
    expect(fs.existsSync(lockPath())).toBe(false);
  });
});
