import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { HOLOSCRIPT_MCP: 'https://mcp.test', ABSORB_SERVICE: 'https://absorb.test' },
  getAbsorbKey: () => 'k',
  getMcpApiKey: () => '',
}));

import { callMcpTool, mcpClearlyDidNotRun } from './absorb-client';

describe('absorb-client failure classification', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function failWith(impl: () => Promise<Response>) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(impl));
    return callMcpTool('absorb_run_absorb', { projectId: 'p' });
  }

  it('connection refused -> refused (did not run)', async () => {
    const r = await failWith(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });
    expect(r.failure).toBe('refused');
    expect(mcpClearlyDidNotRun(r)).toBe(true);
  });

  it('clean 4xx (400) -> http_4xx (did not run)', async () => {
    const r = await failWith(async () => new Response('nope', { status: 400 }));
    expect(r.failure).toBe('http_4xx');
    expect(mcpClearlyDidNotRun(r)).toBe(true);
  });

  it('timeout -> timeout (may have run)', async () => {
    const r = await failWith(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    expect(r.failure).toBe('timeout');
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });

  it('5xx -> http_5xx (may have run)', async () => {
    const r = await failWith(async () => new Response('boom', { status: 503 }));
    expect(r.failure).toBe('http_5xx');
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });

  it('JSON-RPC error -> rpc_error (may have run)', async () => {
    const r = await failWith(
      async () =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'x' } }), {
          status: 200,
        })
    );
    expect(r.failure).toBe('rpc_error');
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });

  it('other network error (e.g. reset) -> network (may have run)', async () => {
    const r = await failWith(async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    });
    expect(r.failure).toBe('network');
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });

  it('tool answered { error } with HTTP 200 -> tool_error (ran, not ok, no fallback)', async () => {
    const r = await failWith(
      async () =>
        new Response(
          JSON.stringify({ result: { content: [{ text: '{"error":"Absorb failed"}' }] } }),
          { status: 200 }
        )
    );
    expect(r.ok).toBe(false);
    expect(r.failure).toBe('tool_error');
    expect(r.error).toContain('Absorb failed');
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });

  it('result.isError -> tool_error', async () => {
    const r = await failWith(
      async () =>
        new Response(
          JSON.stringify({ result: { isError: true, content: [{ text: 'boom' }] } }),
          { status: 200 }
        )
    );
    expect(r.ok).toBe(false);
    expect(r.failure).toBe('tool_error');
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });

  it('success has no failure kind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ result: { content: [{ text: '{"a":1}' }] } }), {
            status: 200,
          })
      )
    );
    const r = await callMcpTool('absorb_run_absorb', { projectId: 'p' });
    expect(r).toEqual({ ok: true, data: { a: 1 } });
    expect(mcpClearlyDidNotRun(r)).toBe(false);
  });
});
