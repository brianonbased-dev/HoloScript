/**
 * Hand-off fix (2026-10-07) — hw-handoff/holoscript-agent-handoff-fix-proposal-20261005.md
 *   (i)   releaseTask(id, reason): reason message, then reopen
 *   (ii)  7-day per-task failure denylist persisted to disk
 *   (iii) release on first failure (no-artifact gate, failure-artifact, execution errors)
 *   (iv)  claim-cap backoff for 403 claim_cap_exceeded + held-claims pre-check
 *   (v)   pre-claim fit check vs /props n_ctx (60%), 90% pre-send prompt guard, route tags
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '@holoscript/llm-provider';
import { CostGuard } from '../cost-guard.js';
import { AgentRunner } from '../runner.js';
import { HolomeshClient } from '../holomesh-client.js';
import {
  TaskDenylist,
  assessTaskFit,
  buildTaskPrompt,
  capText,
  classifyExecutionError,
  ContextOverflowError,
  DEFAULT_FAILURE_COOLDOWN_MS,
  estimateTokens,
  fetchLocalFit,
  isClaimCapExceededError,
  promptCaps,
  propsUrlFor,
  routeTagFor,
} from '../handoff.js';
import type { AgentIdentity, BoardTask, RuntimeBrainConfig } from '../types.js';

const IDENTITY: AgentIdentity = {
  handle: 'jetson-orin-brittney',
  surface: 'jetson',
  wallet: '0x346126AbCdEf0123456789abcdef0123456789AB',
  x402Bearer: 'fake-bearer',
  llmProvider: 'local-llm' as never,
  llmModel: 'qwen3-4b-brittney',
  brainPath: '/tmp/brain.hsplus',
  budgetUsdPerDay: 5,
  teamId: 'team_test',
  meshApiBase: 'https://mcp.holoscript.net/api/holomesh',
};

const BRAIN: RuntimeBrainConfig = {
  brainPath: '/tmp/brain.hsplus',
  systemPrompt: 'You are an edge agent.',
  capabilityTags: ['jetson', 'edge'],
  domain: 'edge',
  scopeTier: 'warm',
  // local-llm → resolveActiveTools sends only write_file (~550 chars of schema).
  // Without it the full 10-tool set is ~7.4k chars (~2.1k tok) and nothing fits 60% of 4096.
  requires: ['local-llm'],
  prefers: [],
  avoids: [],
};

function task(id: string, extra: Partial<BoardTask> = {}): BoardTask {
  return {
    id,
    title: `jetson edge task ${id}`,
    description: 'small edge job',
    priority: 'high',
    tags: ['jetson'],
    status: 'open',
    ...extra,
  };
}

function guard(): CostGuard {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-'));
  return new CostGuard({ statePath: join(dir, 's.json'), dailyBudgetUsd: 5, pricer: () => 0 });
}

/** tools: [] → pure text (no-artifact); ['bash'] → productive; throwErr → provider throws. */
function provider(
  opts: { tools?: string[]; content?: string; throwErr?: Error } = {}
): ILLMProvider {
  const tools = opts.tools ?? ['bash'];
  const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
  return {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      if (opts.throwErr) throw opts.throwErr;
      if (tools.length && (req.messages?.length ?? 0) <= 2) {
        const uses = tools.map((name, i) => ({
          type: 'tool_use' as const,
          id: `tu-${i}`,
          name,
          input: name === 'bash' ? { cmd: 'vitest run --no-coverage' } : { path: '/tmp/x' },
        }));
        return {
          content: '',
          usage,
          model: 'mock-1',
          provider: 'mock',
          finishReason: 'tool_use',
          toolUses: uses,
          assistantBlocks: uses,
        } as unknown as LLMCompletionResponse;
      }
      return {
        content: opts.content ?? 'done',
        usage,
        model: 'mock-1',
        provider: 'mock',
        finishReason: 'stop',
      };
    },
    async generateHoloScript() {
      throw new Error('not used');
    },
    async healthCheck() {
      return { ok: true, latencyMs: 1 };
    },
  };
}

function mesh(
  tasks: BoardTask[],
  opts: { claimImpl?: (id: string) => Promise<BoardTask>; agentId?: string } = {}
) {
  return {
    heartbeat: vi.fn(async () => undefined),
    joinTeam: vi.fn(async () => ({ success: true })),
    getOpenTasks: vi.fn(async () => tasks),
    claim: vi.fn(opts.claimImpl ?? (async (id: string) => tasks.find((t) => t.id === id)!)),
    releaseTask: vi.fn(async () => ({ messaged: true })),
    updateTask: vi.fn(async () => {
      throw new Error('HoloMesh PATCH /team/x/board/y 403: {"error":"Permission denied"}');
    }),
    blockTask: vi.fn(async () => undefined),
    sendMessageOnTask: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    postAuditRecords: vi.fn(async () => ({ appended: 1, rejected: 0 })),
    whoAmI: vi.fn(async () => ({ agentId: opts.agentId ?? 'agent_self', surface: 'jetson' })),
    queryTeamKnowledge: vi.fn(async () => []),
    queryPrivateKnowledge: vi.fn(async () => []),
    writePrivateKnowledge: vi.fn(async () => true),
    queryPresence: vi.fn(async () => []),
    addTasks: vi.fn(async () => ({ added: 0 })),
    invokeTool: vi.fn(async () => ({ ok: true, text: '' })),
  };
}

function runner(
  m: ReturnType<typeof mesh>,
  opts: {
    p?: ILLMProvider;
    denylist?: TaskDenylist;
    nCtx?: number | null;
    events?: Array<Record<string, unknown>>;
  } = {}
) {
  return new AgentRunner({
    identity: IDENTITY,
    brain: BRAIN,
    provider: opts.p ?? provider(),
    costGuard: guard(),
    mesh: m as never,
    denylist: opts.denylist,
    localFit:
      opts.nCtx === null
        ? async () => null
        : async () => ({ nCtx: opts.nCtx ?? 4096, source: 'props' as const }),
    logger: opts.events ? (e) => opts.events!.push(e) : undefined,
  });
}

afterEach(() => {
  delete process.env.HOLOSCRIPT_AGENT_CLAIM_CAP;
  delete process.env.HOLOSCRIPT_AGENT_FAILURE_COOLDOWN_MS;
});

// ─── (i) releaseTask ────────────────────────────────────────────────────────
describe('(i) HolomeshClient.releaseTask', () => {
  function client(fetchImpl: typeof fetch) {
    return new HolomeshClient({
      apiBase: 'https://mesh.test/api/holomesh',
      bearer: 'b',
      teamId: 'T',
      fetchImpl,
    });
  }
  it('posts a [release] reason message on the task, THEN reopens it', async () => {
    const calls: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: 200 });
    });
    const r = await client(f as never).releaseTask('task_1', 'ctx_overflow: 9063>4096');
    expect(r.messaged).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://mesh.test/api/holomesh/team/T/message',
    });
    expect(calls[0].body).toMatchObject({
      subject: 'task:task_1',
      content: '[release] ctx_overflow: 9063>4096',
    });
    expect(calls[1]).toMatchObject({
      method: 'PATCH',
      url: 'https://mesh.test/api/holomesh/team/T/board/task_1',
    });
    expect(calls[1].body).toEqual({ action: 'reopen' });
  });
  it('still reopens when the reason message fails; the reopen error propagates', async () => {
    const f1 = vi.fn(async (url: string) =>
      url.endsWith('/message')
        ? new Response('no', { status: 500 })
        : new Response('{}', { status: 200 })
    );
    expect((await client(f1 as never).releaseTask('t', 'r')).messaged).toBe(false);
    expect(f1).toHaveBeenCalledTimes(2);
    const f2 = vi.fn(async (url: string) =>
      url.endsWith('/message')
        ? new Response('{}', { status: 200 })
        : new Response('unsigned-rejected', { status: 401 })
    );
    await expect(client(f2 as never).releaseTask('t', 'r')).rejects.toThrow(/401/);
  });
});

// ─── (ii) denylist ──────────────────────────────────────────────────────────
describe('(ii) TaskDenylist (persisted, 7-day default)', () => {
  it('defaults to 7 days and survives a restart via the JSON file', () => {
    expect(DEFAULT_FAILURE_COOLDOWN_MS).toBe(7 * 24 * 3600_000);
    const path = join(mkdtempSync(join(tmpdir(), 'deny-')), 'sub', 'task-denylist.json');
    const a = new TaskDenylist(path);
    const t0 = Date.now();
    a.add('t1', 'no_artifact', 'gate', DEFAULT_FAILURE_COOLDOWN_MS, t0);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8')).t1.kind).toBe('no_artifact');
    const b = new TaskDenylist(path); // "restart"
    expect(b.isDenied('t1', t0 + 25 * 3600_000)).toBe(true); // still denied after the 24h reaper
    expect(b.isDenied('t1', t0 + DEFAULT_FAILURE_COOLDOWN_MS)).toBe(false); // expired → pruned
    expect(b.size()).toBe(0);
  });
  it('a corrupt file is reported, not thrown, and the list still works in memory', () => {
    const errs: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'deny-'));
    const path = join(dir, 'd.json');
    writeFileSync(path, '{not json');
    const d = new TaskDenylist(path, (m) => errs.push(m));
    expect(errs[0]).toMatch(/denylist load/);
    d.add('x', 'exec_error', 'r', 60_000);
    expect(d.isDenied('x')).toBe(true);
  });
  it('the runner skips a denylisted task (pre-seeded from disk) and claims the next one', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'deny-')), 'd.json');
    new TaskDenylist(path).add('t-bad', 'ctx_overflow', 'seed', DEFAULT_FAILURE_COOLDOWN_MS);
    const m = mesh([task('t-bad', { priority: 'critical' }), task('t-good')]);
    const r = runner(m, { denylist: new TaskDenylist(path) });
    const res = await r.tick();
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.claim).toHaveBeenCalledWith('t-good');
    expect(res.action).toBe('executed');
  });
});

// ─── (iii) release on first failure ─────────────────────────────────────────
describe('(iii) release on first failure', () => {
  it('no-artifact gate → releaseTask with reason + route, denylisted, next tick does not re-pick it', async () => {
    const tasks = [task('t-na')];
    const m = mesh(tasks);
    const path = join(mkdtempSync(join(tmpdir(), 'deny-')), 'd.json');
    const events: Array<Record<string, unknown>> = [];
    const r = runner(m, { p: provider({ tools: [] }), denylist: new TaskDenylist(path), events });
    const res = await r.tick();
    expect(res.action).toBe('no-artifact');
    expect(m.releaseTask).toHaveBeenCalledTimes(1);
    const [id, reason] = m.releaseTask.mock.calls[0] as unknown as [string, string];
    expect(id).toBe('t-na');
    expect(reason).toMatch(/no_artifact: no-artifact gate/);
    expect(reason).toMatch(/\[route:laptop-or-fleet\]$/);
    expect(m.blockTask).not.toHaveBeenCalled();
    // route tag attempted; server 403 (not owner/creator) is logged, not fatal
    expect(m.updateTask).toHaveBeenCalledWith('t-na', { tags: ['jetson', 'laptop-or-fleet'] });
    expect(events.some((e) => e.ev === 'release-tag-skipped')).toBe(true);
    expect(events.some((e) => e.ev === 'released' && e.kind === 'no_artifact')).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))['t-na'].kind).toBe('no_artifact');
    // reaper reopens it → still not re-claimed by this agent
    const res2 = await r.tick();
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(res2.action).toBe('no-claimable-task');
  });

  it('llama 400 context overflow during execution → released as ctx_overflow, routed ctx-16k+', async () => {
    const m = mesh([task('t-rugp')]);
    const err = new Error(
      'LocalLLM 400: {"error":{"code":400,"message":"request (9063 tokens) exceeds the available context size (4096 tokens)"}}'
    );
    const r = runner(m, { p: provider({ throwErr: err }) });
    const res = await r.tick();
    expect(res.action).toBe('errored');
    expect(res.message).toMatch(/^ctx_overflow:/);
    const reason = String(m.releaseTask.mock.calls[0][1]);
    expect(reason).toMatch(/ctx_overflow/);
    expect(reason).toMatch(/\[route:ctx-16k\+\]$/);
  });

  it('generic execution error no longer escapes to runForever: released as exec_error', async () => {
    const m = mesh([task('t-x')]);
    const r = runner(m, { p: provider({ throwErr: new Error('ECONNRESET') }) });
    await expect(r.tick()).resolves.toMatchObject({ action: 'errored', taskId: 't-x' });
    expect(String(m.releaseTask.mock.calls[0][1])).toMatch(/exec_error: ECONNRESET/);
  });

  it('a failed release is logged loudly and the task is still denylisted', async () => {
    const m = mesh([task('t-na')]);
    m.releaseTask.mockRejectedValueOnce(new Error('HoloMesh PATCH 401: unsigned-rejected'));
    const events: Array<Record<string, unknown>> = [];
    const r = runner(m, { p: provider({ tools: [] }), events });
    await r.tick();
    expect(events.some((e) => e.ev === 'release-failed')).toBe(true);
    await r.tick();
    expect(m.claim).toHaveBeenCalledTimes(1);
  });

  it('classifies failure kinds and routes', () => {
    expect(
      classifyExecutionError(new Error('exceeds the available context size (4096 tokens)'))
    ).toBe('ctx_overflow');
    expect(classifyExecutionError(new ContextOverflowError(4000, 4096))).toBe('ctx_overflow');
    expect(classifyExecutionError(new Error('timeout'))).toBe('exec_error');
    expect(routeTagFor('ctx_overflow')).toBe('ctx-16k+');
    expect(routeTagFor('no_artifact')).toBe('laptop-or-fleet');
  });
});

// ─── (iv) claim-cap backoff ─────────────────────────────────────────────────
describe('(iv) claim-cap backoff', () => {
  it('403 claim_cap_exceeded → backoff (no throw); the next tick does not hit the board or claim', async () => {
    const err = new Error(
      'HoloMesh PATCH /team/T/board/t1 403: {"error":"Claim cap exceeded","code":"claim_cap_exceeded","active_claims":5,"claim_cap":5}'
    );
    expect(isClaimCapExceededError(err)).toBe(true);
    const m = mesh([task('t1')], {
      claimImpl: async () => {
        throw err;
      },
    });
    const events: Array<Record<string, unknown>> = [];
    const r = runner(m, { events });
    await expect(r.tick()).resolves.toMatchObject({
      action: 'no-claimable-task',
      message: 'claim cap; backing off',
    });
    const res2 = await r.tick();
    expect(res2.message).toMatch(/backing off until/);
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.getOpenTasks).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.ev === 'claim-cap-backoff-start')).toBe(true);
  });

  it('already holding >= cap claims → does not claim (pre-check from the board snapshot)', async () => {
    process.env.HOLOSCRIPT_AGENT_CLAIM_CAP = '2';
    const held = [
      task('h1', { status: 'claimed', claimedBy: 'agent_self' }),
      task('h2', { status: 'claimed', claimedBy: 'agent_self' }),
      task('other', { status: 'claimed', claimedBy: 'agent_other' }),
    ];
    const m = mesh([...held, task('t-open')]);
    const res = await runner(m).tick();
    expect(res.message).toMatch(/holding 2 claims \(cap 2\)/);
    expect(m.claim).not.toHaveBeenCalled();
  });

  it('holding fewer than cap → claims normally', async () => {
    process.env.HOLOSCRIPT_AGENT_CLAIM_CAP = '2';
    const m = mesh([task('h1', { status: 'claimed', claimedBy: 'agent_self' }), task('t-open')]);
    await runner(m).tick();
    expect(m.claim).toHaveBeenCalledWith('t-open');
  });
});

// ─── (v) fit check + prompt cap ─────────────────────────────────────────────
describe('(v) pre-claim fit check, prompt guard, caps', () => {
  it('an unfit task (est > 60% of n_ctx 4096) is never claimed; a fitting one is', async () => {
    const big = task('t-big', { priority: 'critical', description: 'x'.repeat(10_000) }); // ~2.9k tok
    const small = task('t-small');
    const m = mesh([big, small]);
    const events: Array<Record<string, unknown>> = [];
    await runner(m, { events }).tick();
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.claim).toHaveBeenCalledWith('t-small');
    const skip = events.find((e) => e.ev === 'claim-skip-unfit') as {
      tasks: Array<Record<string, unknown>>;
    };
    expect(skip.tasks[0]).toMatchObject({
      taskId: 't-big',
      reason: 'over-budget',
      route: 'ctx-16k+',
      budget: 2457,
    });
  });

  it('assessTaskFit: big-context / handoff tags, required_tags, required model, budget math', () => {
    const fit = { nCtx: 4096, source: 'props' as const, model: 'qwen3-4b' };
    const o = { overheadTokens: 1000, capabilityTags: ['jetson'] };
    expect(assessTaskFit(task('a', { tags: ['repo-wide'] }), fit, o)).toMatchObject({
      fit: false,
      reason: 'big-context-tag',
      route: 'ctx-16k+',
    });
    expect(assessTaskFit(task('b', { tags: ['laptop-or-fleet'] }), fit, o)).toMatchObject({
      fit: false,
      reason: 'handoff-tag',
      route: 'laptop-or-fleet',
    });
    expect(assessTaskFit(task('c', { required_tags: ['owned-metal'] }), fit, o)).toMatchObject({
      fit: false,
      reason: 'capability',
    });
    expect(assessTaskFit({ ...task('d'), requiredModel: 'qwen3:14b' }, fit, o)).toMatchObject({
      fit: false,
      reason: 'required-model',
    });
    const ok = assessTaskFit(task('e'), fit, o);
    expect(ok.fit).toBe(true);
    expect(ok.budget).toBe(Math.floor(4096 * 0.6));
    expect(ok.estTokens).toBe(estimateTokens(buildTaskPrompt(task('e'))) + 1000 + 256);
  });

  it('a prompt that grows past 90% of n_ctx mid-task is not sent: released ctx_overflow', async () => {
    // n_ctx 1200: the claim-time estimate (~570 tok) fits 60% (720), but the model's
    // first turn carries a ~5k-char write_file body, so the SECOND request would be
    // ~1.5k tok > 90% (1080) → ContextOverflowError before sending → release.
    const m = mesh([task('t-grow')]);
    const calls: number[] = [];
    const p: ILLMProvider = {
      ...provider(),
      async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        calls.push(req.messages.length);
        const use = {
          type: 'tool_use' as const,
          id: 'w1',
          name: 'write_file',
          input: { path: '/root/agent-output/a.txt', content: 'w'.repeat(5_000) },
        };
        return {
          content: '',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          model: 'm',
          provider: 'mock',
          finishReason: 'tool_use',
          toolUses: [use],
          assistantBlocks: [use],
        } as unknown as LLMCompletionResponse;
      },
    };
    const res = await runner(m, { p, nCtx: 1200 }).tick();
    expect(m.claim).toHaveBeenCalledWith('t-grow');
    expect(calls).toEqual([2]); // only the first request went out
    expect(res.action).toBe('errored');
    expect(res.message).toMatch(
      /^ctx_overflow: prompt ~\d+ tok exceeds 90% of n_ctx 1200; not sent/
    );
    expect(String(m.releaseTask.mock.calls[0][1])).toMatch(/\[route:ctx-16k\+\]$/);
  });

  it('hosted providers are not fit-checked (no /props call), local ones are', async () => {
    const m = mesh([task('t1')]);
    const hosted = new AgentRunner({
      identity: { ...IDENTITY, llmProvider: 'anthropic' as never },
      brain: BRAIN,
      provider: provider(),
      costGuard: guard(),
      mesh: m as never,
    });
    await hosted.tick();
    expect(m.claim).toHaveBeenCalledWith('t1');
    const local = runner(mesh([task('t2')]));
    expect(await local.planClaims([task('t2')])).toMatchObject({ fit: { nCtx: 4096 } });
  });

  it('fetchLocalFit reads /props n_ctx (llama-server shape), strips /v1, falls back to env', async () => {
    expect(propsUrlFor('http://127.0.0.1:18080/v1/')).toBe('http://127.0.0.1:18080/props');
    const f = vi.fn(async (url: string) => {
      expect(url).toBe('http://j:18080/props');
      return new Response(
        JSON.stringify({ default_generation_settings: { n_ctx: 4096 }, model_alias: 'brittney' }),
        { status: 200 }
      );
    });
    expect(await fetchLocalFit('http://j:18080/v1', { fetchImpl: f as never })).toEqual({
      nCtx: 4096,
      model: 'brittney',
      source: 'props',
    });
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(
      await fetchLocalFit('http://j:18080', {
        fetchImpl: down as never,
        env: { HOLOSCRIPT_AGENT_NUM_CTX: '8192' },
      })
    ).toEqual({ nCtx: 8192, source: 'env' });
    expect(await fetchLocalFit(undefined, { env: {} })).toBeNull();
  });

  it('prompt caps (edge-small) default to 12k read / 8k response / 8k stdout and are env-overridable; head-tail keeps the verdict', () => {
    expect(promptCaps({ HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' })).toEqual({
      readChars: 12_000,
      responseChars: 8_000,
      stdoutChars: 8_000,
    });
    expect(promptCaps({ HOLOSCRIPT_AGENT_READ_CAP_CHARS: '3000' }).readChars).toBe(3000);
    const out = 'START' + 'z'.repeat(20_000) + 'Tests 12 passed';
    const capped = capText(out, 8_000, 'head-tail', 'stdout');
    expect(capped.length).toBeLessThan(8_100);
    expect(capped.startsWith('START')).toBe(true);
    expect(capped.endsWith('Tests 12 passed')).toBe(true);
    expect(capText('short', 10, 'head')).toBe('short');
    expect(capText('a'.repeat(50), 10, 'head', 'file')).toMatch(
      /^a{10}\n…\[truncated, full file is 50 chars\]$/
    );
  });
});

// ─── dry-run plan (no writes) ───────────────────────────────────────────────
describe('planClaims (read-only dry-run)', () => {
  it('lists would-claim vs skip with reasons and performs zero board writes', async () => {
    process.env.HOLOSCRIPT_AGENT_CLAIM_CAP = '2';
    const m = mesh([]);
    const d = new TaskDenylist(null);
    d.add('t-den', 'no_artifact', 'seed', 60_000);
    const r = runner(m, { denylist: d });
    const plan = await r.planClaims([
      task('t-a'),
      task('t-b'),
      task('t-c'),
      task('t-den'),
      task('t-big', { description: 'q'.repeat(12_000) }),
      task('t-off', { title: 'unrelated', description: 'nothing', tags: ['paper-21'] }),
      task('t-held', { status: 'claimed', claimedBy: 'agent_self' }),
    ]);
    const by = Object.fromEntries(plan.entries.map((e) => [e.task.id, e]));
    expect(plan.heldClaims).toBe(1);
    expect(plan.entries.filter((e) => e.decision === 'would-claim')).toHaveLength(1); // cap 2 - held 1
    expect(by['t-den'].reason).toMatch(/denylisted/);
    expect(by['t-big'].reason).toMatch(/over-budget/);
    expect(by['t-off'].reason).toMatch(/capability/);
    expect(by['t-c'].reason ?? by['t-b'].reason).toMatch(/claim cap/);
    for (const fn of [
      m.claim,
      m.releaseTask,
      m.updateTask,
      m.blockTask,
      m.sendMessageOnTask,
      m.markDone,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

// ─── claim profiles (small-jobs rule, 2026-10-12) ───────────────────────────
import { resolveClaimProfile, screenTaskForProfile } from '../claim-profile.js';
import { HandoffReceiptLog, defaultHandoffReceiptPath } from '../handoff-receipts.js';

function profRunner(
  m: ReturnType<typeof mesh>,
  env: Record<string, string>,
  opts: {
    p?: ILLMProvider;
    nCtx?: number;
    receipts?: HandoffReceiptLog;
    brain?: RuntimeBrainConfig;
  } = {}
) {
  const brain = opts.brain ?? {
    ...BRAIN,
    capabilityTags: ['jetson', 'research', 'paper', 'multi-step'],
  };
  const r = new AgentRunner({
    identity: IDENTITY,
    brain,
    provider: opts.p ?? provider(),
    costGuard: guard(),
    mesh: m as never,
    claimProfile: resolveClaimProfile(env),
    handoffReceipts: opts.receipts,
    localFit: async () => ({
      nCtx: opts.nCtx ?? 4096,
      source: 'props' as const,
      model: 'qwen3-4b',
    }),
  });
  return { r, brain };
}

describe('claim profiles (edge-small / big-context)', () => {
  it('resolves profiles from env, with comma-list overrides', () => {
    const e = resolveClaimProfile({ HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' });
    expect(e).toMatchObject({
      name: 'edge-small',
      requireAnyTags: ['edge-small'],
      budgetFraction: 0.4,
    });
    expect(e.excludeTags).toEqual(
      expect.arrayContaining(['ctx-16k+', 'laptop-or-fleet', 'repo-wide'])
    );
    expect(e.capabilityTags).not.toContain('research');
    const b = resolveClaimProfile({ HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'big-context' });
    expect(b).toMatchObject({ name: 'big-context', skipRouteTags: true, excludeTags: [] });
    expect(b.requireAnyTags).toEqual(expect.arrayContaining(['ctx-16k+', 'laptop-or-fleet']));
    expect(resolveClaimProfile({})).toMatchObject({
      name: 'legacy',
      requireAnyTags: [],
      capabilityTags: null,
    });
    const o = resolveClaimProfile({
      HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small',
      HOLOSCRIPT_AGENT_CLAIM_REQUIRE_TAGS: 'Tiny, edge-small',
      HOLOSCRIPT_AGENT_CLAIM_BUDGET_FRACTION: '0.3',
      HOLOSCRIPT_AGENT_CAPABILITY_TAGS: 'jetson,tiny',
    });
    expect(o).toMatchObject({
      requireAnyTags: ['tiny', 'edge-small'],
      budgetFraction: 0.3,
      capabilityTags: ['jetson', 'tiny'],
    });
    expect(screenTaskForProfile(task('x', { tags: ['edge-small', 'repo-wide'] }), e)).toMatchObject(
      {
        ok: false,
        reason: 'profile-excluded-tag',
        detail: 'repo-wide',
      }
    );
  });

  it('edge-small: drops the broad brain tags, claims only edge-small-tagged tasks within 40% of n_ctx', async () => {
    const tasks = [
      task('t-research', {
        priority: 'critical',
        tags: ['research', 'paper', 'multi-step', 'jetson'],
      }),
      task('t-big-small', {
        priority: 'critical',
        tags: ['edge-small'],
        description: 'x'.repeat(6_000),
      }), // ~1.7k tok > 1638
      task('t-routed', { priority: 'critical', tags: ['edge-small', 'ctx-16k+'] }),
      task('t-ok', { priority: 'low', tags: ['edge-small'] }),
    ];
    const m = mesh(tasks);
    const { r, brain } = profRunner(m, { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' });
    expect(brain.capabilityTags).not.toContain('research');
    expect(brain.capabilityTags).toContain('edge-small');
    await r.tick();
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.claim).toHaveBeenCalledWith('t-ok');
    const plan = await r.planClaims(
      tasks.map((t) => ({ ...t })),
      { heldClaims: 0 }
    );
    const by = Object.fromEntries(plan.entries.map((e) => [e.task.id, e]));
    expect(by['t-research'].reason).toMatch(/profile-missing-tag/);
    expect(by['t-routed'].reason).toMatch(/profile-excluded-tag: ctx-16k\+/);
    expect(by['t-big-small'].reason).toMatch(/over-budget/);
  });

  it('big-context: takes the routed ctx-16k+ / laptop-or-fleet tasks the edge seat refuses, ignores the rest', async () => {
    const tasks = [
      task('t-plain', { priority: 'critical', tags: ['jetson'] }),
      task('t-handoff', {
        priority: 'high',
        tags: ['laptop-or-fleet'],
        description: 'x'.repeat(20_000),
      }),
    ];
    const m = mesh(tasks);
    const { r } = profRunner(m, { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'big-context' }, { nCtx: 16384 });
    await r.tick();
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.claim).toHaveBeenCalledWith('t-handoff');
  });
});

describe('native hand-off receipts (append-only NDJSON)', () => {
  it('default path names receipts/native-handoff.ndjson under the data dir', () => {
    expect(
      defaultHandoffReceiptPath({ HOLOSCRIPT_AGENT_DATA_DIR: '/mnt/nvme/holo/agent-data' })
    ).toBe('/mnt/nvme/holo/agent-data/receipts/native-handoff.ndjson');
    expect(defaultHandoffReceiptPath({ HOLOSCRIPT_AGENT_HANDOFF_RECEIPTS: '/x/r.ndjson' })).toBe(
      '/x/r.ndjson'
    );
  });

  it('writes one line per handled task: finished (with tokens), then released with reason; never rewrites', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rcpt-')), 'receipts', 'native-handoff.ndjson');
    const env = { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' };
    const tasks = [task('t-good', { tags: ['edge-small'] })];
    const m1 = mesh(tasks);
    await profRunner(m1, env, { receipts: new HandoffReceiptLog(path) }).r.tick();
    const m2 = mesh([task('t-na', { tags: ['edge-small'] })]);
    await profRunner(m2, env, {
      p: provider({ tools: [] }),
      receipts: new HandoffReceiptLog(path),
    }).r.tick();
    const lines = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      schema: 'native-handoff-v1',
      task_id: 't-good',
      agent: 'jetson-orin-brittney',
      model: 'qwen3-4b',
      claim_profile: 'edge-small',
      n_ctx: 4096,
      result: 'finished',
      action: 'executed',
      reason: null,
    });
    expect(lines[0].prompt_tokens).toBeGreaterThan(0);
    expect(lines[0].completion_tokens).toBeGreaterThan(0);
    expect(typeof lines[0].machine).toBe('string');
    expect(Date.parse(lines[0].ended_at)).toBeGreaterThanOrEqual(Date.parse(lines[0].claimed_at));
    expect(lines[1]).toMatchObject({ task_id: 't-na', result: 'released', action: 'no-artifact' });
    expect(lines[1].reason).toMatch(/no_artifact.*\[route:laptop-or-fleet\]$/);
  });

  it('an unwritable receipt path is reported, never thrown', () => {
    const errs: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'rcpt-'));
    writeFileSync(join(dir, 'file'), 'x');
    const log = new HandoffReceiptLog(join(dir, 'file', 'sub', 'r.ndjson'), (e) => errs.push(e));
    expect(log.append({} as never)).toBe(false);
    expect(errs).toHaveLength(1);
  });
});

describe('PR #553 review: receipt honesty + finally', () => {
  it("reopen failure is receipted as 'release_failed', not 'released'", async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rcpt-')), 'r.ndjson');
    const m = mesh([task('t-rf', { tags: ['edge-small'] })]);
    m.releaseTask.mockRejectedValueOnce(new Error('HoloMesh PATCH 401: unsigned-rejected'));
    await profRunner(
      m,
      { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' },
      {
        p: provider({ tools: [] }),
        receipts: new HandoffReceiptLog(path),
      }
    ).r.tick();
    const [line] = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(line).toMatchObject({
      task_id: 't-rf',
      result: 'release_failed',
      action: 'no-artifact',
    });
    expect(line.reason).toMatch(/no_artifact/);
  });

  it("a successful reopen is still receipted as 'released'", async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rcpt-')), 'r.ndjson');
    const m = mesh([task('t-ok-rel', { tags: ['edge-small'] })]);
    await profRunner(
      m,
      { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' },
      {
        p: provider({ tools: [] }),
        receipts: new HandoffReceiptLog(path),
      }
    ).r.tick();
    expect(JSON.parse(readFileSync(path, 'utf8').trim())).toMatchObject({ result: 'released' });
  });

  it('a throw escaping execution (e.g. automation-lane park call) still writes a receipt, then rethrows', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rcpt-')), 'r.ndjson');
    const m = mesh([task('t-throw', { tags: ['edge-small'] })]);
    const { r } = profRunner(
      m,
      { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' },
      {
        receipts: new HandoffReceiptLog(path),
      }
    );
    // Simulate blockAutomationTask throwing inside the automation catch: the error
    // escapes executeClaimed.
    vi.spyOn(r as never, 'executeClaimed' as never).mockRejectedValueOnce(
      new Error('HoloMesh PATCH block 500') as never
    );
    await expect(r.tick()).rejects.toThrow(/block 500/);
    const [line] = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(line).toMatchObject({ task_id: 't-throw', result: 'failed', action: 'errored' });
    expect(line.reason).toMatch(/uncaught: HoloMesh PATCH block 500/);
  });

  it('automation lane: blockAutomationTask throwing still yields a receipt', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rcpt-')), 'r.ndjson');
    const m = mesh([task('t-auto', { tags: ['edge-small'] })]);
    const { r } = profRunner(
      m,
      { HOLOSCRIPT_AGENT_CLAIM_PROFILE: 'edge-small' },
      {
        receipts: new HandoffReceiptLog(path),
      }
    );
    // Route through the real automation catch: runClaimedTask throws, then the park call throws.
    const rr = r as unknown as Record<string, unknown>;
    vi.spyOn(rr as never, 'runClaimedTask' as never).mockRejectedValueOnce(
      new Error('exec boom') as never
    );
    vi.spyOn(rr as never, 'blockAutomationTask' as never).mockRejectedValueOnce(
      new Error('park failed') as never
    );
    const exec = rr.executeClaimed as (ctx: Record<string, unknown>) => Promise<unknown>;
    vi.spyOn(rr as never, 'executeClaimed' as never).mockImplementationOnce(((
      ctx: Record<string, unknown>
    ) => exec.call(r, { ...ctx, lane: 'automation' })) as never);
    await expect(r.tick()).rejects.toThrow(/park failed/);
    const [line] = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(line).toMatchObject({ task_id: 't-auto', result: 'failed' });
    expect(line.reason).toMatch(/uncaught: park failed/);
  });
});
