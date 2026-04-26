import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '@holoscript/llm-provider';
import { CostGuard } from '../cost-guard.js';
import { AgentRunner } from '../runner.js';
import type { AgentIdentity, BoardTask, ExecutionResult, RuntimeBrainConfig } from '../types.js';

/**
 * mockProvider — supports two shapes:
 *   1) Tool-call-then-text sequence (DEFAULT) — first call returns tool_use
 *      with one bash invocation, second call returns final text. This is the
 *      happy-path shape that satisfies the W.107 artifact-grounding gate
 *      (added 2026-04-26 after mesh-worker-02 audit found 27.5h of fabricated
 *      "100 scenes validated" deliverables with zero side-effecting tool calls).
 *      Pass `toolCallsBeforeText: ['bash', 'write_file', ...]` to customize.
 *   2) Pure-text response (no tool call) — pass `toolCallsBeforeText: []` (or
 *      a list with only read-only tools like `['read_file']`). Used to exercise
 *      the W.107 gate's no-artifact path: the runner refuses to mark `executed`,
 *      skips CAEL post, skips message-on-task, and returns `action: 'no-artifact'`.
 */
function mockProvider(opts: {
  promptTokens: number;
  completionTokens: number;
  content?: string;
  toolCallsBeforeText?: string[];
}): ILLMProvider {
  // Default: single bash call → satisfies W.107 gate. Tests that want the
  // no-artifact path must explicitly pass `toolCallsBeforeText: []` or a
  // read-only list like `['read_file']`. Concurrency-safe: detects first-
  // call-per-tick via req.messages.length rather than callCount.
  const toolCalls = opts.toolCallsBeforeText ?? ['bash'];
  const usage = {
    promptTokens: opts.promptTokens,
    completionTokens: opts.completionTokens,
    totalTokens: opts.promptTokens + opts.completionTokens,
  };
  return {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const isFirstCallOfTick = (req.messages?.length ?? 0) <= 2;
      if (toolCalls.length > 0 && isFirstCallOfTick) {
        // First call: emit tool-use blocks for each tool name requested.
        return {
          content: '',
          usage,
          model: 'mock-1',
          provider: 'mock',
          finishReason: 'tool_use',
          toolUses: toolCalls.map((name, i) => ({
            id: `mock-tu-${i}`,
            name,
            // W.107.b: use a PRODUCTIVE bash command (vitest run) by default so
            // the tightened gate passes. Read-only bash like `echo ok` no
            // longer satisfies the gate. write_file uses non-empty content.
            input: name === 'bash'
              ? { cmd: 'vitest run --no-coverage' }
              : name === 'write_file'
                ? { path: '/root/agent-output/x', content: 'sample artifact content' }
                : { path: '/tmp/x' },
          })),
          assistantBlocks: toolCalls.map((name, i) => ({
            type: 'tool_use' as const,
            id: `mock-tu-${i}`,
            name,
            input: name === 'bash'
              ? { cmd: 'vitest run --no-coverage' }
              : name === 'write_file'
                ? { path: '/root/agent-output/x', content: 'sample artifact content' }
                : { path: '/tmp/x' },
          })),
        } as unknown as LLMCompletionResponse;
      }
      // Subsequent call (or default path): final text response.
      return {
        content: opts.content ?? 'response from mock',
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

function mockMesh(opts: { tasks: BoardTask[]; heartbeatImpl?: () => Promise<void>; joinTeamImpl?: () => Promise<{ success: boolean; role?: string; members?: number }> }) {
  const claimed: string[] = [];
  const messages: Array<{ taskId: string; body: string }> = [];
  return {
    claimed,
    messages,
    heartbeat: vi.fn(opts.heartbeatImpl ?? (async () => undefined)),
    joinTeam: vi.fn(opts.joinTeamImpl ?? (async () => ({ success: true, role: 'member', members: 31 }))),
    getOpenTasks: vi.fn(async () => opts.tasks),
    claim: vi.fn(async (id: string) => {
      claimed.push(id);
      return opts.tasks.find((t) => t.id === id)!;
    }),
    sendMessageOnTask: vi.fn(async (taskId: string, body: string) => {
      messages.push({ taskId, body });
    }),
    markDone: vi.fn(async () => undefined),
    postAuditRecords: vi.fn(async () => ({ appended: 0, rejected: 0 })),
    whoAmI: vi.fn(async () => ({ agentId: 'agent_test', surface: 'mock' })),
  };
}

const IDENTITY: AgentIdentity = {
  handle: 'security-auditor',
  surface: 'security-auditor',
  wallet: '0x346126AbCdEf0123456789abcdef0123456789AB',
  x402Bearer: 'fake-bearer',
  llmProvider: 'anthropic',
  llmModel: 'claude-haiku-4-5',
  brainPath: '/tmp/brain.hsplus',
  budgetUsdPerDay: 5,
  teamId: 'team_test',
  meshApiBase: 'https://mcp.holoscript.net/api/holomesh',
};

const BRAIN: RuntimeBrainConfig = {
  brainPath: '/tmp/brain.hsplus',
  systemPrompt: 'You are a security auditor.',
  capabilityTags: ['security', 'threat-model', 'paper-21'],
  domain: 'security',
  scopeTier: 'warm',
};

describe('AgentRunner.tick', () => {
  function freshGuard(opts: { budget?: number; preSpent?: number } = {}): CostGuard {
    const dir = mkdtempSync(join(tmpdir(), 'runner-'));
    const guard = new CostGuard({
      statePath: join(dir, 's.json'),
      dailyBudgetUsd: opts.budget ?? 5,
      pricer: () => 0.001,
    });
    if (opts.preSpent) {
      const usagePerCall = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };
      const callsNeeded = Math.ceil(opts.preSpent / 0.001);
      for (let i = 0; i < callsNeeded; i++) guard.recordUsage('mock', usagePerCall);
    }
    return guard;
  }

  it('heartbeats, claims a tag-matching task, runs the LLM, posts the response, records cost', async () => {
    const tasks: BoardTask[] = [
      { id: 't-G10', title: 'cross-paper threat-model memo', description: 'G10', priority: 'high', tags: ['security', 'paper-21'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    // W.107 gate: a happy path must call at least one side-effecting tool
    // (bash or write_file). Pure-text responses now hit the no-artifact path.
    const provider = mockProvider({ promptTokens: 100, completionTokens: 50, toolCallsBeforeText: ['bash'] });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider,
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('executed');
    expect(result.taskId).toBe('t-G10');
    expect(mesh.heartbeat).toHaveBeenCalledTimes(1);
    expect(mesh.claim).toHaveBeenCalledWith('t-G10');
    expect(mesh.sendMessageOnTask).toHaveBeenCalledTimes(1);
    expect(mesh.messages[0].taskId).toBe('t-G10');
    expect(mesh.messages[0].body).toContain('response from mock');
  });

  // W.107 artifact-grounding gate (added 2026-04-26 after the mesh-worker-02
  // audit found 27.5h of fabricated "100 scenes validated" deliverables with
  // zero side-effecting tool calls). The runner must refuse to mark a tick
  // `executed` and must NOT post a CAEL record / NOT message-on-task when
  // the LLM produced a pure-text response with no write_file / bash invocation.
  it('returns no-artifact when the LLM responds with pure text and calls no side-effecting tool (W.107 gate)', async () => {
    const tasks: BoardTask[] = [
      { id: 't-hallucinated', title: 'paper-20 scene composition validate', description: '', priority: 'high', tags: ['security'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    // Empty toolCallsBeforeText → pure-text response ("100 scenes validated,
    // 0 violations"-style hallucination, the exact pattern mw02 produced).
    const provider = mockProvider({ promptTokens: 100, completionTokens: 50, toolCallsBeforeText: [], content: '100 scenes validated, 0 violations' });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider,
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('no-artifact');
    expect(result.taskId).toBe('t-hallucinated');
    expect(result.message).toMatch(/no productive tool call/);
    // Critical: no CAEL post + no message on the board so the team can't be
    // misled into trusting the hallucinated "validated" claim.
    expect(mesh.postAuditRecords).not.toHaveBeenCalled();
    expect(mesh.sendMessageOnTask).not.toHaveBeenCalled();
  });

  // W.107.b tightened gate (added 2026-04-26): bash with read-only prefixes
  // (echo, cat, ls, grep, etc.) no longer satisfies the gate. Only productive
  // bash (lake build, pnpm --filter, vitest run, lean) counts as artifact.
  it('returns no-artifact when bash is called with a read-only prefix only (W.107.b)', async () => {
    const tasks: BoardTask[] = [
      { id: 't-trivial-bash', title: 'paper-20 scene composition validate', description: '', priority: 'high', tags: ['security'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    // Custom mock: model calls bash with `echo done` (read-only) instead of
    // a productive command. This is the trivial-bash-bypass pattern that the
    // first W.107 gate accepted but the tightened gate now rejects.
    let callCount = 0;
    const provider: ILLMProvider = {
      name: 'mock',
      models: ['mock-1'],
      defaultHoloScriptModel: 'mock-1',
      async complete(_req): Promise<LLMCompletionResponse> {
        callCount++;
        const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
        if (callCount === 1) {
          return {
            content: '',
            usage,
            model: 'mock-1',
            provider: 'mock',
            finishReason: 'tool_use',
            toolUses: [{ id: 'tu-1', name: 'bash', input: { cmd: 'echo done' } }],
            assistantBlocks: [{ type: 'tool_use' as const, id: 'tu-1', name: 'bash', input: { cmd: 'echo done' } }],
          } as unknown as LLMCompletionResponse;
        }
        return { content: 'done', usage, model: 'mock-1', provider: 'mock', finishReason: 'stop' };
      },
      async generateHoloScript() { throw new Error('not used'); },
      async healthCheck() { return { ok: true, latencyMs: 1 }; },
    };
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider,
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('no-artifact');
    expect(mesh.postAuditRecords).not.toHaveBeenCalled();
    expect(mesh.sendMessageOnTask).not.toHaveBeenCalled();
  });

  it('returns no-artifact when write_file is called with empty content (W.107.b)', async () => {
    const tasks: BoardTask[] = [
      { id: 't-empty-write', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    let callCount = 0;
    const provider: ILLMProvider = {
      name: 'mock',
      models: ['mock-1'],
      defaultHoloScriptModel: 'mock-1',
      async complete(_req): Promise<LLMCompletionResponse> {
        callCount++;
        const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
        if (callCount === 1) {
          return {
            content: '',
            usage,
            model: 'mock-1',
            provider: 'mock',
            finishReason: 'tool_use',
            // empty content — should NOT count as productive
            toolUses: [{ id: 'tu-2', name: 'write_file', input: { path: '/root/agent-output/x', content: '' } }],
            assistantBlocks: [{ type: 'tool_use' as const, id: 'tu-2', name: 'write_file', input: { path: '/root/agent-output/x', content: '' } }],
          } as unknown as LLMCompletionResponse;
        }
        return { content: 'done', usage, model: 'mock-1', provider: 'mock', finishReason: 'stop' };
      },
      async generateHoloScript() { throw new Error('not used'); },
      async healthCheck() { return { ok: true, latencyMs: 1 }; },
    };
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider,
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('no-artifact');
    expect(mesh.postAuditRecords).not.toHaveBeenCalled();
  });

  it('returns no-artifact when the LLM only calls read-only tools (read_file / list_dir)', async () => {
    const tasks: BoardTask[] = [
      { id: 't-readonly', title: 'audit code', description: '', priority: 'high', tags: ['security'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    // The model invokes read_file but never write_file or bash → no artifact produced.
    const provider = mockProvider({ promptTokens: 100, completionTokens: 50, toolCallsBeforeText: ['read_file'] });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider,
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('no-artifact');
    expect(mesh.postAuditRecords).not.toHaveBeenCalled();
    expect(mesh.sendMessageOnTask).not.toHaveBeenCalled();
  });

  it('returns over-budget WITHOUT calling the LLM when the cost guard is tripped', async () => {
    const mesh = mockMesh({
      tasks: [
        { id: 't1', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
      ],
    });
    const provider = mockProvider({ promptTokens: 100, completionTokens: 50 });
    const completeSpy = vi.spyOn(provider, 'complete');
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider,
      costGuard: freshGuard({ budget: 0.001, preSpent: 0.002 }),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('over-budget');
    expect(completeSpy).not.toHaveBeenCalled();
    expect(mesh.claim).not.toHaveBeenCalled();
    expect(mesh.heartbeat).toHaveBeenCalledTimes(1);
  });

  it('heartbeats and reports no-claimable-task when no open task matches the brain capability set', async () => {
    const mesh = mockMesh({
      tasks: [
        { id: 't-ui', title: 'theme tweak', description: 'css update', priority: 'low', tags: ['ui'], status: 'open' },
      ],
    });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('no-claimable-task');
    expect(mesh.claim).not.toHaveBeenCalled();
  });

  it('writes a task-executed event to the audit log when supplied (Phase 3 producer wiring)', async () => {
    const { AuditLog } = await import('../audit-log.js');
    const dir = mkdtempSync(join(tmpdir(), 'audit-runner-'));
    const auditLog = new AuditLog({ logPath: join(dir, 'audit.jsonl') });
    const tasks: BoardTask[] = [
      { id: 't-aud', title: 'audit-wired memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: mockProvider({ promptTokens: 200, completionTokens: 100 }),
      costGuard: freshGuard(),
      mesh: mesh as never,
      auditLog,
    });
    await runner.tick();
    const events = auditLog.query();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('task-executed');
    expect(events[0].agent.handle).toBe('security-auditor');
    expect(events[0].task?.id).toBe('t-aud');
    // 2 LLM calls × 300 tokens (W.107 gate requires ≥1 tool-use round, so the
    // mock fires once for tool_use + once for final-text). Pre-W.107 expected 300.
    expect(events[0].execution?.totalTokens).toBe(600);
  });

  // task_1777112258989_eeyp: heartbeat-403 self-rejoin tests.
  describe('auto-rejoin on 403 Not a member (task_1777112258989_eeyp)', () => {
    function notAMemberError() {
      return new Error('HoloMesh POST /team/team_test/presence 403: {"error":"Not a member of this team"}');
    }

    it('catches 403 Not a member from heartbeat, calls joinTeam, retries heartbeat, then proceeds', async () => {
      const tasks: BoardTask[] = [
        { id: 't-recover', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
      ];
      let heartbeatCall = 0;
      const mesh = mockMesh({
        tasks,
        heartbeatImpl: async () => {
          heartbeatCall++;
          if (heartbeatCall === 1) throw notAMemberError();
          return undefined;
        },
      });
      const events: Array<Record<string, unknown>> = [];
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
        costGuard: freshGuard(),
        mesh: mesh as never,
        logger: (e) => events.push(e),
      });

      const result = await runner.tick();
      expect(result.action).toBe('executed');
      expect(mesh.heartbeat).toHaveBeenCalledTimes(2); // initial 403 + retry-after-rejoin
      expect(mesh.joinTeam).toHaveBeenCalledTimes(1);
      expect(events.some((e) => e.ev === 'auto-rejoin-attempt')).toBe(true);
      expect(events.some((e) => e.ev === 'auto-rejoin-success')).toBe(true);
      expect(events.some((e) => e.ev === 'auto-rejoin-heartbeat-recovered')).toBe(true);
    });

    it('does NOT call joinTeam more than once per process even across multiple ticks', async () => {
      const tasks: BoardTask[] = [
        { id: 't-stick', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
      ];
      let heartbeatCall = 0;
      const mesh = mockMesh({
        tasks,
        heartbeatImpl: async () => {
          heartbeatCall++;
          // First call: 403 (triggers rejoin). All subsequent calls succeed.
          if (heartbeatCall === 1) throw notAMemberError();
          return undefined;
        },
      });
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
        costGuard: freshGuard(),
        mesh: mesh as never,
      });

      await runner.tick(); // first tick: 403 → rejoin → retry → execute
      await runner.tick(); // second tick: heartbeat clean
      await runner.tick(); // third tick: heartbeat clean

      expect(mesh.joinTeam).toHaveBeenCalledTimes(1);
    });

    it('does NOT auto-rejoin on a 403 with a different error body (insufficient permissions)', async () => {
      const tasks: BoardTask[] = [
        { id: 't-perm', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
      ];
      const mesh = mockMesh({
        tasks,
        heartbeatImpl: async () => {
          throw new Error('HoloMesh POST /team/team_test/presence 403: {"error":"Insufficient permissions"}');
        },
      });
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
        costGuard: freshGuard(),
        mesh: mesh as never,
      });

      await expect(runner.tick()).rejects.toThrow(/Insufficient permissions/);
      expect(mesh.joinTeam).not.toHaveBeenCalled();
    });

    it('does NOT auto-rejoin on non-403 errors (network failure, 500)', async () => {
      const tasks: BoardTask[] = [
        { id: 't-net', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
      ];
      const mesh = mockMesh({
        tasks,
        heartbeatImpl: async () => {
          throw new Error('HoloMesh POST /team/team_test/presence 500: internal server error');
        },
      });
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
        costGuard: freshGuard(),
        mesh: mesh as never,
      });

      await expect(runner.tick()).rejects.toThrow(/500/);
      expect(mesh.joinTeam).not.toHaveBeenCalled();
    });

    it('marks joinedThisProcess=true even if joinTeam itself throws (no retry storm on join endpoint)', async () => {
      const tasks: BoardTask[] = [
        { id: 't-joinfail', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
      ];
      const mesh = mockMesh({
        tasks,
        heartbeatImpl: async () => {
          throw notAMemberError();
        },
        joinTeamImpl: async () => {
          throw new Error('HoloMesh POST /team/team_test/join 403: {"error":"Team at capacity"}');
        },
      });
      const events: Array<Record<string, unknown>> = [];
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
        costGuard: freshGuard(),
        mesh: mesh as never,
        logger: (e) => events.push(e),
      });

      // First tick: heartbeat 403 → joinTeam throws → tick re-throws.
      await expect(runner.tick()).rejects.toThrow(/Team at capacity/);
      expect(mesh.joinTeam).toHaveBeenCalledTimes(1);
      expect(events.some((e) => e.ev === 'auto-rejoin-failed')).toBe(true);

      // Second tick: heartbeat is still 403, but joinedThisProcess is now true,
      // so we DO NOT call joinTeam again. The 403 propagates.
      await expect(runner.tick()).rejects.toThrow(/Not a member/);
      expect(mesh.joinTeam).toHaveBeenCalledTimes(1); // STILL one — no retry storm
    });
  });

  it('routes the response through onTaskExecuted when supplied (Phase 1.5 commit hook)', async () => {
    const tasks: BoardTask[] = [
      { id: 't-G10', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
    ];
    const mesh = mockMesh({ tasks });
    const captured: ExecutionResult[] = [];
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
      costGuard: freshGuard(),
      mesh: mesh as never,
      onTaskExecuted: async (r) => {
        captured.push(r);
      },
    });

    await runner.tick();
    expect(captured).toHaveLength(1);
    expect(captured[0].taskId).toBe('t-G10');
    expect(mesh.sendMessageOnTask).not.toHaveBeenCalled();
  });
});
