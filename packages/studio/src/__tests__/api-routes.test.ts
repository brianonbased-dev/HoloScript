/**
 * Tests for Studio API routes — auth, absorb proxy, health check.
 *
 * Verifies that route modules export the correct handlers and that
 * the new API routes are structurally correct.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock the server-side auth guards so the dispatch-route regression tests can
// assert it REJECTS unauthenticated / non-founder callers without a real
// NextAuth session. Hoisted by vitest above the dynamic route import below.
vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireFounder: vi.fn(),
}));

// The fleet executor reaches a model through this. Stubbed for the whole file so
// that no test here can ever make a real, paid model call, even one that (by a
// regression) lets the executor run — and so a test can assert it was never
// reached. Each test that needs an answer from it programs one.
vi.mock('@/lib/brittney/provider', () => ({
  resolveBrittneyProviderAsync: vi.fn(),
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
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
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
      async () =>
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
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

  it('refuses a wrong x-fleet-service-token when one is configured', async () => {
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }) as never
    );
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    process.env.FLEET_DISPATCH_SERVICE_TOKEN = 'svc-secret-123';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { POST } = await import(ROUTE);
      // One character off, one short, one long: none may pass for the token.
      for (const presented of ['svc-secret-124', 'svc-secret-12', 'svc-secret-1234']) {
        const req = new NextRequest('http://studio.test/api/agents/fleet/dispatch', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-fleet-service-token': presented },
          body: JSON.stringify({ teamId: 'team_x', dryRun: false }),
        });
        const res = await POST(req);
        // No session either, so the route's session floor answers first (401).
        expect.soft([401, 403], presented).toContain(res.status);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// The /api gate admits POST /api/agents/fleet/scheduler-tick on the presence of
// an x-fleet-service-token (lib/api-public-paths.ts), because this route hands
// the header to the dispatch handler, which judges it. These pin that the tick
// really does forward it to that judge rather than acting on it itself, and that
// the tick carries ONLY what a cron needs: the token opens the door, it does not
// let its holder write the settings behind it.
describe('fleet scheduler tick hands its caller to the dispatch guard', () => {
  const TICK = '../app/api/agents/fleet/scheduler-tick/route';
  const DISPATCH = '../app/api/agents/fleet/dispatch/route';
  const TOKEN = 'svc-secret-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.FLEET_DISPATCH_SERVICE_TOKEN;
    const { requireAuth, requireFounder } = await import('@/lib/api-auth');
    // No session of any kind: only the service token can get a tick through.
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }) as never
    );
    vi.mocked(requireFounder).mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 }) as never
    );
    // The executor reaches a model through this. It is a stub for the whole file,
    // so a test that (wrongly) lets the executor run still cannot make a real,
    // paid call — and can assert that nothing reached it.
    const { resolveBrittneyProviderAsync } = await import('@/lib/brittney/provider');
    vi.mocked(resolveBrittneyProviderAsync).mockResolvedValue({
      provider: {
        streamCompletion: async function* () {
          yield { type: 'text_delta', text: 'executed' };
        },
      },
      model: 'test-model',
      maxTokens: 1024,
      providerName: 'ollama',
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function post(
    route: 'scheduler-tick' | 'dispatch',
    headers: Record<string, string>,
    body: unknown
  ) {
    return new NextRequest(`http://studio.test/api/agents/fleet/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  function tick(headers: Record<string, string>, body: unknown = { maxDispatches: 1 }) {
    return post('scheduler-tick', headers, body);
  }

  /**
   * The HoloMesh side, stubbed: `tasks` open tasks (task-1..n) and `agents` idle,
   * online agents (agent-1..n). Every call is recorded so a test can say where
   * the tick went and what it sent, not just what came back.
   */
  function upstream(options: { tasks?: number; agents?: number } = {}) {
    const { tasks = 1, agents = 1 } = options;
    const calls: Array<{ method: string; url: string; body: string }> = [];
    const ok = (value: unknown) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const ids = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ method, url, body: String(init?.body ?? '') });
      // Claims, agent status and closing a task are all PATCHes.
      if (method !== 'GET') return ok({});
      if (/\/team\/[^/]+\/board$/.test(url)) {
        return ok({
          tasks: ids('task', tasks).map((id) => ({
            id,
            title: 'Tidy the board',
            status: 'open',
            priority: 'P2',
          })),
        });
      }
      if (/\/team\/[^/]+\/members$/.test(url)) {
        return ok({ members: ids('agent', agents).map((agentId) => ({ agentId, online: true })) });
      }
      if (/\/team\/[^/]+\/presence$/.test(url)) {
        return ok({ online: ids('agent', agents).map((agentId) => ({ agentId })) });
      }
      if (url.endsWith('/agents/fleet')) return ok({ agents: [] });
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, calls };
  }

  it('is refused by the dispatch guard with a wrong token, a bare Bearer, or nothing', async () => {
    vi.stubEnv('FLEET_DISPATCH_SERVICE_TOKEN', TOKEN);
    const { fetchMock } = upstream();
    const { POST } = await import(TICK);
    for (const headers of [
      { 'x-fleet-service-token': 'not-the-token' },
      { authorization: 'Bearer any-mesh-key' },
      {},
    ]) {
      const res = await POST(tick(headers));
      // Refused by the dispatch handler's own guards: its session floor (401)
      // answers first, since no caller here has a session.
      expect.soft([401, 403], JSON.stringify(headers)).toContain(res.status);
    }
    // Refused before the board was read or anything was claimed.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is refused with the right header when the service token is not configured', async () => {
    const { fetchMock } = upstream();
    const { POST } = await import(TICK);
    const res = await POST(tick({ 'x-fleet-service-token': TOKEN }));
    expect([401, 403]).toContain(res.status);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses everything when the service token is configured but EMPTY', async () => {
    // `FLEET_DISPATCH_SERVICE_TOKEN=` in a .env file is a provisioning slip, not
    // a credential. An empty secret must match nothing — above all not an empty
    // header, which a signed-in user who is not the founder could send straight
    // to the dispatch route to get past its founder gate.
    vi.stubEnv('FLEET_DISPATCH_SERVICE_TOKEN', '');
    const { fetchMock } = upstream();
    const { requireAuth } = await import('@/lib/api-auth');
    const tickRoute = await import(TICK);
    const dispatchRoute = await import(DISPATCH);

    const callers = [
      ['signed out', NextResponse.json({ error: 'Authentication required' }, { status: 401 })],
      ['signed in, not the founder', { user: { id: 'u1' } }],
    ] as const;

    for (const [who, session] of callers) {
      vi.mocked(requireAuth).mockResolvedValue(session as never);
      for (const headers of [
        { 'x-fleet-service-token': '' },
        { 'x-fleet-service-token': '   ' },
        { 'x-fleet-service-token': 'anything' },
        {},
      ]) {
        const attempts = [
          ['tick', tickRoute.POST(tick(headers))],
          ['dispatch', dispatchRoute.POST(post('dispatch', headers, { maxDispatches: 1 }))],
        ] as const;
        for (const [route, attempt] of attempts) {
          const res = await attempt;
          expect
            .soft([401, 403], `${who}, ${route}, ${JSON.stringify(headers)}`)
            .toContain(res.status);
        }
      }
    }
    // Nothing was read and nothing was claimed, for anyone.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('what a token holder gets from a tick', () => {
    const CAP = 50;

    beforeEach(() => {
      vi.stubEnv('FLEET_DISPATCH_SERVICE_TOKEN', TOKEN);
      // The operator's settings. A request must not be able to move any of them.
      vi.stubEnv('FLEET_DAILY_SPEND_CAP_USD', String(CAP));
      vi.stubEnv('FLEET_EXECUTOR_ENABLED', 'false');
    });

    it('gets through with the configured service token, and the tick really runs', async () => {
      const { calls } = upstream();
      const { POST } = await import(TICK);
      const res = await POST(tick({ 'x-fleet-service-token': TOKEN }));

      // Not merely "not refused": a 502 or a 500 would also be not-401. The
      // tick answered 200, said it was a tick, and did the tick's work.
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ tick: true, dryRun: false, executorEnabled: false });
      expect(json.dispatched).toEqual([
        expect.objectContaining({ taskId: 'task-1', agentId: 'agent-1', success: true }),
      ]);
      expect(json.spend.capUsd).toBe(CAP);
      expect(json).not.toHaveProperty('ignoredParams');
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          url: expect.stringMatching(/\/board\/task-1$/),
          body: expect.stringContaining('"action":"claim"'),
        })
      );
    });

    // The reviewer's reproduction of PR #445, with the real handlers and only
    // the network stubbed: a caller holding nothing but the token sent these
    // and got its own spend cap, the executor, and another team's board — all
    // under the server's mesh key. Each row is what the tick must NOT hand over.
    const HOSTILE: Array<[string, Record<string, unknown>]> = [
      ['a spend cap of its own', { capUsd: 1e9 }],
      ['the executor switched on', { executeAfterClaim: true }],
      ['another team', { teamId: 'team_someone_else' }],
      ['all three at once', { teamId: 'team_someone_else', capUsd: 1e9, executeAfterClaim: true }],
    ];

    it.each(HOSTILE)('does not give a token holder %s', async (label, hostile) => {
      const { calls } = upstream();
      const { resolveBrittneyProviderAsync } = await import('@/lib/brittney/provider');
      const { POST } = await import(TICK);

      // What a tick does when asked for nothing out of the ordinary…
      const plain = await (await POST(tick({ 'x-fleet-service-token': TOKEN }))).json();
      // …is what it must do when asked for more.
      const res = await POST(
        tick({ 'x-fleet-service-token': TOKEN }, { maxDispatches: 1, ...hostile })
      );
      expect(res.status, label).toBe(200);
      const json = await res.json();

      // The team is the configured one, and the response says so.
      expect.soft(json.teamId, `${label}: team worked`).toBe(plain.teamId);
      expect.soft(json.teamId, `${label}: team worked`).not.toBe('team_someone_else');
      expect
        .soft(
          calls.filter((call) => call.url.includes('team_someone_else')),
          `${label}: calls aimed at the team it named`
        )
        .toEqual([]);
      // The cap is the operator's.
      expect.soft(json.spend.capUsd, `${label}: daily cap`).toBe(CAP);
      // The executor stayed at its env default (off): no agent was activated, no
      // task was closed on a model's say-so, no model was reached.
      expect.soft(json.executorEnabled, `${label}: executor`).toBe(false);
      expect
        .soft(resolveBrittneyProviderAsync, `${label}: a model was reached`)
        .not.toHaveBeenCalled();
      expect
        .soft(
          calls.filter(
            (call) => call.method === 'PATCH' && /\/agents\/fleet\/agent-1$/.test(call.url)
          ),
          `${label}: agent activated`
        )
        .toEqual([]);
      expect
        .soft(
          calls.filter((call) => call.method === 'PATCH' && call.body.includes('"action":"done"')),
          `${label}: task closed on a model's say-so`
        )
        .toEqual([]);
      // It still did the tick's own work, so the checks above are not vacuous.
      expect.soft(json.dispatched?.[0]?.success, `${label}: claimed`).toBe(true);
      // And it says what it did not take from the request.
      expect
        .soft([...(json.ignoredParams ?? [])].sort(), `${label}: dropped fields named`)
        .toEqual(Object.keys(hostile).sort());
    });

    it('still carries what a tick needs: dryRun previews, maxDispatches bounds the batch', async () => {
      const { calls } = upstream({ tasks: 2, agents: 2 });
      const { POST } = await import(TICK);
      const headers = { 'x-fleet-service-token': TOKEN };

      // A preview claims nothing. A tick that dropped dryRun would claim here.
      const preview = await (await POST(tick(headers, { dryRun: true }))).json();
      expect(preview).toMatchObject({ tick: true, dryRun: true });
      expect(preview.plan.decisions).toHaveLength(1);
      expect(calls.filter((call) => call.method === 'PATCH')).toEqual([]);

      // Two tasks, two agents: the batch size is the caller's to ask for.
      const two = await (await POST(tick(headers, { maxDispatches: 2 }))).json();
      expect(two.dispatched).toHaveLength(2);
      const one = await (await POST(tick(headers, { maxDispatches: 1 }))).json();
      expect(one.dispatched).toHaveLength(1);
    });
  });
});
