import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

describe('/api/feed route', () => {
  const ORIGINAL_ENV = process.env.MCP_SERVER_URL;

  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
    if (ORIGINAL_ENV === undefined) delete process.env.MCP_SERVER_URL;
    else process.env.MCP_SERVER_URL = ORIGINAL_ENV;
  });

  it('proxies to the mcp-server public feed and forwards the scenes payload', async () => {
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scenes: [
            {
              id: 'scene_1',
              title: 'A World',
              description: '',
              createdAt: 1000,
              previewUrl: '/scene/scene_1',
            },
          ],
        }),
    });

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/api/feed');
    const res = await GET(req);
    const body = await res.json();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mcp.test/api/public/feed',
      expect.objectContaining({ method: 'GET' })
    );
    expect(body.scenes).toHaveLength(1);
    expect(body.scenes[0].id).toBe('scene_1');
  });

  it('passes the ?limit query param through to the upstream request', async () => {
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenes: [] }),
    });

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/api/feed?limit=5');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mcp.test/api/public/feed?limit=5',
      expect.anything()
    );
  });

  it('degrades gracefully to an empty scenes array with a non-200 status on upstream failure', async () => {
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    (global.fetch as any).mockResolvedValueOnce({ ok: false });

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/api/feed');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.scenes).toEqual([]);
  });

  it('degrades gracefully when the fetch itself throws', async () => {
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    (global.fetch as any).mockRejectedValueOnce(new Error('network down'));

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/api/feed');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.scenes).toEqual([]);
    expect(body.error).toContain('network down');
  });

  it('falls back to the production mcp.holoscript.net default when MCP_SERVER_URL is unset', async () => {
    delete process.env.MCP_SERVER_URL;
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenes: [] }),
    });

    const { GET } = await import('./route');
    const req = new NextRequest('http://localhost/api/feed');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mcp.holoscript.net/api/public/feed',
      expect.anything()
    );
  });
});
