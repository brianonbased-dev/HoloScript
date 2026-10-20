/**
 * P0 (Creator Advocate 2026-10-15): a brand-new account opened /agents/me and
 * saw Studio's own server-key agent ("Founder") as its profile, because
 * agent/[id] ?id=self and surface/profile/self asked /api/holomesh/me under
 * HOLOMESH_API_KEY. A caller with no key of its own must get no_holomesh_agent
 * and NO upstream call may carry the server key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const SERVER_KEY = 'test-server-key-not-real';
const FOUNDER = { success: true, agentId: 'agent_founder', name: 'Founder', wallet: '0xF0' };

type Call = { url: string; auth: string | null };
let calls: Call[] = [];

function mockUpstream() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      const auth = h.get('authorization');
      calls.push({ url: String(url), auth });
      const u = String(url);
      if (u.endsWith('/api/holomesh/me')) {
        if (auth === `Bearer ${SERVER_KEY}`) return Response.json(FOUNDER);
        if (auth === 'Bearer user-key') {
          return Response.json({ success: true, agentId: 'agent_user', name: 'Builder', wallet: null });
        }
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (u.includes('/api/holomesh/profile')) return Response.json({ success: true, profile: {} });
      if (u.includes('/api/holomesh/agents')) {
        return Response.json({
          agents: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `a${i}`, name: `peer${i}`, reputation: i })),
        });
      }
      return Response.json({}, { status: 404 });
    })
  );
}

const req = (url: string, auth?: string) =>
  new NextRequest(url, { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('HOLOMESH_API_KEY', SERVER_KEY);
  mockUpstream();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('agent/self never falls back to the server key', () => {
  it('NC: a new user with no HoloMesh key gets no_holomesh_agent and no founder data', async () => {
    const { GET } = await import('../app/api/holomesh/agent/[id]/route');
    const res = await GET(req('https://studio.test/api/holomesh/agent/self'), {
      params: Promise.resolve({ id: 'self' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('no_holomesh_agent');
    expect(JSON.stringify(body)).not.toMatch(/Founder|agent_founder/);
    expect(calls.some((c) => c.url.endsWith('/api/holomesh/me'))).toBe(false);
    expect(calls.some((c) => c.auth === `Bearer ${SERVER_KEY}`)).toBe(false);
  });

  it('a user with their own key sees their own agent, not Founder, and no fake friends', async () => {
    const { GET } = await import('../app/api/holomesh/agent/[id]/route');
    const res = await GET(req('https://studio.test/api/holomesh/agent/self', 'Bearer user-key'), {
      params: Promise.resolve({ id: 'self' }),
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.agent.name).toBe('Builder');
    expect(body.friendCount).toBe(0);
    expect(calls.filter((c) => c.url.endsWith('/api/holomesh/me'))[0].auth).toBe('Bearer user-key');
  });
});

describe('surface/profile/self never fills in the server-key agent', () => {
  it('NC: a new user gets the bare composition, no Founder, no server-key /me', async () => {
    const { GET } = await import('../app/api/holomesh/surface/[...path]/route');
    const res = await GET(req('https://studio.test/api/holomesh/surface/profile/self'), {
      params: Promise.resolve({ path: ['profile', 'self'] }),
    });
    const text = await res.text();
    expect(text).not.toMatch(/Founder|agent_founder/);
    expect(calls.some((c) => c.url.endsWith('/api/holomesh/me'))).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/api/holomesh/profile'))).toBe(false);
  });
});
