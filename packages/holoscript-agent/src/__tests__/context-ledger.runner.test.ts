import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

/**
 * Provider that plays a fixed script and snapshots the messages it was sent. `live`
 * keeps the runner's own history array, so a test can also see what the runner
 * appended after its last call.
 */
function scriptedProvider(script: Step[]) {
  const sent: string[] = [];
  const live: { messages: unknown[] } = { messages: [] };
  let call = 0;
  const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
  const provider: ILLMProvider = {
    name: 'mock',
    models: ['mock-1'],
    defaultHoloScriptModel: 'mock-1',
    async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
      sent.push(JSON.stringify(req.messages));
      live.messages = req.messages;
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
  return { provider, sent, live };
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

function runner(provider: ILLMProvider, llmProvider = 'anthropic') {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-runner-'));
  return new AgentRunner({
    identity: {
      handle: 'security-auditor',
      surface: 'security-auditor',
      wallet: '0x346126AbCdEf0123456789abcdef0123456789AB',
      x402Bearer: 'fake-bearer',
      llmProvider: llmProvider as never,
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
const WRITE = (n: number) => ({
  name: 'write_file',
  input: { path: `/root/holoscript-mesh/src/out${n}.ts`, content: `// ${n}\n`.padEnd(24_000, 'w') },
});

type ResultBlock = { tool_use_id: string; content: string };
function resultsIn(messages: unknown): ResultBlock[] {
  return (messages as Array<{ role: string; content: unknown }>)
    .filter((m) => m.role === 'user' && Array.isArray(m.content))
    .flatMap((m) => m.content as ResultBlock[]);
}

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
    const second = resultsIn(JSON.parse(third)).find((r) => r.tool_use_id === 'r2');
    expect(second).toBeDefined();
    expect(second!.content).toMatch(
      /^\[unchanged: identical to what the 1st read_file call with these same arguments returned \(tool_use_id r1;/
    );
    expect(second!.content.length).toBeLessThan(300);
  });

  it('elides a repeat that arrives through the re-prompt gate as well', async () => {
    // Read, then text without writing: the runner re-prompts once, and the model
    // reads the same file again. That result goes through a second admit site.
    const { provider, live } = scriptedProvider([
      { id: 'r1', ...READ },
      'text',
      { id: 'r2', ...READ },
      'text',
    ]);
    await runner(provider).tick();
    const results = resultsIn(live.messages);
    expect(results.find((r) => r.tool_use_id === 'r1')?.content).toBe(FILE_BODY);
    expect(results.find((r) => r.tool_use_id === 'r2')?.content).toMatch(
      /^\[unchanged: .*tool_use_id r1;/
    );
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

describe('AgentRunner on a local model never points at a copy the window has dropped', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('resends a repeated read in full when large writes sit between the two reads', async () => {
    // num_ctx 32768: (32768 - 8192 reserve) x 2 chars, minus the system prompt and
    // tool schemas. Three 24,000-char write_file turns put the first read far outside.
    vi.stubEnv('HOLOSCRIPT_LLM_NUM_CTX', '32768');
    const { provider, sent } = scriptedProvider([
      { id: 'r1', ...READ },
      { id: 'w1', ...WRITE(1) },
      { id: 'w2', ...WRITE(2) },
      { id: 'w3', ...WRITE(3) },
      { id: 'r2', ...READ },
      'text',
    ]);
    await runner(provider, 'local-llm').tick();
    const last = sent[5];
    expect(count(last, 'export const x = 1;')).toBe(800);
    expect(resultsIn(JSON.parse(last)).find((r) => r.tool_use_id === 'r2')?.content).toBe(
      FILE_BODY
    );
  });

  it('still elides a repeat that is close enough to be inside the window', async () => {
    vi.stubEnv('HOLOSCRIPT_LLM_NUM_CTX', '32768');
    const { provider, sent } = scriptedProvider([
      { id: 'r1', ...READ },
      { id: 'r2', ...READ },
      { id: 'b1', ...BUILD },
      'text',
    ]);
    await runner(provider, 'local-llm').tick();
    expect(count(sent[2], 'export const x = 1;')).toBe(400);
  });
});
