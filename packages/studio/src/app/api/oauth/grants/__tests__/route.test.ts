/**
 * /api/oauth/grants forwards the signed-in user's request to mcp-server with a
 * Studio session assertion that mcp-server's REAL verifier accepts for that
 * user only; no session -> 401 without calling upstream.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { GET, DELETE } from '../route';
import {
  verifyStudioGrantsSession,
  resetConsentReplayGuard,
} from '../../../../../../../mcp-server/src/security/studio-consent';

const SECRET = 'grants-route-test-secret-0123456789abcdef';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.STUDIO_CONSENT_SECRET = SECRET;
  process.env.MCP_OAUTH_ISSUER_URL = 'https://mcp.test';
  resetConsentReplayGuard();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    const user = verifyStudioGrantsSession(h['X-Studio-Consent'], SECRET);
    if (!user) return new Response(JSON.stringify({ error: 'login_required' }), { status: 401 });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ grants: [{ id: 'grant_a', user }] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STUDIO_CONSENT_SECRET;
  delete process.env.MCP_OAUTH_ISSUER_URL;
  sessionMock.mockReset();
});

const del = (id: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://studio.test/api/oauth/grants?id=${id}`, {
    method: 'DELETE',
    headers: { host: 'studio.test', ...headers },
  });

describe('/api/oauth/grants', () => {
  it('GET anonymous is 401 and never calls mcp-server', async () => {
    sessionMock.mockResolvedValue(null);
    const r = await GET();
    expect(r.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GET forwards with an assertion mcp-server verifies as the session user', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'alice' } });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ grants: [{ id: 'grant_a', user: 'alice' }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mcp.test/oauth/grants');
    expect(init.method).toBe('GET');
    expect(String(url)).not.toContain('v1.');
  });

  it('the assertion never reaches the browser', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'alice' } });
    const r = await GET();
    const text = JSON.stringify(await r.json()) + JSON.stringify([...r.headers.entries()]);
    expect(text).not.toMatch(/v1\.[A-Za-z0-9_-]+\./);
    expect(text).not.toContain(SECRET);
  });

  it('DELETE forwards to /oauth/grants/:id and passes 204 through', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'alice' } });
    const r = await DELETE(del('grant_a'));
    expect(r.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mcp.test/oauth/grants/grant_a');
    expect(init.method).toBe('DELETE');
  });

  it('DELETE anonymous is 401; cross-origin is 403; bad id is 400 (no upstream call)', async () => {
    sessionMock.mockResolvedValue(null);
    expect((await DELETE(del('grant_a'))).status).toBe(401);
    sessionMock.mockResolvedValue({ user: { id: 'alice' } });
    expect((await DELETE(del('grant_a', { origin: 'https://evil.test' }))).status).toBe(403);
    expect((await DELETE(del('..%2Fclients%2Fx'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no secret configured: 503, fail closed', async () => {
    delete process.env.STUDIO_CONSENT_SECRET;
    sessionMock.mockResolvedValue({ user: { id: 'alice' } });
    expect((await GET()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
