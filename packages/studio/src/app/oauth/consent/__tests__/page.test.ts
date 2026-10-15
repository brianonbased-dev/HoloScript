import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { sessionMock, redirectMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
}));
vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import OAuthConsentPage from '../page';

const sp = {
  client_id: 'hsc_test',
  redirect_uri: 'http://127.0.0.1:7777/cb',
  code_challenge: 'abc',
  code_challenge_method: 'S256',
  scope: 'tools:read',
  state: 's',
};

describe('/oauth/consent page', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    process.env.STUDIO_CONSENT_SECRET = 'y'.repeat(40);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    delete process.env.STUDIO_CONSENT_SECRET;
    vi.unstubAllGlobals();
  });

  it('signed-out: redirects to sign-in with a callback back to this request', async () => {
    sessionMock.mockResolvedValue(null);
    await expect(
      OAuthConsentPage({ searchParams: { ...sp, studio_consent: 'x' } })
    ).rejects.toThrow('NEXT_REDIRECT');
    const url = redirectMock.mock.calls[0][0] as string;
    expect(url.startsWith('/auth/signin?callbackUrl=')).toBe(true);
    const cb = decodeURIComponent(url.split('callbackUrl=')[1]);
    expect(cb).toContain('client_id=hsc_test');
    expect(cb).not.toContain('studio_consent');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signed-in: GETs /oauth/authorize as JSON and puts csrf_token (not an assertion or secret) in the form', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'u1' } });
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          authorization_request: {
            client_id: 'hsc_test',
            client_name: 'Test',
            csrf_token: 'CSRF1',
          },
        }),
        { status: 200 }
      )
    );
    const el = await OAuthConsentPage({ searchParams: sp });
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://mcp.test/oauth/authorize');
    for (const [k, v] of Object.entries(sp)) expect(u.searchParams.get(k)).toBe(v);
    expect(u.searchParams.has('studio_consent')).toBe(false);
    expect(init.headers.Accept).toBe('application/json');
    const tree = JSON.stringify(el);
    expect(tree).toContain('CSRF1');
    expect(tree).toContain('/api/oauth/consent');
    expect(tree).not.toContain('y'.repeat(40));
    expect(tree).not.toContain('studio_consent');
  });
});
