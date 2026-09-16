import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: mocks.getToken,
}));

import { getGitHubDeviceToken, GITHUB_DEVICE_TOKEN_COOKIE } from '@/lib/github-device-session';
import { CAPABILITY_TOKEN_COOKIE } from '@/lib/capability-session';
import { POST } from './route';

/** The Studio user who is linking GitHub in these cases. */
const SESSION_USER = 'user-linking-github';

describe('/api/connectors/oauth/github/poll route', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...envSnapshot };
    process.env.AUTH_SECRET = 'test-auth-secret-for-github-device-flow';
    process.env.GITHUB_CLIENT_ID = 'standard-client-id';
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
    delete process.env.GITHUB_TOKEN;
    // Signed in, because linking a GitHub credential to nobody is exactly what
    // this route no longer does. The signed-out case is its own test below.
    mocks.getToken.mockImplementation(async () => ({ sub: SESSION_USER }));
  });

  it('stores the authorized token in an encrypted HttpOnly cookie without returning it', async () => {
    const rawToken = 'gho_device_flow_secret_token_1234567890';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: rawToken,
            scope: 'repo read:user',
            token_type: 'bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: 'octocat', email: 'octocat@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/connectors/oauth/github/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: 'device-code' }),
    });
    const res = await POST(req);
    const body = await res.json();
    const setCookie = res.headers.get('set-cookie') ?? '';

    expect(res.status).toBe(200);
    expect(body.status).toBe('success');
    expect(body.connected).toBe(true);
    expect(body.config.username).toBe('octocat');
    expect(body.config.token).toBe('********');
    expect(JSON.stringify(body)).not.toContain(rawToken);
    expect(setCookie).toContain(GITHUB_DEVICE_TOKEN_COOKIE);
    expect(setCookie).toContain(CAPABILITY_TOKEN_COOKIE);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).not.toContain(rawToken);
    expect(process.env.GITHUB_TOKEN).toBeUndefined();

    // S-6: capability token metadata is returned, never the plaintext secret
    expect(body.capability_token).toMatchObject({
      handle: 'claude1',
      surface: 'claude',
      trust: 'full',
    });
    expect(body.capability_token.token_id).toMatch(/^captok_[a-f0-9]{24}$/);
    expect(body.capability_token.receipt_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(body.capability_token.capabilities).toContain('mesh:read');
    expect(JSON.stringify(body)).not.toContain(
      body.capability_token.token_secret ?? '___no_secret'
    );
  });

  it('keeps polling pending device codes without setting a cookie', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'authorization_pending' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/connectors/oauth/github/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: 'device-code' }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('pending');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  /**
   * Whose credential this becomes.
   *
   * The cookie this route sets lives 30 days at path '/' and survives sign-out,
   * so before it was bound, the next person to sign in on the same browser
   * inherited it — and provisioning reads that credential to decide who the
   * caller IS.
   */
  describe('the stored credential belongs to the session that linked it', () => {
    function pollRequest(): NextRequest {
      return new NextRequest('https://studio.test/api/connectors/oauth/github/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: 'device-code' }),
      });
    }

    function githubAuthorizes(rawToken: string) {
      return vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: rawToken, scope: 'repo', token_type: 'bearer' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ login: 'octocat', email: 'octocat@example.test' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
    }

    it('refuses to link a credential to nobody, and never spends the device code', async () => {
      mocks.getToken.mockImplementation(async () => null);
      const exchange = vi.fn();
      vi.stubGlobal('fetch', exchange);

      const res = await POST(pollRequest());
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.signInRequired).toBe(true);
      expect(body.error).toMatch(/Sign in to HoloScript Studio/);
      // Refused before the device code was exchanged, so a live code is not
      // burned by an anonymous poll.
      expect(exchange).not.toHaveBeenCalled();
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('binds the cookie to that session, and to no other', async () => {
      const rawToken = 'gho_device_flow_bound_token_1234567890';
      vi.stubGlobal('fetch', githubAuthorizes(rawToken));

      const res = await POST(pollRequest());
      expect(res.status).toBe(200);

      const cookieValue = res.cookies.get(GITHUB_DEVICE_TOKEN_COOKIE)?.value ?? '';
      expect(cookieValue).not.toBe('');
      expect(cookieValue).not.toContain(rawToken);

      const carrying = new NextRequest('https://studio.test/api/github/repos', {
        headers: { cookie: `${GITHUB_DEVICE_TOKEN_COOKIE}=${cookieValue}` },
      });

      await expect(getGitHubDeviceToken(carrying, { userId: SESSION_USER })).resolves.toBe(
        rawToken
      );
      await expect(
        getGitHubDeviceToken(carrying, { userId: 'somebody-else-on-this-browser' })
      ).resolves.toBeNull();
      // And it is not readable simply because the browser holds it.
      await expect(
        getGitHubDeviceToken(carrying, { userId: null, allowUnbound: true })
      ).resolves.toBeNull();
    });
  });
});
