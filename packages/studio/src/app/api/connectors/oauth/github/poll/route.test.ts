import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { GITHUB_DEVICE_TOKEN_COOKIE } from '@/lib/github-device-session';
import { CAPABILITY_TOKEN_COOKIE } from '@/lib/capability-session';
import { POST } from './route';

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
    expect(JSON.stringify(body)).not.toContain(body.capability_token.token_secret ?? '___no_secret');
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
});
