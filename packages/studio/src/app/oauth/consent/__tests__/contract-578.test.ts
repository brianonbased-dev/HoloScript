/**
 * #579 against #578's REAL F2 contract (89a487f0): the GET of /oauth/authorize is
 * simulated with mcp-server's own code, line for line with http-server.ts
 * (verifyStudioConsent peek on the x-studio-consent header -> issueOAuthCsrfToken
 * bound to sub; no header -> login_required, no csrf_token), and the POST is
 * checked with verifyStudioConsent (consuming) + verifyOAuthCsrfToken(userId).
 * #578 is on the branch now, so a missing oauth-csrf.ts FAILS this suite
 * instead of silently skipping it (Trust section E follow-up).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sessionMock, redirectMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import OAuthConsentPage from '../page';
import { POST } from '../../../api/oauth/consent/route';
import * as consent from '../../../../../../mcp-server/src/security/studio-consent';

const csrfMods = import.meta.glob('../../../../../../mcp-server/src/security/oauth-csrf.ts');
const csrfLoader = Object.values(csrfMods)[0];
type CsrfBinding = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  scope: string;
};
const csrf = csrfLoader
  ? ((await csrfLoader()) as {
      issueOAuthCsrfToken: (b: CsrfBinding) => string;
      verifyOAuthCsrfToken: (t: unknown, b: CsrfBinding) => boolean;
    })
  : null;
// oauth-csrf.ts and the verifier's peek option both land with #578.
const verify = consent.verifyStudioConsent as unknown as (
  a: unknown,
  cid: string,
  secret?: string,
  now?: number,
  opts?: { peek?: boolean }
) => { userId: string } | null;

const SECRET = 'z'.repeat(48);
const sp = {
  response_type: 'code',
  client_id: 'hsc_real',
  redirect_uri: 'http://127.0.0.1:9999/cb',
  scope: 'tools:read',
  state: 'S1',
  code_challenge: 'chal_real',
  code_challenge_method: 'S256',
};

/** mcp GET /oauth/authorize (JSON), per http-server.ts @89a487f0 ~2618-2671. */
function mcpGet(url: string, headers: Record<string, string>) {
  const q = new URL(url).searchParams;
  const clientId = q.get('client_id')!;
  const getConsent = verify(
    headers['X-Studio-Consent'] ?? headers['x-studio-consent'],
    clientId,
    undefined,
    undefined,
    { peek: true }
  );
  const csrfToken = getConsent
    ? csrf!.issueOAuthCsrfToken({
        clientId,
        redirectUri: q.get('redirect_uri')!,
        codeChallenge: q.get('code_challenge')!,
        userId: getConsent.userId,
        scope: q.get('scope') || 'tools:read',
      })
    : undefined;
  return new Response(
    JSON.stringify({
      authorization_request: {
        client_id: clientId,
        ...(csrfToken ? { csrf_token: csrfToken } : { login_required: true }),
      },
    }),
    { status: 200 }
  );
}

/** mcp POST /oauth/authorize, per http-server.ts @89a487f0 ~2765-2840. */
function mcpPost(raw: string) {
  const body = JSON.parse(raw);
  const peeked = verify(body.studio_consent, body.client_id, undefined, undefined, { peek: true });
  if (!peeked) return new Response(JSON.stringify({ error: 'login_required' }), { status: 401 });
  const ok = csrf!.verifyOAuthCsrfToken(body.csrf_token, {
    clientId: body.client_id,
    redirectUri: body.redirect_uri,
    codeChallenge: body.code_challenge,
    userId: peeked.userId,
    scope: body.scope || 'tools:read',
  });
  if (!ok) return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 403 });
  if (!consent.verifyStudioConsent(body.studio_consent, body.client_id))
    return new Response(JSON.stringify({ error: 'login_required' }), { status: 401 });
  return new Response(JSON.stringify({ code: `CODE_FOR_${peeked.userId}` }), { status: 200 });
}

it('#578 oauth-csrf.ts is present (this suite must not skip)', () => {
  expect(csrf, 'packages/mcp-server/src/security/oauth-csrf.ts missing').not.toBeNull();
});

describe('#579 x #578 F2 real contract', () => {
  const fetchMock = vi.fn(async (url: string, init: any) =>
    init.method === 'GET' ? mcpGet(url, init.headers) : mcpPost(init.body)
  );
  beforeEach(() => {
    process.env.STUDIO_CONSENT_SECRET = SECRET;
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    process.env.NEXTAUTH_URL = 'http://studio.local';
    consent.resetConsentReplayGuard();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.STUDIO_CONSENT_SECRET;
  });

  async function pageCsrf(userId: string): Promise<string> {
    sessionMock.mockResolvedValue({ user: { id: userId } });
    const tree = JSON.stringify(await OAuthConsentPage({ searchParams: sp }));
    const m = tree.match(/"name":"csrf_token","value":"([^"]+)"/);
    expect(m, 'page rendered a csrf_token from the real GET').toBeTruthy();
    return m![1];
  }
  function approve(csrfToken: string) {
    return POST(
      new NextRequest('http://studio.local/api/oauth/consent', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          host: 'studio.local',
          origin: 'http://studio.local',
        },
        body: new URLSearchParams({ ...sp, csrf_token: csrfToken, decision: 'approve' }).toString(),
      })
    );
  }

  it('without the header the real GET gives login_required and no csrf_token (the old bug)', async () => {
    const res = mcpGet(`https://mcp.test/oauth/authorize?${new URLSearchParams(sp)}`, {});
    const j = await res.json();
    expect(j.authorization_request.csrf_token).toBeUndefined();
    expect(j.authorization_request.login_required).toBe(true);
  });

  it('page GET -> route POST end to end yields a code for the signed-in user', async () => {
    const token = await pageCsrf('user-7');
    const res = await approve(token);
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).searchParams.get('code')).toBe('CODE_FOR_user-7');
  });

  it('assertion lapsed between GET and POST: route re-mints with the same sub, still works', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T18:00:00Z'));
    const token = await pageCsrf('user-7');
    vi.setSystemTime(new Date('2026-10-15T18:05:00Z')); // > 120 s assertion TTL, < 600 s CSRF TTL
    const res = await approve(token);
    expect(new URL(res.headers.get('location')!).searchParams.get('code')).toBe('CODE_FOR_user-7');
  });

  it('a csrf_token minted for another user is refused (F2 sub binding)', async () => {
    const token = await pageCsrf('user-A');
    sessionMock.mockResolvedValue({ user: { id: 'user-B' } });
    const res = await approve(token);
    expect(res.status).toBe(403);
  });
});
