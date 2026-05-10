import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

describe('/api/connectors/oauth/github/start route', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...envSnapshot };
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_OAUTH_CLIENT_ID;
  });

  it('starts the device flow with the standard GitHub client id env var', async () => {
    process.env.GITHUB_CLIENT_ID = 'standard-client-id';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: 'device-code',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/connectors/oauth/github/start', {
      method: 'POST',
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user_code).toBe('ABCD-1234');
    expect(body).not.toHaveProperty('access_token');

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      client_id: string;
      scope: string;
    };
    expect(requestBody.client_id).toBe('standard-client-id');
    expect(requestBody.scope).toContain('repo');
    expect(requestBody.scope).toContain('read:org');
  });

  it('returns a clear configuration error when no client id is available', async () => {
    const req = new NextRequest('http://localhost/api/connectors/oauth/github/start', {
      method: 'POST',
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/GITHUB_CLIENT_ID/i);
    expect(body.error).toMatch(/GITHUB_OAUTH_CLIENT_ID/i);
  });
});
