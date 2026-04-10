/**
 * Tests for MCP Tools + Executor
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCP_TOOLS, MCP_TOOL_NAMES } from '../MCPTools';
import { executeMCPTool, isMCPTool } from '../MCPToolExecutor';

// ─── Tool definition tests ─────────────────────────────────────────────────

describe('MCP_TOOLS', () => {
  it('exports exactly 15 tool definitions', () => {
    expect(MCP_TOOLS).toHaveLength(15);
  });

  it('every tool has type "function" and a valid function shape', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters.type).toBe('object');
    }
  });

  it('all tool names are unique', () => {
    const names = MCP_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('MCP_TOOL_NAMES contains all tool names', () => {
    for (const tool of MCP_TOOLS) {
      expect(MCP_TOOL_NAMES.has(tool.function.name)).toBe(true);
    }
  });

  it('contains orchestrator tools', () => {
    const names = MCP_TOOLS.map((t) => t.function.name);
    expect(names).toContain('mcp_discover_tools');
    expect(names).toContain('mcp_call_tool');
    expect(names).toContain('mcp_list_servers');
    expect(names).toContain('knowledge_query');
    expect(names).toContain('knowledge_sync');
  });

  it('contains HoloScript MCP tools', () => {
    const names = MCP_TOOLS.map((t) => t.function.name);
    expect(names).toContain('holo_parse');
    expect(names).toContain('holo_compile');
    expect(names).toContain('holo_suggest_traits');
    expect(names).toContain('holo_generate_scene');
    expect(names).toContain('holo_list_traits');
    expect(names).toContain('holo_explain_trait');
  });

  it('contains Absorb MCP tools', () => {
    const names = MCP_TOOLS.map((t) => t.function.name);
    expect(names).toContain('absorb_run');
    expect(names).toContain('absorb_query_graph');
    expect(names).toContain('absorb_code_health');
    expect(names).toContain('absorb_suggest');
  });

  it('mcp_call_tool requires server and tool args', () => {
    const callTool = MCP_TOOLS.find((t) => t.function.name === 'mcp_call_tool');
    expect(callTool?.function.parameters.required).toContain('server');
    expect(callTool?.function.parameters.required).toContain('tool');
  });

  it('knowledge_query requires search', () => {
    const kq = MCP_TOOLS.find((t) => t.function.name === 'knowledge_query');
    expect(kq?.function.parameters.required).toContain('search');
  });

  it('holo_compile requires code and target', () => {
    const hc = MCP_TOOLS.find((t) => t.function.name === 'holo_compile');
    expect(hc?.function.parameters.required).toContain('code');
    expect(hc?.function.parameters.required).toContain('target');
  });
});

// ─── isMCPTool tests ────────────────────────────────────────────────────────

describe('isMCPTool', () => {
  it('returns true for MCP tools', () => {
    expect(isMCPTool('mcp_call_tool')).toBe(true);
    expect(isMCPTool('knowledge_query')).toBe(true);
    expect(isMCPTool('holo_parse')).toBe(true);
    expect(isMCPTool('absorb_run')).toBe(true);
  });

  it('returns false for non-MCP tools', () => {
    expect(isMCPTool('add_trait')).toBe(false);
    expect(isMCPTool('export_scene')).toBe(false);
    expect(isMCPTool('nonexistent')).toBe(false);
  });
});

// ─── Executor tests (mocked fetch) ─────────────────────────────────────────

describe('executeMCPTool', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('MCP_API_KEY', 'test-api-key');
    vi.stubEnv('NEXT_PUBLIC_MCP_ORCHESTRATOR_URL', 'https://orch.test');
    vi.stubEnv('HOLOSCRIPT_MCP', 'https://holo.test');
    vi.stubEnv('ABSORB_MCP', 'https://absorb.test');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('returns error for unknown tool', async () => {
    const result = await executeMCPTool('nonexistent_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown MCP tool');
  });

  it('routes mcp_list_servers to orchestrator GET /servers', async () => {
    const mockServers = [{ name: 'holoscript-tools', url: 'https://mcp.holoscript.net' }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockServers),
    });

    const result = await executeMCPTool('mcp_list_servers', {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockServers);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://orch.test/servers');
    expect(call[1].method).toBe('GET');
    expect(call[1].headers['x-mcp-api-key']).toBe('test-api-key');
  });

  it('routes mcp_discover_tools with server filter to query param', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve([]),
    });

    await executeMCPTool('mcp_discover_tools', { server: 'absorb-service' });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('server=absorb-service');
  });

  it('routes mcp_call_tool to orchestrator POST /tools/call', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ result: 'ok' }),
    });

    const result = await executeMCPTool('mcp_call_tool', {
      server: 'holoscript-tools',
      tool: 'parse_hs',
      args: { code: 'object "Box" {}' },
    });

    expect(result.success).toBe(true);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://orch.test/tools/call');
    const body = JSON.parse(call[1].body as string);
    expect(body.server).toBe('holoscript-tools');
    expect(body.tool).toBe('parse_hs');
    expect(body.args.code).toBe('object "Box" {}');
  });

  it('routes knowledge_query with workspace_id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ entries: [] }),
    });

    await executeMCPTool('knowledge_query', { search: 'RBAC', type: 'pattern', limit: 10 });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.search).toBe('RBAC');
    expect(body.workspace_id).toBe('ai-ecosystem');
    expect(body.type).toBe('pattern');
    expect(body.limit).toBe(10);
  });

  it('routes knowledge_sync and injects workspace_id into entries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ synced: 1 }),
    });

    await executeMCPTool('knowledge_sync', {
      entries: [{ id: 'W.TEST.001', type: 'wisdom', content: 'test entry' }],
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.workspace_id).toBe('ai-ecosystem');
    expect(body.entries[0].workspace_id).toBe('ai-ecosystem');
  });

  it('routes holo_parse to HoloScript MCP via JSON-RPC', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: { ast: {} } }),
    });

    const result = await executeMCPTool('holo_parse', { code: 'object "Ball" {}' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ast: {} });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://holo.test/mcp');
    const body = JSON.parse(call[1].body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('parse_hs');
    expect(body.params.arguments.code).toBe('object "Ball" {}');
  });

  it('routes holo_compile with correct target mapping', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 2, result: { code: '// compiled' } }),
    });

    await executeMCPTool('holo_compile', { code: 'object "Box" {}', target: 'r3f' });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.params.name).toBe('compile_to_target');
    expect(body.params.arguments.target).toBe('r3f');
  });

  it('routes absorb_run to Absorb MCP via JSON-RPC', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 3, result: { status: 'started' } }),
    });

    const result = await executeMCPTool('absorb_run', {
      repoUrl: 'https://github.com/user/repo',
      branch: 'develop',
    });
    expect(result.success).toBe(true);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://absorb.test/mcp');
    const body = JSON.parse(call[1].body as string);
    expect(body.params.name).toBe('absorb_run_absorb');
    expect(body.params.arguments.repoUrl).toBe('https://github.com/user/repo');
    expect(body.params.arguments.branch).toBe('develop');
  });

  it('routes absorb_query_graph to absorb_query method', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 4, result: { results: [] } }),
    });

    await executeMCPTool('absorb_query_graph', { search: 'auth middleware' });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.params.name).toBe('absorb_query');
  });

  it('handles HTTP error from orchestrator', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });

    const result = await executeMCPTool('mcp_list_servers', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('handles JSON-RPC error from direct MCP', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: 5,
          error: { code: -32601, message: 'Method not found' },
        }),
    });

    const result = await executeMCPTool('holo_parse', { code: 'bad' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Method not found');
  });

  it('handles fetch failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network unreachable'));

    const result = await executeMCPTool('mcp_list_servers', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network unreachable');
  });

  it('sends Bearer auth for direct MCP calls', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 6, result: {} }),
    });

    await executeMCPTool('holo_list_traits', {});

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers['Authorization']).toBe('Bearer test-api-key');
  });

  it('sends x-mcp-api-key for orchestrator calls', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve([]),
    });

    await executeMCPTool('mcp_list_servers', {});

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers['x-mcp-api-key']).toBe('test-api-key');
  });

  it('handles text response from orchestrator', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: () => Promise.resolve('OK'),
    });

    const result = await executeMCPTool('mcp_list_servers', {});
    expect(result.success).toBe(true);
    expect(result.data).toBe('OK');
  });
});
