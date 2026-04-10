import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { DELETE, GET, POST, PUT } from './route';

describe('/api/absorb/[...path] route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET proxies path+query and forwards auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, source: 'upstream' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/projects/abc?depth=deep', {
      headers: { authorization: 'Bearer user-token' },
    });

    const res = await GET(req, { params: Promise.resolve({ path: ['projects', 'abc'] }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://absorb.test/api/projects/abc?depth=deep');
    expect(init.method).toBe('GET');

    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer absorb-key-test');
    expect(headers['X-User-Authorization']).toBe('Bearer user-token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('POST/PUT/DELETE proxy methods and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const postReq = new NextRequest('http://localhost/api/absorb/tools/run', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const putReq = new NextRequest('http://localhost/api/absorb/tools/run', {
      method: 'PUT',
      body: JSON.stringify({ x: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const deleteReq = new NextRequest('http://localhost/api/absorb/tools/run', {
      method: 'DELETE',
      body: JSON.stringify({ force: true }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(postReq, { params: Promise.resolve({ path: ['tools', 'run'] }) });
    await PUT(putReq, { params: Promise.resolve({ path: ['tools', 'run'] }) });
    await DELETE(deleteReq, { params: Promise.resolve({ path: ['tools', 'run'] }) });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const methods = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method);
    expect(methods).toEqual(['POST', 'PUT', 'DELETE']);

    const firstBody = (fetchMock.mock.calls[0][1] as RequestInit).body;
    expect(String(firstBody)).toContain('hello');
  });

  it('returns 502 json payload when upstream is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const req = new NextRequest('http://localhost/api/absorb/any/path');
    const res = await GET(req, { params: Promise.resolve({ path: ['any', 'path'] }) });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
    expect(body.message).toContain('ECONNREFUSED');
    expect(body.hint).toMatch(/ABSORB_SERVICE_URL/i);
  });
});
