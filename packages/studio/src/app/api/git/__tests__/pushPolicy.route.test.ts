/**
 * Direct ship is a per-workspace setting, OFF by default. With it off,
 * /api/git/push and /api/git/ship must never push to the default branch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  runGit: vi.fn(),
  project: { metadata: {} as Record<string, unknown> },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'u1', name: 'U', email: 'u@x' } })),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: vi.fn(async () => 'tok') }));
vi.mock('@/lib/git/safeGit', () => ({
  runGit: h.runGit,
  runGitSync: vi.fn(() => {
    throw new Error('no origin/HEAD');
  }),
}));
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
    project: h.project,
  }),
}));

import { POST as pushPOST } from '../push/route';
import { POST as shipPOST } from '../ship/route';

function req(url: string, body: unknown) {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

function gitOk(stdoutFor: (args: readonly string[]) => string = () => '') {
  h.runGit.mockImplementation(async (args: readonly string[]) => ({
    stdout: stdoutFor(args),
    stderr: '',
  }));
}

function stubDefaultBranch(name: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/user')
            ? { login: 'o' }
            : { owner: { login: 'o' }, default_branch: name }
        ),
        { status: 200 }
      )
    )
  );
}

function pushedRefs(): string[][] {
  return h.runGit.mock.calls
    .map((c) => c[0] as string[])
    .filter((args) => args.includes('push'));
}

describe('git push honors the per-workspace direct-ship setting', () => {
  beforeEach(() => {
    h.runGit.mockReset();
    h.project = { metadata: { defaultBranch: 'main' } };
    stubDefaultBranch('main');
  });

  it('refuses to push the default branch when direct ship is unset (default)', async () => {
    gitOk((args) => (args[0] === 'remote' ? 'https://github.com/o/r.git' : ''));
    const res = await pushPOST(
      req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch: 'main' })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('direct_ship_off');
    expect(pushedRefs()).toHaveLength(0);
  });

  it('refuses a branchless push when HEAD is the default branch', async () => {
    gitOk((args) =>
      args[0] === 'rev-parse' ? 'main' : args[0] === 'remote' ? 'https://github.com/o/r.git' : ''
    );
    const res = await pushPOST(req('http://x/api/git/push', { workspacePath: '/ws/ws-1' }));
    expect(res.status).toBe(403);
    expect(pushedRefs()).toHaveLength(0);
  });

  it('allows a feature branch push with direct ship off', async () => {
    gitOk((args) => (args[0] === 'remote' ? 'https://github.com/o/r.git' : ''));
    const res = await pushPOST(
      req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch: 'studio/fix' })
    );
    expect(res.status).toBe(200);
    expect(pushedRefs()[0]).toContain('refs/heads/studio/fix:refs/heads/studio/fix');
  });

  it('allows the default branch only when the workspace turned direct ship on', async () => {
    h.project = { metadata: { defaultBranch: 'main', directShip: true } };
    gitOk((args) => (args[0] === 'remote' ? 'https://github.com/o/r.git' : ''));
    const res = await pushPOST(
      req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch: 'main' })
    );
    expect(res.status).toBe(200);
  });

  it('/api/git/ship refuses the default branch for an owner when direct ship is off', async () => {
    gitOk((args) => (args[0] === 'remote' ? 'https://github.com/o/r.git' : ''));
    // Owner role on GitHub must not be enough on its own.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/user') ? { login: 'o' } : { owner: { login: 'o' } }
          ),
          { status: 200 }
        )
      )
    );
    const res = await shipPOST(
      req('http://x/api/git/ship', { workspacePath: '/ws/ws-1', message: 'm', branch: 'main' })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe('direct_ship_off');
    expect(pushedRefs()).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('honors a renamed default from the GitHub API over stale metadata (push)', async () => {
    // Imported when the default was main; the repo has since renamed it to trunk.
    h.project = { metadata: { defaultBranch: 'main' } };
    stubDefaultBranch('trunk');
    gitOk((args) => (args[0] === 'remote' ? 'https://github.com/o/r.git' : ''));
    const res = await pushPOST(
      req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch: 'trunk' })
    );
    expect(res.status).toBe(403);
    expect(pushedRefs()).toHaveLength(0);
  });

  it('honors a renamed default from the GitHub API over stale metadata (ship)', async () => {
    h.project = { metadata: { defaultBranch: 'main' } };
    stubDefaultBranch('trunk');
    gitOk((args) => (args[0] === 'remote' ? 'https://github.com/o/r.git' : ''));
    const res = await shipPOST(
      req('http://x/api/git/ship', { workspacePath: '/ws/ws-1', message: 'm', branch: 'trunk' })
    );
    expect(res.status).toBe(403);
    expect(pushedRefs()).toHaveLength(0);
  });

  describe('B1: ref-shaped and forced targets never land on the default branch', () => {
    const remoteOnly = (args: readonly string[]) =>
      args[0] === 'remote' ? 'https://github.com/o/r.git' : '';

    for (const branch of ['heads/main', 'refs/heads/main', 'HEAD', '+main', 'x:main']) {
      it(`push refuses branch "${branch}" (direct ship off)`, async () => {
        gitOk(remoteOnly);
        const res = await pushPOST(req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch }));
        expect([400, 403]).toContain(res.status);
        expect(pushedRefs()).toHaveLength(0);
      });

      it(`push refuses branch "${branch}" even with direct ship on`, async () => {
        h.project = { metadata: { defaultBranch: 'main', directShip: true } };
        gitOk(remoteOnly);
        const res = await pushPOST(req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch }));
        expect([400, 403]).toContain(res.status);
        expect(pushedRefs()).toHaveLength(0);
      });

      it(`ship refuses branch "${branch}"`, async () => {
        gitOk(remoteOnly);
        const res = await shipPOST(
          req('http://x/api/git/ship', { workspacePath: '/ws/ws-1', message: 'm', branch })
        );
        expect([400, 403]).toContain(res.status);
        expect(pushedRefs()).toHaveLength(0);
      });
    }

    it('push refuses a --force push to the default branch even with direct ship on', async () => {
      h.project = { metadata: { defaultBranch: 'main', directShip: true } };
      gitOk(remoteOnly);
      const res = await pushPOST(
        req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch: 'main', force: true })
      );
      expect(res.status).toBe(403);
      expect(pushedRefs()).toHaveLength(0);
    });

    it('ship refuses a --force push to the default branch even with direct ship on', async () => {
      h.project = { metadata: { defaultBranch: 'main', directShip: true } };
      gitOk(remoteOnly);
      const res = await shipPOST(
        req('http://x/api/git/ship', { workspacePath: '/ws/ws-1', message: 'm', branch: 'main', force: true })
      );
      expect(res.status).toBe(403);
      expect(pushedRefs()).toHaveLength(0);
    });

    it('a --force push to a feature branch still works', async () => {
      gitOk(remoteOnly);
      const res = await pushPOST(
        req('http://x/api/git/push', { workspacePath: '/ws/ws-1', branch: 'studio/fix', force: true })
      );
      expect(res.status).toBe(200);
    });
  });
});
