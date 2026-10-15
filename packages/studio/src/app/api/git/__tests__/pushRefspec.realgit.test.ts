/**
 * UNMOCKED git: a scratch clone plus a local bare remote. Repo config planted
 * in the clone must not be able to redirect a feature-branch push onto main,
 * through /api/git/push or /api/git/ship. Only auth, session and workspace
 * ownership are mocked; git itself runs for real through safeGit.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'u1', name: 'U', email: 'u@example.test' } })),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: vi.fn(async () => 'tok') }));
vi.mock('../_shared', () => ({
  isSafeGitRef: () => true,
  isSafeGitRemote: () => true,
  validateRelativeGitPaths: () => ({ ok: true }),
  resolveWorkspaceGitPath: (p: string) => ({ ok: true, resolved: p }),
}));
vi.mock('@/lib/workspace/workspaceOwner', () => ({
  assertWorkspaceOwner: (_s: unknown, p: string) => ({
    ok: true,
    resolved: p,
    workspaceDir: p,
    workspaceId: 'ws-1',
    project: { metadata: { defaultBranch: 'main' } },
  }),
}));

import { POST as pushPOST } from '../push/route';
import { POST as shipPOST } from '../ship/route';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function req(url: string, body: unknown) {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

describe('server push uses an explicit refspec that repo config cannot remap', () => {
  let root: string;
  let bare: string;
  let clone: string;
  let mainBefore: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'push-refspec-realgit-'));
    bare = path.join(root, 'remote.git');
    clone = path.join(root, 'clone');
    git(root, ['init', '-q', '--bare', '-b', 'main', bare]);
    git(root, ['init', '-q', '-b', 'main', clone]);
    git(clone, ['config', 'user.email', 't@example.test']);
    git(clone, ['config', 'user.name', 'T']);
    git(clone, ['config', 'commit.gpgSign', 'false']);
    fs.writeFileSync(path.join(clone, 'a.txt'), 'a\n');
    git(clone, ['add', 'a.txt']);
    git(clone, ['commit', '-q', '-m', 'init']);
    git(clone, ['remote', 'add', 'origin', bare]);
    git(clone, ['push', '-q', 'origin', 'main']);
    mainBefore = git(bare, ['rev-parse', 'refs/heads/main']);
    git(clone, ['checkout', '-q', '-b', 'feature']);
    fs.writeFileSync(path.join(clone, 'a.txt'), 'feature\n');
    git(clone, ['commit', '-q', '-am', 'feature work']);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function remoteRef(ref: string): string | null {
    try {
      return git(bare, ['rev-parse', '--verify', '-q', ref]);
    } catch {
      return null;
    }
  }

  function expectOnlyFeatureLanded() {
    expect(remoteRef('refs/heads/main')).toBe(mainBefore);
    expect(remoteRef('refs/heads/feature')).toBe(git(clone, ['rev-parse', 'HEAD']));
  }

  function plantRemotePushToMain() {
    git(clone, ['config', 'remote.origin.push', 'refs/heads/feature:refs/heads/main']);
  }

  function plantUpstreamMain() {
    git(clone, ['config', 'push.default', 'upstream']);
    git(clone, ['config', 'branch.feature.remote', 'origin']);
    git(clone, ['config', 'branch.feature.merge', 'refs/heads/main']);
  }

  it('push: planted remote.origin.push mapping to main does not touch main', async () => {
    plantRemotePushToMain();
    const res = await pushPOST(req('http://x/api/git/push', { workspacePath: clone, branch: 'feature' }));
    expect(res.status).toBe(200);
    expectOnlyFeatureLanded();
  });

  it('push: branch upstream = main with push.default=upstream does not touch main', async () => {
    plantUpstreamMain();
    const res = await pushPOST(req('http://x/api/git/push', { workspacePath: clone, branch: 'feature' }));
    expect(res.status).toBe(200);
    expectOnlyFeatureLanded();
  });

  it('ship: planted remote.origin.push mapping to main does not touch main', async () => {
    plantRemotePushToMain();
    const res = await shipPOST(
      req('http://x/api/git/ship', { workspacePath: clone, message: 'm', branch: 'feature' })
    );
    expect(res.status).toBe(200);
    expectOnlyFeatureLanded();
  });

  it('ship: branch upstream = main with push.default=upstream does not touch main', async () => {
    plantUpstreamMain();
    const res = await shipPOST(
      req('http://x/api/git/ship', { workspacePath: clone, message: 'm', branch: 'feature' })
    );
    expect(res.status).toBe(200);
    expectOnlyFeatureLanded();
  });
});
