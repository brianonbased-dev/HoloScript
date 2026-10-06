/**
 * P0 2026-10-05 — workspace OWNER check. No cross-user file access.
 *
 * Before this fix /api/workspace/files, GET /api/workspace/import, the git
 * routes, build, paper-opt-in, daemon jobs and Brittney's workspacePath only
 * checked that a path was under the SHARED workspaces root. Any signed-in
 * account (sign-in is open to every GitHub user) could list, read, write, move
 * and delete files in another account's clone.
 *
 * Real filesystem throughout: two users, A and B, each with a workspace
 * registered in `<root>/.absorb-projects.json` exactly as import writes it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  session: null as null | { user: Record<string, unknown> },
  apiKeyOwner: {} as Record<string, string>,
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => state.session),
}));
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [] })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

// requireAuthOrApiKey: a `bk_` key resolves to its owning user via
// user_api_keys -> users. Both lookups are stubbed at their module seams.
vi.mock('@/lib/brittney/userApiKeys', () => ({
  validateApiKey: vi.fn(async (rawKey: string) =>
    state.apiKeyOwner[rawKey] ? { userId: state.apiKeyOwner[rawKey], keyId: `key-${rawKey}` } : null
  ),
}));
vi.mock('@/db/client', () => {
  let lastUserId = '';
  const db = {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          // drizzle `eq(users.id, X)` — pull X back out of the SQL chunks.
          const chunks = JSON.stringify(cond, (_k, v) =>
            typeof v === 'object' && v !== null && 'table' in v ? undefined : v
          );
          const match = chunks.match(/"value":"(user-[a-z]+)"/);
          lastUserId = match?.[1] ?? '';
          return {
            limit: async () =>
              lastUserId ? [{ id: lastUserId, name: lastUserId, email: null, image: null }] : [],
          };
        },
      }),
    }),
  };
  return { getDb: () => db };
});

import {
  assertWorkspaceOwner,
  resolveCallerWorkspacePath,
  WORKSPACE_NOT_ACCESSIBLE_ERROR,
} from '../workspaceOwner';
import { registerWorkspaceRows, sessionFor } from '../testing/ownedWorkspaceFixture';
import { POST as filesPOST } from '@/app/api/workspace/files/route';
import { GET as importGET } from '@/app/api/workspace/import/route';
import { GET as gitStatusGET } from '@/app/api/git/status/route';
import { GET as gitTreeGET } from '@/app/api/git/tree/route';
import { requireAuthOrApiKey } from '@/lib/api-auth';

const USER_A = 'user-a';
const USER_B = 'user-b';

function filesRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/workspace/files', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function gitInitWithCommit(dir: string): void {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.invalid',
  };
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, env });
  execFileSync('git', ['add', '-A'], { cwd: dir, env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env });
}

describe('P0 workspace owner check', () => {
  let tempRoot: string;
  let root: string;
  let repoA: string;
  let repoB: string;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
  const originalStateFile = process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ws-owner-'));
    root = path.join(tempRoot, 'workspaces');
    repoA = path.join(root, 'ws-aaaa', 'repo-a');
    repoB = path.join(root, 'ws-bbbb', 'repo-b');
    fs.mkdirSync(path.join(repoA, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repoB, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoA, 'secret.txt'), 'A-PRIVATE\n');
    fs.writeFileSync(path.join(repoA, 'src', 'index.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(repoB, 'src', 'index.ts'), 'export const b = 1;\n');
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    registerWorkspaceRows(root, [
      { id: 'ws-aaaa', localPath: repoA, ownerId: USER_A },
      { id: 'ws-bbbb', localPath: repoB, ownerId: USER_B },
    ]);
    state.session = sessionFor(USER_B);
    state.apiKeyOwner = { bk_key_of_a: USER_A, bk_key_of_b: USER_B };
  });

  afterEach(() => {
    if (originalWorkspacesDir === undefined) delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    else process.env.HOLOSCRIPT_WORKSPACES_DIR = originalWorkspacesDir;
    if (originalStateFile === undefined) delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    else process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE = originalStateFile;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('assertWorkspaceOwner', () => {
    it('admits the owner, at the repo and below it', () => {
      const atRepo = assertWorkspaceOwner(sessionFor(USER_A), repoA);
      expect(atRepo.ok).toBe(true);
      if (atRepo.ok) {
        expect(atRepo.workspaceId).toBe('ws-aaaa');
        expect(atRepo.resolved).toBe(fs.realpathSync(repoA));
      }
      expect(assertWorkspaceOwner(sessionFor(USER_A), path.join(repoA, 'src')).ok).toBe(true);
    });

    it("refuses another account's workspace", () => {
      expect(assertWorkspaceOwner(sessionFor(USER_B), repoA)).toEqual({
        ok: false,
        error: WORKSPACE_NOT_ACCESSIBLE_ERROR,
        status: 404,
      });
    });

    it('answers "not yours" and "does not exist" identically', () => {
      const notYours = assertWorkspaceOwner(sessionFor(USER_B), repoA);
      const missingInA = assertWorkspaceOwner(sessionFor(USER_B), path.join(repoA, 'nope'));
      const missingWs = assertWorkspaceOwner(sessionFor(USER_B), path.join(root, 'ws-zzzz'));
      expect(missingInA).toEqual(notYours);
      expect(missingWs).toEqual(notYours);
    });

    it('refuses a row with no owner (legacy) even for the account that made it', () => {
      const legacy = path.join(root, 'ws-legacy', 'repo');
      fs.mkdirSync(legacy, { recursive: true });
      registerWorkspaceRows(root, [{ id: 'ws-legacy', localPath: legacy, ownerId: null }]);
      expect(assertWorkspaceOwner(sessionFor(USER_A), legacy).ok).toBe(false);
      expect(assertWorkspaceOwner(sessionFor(USER_B), legacy).ok).toBe(false);
    });

    it('refuses a directory with no registry row at all', () => {
      const orphan = path.join(root, 'ws-orphan');
      fs.mkdirSync(orphan, { recursive: true });
      expect(assertWorkspaceOwner(sessionFor(USER_A), orphan).ok).toBe(false);
    });

    it('refuses a caller with no user id, the root itself, and the registry file', () => {
      expect(assertWorkspaceOwner({ user: { id: '' } }, repoA).ok).toBe(false);
      expect(assertWorkspaceOwner(null, repoA).ok).toBe(false);
      expect(assertWorkspaceOwner(sessionFor(USER_A), root).ok).toBe(false);
      expect(
        assertWorkspaceOwner(sessionFor(USER_A), path.join(root, '.absorb-projects.json')).ok
      ).toBe(false);
    });

    it('is separator-safe: a sibling that shares the root prefix is outside', () => {
      const sibling = path.join(tempRoot, 'workspaces-evil', 'ws-aaaa');
      fs.mkdirSync(sibling, { recursive: true });
      expect(assertWorkspaceOwner(sessionFor(USER_A), sibling).ok).toBe(false);
    });

    it('cannot be claimed by registering a row that merely POINTS at the workspace', () => {
      // B registers a row of their own whose localPath is A's clone (what
      // POST /api/absorb/projects would let any account write).
      registerWorkspaceRows(root, [{ id: 'local_b_claim', localPath: repoA, ownerId: USER_B }]);
      expect(assertWorkspaceOwner(sessionFor(USER_B), repoA).ok).toBe(false);
      expect(assertWorkspaceOwner(sessionFor(USER_A), repoA).ok).toBe(true);
    });

    it('cannot claim an unregistered directory by pointing a row of your own at it', () => {
      // e.g. the founder-backfill dir or a cache: present on disk, no row of its own.
      const orphan = path.join(root, 'ws-orphan');
      fs.mkdirSync(orphan, { recursive: true });
      registerWorkspaceRows(root, [{ id: 'local_b_orphan', localPath: orphan, ownerId: USER_B }]);
      expect(assertWorkspaceOwner(sessionFor(USER_B), orphan).ok).toBe(false);
    });

    it("refuses a symlink in the caller's own workspace that points into another workspace", () => {
      const link = path.join(repoB, 'link-to-a');
      fs.symlinkSync(repoA, link, 'dir');
      expect(assertWorkspaceOwner(sessionFor(USER_B), link).ok).toBe(false);
    });

    it('refuses traversal spelled into the workspace path', () => {
      const traversal = `${repoB}${path.sep}..${path.sep}..${path.sep}ws-aaaa${path.sep}repo-a`;
      expect(assertWorkspaceOwner(sessionFor(USER_B), traversal).ok).toBe(false);
    });
  });

  describe('/api/workspace/files', () => {
    const ops = [
      { op: 'list', path: '' },
      { op: 'read', path: 'secret.txt' },
      { op: 'write', path: 'secret.txt', content: 'B-WAS-HERE\n' },
      { op: 'write', path: 'planted.txt', content: 'B-WAS-HERE\n' },
      { op: 'move', path: 'secret.txt', toPath: 'moved.txt' },
      { op: 'delete', path: 'secret.txt' },
      { op: 'mkdir', path: 'b-dir' },
    ];

    for (const body of ops) {
      it(`user B cannot ${body.op}${body.path ? ` ${body.path}` : ''} in A's workspace`, async () => {
        state.session = sessionFor(USER_B);
        const res = await filesPOST(filesRequest({ workspacePath: repoA, ...body }));
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe(WORKSPACE_NOT_ACCESSIBLE_ERROR);
        expect(JSON.stringify(json)).not.toContain('A-PRIVATE');
        // A's workspace is untouched.
        expect(fs.readFileSync(path.join(repoA, 'secret.txt'), 'utf8')).toBe('A-PRIVATE\n');
        expect(fs.existsSync(path.join(repoA, 'planted.txt'))).toBe(false);
        expect(fs.existsSync(path.join(repoA, 'moved.txt'))).toBe(false);
        expect(fs.existsSync(path.join(repoA, 'b-dir'))).toBe(false);
      });
    }

    it('user B gets the same answer for a path in A that does not exist', async () => {
      state.session = sessionFor(USER_B);
      const real = await filesPOST(filesRequest({ workspacePath: repoA, op: 'list', path: '' }));
      const ghost = await filesPOST(
        filesRequest({ workspacePath: path.join(root, 'ws-ghost', 'x'), op: 'list', path: '' })
      );
      expect(ghost.status).toBe(real.status);
      expect(await ghost.json()).toEqual(await real.json());
    });

    it('the owner still lists, reads, writes and deletes', async () => {
      state.session = sessionFor(USER_A);
      const list = await filesPOST(filesRequest({ workspacePath: repoA, op: 'list', path: '' }));
      expect(list.status).toBe(200);
      const read = await filesPOST(
        filesRequest({ workspacePath: repoA, op: 'read', path: 'secret.txt' })
      );
      expect(read.status).toBe(200);
      expect((await read.json()).content).toBe('A-PRIVATE\n');
      const write = await filesPOST(
        filesRequest({ workspacePath: repoA, op: 'write', path: 'notes.md', content: 'hi\n' })
      );
      expect(write.status).toBe(200);
      const del = await filesPOST(
        filesRequest({ workspacePath: repoA, op: 'delete', path: 'notes.md' })
      );
      expect(del.status).toBe(200);
    });

    it("traversal out of the caller's own workspace into A's is refused", async () => {
      state.session = sessionFor(USER_B);
      const res = await filesPOST(
        filesRequest({ workspacePath: repoB, op: 'read', path: '../../ws-aaaa/repo-a/secret.txt' })
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain('A-PRIVATE');
    });

    it("a symlink inside the caller's own workspace cannot reach A's files", async () => {
      state.session = sessionFor(USER_B);
      fs.symlinkSync(repoA, path.join(repoB, 'link-to-a'), 'dir');
      const viaRelative = await filesPOST(
        filesRequest({ workspacePath: repoB, op: 'read', path: 'link-to-a/secret.txt' })
      );
      expect(viaRelative.status).toBe(400);
      expect(JSON.stringify(await viaRelative.json())).not.toContain('A-PRIVATE');
      const viaWorkspacePath = await filesPOST(
        filesRequest({
          workspacePath: path.join(repoB, 'link-to-a'),
          op: 'read',
          path: 'secret.txt',
        })
      );
      expect(viaWorkspacePath.status).toBe(404);
      expect(JSON.stringify(await viaWorkspacePath.json())).not.toContain('A-PRIVATE');
    });

    it('a legacy row with no owner is refused for file ops', async () => {
      const legacy = path.join(root, 'ws-legacy', 'repo');
      fs.mkdirSync(legacy, { recursive: true });
      registerWorkspaceRows(root, [{ id: 'ws-legacy', localPath: legacy, ownerId: null }]);
      state.session = sessionFor(USER_A);
      const res = await filesPOST(filesRequest({ workspacePath: legacy, op: 'list', path: '' }));
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/workspace/import', () => {
    it("lists only the caller's workspaces", async () => {
      const legacy = path.join(root, 'ws-legacy', 'repo');
      fs.mkdirSync(legacy, { recursive: true });
      registerWorkspaceRows(root, [{ id: 'ws-legacy', localPath: legacy, ownerId: null }]);

      state.session = sessionFor(USER_A);
      const resA = await importGET();
      expect(resA.status).toBe(200);
      const idsA = (await resA.json()).workspaces.map((w: { id: string }) => w.id);
      expect(idsA).toEqual(['ws-aaaa']);

      state.session = sessionFor(USER_B);
      const bodyB = await (await importGET()).json();
      expect(bodyB.workspaces.map((w: { id: string }) => w.id)).toEqual(['ws-bbbb']);
      expect(JSON.stringify(bodyB)).not.toContain(repoA);
    });

    it('requires a session of its own (not only the edge gate)', async () => {
      state.session = null;
      expect((await importGET()).status).toBe(401);
      state.session = { user: { name: 'no id' } };
      expect((await importGET()).status).toBe(401);
    });
  });

  describe('git routes', () => {
    beforeEach(() => {
      gitInitWithCommit(repoA);
    });

    it('GET /api/git/status is refused for a non-owner and works for the owner', async () => {
      const url = `http://localhost/api/git/status?workspacePath=${encodeURIComponent(repoA)}`;
      state.session = sessionFor(USER_B);
      const refused = await gitStatusGET(new NextRequest(url));
      expect(refused.status).toBe(404);

      state.session = sessionFor(USER_A);
      const allowed = await gitStatusGET(new NextRequest(url));
      expect(allowed.status).toBe(200);
    });

    it('GET /api/git/tree is refused for a non-owner', async () => {
      state.session = sessionFor(USER_B);
      const res = await gitTreeGET(
        new NextRequest(`http://localhost/api/git/tree?workspacePath=${encodeURIComponent(repoA)}`)
      );
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain('secret.txt');
    });
  });

  describe('Brittney workspacePath with an API key', () => {
    function keyRequest(key: string): Request {
      return new Request('http://localhost/api/brittney', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
      });
    }

    it("B's API key resolves to user B and cannot attach A's workspace", async () => {
      const auth = await requireAuthOrApiKey(keyRequest('bk_key_of_b'));
      expect(auth).not.toBeInstanceOf(Response);
      if (auth instanceof Response) return;
      expect(auth.user.id).toBe(USER_B);
      expect(resolveCallerWorkspacePath(auth, repoA)).toBeNull();
      expect(resolveCallerWorkspacePath(auth, path.join(repoA, 'src'))).toBeNull();
      expect(resolveCallerWorkspacePath(auth, repoB)).toBe(fs.realpathSync(repoB));
    });

    it("A's API key still attaches A's workspace", async () => {
      const auth = await requireAuthOrApiKey(keyRequest('bk_key_of_a'));
      if (auth instanceof Response) throw new Error('expected an API-key session');
      expect(resolveCallerWorkspacePath(auth, repoA)).toBe(fs.realpathSync(repoA));
    });

    it('the Brittney route wires the owner-checked resolver to requireAuthOrApiKey', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../../../app/api/brittney/route.ts'),
        'utf8'
      );
      expect(source).toContain('resolveCallerWorkspacePath(auth, bodyWorkspacePath)');
      expect(source).not.toMatch(/resolveWorkspaceFsRoot\(/);
      expect(source).toMatch(/const auth = await requireAuthOrApiKey\(request\)/);
    });
  });
});
