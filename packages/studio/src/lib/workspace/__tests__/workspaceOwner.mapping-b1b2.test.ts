/**
 * Mapping second-seat BLOCK on #521 (2026-10-05), items B1 and B2.
 *
 * B1: POST /api/workspace/existing/import took a free rootPath and walked /
 *     hashed / reported files anywhere on the server. It must only scan inside
 *     a workspace the CALLER OWNS (uniform 404 otherwise).
 * B2: resolveInsideWorkspace climbed with existsSync, which follows links and
 *     reports a dangling link as "absent". A dangling leaf (or a dangling or
 *     looping intermediate dir) pointing outside passed the check and a write
 *     escaped the workspace.
 *
 * Real filesystem, users A and B, registry rows written the way import writes
 * them. Only the session seam is mocked.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  session: null as null | { user: Record<string, unknown> },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => state.session),
}));
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ getAll: () => [] })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { resolveInsideWorkspace } from '../workspaceFs';
import { WORKSPACE_NOT_ACCESSIBLE_ERROR } from '../workspaceOwner';
import { registerWorkspaceRows, sessionFor } from '../testing/ownedWorkspaceFixture';
import { POST as existingImportPOST } from '@/app/api/workspace/existing/import/route';
import { POST as filesPOST } from '@/app/api/workspace/files/route';

const USER_A = 'user-a';
const USER_B = 'user-b';

function jsonRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}
const existingImport = (body: Record<string, unknown>) =>
  existingImportPOST(jsonRequest('http://localhost/api/workspace/existing/import', body));
const files = (body: Record<string, unknown>) =>
  filesPOST(jsonRequest('http://localhost/api/workspace/files', body));

describe('Mapping B1/B2 on #521', () => {
  let tempRoot: string;
  let root: string;
  let repoA: string;
  let repoB: string;
  let outside: string;
  let fakeHome: string;
  const saved = {
    workspaces: process.env.HOLOSCRIPT_WORKSPACES_DIR,
    stateFile: process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE,
    cacheDir: process.env.HOLOSCRIPT_EXISTING_IMPORT_CACHE_DIR,
    home: process.env.HOME,
  };

  beforeEach(() => {
    tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ws-b1b2-')));
    root = path.join(tempRoot, 'workspaces');
    repoA = path.join(root, 'ws-aaaa', 'repo-a');
    repoB = path.join(root, 'ws-bbbb', 'repo-b');
    outside = path.join(tempRoot, 'outside');
    fakeHome = path.join(tempRoot, 'home');
    for (const dir of [path.join(repoA, 'src'), path.join(repoB, 'src'), outside, fakeHome]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(repoA, 'README.md'), '# A private\n');
    fs.writeFileSync(path.join(repoB, 'README.md'), '# B\n');
    fs.writeFileSync(path.join(fakeHome, 'README.md'), '# home\n');
    fs.writeFileSync(path.join(outside, 'host-secret.json'), '{"secret":"HOST"}\n');
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    process.env.HOLOSCRIPT_EXISTING_IMPORT_CACHE_DIR = path.join(tempRoot, 'import-cache');
    process.env.HOME = fakeHome;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    registerWorkspaceRows(root, [
      { id: 'ws-aaaa', localPath: repoA, ownerId: USER_A },
      { id: 'ws-bbbb', localPath: repoB, ownerId: USER_B },
    ]);
    state.session = sessionFor(USER_A);
  });

  afterEach(() => {
    for (const [key, value] of [
      ['HOLOSCRIPT_WORKSPACES_DIR', saved.workspaces],
      ['HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE', saved.stateFile],
      ['HOLOSCRIPT_EXISTING_IMPORT_CACHE_DIR', saved.cacheDir],
      ['HOME', saved.home],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('B1: /api/workspace/existing/import scans only workspaces the caller owns', () => {
    it('the owner can import their own workspace (scan pinned to the owned workspace id)', async () => {
      const res = await existingImport({ rootPath: repoA, workspaceId: 'ws-bbbb' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.workspace.rootPath).toBe(repoA);
      expect(body.workspace.workspaceId).toBe('ws-aaaa');
      expect(body.workspace.artifacts.map((a: { path: string }) => a.path)).toContain('README.md');
    });

    it("another account's workspace gets the uniform 404 and nothing of A's", async () => {
      state.session = sessionFor(USER_B);
      const res = await existingImport({ rootPath: repoA });
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: WORKSPACE_NOT_ACCESSIBLE_ERROR });
      expect(text).not.toContain('README');
    });

    const hostPaths: Array<[string, () => string]> = [
      ['/etc', () => '/etc'],
      ['/proc/self', () => '/proc/self'],
      ['the app cwd', () => process.cwd()],
      ['$HOME', () => fakeHome],
      ['a host dir next to the workspaces root', () => outside],
      ['the workspaces root itself', () => root],
      ["'..' escape out of the root", () => path.join(repoA, '..', '..', '..', 'outside')],
      ["'..' escape from B's workspace into A's", () => path.join(repoB, '..', '..', 'ws-aaaa')],
    ];
    for (const [label, rootPath] of hostPaths) {
      it(`refuses ${label} with the uniform 404 (no scan)`, async () => {
        state.session = sessionFor(USER_B);
        const res = await existingImport({ rootPath: rootPath() });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: WORKSPACE_NOT_ACCESSIBLE_ERROR });
      });
    }

    it('a path that does not exist answers exactly like a path that is not yours', async () => {
      state.session = sessionFor(USER_B);
      const ghost = await existingImport({ rootPath: path.join(root, 'ws-ghost', 'nope') });
      const foreign = await existingImport({ rootPath: repoA });
      expect(ghost.status).toBe(foreign.status);
      expect(await ghost.json()).toEqual(await foreign.json());
    });

    it('a symlinked manifestPath or default profile pointing out of the workspace is refused', async () => {
      fs.symlinkSync(path.join(outside, 'host-secret.json'), path.join(repoA, 'evil.json'));
      const viaManifest = await existingImport({ rootPath: repoA, manifestPath: 'evil.json' });
      expect(viaManifest.status).toBe(400);
      expect(await viaManifest.text()).not.toContain('HOST');

      fs.symlinkSync(
        path.join(outside, 'host-secret.json'),
        path.join(repoA, 'workspace-import.json')
      );
      const viaDefault = await existingImport({ rootPath: repoA });
      expect(viaDefault.status).toBe(400);
      expect(await viaDefault.text()).not.toContain('HOST');
    });
  });

  describe('B2: resolveInsideWorkspace never follows a link while climbing', () => {
    it('refuses a dangling leaf link to outside for a new file, and the write never lands', async () => {
      fs.symlinkSync(path.join(outside, 'leak.txt'), path.join(repoA, 'leak.txt'));
      expect(resolveInsideWorkspace(repoA, 'leak.txt').ok).toBe(false);
      const res = await files({
        workspacePath: repoA,
        op: 'write',
        path: 'leak.txt',
        content: 'x',
      });
      expect(res.status).toBe(400);
      expect(fs.existsSync(path.join(outside, 'leak.txt'))).toBe(false);
    });

    it('refuses an intermediate dir symlinked outside whose target dir does not exist yet', async () => {
      fs.symlinkSync(path.join(outside, 'not-yet'), path.join(repoA, 'out'));
      expect(resolveInsideWorkspace(repoA, 'out/new.txt').ok).toBe(false);
      for (const body of [
        { op: 'write', path: 'out/new.txt', content: 'x' },
        { op: 'mkdir', path: 'out/a/b' },
      ]) {
        const res = await files({ workspacePath: repoA, ...body });
        expect(res.status).toBe(400);
      }
      expect(fs.existsSync(path.join(outside, 'not-yet'))).toBe(false);
    });

    it('refuses an intermediate dir symlinked to an existing dir outside (pinned)', async () => {
      fs.symlinkSync(outside, path.join(repoA, 'live-out'));
      expect(resolveInsideWorkspace(repoA, 'live-out/new.txt').ok).toBe(false);
      const res = await files({
        workspacePath: repoA,
        op: 'write',
        path: 'live-out/new.txt',
        content: 'x',
      });
      expect(res.status).toBe(400);
      expect(fs.existsSync(path.join(outside, 'new.txt'))).toBe(false);
    });

    it('refuses a link chain (inside -> inside -> dangling outside)', async () => {
      fs.symlinkSync(path.join(outside, 'chain-end.txt'), path.join(repoA, 'c2'));
      fs.symlinkSync('c2', path.join(repoA, 'c1'));
      expect(resolveInsideWorkspace(repoA, 'c1').ok).toBe(false);
      const res = await files({ workspacePath: repoA, op: 'write', path: 'c1', content: 'x' });
      expect(res.status).toBe(400);
      expect(fs.existsSync(path.join(outside, 'chain-end.txt'))).toBe(false);
    });

    it('refuses a move onto a dangling link that points outside', async () => {
      fs.writeFileSync(path.join(repoA, 'src', 'm.ts'), 'm');
      fs.symlinkSync(path.join(outside, 'moved'), path.join(repoA, 'dest'));
      expect(resolveInsideWorkspace(repoA, 'dest/m.ts').ok).toBe(false);
      const res = await files({
        workspacePath: repoA,
        op: 'move',
        path: 'src/m.ts',
        toPath: 'dest/m.ts',
      });
      expect(res.status).toBe(400);
      expect(fs.existsSync(path.join(repoA, 'src', 'm.ts'))).toBe(true);
    });

    it('refuses a symlink loop instead of treating it as absent', () => {
      fs.symlinkSync('l2', path.join(repoA, 'l1'));
      fs.symlinkSync('l1', path.join(repoA, 'l2'));
      expect(resolveInsideWorkspace(repoA, 'l1/x.txt').ok).toBe(false);
    });

    it('allows a normal nested new path and links that stay inside the workspace', async () => {
      const nested = await files({
        workspacePath: repoA,
        op: 'write',
        path: 'a/b/c/new.txt',
        content: 'ok',
      });
      expect(nested.status).toBe(200);
      expect(fs.readFileSync(path.join(repoA, 'a', 'b', 'c', 'new.txt'), 'utf8')).toBe('ok');

      fs.symlinkSync(path.join(repoA, 'src'), path.join(repoA, 'alias'));
      expect(resolveInsideWorkspace(repoA, 'alias/new.ts').ok).toBe(true);
      fs.symlinkSync('later.txt', path.join(repoA, 'dangling-inside'));
      expect(resolveInsideWorkspace(repoA, 'dangling-inside').ok).toBe(true);
      expect(resolveInsideWorkspace(repoA, 'x/y/z.txt').ok).toBe(true);
    });
  });
});
