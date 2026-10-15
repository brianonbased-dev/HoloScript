/**
 * Creator Advocate audit 2026-10-14, item 3: HoloMesh showed signed-in GitHub
 * users as "Founder". A caller with no HoloMesh key of its own went upstream
 * under Studio's server key, so /api/holomesh/me named the SERVER's agent
 * (the founder key) as "self". "self" must never be answered under that key.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const FOUNDER_ME = { success: true, agentId: 'agent_founder', name: 'Founder', wallet: '0x01' };

function mockUpstream() {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/holomesh/me')) return new Response(JSON.stringify(FOUNDER_ME), { status: 200 });
    if (u.includes('/api/holomesh/agents')) return new Response(JSON.stringify({ agents: [] }), { status: 200 });
    if (u.includes('/api/holomesh/feed')) {
      return new Response(JSON.stringify({ entries: [{ id: 'k1', authorId: 'agent_founder', authorName: 'Founder', content: 'x' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('HoloMesh "self" never resolves to the server key (audit item 3)', () => {
  it('/api/holomesh/agent/self without a caller key: no agent, and /me is not asked', async () => {
    const fetchMock = mockUpstream();
    const { GET } = await import('../[id]/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/agent/self'), {
      params: Promise.resolve({ id: 'self' }),
    });
    const body = (await res.json()) as { success: boolean; code?: string; agent?: { name?: string } };
    expect(body.success).toBe(false);
    expect(body.code).toBe('no_holomesh_agent');
    expect(res.status).toBe(404);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/holomesh/me'))).toBe(false);
  });

  it('/api/holomesh/agent/self WITH a caller key still resolves that caller', async () => {
    mockUpstream();
    const { GET } = await import('../[id]/route');
    const res = await GET(
      new NextRequest('http://localhost/api/holomesh/agent/self', { headers: { authorization: 'Bearer caller-key' } }),
      { params: Promise.resolve({ id: 'self' }) }
    );
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('/api/holomesh/agent/self/knowledge without a caller key: no entries (not the founder\'s)', async () => {
    mockUpstream();
    const { GET } = await import('../self/knowledge/route');
    const res = await GET(new NextRequest('http://localhost/api/holomesh/agent/self/knowledge?limit=30'));
    const body = (await res.json()) as { entries: unknown[] };
    expect(body.entries).toEqual([]);
  });
});