import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

const { requireAuthMock } = vi.hoisted(() => ({ requireAuthMock: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

import { GET } from './route';
import { AUTHENTICATED_USER_HEADER } from '../../../_lib/earningsIdentity';

const USER_A = '11111111-1111-1111-1111-111111111111';

function authAs(userId: string) {
  requireAuthMock.mockResolvedValue({ user: { id: userId } });
}

describe('/api/absorb/knowledge/earnings route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    requireAuthMock.mockReset();
    authAs(USER_A);
  });

  it('SECURITY: returns 401 when unauthenticated', async () => {
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xVICTIM');
    const res = await GET(req);

    expect(res.status).toBe(401);
    // Must never reach any backend when unauthenticated.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SECURITY: ignores client-supplied wallet param; forwards authed user id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ user_id: USER_A, total_revenue_cents: 1234 }),
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    // Caller tries to read someone else's wallet — must be ignored.
    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xVICTIM');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_revenue_cents).toBe(1234);

    // Outbound MCP call must carry the authed user id and NOT the victim wallet.
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get(AUTHENTICATED_USER_HEADER)).toBe(USER_A);
    expect(init.body).toContain(USER_A);
    expect(init.body).not.toContain('0xVICTIM');
  });

  it('returns text wrapper when MCP tool returns non-JSON text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              result: { content: [{ type: 'text', text: 'plain-text-response' }] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
    );

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('plain-text-response');
  });

  it('falls back to absorb REST endpoint (with authed user header) when MCP path fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('mcp down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user_id: USER_A, total_revenue_cents: 99 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xVICTIM');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_revenue_cents).toBe(99);

    // REST fallback URL carries no client wallet param; identity is in the header.
    const restCall = fetchMock.mock.calls[1];
    expect(String(restCall[0])).toBe('https://absorb.test/api/knowledge/earnings');
    expect(new Headers(restCall[1].headers).get(AUTHENTICATED_USER_HEADER)).toBe(USER_A);
  });

  it('returns default earnings payload scoped to the authed user when both paths fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('all down')));

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xVICTIM');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBe(USER_A);
    expect(body.total_revenue_cents).toBe(0);
    expect(body.total_revenue_usd).toBe('$0.00');
    expect(body.note).toMatch(/unavailable/i);
  });
});
