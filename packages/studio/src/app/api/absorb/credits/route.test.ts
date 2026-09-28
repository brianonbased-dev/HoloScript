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
    // A redirect would carry X-User-Authorization (the user's GitHub token) to
    // wherever it pointed, so absorb's answer is taken as it is or not at all.
    expect((fetchSpy.mock.calls[0][1] as RequestInit).redirect).toBe('error');
  });

  describe('where Stripe sends the buyer afterwards', () => {
    const envSnapshot = { ...process.env };
    const checkoutOk = () =>
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ checkoutUrl: 'https://pay.example/xyz' }), { status: 200 })
        );
    const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
      (fetchMock.mock.calls[0][1] as RequestInit).body as string;

    beforeEach(() => {
      process.env = { ...envSnapshot };
      delete process.env.NEXT_PUBLIC_STUDIO_URL;
      delete process.env.NEXT_PUBLIC_URL;
      process.env.NEXTAUTH_URL = 'https://holoscript.studio';
    });
    afterEach(() => {
      process.env = { ...envSnapshot };
    });

    it("POST tells absorb to return the buyer to this Studio's Settings, Credits tab", async () => {
      // Without these, absorb fell back to localhost:3005 (PUBLIC_URL unset) and
      // its own /api/credits/success sits behind auth: a paid buyer hit a dead page.
      const fetchSpy = checkoutOk();
      vi.stubGlobal('fetch', fetchSpy);

      const res = await POST(purchaseReq({ Authorization: 'Bearer ghp_user_token' }));
      expect(res.status).toBe(200);

      const sent = JSON.parse(sentBody(fetchSpy));
      expect(sent.packageId).toBe('starter');
      expect(sent.successUrl).toBe(
        'https://holoscript.studio/settings?tab=credits&purchase=success&session_id={CHECKOUT_SESSION_ID}'
      );
      expect(sent.cancelUrl).toBe(
        'https://holoscript.studio/settings?tab=credits&purchase=cancelled'
      );
    });

    it('POST overwrites return URLs the client sent, so checkout cannot be aimed elsewhere', async () => {
      const fetchSpy = checkoutOk();
      vi.stubGlobal('fetch', fetchSpy);

      await POST(
        new NextRequest('http://localhost/api/absorb/credits', {
          method: 'POST',
          body: JSON.stringify({
            packageId: 'starter',
            successUrl: 'https://evil.example/phish',
            cancelUrl: 'https://evil.example/phish',
          }),
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ghp_user_token' },
        })
      );

      const sent = JSON.parse(sentBody(fetchSpy));
      expect(sent.successUrl.startsWith('https://holoscript.studio/settings?')).toBe(true);
      expect(sent.cancelUrl.startsWith('https://holoscript.studio/settings?')).toBe(true);
      expect(JSON.stringify(sent)).not.toContain('evil.example');
    });

    it('POST passes a body that is not a JSON object through untouched, for absorb to report', async () => {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'Validation error' }), { status: 400 })
        );
      vi.stubGlobal('fetch', fetchSpy);

      const res = await POST(
        new NextRequest('http://localhost/api/absorb/credits', {
          method: 'POST',
          body: 'not json',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ghp_user_token' },
        })
      );
      expect(res.status).toBe(400);
      expect(sentBody(fetchSpy)).toBe('not json');
    });
  });

  describe('Studio Pro actions', () => {
    const envSnapshot = { ...process.env };
    const actionReq = (body: unknown) =>
      new NextRequest('http://localhost/api/absorb/credits', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ghp_user_token' },
      });
    const answering = (payload: unknown, status = 200) =>
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status }));
    const sentTo = (fetchMock: ReturnType<typeof vi.fn>) => ({
      url: fetchMock.mock.calls[0][0] as string,
      body: JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as unknown,
    });

    beforeEach(() => {
      process.env = { ...envSnapshot };
      delete process.env.NEXT_PUBLIC_STUDIO_URL;
      delete process.env.NEXT_PUBLIC_URL;
      process.env.NEXTAUTH_URL = 'https://holoscript.studio';
    });
    afterEach(() => {
      process.env = { ...envSnapshot };
    });

    it('subscribe asks absorb for a Studio Pro checkout that returns to Settings', async () => {
      const fetchSpy = answering({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_1' });
      vi.stubGlobal('fetch', fetchSpy);

      const res = await POST(
        actionReq({
          action: 'subscribe',
          successUrl: 'https://evil.example/phish',
          packageId: 'bulk',
        })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_1');

      // The Studio writes the whole body: nothing the page sent reaches absorb.
      expect(sentTo(fetchSpy)).toEqual({
        url: 'https://absorb.test/api/credits/subscribe',
        body: {
          successUrl:
            'https://holoscript.studio/settings?tab=credits&purchase=subscribed&session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: 'https://holoscript.studio/settings?tab=credits&purchase=cancelled',
        },
      });
      expect(sentHeaders(fetchSpy)['X-User-Authorization']).toBe('Bearer ghp_user_token');
    });

    it("portal asks absorb for Stripe's billing page, which returns to the Credits tab", async () => {
      const fetchSpy = answering({ url: 'https://billing.stripe.com/p/session/1' });
      vi.stubGlobal('fetch', fetchSpy);

      const res = await POST(
        actionReq({ action: 'portal', returnUrl: 'https://evil.example/phish' })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).url).toBe('https://billing.stripe.com/p/session/1');
      expect(sentTo(fetchSpy)).toEqual({
        url: 'https://absorb.test/api/credits/portal',
        body: { returnUrl: 'https://holoscript.studio/settings?tab=credits' },
      });
    });

    it('any other action is a credit purchase, exactly as before', async () => {
      const fetchSpy = answering({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_2' });
      vi.stubGlobal('fetch', fetchSpy);

      await POST(actionReq({ action: 'refund', packageId: 'starter' }));
      const { url, body } = sentTo(fetchSpy);
      expect(url).toBe('https://absorb.test/api/credits/purchase');
      expect((body as { successUrl: string }).successUrl).toContain('purchase=success');
    });

    it("passes absorb's refusal through, e.g. an account that already has Studio Pro", async () => {
      vi.stubGlobal(
        'fetch',
        answering(
          {
            error: 'Already subscribed',
            message: 'You already have Studio Pro. You can manage or cancel it from Settings.',
          },
          409
        )
      );

      const res = await POST(actionReq({ action: 'subscribe' }));
      expect(res.status).toBe(409);
      expect((await res.json()).message).toMatch(/already have Studio Pro/);
    });
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
