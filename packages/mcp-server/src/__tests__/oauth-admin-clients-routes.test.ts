/**
 * POST /oauth/admin/clients and /:id/rotate (card tools-codebase-scope Option 1;
 * Trust review of #611 B1-B3, Mapping N2/N3). Only a signed-in HUMAN admin
 * (single-use Studio founder assertion, audience studio:admin-clients); the
 * legacy key, dev identities, bearer tokens and ?apiKey= are refused.
 * Real HTTP server.
 */
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootRealHttpServer,
  REAL_SERVER_ADMIN_KEY,
  restoreRealHttpServerEnv,
  type RealHttpServer,
} from './real-http-server-harness';
import {
  signStudioConsent,
  STUDIO_ADMIN_CLIENTS_AUDIENCE,
  STUDIO_FOUNDER_MARK,
  STUDIO_GRANTS_AUDIENCE,
} from '../security/studio-consent';
import { TEST_STUDIO_CONSENT_SECRET } from './consented-test-token';

const SECRET = TEST_STUDIO_CONSENT_SECRET;
const DAY_S = 86_400;
let server: RealHttpServer;

beforeAll(async () => {
  server = await bootRealHttpServer({
    sandboxPrefix: 'mcp-admin-clients-',
    env: { STUDIO_CONSENT_SECRET: SECRET, OAUTH_REGISTER_PER_IP_PER_HOUR: '1000' },
  });
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

/** What Studio mints after requireFounder. */
function founder(sub = 'joseph', opts: { cid?: string; scp?: string[] } = {}) {
  return signStudioConsent(
    {
      sub,
      cid: opts.cid ?? STUDIO_ADMIN_CLIENTS_AUDIENCE,
      scp: opts.scp ?? [STUDIO_FOUNDER_MARK],
      gid: `grant_${randomUUID()}`,
    },
    SECRET
  );
}

const provision = (
  body: Record<string, unknown>,
  o: { assertion?: string | null; headers?: Record<string, string>; path?: string; token?: string } = {}
) => {
  const assertion = o.assertion === undefined ? founder() : o.assertion;
  return server.request('POST', o.path ?? '/oauth/admin/clients', {
    body,
    headers: { ...(assertion ? { 'x-studio-consent': assertion } : {}), ...(o.headers ?? {}) },
    ...(o.token ? { token: o.token } : {}),
  });
};

const ccToken = (clientId: string, clientSecret: string, scope: string) =>
  server.request('POST', '/oauth/token', {
    body: { grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope },
  });

async function selfRegisteredToken(scope: string) {
  const reg = await server.request('POST', '/oauth/register', {
    body: {
      client_name: 'self-reg-cc',
      redirect_uris: ['https://client.test/cb'],
      scope,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['client_credentials'],
    },
  });
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  return {
    reg,
    token: await ccToken(reg.body.client_id as string, reg.body.client_secret as string, scope),
  };
}

describe('who may provision (Trust B1)', () => {
  it('anonymous is 401', async () => {
    const r = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'] }, { assertion: null });
    expect(r.status).toBe(401);
  });

  it('the legacy/admin API key is refused as header, Bearer and ?apiKey=, even beside a founder assertion', async () => {
    const body = { purpose: 'smoke-mcp-auth', scopes: ['tools:read'] };
    expect((await provision(body, { assertion: null, headers: { 'x-mcp-api-key': REAL_SERVER_ADMIN_KEY } })).status).toBe(401);
    expect((await provision(body, { assertion: null, headers: { 'x-api-key': REAL_SERVER_ADMIN_KEY } })).status).toBe(401);
    expect((await provision(body, { assertion: null, token: REAL_SERVER_ADMIN_KEY })).status).toBe(401);
    expect((await provision(body, { headers: { 'x-mcp-api-key': REAL_SERVER_ADMIN_KEY } })).status).toBe(401);
    expect((await provision(body, { token: REAL_SERVER_ADMIN_KEY })).status).toBe(401);
    const q = await provision(body, { path: `/oauth/admin/clients?apiKey=${REAL_SERVER_ADMIN_KEY}` });
    expect(q.status).toBe(400);
    expect(String(q.body.error_description)).toMatch(/URL/);
  });

  it('a non-founder assertion, a Connected-apps assertion and a replayed assertion are refused', async () => {
    const body = { purpose: 'smoke-mcp-auth', scopes: ['tools:read'] };
    expect((await provision(body, { assertion: founder('mallory', { scp: [] }) })).status).toBe(401);
    expect((await provision(body, { assertion: founder('joseph', { cid: STUDIO_GRANTS_AUDIENCE }) })).status).toBe(401);
    const once = founder();
    expect((await provision(body, { assertion: once })).status).toBe(201);
    expect((await provision(body, { assertion: once })).status).toBe(401);
  });

  it('a non-admin OAuth token is refused', async () => {
    const { token } = await selfRegisteredToken('social');
    expect(token.status, JSON.stringify(token.body)).toBe(200);
    const r = await provision(
      { purpose: 'smoke-mcp-auth', scopes: ['tools:read'] },
      { assertion: null, token: token.body.access_token as string }
    );
    expect(r.status).toBe(401);
  });
});

describe('the provisioned client', () => {
  it('records the human owner and an expiry <= 90 days, and gets cc tokens for exactly its scopes (B2/B3)', async () => {
    const before = Math.floor(Date.now() / 1000);
    const r = await provision(
      { purpose: 'smoke-mcp-auth', client_name: 'smoke-mcp-auth', scopes: ['tools:read', 'tasks:read'] },
      { assertion: founder('joseph') }
    );
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.self_registered).toBe(false);
    expect(r.body.owner_user_id).toBe('joseph');
    const exp = r.body.client_secret_expires_at as number;
    expect(exp).toBeGreaterThan(before + 89 * DAY_S);
    expect(exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 90 * DAY_S);
    const id = r.body.client_id as string;
    const secret = r.body.client_secret as string;

    const all = await ccToken(id, secret, 'tools:read tasks:read');
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(String(all.body.scope).split(' ').sort()).toEqual(['tasks:read', 'tools:read']);
    expect((await ccToken(id, secret, 'tools:read tools:execute')).status).toBe(400);
    expect((await ccToken(id, 'not-the-secret', 'tools:read')).status).not.toBe(200);

    const d = await server.request('DELETE', `/oauth/clients/${id}`, { token: REAL_SERVER_ADMIN_KEY });
    expect(d.status).toBe(204);
    expect((await ccToken(id, secret, 'tools:read')).status).not.toBe(200);
  });

  it('expires_in_days is capped at 90', async () => {
    const r = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'], expires_in_days: 91 });
    expect(r.status).toBe(400);
    const ok = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'], expires_in_days: 30 });
    expect(ok.status).toBe(201);
    expect(ok.body.client_secret_expires_at as number).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 30 * DAY_S);
  });

  it('B4/N2: no redirect URIs, no authorization_code, and /oauth/authorize refuses it', async () => {
    expect((await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'], redirect_uris: ['https://evil.test/cb'] })).status).toBe(400);
    expect((await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'], grant_types: ['authorization_code'] })).status).toBe(400);
    const r = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'] });
    expect(r.status).toBe(201);
    expect(r.body.redirect_uris).toEqual([]);
    expect(r.body.grant_types).toEqual(['client_credentials']);
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: r.body.client_id as string,
      redirect_uri: 'https://evil.test/cb',
      scope: 'tools:read',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
    });
    for (const accept of ['application/json', 'text/html']) {
      const a = await server.request('GET', `/oauth/authorize?${q}`, { headers: { accept } });
      expect(a.status, accept).toBe(400);
      expect(a.body.error).toBe('unauthorized_client');
    }
  });

  it('tools:codebase only for purpose holoshell or allow_codebase', async () => {
    const refused = await provision({ purpose: 'aibrittney', scopes: ['tools:codebase'] });
    expect(refused.status).toBe(400);
    expect(String(refused.body.error_description)).toMatch(/tools:codebase/);
    const hs = await provision({ purpose: 'holoshell', scopes: ['tools:codebase'] });
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);
    const t = await ccToken(hs.body.client_id as string, hs.body.client_secret as string, 'tools:codebase');
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    expect(t.body.scope).toBe('tools:codebase');
    expect((await provision({ purpose: 'aibrittney', scopes: ['tools:read', 'tools:codebase'], allow_codebase: true })).status).toBe(201);
  });

  it('N3: tools:browser needs allow_browser (no purpose is enough)', async () => {
    for (const purpose of ['holoshell', 'aibrittney']) {
      const refused = await provision({ purpose, scopes: ['tools:browser'] });
      expect(refused.status, purpose).toBe(400);
      expect(String(refused.body.error_description)).toMatch(/tools:browser/);
    }
    const ok = await provision({ purpose: 'aibrittney', scopes: ['tools:browser'], allow_browser: true });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const t = await ccToken(ok.body.client_id as string, ok.body.client_secret as string, 'tools:browser');
    expect(t.status, JSON.stringify(t.body)).toBe(200);
  });

  it('refuses unknown, admin and user-bound scopes, and an empty list', async () => {
    for (const scopes of [['tools:nope'], ['admin:*'], ['tools:admin'], ['user:private'], []]) {
      expect((await provision({ purpose: 'smoke-mcp-auth', scopes })).status, JSON.stringify(scopes)).toBe(400);
    }
    expect((await provision({ scopes: ['tools:read'] })).status).toBe(400);
  });
});

describe('rotate (B3)', () => {
  it('a human admin rotates: new secret works, old one still works in the overlap, owner kept', async () => {
    const r = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'] }, { assertion: founder('joseph') });
    const id = r.body.client_id as string;
    const oldSecret = r.body.client_secret as string;
    const rot = await provision({}, { path: `/oauth/admin/clients/${id}/rotate`, assertion: founder('brian') });
    expect(rot.status, JSON.stringify(rot.body)).toBe(200);
    expect(rot.body.client_secret).not.toBe(oldSecret);
    expect(rot.body.owner_user_id).toBe('joseph');
    expect(rot.body.previous_secret_valid_until as number).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 15 * 60);
    expect((await ccToken(id, rot.body.client_secret as string, 'tools:read')).status).toBe(200);
    expect((await ccToken(id, oldSecret, 'tools:read')).status).toBe(200);
  });

  it('rotate refuses keys and non-provisioned clients', async () => {
    const r = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'] });
    const id = r.body.client_id as string;
    expect((await provision({}, { path: `/oauth/admin/clients/${id}/rotate`, assertion: null, token: REAL_SERVER_ADMIN_KEY })).status).toBe(401);
    const { reg } = await selfRegisteredToken('social');
    expect((await provision({}, { path: `/oauth/admin/clients/${reg.body.client_id}/rotate` })).status).toBe(404);
  });
});

describe('self-registered behavior is unchanged', () => {
  it('cc on tools:read is consent_required', async () => {
    const { token } = await selfRegisteredToken('tools:read');
    expect(token.status).toBe(400);
    expect(token.body.error).toBe('consent_required');
  });
});