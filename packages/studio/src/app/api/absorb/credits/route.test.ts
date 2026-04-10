import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/absorb-client', () => ({
  ABSORB_BASE: 'https://absorb.test',
  ABSORB_API_KEY: 'absorb-key-test',
}));

import { GET, POST } from './route';

describe('/api/absorb/credits route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET returns upstream credits payload when absorb service succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ balance: 4200, tier: 'pro' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(4200);
    expect(body.tier).toBe('pro');
  });

  it('GET falls back to defaults when absorb service is unavailable', async () => {
    const prev = process.env.ABSORB_API_KEY;
    delete process.env.ABSORB_API_KEY;

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(0);
    expect(body.tier).toBe('free');
    expect(body.note).toMatch(/unavailable/i);

    if (prev !== undefined) process.env.ABSORB_API_KEY = prev;
  });

  it('POST returns upstream payload when absorb service succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ checkoutUrl: 'https://pay.example/xyz' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const req = new NextRequest('http://localhost/api/absorb/credits', {
      method: 'POST',
      body: JSON.stringify({ packageId: 'starter' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl).toContain('pay.example');
  });

  it('POST returns 503 when absorb service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    const req = new NextRequest('http://localhost/api/absorb/credits', {
      method: 'POST',
      body: JSON.stringify({ packageId: 'starter' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
  });
});
