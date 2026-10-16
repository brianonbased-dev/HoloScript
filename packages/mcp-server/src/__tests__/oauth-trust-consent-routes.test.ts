/**
 * Trust & Consent part A, route seats against the REAL http-server:
 *   R1 dynamic registration grants no client_credentials by default;
 *   R2 POST /oauth/authorize needs a signed-in session AND the request's CSRF
 *      token, and binds the user to the code and the tokens;
 *   R3 a user:private token reads only its own user's earnings over /mcp;
 *   R4 DELETE /oauth/clients/:id (owner or admin) kills existing tokens:
 *      introspection inactive, token endpoint invalid_client, audit entry, 204.
 */
import { createHash } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuth2Provider } from '../auth/oauth2-provider';
import {
  bootRealHttpServer,
  REAL_SERVER_ADMIN_KEY,
  restoreRealHttpServerEnv,
  type RealHttpServer,
} from './real-http-server-harness';
import { signStudioConsent } from '../security/studio-consent';
import { TEST_STUDIO_CONSENT_SECRET } from './consented-test-token';
import { getAuditLogger } from '../security/audit-log';

// Must match the secret the shared harness signs with: server.tokenWithScope()
// now goes through the consent flow (consented-test-token.ts), so a different
// STUDIO_CONSENT_SECRET here would make its assertions fail to verify.
const CONSENT_SECRET = TEST_STUDIO_CONSENT_SECRET;
const REDIRECT = 'https://client.test/callback';
const VERIFIER = 'w'.repeat(64);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

let server: RealHttpServer;

beforeAll(async () => {
  server = await bootRealHttpServer({
    sandboxPrefix: 'mcp-trust-consent-',
    env: { STUDIO_CONSENT_SECRET: CONSENT_SECRET, OAUTH_REGISTER_PER_IP_PER_HOUR: '1000' },
  });
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

async function register(body: Record<string, unknown> = {}) {
  const r = await server.request('POST', '/oauth/register', {
    body: {
      client_name: 'trust-consent',
      redirect_uris: [REDIRECT],
      scope: 'social tools:read user:private',
      token_endpoint_auth_method: 'client_secret_post',
      ...body,
    },
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { clientId: r.body.client_id as string, clientSecret: r.body.client_secret as string, body: r.body };
}

async function csrfFor(
  clientId: string,
  scope = 'user:private',
  consent: string = consentFor(clientId)
): Promise<string> {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
  });
  const r = await server.request('GET', `/oauth/authorize?${q}`, {
    headers: { 'x-studio-consent': consent },
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const token = (r.body.authorization_request as Record<string, unknown>).csrf_token as string;
  expect(token).toMatch(/^c1\./);
  return token;
}

function authorizeBody(clientId: string, extra: Record<string, unknown> = {}, scope = 'user:private') {
  return {
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    decision: 'allow',
    ...extra,
  };
}

function consentFor(clientId: string, sub = 'alice', scp = ['user:private', 'tools:read', 'social']) {
  return signStudioConsent({ sub, cid: clientId, scp }, CONSENT_SECRET);
}

async function userToken(clientId: string, clientSecret: string, sub = 'alice') {
  const assertion = consentFor(clientId, sub);
  const csrf = await csrfFor(clientId, 'user:private', assertion);
  const a = await server.request('POST', '/oauth/authorize', {
    body: authorizeBody(clientId, { csrf_token: csrf, studio_consent: assertion }),
  });
  expect(a.status, JSON.stringify(a.body)).toBe(200);
  const t = await server.request('POST', '/oauth/token', {
    body: {
      grant_type: 'authorization_code',
      code: a.body.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    },
  });
  expect(t.status, JSON.stringify(t.body)).toBe(200);
  return t.body as { access_token: string; refresh_token: string; scope: string };
}

describe('R1 no client_credentials by default for dynamic clients', () => {
  // Remote registration open: every peer counts as remote (a proxy makes them loopback).
  beforeEach(() => {
    process.env.OAUTH_ALLOW_REMOTE_REGISTRATION = '1';
  });
  afterEach(() => {
    delete process.env.OAUTH_ALLOW_REMOTE_REGISTRATION;
  });

  it('negative control: loopback-only server, loopback registrant keeps the old default', async () => {
    delete process.env.OAUTH_ALLOW_REMOTE_REGISTRATION;
    const { body } = await register({ scope: 'social' });
    expect(body.grant_types).toContain('client_credentials');
  });

  it('registration without grant_types does not list client_credentials', async () => {
    const { body } = await register();
    expect(body.grant_types).toEqual(['authorization_code', 'refresh_token']);
  });

  it('and the token endpoint refuses client_credentials for that client', async () => {
    const { clientId, clientSecret } = await register({ scope: 'social' });
    const t = await server.request('POST', '/oauth/token', {
      body: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'social' },
    });
    expect(t.status).toBe(400);
    expect(t.body.error).toBe('unauthorized_client');
  });

  it('client_credentials is refused for user:private even when the client asked for cc', async () => {
    const { clientId, clientSecret } = await register({ grant_types: ['client_credentials'] });
    const t = await server.request('POST', '/oauth/token', {
      body: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'user:private' },
    });
    expect(t.status).toBe(400);
    expect(t.body.error).toBe('invalid_scope');
  });

  it('negative control: an explicit cc client still gets social', async () => {
    const { clientId, clientSecret } = await register({ scope: 'social', grant_types: ['client_credentials'] });
    const t = await server.request('POST', '/oauth/token', {
      body: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'social' },
    });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    expect(t.body.scope).toBe('social');
  });
});

describe('R2 /oauth/authorize needs a signed-in session and CSRF, and binds the user', () => {
  it('refused without a session (valid CSRF, no studio_consent) -> 401 login_required', async () => {
    const { clientId } = await register();
    const csrf = await csrfFor(clientId);
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrf }),
    });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('login_required');
    expect(r.body.code).toBeUndefined();
  });

  it('refused without a session even for social-only scope', async () => {
    const { clientId } = await register();
    const csrf = await csrfFor(clientId, 'social');
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrf }, 'social'),
    });
    expect(r.status).toBe(401);
  });

  it('refused without CSRF even with a valid session -> 403', async () => {
    const { clientId } = await register();
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { studio_consent: consentFor(clientId) }),
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBeUndefined();
  });

  it("refused with another request's CSRF token", async () => {
    const a = await register();
    const b = await register();
    const csrfA = await csrfFor(a.clientId);
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(b.clientId, { csrf_token: csrfA, studio_consent: consentFor(b.clientId) }),
    });
    expect(r.status).toBe(403);
  });

  it('a forged session (wrong secret) is refused', async () => {
    const { clientId } = await register();
    const csrf = await csrfFor(clientId);
    const forged = signStudioConsent({ sub: 'alice', cid: clientId, scp: ['user:private'] }, 'z'.repeat(48));
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrf, studio_consent: forged }),
    });
    expect(r.status).toBe(401);
  });

  it('session + CSRF: code and tokens carry the user (introspection user_id)', async () => {
    const { clientId, clientSecret } = await register();
    const t = await userToken(clientId, clientSecret, 'alice');
    expect(t.scope).toContain('user:private');
    const i = await server.request('POST', '/oauth/introspect', { body: { token: t.access_token } });
    expect(i.body.active).toBe(true);
    expect(i.body.user_id).toBe('alice');
    expect(i.body.grant_id).toBeTruthy();
    const r = await server.request('POST', '/oauth/token', {
      body: { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientId, client_secret: clientSecret },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const i2 = await server.request('POST', '/oauth/introspect', { body: { token: r.body.access_token } });
    expect(i2.body.user_id).toBe('alice');
  });

  it('F2 a CSRF token minted for alice is refused with bob\'s session', async () => {
    const { clientId } = await register();
    const csrfAlice = await csrfFor(clientId, 'user:private', consentFor(clientId, 'alice'));
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrfAlice, studio_consent: consentFor(clientId, 'bob') }),
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBeUndefined();
  });

  it('F2 GET without a session issues no CSRF token', async () => {
    const { clientId } = await register();
    const q = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, scope: 'user:private',
      code_challenge: CHALLENGE, code_challenge_method: 'S256',
    });
    const r = await server.request('GET', `/oauth/authorize?${q}`);
    expect((r.body.authorization_request as Record<string, unknown>).csrf_token).toBeUndefined();
  });

  it('F3 studio_consent in the GET query string is ignored (no CSRF token)', async () => {
    const { clientId } = await register();
    const q = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, scope: 'user:private',
      code_challenge: CHALLENGE, code_challenge_method: 'S256', studio_consent: consentFor(clientId),
    });
    const r = await server.request('GET', `/oauth/authorize?${q}`);
    expect(r.status).toBe(200);
    expect((r.body.authorization_request as Record<string, unknown>).csrf_token).toBeUndefined();
  });

  it('F3/a a browser GET is sent to Studio /oauth/consent with the same params, minus studio_consent', async () => {
    const { clientId } = await register();
    const q = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, scope: 'user:private',
      code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 's1', studio_consent: 'v1.leak.x',
    });
    const r = await server.request('GET', `/oauth/authorize?${q}`, { headers: { accept: 'text/html' } });
    expect(r.status).toBe(302);
    const loc = new URL(String(r.headers?.location));
    expect(loc.pathname).toBe('/oauth/consent');
    expect(loc.searchParams.get('client_id')).toBe(clientId);
    expect(loc.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(loc.searchParams.get('state')).toBe('s1');
    expect(loc.searchParams.has('studio_consent')).toBe(false);
  });

  it('F3 studio_consent in the POST query string is not accepted', async () => {
    const { clientId } = await register();
    const assertion = consentFor(clientId);
    const csrf = await csrfFor(clientId, 'user:private', assertion);
    const r = await server.request(
      'POST',
      `/oauth/authorize?studio_consent=${encodeURIComponent(assertion)}`,
      { body: authorizeBody(clientId, { csrf_token: csrf }) }
    );
    expect(r.status).toBe(401);
  });

  it('F3 negative control: studio_consent in the x-studio-consent header works', async () => {
    const { clientId } = await register();
    const assertion = consentFor(clientId);
    const csrf = await csrfFor(clientId, 'user:private', assertion);
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrf }),
      headers: { 'x-studio-consent': assertion },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.code).toBeTruthy();
  });

  it('negative control: deny needs no session', async () => {
    const { clientId } = await register();
    const r = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { decision: 'deny' }),
    });
    expect(r.body.error).toBe('access_denied');
  });
});

describe("R3 a user:private token can't read another creator's earnings", () => {
  async function callTool(token: string, args: Record<string, unknown>) {
    const r = await server.request('POST', '/mcp', {
      token,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_creator_earnings', arguments: args } },
    });
    return JSON.stringify(r.body);
  }

  it('naming another creator is refused; omitting it reads the caller', async () => {
    const { clientId, clientSecret } = await register();
    const { access_token } = await userToken(clientId, clientSecret, 'alice');
    const other = await callTool(access_token, { creatorId: 'victim' });
    expect(other).toMatch(/names someone else/);
    expect(other).not.toMatch(/\\"creatorId\\":\\"victim\\"/);
    const own = await callTool(access_token, {});
    // Our binding lets the caller's own read through (the existing ForkSandboxGate
    // capability-manifest check may still stop it later; that gate is unchanged).
    expect(own).not.toMatch(/names someone else|needs a user:private token/);
  });

  it('a tools:read token without user:private is refused at the scope gate', async () => {
    const t = await server.tokenWithScope('social');
    const out = await callTool(t, { creatorId: 'victim' });
    expect(out).not.toMatch(/totalGross/);
  });
});

describe('C1 absorb_check_credits reads only the token user', () => {
  async function credits(token: string, args: Record<string, unknown>) {
    const r = await server.request('POST', '/mcp', {
      token,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'absorb_check_credits', arguments: args } },
    });
    return JSON.stringify(r.body);
  }
  it('a caller-supplied apiKey is refused', async () => {
    const { clientId, clientSecret } = await register();
    const { access_token } = await userToken(clientId, clientSecret);
    expect(await credits(access_token, { apiKey: 'someone-elses-key' })).toMatch(/names someone else/);
  });
  it('no ledger: refused, never the absorb server key', async () => {
    const { clientId, clientSecret } = await register();
    const { access_token } = await userToken(clientId, clientSecret);
    const out = await credits(access_token, {});
    expect(out).toMatch(/credit ledger is not available/);
    expect(out).not.toMatch(/ABSORB_API_KEY|No API key provided/);
  });
});

describe('R4 DELETE /oauth/clients/:id', () => {
  it('C4 durable revoke failure answers 503 (not 204); a retry then succeeds', async () => {
    const { clientId } = await register();
    const spy = vi
      .spyOn(OAuth2Provider.prototype, 'revokeClient')
      .mockRejectedValueOnce(new Error('db down'));
    const d = await server.request('DELETE', `/oauth/clients/${clientId}`, { token: REAL_SERVER_ADMIN_KEY });
    expect(d.status).toBe(503);
    const failed = getAuditLogger()
      .query({ limit: 100_000 })
      .entries.filter((e) => e.agent?.clientId === clientId && /durable=false/.test(String(e.metadata?.reason)));
    expect(failed.length).toBe(1);
    spy.mockRestore();
    const again = await server.request('DELETE', `/oauth/clients/${clientId}`, { token: REAL_SERVER_ADMIN_KEY });
    expect(again.status).toBe(204);
  });

  it('admin delete kills existing tokens: introspection inactive, token endpoint invalid_client, audit, 204', async () => {
    const { clientId, clientSecret } = await register();
    const t = await userToken(clientId, clientSecret);
    const before = await server.request('POST', '/oauth/introspect', { body: { token: t.access_token } });
    expect(before.body.active).toBe(true);

    const d = await server.request('DELETE', `/oauth/clients/${clientId}`, { token: REAL_SERVER_ADMIN_KEY });
    expect(d.status).toBe(204);

    const after = await server.request('POST', '/oauth/introspect', { body: { token: t.access_token } });
    expect(after.body.active).toBe(false);
    const refresh = await server.request('POST', '/oauth/token', {
      body: { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientId, client_secret: clientSecret },
    });
    expect(refresh.status).toBe(400);
    expect(refresh.body.error).toBe('invalid_grant'); // chain is gone
    const cc = await server.request('POST', '/oauth/token', {
      body: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'social' },
    });
    expect(cc.body.error).toBe('invalid_client');
    const mcp = await server.request('POST', '/mcp', {
      token: t.access_token,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(mcp.status).toBe(401);

    const audit = getAuditLogger()
      .query({ limit: 100_000 })
      .entries.filter((e) => e.event === 'client_revoked' && e.agent?.clientId === clientId);
    expect(audit.length).toBe(1);

    const again = await server.request('DELETE', `/oauth/clients/${clientId}`, { token: REAL_SERVER_ADMIN_KEY });
    expect(again.status).toBe(204);
  });

  it('owner (its own token) may delete itself', async () => {
    const { clientId, clientSecret } = await register();
    const t = await userToken(clientId, clientSecret);
    const d = await server.request('DELETE', `/oauth/clients/${clientId}`, { token: t.access_token });
    expect(d.status).toBe(204);
  });

  it('another client may not (403); nobody may not (401); target keeps working', async () => {
    const victim = await register();
    const vt = await userToken(victim.clientId, victim.clientSecret);
    const attacker = await register();
    const at = await userToken(attacker.clientId, attacker.clientSecret, 'mallory');
    expect((await server.request('DELETE', `/oauth/clients/${victim.clientId}`, { token: at.access_token })).status).toBe(403);
    expect((await server.request('DELETE', `/oauth/clients/${victim.clientId}`)).status).toBe(401);
    const still = await server.request('POST', '/oauth/introspect', { body: { token: vt.access_token } });
    expect(still.body.active).toBe(true);
  });

  it('unknown client id with admin: still 204', async () => {
    const d = await server.request('DELETE', '/oauth/clients/hsc_doesnotexist', { token: REAL_SERVER_ADMIN_KEY });
    expect(d.status).toBe(204);
  });
});

describe('N2 the csrf_token is bound to the requested scope', () => {
  it('a POST that widens the scope shown on the GET is refused (403); the same scope succeeds', async () => {
    const { clientId } = await register();
    const assertion = consentFor(clientId);
    const csrf = await csrfFor(clientId, 'social', assertion);
    const widened = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrf, studio_consent: assertion }, 'social user:private'),
    });
    expect(widened.status).toBe(403);
    const same = await server.request('POST', '/oauth/authorize', {
      body: authorizeBody(clientId, { csrf_token: csrf, studio_consent: consentFor(clientId) }, 'social'),
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
  });
});