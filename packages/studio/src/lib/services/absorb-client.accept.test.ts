import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { HOLOSCRIPT_MCP: 'https://mcp.test', ABSORB_SERVICE: 'https://absorb.test' },
  getAbsorbKey: () => 'k',
  getMcpApiKey: () => '',
}));

import { callMcpTool } from './absorb-client';

describe('absorb-client MCP request headers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts both JSON and SSE, as the Streamable HTTP MCP endpoint requires', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const accept = new Headers(init.headers).get('accept') ?? '';
      // Mirrors the absorb server: 406 unless both types are accepted.
      if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
        return new Response('{"error":{"code":-32000}}', { status: 406, statusText: 'Not Acceptable' });
      }
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ text: '{"status":"complete"}' }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await callMcpTool('absorb_run_absorb', { projectId: 'p' });
    expect(res).toEqual({ ok: true, data: { status: 'complete' } });
  });
});
