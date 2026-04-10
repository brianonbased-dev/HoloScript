import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

async function loadPublishRouteWithEnv(env: { HOLOMESH_API_KEY?: string; MCP_SERVER_URL?: string }) {
  vi.resetModules();

  const prevHoloMesh = process.env.HOLOMESH_API_KEY;
  const prevMcp = process.env.MCP_SERVER_URL;

  if (env.HOLOMESH_API_KEY === undefined) delete process.env.HOLOMESH_API_KEY;
  else process.env.HOLOMESH_API_KEY = env.HOLOMESH_API_KEY;

  if (env.MCP_SERVER_URL === undefined) delete process.env.MCP_SERVER_URL;
  else process.env.MCP_SERVER_URL = env.MCP_SERVER_URL;

  const mod = await import('./route');

  return {
    POST: mod.POST,
    restoreEnv: () => {
      if (prevHoloMesh === undefined) delete process.env.HOLOMESH_API_KEY;
      else process.env.HOLOMESH_API_KEY = prevHoloMesh;

      if (prevMcp === undefined) delete process.env.MCP_SERVER_URL;
      else process.env.MCP_SERVER_URL = prevMcp;
    },
  };
}

describe('/api/absorb/knowledge/publish route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns 400 when entries are missing', async () => {
    const { POST, restoreEnv } = await loadPublishRouteWithEnv({
      HOLOMESH_API_KEY: 'hm-key',
      MCP_SERVER_URL: 'https://mcp.test',
    });

    const req = new NextRequest('http://localhost/api/absorb/knowledge/publish', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: 'ws-1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing entries/i);

    restoreEnv();
  });

  it('returns 400 when workspace_id is missing', async () => {
    const { POST, restoreEnv } = await loadPublishRouteWithEnv({
      HOLOMESH_API_KEY: 'hm-key',
      MCP_SERVER_URL: 'https://mcp.test',
    });

    const req = new NextRequest('http://localhost/api/absorb/knowledge/publish', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ type: 'wisdom', content: 'A' }] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing workspace_id/i);

    restoreEnv();
  });

  it('returns 500 when HOLOMESH_API_KEY is not set', async () => {
    const { POST, restoreEnv } = await loadPublishRouteWithEnv({
      HOLOMESH_API_KEY: undefined,
      MCP_SERVER_URL: 'https://mcp.test',
    });

    const req = new NextRequest('http://localhost/api/absorb/knowledge/publish', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: 'ws-1',
        entries: [{ type: 'wisdom', content: 'A' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/HOLOMESH_API_KEY/i);

    restoreEnv();
  });

  it('publishes entries and reports premium/free counts with partial errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const { POST, restoreEnv } = await loadPublishRouteWithEnv({
      HOLOMESH_API_KEY: 'hm-key',
      MCP_SERVER_URL: 'https://mcp.test',
    });

    const req = new NextRequest('http://localhost/api/absorb/knowledge/publish', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: 'ws-2',
        default_premium: true,
        entries: [
          { type: 'wisdom', content: 'Premium by default' },
          { type: 'pattern', content: 'Forced free', is_premium: false },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.publishedCount).toBe(1);
    expect(body.premium_count).toBe(1);
    expect(body.free_count).toBe(0);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toContain('bad request');

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstCall[0]).toContain('https://mcp.test/api/holomesh/contribute');

    restoreEnv();
  });
});
