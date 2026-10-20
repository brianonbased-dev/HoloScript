/**
 * The edge proxy treats a signed but non-allowlisted session as signed out
 * (lib/inviteAllowlist.ts): `/api/**` gets 401 and pages redirect to
 * /invite-only. Either way the session cookies are cleared. /invite-only itself
 * needs no session and never redirects.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';

import { proxy } from '../proxy';
import { resetInviteAllowlistLogThrottleForTests } from '../lib/inviteAllowlist';

const SECRET = 'test-secret-for-invite-only';
const COOKIE = '__Secure-next-auth.session-token';

async function cookieFor(claims: Record<string, unknown>): Promise<string> {
  return `${COOKIE}=${await encode({ token: claims, secret: SECRET })}`;
}

const FOUNDER = { sub: 'f', provider: 'github', providerAccountId: '1001', githubUsername: 'fl' };
const STRANGER = { sub: 's', provider: 'github', providerAccountId: '9009', githubUsername: 'x' };

function get(path: string, cookie?: string) {
  return proxy(
    new NextRequest(`https://studio.test${path}`, { headers: cookie ? { cookie } : {} })
  );
}

function clearsSessionCookie(response: Response): boolean {
  const setCookie = response.headers.get('set-cookie') ?? '';
  return setCookie.includes(`${COOKIE}=;`) && /Max-Age=0/i.test(setCookie);
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetInviteAllowlistLogThrottleForTests();
  vi.stubEnv('NEXTAUTH_SECRET', SECRET);
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', '1001');
  vi.stubEnv('STUDIO_FOUNDER_GITHUB_USERS', '');
  vi.stubEnv('ADMIN_GITHUB_USERNAMES', 'admin-login');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('edge proxy: invite-only sessions', () => {
  it('admits the founder session on a session-tier API path', async () => {
    const response = await get('/api/projects', await cookieFor(FOUNDER));
    expect(response.status).not.toBe(401);
  });

  it('refuses a signed but non-allowlisted session on the API, and clears its cookie', async () => {
    const response = await get('/api/workspace/files', await cookieFor(STRANGER));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ signInRequired: true, inviteOnly: true });
    expect(clearsSessionCookie(response)).toBe(true);
  });

  it('redirects a non-allowlisted signed-in visitor on any page to /invite-only', async () => {
    const response = await get('/workspace', await cookieFor(STRANGER));
    expect([302, 307]).toContain(response.status);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/invite-only');
    expect(clearsSessionCookie(response)).toBe(true);
  });

  it('does not redirect the founder, or a visitor with no session', async () => {
    const founder = await get('/workspace', await cookieFor(FOUNDER));
    expect(founder.headers.get('location')).toBeNull();
    const anonymous = await get('/workspace');
    expect(anonymous.headers.get('location')).toBeNull();
  });

  it('lets /invite-only through with no session, and with a refused one (no loop)', async () => {
    const anonymous = await get('/invite-only');
    expect(anonymous.headers.get('location')).toBeNull();
    expect(anonymous.status).toBe(200);
    const refused = await get('/invite-only', await cookieFor(STRANGER));
    expect(refused.headers.get('location')).toBeNull();
    expect(refused.status).toBe(200);
  });

  it('FAIL CLOSED: with every list empty, even the founder session is refused', async () => {
    vi.stubEnv('STUDIO_FOUNDER_GITHUB_IDS', '');
    vi.stubEnv('ADMIN_GITHUB_USERNAMES', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await get('/api/projects', await cookieFor(FOUNDER));
    expect(response.status).toBe(401);
  });
});
