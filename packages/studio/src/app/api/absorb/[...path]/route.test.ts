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
    expect(url).toContain('https://absorb.test/api/absorb/projects/abc?depth=deep');
    expect(init.method).toBe('GET');

    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer user-token');
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
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer user-token' },
    });
    const putReq = new NextRequest('http://localhost/api/absorb/tools/run', {
      method: 'PUT',
      body: JSON.stringify({ x: 1 }),
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer user-token' },
    });
    const deleteReq = new NextRequest('http://localhost/api/absorb/tools/run', {
      method: 'DELETE',
      body: JSON.stringify({ force: true }),
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer user-token' },
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

  it('a by-id Studio request reaches the absorb path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ project: { id: 'abc' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const auth = { headers: { authorization: 'Bearer user-token' } };
    const getReq = new NextRequest('http://localhost/api/absorb/projects/abc', auth);
    const deleteReq = new NextRequest('http://localhost/api/absorb/projects/abc', { method: 'DELETE', ...auth });
    await GET(getReq, { params: Promise.resolve({ path: ['projects', 'abc'] }) });
    await DELETE(deleteReq, { params: Promise.resolve({ path: ['projects', 'abc'] }) });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      'https://absorb.test/api/absorb/projects/abc',
      'https://absorb.test/api/absorb/projects/abc',
    ]);
    for (const url of urls) {
      expect(url.startsWith('https://absorb.test/api/absorb/')).toBe(true);
    }
  });

  it('returns 502 json payload when upstream is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const req = new NextRequest('http://localhost/api/absorb/any/path', {
      headers: { authorization: 'Bearer user-token' },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ['any', 'path'] }) });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
    expect(body.message).toContain('ECONNREFUSED');
    expect(body.hint).toMatch(/ABSORB_SERVICE_URL/i);
  });

  describe('free-scan path: never forwards scan with the service key', () => {
    const okUpstream = () =>
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

    it('refuses an unauthenticated POST to /api/absorb/absorb/scan and forwards nothing', async () => {
      const fetchMock = okUpstream();
      vi.stubGlobal('fetch', fetchMock);

      const req = new NextRequest('http://localhost/api/absorb/absorb/scan', {
        method: 'POST',
        body: JSON.stringify({ repoUrl: 'https://github.com/a/b' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await POST(req, { params: Promise.resolve({ path: ['absorb', 'scan'] }) });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.hint).toMatch(/\/api\/projects\/\{id\}\/absorb/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses an authenticated scan through the catch-all too (any case or encoding)', async () => {
      const fetchMock = okUpstream();
      vi.stubGlobal('fetch', fetchMock);

      for (const path of [['absorb', 'scan'], ['absorb', 'SCAN'], ['absorb', '%73can'], ['scan']]) {
        const req = new NextRequest(`http://localhost/api/absorb/${path.join('/')}`, {
          method: 'POST',
          body: '{}',
          headers: { authorization: 'Bearer user-token' },
        });
        const res = await POST(req, { params: Promise.resolve({ path }) });
        expect(res.status).toBe(403);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses any unauthenticated request without forwarding', async () => {
      const fetchMock = okUpstream();
      vi.stubGlobal('fetch', fetchMock);

      const req = new NextRequest('http://localhost/api/absorb/projects/abc');
      const res = await GET(req, { params: Promise.resolve({ path: ['projects', 'abc'] }) });
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('never attaches the service key; forwards only the user credential', async () => {
      const fetchMock = okUpstream();
      vi.stubGlobal('fetch', fetchMock);

      const req = new NextRequest('http://localhost/api/absorb/projects/abc', {
        method: 'POST',
        body: '{}',
        headers: { authorization: 'Bearer user-token' },
      });
      await POST(req, { params: Promise.resolve({ path: ['projects', 'abc'] }) });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const headers = ((fetchMock.mock.calls[0][1] as RequestInit).headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer user-token');
      expect(JSON.stringify(headers)).not.toContain('absorb-key-test');
    });
  });
});