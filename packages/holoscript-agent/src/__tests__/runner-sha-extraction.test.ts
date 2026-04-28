import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ILLMProvider, LLMCompletionRequest, LLMCompletionResponse, ToolResultBlock } from '@holoscript/llm-provider';

// Stub `../tools.js` BEFORE importing the runner so the bash tool returns a
// canned ToolResultBlock instead of spawning a real subprocess. Each test
// swaps the queued result via `setQueuedResult` to exercise the ok / is_error
// branches of the runner's SHA-extraction loop.
let queuedResult: ToolResultBlock = { type: 'tool_result', tool_use_id: 'tu-1', content: '' };
function setQueuedResult(r: ToolResultBlock): void {
  queuedResult = r;
}
vi.mock('../tools.js', async () => {
  const actual = await vi.importActual<typeof import('../tools.js')>('../tools.js');
  return {
    ...actual,
    runTool: vi.fn(async () => queuedResult),
  };
});

const { CostGuard } = await import('../cost-guard.js');
const { AgentRunner } = await import('../runner.js');
type AgentIdentity = import('../types.js').AgentIdentity;
type BoardTask = import('../types.js').BoardTask;
type RuntimeBrainConfig = import('../types.js').RuntimeBrainConfig;

function bashOnceProvider(): ILLMProvider {
  return {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      const isFirstCallOfTick = (req.messages?.length ?? 0) <= 2;
      const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      if (isFirstCallOfTick) {
        return {
          content: '',
          usage,
          model: 'mock-1',
          provider: 'mock',
          finishReason: 'tool_use',
          toolUses: [{ id: 'tu-1', name: 'bash', input: { cmd: 'vitest run --no-coverage' } }],
          assistantBlocks: [{ type: 'tool_use' as const, id: 'tu-1', name: 'bash', input: { cmd: 'vitest run --no-coverage' } }],
        } as unknown as LLMCompletionResponse;
      }
      return { content: 'final text', usage, model: 'mock-1', provider: 'mock', finishReason: 'stop' };
    },
    async generateHoloScript() { throw new Error('not used'); },
    async healthCheck() { return { ok: true, latencyMs: 1 }; },
  };
}

function mockMesh(tasks: BoardTask[]) {
  const markDoneCalls: Array<{ id: string; summary: string; commitHash?: string }> = [];
  return {
    markDoneCalls,
    heartbeat: vi.fn(async () => undefined),
    joinTeam: vi.fn(async () => ({ success: true, role: 'member', members: 1 })),
    getOpenTasks: vi.fn(async () => tasks),
    claim: vi.fn(async (id: string) => tasks.find((t) => t.id === id)!),
    sendMessageOnTask: vi.fn(async () => undefined),
    markDone: vi.fn(async (id: string, summary: string, commitHash?: string) => {
      markDoneCalls.push({ id, summary, commitHash });
    }),
    postAuditRecords: vi.fn(async () => ({ appended: 1, rejected: 0 })),
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
  systemPrompt: 'security auditor',
  capabilityTags: ['security'],
  domain: 'security',
  scopeTier: 'warm',
};

function freshGuard() {
  const dir = mkdtempSync(join(tmpdir(), 'sha-runner-'));
  return new CostGuard({
    statePath: join(dir, 's.json'),
    dailyBudgetUsd: 5,
    pricer: () => 0.001,
  });
}

describe('AgentRunner SHA extraction (regression: tr.is_error vs tr.isError typo)', () => {
  const TASK: BoardTask[] = [
    { id: 't-sha', title: 'security memo', description: '', priority: 'high', tags: ['security'], status: 'open' },
  ];

  it('extracts the commit SHA from successful bash stdout and forwards it to markDone', async () => {
    setQueuedResult({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: '[main abc1234] fix(test): regression\n 1 file changed',
    });
    const mesh = mockMesh(TASK);
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: bashOnceProvider(),
      costGuard: freshGuard(),
      mesh: mesh as never,
    });
    const result = await runner.tick();
    expect(result.action).toBe('executed');
    expect(mesh.markDoneCalls).toHaveLength(1);
    expect(mesh.markDoneCalls[0].commitHash).toBe('abc1234');
  });

  it('does NOT extract a SHA when the bash result is is_error: true (even if content matches /\\b[0-9a-f]{7,40}\\b/)', async () => {
    // Prior to the typo fix (tr.isError), this branch was taken because
    // `!tr.isError` evaluated to `!undefined` = true. The errored bash
    // result's content (which can legitimately contain hex strings like
    // "exit=1\nfatal: ambiguous argument 'deadbeef'") would then be scanned
    // and the false-positive SHA recorded as the commit hash on markDone.
    setQueuedResult({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      content: "exit=1\nfatal: ambiguous argument 'deadbeef': unknown revision",
      is_error: true,
    });
    const mesh = mockMesh(TASK);
    const runner = new AgentRunner({
      identity: IDENTITY,
      brain: BRAIN,
      provider: bashOnceProvider(),
      costGuard: freshGuard(),
      mesh: mesh as never,
    });
    await runner.tick();
    expect(mesh.markDoneCalls).toHaveLength(1);
    expect(mesh.markDoneCalls[0].commitHash).toBeUndefined();
  });
});
