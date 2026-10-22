import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * N19/N20 (#623).
 * N20: both absorb routes charge the signed-in user's OWN token (sent as
 * X-User-Authorization next to Studio's service key). The request's own
 * Authorization header is never forwarded, and there is no service-key-only
 * fallback: no user token is a 401 before anything is claimed or sent.
 * N19: on 409 import_id_reused a route clears the pending id only when this
 * same request stored the client's own candidate; an id stored earlier is
 * kept (fail closed) with an owner-visible error.
 */
const m = vi.hoisted(() => ({
  token: 'gh-user-token' as string | null,
  tokenFn: null as null | (() => Promise<string | null>),
}));
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/app/api/github/_shared', () => ({
  getGitHubToken: async () => (m.tokenFn ? m.tokenFn() : m.token),
}));
vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'service-key',
}));

import { POST as projectPost } from './route';
import { POST as daemonPost } from '../../../../daemon/absorb/route';
import * as state from '@/lib/absorb/projectState';

const WS = 'ws-11111111-2222-4333-8444-555555555555';
const FOREIGN = 'imp-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const KEPT = /tied to a different repository or folder\. It was kept/;

describe('N19/N20: own-token charge and import_id_reused origin', () => {
  let root: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  const meta = () => state.findDurableAbsorbProject({ projectId: WS })?.metadata ?? {};
  const daemon = (body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    daemonPost(
      new NextRequest('http://localhost/api/daemon/absorb', {
        method: 'POST',
        body: JSON.stringify({ workspaceId: WS, ...body }),
        headers: { 'Content-Type': 'application/json', ...headers },
      })
    );
  const folder = (body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    projectPost(
      new NextRequest(`http://localhost/api/absorb/projects/${WS}/absorb`, {
        method: 'POST',
        body: JSON.stringify({ depth: 'shallow', ...body }),
        headers: { 'Content-Type': 'application/json', ...headers },
      }),
      { params: Promise.resolve({ id: WS }) }
    );

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'absorb-n19n20-'));
    process.env.HOLOSCRIPT_WORKSPACES_DIR = root;
    delete process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE;
    m.token = 'gh-user-token';
    m.tokenFn = null;
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
    // Stand-in absorb: FOREIGN is already bound to another ref.
    fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string) as { importId: string };
      if (b.importId === FOREIGN) {
        return new Response(JSON.stringify({ error: 'import_id_reused' }), { status: 409 });
      }
      return new Response(JSON.stringify({ graphId: 'g1', cost: 10 }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('N20 folder: no user token is 401, nothing sent (no service-key fallback)', async () => {
    m.token = null;
    const res = await folder({}, { Authorization: 'Bearer someone-else' });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_no_user_credential');
    expect(fetchMock).not.toHaveBeenCalled();
    // N21: the id may already have been handed to a concurrent request: kept.
    expect(meta().pendingFolderImportId).toBeTruthy();
  });

  it("N20 folder: charges the session user's own token, never the request's Authorization", async () => {
    const res = await folder({}, { Authorization: 'Bearer someone-else' });
    expect(res.status).toBe(200);
    const h = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer service-key');
    expect(h['X-User-Authorization']).toBe('Bearer gh-user-token');
    expect(JSON.stringify(h)).not.toContain('someone-else');
  });

  it('N20 daemon: no user token is 401, nothing sent; the claimed id is kept (N21)', async () => {
    m.token = null;
    const res = await daemon();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(meta().pendingImportId).toBeTruthy();
  });

  it("N19: the client's own id, stored by this request, reused elsewhere: cleared, and the next try is new", async () => {
    for (const [send, key] of [
      [folder, 'pendingFolderImportId'],
      [daemon, 'pendingImportId'],
    ] as const) {
      const res = await send({ importId: FOREIGN });
      expect(res.status).toBe(409);
      const j = await res.json();
      expect(j.reason).toBe('import_id_reused');
      expect(j.error).toMatch(/It was not used/);
      expect(meta()[key]).toBeFalsy();
      const next = await send();
      expect(next.status).toBe(200);
    }
  });

  it('N19: an id stored earlier and reported reused is kept (fail closed) with an owner-visible error', async () => {
    for (const [send, key] of [
      [folder, 'pendingFolderImportId'],
      [daemon, 'pendingImportId'],
    ] as const) {
      expect(state.claimPendingAbsorbImportId(WS, 'user-a', FOREIGN, key)).toBe(FOREIGN);
      const res = await send({ importId: 'imp-11111111-1111-4111-8111-111111111111' });
      expect(res.status).toBe(409);
      const j = await res.json();
      expect(j.importId).toBe(FOREIGN);
      expect(j.error).toMatch(KEPT);
      expect(meta()[key]).toBe(FOREIGN);
    }
  });
  it('N21: concurrent same-owner requests; the first has no token, the second is unknown; the retry charges once', async () => {
    for (const [send, key] of [
      [daemon, 'pendingImportId'],
      [folder, 'pendingFolderImportId'],
    ] as const) {
      const claims = new Map<string, number>(); // importId -> charges
      let drop = true;
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        const b = JSON.parse(init.body as string) as { importId: string };
        const replay = claims.has(b.importId);
        if (!replay) claims.set(b.importId, 1);
        if (drop) {
          drop = false;
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }
        return new Response(JSON.stringify({ graphId: 'g1', cost: replay ? 0 : 10 }), {
          status: 200,
        });
      });
      // First request: claims the id, then its token lookup is slow and empty.
      // Second request: finds that id, has a token, sends it, outcome unknown.
      const tokens: Array<() => Promise<string | null>> = [
        () => new Promise((r) => setTimeout(() => r(null), 30)),
        async () => 'gh-user-token',
      ];
      m.tokenFn = () => (tokens.shift() ?? (async () => 'gh-user-token'))();
      const [first, second] = await Promise.all([send(), send()]);
      expect(first.status).toBe(401);
      expect((await second.json()).reason).toBe('absorb_outcome_unknown');
      const sentId = (
        JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string) as {
          importId: string;
        }
      ).importId;
      expect(meta()[key]).toBe(sentId);
      const retry = await send();
      expect(retry.status).toBe(200);
      expect(claims.size).toBe(1);
      m.tokenFn = null;
      fetchMock.mockClear();
    }
  });
});
