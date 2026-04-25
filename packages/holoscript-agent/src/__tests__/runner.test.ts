import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '@holoscript/llm-provider';
import { CostGuard } from '../cost-guard.js';
import { AgentRunner } from '../runner.js';
import type { AgentIdentity, BoardTask, ExecutionResult, RuntimeBrainConfig } from '../types.js';

function mockProvider(opts: { promptTokens: number; completionTokens: number; content?: string }): ILLMProvider {
  const usage = { ...opts, totalTokens: opts.promptTokens + opts.completionTokens };
  return {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(_req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
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
    const provider = mockProvider({ promptTokens: 100, completionTokens: 50 });
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
    expect(events[0].execution?.totalTokens).toBe(300);
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
