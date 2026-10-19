/**
 * POST /api/holomesh/entry/[id]/purchase for a caller with no HoloMesh key of
 * its own must NOT buy under Studio's server key (the founder's). It answers
 * 404 { code: 'no_holomesh_agent' } — same contract as #570 — and nothing goes
 * upstream. Twin: fails before this change.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/client', () => ({ getDb: () => null }));

afterEach(() => vi.unstubAllGlobals());

const params = { params: Promise.resolve({ id: 'entry1' }) };

describe('POST /api/holomesh/entry/[id]/purchase without a caller key', () => {
  it('404 no_holomesh_agent and nothing upstream (no X-Payment)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(
      new NextRequest('http://localhost/api/holomesh/entry/entry1/purchase', {
        method: 'POST',
        body: '{}',
      }),
      params
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('no_holomesh_agent');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404 even with an X-Payment proof (proof alone is not an identity)', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{"success":true,"amount":500}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(
      new NextRequest('http://localhost/api/holomesh/entry/entry1/purchase', {
        method: 'POST',
        body: JSON.stringify({ referrerAgentId: 'ref1' }),
        headers: { 'x-payment': 'proof' },
      }),
      params
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with the caller own key: proxied upstream under that key, never the server key', async () => {
    const fetchMock = vi.fn(async () => new Response('{"x402Version":1}', { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(
      new NextRequest('http://localhost/api/holomesh/entry/entry1/purchase', {
        method: 'POST',
        body: '{}',
        headers: { authorization: 'Bearer caller-own-key' },
      }),
      params
    );
    expect(res.status).toBe(402);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer caller-own-key');
  });
});
