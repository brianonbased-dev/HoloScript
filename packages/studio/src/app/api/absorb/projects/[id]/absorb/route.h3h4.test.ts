import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Mapping H3/H4 (#623). One workspace absorbed through BOTH routes: the URL
 * import (/api/daemon/absorb) and the folder scan (this route). The stand-in
 * absorb charges once per importId, replays a known one at cost 0, and
 * refuses an importId reused for another ref (409 import_id_reused), as
 * absorb's claim store does.
 */
const m = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null }));
vi.mock('next-auth', () => ({ getServerSession: async () => (m.user ? { user: m.user } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: async () => 'gh-user-token' }));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { POST as projectPost } from './route';
import { POST as daemonPost, GET as daemonGet } from '../../../../daemon/absorb/route';
import * as state from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-555555555555';

describe('H3/H4: two routes, one workspace', () => {
  let root: string;
  let claims: Map<string, string>; // importId -> ref
  let charges: Array<{ importId: string; ref: string }>;
  let dropNext: boolean;
  const row = () => state.findDurableAbsorbProject({ projectId: WS });
  const daemon = (body: Record<string, unknown> = {}) =>
    daemonPost(
      new NextRequest('http://localhost/api/daemon/absorb', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: WS, ...body }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
  const folder = (body: Record<string, unknown> = {}) =>
    projectPost(
      new NextRequest(`http://localhost/api/absorb/projects/${WS}/absorb`, {
        method: 'POST',
        body: JSON.stringify({ depth: 'shallow', ...body }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ id: WS }) }
    );
  const chargesFor = (prefix: string) => charges.filter((c) => c.ref.startsWith(prefix)).length;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-h3h4-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    m.user = { id: 'user-a' };
    state.upsertDurableAbsorbProject({
      id: WS,
      name: 'tiny',
      ownerId: 'user-a',
      sourceType: 'github',
      sourceUrl: 'https://github.com/owner/tiny.git',
      localPath: path.join(root, WS, 'tiny'),
      status: 'ready',
      metadata: { branch: 'main' },
    });
    claims = new Map();
    charges = [];
    dropNext = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const b = JSON.parse(init.body as string) as {
          importId: string;
          repoUrl?: string;
          path?: string;
        };
        const ref = b.repoUrl ? `url:${b.repoUrl}` : `path:${b.path}`;
        const known = claims.get(b.importId);
        if (known && known !== ref) {
          return new Response(JSON.stringify({ error: 'import_id_reused' }), { status: 409 });
        }
        const replay = known === ref;
        if (!replay) {
          claims.set(b.importId, ref);
          charges.push({ importId: b.importId, ref });
        }
        if (dropNext) {
          dropNext = false;
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }
        return new Response(
          JSON.stringify({ graphId: 'g1', cost: replay ? 0 : 10, replayed: replay }),
          {
            status: 200,
          }
        );
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('H3: daemon unknown outcome, then the folder route, then the daemon retry: the URL import is charged once', async () => {
    dropNext = true;
    expect((await daemon()).status).toBe(502);
    const x = row()?.metadata.pendingImportId;
    expect(typeof x).toBe('string');
    await folder();
    expect(row()?.metadata.pendingImportId).toBe(x);
    const retry = await daemon();
    expect(retry.status).toBe(200);
    expect((await retry.json()).importId).toBe(x);
    expect(chargesFor('url:')).toBe(1);
  });

  it('H3 (reverse): folder unknown outcome, then the daemon route, then the folder retry: the folder scan is charged once', async () => {
    dropNext = true;
    expect((await folder()).status).toBe(502);
    await daemon();
    const retry = await folder();
    expect(retry.status).toBe(200);
    expect((await retry.json()).replayed).toBe(true);
    expect(chargesFor('path:')).toBe(1);
  });

  it("H4: user B cannot scan A's project, read, set or clear A's pending id, pin A's delete, or record jobs on A's row", async () => {
    dropNext = true;
    await folder(); // A: unknown outcome, A's folder id is pending
    const before = row();
    const aId = before?.metadata.pendingFolderImportId;
    expect(typeof aId).toBe('string');
    const fetchCalls = (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    m.user = { id: 'user-b' };
    const res = await folder({ importId: 'imp-user-b-0001' });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain(String(aId));
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(fetchCalls);
    const read = await daemonGet(
      new NextRequest(`http://localhost/api/daemon/absorb?workspaceId=${WS}`)
    );
    expect(read.status).toBe(404);
    const after = row();
    expect(after?.metadata.pendingFolderImportId).toBe(aId);
    expect(after?.absorbJobs).toHaveLength(before?.absorbJobs.length ?? 0);

    // B never pins a delete: with A's id settled, A's rollback goes through.
    m.user = { id: 'user-a' };
    state.clearPendingAbsorbImportId(WS, 'user-a', String(aId), 'pendingFolderImportId');
    const b2 = state.upsertDurableAbsorbProject({
      id: 'ws-b',
      name: 'b',
      ownerId: 'user-a',
      localPath: path.join(root, 'b'),
    });
    m.user = { id: 'user-b' };
    expect(
      (
        await projectPost(
          new NextRequest('http://localhost/api/absorb/projects/ws-b/absorb', {
            method: 'POST',
            body: '{}',
          }),
          { params: Promise.resolve({ id: b2.id }) }
        )
      ).status
    ).toBe(404);
    expect(state.removeUnabsorbedAbsorbProject('ws-b', 'user-a')).toBe('removed');
  });

  it('H4: no session is 401 and nothing is sent', async () => {
    m.user = null;
    expect((await folder()).status).toBe(401);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});
