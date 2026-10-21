/**
 * User-scoped HoloMesh routes must not fall back to Studio's server key.
 * Under that key the upstream answers as Studio's service agent ("Founder"),
 * so every signed-in user without a HoloMesh key saw the Founder's dashboard,
 * contribution graph and profile. Twin: these fail on main.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const FOUNDER_ME = { success: true, agentId: 'agent_founder', name: 'Founder', wallet: '0xF0' };

function mockUpstream() {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/holomesh/me')) return new Response(JSON.stringify(FOUNDER_ME), { status: 200 });
    if (u.includes('/api/holomesh/agents')) return new Response(JSON.stringify({ agents: [] }), { status: 200 });
    if (u.includes('/api/holomesh/profile')) return new Response(JSON.stringify({ profile: { bio: 'founder bio' } }), { status: 200 });
    if (u.includes('/dashboard')) return new Response(JSON.stringify({ success: true, agentName: 'Founder', earnings: 999 }), { status: 200 });
    if (u.includes('/contributions')) return new Response(JSON.stringify({ success: true, agentId: 'agent_founder', days: [{ d: '2026-10-14', n: 9 }] }), { status: 200 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const withKey = { headers: { authorization: 'Bearer caller-own-key' } };

describe('user-scoped HoloMesh routes refuse the server-key fallback', () => {
  it('/api/holomesh/dashboard without a caller key: 404 no_holomesh_agent, nothing upstream', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../../dashboard/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/dashboard'));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('no_holomesh_agent');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/api/holomesh/dashboard WITH a caller key still proxies', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../../dashboard/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/dashboard', withKey));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('/api/holomesh/agent/self/contributions without a caller key: 404, nothing upstream', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../self/contributions/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/agent/self/contributions?days=365'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/api/holomesh/agent/self/contributions WITH a caller key still proxies', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../self/contributions/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/agent/self/contributions', withKey));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('/api/holomesh/surface/profile/self without a caller key: no Founder data spliced in', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../../surface/[...path]/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/surface/profile/self'), {
      params: Promise.resolve({ path: ['profile', 'self'] }),
    });
    const body = (await res.json()) as { code?: string };
    expect(res.status).toBe(200);
    expect(body.code ?? '').not.toContain('Founder');
    expect(body.code ?? '').not.toContain('agent_founder');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/api/holomesh/surface/profile/self WITH a caller key is personalised', async () => {
    mockUpstream();
    const { GET } = await import('../../surface/[...path]/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/surface/profile/self', withKey), {
      params: Promise.resolve({ path: ['profile', 'self'] }),
    });
    const body = (await res.json()) as { code?: string; noHoloMeshAgent?: boolean };
    expect(body.noHoloMeshAgent).toBeUndefined();
    expect(body.code ?? '').toContain('agent_founder'); // the caller's own /me (mocked)
  });

  it('/api/holomesh/transactions without a caller key: 404, nothing upstream', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../../transactions/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/transactions?limit=50'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/api/holomesh/agent/self/storefront without a caller key: 404', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../[id]/storefront/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/agent/self/storefront'), {
      params: Promise.resolve({ id: 'self' }),
    });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['team/[id]/join', 'POST', { id: 't1' }],
    ['team/[id]/message', 'POST', { id: 't1' }],
    ['team/[id]/messages', 'GET', { id: 't1' }],
    ['team/[id]/messages/[messageId]/mark-read', 'POST', { id: 't1', messageId: 'm1' }],
  ])('/api/holomesh/%s without a caller key: 404, nothing upstream (acts as the caller, not Founder)', async (route, method, params) => {
    const fetchMock = mockUpstream();
    const mod = (await import(`../../${route}/route`)) as Record<string, (r: NextRequest, c: unknown) => Promise<Response>>;
    const res = await mod[method](new NextRequest('http://localhost/api/holomesh/x', { method }), {
      params: Promise.resolve(params),
    });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
