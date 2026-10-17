/**
 * POST /oauth/admin/clients (card tools-codebase-scope, Option 1): an admin
 * provisions a confidential client_credentials client that is NOT
 * selfRegistered, with an explicit, validated scope list. Real HTTP server.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootRealHttpServer,
  REAL_SERVER_ADMIN_KEY,
  restoreRealHttpServerEnv,
  type RealHttpServer,
} from './real-http-server-harness';

let server: RealHttpServer;

beforeAll(async () => {
  server = await bootRealHttpServer({
    sandboxPrefix: 'mcp-admin-clients-',
    env: { OAUTH_REGISTER_PER_IP_PER_HOUR: '1000' },
  });
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

const provision = (body: Record<string, unknown>, token?: string) =>
  server.request('POST', '/oauth/admin/clients', { body, ...(token ? { token } : {}) });

const ccToken = (clientId: string, clientSecret: string, scope?: string) =>
  server.request('POST', '/oauth/token', {
    body: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      ...(scope ? { scope } : {}),
    },
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

describe('POST /oauth/admin/clients', () => {
  it('anonymous is 401', async () => {
    const r = await provision({ purpose: 'smoke-mcp-auth', scopes: ['tools:read'] });
    expect(r.status).toBe(401);
  });

  it('a non-admin token is 403 (a self-registered client cannot provision)', async () => {
    const { token } = await selfRegisteredToken('social');
    expect(token.status, JSON.stringify(token.body)).toBe(200);
    const r = await provision(
      { purpose: 'smoke-mcp-auth', scopes: ['tools:read'] },
      token.body.access_token as string
    );
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('insufficient_scope');
  });

  it('admin creates a non-self-registered client that gets cc tokens for exactly its scopes', async () => {
    const r = await provision(
      { purpose: 'smoke-mcp-auth', client_name: 'smoke-mcp-auth', scopes: ['tools:read', 'tasks:read'] },
      REAL_SERVER_ADMIN_KEY
    );
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.self_registered).toBe(false);
    expect(String(r.body.client_secret).length).toBeGreaterThanOrEqual(32);
    const id = r.body.client_id as string;
    const secret = r.body.client_secret as string;

    // client_credentials with no scope param issues nothing (existing behavior), so ask explicitly.
    const all = await ccToken(id, secret, 'tools:read tasks:read');
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(String(all.body.scope).split(' ').sort()).toEqual(['tasks:read', 'tools:read']);

    const one = await ccToken(id, secret, 'tools:read');
    expect(one.status).toBe(200);
    expect(one.body.scope).toBe('tools:read');

    const more = await ccToken(id, secret, 'tools:read tools:execute');
    expect(more.status).toBe(400);

    const wrong = await ccToken(id, 'not-the-secret', 'tools:read');
    expect(wrong.status).not.toBe(200);

    // Cleanup path: the existing admin DELETE kills it.
    const d = await server.request('DELETE', `/oauth/clients/${id}`, { token: REAL_SERVER_ADMIN_KEY });
    expect(d.status).toBe(204);
    const after = await ccToken(id, secret, 'tools:read');
    expect(after.status).not.toBe(200);
  });

  it('tools:codebase is refused unless purpose is holoshell or allow_codebase is set', async () => {
    const refused = await provision({ purpose: 'aibrittney', scopes: ['tools:codebase'] }, REAL_SERVER_ADMIN_KEY);
    expect(refused.status).toBe(400);
    expect(String(refused.body.error_description)).toMatch(/tools:codebase/);

    const hs = await provision({ purpose: 'holoshell', scopes: ['tools:codebase'] }, REAL_SERVER_ADMIN_KEY);
    expect(hs.status, JSON.stringify(hs.body)).toBe(201);
    const t = await ccToken(hs.body.client_id as string, hs.body.client_secret as string, 'tools:codebase');
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    expect(t.body.scope).toBe('tools:codebase');

    const flagged = await provision(
      { purpose: 'aibrittney', scopes: ['tools:read', 'tools:codebase'], allow_codebase: true },
      REAL_SERVER_ADMIN_KEY
    );
    expect(flagged.status).toBe(201);
  });

  it('refuses unknown, admin and user-bound scopes, and an empty list', async () => {
    for (const scopes of [['tools:nope'], ['admin:*'], ['tools:admin'], ['user:private'], []]) {
      const r = await provision({ purpose: 'smoke-mcp-auth', scopes }, REAL_SERVER_ADMIN_KEY);
      expect(r.status, JSON.stringify(scopes)).toBe(400);
    }
    const noPurpose = await provision({ scopes: ['tools:read'] }, REAL_SERVER_ADMIN_KEY);
    expect(noPurpose.status).toBe(400);
  });

  it('self-registered behavior is unchanged: cc on tools:read is consent_required', async () => {
    const { token } = await selfRegisteredToken('tools:read');
    expect(token.status).toBe(400);
    expect(token.body.error).toBe('consent_required');
  });
});