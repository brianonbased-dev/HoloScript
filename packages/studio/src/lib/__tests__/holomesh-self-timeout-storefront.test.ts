/**
 * Self-only HoloMesh helpers (#577) get the same 8s upstream timeout as the
 * fallback helpers (#587), and agent/self/storefront never goes upstream under
 * Studio's server key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const SERVER_KEY = 'test-server-key-not-real';
let calls: { url: string; auth: string | null; signal: unknown }[] = [];

function stubFetch(impl: (url: string) => Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization'), signal: init?.signal });
      return impl(String(url));
    })
  );
}
const timeoutErr = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });
const req = (url: string, auth?: string) =>
  new NextRequest(url, { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('HOLOMESH_API_KEY', SERVER_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Self helpers time out like the fallback helpers', () => {
  it('fetchHoloMeshJsonSelf: timeout -> 504 holomesh_timeout, with an abort signal', async () => {
    stubFetch(async () => { throw timeoutErr(); });
    const { fetchHoloMeshJsonSelf } = await import('../holomesh-proxy');
    const r = await fetchHoloMeshJsonSelf<{ code?: string }>('/api/holomesh/me', req('https://s.test/x', 'Bearer user-key'));
    expect(r?.status).toBe(504);
    expect(r?.ok).toBe(false);
    expect(r?.data?.code).toBe('holomesh_timeout');
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('fetchHoloMeshJsonSelf: unreachable -> 503 holomesh_unavailable', async () => {
    stubFetch(async () => { throw new TypeError('fetch failed'); });
    const { fetchHoloMeshJsonSelf } = await import('../holomesh-proxy');
    const r = await fetchHoloMeshJsonSelf<{ code?: string }>('/api/holomesh/me', req('https://s.test/x', 'Bearer user-key'));
    expect(r?.status).toBe(503);
    expect(r?.data?.code).toBe('holomesh_unavailable');
  });

  it('proxyHoloMeshSelf: timeout -> 504 JSON, unreachable -> 503 JSON', async () => {
    stubFetch(async () => { throw timeoutErr(); });
    let mod = await import('../holomesh-proxy');
    let res = await mod.proxyHoloMeshSelf('/api/holomesh/dashboard', req('https://s.test/x', 'Bearer user-key'));
    expect(res.status).toBe(504);
    expect((await res.json()).code).toBe('holomesh_timeout');
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);

    vi.resetModules();
    stubFetch(async () => { throw new TypeError('fetch failed'); });
    mod = await import('../holomesh-proxy');
    res = await mod.proxyHoloMeshSelf('/api/holomesh/dashboard', req('https://s.test/x', 'Bearer user-key'));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('holomesh_unavailable');
  });

  it('agent/self with a key: upstream timeout surfaces as 504, not a hang or Founder', async () => {
    stubFetch(async () => { throw timeoutErr(); });
    const { GET } = await import('../../app/api/holomesh/agent/[id]/route');
    const res = await GET(req('https://s.test/api/holomesh/agent/self', 'Bearer user-key'), {
      params: Promise.resolve({ id: 'self' }),
    });
    expect(res.status).toBe(504);
    expect(JSON.stringify(await res.json())).not.toMatch(/Founder/);
  });
});

describe('agent/[id]/storefront', () => {
  it('NC: self with no caller key -> 404 no_holomesh_agent, nothing upstream', async () => {
    stubFetch(async () => Response.json({ agentName: 'Founder' }));
    const { GET } = await import('../../app/api/holomesh/agent/[id]/storefront/route');
    for (const id of ['self', 'me']) {
      const res = await GET(req(`https://s.test/api/holomesh/agent/${id}/storefront`), {
        params: Promise.resolve({ id }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe('no_holomesh_agent');
      expect(JSON.stringify(body)).not.toMatch(/Founder/);
    }
    expect(calls).toHaveLength(0);
  });

  it('self with a caller key goes upstream with THAT key only', async () => {
    stubFetch(async () => Response.json({ items: [] }));
    const { GET } = await import('../../app/api/holomesh/agent/[id]/storefront/route');
    await GET(req('https://s.test/api/holomesh/agent/self/storefront', 'Bearer user-key'), {
      params: Promise.resolve({ id: 'self' }),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toBe('Bearer user-key');
  });
});
