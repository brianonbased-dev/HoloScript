import { describe, it, expect, vi } from 'vitest';
import { HolomeshClient, pickClaimableTask } from '../holomesh-client.js';
import type { BoardTask } from '../types.js';

describe('pickClaimableTask', () => {
  const tasks: BoardTask[] = [
    {
      id: 't1',
      title: 'unrelated UI tweak',
      description: '',
      priority: 'low',
      tags: ['ui', 'cosmetic'],
      status: 'open',
    },
    {
      id: 't2',
      title: 'cross-paper threat-model memo',
      description: 'security G10',
      priority: 'high',
      tags: ['security', 'paper-21', 'gap-G10'],
      status: 'open',
    },
    {
      id: 't3',
      title: 'closed task',
      description: '',
      priority: 'high',
      tags: ['security'],
      status: 'done',
    },
    {
      id: 't4',
      title: 'already-claimed by someone',
      description: '',
      priority: 'high',
      tags: ['security'],
      status: 'open',
      claimedBy: 'someone-else',
    },
    {
      id: 't5',
      title: 'Sybil attack spec',
      description: 'adversarial',
      priority: 'medium',
      tags: ['adversarial-evaluation'],
      status: 'open',
    },
  ];

  it('selects the highest-scoring open unclaimed task whose tags match the brain', () => {
    const picked = pickClaimableTask(tasks, ['security', 'paper-21', 'threat-model']);
    expect(picked?.id).toBe('t2');
  });

  it('falls through to text-match when tag overlap is empty', () => {
    const picked = pickClaimableTask(tasks, ['adversarial-evaluation']);
    expect(picked?.id).toBe('t5');
  });

  it('returns undefined when nothing matches (so runner can heartbeat-only)', () => {
    expect(pickClaimableTask(tasks, ['ml-systems', 'graphics'])).toBeUndefined();
  });

  it('skips done and already-claimed tasks even on perfect tag match', () => {
    const onlyClaimedOrDone = tasks.filter((t) => t.status === 'done' || t.claimedBy);
    expect(pickClaimableTask(onlyClaimedOrDone, ['security'])).toBeUndefined();
  });
});

describe('HolomeshClient', () => {
  it('sends bearer + content-type on every request and parses JSON', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }
    ) as unknown as typeof fetch;

    const client = new HolomeshClient({
      apiBase: 'https://mcp.holoscript.net/api/holomesh',
      bearer: 'fake-bearer',
      teamId: 'team_test',
      fetchImpl,
    });
    await client.getOpenTasks();

    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    // HoloMesh REST resolveRequestingAgent only accepts `Authorization: Bearer`.
    // x-mcp-api-key is the orchestrator-side header convention and produces
    // HTTP 401 against mcp.holoscript.net/api/holomesh/* — see W.087 vertex B
    // audit (task_1777073751812_jqye, 2026-04-24).
    expect(headers['Authorization']).toBe('Bearer fake-bearer');
    expect(headers['x-mcp-api-key']).toBeUndefined();
    expect(calls[0].url).toContain('/team/team_test/board');
  });

  it('throws with status + truncated body on non-2xx (W.085 silent-failure prevention)', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('forbidden: bad bearer', { status: 403 })) as unknown as typeof fetch;
    const client = new HolomeshClient({
      apiBase: 'https://x',
      bearer: 'b',
      teamId: 't',
      fetchImpl,
    });
    await expect(client.getOpenTasks()).rejects.toThrow(/403/);
  });

  it('writePrivateKnowledge POSTs {entries} to /knowledge/private and returns true (the recall write-loop)', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }) as unknown as typeof fetch;
    const client = new HolomeshClient({
      apiBase: 'https://x/api/holomesh',
      bearer: 'b',
      teamId: 't',
      fetchImpl,
    });

    const ok = await client.writePrivateKnowledge([
      { content: 'Task X done. Outcome: Y', type: 'task-outcome' },
    ]);
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toContain('/knowledge/private');
    expect(JSON.parse(calls[0].init.body as string).entries[0].content).toContain('Outcome: Y');
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe('Bearer b');
  });

  it('writePrivateKnowledge returns false (never throws) on a failed write — a write miss must not break the tick', async () => {
    const fetchImpl: typeof fetch = (async () =>
      new Response('server error', { status: 500 })) as unknown as typeof fetch;
    const client = new HolomeshClient({
      apiBase: 'https://x',
      bearer: 'b',
      teamId: 't',
      fetchImpl,
    });
    await expect(client.writePrivateKnowledge([{ content: 'x' }])).resolves.toBe(false);
  });

  it('writePrivateKnowledge returns false and makes no request for an empty batch', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 201 })
    ) as unknown as typeof fetch;
    const client = new HolomeshClient({
      apiBase: 'https://x',
      bearer: 'b',
      teamId: 't',
      fetchImpl,
    });
    await expect(client.writePrivateKnowledge([])).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // Regression coverage for task_1783013704199_nomp (2026-07-02): the live
  // presence handler (packages/mcp-server/src/holomesh/routes/board-routes.ts
  // POST .../presence, and the holomesh_heartbeat MCP tool's handleHeartbeat)
  // both read `capability_tags` (snake_case) off the request body into
  // TeamPresenceEntry.capabilityTags. Before this fix, heartbeat() sent only
  // `capabilityTags` (camelCase) — the value was silently dropped server-side
  // on every real deployment, so a Jetson agent's declared brain tags never
  // reached presence, and required_tags claim-gating always saw an empty
  // array (reproduced live: agent_capability_tags:[] on every 403
  // capability_mismatch, jetson-orin-super/fara spinning ~once/minute).
  describe('heartbeat capability tag relay (regression: task_1783013704199_nomp)', () => {
    it('sends capability_tags (snake_case) — the field the live server actually reads', async () => {
      const calls: Array<{ url: string; body: unknown }> = [];
      const fetchImpl: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as unknown as typeof fetch;
      const client = new HolomeshClient({
        apiBase: 'https://mcp.holoscript.net/api/holomesh',
        bearer: 'b',
        teamId: 't',
        fetchImpl,
      });

      await client.heartbeat({
        agentName: 'jetson-orin-super',
        surface: 'jetson',
        capabilityTags: [
          'local-inference',
          'edge',
          'cael-trace',
          'holoscript-native',
          'hardware-receipt',
        ],
      });

      expect(calls).toHaveLength(1);
      const sentBody = calls[0].body as Record<string, unknown>;
      // This is the assertion that would have FAILED before the fix: the
      // pre-fix client never set `capability_tags` at all, so a server that
      // only reads that key (the actual live contract) always saw undefined.
      expect(sentBody.capability_tags).toEqual([
        'local-inference',
        'edge',
        'cael-trace',
        'holoscript-native',
        'hardware-receipt',
      ]);
      // Backward-compat: the historical camelCase key is still present too,
      // so any consumer that predates this fix and reads the old shape keeps
      // working during rollout.
      expect(sentBody.capabilityTags).toEqual(sentBody.capability_tags);
    });

    it('omits both capability_tags keys entirely when no tags are declared (no spurious null/undefined field)', async () => {
      const calls: Array<{ body: unknown }> = [];
      const fetchImpl: typeof fetch = (async (_url, init?: RequestInit) => {
        calls.push({ body: init?.body ? JSON.parse(init.body as string) : undefined });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }) as unknown as typeof fetch;
      const client = new HolomeshClient({
        apiBase: 'https://x/api/holomesh',
        bearer: 'b',
        teamId: 't',
        fetchImpl,
      });

      await client.heartbeat({ agentName: 'brittney', surface: 'laptop' });

      const sentBody = calls[0].body as Record<string, unknown>;
      expect('capability_tags' in sentBody).toBe(false);
      expect('capabilityTags' in sentBody).toBe(false);
    });
  });

  describe('frame declaration MCP auto-intercept', () => {
    it('attaches the active brain frame as MCP metadata with no call-site boilerplate', async () => {
      const calls: Array<{ body: Record<string, unknown> }> = [];
      const fetchImpl: typeof fetch = (async (_url, init?: RequestInit) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({ result: { content: [{ type: 'text', text: 'ok' }] } }),
          { status: 200 }
        );
      }) as unknown as typeof fetch;

      const client = new HolomeshClient({
        apiBase: 'https://mcp.holoscript.net/api/holomesh',
        bearer: 'b',
        teamId: 't',
        fetchImpl,
        frameDeclaration: {
          domain: 'holoscript-language',
          horizon: '2026-07',
          capability_tier: 2,
          trust_tier: 2,
          allowed_tools: ['validate_holoscript'],
          denied_domains: ['finance'],
        },
      });

      await expect(
        client.invokeTool('validate_holoscript', { code: '#version 6.0.0' })
      ).resolves.toEqual({ ok: true, text: 'ok' });

      const params = calls[0].body.params as Record<string, unknown>;
      expect(params._meta).toEqual({
        'holoscript.dev/frame-declaration': {
          domain: 'holoscript-language',
          horizon: '2026-07',
          capability_tier: 2,
          trust_tier: 2,
          allowed_tools: ['validate_holoscript'],
          denied_domains: ['finance'],
        },
      });
      expect(params.arguments).toEqual({ code: '#version 6.0.0' });
    });

    it('omits frame metadata for legacy clients without a declared frame', async () => {
      const calls: Array<{ body: Record<string, unknown> }> = [];
      const fetchImpl: typeof fetch = (async (_url, init?: RequestInit) => {
        calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return new Response(JSON.stringify({ result: { content: [] } }), { status: 200 });
      }) as unknown as typeof fetch;
      const client = new HolomeshClient({
        apiBase: 'https://mcp.holoscript.net/api/holomesh',
        bearer: 'b',
        teamId: 't',
        fetchImpl,
      });

      await client.invokeTool('parse_hs', {});
      const params = calls[0].body.params as Record<string, unknown>;
      expect(params._meta).toBeUndefined();
    });
  });
});
