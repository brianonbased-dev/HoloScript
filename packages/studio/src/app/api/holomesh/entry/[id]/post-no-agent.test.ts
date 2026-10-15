/**
 * POST /api/holomesh/entry/[id] for a caller with no HoloMesh key of its own
 * must NOT go upstream under Studio's server key (the founder's). It answers
 * 404 { code: 'no_holomesh_agent' }, same as #570/#574, and nothing goes
 * upstream. An X-Payment proof alone is not an identity. Twin: fails before.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/client', () => ({ getDb: () => null }));

afterEach(() => vi.unstubAllGlobals());

const params = { params: Promise.resolve({ id: 'entry1' }) };
const url = 'http://localhost/api/holomesh/entry/entry1';

describe('POST /api/holomesh/entry/[id]', () => {
  it('without a caller key: 404 no_holomesh_agent and nothing upstream', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(new NextRequest(url, { method: 'POST', body: '{}' }), params);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('no_holomesh_agent');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('X-Payment alone is not an identity: still 404, nothing upstream', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(
      new NextRequest(url, { method: 'POST', body: '{}', headers: { 'x-payment': 'proof' } }),
      params
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with the caller own key: forwarded under that key (and its X-Payment)', async () => {
    const fetchMock = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(
      new NextRequest(url, {
        method: 'POST',
        body: '{}',
        headers: { authorization: 'Bearer caller-own-key', 'x-payment': 'proof' },
      }),
      params
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer caller-own-key');
    expect(h['X-Payment']).toBe('proof');
  });
});
