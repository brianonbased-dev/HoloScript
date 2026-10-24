/**
 * SSRF and resource guards for absorb's clone-from-URL (one test per guard).
 * git itself is never run: spawn is replaced by a fake child process.
 */
import { EventEmitter } from 'events';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'child_process';

import {
  CloneRefusal,
  cloneArgs,
  cloneEnv,
  cloneRepo,
  normalizeBranch,
  normalizeRepoUrl,
  pinToCommit,
} from './clone-from-url.js';

type Behaviour = { exitCode?: number; stderr?: string; neverExits?: boolean; delayMs?: number };

function fakeSpawn(b: Behaviour) {
  const calls: Array<{ cmd: string; args: string[]; env: NodeJS.ProcessEnv; dest: string }> = [];
  const kills: string[] = [];
  const impl = vi.fn((cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    const child = new EventEmitter() as unknown as ChildProcess & EventEmitter;
    (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
    (child as unknown as { kill: (s: string) => boolean }).kill = (s: string) => {
      kills.push(s);
      return true;
    };
    const dest = args[args.length - 1];
    calls.push({ cmd, args, env: opts.env ?? {}, dest });
    if (!b.neverExits) {
      setTimeout(async () => {
        if (b.exitCode === 0 || b.exitCode === undefined) {
          await fsp.mkdir(dest, { recursive: true });
          await fsp.writeFile(path.join(dest, 'README.md'), 'hi');
        }
        if (b.stderr) (child as unknown as { stderr: EventEmitter }).stderr.emit('data', Buffer.from(b.stderr));
        child.emit('close', b.exitCode ?? 0);
      }, b.delayMs ?? 5);
    }
    return child;
  });
  return { impl, calls, kills };
}

let root: string;
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'clone-guard-'));
});
afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

async function leftovers(): Promise<string[]> {
  return fsp.readdir(root).catch(() => []);
}

describe('URL allowlist (nothing is spawned for a refused URL)', () => {
  it.each([
    ['non-github host', 'https://gitlab.com/a/b.git'],
    ['github lookalike host', 'https://github.com.evil.test/a/b'],
    ['internal host', 'https://169.254.169.254/latest/meta-data'],
    ['http, not https', 'http://github.com/a/b'],
    ['user:pass@ credentials', 'https://user:pass@github.com/a/b'],
    ['token-only credentials', 'https://ghp_x@github.com/a/b'],
    ['explicit port', 'https://github.com:8443/a/b'],
    ['ssh scheme', 'ssh://git@github.com/a/b'],
    ['ext:: transport', 'ext::sh -c touch% /tmp/pwn'],
    ['file scheme', 'file:///etc'],
    ['query string', 'https://github.com/a/b?x=1'],
    ['extra path (not owner/repo)', 'https://github.com/a/b/tree/main'],
    ['dot-dot repo', 'https://github.com/a/..'],
  ])('%s is refused', async (_label, url) => {
    const { impl } = fakeSpawn({});
    await expect(cloneRepo(url, undefined, { root, spawnImpl: impl as never })).rejects.toMatchObject({
      code: 'repo_url_not_allowed',
    });
    expect(impl).not.toHaveBeenCalled();
  });

  it('a plain github.com repo normalizes to the canonical https .git URL', () => {
    expect(normalizeRepoUrl('https://GitHub.com/owner/repo')).toBe('https://github.com/owner/repo.git');
    expect(normalizeRepoUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo.git');
  });

  it('a branch that looks like an option or a path escape is refused', () => {
    for (const b of ['--upload-pack=x', '../x', 'a..b', '/abs', 'x y']) {
      expect(() => normalizeBranch(b)).toThrow(CloneRefusal);
    }
    expect(normalizeBranch('feature/x-1')).toBe('feature/x-1');
  });
});

describe('git invocation guards', () => {
  const args = cloneArgs('https://github.com/a/b.git', '/x/repo', 'main');
  const configs = args.filter((_, i) => args[i - 1] === '-c');

  it('redirects: http.followRedirects=false', () => {
    expect(configs).toContain('http.followRedirects=false');
  });

  it('transport: only https is allowed (protocol.allow=never + https=always)', () => {
    expect(configs).toContain('protocol.allow=never');
    expect(configs).toContain('protocol.https.allow=always');
    expect(cloneEnv('/h').GIT_ALLOW_PROTOCOL).toBe('https');
  });

  it('submodules: never recursed', () => {
    expect(args.join(' ')).not.toMatch(/recurse-submodules/);
    expect(configs).toContain('submodule.recurse=false');
    expect(configs).toContain('fetch.recurseSubmodules=false');
  });

  it('LFS: smudge skipped and filters emptied', () => {
    expect(cloneEnv('/h').GIT_LFS_SKIP_SMUDGE).toBe('1');
    expect(configs).toEqual(expect.arrayContaining(['filter.lfs.smudge=', 'filter.lfs.process=']));
  });

  it('hardening: no hooks, no fsmonitor, no credential helper, no system/global config', () => {
    expect(configs).toEqual(
      expect.arrayContaining(['core.hooksPath=/dev/null', 'core.fsmonitor=false', 'credential.helper='])
    );
    const env = cloneEnv('/h');
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('shape: depth 1, single branch, no tags, and -- before the URL', () => {
    expect(args).toEqual(expect.arrayContaining(['clone', '--depth', '1', '--single-branch', '--no-tags']));
    expect(args.slice(-3)).toEqual(['--', 'https://github.com/a/b.git', '/x/repo']);
  });

  it('environment: no service secrets reach git', () => {
    process.env.ABSORB_API_KEY = 'should-not-leak';
    process.env.DATABASE_URL = 'should-not-leak';
    try {
      const env = cloneEnv('/h');
      expect(Object.values(env)).not.toContain('should-not-leak');
      expect(Object.keys(env).sort()).toEqual(
        ['GIT_ALLOW_PROTOCOL', 'GIT_ASKPASS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_LFS_SKIP_SMUDGE', 'GIT_TERMINAL_PROMPT', 'HOME', 'PATH'].sort()
      );
    } finally {
      delete process.env.ABSORB_API_KEY;
      delete process.env.DATABASE_URL;
    }
  });

  it('redirect at runtime: git refusing the redirect is a clone_failed and leaves nothing behind', async () => {
    const { impl } = fakeSpawn({ exitCode: 128, stderr: 'fatal: unable to update url base from redirection' });
    await expect(
      cloneRepo('https://github.com/a/b', undefined, { root, spawnImpl: impl as never })
    ).rejects.toMatchObject({ code: 'clone_failed' });
    expect(await leftovers()).toEqual([]);
  });
});

describe('resource caps and cleanup', () => {
  it('timeout: the clone is killed (SIGKILL) and its dir removed', async () => {
    const { impl, kills } = fakeSpawn({ neverExits: true });
    await expect(
      cloneRepo('https://github.com/a/b', undefined, { root, spawnImpl: impl as never, timeoutMs: 30 })
    ).rejects.toMatchObject({ code: 'clone_timeout' });
    expect(kills).toEqual(['SIGKILL']);
    expect(await leftovers()).toEqual([]);
  });

  it('oversize while cloning: killed and removed', async () => {
    const { impl, kills } = fakeSpawn({ neverExits: true });
    await expect(
      cloneRepo('https://github.com/a/b', undefined, {
        root,
        spawnImpl: impl as never,
        timeoutMs: 5_000,
        maxBytes: 10,
        sizeOf: async () => 11,
      })
    ).rejects.toMatchObject({ code: 'clone_too_large' });
    expect(kills).toEqual(['SIGKILL']);
    expect(await leftovers()).toEqual([]);
  });

  it('oversize found after a fast clone: refused and removed', async () => {
    const { impl } = fakeSpawn({ exitCode: 0 });
    await expect(
      cloneRepo('https://github.com/a/b', undefined, { root, spawnImpl: impl as never, maxBytes: 1 })
    ).rejects.toMatchObject({ code: 'clone_too_large' });
    expect(await leftovers()).toEqual([]);
  });

  it('success: the clone lands under the clone root, and cleanup() removes it', async () => {
    const { impl, calls } = fakeSpawn({ exitCode: 0 });
    const repo = await cloneRepo('https://github.com/a/b', 'main', { root, spawnImpl: impl as never });
    expect(repo.dir.startsWith(root + path.sep)).toBe(true);
    expect(calls[0].cmd).toBe('git');
    expect((await fsp.readdir(repo.dir))).toContain('README.md');
    await repo.cleanup();
    expect(await leftovers()).toEqual([]);
  });
});

describe('pin the clone to the charged commit (#617)', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  /** Scripted git: rev-parse answers from heads[], fetch/checkout succeed unless failOn matches. */
  function scriptedGit(heads: string[], failOn?: string) {
    const seen: string[][] = [];
    const impl = vi.fn((_cmd: string, args: string[]) => {
      const child = new EventEmitter() as unknown as ChildProcess & EventEmitter;
      (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
      (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
      (child as unknown as { kill: () => boolean }).kill = () => true;
      const sub = args.filter((x, i) => args[i - 1] !== '-c' && x !== '-c');
      seen.push(sub);
      setTimeout(() => {
        if (sub[0] === 'rev-parse') {
          (child as unknown as { stdout: EventEmitter }).stdout.emit('data', Buffer.from((heads.shift() ?? '') + '\n'));
        }
        child.emit('close', failOn && sub[0] === failOn ? 128 : 0);
      }, 1);
      return child;
    });
    return { impl, seen };
  }

  it('HEAD already at the SHA: nothing is fetched', async () => {
    const g = scriptedGit([A]);
    await pinToCommit(g.impl as never, root, root, A, 5_000);
    expect(g.seen.map((x) => x[0])).toEqual(['rev-parse']);
  });

  it('branch moved: fetches the SHA, checks it out detached, verifies HEAD', async () => {
    const g = scriptedGit([B, A]);
    await pinToCommit(g.impl as never, root, root, A, 5_000);
    expect(g.seen.map((x) => x[0])).toEqual(['rev-parse', 'fetch', 'checkout', 'rev-parse']);
    expect(g.seen[1]).toContain(A);
    expect(g.seen[2]).toEqual(['checkout', '--quiet', '--detach', A]);
  });

  it('HEAD still not the SHA after checkout: clone_commit_mismatch', async () => {
    const g = scriptedGit([B, B]);
    await expect(pinToCommit(g.impl as never, root, root, A, 5_000)).rejects.toMatchObject({
      code: 'clone_commit_mismatch',
    });
  });

  it('the SHA cannot be fetched: refused, never scanned', async () => {
    const g = scriptedGit([B], 'fetch');
    await expect(pinToCommit(g.impl as never, root, root, A, 5_000)).rejects.toBeInstanceOf(CloneRefusal);
  });
});

describe('Mapping hold fixes (#617 N1, N2)', () => {
  it('N1: owner and repo differing only in case normalize to the same URL (same import id)', () => {
    expect(normalizeRepoUrl('https://github.com/Owner/Repo')).toBe('https://github.com/owner/repo.git');
    expect(normalizeRepoUrl('https://github.com/OWNER/repo.git')).toBe(normalizeRepoUrl('https://github.com/owner/REPO'));
  });

  it('N2: the size cap is applied after pinning, to the tree that is scanned', async () => {
    const A = 'a'.repeat(40);
    const B = 'b'.repeat(40);
    const heads = [B, A];
    let pinned = false;
    const impl = vi.fn((_cmd: string, args: string[]) => {
      const child = new EventEmitter() as unknown as ChildProcess & EventEmitter;
      (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
      (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
      (child as unknown as { kill: () => boolean }).kill = () => true;
      const sub = args.filter((x, i) => args[i - 1] !== '-c' && x !== '-c');
      setTimeout(async () => {
        if (sub[0] === 'clone') await fsp.mkdir(args[args.length - 1], { recursive: true });
        if (sub[0] === 'checkout') pinned = true;
        if (sub[0] === 'rev-parse') {
          (child as unknown as { stdout: EventEmitter }).stdout.emit('data', Buffer.from((heads.shift() ?? '') + '\n'));
        }
        child.emit('close', 0);
      }, 1);
      return child;
    });
    await expect(
      cloneRepo('https://github.com/a/b', 'main', {
        root,
        spawnImpl: impl as never,
        maxBytes: 10,
        expectedSha: A,
        // Small before the pin; the fetched commit makes it too large.
        sizeOf: async () => (pinned ? 11 : 1),
      })
    ).rejects.toMatchObject({ code: 'clone_too_large' });
    expect(await leftovers()).toEqual([]);
  });
});
