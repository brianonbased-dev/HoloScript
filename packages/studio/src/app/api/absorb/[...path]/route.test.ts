import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ userToken: 'user-token' as string | null }));
vi.mock('@/app/api/github/_shared', () => ({
  getGitHubToken: vi.fn(async () => auth.userToken),
}));

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { DELETE, GET, POST, PUT } from './route';

describe('/api/absorb/[...path] route', () => {
  beforeEach(() => {
    auth.userToken = 'user-token';
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

  it('a by-id Studio request reaches the absorb path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ project: { id: 'abc' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const getReq = new NextRequest('http://localhost/api/absorb/projects/abc');
    const deleteReq = new NextRequest('http://localhost/api/absorb/projects/abc', { method: 'DELETE' });
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

    const req = new NextRequest('http://localhost/api/absorb/any/path');
    const res = await GET(req, { params: Promise.resolve({ path: ['any', 'path'] }) });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
    expect(body.message).toContain('ECONNREFUSED');
    expect(body.hint).toMatch(/ABSORB_SERVICE_URL/i);
  });

  it('an unauthenticated POST to absorb/scan is refused (401) and nothing is forwarded', async () => {
    auth.userToken = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost/api/absorb/absorb/scan', {
      method: 'POST',
      body: JSON.stringify({ path: '/repo' }),
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer forged' },
    });
    const res = await POST(req, { params: Promise.resolve({ path: ['absorb', 'scan'] }) });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('absorb_no_user_credential');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unauthenticated GET is refused (401) and nothing is forwarded', async () => {
    auth.userToken = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(new NextRequest('http://localhost/api/absorb/credits/balance'), {
      params: Promise.resolve({ path: ['credits', 'balance'] }),
    });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a signed-in POST to absorb/scan forwards only the user credential, never the service key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost/api/absorb/absorb/scan', {
      method: 'POST',
      body: JSON.stringify({ path: '/repo' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ path: ['absorb', 'scan'] }) });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://absorb.test/api/absorb/scan');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer user-token');
    expect(headers['X-User-Authorization']).toBeUndefined();
    expect(JSON.stringify(headers)).not.toContain('absorb-key-test');
  });
});
