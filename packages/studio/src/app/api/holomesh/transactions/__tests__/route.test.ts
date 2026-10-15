/**
 * /api/holomesh/transactions without a caller key must not fall back to
 * Studio's server key (#573 follow-up). Twin: fails before the refuse.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/holomesh/transactions', () => {
  it('without a caller key: 404 no_holomesh_agent and nothing upstream', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ transactions: [{ id: 'founder-tx' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/transactions?limit=50'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('no_holomesh_agent');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with a caller key: proxies upstream as that caller', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, transactions: [{ id: 'mine' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('../route');
    const res = await GET(
      new NextRequest('http://localhost/api/holomesh/transactions', {
        headers: { authorization: 'Bearer caller-own-key' },
      })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { transactions: { id: string }[] }).transactions[0].id).toBe('mine');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer caller-own-key');
  });
});
