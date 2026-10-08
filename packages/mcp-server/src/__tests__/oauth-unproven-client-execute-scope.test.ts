/**
 * A client that signs itself up without proving who it is must not get the codebase and browser reach
 * that `tools:execute` gives a trusted client (board task zkdg) — driven through the REAL http-server.ts.
 *
 * Why this exists: SCOPE_BRIDGE expands the public scope `tools:execute` to tools:write + tools:codebase +
 * tools:browser. Every OAuth client is self-registered, so opening remote registration
 * (OAUTH_ALLOW_REMOTE_REGISTRATION=1) let anyone on the internet mint a token that absorbs and queries the
 * server's own repositories and drives a headless browser on it. Our own agent bridges register the same way
 * but prove an agent key (x-mcp-api-key), and loopback registrants on a closed door are this host already, so
 * the line is drawn at registration: a client that proved nothing gets `tools:execute` issued as the
 * ordinary `tools:write` only, and the token response says so.
 *
 * Gate 2 (scope) is the arbiter, read from the audit log the server writes for every tool call, so these
 * tests do not depend on how a refused or a failing tool happens to word its answer.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bootRealHttpServer,
  restoreRealHttpServerEnv,
  type RealHttpServer,
} from './real-http-server-harness';
import { getAuditLogger } from '../security/audit-log';

const FLAG = 'OAUTH_ALLOW_REMOTE_REGISTRATION';
const SCOPE = 'tools:read tools:execute';
const CODEBASE_TOOL = 'holo_graph_status'; // needs tools:codebase
const WRITE_TOOL = 'suggest_traits'; // needs tools:write

let server: RealHttpServer;

beforeAll(async () => {
  server = await bootRealHttpServer({ sandboxPrefix: 'mcp-unproven-execute-' });
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

afterEach(() => {
  delete process.env[FLAG];
});

/** Sign up over loopback with no agent key, then take a client-credentials token for SCOPE. */
async function signUpWithoutProof(): Promise<{ token: string; granted: string[] }> {
  const registered = await server.request('POST', '/oauth/register', {
    body: {
      client_name: 'unproven-execute-probe',
      redirect_uris: ['https://client.test/callback'],
      scope: SCOPE,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['client_credentials'],
    },
  });
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  const issued = await server.request('POST', '/oauth/token', {
    body: {
      grant_type: 'client_credentials',
      client_id: registered.body.client_id,
      client_secret: registered.body.client_secret,
      scope: SCOPE,
    },
  });
  expect(issued.status, JSON.stringify(issued.body)).toBe(200);
  return {
    token: issued.body.access_token as string,
    granted: String(issued.body.scope ?? '')
      .split(' ')
      .filter(Boolean),
  };
}

/** Call a tool over POST /mcp and return Gate 2's verdict for that call, from the audit log. */
async function scopeGateVerdict(tool: string, token: string): Promise<boolean | undefined> {
  const invocations = () =>
    getAuditLogger()
      .query({ toolName: tool, limit: 100_000 })
      .entries.filter((e) => e.security?.gate2Passed !== undefined);
  const seen = new Set(invocations().map((e) => e.id));
  await server.request('POST', '/mcp', {
    token,
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: {} },
    },
  });
  const fresh = invocations().filter((e) => !seen.has(e.id));
  expect(fresh, `exactly one audited ${tool} call`).toHaveLength(1);
  return fresh[0].security?.gate2Passed;
}

describe('tools:execute for a client that proved nothing at sign-up (zkdg)', () => {
  it('remote registration open, no proof: the token is issued tools:write, not tools:execute, and says so', async () => {
    process.env[FLAG] = '1';
    const { granted } = await signUpWithoutProof();
    expect(granted).toContain('tools:write');
    expect(granted).not.toContain('tools:execute');
  });

  it('remote registration open, no proof: a codebase tool is refused at the scope gate', async () => {
    process.env[FLAG] = '1';
    const { token } = await signUpWithoutProof();
    expect(await scopeGateVerdict(CODEBASE_TOOL, token)).toBe(false);
  });

  it('remote registration open, no proof: an ordinary build tool still passes the scope gate', async () => {
    process.env[FLAG] = '1';
    const { token } = await signUpWithoutProof();
    expect(await scopeGateVerdict(WRITE_TOOL, token)).toBe(true);
  });

  it('door closed, loopback registrant (this host): tools:execute keeps the codebase reach, unchanged', async () => {
    const { token, granted } = await signUpWithoutProof();
    expect(granted).toContain('tools:execute');
    expect(await scopeGateVerdict(CODEBASE_TOOL, token)).toBe(true);
  });
});

describe('the mark is made at registration, not read from the door later (zkdg, claude12)', () => {
  it('registered while the door was open, token taken after it closed: still tools:write only', async () => {
    process.env[FLAG] = '1';
    const registered = await server.request('POST', '/oauth/register', {
      body: {
        client_name: 'open-then-closed-probe',
        redirect_uris: ['https://client.test/callback'],
        scope: SCOPE,
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['client_credentials'],
      },
    });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);

    delete process.env[FLAG]; // the operator closes the door again

    const issued = await server.request('POST', '/oauth/token', {
      body: {
        grant_type: 'client_credentials',
        client_id: registered.body.client_id,
        client_secret: registered.body.client_secret,
        scope: SCOPE,
      },
    });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const granted = String(issued.body.scope ?? '').split(' ');
    expect(granted).not.toContain('tools:execute');
    expect(await scopeGateVerdict(CODEBASE_TOOL, issued.body.access_token as string)).toBe(false);
  });
});
