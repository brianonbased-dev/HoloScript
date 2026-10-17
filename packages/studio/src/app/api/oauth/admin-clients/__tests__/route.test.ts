/**
 * /api/oauth/admin-clients: founder-only; forwards with an admin-clients
 * assertion that mcp-server's REAL verifier accepts as a human admin; never
 * sends an API key; a non-founder or cross-origin request never reaches mcp-server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { founderMock } = vi.hoisted(() => ({ founderMock: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ requireFounder: founderMock }));

import { POST } from '../route';
import {
  verifyStudioAdminSession,
  verifyStudioGrantsSession,
  resetConsentReplayGuard,
} from '../../../../../../../mcp-server/src/security/studio-consent';

const SECRET = 'admin-clients-route-test-secret-0123456789';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.STUDIO_CONSENT_SECRET = SECRET;
  process.env.MCP_OAUTH_ISSUER_URL = 'https://mcp.test';
  process.env.NEXTAUTH_URL = 'https://studio.test';
  resetConsentReplayGuard();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    const admin = verifyStudioAdminSession(h['X-Studio-Consent'], SECRET);
    if (!admin) return new Response(JSON.stringify({ error: 'login_required' }), { status: 401 });
    return new Response(JSON.stringify({ client_id: 'hsc_x', owner_user_id: admin }), { status: 201 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STUDIO_CONSENT_SECRET;
  delete process.env.MCP_OAUTH_ISSUER_URL;
  delete process.env.NEXTAUTH_URL;
  founderMock.mockReset();
});

const post = (body: unknown, origin = 'https://studio.test') =>
  new NextRequest('https://studio.test/api/oauth/admin-clients', {
    method: 'POST',
    headers: { host: 'studio.test', origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/oauth/admin-clients', () => {
  it('non-founder gets the founder gate response; mcp-server is never called', async () => {
    founderMock.mockResolvedValue(NextResponse.json({ error: 'Founder access required' }, { status: 403 }));
    const r = await POST(post({ action: 'create', purpose: 'smoke-mcp-auth', scopes: ['tools:read'] }));
    expect(r.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cross-origin is refused before the founder check', async () => {
    const r = await POST(post({ action: 'create' }, 'https://evil.test'));
    expect(r.status).toBe(403);
    expect(founderMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('founder create forwards with a human-admin assertion and no API key', async () => {
    founderMock.mockResolvedValue({ user: { id: 'joseph' } });
    const r = await POST(
      post({ action: 'create', purpose: 'smoke-mcp-auth', scopes: ['tools:read'], apiKey: 'nope' })
    );
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ client_id: 'hsc_x', owner_user_id: 'joseph' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mcp.test/oauth/admin/clients');
    const h = init.headers as Record<string, string>;
    expect(Object.keys(h).map((k) => k.toLowerCase())).not.toEqual(
      expect.arrayContaining(['authorization', 'x-api-key', 'x-mcp-api-key'])
    );
    expect(JSON.parse(init.body as string)).toEqual({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'] });
    // The admin assertion is not a Connected-apps (or any other) session.
    expect(verifyStudioGrantsSession(h['X-Studio-Consent'], SECRET)).toBeNull();
  });

  it('founder rotate forwards to /:id/rotate', async () => {
    founderMock.mockResolvedValue({ user: { id: 'joseph' } });
    const r = await POST(post({ action: 'rotate', client_id: 'hsc_abc' }));
    expect(r.status).toBe(201);
    expect(fetchMock.mock.calls[0][0]).toBe('https://mcp.test/oauth/admin/clients/hsc_abc/rotate');
  });

  it('bad action or client id is 400 without calling upstream', async () => {
    founderMock.mockResolvedValue({ user: { id: 'joseph' } });
    expect((await POST(post({ action: 'nuke' }))).status).toBe(400);
    expect((await POST(post({ action: 'rotate', client_id: '../x' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});