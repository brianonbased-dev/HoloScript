/**
 * Absorb resolves the buyer from X-User-Authorization (the user's GitHub
 * token) next to Studio's service key, and since #297 refuses a purchase with
 * no real user (403). This route used to send only the service key, so every
 * Studio "buy" failed. The signed-in session below is a real NextAuth JWT
 * cookie read by the real getGitHubToken helper.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

const AUTH_SECRET = 'test-auth-secret-for-credits-route';

function purchaseReq(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/absorb/credits', {
    method: 'POST',
    body: JSON.stringify({ packageId: 'starter' }),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function sentHeaders(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { GET, POST } from './route';

describe('/api/absorb/credits route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET returns upstream credits payload when absorb service succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ balance: 4200, tier: 'pro' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(4200);
    expect(body.tier).toBe('pro');
  });

  it('GET falls back to defaults when absorb service is unavailable', async () => {
    const prev = process.env.ABSORB_API_KEY;
    delete process.env.ABSORB_API_KEY;

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(0);
    expect(body.tier).toBe('free');
    expect(body.note).toMatch(/unavailable/i);

    if (prev !== undefined) process.env.ABSORB_API_KEY = prev;
  });

  it('POST forwards the user token the way the pass-through route does', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ checkoutUrl: 'https://pay.example/xyz' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await POST(purchaseReq({ Authorization: 'Bearer ghp_user_token' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl).toContain('pay.example');

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://absorb.test/api/credits/purchase');
    // Service key identifies Studio; the user's token identifies WHOSE credits.
    const sent = sentHeaders(fetchSpy);
    expect(sent['Authorization']).toBe('Bearer absorb-key-test');
    expect(sent['X-User-Authorization']).toBe('Bearer ghp_user_token');
  });

  it('POST returns 503 when absorb service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const res = await POST(purchaseReq({ Authorization: 'Bearer ghp_user_token' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
  });

  it("GET asks absorb for the signed-in user's balance, not the service account's", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ balanceCents: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await GET(
      new NextRequest('http://localhost/api/absorb/credits', {
        headers: { Authorization: 'Bearer ghp_user_token' },
      })
    );

    const sent = sentHeaders(fetchSpy);
    expect(sent['Authorization']).toBe('Bearer absorb-key-test');
    expect(sent['X-User-Authorization']).toBe('Bearer ghp_user_token');
  });

  describe('with a signed-in session and no client header', () => {
    const envSnapshot = { ...process.env };

    beforeEach(() => {
      process.env = { ...envSnapshot };
      process.env.AUTH_SECRET = AUTH_SECRET;
      delete process.env.NEXTAUTH_SECRET;
      delete process.env.NEXTAUTH_URL;
      delete process.env.VERCEL;
    });

    afterEach(() => {
      process.env = { ...envSnapshot };
    });

    it("POST uses the session's GitHub token", async () => {
      const sessionToken = await encode({
        token: { sub: 'user-1', accessToken: 'gho_session_token', provider: 'github' },
        secret: AUTH_SECRET,
      });
      const fetchSpy = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ checkoutUrl: 'https://pay.example/xyz' }), { status: 200 })
        );
      vi.stubGlobal('fetch', fetchSpy);

      const res = await POST(purchaseReq({ cookie: `next-auth.session-token=${sessionToken}` }));
      expect(res.status).toBe(200);
      expect(sentHeaders(fetchSpy)['X-User-Authorization']).toBe('Bearer gho_session_token');
    });

    it('POST refuses in Studio with 401 when no user is signed in, and never calls absorb', async () => {
      // A server-wide GitHub token must never stand in for the buyer.
      process.env.NODE_ENV = 'development';
      process.env.GITHUB_TOKEN = 'ghp_server_token';
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const res = await POST(purchaseReq());
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.message).toMatch(/sign in with github/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it("POST passes absorb's own refusal through instead of calling it unavailable", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Payments not configured',
            message:
              'Credit purchases are unavailable because the payment provider is not configured. No credits were granted.',
          }),
          { status: 503 }
        )
      )
    );

    const res = await POST(purchaseReq({ Authorization: 'Bearer ghp_user_token' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.message).toMatch(/payment provider is not configured/i);
  });
});
