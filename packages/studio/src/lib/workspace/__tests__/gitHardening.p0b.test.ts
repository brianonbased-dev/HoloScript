/**
 * P0b 2026-10-05 — refuse `.git` landing paths + harden server git invocations.
 *
 * Release's re-gate of #521 (51938b22) found a pre-existing high-severity hole:
 * workspaceFs blocked `.git` by request TEXT only. A clone carrying
 * `gitalias -> .git` let `POST /api/workspace/files` write `gitalias/config`
 * (200) over `.git/config`; setting `core.fsmonitor` there makes the next
 * server-side `git status` execute that program as the Studio user.
 *
 * Two guards, tested with REAL git in temp dirs:
 *   1. resolveInsideWorkspace refuses any resolved/landing path with a `.git`
 *      component (symlink or direct), so the write never lands.
 *   2. lib/git/safeGit runs every git call with -c core.fsmonitor=false
 *      -c core.hooksPath=/dev/null -c protocol.ext.allow=never, so even a
 *      planted repo config/hook is never executed.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ session: null as null | { user: Record<string, unknown> } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => state.session) }));
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [] })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { resolveInsideWorkspace } from '../workspaceFs';
import { registerWorkspaceRows, sessionFor } from '../testing/ownedWorkspaceFixture';

// Inlined so this behavioral suite loads against the pre-fix base too (where
// the export does not exist) and goes red per-test rather than failing to load.
const GIT_METADATA_ERROR = '.git is managed by the git APIs and is off-limits to file ops';
import { POST as filesPOST } from '@/app/api/workspace/files/route';
import { GET as gitStatusGET } from '@/app/api/git/status/route';
import { POST as gitCommitPOST } from '@/app/api/git/commit/route';

const USER_A = 'user-a';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@e.invalid',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@e.invalid',
    },
  });
}
function filesReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/workspace/files', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function statusReq(workspacePath: string): NextRequest {
  const u = new URL('http://localhost/api/git/status');
  u.searchParams.set('workspacePath', workspacePath);
  return new NextRequest(u);
}
function commitReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/git/commit', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('P0b .git landing guard + git hardening', () => {
  let tempRoot: string;
  let root: string;
  let repoA: string;
  let marker: string;
  let fsmonitorScript: string;
  const saved = {
    workspaces: process.env.HOLOSCRIPT_WORKSPACES_DIR,
    stateFile: process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE,
  };

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p0b-git-')));
    root = path.join(tempRoot, 'workspaces');
    repoA = path.join(root, 'ws-aaaa', 'repo-a');
    fs.mkdirSync(path.join(repoA, 'src'), { recursive: true });
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    registerWorkspaceRows(root, [{ id: 'ws-aaaa', localPath: repoA, ownerId: USER_A }]);
    // A real repo with a commit.
    git(repoA, ['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(repoA, 'README.md'), '# A\n');
    git(repoA, ['add', '-A']);
    git(repoA, ['commit', '-q', '-m', 'init']);
    // A marker-writing script that core.fsmonitor / a hook would run.
    marker = path.join(tempRoot, 'MARKER');
    fsmonitorScript = path.join(tempRoot, 'fsmonitor.sh');
    fs.writeFileSync(fsmonitorScript, `#!/bin/sh\necho pwned > "${marker}"\nexit 1\n`);
    fs.chmodSync(fsmonitorScript, 0o755);
    state.session = sessionFor(USER_A);
  });

  afterEach(() => {
    for (const [k, v] of [
      ['HOLOSCRIPT_WORKSPACES_DIR', saved.workspaces],
      ['HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE', saved.stateFile],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('guard 1: .git landing paths', () => {
    it('(a) a write through a symlink-to-.git is refused and .git/config is unchanged', async () => {
      fs.symlinkSync('.git', path.join(repoA, 'gitalias'));
      const before = fs.readFileSync(path.join(repoA, '.git', 'config'), 'utf8');
      expect(resolveInsideWorkspace(repoA, 'gitalias/config')).toEqual({
        ok: false,
        error: GIT_METADATA_ERROR,
      });
      const res = await filesPOST(
        filesReq({
          workspacePath: repoA,
          op: 'write',
          path: 'gitalias/config',
          content: `[core]\n\tfsmonitor = ${fsmonitorScript}\n`,
        })
      );
      expect(res.status).toBe(400);
      expect(fs.readFileSync(path.join(repoA, '.git', 'config'), 'utf8')).toBe(before);
    });

    it('(b) a direct .git/config write is refused (text and landing)', async () => {
      for (const p of ['.git/config', 'src/../.git/config', '.GIT/config']) {
        const res = await filesPOST(
          filesReq({ workspacePath: repoA, op: 'write', path: p, content: 'x' })
        );
        expect(res.status).toBe(400);
      }
      // nested .git at depth, and read/move/mkdir are refused too
      expect(resolveInsideWorkspace(repoA, 'a/b/.git/x').ok).toBe(false);
      for (const op of [
        { op: 'read', path: 'gitalias/config' },
        { op: 'mkdir', path: '.git/hooks2' },
        { op: 'move', path: 'README.md', toPath: '.git/stolen' },
      ]) {
        fs.rmSync(path.join(repoA, 'gitalias'), { force: true });
        fs.symlinkSync('.git', path.join(repoA, 'gitalias'));
        const res = await filesPOST(filesReq({ workspacePath: repoA, ...op }));
        expect(res.status).toBe(400);
      }
    });

    it('(e) normal files next to .git still work (.gitignore, my.git.txt, .github/)', async () => {
      for (const p of ['.gitignore', 'my.git.txt', '.github/workflows.yml', 'src/git/util.ts']) {
        expect(resolveInsideWorkspace(repoA, p).ok).toBe(true);
        const res = await filesPOST(
          filesReq({ workspacePath: repoA, op: 'write', path: p, content: 'ok' })
        );
        expect(res.status).toBe(200);
      }
    });
  });

  describe('guard 2 end to end: planted repo config/hooks never execute', () => {
    it('(c) core.fsmonitor in .git/config is not run by the server git status path', async () => {
      // Plant it directly (bypassing the write guard) to isolate the hardening layer.
      git(repoA, ['config', 'core.fsmonitor', fsmonitorScript]);
      const res = await gitStatusGET(statusReq(repoA));
      expect(res.status).toBe(200);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('(d) a core.hooksPath pre-commit hook is not run by the git commit route', async () => {
      const hooks = path.join(tempRoot, 'evil-hooks');
      fs.mkdirSync(hooks, { recursive: true });
      const hook = path.join(hooks, 'pre-commit');
      fs.writeFileSync(hook, `#!/bin/sh\necho pwned > "${marker}"\nexit 0\n`);
      fs.chmodSync(hook, 0o755);
      git(repoA, ['config', 'core.hooksPath', hooks]);
      fs.writeFileSync(path.join(repoA, 'src', 'new.ts'), 'export const x = 1;\n');
      const res = await gitCommitPOST(
        commitReq({ workspacePath: repoA, message: 'add new', files: ['src/new.ts'] })
      );
      expect(res.status).toBe(200);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('full chain control: gitalias write refused AND planted fsmonitor not executed', async () => {
      // Step 1 (landing guard): the gitalias -> .git write is refused, .git/config untouched.
      fs.symlinkSync('.git', path.join(repoA, 'gitalias'));
      const before = fs.readFileSync(path.join(repoA, '.git', 'config'), 'utf8');
      const write = await filesPOST(
        filesReq({
          workspacePath: repoA,
          op: 'write',
          path: 'gitalias/config',
          content: `[core]\n\tfsmonitor = ${fsmonitorScript}\n`,
        })
      );
      expect(write.status).toBe(400);
      expect(fs.readFileSync(path.join(repoA, '.git', 'config'), 'utf8')).toBe(before);
      // Step 2 (hardening): even if core.fsmonitor were set, the status path won't run it.
      git(repoA, ['config', 'core.fsmonitor', fsmonitorScript]);
      const status = await gitStatusGET(statusReq(repoA));
      expect(status.status).toBe(200);
      expect(fs.existsSync(marker)).toBe(false);
    });
  });
});
