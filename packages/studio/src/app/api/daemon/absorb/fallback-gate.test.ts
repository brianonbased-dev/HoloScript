import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Real mcpClearlyDidNotRun; only the network call is mocked.
const { callMcpToolMock, recordAbsorbJobMock } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  recordAbsorbJobMock: vi.fn(),
}));
vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { HOLOSCRIPT_MCP: 'https://mcp.test', ABSORB_SERVICE: 'https://absorb.test' },
  getAbsorbKey: () => 'service-key',
  getMcpApiKey: () => '',
}));
vi.mock('@/lib/services/absorb-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/absorb-client')>()),
  callMcpTool: callMcpToolMock,
}));
vi.mock('@/lib/absorb/projectState', () => ({ recordAbsorbJob: recordAbsorbJobMock }));

import { POST } from './route';

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const IMPORT = {
  projectPath: '/ws/ws-1/repo',
  projectId: 'proj-1',
  depth: 'shallow',
  tier: 'medium',
};

describe('/api/daemon/absorb: HTTP /scan fallback only when MCP clearly did not run', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    recordAbsorbJobMock.mockReset();
    fetchMock = vi.fn(async () => new Response('{"graphId":"g1","cost":10}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('connection refused: falls back to absorb /scan', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'ECONNREFUSED',
      failure: 'refused',
    });
    const res = await POST(post(IMPORT));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://absorb.test/api/absorb/scan');
  });

  it('a 4xx before the tool ran: falls back to absorb /scan', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'MCP HTTP 406',
      failure: 'http_4xx',
    });
    const res = await POST(post(IMPORT));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('timeout: no fallback, the error goes back to the user', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'timed out',
      failure: 'timeout',
    });
    const res = await POST(post(IMPORT));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { reason: string }).reason).toBe('absorb_upstream_failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('5xx once the request was sent: no fallback', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'MCP HTTP 502',
      failure: 'http_5xx',
    });
    const res = await POST(post(IMPORT));
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('JSON-RPC error (tool may have run): no fallback', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: { code: -1 },
      error: 'tool error',
      failure: 'rpc_error',
    });
    const res = await POST(post(IMPORT));
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only path, shallow, languages and projectId to /scan', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'ECONNREFUSED',
      failure: 'refused',
    });
    await POST(
      post({
        ...IMPORT,
        languages: ['typescript'],
        rootDir: '/etc',
        userId: 'someone-else',
        apiKey: 'leak',
        tier: 'ultra',
      })
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toEqual({
      path: '/ws/ws-1/repo',
      shallow: true,
      languages: ['typescript'],
      projectId: 'proj-1',
    });
  });

  it('refused but no projectPath: nothing to scan, no fallback', async () => {
    callMcpToolMock.mockResolvedValue({
      ok: false,
      data: null,
      error: 'ECONNREFUSED',
      failure: 'refused',
    });
    const res = await POST(post({ projectId: 'proj-1' }));
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
