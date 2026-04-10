import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { callMcpToolMock, forwardAuthHeadersMock } = vi.hoisted(() => ({
  callMcpToolMock: vi.fn(),
  forwardAuthHeadersMock: vi.fn(() => ({ Authorization: 'Bearer user-token' })),
}));

vi.mock('@/lib/services/absorb-client', () => ({
  callMcpTool: callMcpToolMock,
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
}));

vi.mock('@/lib/api-auth', () => ({
  forwardAuthHeaders: forwardAuthHeadersMock,
}));

import { GET, POST } from './route';

describe('/api/daemon/absorb route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    callMcpToolMock.mockReset();
    forwardAuthHeadersMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('GET returns static guidance payload', async () => {
    const req = new NextRequest('http://localhost/api/daemon/absorb');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.hint).toMatch(/POST instead/i);
  });

  it('POST returns MCP result when tool call succeeds', async () => {
    callMcpToolMock.mockResolvedValue({ ok: true, data: { jobId: 'job-mcp', status: 'queued' } });

    const req = new NextRequest('http://localhost/api/daemon/absorb', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-1', depth: 'deep', tier: 'high' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-mcp');

    expect(callMcpToolMock).toHaveBeenCalledWith('absorb_run_absorb', {
      projectId: 'proj-1',
      depth: 'deep',
      tier: 'high',
    });
  });

  it('POST falls back to HTTP API when MCP result is unavailable', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-http', status: 'running' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/daemon/absorb', {
      method: 'POST',
      body: JSON.stringify({ projectPath: '/tmp/repo', depth: 'medium', tier: 'medium' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe('job-http');

    expect(forwardAuthHeadersMock).toHaveBeenCalled();
    const fetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = (fetchInit.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer user-token');
  });

  it('POST returns 502 when MCP and HTTP fallback both fail', async () => {
    callMcpToolMock.mockResolvedValue({ ok: false, data: null });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const req = new NextRequest('http://localhost/api/daemon/absorb', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-fail' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to run absorb_run_absorb/i);
  });
});
