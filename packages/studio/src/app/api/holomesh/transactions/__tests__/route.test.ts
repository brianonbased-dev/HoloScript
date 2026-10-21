/**
 * /api/holomesh/transactions without a caller key must not fall back to
 * Studio's server key (#573 follow-up). Twin: fails before the refuse.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// The local holomesh_transactions cache is the SERVER key's ledger (filled by
// /transactions/sync). Make it available so a route that reads it would leak.
const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock('../../../../../db/client', () => ({ getDb: getDbMock }));

function serverKeyCacheDb() {
  const rows = [{ id: 'server-key-cache-tx', amount: 999 }];
  const chain = {
    select: () => chain,
    from: () => chain,
    orderBy: () => chain,
    limit: async () => rows,
  };
  return chain;
}

afterEach(() => {
  vi.unstubAllGlobals();
  getDbMock.mockReset();
});

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

  it('SECURITY: a caller with its own key never sees the server-key transactions cache', async () => {
    getDbMock.mockReturnValue(serverKeyCacheDb());
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, transactions: [{ id: 'mine' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('../route');
    const res = await GET(
      new NextRequest('http://localhost/api/holomesh/transactions?limit=50', {
        headers: { authorization: 'Bearer caller-own-key' },
      })
    );
    const body = (await res.json()) as { transactions: { id: string }[]; source?: string };
    expect(body.source).not.toBe('db');
    expect(body.transactions.map((t) => t.id)).not.toContain('server-key-cache-tx');
    expect(body.transactions.map((t) => t.id)).toEqual(['mine']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unreachable', () => Promise.reject(new TypeError('fetch failed')), 503, 'holomesh_unavailable'],
    ['timed out', () => Promise.reject(new DOMException('timeout', 'TimeoutError')), 504, 'holomesh_timeout'],
  ])('SECURITY: upstream %s with the cache populated: %i, never the cache', async (_l, fail, status, code) => {
    getDbMock.mockReturnValue(serverKeyCacheDb());
    const fetchMock = vi.fn(fail);
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('../route');
    const res = await GET(
      new NextRequest('http://localhost/api/holomesh/transactions?limit=50', {
        headers: { authorization: 'Bearer caller-own-key' },
      })
    );
    expect(res.status).toBe(status);
    const text = await res.text();
    expect(text).not.toContain('server-key-cache-tx');
    const body = JSON.parse(text) as { code: string; source?: string; transactions?: unknown };
    expect(body.code).toBe(code);
    expect(body.source).toBeUndefined();
    expect(body.transactions).toBeUndefined();
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
