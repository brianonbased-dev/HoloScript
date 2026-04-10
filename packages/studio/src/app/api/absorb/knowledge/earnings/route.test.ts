import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  MCP_SERVER_URL: 'https://mcp.test',
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { GET } from './route';

describe('/api/absorb/knowledge/earnings route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns parsed MCP tool JSON payload when MCP call succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ wallet_address: '0xabc', total_revenue_cents: 1234 }),
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xabc');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet_address).toBe('0xabc');
    expect(body.total_revenue_cents).toBe(1234);
  });

  it('returns text wrapper when MCP tool returns non-JSON text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: { content: [{ type: 'text', text: 'plain-text-response' }] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('plain-text-response');
  });

  it('falls back to absorb REST endpoint when MCP path fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('mcp down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ wallet_address: '0xdef', total_revenue_cents: 99 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    vi.stubGlobal('fetch', fetchMock);

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xdef');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet_address).toBe('0xdef');
    expect(body.total_revenue_cents).toBe(99);

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/knowledge/earnings?wallet=0xdef');
  });

  it('returns default earnings payload when both MCP and REST paths fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('all down')));

    const req = new NextRequest('http://localhost/api/absorb/knowledge/earnings?wallet=0xzzz');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet_address).toBe('0xzzz');
    expect(body.total_revenue_cents).toBe(0);
    expect(body.total_revenue_usd).toBe('$0.00');
    expect(body.note).toMatch(/unavailable/i);
  });
});
