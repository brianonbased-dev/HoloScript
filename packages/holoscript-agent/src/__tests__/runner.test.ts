import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '@holoscript/llm-provider';
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
            input:
              name === 'bash'
                ? { cmd: 'vitest run --no-coverage' }
                : name === 'write_file'
                  ? { path: '/root/agent-output/x', content: 'sample artifact content' }
                  : { path: '/tmp/x' },
          })),
          assistantBlocks: toolCalls.map((name, i) => ({
            type: 'tool_use' as const,
            id: `mock-tu-${i}`,
            name,
            input:
              name === 'bash'
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

function mockMesh(opts: {
  tasks: BoardTask[];
  heartbeatImpl?: () => Promise<void>;
  joinTeamImpl?: () => Promise<{ success: boolean; role?: string; members?: number }>;
  /** Override claim() entirely — e.g. to simulate a 403 capability_mismatch from the live server. */
  claimImpl?: (id: string) => Promise<BoardTask>;
}) {
  const claimed: string[] = [];
  const messages: Array<{ taskId: string; body: string }> = [];
  return {
    claimed,
    messages,
    heartbeat: vi.fn(opts.heartbeatImpl ?? (async () => undefined)),
    joinTeam: vi.fn(
      opts.joinTeamImpl ?? (async () => ({ success: true, role: 'member', members: 31 }))
    ),
    getOpenTasks: vi.fn(async () => opts.tasks),
    claim: vi.fn(
      opts.claimImpl ??
        (async (id: string) => {
          claimed.push(id);
          return opts.tasks.find((t) => t.id === id)!;
        })
    ),
    sendMessageOnTask: vi.fn(async (taskId: string, body: string) => {
      messages.push({ taskId, body });
    }),
    markDone: vi.fn(async () => undefined),
    postAuditRecords: vi.fn(async () => ({ appended: 0, rejected: 0 })),
    whoAmI: vi.fn(async () => ({ agentId: 'agent_test', surface: 'mock' })),
    // Cognitive-verb knowledge surface (Phase 2.2) + the recall write-loop.
    queryTeamKnowledge: vi.fn(async () => []),
    queryPrivateKnowledge: vi.fn(async () => []),
    writePrivateKnowledge: vi.fn(async () => true),
    // Self-direction (idle director) surface — file board tasks + core MCP tools.
    addTasks: vi.fn(async (tasks: unknown[]) => ({
      added: Array.isArray(tasks) ? tasks.length : 0,
    })),
    invokeTool: vi.fn(async () => ({ ok: true })),
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
  // Universal+segregated routing fields (Lane 3 Phase 2). Empty arrays =
  // open routing, matches today's behavior. Runner doesn't consume these
  // fields directly; the supervisor router (Phase 4) will at session start.
  requires: [],
  prefers: [],
  avoids: [],
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
      {
        id: 't-G10',
        title: 'cross-paper threat-model memo',
        description: 'G10',
        priority: 'high',
        tags: ['security', 'paper-21'],
        status: 'open',
      },
    ];
    const mesh = mockMesh({ tasks });
    // W.107 gate: a happy path must call at least one side-effecting tool
    // (bash or write_file). Pure-text responses now hit the no-artifact path.
    const provider = mockProvider({
      promptTokens: 100,
      completionTokens: 50,
      toolCallsBeforeText: ['bash'],
    });
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
    // Recall write-loop (W.752): a completed task persists its outcome to the
    // agent's private knowledge so a future `recall` verb has memory to draw on.
    expect(mesh.writePrivateKnowledge).toHaveBeenCalledTimes(1);
    const writtenFact = (mesh.writePrivateKnowledge as ReturnType<typeof vi.fn>).mock
      .calls[0][0][0];
    expect(writtenFact.content).toContain('t-G10');
    expect(writtenFact.type).toBe('task-outcome');
  });

  // W.107 artifact-grounding gate (added 2026-04-26 after the mesh-worker-02
  // audit found 27.5h of fabricated "100 scenes validated" deliverables with
  // zero side-effecting tool calls). The runner must refuse to mark a tick
  // `executed` and must NOT post a CAEL record / NOT message-on-task when
  // the LLM produced a pure-text response with no write_file / bash invocation.
  it('returns no-artifact when the LLM responds with pure text and calls no side-effecting tool (W.107 gate)', async () => {
    const tasks: BoardTask[] = [
      {
        id: 't-hallucinated',
        title: 'paper-20 scene composition validate',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
    ];
    const mesh = mockMesh({ tasks });
    // Empty toolCallsBeforeText → pure-text response ("100 scenes validated,
    // 0 violations"-style hallucination, the exact pattern mw02 produced).
    const provider = mockProvider({
      promptTokens: 100,
      completionTokens: 50,
      toolCallsBeforeText: [],
      content: '100 scenes validated, 0 violations',
    });
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

  // Training-signal capture (founder 2026-06-24): the no-artifact verdict is the richest negative
  // supervision signal and was previously discarded. With HOLOSCRIPT_AGENT_TRACE_DIR set, it is
  // written as a graded NEGATIVE trace row (grader.passed:false) — opt-in, so unconfigured agents
  // are unaffected.
  it('emits a graded NEGATIVE trace row on no-artifact when HOLOSCRIPT_AGENT_TRACE_DIR is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-trace-'));
    const prev = process.env.HOLOSCRIPT_AGENT_TRACE_DIR;
    process.env.HOLOSCRIPT_AGENT_TRACE_DIR = dir;
    try {
      const mesh = mockMesh({
        tasks: [
          {
            id: 't-neg',
            title: 'validate scenes',
            description: '',
            priority: 'high',
            tags: ['security'],
            status: 'open',
          },
        ],
      });
      const provider = mockProvider({
        promptTokens: 100,
        completionTokens: 50,
        toolCallsBeforeText: [],
        content: 'fabricated success',
      });
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider,
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('no-artifact');
      const rows = readFileSync(join(dir, IDENTITY.handle, 'trace.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      expect(rows).toHaveLength(1);
      expect(rows[0].grader.passed).toBe(false);
      expect(rows[0].grader.kind).toBe('no-artifact');
      expect(rows[0].user).toBeTruthy();
      expect(rows[0].target).toBeTruthy();
      expect(rows[0].agentId).toBe(IDENTITY.handle);
      expect(rows[0].source).toBe('agent-runner-negative');
    } finally {
      if (prev === undefined) delete process.env.HOLOSCRIPT_AGENT_TRACE_DIR;
      else process.env.HOLOSCRIPT_AGENT_TRACE_DIR = prev;
    }
  });

  // W.107.b tightened gate (added 2026-04-26): bash with read-only prefixes
  // (echo, cat, ls, grep, etc.) no longer satisfies the gate. Only productive
  // bash (lake build, pnpm --filter, vitest run, lean) counts as artifact.
  it('returns no-artifact when bash is called with a read-only prefix only (W.107.b)', async () => {
    const tasks: BoardTask[] = [
      {
        id: 't-trivial-bash',
        title: 'paper-20 scene composition validate',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
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
            assistantBlocks: [
              { type: 'tool_use' as const, id: 'tu-1', name: 'bash', input: { cmd: 'echo done' } },
            ],
          } as unknown as LLMCompletionResponse;
        }
        return { content: 'done', usage, model: 'mock-1', provider: 'mock', finishReason: 'stop' };
      },
      async generateHoloScript() {
        throw new Error('not used');
      },
      async healthCheck() {
        return { ok: true, latencyMs: 1 };
      },
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
      {
        id: 't-empty-write',
        title: 'security memo',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
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
            toolUses: [
              {
                id: 'tu-2',
                name: 'write_file',
                input: { path: '/root/agent-output/x', content: '' },
              },
            ],
            assistantBlocks: [
              {
                type: 'tool_use' as const,
                id: 'tu-2',
                name: 'write_file',
                input: { path: '/root/agent-output/x', content: '' },
              },
            ],
          } as unknown as LLMCompletionResponse;
        }
        return { content: 'done', usage, model: 'mock-1', provider: 'mock', finishReason: 'stop' };
      },
      async generateHoloScript() {
        throw new Error('not used');
      },
      async healthCheck() {
        return { ok: true, latencyMs: 1 };
      },
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

  // ── Self-declared-failure gate (trust-audit 2026-07-13) ───────────────────
  // A productive write_file whose CONTENT is a failure dump ("Status: FAILED",
  // "task cannot proceed") used to close the board task as done with fabricated
  // template evidence — the FounderCommandCenter phantom. The gate must refuse.
  const failureGateProvider = (opts: { writeContent: string; finalText: string }): ILLMProvider => {
    let callCount = 0;
    return {
      name: 'mock',
      models: ['mock-1'],
      defaultHoloScriptModel: 'mock-1',
      async complete(_req): Promise<LLMCompletionResponse> {
        callCount++;
        const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
        if (callCount === 1) {
          const tu = {
            id: 'tu-fail',
            name: 'write_file',
            input: { path: '/root/agent-output/receipt.json', content: opts.writeContent },
          };
          return {
            content: '',
            usage,
            model: 'mock-1',
            provider: 'mock',
            finishReason: 'tool_use',
            toolUses: [tu],
            assistantBlocks: [{ type: 'tool_use' as const, ...tu }],
          } as unknown as LLMCompletionResponse;
        }
        return {
          content: opts.finalText,
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
  };

  it('returns failure-artifact when the only productive write is a self-declared failure dump', async () => {
    const tasks: BoardTask[] = [
      {
        id: 't-fail-dump',
        title: 'validate composition',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
    ];
    const mesh = mockMesh({ tasks });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: failureGateProvider({
        writeContent:
          '{"conclusion":"The task cannot be completed as the foundational data is absent","status":"Status: FAILED (missing foundational files)"}',
        finalText: 'done',
      }),
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('failure-artifact');
    expect(mesh.markDone).not.toHaveBeenCalled();
  });

  it('returns failure-artifact when the final text is a failure admission with no commit', async () => {
    const tasks: BoardTask[] = [
      {
        id: 't-fail-text',
        title: 'write report',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
    ];
    const mesh = mockMesh({ tasks });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: failureGateProvider({
        writeContent: '{"notes":"partial exploration written"}',
        finalText: 'Access denied to the shared output directory. Task cannot proceed.',
      }),
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('failure-artifact');
    expect(mesh.markDone).not.toHaveBeenCalled();
  });

  it('does NOT fire the failure gate on an ordinary successful write (no false positive)', async () => {
    const tasks: BoardTask[] = [
      {
        id: 't-ok-write',
        title: 'write summary',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
    ];
    const mesh = mockMesh({ tasks });
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: failureGateProvider({
        writeContent: '{"summary":"5 gates green, 2 skipped; artifacts listed below"}',
        finalText: 'Summary written with gate results.',
      }),
      costGuard: freshGuard(),
      mesh: mesh as never,
    });

    const result = await runner.tick();
    expect(result.action).toBe('executed');
    expect(mesh.markDone).toHaveBeenCalled();
  });

  it('returns no-artifact when the LLM only calls read-only tools (read_file / list_dir)', async () => {
    const tasks: BoardTask[] = [
      {
        id: 't-readonly',
        title: 'audit code',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
    ];
    const mesh = mockMesh({ tasks });
    // The model invokes read_file but never write_file or bash → no artifact produced.
    const provider = mockProvider({
      promptTokens: 100,
      completionTokens: 50,
      toolCallsBeforeText: ['read_file'],
    });
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
        {
          id: 't1',
          title: 'security memo',
          description: '',
          priority: 'high',
          tags: ['security'],
          status: 'open',
        },
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

  // Memory-headroom guard (founder 2026-06-23, after the Jetson two-model swap-thrash freeze).
  it('returns low-memory-skip WITHOUT claiming or calling the LLM when available memory is below the floor', async () => {
    const prev = process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB;
    process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB = '99999999'; // above any real machine → always trips
    try {
      const mesh = mockMesh({
        tasks: [
          {
            id: 't1',
            title: 'security memo',
            description: '',
            priority: 'high',
            tags: ['security'],
            status: 'open',
          },
        ],
      });
      const provider = mockProvider({ promptTokens: 1, completionTokens: 1 });
      const completeSpy = vi.spyOn(provider, 'complete');
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider,
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('low-memory-skip');
      expect(result.message).toMatch(/avoiding OOM/);
      expect(mesh.claim).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
      expect(mesh.heartbeat).toHaveBeenCalledTimes(1); // heartbeat still runs — agent stays a live member
    } finally {
      if (prev === undefined) delete process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB;
      else process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB = prev;
    }
  });

  it('does NOT skip when the memory floor is unset — guard is opt-in, no regression for fleet agents', async () => {
    const prev = process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB;
    delete process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB;
    try {
      const mesh = mockMesh({
        tasks: [
          {
            id: 't-G10',
            title: 'security memo',
            description: '',
            priority: 'high',
            tags: ['security'],
            status: 'open',
          },
        ],
      });
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({
          promptTokens: 1,
          completionTokens: 1,
          toolCallsBeforeText: ['bash'],
        }),
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('executed'); // guard off → normal claim/execute
    } finally {
      if (prev !== undefined) process.env.HOLOSCRIPT_AGENT_MIN_FREE_MB = prev;
    }
  });

  it('heartbeats and reports no-claimable-task when no open task matches the brain capability set', async () => {
    const mesh = mockMesh({
      tasks: [
        {
          id: 't-ui',
          title: 'theme tweak',
          description: 'css update',
          priority: 'low',
          tags: ['ui'],
          status: 'open',
        },
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

  // ── Self-healing idle director (founder 2026-06-23) ──────────────────────────
  // When the board is dry, a brain that authors `behavior on_idle` derives + executes
  // one small self-task through the SAME tool + W.107.b artifact gate as a real task.
  describe('idle self-direction (behavior on_idle)', () => {
    const IDLE_BRAIN: RuntimeBrainConfig = {
      ...BRAIN,
      idle: {
        directive: 'Find and fix a small edge in the HoloScript language.',
        fileBoard: true,
        maxTools: 6,
      },
    };
    // No board task matches the brain tags → the runner reaches the idle branch.
    const DRY_BOARD: BoardTask[] = [
      {
        id: 't-ui',
        title: 'theme tweak',
        description: 'css',
        priority: 'low',
        tags: ['ui'],
        status: 'open',
      },
    ];

    it('a brain WITHOUT on_idle still returns no-claimable-task and never derives idle work', async () => {
      const mesh = mockMesh({ tasks: DRY_BOARD });
      const provider = mockProvider({ promptTokens: 1, completionTokens: 1 });
      const completeSpy = vi.spyOn(provider, 'complete');
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN, // no idle field
        provider,
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('no-claimable-task');
      expect(completeSpy).not.toHaveBeenCalled(); // no self-task derivation
      expect(mesh.addTasks).not.toHaveBeenCalled();
    });

    it('derives + executes a self-task and returns idle-worked when it produces a real artifact', async () => {
      const mesh = mockMesh({ tasks: DRY_BOARD });
      let n = 0;
      const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
      const provider: ILLMProvider = {
        name: 'mock',
        models: ['mock-1'],
        defaultHoloScriptModel: 'mock-1',
        async complete(): Promise<LLMCompletionResponse> {
          n++;
          if (n === 1) {
            // DISCOVER: derive a concrete self-task (text).
            return {
              content: 'TASK: tighten a grammar edge in the parser',
              usage,
              model: 'mock-1',
              provider: 'mock',
              finishReason: 'stop',
            };
          }
          if (n === 2) {
            // EXECUTE iter 1: a PRODUCTIVE write_file (non-empty content) → satisfies W.107.b.
            return {
              content: '',
              usage,
              model: 'mock-1',
              provider: 'mock',
              finishReason: 'tool_use',
              toolUses: [
                {
                  id: 'w1',
                  name: 'write_file',
                  input: { path: '/root/agent-output/idle.txt', content: 'idle artifact content' },
                },
              ],
              assistantBlocks: [
                {
                  type: 'tool_use' as const,
                  id: 'w1',
                  name: 'write_file',
                  input: { path: '/root/agent-output/idle.txt', content: 'idle artifact content' },
                },
              ],
            } as unknown as LLMCompletionResponse;
          }
          return {
            content: 'Tightened the edge.',
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
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: IDLE_BRAIN,
        provider,
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('idle-worked');
      expect(mesh.claim).not.toHaveBeenCalled(); // idle work is not a board claim
      expect(mesh.addTasks).toHaveBeenCalledTimes(1); // filed for capability-matched peers
      const filed = (mesh.addTasks as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
      expect(filed.title).toContain('[idle:security-auditor]');
      expect(filed.tags).toEqual(BRAIN.capabilityTags);
      expect(mesh.writePrivateKnowledge).toHaveBeenCalledTimes(1);
    });

    it('returns idle-skipped and files NO board task when idle work produces no artifact (W.107.b holds for idle)', async () => {
      const mesh = mockMesh({ tasks: DRY_BOARD });
      let n = 0;
      const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
      const provider: ILLMProvider = {
        name: 'mock',
        models: ['mock-1'],
        defaultHoloScriptModel: 'mock-1',
        async complete(): Promise<LLMCompletionResponse> {
          n++;
          if (n === 1) {
            return {
              content: 'TASK: audit the lexer',
              usage,
              model: 'mock-1',
              provider: 'mock',
              finishReason: 'stop',
            };
          }
          if (n === 2) {
            // EXECUTE: only a READ-ONLY tool → NOT productive → no real artifact.
            return {
              content: '',
              usage,
              model: 'mock-1',
              provider: 'mock',
              finishReason: 'tool_use',
              toolUses: [{ id: 'r1', name: 'read_file', input: { path: '/tmp/x' } }],
              assistantBlocks: [
                {
                  type: 'tool_use' as const,
                  id: 'r1',
                  name: 'read_file',
                  input: { path: '/tmp/x' },
                },
              ],
            } as unknown as LLMCompletionResponse;
          }
          return {
            content: 'I looked at it.',
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
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: IDLE_BRAIN,
        provider,
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('idle-skipped');
      expect(mesh.addTasks).not.toHaveBeenCalled(); // no fabricated work filed
      expect(mesh.writePrivateKnowledge).not.toHaveBeenCalled();
    });

    it('re-prompts a read-only idle attempt to write — turns read→skip into read→write (idle-worked)', async () => {
      const mesh = mockMesh({ tasks: DRY_BOARD });
      let n = 0;
      const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
      const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
        ({
          content: '',
          usage,
          model: 'mock-1',
          provider: 'mock',
          finishReason: 'tool_use',
          toolUses: [{ id, name, input }],
          assistantBlocks: [{ type: 'tool_use' as const, id, name, input }],
        }) as unknown as LLMCompletionResponse;
      const provider: ILLMProvider = {
        name: 'mock',
        models: ['mock-1'],
        defaultHoloScriptModel: 'mock-1',
        async complete(): Promise<LLMCompletionResponse> {
          n++;
          if (n === 1)
            return {
              content: 'TASK: tighten a parser edge',
              usage,
              model: 'mock-1',
              provider: 'mock',
              finishReason: 'stop',
            };
          if (n === 2) return toolUse('r1', 'read_file', { path: '/tmp/x' }); // inspect only
          if (n === 3)
            return {
              content: 'I read the file.',
              usage,
              model: 'mock-1',
              provider: 'mock',
              finishReason: 'stop',
            }; // no write → triggers re-prompt
          // re-prompt: now ACT with a productive write_file
          return toolUse('w1', 'write_file', {
            path: '/root/agent-output/idle.txt',
            content: 'a real improvement',
          });
        },
        async generateHoloScript() {
          throw new Error('not used');
        },
        async healthCheck() {
          return { ok: true, latencyMs: 1 };
        },
      };
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: IDLE_BRAIN,
        provider,
        costGuard: freshGuard(),
        mesh: mesh as never,
      });
      const result = await runner.tick();
      expect(result.action).toBe('idle-worked'); // the re-prompt rescued a read-only attempt
      expect(mesh.addTasks).toHaveBeenCalledTimes(1);
    });
  });

  it('writes a task-executed event to the audit log when supplied (Phase 3 producer wiring)', async () => {
    const { AuditLog } = await import('../audit-log.js');
    const dir = mkdtempSync(join(tmpdir(), 'audit-runner-'));
    const auditLog = new AuditLog({ logPath: join(dir, 'audit.jsonl') });
    const tasks: BoardTask[] = [
      {
        id: 't-aud',
        title: 'audit-wired memo',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
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
      return new Error(
        'HoloMesh POST /team/team_test/presence 403: {"error":"Not a member of this team"}'
      );
    }

    it('catches 403 Not a member from heartbeat, calls joinTeam, retries heartbeat, then proceeds', async () => {
      const tasks: BoardTask[] = [
        {
          id: 't-recover',
          title: 'security memo',
          description: '',
          priority: 'high',
          tags: ['security'],
          status: 'open',
        },
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
        {
          id: 't-stick',
          title: 'security memo',
          description: '',
          priority: 'high',
          tags: ['security'],
          status: 'open',
        },
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
        {
          id: 't-perm',
          title: 'security memo',
          description: '',
          priority: 'high',
          tags: ['security'],
          status: 'open',
        },
      ];
      const mesh = mockMesh({
        tasks,
        heartbeatImpl: async () => {
          throw new Error(
            'HoloMesh POST /team/team_test/presence 403: {"error":"Insufficient permissions"}'
          );
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
        {
          id: 't-net',
          title: 'security memo',
          description: '',
          priority: 'high',
          tags: ['security'],
          status: 'open',
        },
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
        {
          id: 't-joinfail',
          title: 'security memo',
          description: '',
          priority: 'high',
          tags: ['security'],
          status: 'open',
        },
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
      {
        id: 't-G10',
        title: 'security memo',
        description: '',
        priority: 'high',
        tags: ['security'],
        status: 'open',
      },
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

  // Regression coverage for task_1783013704199_nomp (2026-07-02): live finding was
  // jetson-orin-super / jetson-orin-fara spinning ~once/minute for 1h+, each tick
  // re-attempting the identical claim and getting 403 capability_mismatch back
  // (agent_capability_tags:[] every time), because the runner had no memory of a
  // prior capability_mismatch for that task ID.
  describe('claim-retry backoff on 403 capability_mismatch (regression: task_1783013704199_nomp)', () => {
    const CAPABILITY_MISMATCH_TASK: BoardTask = {
      id: 'task_owned_metal_only',
      title: '[automation] owned-metal-gated automation',
      description: '',
      priority: 'medium',
      // Tagged so this agent's brain (BRAIN.capabilityTags) scores it as a
      // claim candidate via pickClaimableTask's text-match fallback, mirroring
      // the live case: the task's tags/title matched the Jetson brain's
      // capability tags, so pickClaimableTask happily re-selected it every
      // tick — the failure was purely server-side required_tags gating.
      tags: ['security'],
      status: 'open',
    };

    function capabilityMismatchClaimImpl() {
      return vi.fn(async (id: string) => {
        throw new Error(
          `HoloMesh PATCH /team/team_test/board/${id} 403: ` +
            JSON.stringify({
              error: 'Capability mismatch: agent lacks required tags for this task',
              code: 'capability_mismatch',
              required_tags: ['owned-metal'],
              missing_tags: ['owned-metal'],
              agent_capability_tags: [],
            })
        );
      });
    }

    it('PRE-FIX-SHAPE CHECK: without backoff state, the same unclaimable task is re-selected and re-claimed on every tick (proves the spin the fix must stop)', async () => {
      // This test does not disable the fix — it demonstrates that
      // pickClaimableTask alone (the pre-fix selection logic, unchanged by
      // this fix) has no memory of a prior failure and will deterministically
      // re-pick the same task every time it is called with the same input,
      // which is exactly the precondition that made the live spin possible.
      const { pickClaimableTask } = await import('../holomesh-client.js');
      const pick1 = pickClaimableTask([CAPABILITY_MISMATCH_TASK], BRAIN.capabilityTags);
      const pick2 = pickClaimableTask([CAPABILITY_MISMATCH_TASK], BRAIN.capabilityTags);
      const pick3 = pickClaimableTask([CAPABILITY_MISMATCH_TASK], BRAIN.capabilityTags);
      expect(pick1?.id).toBe('task_owned_metal_only');
      expect(pick2?.id).toBe('task_owned_metal_only');
      expect(pick3?.id).toBe('task_owned_metal_only');
    });

    it('POST-FIX: a 403 capability_mismatch on claim() starts a cooldown, so the next tick does not re-attempt the same task', async () => {
      const mesh = mockMesh({
        tasks: [CAPABILITY_MISMATCH_TASK],
        claimImpl: capabilityMismatchClaimImpl(),
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

      // Tick 1: picks the task, claim() 403s, runner absorbs it (does not throw)
      // and reports no-claimable-task instead of propagating to tick-error.
      const result1 = await runner.tick();
      expect(result1.action).toBe('no-claimable-task');
      expect(result1.message).toContain('capability_mismatch');
      expect(mesh.claim).toHaveBeenCalledTimes(1);
      expect(mesh.claim).toHaveBeenCalledWith('task_owned_metal_only');
      expect(events.some((e) => e.ev === 'claim-capability-mismatch-cooldown')).toBe(true);

      // Tick 2: the SAME task is still open on the board (server never granted
      // the claim), but the runner must NOT re-attempt it — this is the actual
      // spin the live regression exhibited (one claim attempt per tick,
      // forever). claim() call count must stay at 1.
      const result2 = await runner.tick();
      expect(result2.action).toBe('no-claimable-task');
      expect(mesh.claim).toHaveBeenCalledTimes(1); // <-- still 1, not 2: backoff held

      // Tick 3: still within cooldown, still no re-attempt.
      const result3 = await runner.tick();
      expect(result3.action).toBe('no-claimable-task');
      expect(mesh.claim).toHaveBeenCalledTimes(1);
    });

    it('the cooled-down task remains visible in getOpenTasks()/no-claimable-task open count — it is skipped as a candidate, not hidden from view', async () => {
      const mesh = mockMesh({
        tasks: [CAPABILITY_MISMATCH_TASK],
        claimImpl: capabilityMismatchClaimImpl(),
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

      await runner.tick(); // triggers the cooldown
      events.length = 0;
      await runner.tick(); // second tick, task is cooling down but must still be "seen"

      expect(mesh.getOpenTasks).toHaveBeenCalledTimes(2);
      const noClaimableEvent = events.find((e) => e.ev === 'no-claimable-task');
      expect(noClaimableEvent).toBeDefined();
      // open reflects the true board state (server still reports it open);
      // skippedForCooldown documents that it was excluded as a candidate.
      expect(noClaimableEvent?.open).toBe(1);
      expect(noClaimableEvent?.skippedForCooldown).toBe(1);
    });

    it('a claim() failure NOT tagged capability_mismatch still propagates unchanged (backoff is scoped to this one error code)', async () => {
      const mesh = mockMesh({
        tasks: [CAPABILITY_MISMATCH_TASK],
        claimImpl: vi.fn(async () => {
          throw new Error(
            'HoloMesh PATCH /team/team_test/board/task_owned_metal_only 500: internal error'
          );
        }),
      });
      const runner = new AgentRunner({
        identity: IDENTITY,
        brain: BRAIN,
        provider: mockProvider({ promptTokens: 1, completionTokens: 1 }),
        costGuard: freshGuard(),
        mesh: mesh as never,
      });

      await expect(runner.tick()).rejects.toThrow(/500: internal error/);
      // Unlike capability_mismatch, a generic server error is NOT swallowed
      // into a cooldown — it propagates to runForever's tick-error catch
      // exactly as before this fix, preserving existing error visibility for
      // transient/unrelated failures.
      await expect(runner.tick()).rejects.toThrow(/500: internal error/);
      expect(mesh.claim).toHaveBeenCalledTimes(2);
    });
  });
});
