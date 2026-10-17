import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClient, defaultMcpConfig } from '../mcp-client.js';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FetchCall {
  url: string;
  init: RequestInit;
}

/**
 * Build a scripted fetch stub.
 * Each entry in `responses` is consumed in order.
 * If `responses` runs out the stub throws to make the test fail loudly.
 */
function makeFetch(responses: Array<{ status: number; body: unknown }>): {
  fetchFn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  let idx = 0;
  const fetchFn = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const entry = responses[idx++];
    if (!entry) throw new Error(`fetch stub ran out of responses (call ${idx})`);
    calls.push({ url: String(url), init: init ?? {} });
    const body = typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body);
    return new Response(body, {
      status: entry.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

const REGISTER_RESPONSE = { client_id: 'hsc_testclient', client_secret: 'secret_xyz' };
const TOKEN_RESPONSE = {
  access_token: 'hs_bearer_token_abc',
  token_type: 'Bearer',
  expires_in: 3600,
  refresh_token: 'hs_refresh_def',
  scope: 'tools:read tools:execute tasks:read tasks:write',
};

// â”€â”€ defaultMcpConfig â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('defaultMcpConfig', () => {
  it('sets the default OAuth endpoint to mcp.holoscript.net', () => {
    const cfg = defaultMcpConfig({ apiKey: 'key', endpoint: 'http://orch' });
    expect(cfg.oauthEndpoint).toBe('https://mcp.holoscript.net');
  });

  it('honours the oauthEndpoint override', () => {
    const cfg = defaultMcpConfig({ apiKey: 'key', oauthEndpoint: 'http://local' });
    expect(cfg.oauthEndpoint).toBe('http://local');
  });
});

// â”€â”€ happy path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('McpClient â€” OAuth 2.1 client_credentials flow', () => {
  it('registers a client, fetches a bearer token, then calls the tool endpoint', async () => {
    const { fetchFn, calls } = makeFetch([
      { status: 200, body: REGISTER_RESPONSE }, // POST /oauth/register
      { status: 200, body: TOKEN_RESPONSE }, // POST /oauth/token
      { status: 200, body: { success: true } }, // POST /tools/call
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'raw-api-key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    const result = await client.callTool({ server: 's', tool: 't', args: {} });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    // Registration (dev fallback) sends no shared key and no Bearer.
    const registerCall = calls[0];
    expect(registerCall.url).toBe('https://oauth.example.com/oauth/register');
    const registerHeaders = registerCall.init.headers as Record<string, string>;
    // No shared key on registration either (Trust review of #611).
    expect(registerHeaders['x-mcp-api-key']).toBeUndefined();
    expect(registerHeaders['Authorization']).toBeUndefined();

    // Token call must have the right grant_type.
    const tokenCall = calls[1];
    expect(tokenCall.url).toBe('https://oauth.example.com/oauth/token');
    const tokenBody = JSON.parse(tokenCall.init.body as string);
    expect(tokenBody.grant_type).toBe('client_credentials');
    expect(tokenBody.client_id).toBe('hsc_testclient');

    // Tool call must use Authorization: Bearer, NOT x-mcp-api-key.
    const toolCall = calls[2];
    expect(toolCall.url).toBe('https://orch.example.com/tools/call');
    const toolHeaders = toolCall.init.headers as Record<string, string>;
    expect(toolHeaders['Authorization']).toBe('Bearer hs_bearer_token_abc');
    expect(toolHeaders['x-mcp-api-key']).toBeUndefined();
  });

  it('reuses the cached token on subsequent calls without re-registering', async () => {
    const { fetchFn, calls } = makeFetch([
      { status: 200, body: REGISTER_RESPONSE }, // register (once)
      { status: 200, body: TOKEN_RESPONSE }, // token (once)
      { status: 200, body: { r: 1 } }, // tool call 1
      { status: 200, body: { r: 2 } }, // tool call 2
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    await client.callTool({ server: 's', tool: 't', args: {} });
    await client.callTool({ server: 's', tool: 't', args: {} });

    // Only 4 fetches total: register + token + 2x tool call (no duplicate register/token).
    expect(calls).toHaveLength(4);
  });

  it('retries with a fresh token on 401 without re-registering the client', async () => {
    const freshTokenResponse = { ...TOKEN_RESPONSE, access_token: 'hs_new_token' };
    const { fetchFn, calls } = makeFetch([
      { status: 200, body: REGISTER_RESPONSE }, // register (only once)
      { status: 200, body: TOKEN_RESPONSE }, // token
      { status: 401, body: { error: 'invalid_token' } }, // tool call â†’ 401
      // Retry path: token cache cleared, but _oauthClient is preserved â€”
      // re-issue using the existing client credentials (no re-registration).
      { status: 200, body: freshTokenResponse },
      { status: 200, body: { ok: true } }, // tool call retry
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    const result = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(true);

    // Only 5 calls: register, token, 401-tool, fresh-token, retry-tool (no second register).
    expect(calls).toHaveLength(5);

    // The retry tool call must carry the NEW bearer token.
    const retryToolCall = calls[calls.length - 1];
    const retryHeaders = retryToolCall.init.headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer hs_new_token');
  });

  it('returns an error (not throws) when the tool endpoint returns an HTTP error', async () => {
    const { fetchFn } = makeFetch([
      { status: 200, body: REGISTER_RESPONSE },
      { status: 200, body: TOKEN_RESPONSE },
      { status: 500, body: { error: 'internal' } },
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    const result = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toMatch(/HTTP 500/);
  });

  it('needs no HOLOSCRIPT_API_KEY: no apiKey, stored client, Bearer only, no key header anywhere', async () => {
    const saved = { ...process.env };
    try {
      process.env.HOLOSCRIPT_API_KEY = 'shared-key-must-not-be-sent';
      process.env.MCP_API_KEY = 'shared-key-must-not-be-sent';
      const { fetchFn, calls } = makeFetch([
        { status: 200, body: TOKEN_RESPONSE },
        { status: 200, body: { success: true } },
      ]);
      const cfg = defaultMcpConfig({
        endpoint: 'https://orch.example.com',
        oauthEndpoint: 'https://oauth.example.com',
        clientId: 'hsc_stored',
        clientSecret: 'stored_secret',
        fetchImpl: fetchFn,
      });
      expect(cfg.apiKey).toBeUndefined();
      const result = await new McpClient(cfg).callTool({ server: 's', tool: 't', args: {} });
      expect(result.ok).toBe(true);
      for (const c of calls) {
        const h = (c.init.headers ?? {}) as Record<string, string>;
        expect(h['x-mcp-api-key']).toBeUndefined();
        expect(JSON.stringify(c.init.body ?? '')).not.toContain('shared-key-must-not-be-sent');
      }
      expect((calls[1].init.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer hs_bearer_token_abc'
      );
    } finally {
      process.env = saved;
    }
  });

  it('returns an error when oauth/register fails', async () => {
    const { fetchFn } = makeFetch([
      { status: 401, body: { error: 'unauthorized' } }, // register fails
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'bad-key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    const result = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/oauth\/register failed/);
  });

  it('returns an error when oauth/token fails', async () => {
    const { fetchFn } = makeFetch([
      { status: 200, body: REGISTER_RESPONSE },
      { status: 400, body: { error: 'invalid_client' } }, // token fails
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    const result = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/oauth\/token failed/);
  });

  it('skips re-registration when a pre-injected test token is valid', async () => {
    const { fetchFn, calls } = makeFetch([
      { status: 200, body: { success: true } }, // only the tool call
    ]);

    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'key',
      timeoutMs: 5000,
      fetchImpl: fetchFn,
    });

    client._setTokenForTest(
      { accessToken: 'pre-issued-token', expiresAt: Date.now() + 3600 * 1000 },
      { clientId: 'cid', clientSecret: 'csec' }
    );

    await client.callTool({ server: 's', tool: 't', args: {} });

    // Only 1 fetch: the tool call itself.
    expect(calls).toHaveLength(1);
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['Authorization']).toBe('Bearer pre-issued-token');
  });
});

describe('McpClient - stored admin-provisioned client', () => {
  it('skips /oauth/register when clientId and clientSecret are configured', async () => {
    const { fetchFn, calls } = makeFetch([
      { status: 200, body: TOKEN_RESPONSE }, // POST /oauth/token
      { status: 200, body: { success: true } }, // POST /tools/call
    ]);
    const client = new McpClient({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      apiKey: 'raw-api-key',
      timeoutMs: 5000,
      clientId: 'hsc_stored',
      clientSecret: 'stored_secret',
      oauthScope: 'tools:read',
      fetchImpl: fetchFn,
    });
    const result = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.url)).toEqual([
      'https://oauth.example.com/oauth/token',
      'https://orch.example.com/tools/call',
    ]);
    const tokenBody = JSON.parse(calls[0].init.body as string);
    expect(tokenBody).toMatchObject({
      grant_type: 'client_credentials',
      client_id: 'hsc_stored',
      client_secret: 'stored_secret',
      scope: 'tools:read',
    });
  });

  it('defaultMcpConfig reads MCP_CLIENT_ID_BRITTNEY / MCP_CLIENT_SECRET_BRITTNEY / MCP_CLIENT_SCOPE_BRITTNEY', () => {
    const saved = { ...process.env };
    try {
      process.env.MCP_CLIENT_ID_BRITTNEY = 'hsc_env';
      process.env.MCP_CLIENT_SECRET_BRITTNEY = 'env_secret';
      process.env.MCP_CLIENT_SCOPE_BRITTNEY = 'tools:read';
      const cfg = defaultMcpConfig({ apiKey: 'k' });
      expect(cfg.clientId).toBe('hsc_env');
      expect(cfg.clientSecret).toBe('env_secret');
      expect(cfg.oauthScope).toBe('tools:read');
      delete process.env.MCP_CLIENT_ID_BRITTNEY;
      delete process.env.MCP_CLIENT_SECRET_BRITTNEY;
      delete process.env.MCP_CLIENT_SCOPE_BRITTNEY;
      const bare = defaultMcpConfig({ apiKey: 'k' });
      expect(bare.clientId).toBeUndefined();
      expect(bare.oauthScope).toBe('tools:read');
    } finally {
      process.env = saved;
    }
  });
});
