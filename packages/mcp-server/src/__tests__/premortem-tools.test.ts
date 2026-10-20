import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import * as llmProvider from '@holoscript/llm-provider';
import { tools } from '../tools';
import { handlePremortemTool } from '../premortem-handler';

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
    verdict: 'RESTRUCTURE_REQUIRED',
    summary: 'fixture model: the cache outlives the token that filled it.',
    failureStories: {
      mostLikely: {
        name: 'Friday deploy slips',
        whatHappened: 'Auth and caching landed together and blocked each other in review.',
        why: 'Two risky changes shipped as one.',
        whenWeKnew: 'The review queue passed two days.',
        whatItCost: 'One week of launch momentum.',
      },
      mostDangerous: {
        name: 'Stale authorisation',
        whatHappened: 'Cached responses kept serving users whose tokens had been revoked.',
        why: 'Cache keys ignored token identity.',
        whenWeKnew: "We didn't - that's what made it dangerous.",
        whatItCost: 'A data exposure report from an early adopter.',
      },
    },
    earlyWarningSigns: [
      {
        signal: 'Cache hit rate above 95% on authenticated routes',
        failure: 'Stale authorisation',
        threshold: 'Any authenticated route',
        checkFrequency: 'Every deploy',
      },
    ],
    hiddenAssumption: {
      assumption: 'A cached response is safe to serve to whoever asks next.',
      whyHidden: 'It holds for public routes, which were built first.',
      cascadeIfWrong: 'Every revoked token keeps reading data until the cache expires.',
      howToVerify: 'Revoke a token and request a cached route with it.',
    },
    revisedPlan: 'Ship auth first; key the cache by token; add caching the week after.',
    irreducibleRisks: [
      {
        risk: 'Redis outage during launch week',
        consequenceIfAccepted: 'Reads fall back to the database at higher latency.',
      },
    ],
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

describe('holo_premortem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the tool definition in the public tool list', () => {
    const tool = tools.find((t) => t.name === 'holo_premortem');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema?.properties?.target).toBeDefined();
    expect(tool?.inputSchema?.properties?.content).toBeDefined();
    expect(tool?.inputSchema?.properties?.context).toBeDefined();
  });

  it('returns structured output for a simple plan (no-provider fallback)', async () => {
    const result = await withNoProvider(() =>
      handlePremortemTool({
        target: 'Launch a new REST API with JWT auth and Redis caching',
        context: 'Ship deadline is Friday. Target audience is early adopters.',
      })
    );

    expect(result).toBeDefined();
    expect(result.meta.target).toBe('Launch a new REST API with JWT auth and Redis caching');
    expect(typeof result.verdict).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(result.failureStories).toBeDefined();
    expect(typeof result.failureStories.mostLikely).toBe('object');
    expect(typeof result.failureStories.mostDangerous).toBe('object');
    expect(Array.isArray(result.earlyWarningSigns)).toBe(true);
    expect(typeof result.hiddenAssumption).toBe('object');
    expect(typeof result.revisedPlan).toBe('string');
    expect(Array.isArray(result.irreducibleRisks)).toBe(true);
    // The no-provider branch really ran: no model was asked, and the verdict says why.
    expect(result.verdict).toBe('FATAL_FLAW');
    expect(result.summary).toContain('No LLM providers are configured');
    expect(result.meta.provider).toBeUndefined();
    expect(result.meta.attemptedProviders).toEqual([]);
    expect(fixtureModel.complete).not.toHaveBeenCalled();
  });

  it("maps the model's answer into the result and sends it the plan and context", async () => {
    const result = await handlePremortemTool({
      target: 'Launch a new REST API with JWT auth and Redis caching',
      context: 'Ship deadline is Friday. Target audience is early adopters.',
    });

    expect(result.meta.provider).toBe('mock');
    expect(result.meta.attemptedProviders).toEqual(['mock']);
    expect(result.verdict).toBe('RESTRUCTURE_REQUIRED');
    expect(result.summary).toBe(fixtureAnswer.summary);
    expect(result.failureStories).toEqual(fixtureAnswer.failureStories);
    expect(result.earlyWarningSigns).toEqual(fixtureAnswer.earlyWarningSigns);
    expect(result.hiddenAssumption).toEqual(fixtureAnswer.hiddenAssumption);
    expect(result.revisedPlan).toBe(fixtureAnswer.revisedPlan);
    expect(result.irreducibleRisks).toEqual(fixtureAnswer.irreducibleRisks);

    expect(fixtureModel.complete).toHaveBeenCalledTimes(1);
    expect(lastUserPrompt()).toContain(
      'PRE-MORTEM TARGET: Launch a new REST API with JWT auth and Redis caching'
    );
    expect(lastUserPrompt()).toContain(
      'CONTEXT: Ship deadline is Friday. Target audience is early adopters.'
    );
  });

  it('reads a file when target is a path and content is omitted', async () => {
    const result = await handlePremortemTool({
      target: './vitest.config.ts',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toMatch(/^file:/);
    // The file's text, not the path, is what the model was asked about.
    expect(lastUserPrompt()).toContain(
      fs.readFileSync(path.resolve('./vitest.config.ts'), 'utf-8')
    );
  });

  it('resolves "this" to a mode directive or falls back gracefully', async () => {
    // The directive is read from the temp dir; point it at an empty one of our own so the
    // result does not depend on whatever this machine's temp dir holds.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'premortem-this-'));
    onTestFinished(() => {
      vi.unstubAllEnvs();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    vi.stubEnv('TMPDIR', tmpDir);

    const fallback = await handlePremortemTool({
      target: 'this',
    });

    expect(fallback).toBeDefined();
    expect(fallback.meta.target).toMatch(/^this:/);
    expect(fallback.meta.target).toBe('this:unresolved');

    fs.writeFileSync(
      path.join(tmpDir, 'holomesh-mode-directive.md'),
      'MODE: stabilize - fix what is red before building anything new.'
    );
    const resolved = await handlePremortemTool({
      target: 'this',
    });

    expect(resolved.meta.target).toMatch(/^this:/);
    expect(resolved.meta.target).toBe('this:mode-directive');
    expect(lastUserPrompt()).toContain('MODE: stabilize - fix what is red');
  });

  it('rejects when target is neither builtin nor an existing file and content is empty', async () => {
    await expect(
      handlePremortemTool({
        target: '/nonexistent/path/to/file.xyz',
      })
    ).rejects.toThrow('holo_premortem:');
  });
});
