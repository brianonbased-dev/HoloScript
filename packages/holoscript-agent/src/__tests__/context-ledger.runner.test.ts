import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  ToolUseBlock,
} from '@holoscript/llm-provider';

/**
 * End-to-end through AgentRunner.tick(): the runner resends the whole task history
 * on every provider call, so a tool result the model has already seen must not be
 * sent a second time. runTool is stubbed so the test controls tool output exactly.
 */
const FILE_BODY = 'export const x = 1;\n'.repeat(400); // 8,000 chars

vi.mock('../tools.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tools.js')>();
  return {
    ...actual,
    runTool: vi.fn(async (use: ToolUseBlock) => ({
      type: 'tool_result' as const,
      tool_use_id: use.id,
      content: use.name === 'read_file' ? FILE_BODY : 'ok',
    })),
  };
});

const { AgentRunner } = await import('../runner.js');
const { CostGuard } = await import('../cost-guard.js');

type Step = { id: string; name: string; input: Record<string, unknown> } | 'text';

/** Provider that plays a fixed script and snapshots the messages it was sent. */
function scriptedProvider(script: Step[]) {
  const sent: string[] = [];
  let call = 0;
  const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
  const provider: ILLMProvider = {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      sent.push(JSON.stringify(req.messages));
      const step = script[Math.min(call++, script.length - 1)];
      if (step === 'text') {
        return { content: 'done', usage, model: 'mock-1', provider: 'mock', finishReason: 'stop' };
      }
      const block = { type: 'tool_use' as const, ...step };
      return {
        content: '',
        usage,
        model: 'mock-1',
        provider: 'mock',
        finishReason: 'tool_use',
        toolUses: [block],
        assistantBlocks: [block],
      } as unknown as LLMCompletionResponse;
    },
    async generateHoloScript() {
      throw new Error('not used');
    },
    async healthCheck() {
      return { ok: true, latencyMs: 1 };
    },
  };
  return { provider, sent };
}

function mesh() {
  const task = {
    id: 't-ledger',
    title: 'security memo',
    description: '',
    priority: 'high',
    tags: ['security'],
    status: 'open',
  };
  return {
    heartbeat: vi.fn(async () => undefined),
    joinTeam: vi.fn(async () => ({ success: true, role: 'member', members: 1 })),
    getOpenTasks: vi.fn(async () => [task]),
    claim: vi.fn(async () => task),
    sendMessageOnTask: vi.fn(async () => undefined),
    markDone: vi.fn(async () => undefined),
    postAuditRecords: vi.fn(async () => ({ appended: 0, rejected: 0 })),
    whoAmI: vi.fn(async () => ({ agentId: 'agent_test', surface: 'mock' })),
    queryTeamKnowledge: vi.fn(async () => []),
    queryPrivateKnowledge: vi.fn(async () => []),
    writePrivateKnowledge: vi.fn(async () => true),
    addTasks: vi.fn(async () => ({ added: 0 })),
    invokeTool: vi.fn(async () => ({ ok: true })),
  };
}

function runner(provider: ILLMProvider) {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-runner-'));
  return new AgentRunner({
    identity: {
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
    },
    brain: {
      brainPath: '/tmp/brain.hsplus',
      systemPrompt: 'You are a security auditor.',
      capabilityTags: ['security'],
      domain: 'security',
      scopeTier: 'warm',
      requires: [],
      prefers: [],
      avoids: [],
    },
    provider,
    costGuard: new CostGuard({
      statePath: join(dir, 's.json'),
      dailyBudgetUsd: 5,
      pricer: () => 0.001,
    }),
    mesh: mesh() as never,
  });
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const READ = { name: 'read_file', input: { path: '/root/holoscript-mesh/src/x.ts' } };
const BUILD = { name: 'bash', input: { cmd: 'pnpm vitest run' } };

describe('AgentRunner does not resend a tool result the model has already seen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a repeated identical read once, and points the repeat at the first copy', async () => {
    const { provider, sent } = scriptedProvider([
      { id: 'r1', ...READ },
      { id: 'r2', ...READ },
      { id: 'b1', ...BUILD },
      'text',
    ]);
    await runner(provider).tick();

    // Call 3 carries both reads in its history; the file body must appear once.
    const third = sent[2];
    expect(count(third, 'export const x = 1;')).toBe(400);
    const msgs = JSON.parse(third) as Array<{ role: string; content: unknown }>;
    const results = msgs
      .filter((m) => m.role === 'user' && Array.isArray(m.content))
      .flatMap((m) => m.content as Array<{ tool_use_id: string; content: string }>);
    const second = results.find((r) => r.tool_use_id === 'r2');
    expect(second).toBeDefined();
    expect(second!.content).toMatch(/^\[unchanged: identical to the result of read_file r1/);
    expect(second!.content.length).toBeLessThan(300);
  });

  it('still sends a result in full when its content differs from every earlier one', async () => {
    const { provider, sent } = scriptedProvider([
      { id: 'r1', ...READ },
      { id: 'b1', ...BUILD },
      'text',
    ]);
    await runner(provider).tick();
    expect(count(sent[1], 'export const x = 1;')).toBe(400);
    expect(sent[1]).not.toContain('[unchanged');
  });
});
