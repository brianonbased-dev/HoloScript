/**
 * mcp-server outage 2026-10-15: Studio's HoloMesh pages hung for 30s+ because
 * upstream calls had no timeout and /agent/self waited on two rounds. These
 * tests drive a stand-in upstream that never answers (or refuses) and check
 * that Studio answers quickly with a clean JSON 504/503 instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.HOLOMESH_API_URL = 'https://mesh.test';
  process.env.HOLOMESH_UPSTREAM_TIMEOUT_MS = '60';
});

import {
  fetchHoloMeshJson,
  proxyHoloMesh,
  upstreamFailure,
  holoMeshUpstreamTimeoutMs,
  HOLOMESH_UPSTREAM_TIMEOUT_MS,
} from '../holomesh-proxy';
import { GET as agentGET } from '../../app/api/holomesh/agent/[id]/route';

/** A fetch that only ever settles when its signal aborts. */
function hangingFetch(calls: string[]) {
  return vi.fn((url: string, init?: RequestInit) => {
    calls.push(String(url));
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    });
  });
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('timeout settings', () => {
  it('defaults to 8s and honours HOLOMESH_UPSTREAM_TIMEOUT_MS', () => {
    expect(HOLOMESH_UPSTREAM_TIMEOUT_MS).toBe(8_000);
    expect(holoMeshUpstreamTimeoutMs()).toBe(60);
  });

  it('maps timeouts to 504 and other failures to 503', () => {
    expect(upstreamFailure(new DOMException('t', 'TimeoutError')).status).toBe(504);
    expect(upstreamFailure(new DOMException('a', 'AbortError')).status).toBe(504);
    expect(upstreamFailure(new TypeError('fetch failed')).status).toBe(503);
  });
});

describe('fetchHoloMeshJson', () => {
  it('gives up on a hanging upstream with a 504', async () => {
    globalThis.fetch = hangingFetch([]) as unknown as typeof fetch;
    const t0 = Date.now();
    const r = await fetchHoloMeshJson<{ code?: string }>('/api/holomesh/me');
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(r).toMatchObject({ ok: false, status: 504 });
    expect(r.data?.code).toBe('holomesh_timeout');
  });

  it('answers 503 when the upstream cannot be reached', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const r = await fetchHoloMeshJson<{ code?: string }>('/api/holomesh/me');
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(r.data?.code).toBe('holomesh_unavailable');
  });
});

describe('proxyHoloMesh', () => {
  it('returns JSON 504 instead of hanging', async () => {
    globalThis.fetch = hangingFetch([]) as unknown as typeof fetch;
    const req = new NextRequest('https://studio.test/api/holomesh/teams/leaderboard?limit=20');
    const res = await proxyHoloMesh('/api/holomesh/teams/leaderboard', req);
    expect(res.status).toBe(504);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ success: false, code: 'holomesh_timeout' });
  });

  it('passes a healthy upstream through unchanged', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ entries: [{ name: 'a' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as unknown as typeof fetch;
    const req = new NextRequest('https://studio.test/api/holomesh/teams/leaderboard');
    const res = await proxyHoloMesh('/api/holomesh/teams/leaderboard', req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [{ name: 'a' }] });
  });
});

describe('GET /api/holomesh/agent/self', () => {
  it('asks agents, me and profile in ONE parallel round', async () => {
    const order: string[] = [];
    let inFlight = 0;
    let peak = 0;
    globalThis.fetch = vi.fn(async (url: string) => {
      order.push(String(url));
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      const path = new URL(String(url)).pathname;
      const body =
        path === '/api/holomesh/me'
          ? { success: true, agentId: 'agent-1', name: 'Ada' }
          : path === '/api/holomesh/profile'
            ? { success: true, profile: {} }
            : { agents: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const req = new NextRequest('https://studio.test/api/holomesh/agent/self', {
      headers: { authorization: 'Bearer user-key' },
    });
    const res = await agentGET(req, { params: Promise.resolve({ id: 'self' }) });
    expect(res.status).toBe(200);
    expect(peak).toBe(3);
    expect(order).toHaveLength(3);
    expect((await res.json()).agent).toBeTruthy();
  });

  it('answers 504 fast when HoloMesh hangs (the stuck /agents/me)', async () => {
    globalThis.fetch = hangingFetch([]) as unknown as typeof fetch;
    const req = new NextRequest('https://studio.test/api/holomesh/agent/self');
    const t0 = Date.now();
    const res = await agentGET(req, { params: Promise.resolve({ id: 'self' }) });
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ success: false });
  });
});
