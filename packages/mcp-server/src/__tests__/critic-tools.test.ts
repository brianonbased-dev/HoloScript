import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as llmProvider from '@holoscript/llm-provider';
import { tools } from '../tools';
import { handleCriticTool } from '../critic-handler';

/**
 * No test in this file reaches a live model or the network, whatever the shell exports.
 * createProviderManager registers a provider for every key or URL the shell sets
 * (OPENAI_API_KEY, XAI_API_KEY, HOLOSCRIPT_LOCAL_LLM_URL, ...). With
 * HOLOSCRIPT_MCP_AI_PROVIDER=local-llm the handler asked a busy local model first and waited
 * past the 60 s test timeout; a request that fails moves on to the next registered provider,
 * which can be a paid API. The factory is replaced by a fixture: one model, registered as
 * 'mock' (the test slot in the handler's provider order), that answers with fixed JSON and
 * records every request. withNoProvider() makes the factory throw the way the real one does
 * when nothing is configured.
 */
const { fixtureAnswer, fixtureModel, fixtureProviderManager } = vi.hoisted(() => {
  const fixtureAnswer = {
    verdict: 'FRAGILE',
    summary: 'fixture model: the speed claim has nothing under it.',
    findings: [
      {
        category: 'Serious',
        issue: 'The 10x claim names no benchmark.',
        why: 'The first skeptic asks for the number and the room is lost.',
        fix: 'Name the benchmark, the baseline and the command that reproduces it.',
        evidence: '"We are 10x faster than the competition."',
      },
    ],
    linesThatWillGetChallenged: [
      {
        lineOrClaim: 'We are 10x faster than the competition.',
        challenge: 'Faster at what, measured how, against whom?',
        betterVersion: 'Cold start is 10x faster than X on benchmark Y (command in the appendix).',
      },
    ],
    claimsWithoutEvidence: [
      {
        claim: '10x faster',
        whatsMissing: 'A reproducible measurement',
        howToProve: 'Publish the benchmark run and its raw numbers.',
      },
    ],
    skepticView: 'Every pitch says 10x. Show me the run.',
    whatWouldMakeItUndeniable: ['A public benchmark anyone can rerun'],
  };
  type FixtureRequest = { messages: Array<{ role: string; content: string }> };
  const fixtureModel = {
    complete: vi.fn(async (_request: FixtureRequest) => ({
      content: JSON.stringify(fixtureAnswer),
    })),
  };
  return {
    fixtureAnswer,
    fixtureModel,
    fixtureProviderManager: () => ({
      getRegisteredProviders: () => ['mock'],
      getProvider: (name: string) => (name === 'mock' ? fixtureModel : undefined),
    }),
  };
});

vi.mock('@holoscript/llm-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@holoscript/llm-provider')>()),
  createProviderManager: vi.fn(fixtureProviderManager),
}));

/**
 * Run `fn` with the provider factory throwing what the real one throws when no key or local
 * URL is set, so the handler takes its no-provider branch. The fixture is put back afterwards
 * even if an assertion throws.
 */
async function withNoProvider<T>(fn: () => Promise<T>): Promise<T> {
  const factory = vi.mocked(llmProvider.createProviderManager);
  factory.mockImplementation(() => {
    throw new Error('No LLM providers available (hermetic test: nothing configured)');
  });
  try {
    return await fn();
  } finally {
    factory.mockImplementation(
      fixtureProviderManager as unknown as typeof llmProvider.createProviderManager
    );
  }
}

/** The user message of the latest request the fixture model received. */
function lastUserPrompt(): string {
  const request = fixtureModel.complete.mock.lastCall?.[0];
  return request?.messages.find((m) => m.role === 'user')?.content ?? '';
}

describe('holo_critic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the tool definition in the public tool list', () => {
    const tool = tools.find((t) => t.name === 'holo_critic');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema?.properties?.target).toBeDefined();
    expect(tool?.inputSchema?.properties?.content).toBeDefined();
    expect(tool?.inputSchema?.properties?.mode).toBeDefined();
  });

  it('returns structured output for code mode (no-provider fallback)', async () => {
    const result = await withNoProvider(() =>
      handleCriticTool({
        target: 'tests',
        content: 'function add(a,b){return a+b}',
        mode: 'code',
      })
    );

    expect(result).toBeDefined();
    expect(result.meta.target).toBe('tests');
    expect(result.meta.mode).toBe('code');
    expect(typeof result.verdict).toBe('string');
    expect(Array.isArray(result.findings)).toBe(true);
    // The no-provider branch really ran: no model was asked, and the finding says why.
    expect(result.verdict).toBe('NOT_READY');
    expect(result.summary).toContain('No LLM providers are configured');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe('Critical');
    expect(result.meta.provider).toBeUndefined();
    expect(result.meta.attemptedProviders).toEqual([]);
    expect(fixtureModel.complete).not.toHaveBeenCalled();
  });

  it('returns structured output for pitch mode (no-provider fallback)', async () => {
    const result = await withNoProvider(() =>
      handleCriticTool({
        target: 'pitch',
        content: 'We are 10x faster than the competition.',
        mode: 'pitch',
      })
    );

    expect(result).toBeDefined();
    expect(result.meta.mode).toBe('pitch');
    expect(typeof result.verdict).toBe('string');
    expect(Array.isArray(result.findings)).toBe(true);
    // The no-provider branch really ran: no model was asked, and the finding says why.
    expect(result.verdict).toBe('NOT_READY');
    expect(result.summary).toContain('No LLM providers are configured');
    expect(result.meta.provider).toBeUndefined();
    expect(result.meta.attemptedProviders).toEqual([]);
    expect(fixtureModel.complete).not.toHaveBeenCalled();
  });

  it("maps the model's pitch answer into the result and sends it the content", async () => {
    const result = await handleCriticTool({
      target: 'pitch',
      content: 'We are 10x faster than the competition.',
      mode: 'pitch',
    });

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.attemptedProviders).toEqual(['mock']);
    expect(result.verdict).toBe('FRAGILE');
    expect(result.summary).toBe(fixtureAnswer.summary);
    expect(result.findings).toEqual(fixtureAnswer.findings);
    expect(result.pitchExtras).toEqual({
      linesThatWillGetChallenged: fixtureAnswer.linesThatWillGetChallenged,
      claimsWithoutEvidence: fixtureAnswer.claimsWithoutEvidence,
      skepticView: fixtureAnswer.skepticView,
      whatWouldMakeItUndeniable: fixtureAnswer.whatWouldMakeItUndeniable,
    });

    expect(fixtureModel.complete).toHaveBeenCalledTimes(1);
    expect(lastUserPrompt()).toContain('MODE: pitch');
    expect(lastUserPrompt()).toContain('We are 10x faster than the competition.');
  });

  it('reads a file when target is a path and content is omitted', async () => {
    const result = await handleCriticTool({
      target: './vitest.config.ts',
      mode: 'code',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toMatch(/^file:/);
    // The file's text, not the path, is what the model was asked about.
    expect(lastUserPrompt()).toContain(
      fs.readFileSync(path.resolve('./vitest.config.ts'), 'utf-8')
    );
  });

  it('rejects when target is neither builtin nor an existing file and content is empty', async () => {
    await expect(
      handleCriticTool({
        target: '/nonexistent/path/to/file.xyz',
        mode: 'code',
      })
    ).rejects.toThrow('holo_critic:');
  });
});
