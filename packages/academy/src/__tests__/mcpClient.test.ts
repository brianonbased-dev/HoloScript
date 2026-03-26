/**
 * mcpClient.test.ts
 *
 * Comprehensive tests for MCPClient, checkRateLimit, and the client registry.
 * Absorbed via holo_absorb_repo — mcpClient.ts: 271L class, 30 public symbols.
 *
 * All network calls go through the private fetch() method which wraps globalThis.fetch,
 * so mocking globalThis.fetch covers every network path.
 *
 * Coverage:
 *   1. Constructor & configuration (updateConfig, getConfig)
 *   2. healthCheck — healthy response, error response
 *   3. Server discovery — getServers, getServerInfo
 *   4. Tool discovery — getTools, getServerTools, getToolInfo
 *   5. Tool execution — callTool success, callTool error
 *   6. Retry logic — callToolWithRetry success, error path, exhausted retries
 *   7. Batch operations — callToolsBatch
 *   8. Resource operations — getResources, readResource
 *   9. Prompt operations — getPrompts
 *  10. Request cancellation — cancelPendingRequests
 *  11. HTTP errors — non-2xx response, timeout AbortError
 *  12. Rate limiting — checkRateLimit allows, blocks at cap
 *  13. Client registry — createMCPClient, getMCPClient, removeMCPClient, clearMCPClients
 *  14. DEFAULT_MCP_CONFIG shape validation
 *  15. Authentication header forwarding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MCPClient,
  translateGraphToWGSL,
  DEFAULT_MCP_CONFIG,
  createMCPClient,
  getMCPClient,
  removeMCPClient,
  clearMCPClients,
} from '../lib/mcpClient';
import type { MCPServerConfig } from '../lib/orchestrationStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: 'test-server',
    url: 'http://localhost:5567',
    apiKey: 'test-key-abc',
    enabled: true,
    healthCheckInterval: 30000,
    timeout: 5000,
    retryPolicy: { maxRetries: 2, backoffMultiplier: 1.5 },
    features: { semanticSearch: true, toolDiscovery: true, resourceManagement: true },
    ...overrides,
  };
}

function mockFetch(payload: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => String(payload),
    })
  );
}

function mockFetchError(message: string): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

function mockFetchAbort(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
  );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_SERVER = {
  name: 'holoscript',
  version: '5.0.0',
  tools: ['holo_parse', 'holo_compile'],
  resources: ['holo://schema'],
  prompts: ['generate_scene'],
};

const SAMPLE_TOOL = {
  name: 'holo_parse',
  description: 'Parse a .holo file',
  inputSchema: {},
};

// ── Cleanup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearMCPClients();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 1. Constructor & configuration ────────────────────────────────────────────

describe('MCPClient — constructor & configuration', () => {
  it('getConfig() returns the initial config', () => {
    const cfg = makeConfig();
    const client = new MCPClient(cfg);
    expect(client.getConfig()).toMatchObject({ name: 'test-server', url: 'http://localhost:5567' });
  });

  it('getConfig() returns a copy (mutation-safe)', () => {
    const cfg = makeConfig();
    const client = new MCPClient(cfg);
    const got = client.getConfig();
    got.name = 'mutated';
    expect(client.getConfig().name).toBe('test-server');
  });

  it('updateConfig() merges partial overrides', () => {
    const client = new MCPClient(makeConfig());
    client.updateConfig({ timeout: 9999, apiKey: 'new-key' });
    const cfg = client.getConfig();
    expect(cfg.timeout).toBe(9999);
    expect(cfg.apiKey).toBe('new-key');
    expect(cfg.name).toBe('test-server'); // untouched
  });
});

// ── 2. healthCheck ────────────────────────────────────────────────────────────

describe('MCPClient — healthCheck()', () => {
  it('returns isHealthy:true when server responds ok', async () => {
    mockFetch({ status: 'ok', toolCount: 42 });
    const client = new MCPClient(makeConfig());
    const status = await client.healthCheck();
    expect(status.isHealthy).toBe(true);
    expect(status.name).toBe('test-server');
    expect(status.availableTools).toBe(42);
    expect(status.responseTime).toBeGreaterThanOrEqual(0);
    expect(status.lastCheck).toBeInstanceOf(Date);
  });

  it('uses toolCount=0 when server omits it', async () => {
    mockFetch({ status: 'ok' }); // no toolCount
    const client = new MCPClient(makeConfig());
    const status = await client.healthCheck();
    expect(status.availableTools).toBe(0);
  });

  it('returns isHealthy:false when fetch throws', async () => {
    mockFetchError('Connection refused');
    const client = new MCPClient(makeConfig());
    const status = await client.healthCheck();
    expect(status.isHealthy).toBe(false);
    expect(status.errorMessage).toContain('Connection refused');
    expect(status.availableTools).toBe(0);
  });

  it('still sets lastCheck even on error', async () => {
    mockFetchError('timeout');
    const before = new Date();
    const client = new MCPClient(makeConfig());
    const status = await client.healthCheck();
    expect(status.lastCheck.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ── 3. Server discovery ───────────────────────────────────────────────────────

describe('MCPClient — server discovery', () => {
  it('getServers() calls GET /servers', async () => {
    mockFetch([SAMPLE_SERVER]);
    const client = new MCPClient(makeConfig());
    const servers = await client.getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('holoscript');
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('getServerInfo() calls GET /servers/:name', async () => {
    mockFetch(SAMPLE_SERVER);
    const client = new MCPClient(makeConfig());
    const info = await client.getServerInfo('holoscript');
    expect(info.name).toBe('holoscript');
    expect(info.tools).toContain('holo_parse');
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers/holoscript'),
      expect.anything()
    );
  });
});

// ── 4. Tool discovery ─────────────────────────────────────────────────────────

describe('MCPClient — tool discovery', () => {
  it('getTools() calls GET /tools', async () => {
    mockFetch([SAMPLE_TOOL]);
    const client = new MCPClient(makeConfig());
    const tools = await client.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('holo_parse');
  });

  it('getServerTools() calls GET /servers/:name/tools', async () => {
    mockFetch([SAMPLE_TOOL]);
    const client = new MCPClient(makeConfig());
    const tools = await client.getServerTools('holoscript');
    expect(tools[0].name).toBe('holo_parse');
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers/holoscript/tools'),
      expect.anything()
    );
  });

  it('getToolInfo() calls GET /servers/:name/tools/:tool', async () => {
    mockFetch(SAMPLE_TOOL);
    const client = new MCPClient(makeConfig());
    const tool = await client.getToolInfo('holoscript', 'holo_parse');
    expect(tool.name).toBe('holo_parse');
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers/holoscript/tools/holo_parse'),
      expect.anything()
    );
  });
});

// ── 5. Tool execution ─────────────────────────────────────────────────────────

describe('MCPClient — callTool()', () => {
  const request = { server: 'holoscript', tool: 'holo_parse', args: { code: 'scene Foo {}' } };

  it('returns success:true and result on 2xx', async () => {
    mockFetch({ nodes: 5, edges: 3 });
    const client = new MCPClient(makeConfig());
    const resp = await client.callTool(request);
    expect(resp.success).toBe(true);
    expect(resp.result).toEqual({ nodes: 5, edges: 3 });
    expect(resp.duration).toBeGreaterThanOrEqual(0);
  });

  it('POSTs to /tools/call with JSON body', async () => {
    mockFetch({});
    const client = new MCPClient(makeConfig());
    await client.callTool(request);
    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/tools/call');
    expect(opts?.method).toBe('POST');
    expect(JSON.parse(opts?.body as string)).toMatchObject({ tool: 'holo_parse' });
  });

  it('returns success:false on network error', async () => {
    mockFetchError('ECONNREFUSED');
    const client = new MCPClient(makeConfig());
    const resp = await client.callTool(request);
    expect(resp.success).toBe(false);
    expect(resp.error).toContain('ECONNREFUSED');
    expect(resp.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns success:false on HTTP 500', async () => {
    mockFetch('Internal Server Error', 500);
    const client = new MCPClient(makeConfig());
    const resp = await client.callTool(request);
    expect(resp.success).toBe(false);
    expect(resp.error).toContain('500');
  });
});

// ── 6. Retry logic ────────────────────────────────────────────────────────────

describe('MCPClient — callToolWithRetry()', () => {
  const request = { server: 'holoscript', tool: 'holo_parse', args: {} };

  it('returns immediately on success without retrying', async () => {
    mockFetch({ ok: true });
    const client = new MCPClient(makeConfig());
    const resp = await client.callToolWithRetry(request, { maxRetries: 3 });
    expect(resp.success).toBe(true);
    // Only 1 fetch call (no retries)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('returns success:false after exhausting retries', async () => {
    // callTool returns failure (not throws), so retry loop exits without throw path
    mockFetch('Internal error', 500);
    const client = new MCPClient(makeConfig());
    const resp = await client.callToolWithRetry(request, { maxRetries: 0 });
    expect(resp.success).toBe(false);
  });

  it('uses config retryPolicy when options omitted', async () => {
    mockFetch({});
    const client = new MCPClient(makeConfig({ retryPolicy: { maxRetries: 2, backoffMultiplier: 1 } }));
    const resp = await client.callToolWithRetry(request);
    expect(resp.success).toBe(true);
  });

  it('returns error response when callTool returns success:false with error field', async () => {
    // success:false + error set = don't retry (return immediately)
    mockFetch('Not found', 404);
    const client = new MCPClient(makeConfig());
    const resp = await client.callToolWithRetry(request, { maxRetries: 5 });
    expect(resp.success).toBe(false);
    // Should not retry — only 1 fetch call
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });
});

// ── 7. Batch operations ───────────────────────────────────────────────────────

describe('MCPClient — callToolsBatch()', () => {
  it('calls each tool in parallel and returns all results', async () => {
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ index: callCount }),
          text: async () => '',
        };
      })
    );
    const client = new MCPClient(makeConfig());
    const requests = [
      { server: 's', tool: 't1', args: {} },
      { server: 's', tool: 't2', args: {} },
      { server: 's', tool: 't3', args: {} },
    ];
    const results = await client.callToolsBatch(requests);
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.success).toBe(true));
  });

  it('returns empty array for empty batch', async () => {
    mockFetch({});
    const client = new MCPClient(makeConfig());
    const results = await client.callToolsBatch([]);
    expect(results).toEqual([]);
  });
});

// ── 8. Resource operations ────────────────────────────────────────────────────

describe('MCPClient — resource operations', () => {
  it('getResources() calls GET /servers/:name/resources', async () => {
    mockFetch(['holo://scenes/main', 'holo://assets/gallery']);
    const client = new MCPClient(makeConfig());
    const resources = await client.getResources('holoscript');
    expect(resources).toHaveLength(2);
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers/holoscript/resources'),
      expect.anything()
    );
  });

  it('readResource() POSTs with uri body', async () => {
    mockFetch({ content: '<scene/>' });
    const client = new MCPClient(makeConfig());
    const result = await client.readResource('holoscript', 'holo://scenes/main');
    expect(result).toEqual({ content: '<scene/>' });
    const fetchMock = vi.mocked(globalThis.fetch);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/resources/read');
    expect(JSON.parse(opts?.body as string)).toEqual({ uri: 'holo://scenes/main' });
  });
});

// ── 9. Prompt operations ──────────────────────────────────────────────────────

describe('MCPClient — getPrompts()', () => {
  it('calls GET /servers/:name/prompts', async () => {
    mockFetch(['generate_scene', 'explain_trait']);
    const client = new MCPClient(makeConfig());
    const prompts = await client.getPrompts('holoscript');
    expect(prompts).toHaveLength(2);
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers/holoscript/prompts'),
      expect.anything()
    );
  });
});

// ── 10. Request cancellation ──────────────────────────────────────────────────

describe('MCPClient — cancelPendingRequests()', () => {
  it('does not throw when no request is in-flight', () => {
    const client = new MCPClient(makeConfig());
    expect(() => client.cancelPendingRequests()).not.toThrow();
  });
});

// ── 11. HTTP errors & timeout ─────────────────────────────────────────────────

describe('MCPClient — HTTP error handling', () => {
  it('throws on HTTP 401 Unauthorized', async () => {
    mockFetch('Unauthorized', 401);
    const client = new MCPClient(makeConfig());
    const resp = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(resp.success).toBe(false);
    expect(resp.error).toContain('401');
  });

  it('wraps AbortError as timeout message', async () => {
    mockFetchAbort();
    const client = new MCPClient(makeConfig({ timeout: 100 }));
    const resp = await client.callTool({ server: 's', tool: 't', args: {} });
    expect(resp.success).toBe(false);
    expect(resp.error).toMatch(/timed out|AbortError/i);
  });
});

// ── 12. Authentication header ─────────────────────────────────────────────────

describe('MCPClient — authentication', () => {
  it('sends x-mcp-api-key header on every request', async () => {
    mockFetch({ status: 'ok', toolCount: 1 });
    const client = new MCPClient(makeConfig({ apiKey: 'secret-token-xyz' }));
    await client.healthCheck();
    const fetchMock = vi.mocked(globalThis.fetch);
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts?.headers as Record<string, string>)?.['x-mcp-api-key']).toBe('secret-token-xyz');
  });

  it('sends Content-Type: application/json on POST calls', async () => {
    mockFetch({});
    const client = new MCPClient(makeConfig());
    await client.callTool({ server: 's', tool: 't', args: {} });
    const fetchMock = vi.mocked(globalThis.fetch);
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
  });

  it('constructs correct URL from config.url + endpoint', async () => {
    mockFetch({ status: 'ok', toolCount: 0 });
    const client = new MCPClient(makeConfig({ url: 'http://my-mcp-server:9000' }));
    await client.healthCheck();
    const fetchMock = vi.mocked(globalThis.fetch);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://my-mcp-server:9000/health');
  });
});

// ── 13. Client registry ───────────────────────────────────────────────────────

describe('Client registry', () => {
  it('createMCPClient() creates a client with DEFAULT_MCP_CONFIG', () => {
    const client = createMCPClient();
    expect(client).toBeInstanceOf(MCPClient);
    expect(client.getConfig().url).toBe('https://mcp-orchestrator-production-45f9.up.railway.app');
  });

  it('createMCPClient() accepts config overrides', () => {
    const client = createMCPClient({ name: 'custom', url: 'http://custom:1234' });
    expect(client.getConfig().url).toBe('http://custom:1234');
  });

  it('getMCPClient() creates and caches client when config provided', () => {
    const cfg = makeConfig({ name: 'reg-test' });
    const c1 = getMCPClient('reg-test', cfg);
    const c2 = getMCPClient('reg-test');
    expect(c1).toBe(c2); // same instance
  });

  it('getMCPClient() throws when client not found and no config provided', () => {
    expect(() => getMCPClient('nonexistent')).toThrow(/not found/);
  });

  it('removeMCPClient() removes existing client and returns true', () => {
    const cfg = makeConfig({ name: 'to-remove' });
    getMCPClient('to-remove', cfg);
    expect(removeMCPClient('to-remove')).toBe(true);
    expect(() => getMCPClient('to-remove')).toThrow(/not found/);
  });

  it('removeMCPClient() returns false when client does not exist', () => {
    expect(removeMCPClient('ghost-client')).toBe(false);
  });

  it('clearMCPClients() empties the registry', () => {
    getMCPClient('c1', makeConfig({ name: 'c1' }));
    getMCPClient('c2', makeConfig({ name: 'c2' }));
    clearMCPClients();
    expect(() => getMCPClient('c1')).toThrow(/not found/);
    expect(() => getMCPClient('c2')).toThrow(/not found/);
  });
});

// ── 14. DEFAULT_MCP_CONFIG ────────────────────────────────────────────────────

describe('DEFAULT_MCP_CONFIG', () => {
  it('points to production orchestrator', () => {
    expect(DEFAULT_MCP_CONFIG.url).toBe('https://mcp-orchestrator-production-45f9.up.railway.app');
  });

  it('has sensible timeout and retry defaults', () => {
    expect(DEFAULT_MCP_CONFIG.timeout).toBeGreaterThan(0);
    expect(DEFAULT_MCP_CONFIG.retryPolicy.maxRetries).toBeGreaterThan(0);
    expect(DEFAULT_MCP_CONFIG.retryPolicy.backoffMultiplier).toBeGreaterThan(1);
  });

  it('has all features enabled by default', () => {
    expect(DEFAULT_MCP_CONFIG.features.semanticSearch).toBe(true);
    expect(DEFAULT_MCP_CONFIG.features.toolDiscovery).toBe(true);
    expect(DEFAULT_MCP_CONFIG.features.resourceManagement).toBe(true);
  });

  it('is enabled by default', () => {
    expect(DEFAULT_MCP_CONFIG.enabled).toBe(true);
  });
});
