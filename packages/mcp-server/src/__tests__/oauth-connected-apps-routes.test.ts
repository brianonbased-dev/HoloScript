/**
 * Connected apps (CVO done criterion): a signed-in Studio human lists their own
 * agent grants and revokes one; the revoked agent's tokens are then refused.
 * Real HTTP server, real OAuth flow (register -> consent -> code -> token).
 */
import { createHash, randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootRealHttpServer,
  restoreRealHttpServerEnv,
  type RealHttpServer,
} from './real-http-server-harness';
import { signStudioConsent, STUDIO_GRANTS_AUDIENCE } from '../security/studio-consent';
import { TEST_STUDIO_CONSENT_SECRET } from './consented-test-token';

const SECRET = TEST_STUDIO_CONSENT_SECRET;
const REDIRECT = 'https://client.test/callback';
const VERIFIER = 'v'.repeat(64);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

let server: RealHttpServer;

beforeAll(async () => {
  server = await bootRealHttpServer({
    sandboxPrefix: 'mcp-connected-apps-',
    env: { STUDIO_CONSENT_SECRET: SECRET, OAUTH_REGISTER_PER_IP_PER_HOUR: '1000' },
  });
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

/**
 * What Studio's /api/oauth/grants mints per request for the signed-in user. A
 * fresh gid per call keeps two same-second assertions distinct (single-use).
 */
function session(sub: string) {
  return { 'x-studio-consent': signStudioConsent(
      { sub, cid: STUDIO_GRANTS_AUDIENCE, scp: [], gid: `grant_${randomUUID()}` },
      SECRET
    ) };
}

async function connect(sub: string, name: string) {
  const reg = await server.request('POST', '/oauth/register', {
    body: {
      client_name: name,
      redirect_uris: [REDIRECT],
      scope: 'tools:read social',
      token_endpoint_auth_method: 'client_secret_post',
    },
  });
  expect(reg.status, JSON.stringify(reg.body)).toBe(201);
  const clientId = reg.body.client_id as string;
  const clientSecret = reg.body.client_secret as string;
  const mint = () => signStudioConsent({ sub, cid: clientId, scp: ['tools:read', 'social'] }, SECRET);
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope: 'tools:read',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
  });
  const g = await server.request('GET', `/oauth/authorize?${q}`, {
    headers: { accept: 'application/json', 'x-studio-consent': mint() },
  });
  const csrf = (g.body.authorization_request as Record<string, unknown>).csrf_token;
  const a = await server.request('POST', '/oauth/authorize', {
    body: {
      client_id: clientId,
      redirect_uri: REDIRECT,
      scope: 'tools:read',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      decision: 'allow',
      csrf_token: csrf,
      studio_consent: mint(),
    },
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
  return {
    clientId,
    clientSecret,
    access: t.body.access_token as string,
    refresh: t.body.refresh_token as string,
  };
}

type GrantView = {
  id: string;
  client_id: string;
  client_name: string | null;
  client_name_verified: boolean;
  scopes: string[];
  created_at: string;
  last_used_at: string;
};

async function list(sub: string): Promise<GrantView[]> {
  const r = await server.request('GET', '/oauth/grants', { headers: session(sub) });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.grants as GrantView[];
}

describe('GET /oauth/grants', () => {
  it('anonymous (no Studio session) is 401', async () => {
    const r = await server.request('GET', '/oauth/grants');
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('login_required');
  });

  it('an agent bearer token is not a Studio session: 401', async () => {
    const app = await connect('erin', 'bearer-probe');
    const r = await server.request('GET', '/oauth/grants', { token: app.access });
    expect(r.status).toBe(401);
  });

  it('an approval assertion for a client cannot be used here (audience-bound)', async () => {
    const app = await connect('frank', 'aud-probe');
    const wrong = signStudioConsent({ sub: 'frank', cid: app.clientId, scp: [] }, SECRET);
    const r = await server.request('GET', '/oauth/grants', { headers: { 'x-studio-consent': wrong } });
    expect(r.status).toBe(401);
  });

  it("lists only the signed-in user's grants, with the unverified-name marker", async () => {
    const mine = await connect('alice', 'Alice Agent');
    const theirs = await connect('bob', 'Bob Agent');
    const grants = await list('alice');
    const ids = grants.map((g) => g.client_id);
    expect(ids).toContain(mine.clientId);
    expect(ids).not.toContain(theirs.clientId);
    const g = grants.find((x) => x.client_id === mine.clientId)!;
    expect(g.client_name).toBe('Alice Agent');
    expect(g.client_name_verified).toBe(false);
    expect(g.scopes).toContain('tools:read');
    expect(Date.parse(g.created_at)).not.toBeNaN();
    expect(Date.parse(g.last_used_at)).not.toBeNaN();
    expect(g.id).toMatch(/^grant_/);
  });

  it('a session assertion is single-use', async () => {
    const h = session('alice');
    expect((await server.request('GET', '/oauth/grants', { headers: h })).status).toBe(200);
    expect((await server.request('GET', '/oauth/grants', { headers: h })).status).toBe(401);
  });
});

describe('DELETE /oauth/grants/:id', () => {
  it('anonymous is 401', async () => {
    const r = await server.request('DELETE', '/oauth/grants/grant_x');
    expect(r.status).toBe(401);
  });

  it("another user's grant is 404 and stays live", async () => {
    const theirs = await connect('carol', 'Carol Agent');
    const id = (await list('carol')).find((g) => g.client_id === theirs.clientId)!.id;
    const r = await server.request('DELETE', `/oauth/grants/${id}`, { headers: session('mallory') });
    expect(r.status).toBe(404);
    expect((await list('carol')).map((g) => g.id)).toContain(id);
    const ok = await server.request('POST', '/mcp', {
      token: theirs.access,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(ok.status).not.toBe(401);
  });

  it('revoking kills the access token at /mcp and refuses refresh', async () => {
    const app = await connect('dana', 'Dana Agent');
    const before = await server.request('POST', '/mcp', {
      token: app.access,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(before.status).not.toBe(401);

    const id = (await list('dana')).find((g) => g.client_id === app.clientId)!.id;
    const del = await server.request('DELETE', `/oauth/grants/${id}`, { headers: session('dana') });
    expect(del.status).toBe(204);
    expect((await list('dana')).map((g) => g.id)).not.toContain(id);

    const after = await server.request('POST', '/mcp', {
      token: app.access,
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    });
    expect(after.status).toBe(401);

    const refreshed = await server.request('POST', '/oauth/token', {
      body: {
        grant_type: 'refresh_token',
        refresh_token: app.refresh,
        client_id: app.clientId,
        client_secret: app.clientSecret,
      },
    });
    expect(refreshed.status).toBeGreaterThanOrEqual(400);
    expect(refreshed.body.access_token).toBeUndefined();

    // Revoking again is a 404, not a second success.
    const again = await server.request('DELETE', `/oauth/grants/${id}`, { headers: session('dana') });
    expect(again.status).toBe(404);
  });
});