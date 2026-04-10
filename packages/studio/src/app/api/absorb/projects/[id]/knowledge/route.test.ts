import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { POST } from './route';

describe('/api/absorb/projects/[id]/knowledge route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns MCP extraction result when MCP tool call succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, summary: { total: 3 }, entries: [{}] }),
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/projects/proj-1/knowledge', {
      method: 'POST',
      body: JSON.stringify({ minConfidence: 0.8, maxPerType: 5, includeSpeculative: true }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'proj-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.total).toBe(3);
  });

  it('falls back to absorb REST API when MCP tool call fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('mcp unavailable', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, summary: { total: 1 }, entries: [{ id: 'w1' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/projects/proj-2/knowledge', {
      method: 'POST',
      body: JSON.stringify({ minConfidence: 0.6 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'proj-2' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.total).toBe(1);

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/projects/proj-2/knowledge');
  });

  it('returns 503 fallback payload when both MCP and REST fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const req = new NextRequest('http://localhost/api/absorb/projects/proj-3/knowledge', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'proj-3' }) });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.summary.total).toBe(0);
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(body.tried).toEqual(['mcp-tool', 'absorb-rest']);
  });
});
