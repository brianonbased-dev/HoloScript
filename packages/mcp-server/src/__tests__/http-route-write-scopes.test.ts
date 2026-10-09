/**
 * A valid token is not permission. Five HTTP routes checked only that a token was active, so a
 * `tools:read` key (the kind handed to an outside agent as "read only") could spend another
 * account's credits, post publicly under the server's Moltbook account, publish protocol records,
 * store metadata, and mint editions. Driven through the REAL http-server.ts over real HTTP.
 *
 * Each route: a read token gets 403 insufficient_scope; a token with the route's scope gets past
 * the gate (whatever the route then answers, it is not 401/403); a bad token still gets 401.
 */

import { createHash } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootRealHttpServer,
  REAL_SERVER_ADMIN_KEY,
  restoreRealHttpServerEnv,
  type RealHttpServer,
  type Reply,
} from './real-http-server-harness';

let server: RealHttpServer;
let readToken = '';
let writeToken = '';

beforeAll(async () => {
  server = await bootRealHttpServer({ sandboxPrefix: 'mcp-route-scopes-' });
  readToken = await server.tokenWithScope('tools:read');
  // Dynamic clients ask for the public name tools:execute; oauth21 expandScopes makes it tools:write.
  writeToken = await server.tokenWithScope('tools:execute');
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

function expectRefusedForScope(reply: Reply, required: string[]): void {
  expect(reply.status, JSON.stringify(reply.body)).toBe(403);
  expect(reply.body.error).toBe('insufficient_scope');
  expect(reply.body.required).toEqual(required);
  expect(String(reply.headers?.['www-authenticate'])).toContain('error="insufficient_scope"');
}

function expectPastTheGate(reply: Reply): void {
  expect(reply.status, JSON.stringify(reply.body)).not.toBe(401);
  expect(reply.status, JSON.stringify(reply.body)).not.toBe(403);
}

const DEDUCT_BODY = { userId: 'someone-else', operation: 'studio_generate' };
const CROSSPOST_BODY = {
  taskId: 'scope-test',
  title: 'scope test',
  description: 'should never reach Moltbook',
  status: 'completed',
};

describe('POST /api/credits/deduct needs an operator scope', () => {
  it('a read token cannot spend', async () => {
    const reply = await server.request('POST', '/api/credits/deduct', {
      token: readToken,
      body: DEDUCT_BODY,
    });
    expectRefusedForScope(reply, ['tools:admin']);
  });

  it('a write token cannot spend either: the body names whose credits go', async () => {
    const reply = await server.request('POST', '/api/credits/deduct', {
      token: writeToken,
      body: DEDUCT_BODY,
    });
    expectRefusedForScope(reply, ['tools:admin']);
  });

  it('the server key (admin:*) passes the gate', async () => {
    const reply = await server.request('POST', '/api/credits/deduct', {
      token: REAL_SERVER_ADMIN_KEY,
      body: DEDUCT_BODY,
    });
    expectPastTheGate(reply);
  });

  it('an invalid token is still 401, not 403', async () => {
    const reply = await server.request('POST', '/api/credits/deduct', {
      token: 'not-a-real-token',
      body: DEDUCT_BODY,
    });
    expect(reply.status).toBe(401);
  });
});

describe('POST /api/moltbook/crosspost needs an operator scope', () => {
  it('a read token cannot post publicly', async () => {
    const reply = await server.request('POST', '/api/moltbook/crosspost', {
      token: readToken,
      body: CROSSPOST_BODY,
    });
    expectRefusedForScope(reply, ['tools:admin']);
  });

  it('a write token cannot either: every GitHub login holds tools:write', async () => {
    const reply = await server.request('POST', '/api/moltbook/crosspost', {
      token: writeToken,
      body: CROSSPOST_BODY,
    });
    expectRefusedForScope(reply, ['tools:admin']);
  });

  it('the server key (admin:*) passes the gate (then stops: no Moltbook key in the sandbox)', async () => {
    const reply = await server.request('POST', '/api/moltbook/crosspost', {
      token: REAL_SERVER_ADMIN_KEY,
      body: CROSSPOST_BODY,
    });
    expectPastTheGate(reply);
  });

  it('the server-key callers still pass if pointed here: x-mcp-api-key, with or without a Moltbook Bearer', async () => {
    // ai-ecosystem hooks/team-connect.mjs sends exactly this pair; holomesh_moltbook_crosspost
    // sends the x-mcp-api-key alone. Both default to mcp-orchestrator's own crosspost route, and
    // reach this one only when HOLOMESH_MOLTBOOK_CROSSPOST_URL or MCP_ORCHESTRATOR_URL points at
    // mcp-server.
    const reply = await server.request('POST', '/api/moltbook/crosspost', {
      token: 'moltbook_not_a_holoscript_credential',
      headers: { 'x-mcp-api-key': REAL_SERVER_ADMIN_KEY },
      body: CROSSPOST_BODY,
    });
    expectPastTheGate(reply);
    const keyOnly = await server.request('POST', '/api/moltbook/crosspost', {
      headers: { 'x-mcp-api-key': REAL_SERVER_ADMIN_KEY },
      body: CROSSPOST_BODY,
    });
    expectPastTheGate(keyOnly);
  });
});

describe('protocol publish, metadata and collect need tools:write', () => {
  // A writer who is not an operator claims a hash by sending the content that hashes to it.
  const code = `object ScopeTest_${Date.now()} { @glowing }`;
  const hash = createHash('sha256').update(code).digest('hex');

  it('a read token cannot publish, store metadata, or collect', async () => {
    expectRefusedForScope(
      await server.request('POST', '/api/protocol', {
        token: readToken,
        body: { contentHash: `${hash}-read` },
      }),
      ['tools:write']
    );
    expectRefusedForScope(
      await server.request('POST', '/api/protocol/metadata', {
        token: readToken,
        body: { provenance: { hash: `${hash}-read` } },
      }),
      ['tools:write']
    );
    expectRefusedForScope(
      await server.request('POST', `/api/collect/${hash}-read`, {
        token: readToken,
        body: { quantity: 1 },
      }),
      ['tools:write']
    );
  });

  it('a write token publishes, stores metadata, and collects', async () => {
    const published = await server.request('POST', '/api/protocol', {
      token: writeToken,
      body: { contentHash: hash, code },
    });
    expect(published.status, JSON.stringify(published.body)).toBe(201);

    const meta = await server.request('POST', '/api/protocol/metadata', {
      token: writeToken,
      body: { provenance: { hash } },
    });
    expectPastTheGate(meta);

    const collected = await server.request('POST', `/api/collect/${hash}`, {
      token: writeToken,
      body: { quantity: 1 },
    });
    expect(collected.status, JSON.stringify(collected.body)).toBe(200);
    expect(collected.body.editions).toEqual([1]);
  });

  it('a read token leaves the record untouched', async () => {
    const refused = await server.request('POST', `/api/collect/${hash}`, {
      token: readToken,
      body: { quantity: 5 },
    });
    expect(refused.status).toBe(403);
    const next = await server.request('POST', `/api/collect/${hash}`, {
      token: REAL_SERVER_ADMIN_KEY,
      body: { quantity: 1 },
    });
    expect(next.body.editions).toEqual([2]);
  });
});
