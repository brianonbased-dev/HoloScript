/**
 * Tests for Studio API routes — auth, absorb proxy, health check.
 *
 * Verifies that route modules export the correct handlers and that
 * the new API routes are structurally correct.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock the server-side auth guards so the dispatch-route regression tests can
// assert it REJECTS unauthenticated / non-founder callers without a real
// NextAuth session. Hoisted by vitest above the dynamic route import below.
vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireFounder: vi.fn(),
}));

describe('Studio API Routes', () => {
  describe('auth config', () => {
    it('exports authOptions with JWT strategy', async () => {
      const { authOptions } = await import('../lib/auth');
      expect(authOptions).toBeDefined();
      expect(authOptions.session?.strategy).toBe('jwt');
    }, 30_000);

    it('has signIn page set to /auth/signin', async () => {
      const { authOptions } = await import('../lib/auth');
      expect(authOptions.pages?.signIn).toBe('/auth/signin');
    });

    it('has session callback', async () => {
      const { authOptions } = await import('../lib/auth');
      expect(authOptions.callbacks?.session).toBeDefined();
    });
  });

  describe('NextAuth route', () => {
    it('exports GET and POST handlers', async () => {
      const route = await import('../app/api/auth/[...nextauth]/route');
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
      expect(typeof route.GET).toBe('function');
      expect(typeof route.POST).toBe('function');
    });
  });

  describe('absorb proxy route', () => {
    it('exports GET, POST, DELETE, PUT handlers', async () => {
      const route = await import('../app/api/absorb/[...path]/route');
      expect(route.GET).toBeDefined();
      expect(route.POST).toBeDefined();
      expect(route.DELETE).toBeDefined();
      expect(route.PUT).toBeDefined();
    });
  });

  describe('health route', () => {
    it('exports GET handler', async () => {
      const route = await import('../app/api/health/route');
      expect(route.GET).toBeDefined();
      expect(typeof route.GET).toBe('function');
    });

    it('returns a Response object', async () => {
      const { GET } = await import('../app/api/health/route');
      const response = await GET();
      expect(response).toBeDefined();
      // NextResponse in vitest may not fully behave like runtime;
      // verify it's a Response-like object with status 200
      expect(response.status).toBe(200);
    });
  });
});

// ─── Regression: fleet dispatch auth guards ─────────────────────────────────────
// POST /api/agents/fleet/dispatch claims board tasks (shared-state mutation) and
// can drive fleet spend; it previously had NO auth guard at all. These tests lock
// in the gate: read floor = authenticated session OR fleet service token; the
// claim/spend path = founder session OR fleet service token; fail-closed.
describe('fleet dispatch auth guards (regression)', () => {
  const ROUTE = '../app/api/agents/fleet/dispatch/route';

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FLEET_DISPATCH_SERVICE_TOKEN;
  });

  it('GET rejects an unauthenticated caller with 401', async () => {
    const { requireAuth } = await import('@/lib/api-auth');
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }) as never
    );
    const { GET } = await import(ROUTE);
    const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('POST rejects a non-founder on the claim/spend path with 403', async () => {
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    // Authenticated (passes the read floor) but NOT the founder.
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    const { POST } = await import(ROUTE);
    // dryRun omitted ⇒ falsy ⇒ the mutation/spend gate fires (before any fetch).
    const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ teamId: 'team_x', maxDispatches: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(vi.mocked(requireFounder)).toHaveBeenCalled();
  });

  it('POST honors a dry-run for an authenticated non-founder (read floor only)', async () => {
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'u1' } } as never);
    // requireFounder would 403, but a dry-run must NOT reach it.
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    const fetchMock = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { POST } = await import(ROUTE);
      const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teamId: 'team_x', dryRun: true }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(vi.mocked(requireFounder)).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('POST dry-run reports required_tags mismatches as unassigned', async () => {
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/board')) {
        return new Response(
          JSON.stringify({
            tasks: [
              {
                id: 'needs-metal',
                title: 'Owned-metal workload',
                status: 'open',
                priority: 'P2',
                required_tags: ['owned-metal'],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/members')) {
        return new Response(
          JSON.stringify({ members: [{ agentId: 'cloud-agent', agentName: 'Cloud Agent' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/presence')) {
        return new Response(
          JSON.stringify({
            online: [
              {
                agentId: 'cloud-agent',
                agentName: 'Cloud Agent',
                capabilityTags: ['cloud-lane'],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/agents/fleet')) {
        return new Response(JSON.stringify({ agents: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { POST } = await import(ROUTE);
      const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teamId: 'team_x', dryRun: true }),
      });
      const res = await POST(req);
      const json = (await res.json()) as { plan: { decisions: unknown[]; unassigned: string[] } };
      expect(res.status).toBe(200);
      expect(json.plan.decisions).toHaveLength(0);
      expect(json.plan.unassigned).toEqual(['needs-metal']);
      expect(vi.mocked(requireFounder)).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('POST accepts the founder-provisioned service token, bypassing the session gate', async () => {
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    // BOTH session guards DENY — only the service token can let this through.
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }) as never
    );
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    process.env.FLEET_DISPATCH_SERVICE_TOKEN = 'svc-secret-123';
    const fetchMock = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { POST } = await import(ROUTE);
      const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-fleet-service-token': 'svc-secret-123',
        },
        body: JSON.stringify({ teamId: 'team_x', maxDispatches: 1, dryRun: false }),
      });
      const res = await POST(req);
      // The service token bypassed BOTH session guards: neither 401 nor 403.
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails closed: an x-fleet-service-token with no env configured is refused', async () => {
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'u1' } } as never);
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    // FLEET_DISPATCH_SERVICE_TOKEN is unset (beforeEach deletes it).
    const { POST } = await import(ROUTE);
    const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fleet-service-token': 'anything',
      },
      body: JSON.stringify({ teamId: 'team_x', dryRun: false }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403); // unset secret never opens the door
  });
});
