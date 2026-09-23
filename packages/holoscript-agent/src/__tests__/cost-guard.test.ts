import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CostGuard,
  defaultAnthropicPricer,
  defaultLocalLlmPricer,
  defaultOpenAIPricer,
  defaultOpenRouterPricer,
  defaultPricerForProvider,
  defaultXAIPricer,
  OPENAI_PRICING_USD_PER_MTOK,
  XAI_PRICING_USD_PER_MTOK,
  ANTHROPIC_PRICING_USD_PER_MTOK,
  ANTHROPIC_PRICING_SCHEDULE_USD_PER_MTOK,
  priceUsageWithCacheSplit,
  resolveAnthropicPricing,
  resolveModelPricingOrFallback,
  resetUnpricedModelWarnings,
} from '../cost-guard.js';
import type { CostState } from '../types.js';

describe('defaultAnthropicPricer', () => {
  it('pins Opus 4.7 and 4.6 to the published reduced MTok rates', () => {
    expect(ANTHROPIC_PRICING_USD_PER_MTOK['claude-opus-4-7']).toEqual({
      input: 5,
      output: 25,
    });
    expect(ANTHROPIC_PRICING_USD_PER_MTOK['claude-opus-4-6']).toEqual({
      input: 5,
      output: 25,
    });
  });

  it('computes USD from token usage at the published rate', () => {
    const cost = defaultAnthropicPricer('claude-opus-4-7', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    const expected =
      ANTHROPIC_PRICING_USD_PER_MTOK['claude-opus-4-7'].input +
      ANTHROPIC_PRICING_USD_PER_MTOK['claude-opus-4-7'].output;
    expect(cost).toBeCloseTo(expected, 5);
  });

  it('uses the Claude Sonnet 5 intro price through 2026-08-31 and standard price after', () => {
    expect(ANTHROPIC_PRICING_USD_PER_MTOK['claude-sonnet-5']).toEqual({
      input: 2,
      output: 10,
    });
    expect(ANTHROPIC_PRICING_SCHEDULE_USD_PER_MTOK['claude-sonnet-5']).toHaveLength(2);
    expect(resolveAnthropicPricing('claude-sonnet-5', '2026-08-31')).toEqual({
      input: 2,
      output: 10,
    });
    expect(resolveAnthropicPricing('claude-sonnet-5', '2026-09-01')).toEqual({
      input: 3,
      output: 15,
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
      expect(
        defaultAnthropicPricer('claude-sonnet-5', {
          promptTokens: 1_000_000,
          completionTokens: 1_000_000,
          totalTokens: 2_000_000,
        })
      ).toBeCloseTo(18, 5);
    } finally {
      vi.useRealTimers();
    }
  });

  // REPLACED 2026-08-09 (task_1786310573633_wj1m). This used to assert
  // `.toThrowError(/No pricing configured/)` under the heading "so callers
  // cannot silently undercount". The throw produced the exact opposite: it
  // landed at runner.ts:1038, AFTER the paid `provider.complete()` calls and
  // BEFORE `state.spentUsd += costUsd`, outside the enclosing try — and both
  // driver loops swallowed it. So an unpriced model did not undercount by a
  // little, it undercounted to ZERO, forever, and the `isOverBudget()`
  // pre-flight never tripped. The new contract over-estimates instead: an
  // unpriced model bills at the most expensive known rate and warns once.
  it('bills an unknown model at the most expensive known rate instead of throwing', () => {
    resetUnpricedModelWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const usage = { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 };
      const cost = defaultAnthropicPricer('claude-imaginary-9000', usage);

      // No known model may be pricier than the fallback, or it is not a ceiling.
      for (const id of Object.keys(ANTHROPIC_PRICING_USD_PER_MTOK)) {
        expect(cost).toBeGreaterThanOrEqual(defaultAnthropicPricer(id, usage) - 1e-9);
      }
      expect(cost).toBeGreaterThan(0);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(/UPPER BOUND/);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns at most once per unpriced model id', () => {
    resetUnpricedModelWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const usage = { promptTokens: 10, completionTokens: 10, totalTokens: 20 };
      defaultAnthropicPricer('claude-imaginary-9001', usage);
      defaultAnthropicPricer('claude-imaginary-9001', usage);
      defaultAnthropicPricer('claude-imaginary-9002', usage);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  // The six ids the adapter's own supported-model table names but the pricing
  // table cannot price, plus a dated snapshot. Every one of these was reachable
  // in production and would have zeroed the budget guard.
  it('prices every supported-but-unlisted model without throwing', () => {
    resetUnpricedModelWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const usage = { promptTokens: 1_000, completionTokens: 1_000, totalTokens: 2_000 };
      for (const id of [
        'claude-mythos-5',
        'claude-sonnet-4-5',
        'claude-opus-4-1',
        'claude-mythos-preview',
        'claude-haiku-3-5',
        'claude-opus-4-5',
        'claude-opus-5-20260801',
      ]) {
        expect(() => defaultAnthropicPricer(id, usage)).not.toThrow();
        expect(defaultAnthropicPricer(id, usage)).toBeGreaterThan(0);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('resolves dated snapshots and bracketed annotations to the model they name', () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 0, totalTokens: 1_000_000 };
    // A dated snapshot prices as its alias, not as the fallback ceiling.
    expect(defaultAnthropicPricer('claude-opus-5-20260801', usage)).toBeCloseTo(
      defaultAnthropicPricer('claude-opus-5', usage),
      9
    );
    expect(
      defaultAnthropicPricer('claude-fable-5 [ultracode reference transcript replay]', usage)
    ).toBeCloseTo(defaultAnthropicPricer('claude-fable-5', usage), 9);
    expect(resolveModelPricingOrFallback('claude-opus-5-20260801').source).toBe('undated');
    expect(resolveModelPricingOrFallback('claude-opus-5 [replay]').source).toBe('undecorated');
    expect(resolveModelPricingOrFallback('claude-opus-5').source).toBe('exact');
  });

  it('never sniffs an unrecognized id to a free rate for the live guard', () => {
    resetUnpricedModelWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Ollama-shaped ids are $0 ONLY when the caller opts in (the offline
      // benchmark does). The live guard must not, or any unrecognized id is a
      // free pass past the budget.
      expect(resolveModelPricingOrFallback('qwen2.5-coder:7b').source).toBe('fallback');
      expect(resolveModelPricingOrFallback('qwen2.5-coder:7b', { localIdsFree: true }).source).toBe(
        'local'
      );
      expect(
        defaultAnthropicPricer('qwen2.5-coder:7b', {
          promptTokens: 1_000_000,
          completionTokens: 0,
          totalTokens: 1_000_000,
        })
      ).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });
});

// ===========================================================================
// task_1786310573633_wj1m — the budget guard must trip on an unpriced model.
//
// This is the end-to-end assertion the A-010 review asked for: "feed the
// repaired guard a genuinely unpriced model and confirm isOverBudget() still
// trips." Everything above tests the pricer; this tests the money.
// ===========================================================================
describe('CostGuard budget enforcement with unpriced models', () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cost-guard-unpriced-'));
    statePath = join(dir, 'cost.json');
    resetUnpricedModelWarnings();
  });

  it('accrues spend and trips isOverBudget for a model with no pricing row', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const guard = new CostGuard({ statePath, dailyBudgetUsd: 1 });
      expect(guard.isOverBudget()).toBe(false);

      const res = guard.recordUsage('claude-mythos-5', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      });

      // The regression this closes: spentUsd stayed 0 forever.
      expect(res.costUsd).toBeGreaterThan(0);
      expect(res.spentUsd).toBeGreaterThan(0);
      expect(guard.getState().spentUsd).toBeGreaterThan(1);
      expect(guard.isOverBudget()).toBe(true);
      expect(guard.getRemainingUsd()).toBe(0);
    } finally {
      warn.mockRestore();
    }
  });

  it('still accounts for the spend when the pricer throws outright', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Every non-Anthropic default pricer still throws by design on an unknown
      // model. That must not be able to skip the accrual — the provider call is
      // already paid for by the time recordUsage runs.
      const guard = new CostGuard({
        statePath,
        dailyBudgetUsd: 1,
        pricer: () => {
          throw new Error('No OpenRouter pricing configured for model "mystery/model"');
        },
      });

      const res = guard.recordUsage('mystery/model', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      });

      expect(res.costUsd).toBeGreaterThan(0);
      expect(guard.isOverBudget()).toBe(true);
      expect(warn).toHaveBeenCalled();
      // Persisted, not just in memory — a restarted supervisor must see it.
      const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as CostState;
      expect(persisted.spentUsd).toBeGreaterThan(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('treats a NaN cost as a pricing failure rather than poisoning the budget', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // NaN is worse than a throw: it propagates into spentUsd, and
      // `NaN >= budget` is false, so the guard silently never trips again.
      const guard = new CostGuard({
        statePath,
        dailyBudgetUsd: 1,
        pricer: () => Number.NaN,
      });

      guard.recordUsage('broken-pricer-model', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      });

      expect(Number.isFinite(guard.getState().spentUsd)).toBe(true);
      expect(guard.isOverBudget()).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps a zero-cost local pricer at zero (no false budget trip)', () => {
    const guard = new CostGuard({
      statePath,
      dailyBudgetUsd: 1,
      pricer: defaultLocalLlmPricer,
    });
    guard.recordUsage('Qwen/Qwen2.5-0.5B-Instruct', {
      promptTokens: 5_000_000,
      completionTokens: 5_000_000,
      totalTokens: 10_000_000,
    });
    expect(guard.getState().spentUsd).toBe(0);
    expect(guard.isOverBudget()).toBe(false);
  });
});

// 2026-04-26 mw02 boot loop fix: defaultAnthropicPricer was wired in for ALL
// providers regardless of which LLM the agent uses, causing local-llm workers
// (Qwen on Vast.ai) to tick-error every iteration with "No pricing configured".
// Local-llm compute is paid via the Vast hourly rental — token cost is $0 from
// the agent's perspective.
describe('defaultLocalLlmPricer', () => {
  it('returns 0 for any model + any usage (compute paid via GPU rental)', () => {
    expect(
      defaultLocalLlmPricer('Qwen/Qwen2.5-0.5B-Instruct', {
        promptTokens: 100_000,
        completionTokens: 100_000,
        totalTokens: 200_000,
      })
    ).toBe(0);
    expect(
      defaultLocalLlmPricer('Qwen/Qwen2.5-72B-Instruct-AWQ', {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      })
    ).toBe(0);
  });
});

describe('defaultPricerForProvider', () => {
  it('returns Anthropic pricer for "anthropic" provider', () => {
    const pricer = defaultPricerForProvider('anthropic');
    expect(pricer).toBe(defaultAnthropicPricer);
  });

  it('returns local-llm zero-pricer for "local-llm" provider', () => {
    const pricer = defaultPricerForProvider('local-llm');
    expect(pricer).toBe(defaultLocalLlmPricer);
    // And the returned pricer must actually return 0 for a typical local model:
    expect(
      pricer('Qwen/Qwen2.5-0.5B-Instruct', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      })
    ).toBe(0);
  });

  it('returns local-llm zero-pricer for "mock" provider (no real LLM, no token cost)', () => {
    expect(defaultPricerForProvider('mock')).toBe(defaultLocalLlmPricer);
  });

  it('returns fail-loud xAI and OpenRouter pricers for those providers', () => {
    expect(defaultPricerForProvider('xai')).toBe(defaultXAIPricer);
    expect(defaultPricerForProvider('openrouter')).toBe(defaultOpenRouterPricer);
    expect(() =>
      defaultPricerForProvider('xai')('grok-imaginary', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      })
    ).toThrowError(/No xAI pricing configured/);
    expect(() =>
      defaultPricerForProvider('openrouter')('vendor/model', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      })
    ).toThrowError(/No OpenRouter pricing configured/);
  });

  it('bills an unrecognized provider through the Anthropic table, but never at Claude\'s cache discount', () => {
    expect(defaultPricerForProvider('openai')).toBe(defaultOpenAIPricer);
    // Same rates as the Anthropic table (no cache fields: the plain formula) ...
    const plain = { promptTokens: 1_000, completionTokens: 100, totalTokens: 1_100 };
    expect(defaultPricerForProvider('some-future-provider')('claude-haiku-4-5', plain)).toBeCloseTo(
      defaultAnthropicPricer('claude-haiku-4-5', plain),
      12
    );
    // ... but a cached read is billed at full input, not at Claude's 0.1.
    const cached = { ...plain, cacheReadTokens: 800 };
    expect(defaultPricerForProvider('some-future-provider')('claude-haiku-4-5', cached)).toBeCloseTo(
      (1_000 * 1 + 100 * 5) / 1_000_000,
      12
    );
  });
});

describe('defaultOpenAIPricer', () => {
  it('prices GPT-5.6 Sol/Terra/Luna standard short-context rows', () => {
    expect(OPENAI_PRICING_USD_PER_MTOK['gpt-5.6-sol']).toEqual({ input: 5, output: 30 });
    expect(OPENAI_PRICING_USD_PER_MTOK['gpt-5.6']).toEqual({ input: 5, output: 30 });
    expect(OPENAI_PRICING_USD_PER_MTOK['gpt-5.6-terra']).toEqual({ input: 2.5, output: 15 });
    expect(OPENAI_PRICING_USD_PER_MTOK['gpt-5.6-luna']).toEqual({ input: 1, output: 6 });
    expect(
      defaultOpenAIPricer('gpt-5.6-luna', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      })
    ).toBeCloseTo(7, 5);
  });

  it('fails loud for unknown OpenAI text pricing rows', () => {
    expect(() =>
      defaultOpenAIPricer('gpt-5.6-imaginary', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      })
    ).toThrowError(/No OpenAI pricing configured/);
  });
});

// xAI pricing credential-verified 2026-07-10 via GET /v1/language-models
// (task task_1783674145823_tthf). Base-tier prices; long-context (>200K)
// doubles input+output and is intentionally not modeled in this flat dict.
describe('defaultXAIPricer', () => {
  it('prices grok-4.3 (HoloScript default) at $1.25/$2.50 per MTok', () => {
    expect(XAI_PRICING_USD_PER_MTOK['grok-4.3']).toEqual({ input: 1.25, output: 2.5 });
    expect(
      defaultXAIPricer('grok-4.3', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      })
    ).toBeCloseTo(3.75, 5);
  });

  it('prices grok-4.5 (launched 2026-07-08, non-default) at $2/$6 per MTok', () => {
    expect(XAI_PRICING_USD_PER_MTOK['grok-4.5']).toEqual({ input: 2.0, output: 6.0 });
    expect(
      defaultXAIPricer('grok-4.5', {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      })
    ).toBeCloseTo(8, 5);
  });

  it('prices grok-build-0.1 (coding model) at $1/$2 per MTok', () => {
    expect(XAI_PRICING_USD_PER_MTOK['grok-build-0.1']).toEqual({ input: 1.0, output: 2.0 });
  });
});

describe('CostGuard with local-llm pricer (regression: mw02 tick-error loop 2026-04-26)', () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cost-guard-local-llm-'));
    statePath = join(dir, 'cost-state.json');
  });

  it('records token usage but reports $0 spend so isOverBudget never trips on tokens', () => {
    const guard = new CostGuard({
      statePath,
      dailyBudgetUsd: 1, // very low cap that would trip on Anthropic pricing
      pricer: defaultLocalLlmPricer,
    });

    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
    const result = guard.recordUsage('Qwen/Qwen2.5-0.5B-Instruct', usage);

    expect(result.costUsd).toBe(0);
    expect(result.spentUsd).toBe(0);
    expect(result.remainingUsd).toBe(1); // full budget intact
    expect(guard.isOverBudget()).toBe(false);

    // Token totals still recorded for analytics
    const state = guard.getState();
    expect(state.promptTokens).toBe(1_000_000);
    expect(state.completionTokens).toBe(1_000_000);
    expect(state.callCount).toBe(1);
  });
});

describe('CostGuard', () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cost-guard-'));
    statePath = join(dir, 'state.json');
  });

  it('records usage, persists state, and reports remaining budget', () => {
    const guard = new CostGuard({ statePath, dailyBudgetUsd: 5 });
    const r = guard.recordUsage('claude-haiku-4-5', {
      promptTokens: 100_000,
      completionTokens: 50_000,
      totalTokens: 150_000,
    });
    expect(r.costUsd).toBeCloseTo(0.1 + 0.25, 5);
    expect(r.spentUsd).toBeCloseTo(r.costUsd, 5);
    expect(r.remainingUsd).toBeCloseTo(5 - r.costUsd, 5);
    const persisted = JSON.parse(readFileSync(statePath, 'utf8')) as CostState;
    expect(persisted.callCount).toBe(1);
    expect(persisted.spentUsd).toBeCloseTo(r.costUsd, 5);
    rmSync(dir, { recursive: true, force: true });
  });

  it('flips isOverBudget once spend crosses the daily cap', () => {
    const guard = new CostGuard({
      statePath,
      dailyBudgetUsd: 0.01,
      pricer: () => 0.005,
    });
    expect(guard.isOverBudget()).toBe(false);
    guard.recordUsage('any', { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    expect(guard.isOverBudget()).toBe(false);
    guard.recordUsage('any', { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
    expect(guard.isOverBudget()).toBe(true);
    expect(guard.getRemainingUsd()).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rolls over on UTC date change', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const stale: CostState = {
      date: yesterday,
      spentUsd: 999,
      promptTokens: 999,
      completionTokens: 999,
      callCount: 99,
    };
    writeFileSync(statePath, JSON.stringify(stale), 'utf8');
    const guard = new CostGuard({ statePath, dailyBudgetUsd: 5 });
    expect(guard.isOverBudget()).toBe(false);
    expect(guard.getState().spentUsd).toBe(0);
    expect(guard.getState().date).toBe(new Date().toISOString().slice(0, 10));
    rmSync(dir, { recursive: true, force: true });
  });

  it('uses a custom pricer when provided (paper-program ablation cost models)', () => {
    const guard = new CostGuard({
      statePath,
      dailyBudgetUsd: 5,
      pricer: (model, usage) => (model === 'free-local' ? 0 : usage.totalTokens / 1000),
    });
    const r = guard.recordUsage('free-local', {
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
    });
    expect(r.costUsd).toBe(0);
    const r2 = guard.recordUsage('paid-cloud', {
      promptTokens: 500,
      completionTokens: 500,
      totalTokens: 1000,
    });
    expect(r2.costUsd).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

// task_1786310573633_qf65 + task_1786310573633_o3gp (A-010 review 2026-08-09). The runner
// rebuilt its aggregate usage from three fields, dropping cacheReadTokens/cacheWriteTokens
// before recordUsage (cached prefix billed at 1.0x, up to 10x over), and the cache-split
// pricer applied Claude's 1.25 / 0.1 multipliers to every provider (OpenAI, xAI, Gemini,
// OpenRouter under-counted, so the cap tripped late).
describe('cache fields survive aggregation (qf65)', () => {
  it('addTokenUsage sums the three counts and keeps a cache field when either side carries it', async () => {
    const mod = await import('../cost-guard.js');
    expect(typeof mod.addTokenUsage).toBe('function');
    const sum = mod.addTokenUsage(
      { promptTokens: 1000, completionTokens: 50, totalTokens: 1050, cacheReadTokens: 800 },
      { promptTokens: 500, completionTokens: 25, totalTokens: 525, cacheReadTokens: 400, cacheWriteTokens: 100 }
    );
    expect(sum).toEqual({ promptTokens: 1500, completionTokens: 75, totalTokens: 1575, cacheReadTokens: 1200, cacheWriteTokens: 100 });
    const plain = mod.addTokenUsage(
      { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
      { promptTokens: 20, completionTokens: 2, totalTokens: 22 }
    );
    expect(plain).toEqual({ promptTokens: 30, completionTokens: 3, totalTokens: 33 });
    expect('cacheReadTokens' in plain).toBe(false);
  });

  it('the runner folds every response through addTokenUsage and never rebuilds the total from three fields', () => {
    const source = readFileSync(new URL('../../src/runner.ts', import.meta.url), 'utf8');
    expect(source.includes('promptTokens: aggUsage.promptTokens +')).toBe(false);
    expect((source.match(/addTokenUsage\(aggUsage, /g) ?? []).length).toBe(4);
  });
});

describe('per-provider cache policies (o3gp)', () => {
  const cachedPrompt = { promptTokens: 1000, completionTokens: 100, totalTokens: 1100, cacheReadTokens: 800 };

  it('OpenAI bills a cached read at full input (its discount runs down to none by model), never at the Claude tenth', () => {
    // gpt-5.6: $5 in / $30 out. 200 uncached + 800 cached at full input + 100 out.
    expect(defaultOpenAIPricer('gpt-5.6', cachedPrompt)).toBeCloseTo((200 * 5 + 800 * 5 * 1 + 100 * 30) / 1_000_000, 12);
  });

  it('xAI bills a cached read at a quarter of the input rate', () => {
    // grok-4.3: $1.25 in / $2.50 out.
    expect(defaultXAIPricer('grok-4.3', cachedPrompt)).toBeCloseTo((200 * 1.25 + 800 * 1.25 * 0.25 + 100 * 2.5) / 1_000_000, 12);
  });

  it('Anthropic bills reads at 0.1x and writes at the 1-hour 2x', () => {
    // claude-haiku-4-5: $1 in / $5 out. 100 uncached + 100 written + 800 read.
    const usage = { promptTokens: 1000, completionTokens: 0, totalTokens: 1000, cacheReadTokens: 800, cacheWriteTokens: 100 };
    expect(defaultAnthropicPricer('claude-haiku-4-5', usage)).toBeCloseTo((100 * 1 + 100 * 1 * 2 + 800 * 1 * 0.1) / 1_000_000, 12);
  });

  it('an unknown provider and OpenRouter bill the cache at full input and writes at 2x (fail closed); Gemini at a quarter', async () => {
    const mod = await import('../cost-guard.js');
    expect(mod.cachePolicyFor('made-up')).toEqual({ write: 2, read: 1 });
    expect(mod.cachePolicyFor(undefined)).toEqual({ write: 2, read: 1 });
    expect(mod.cachePolicyFor('constructor')).toEqual({ write: 2, read: 1 });
    expect(mod.cachePolicyFor('openrouter')).toEqual({ write: 2, read: 1 });
    expect(mod.cachePolicyFor('Gemini')).toEqual({ write: 1, read: 0.25 });
    expect(mod.cachePolicyFor('openai')).toEqual({ write: 1.25, read: 1 });
    expect(mod.cachePolicyFor('anthropic')).toEqual({ write: 2, read: 0.1 });
    // The shared pricer honours the policy it is handed.
    expect(mod.priceUsageWithCacheSplit(cachedPrompt, { input: 2, output: 4 }, mod.CACHE_POLICIES.gemini)).toBeCloseTo((200 * 2 + 800 * 2 * 0.25 + 100 * 4) / 1_000_000, 12);
  });
});

// claude2's review of #321 (2026-09-23, CHANGES REQUESTED, P1): once qf65 made the cache fields
// arrive, every path that named no cache policy fell back to Claude's 0.1 read discount: the
// shared pricer's default, both ceiling fallbacks, every provider billed through the Anthropic
// table, and the supervisor (pricer unset for every paid provider). Measured on OpenAI traffic,
// 200k prompt with 196k cached: o1's real bill 1.548 USD, the guard 0.251.
describe('no path bills another provider at Claude\'s cache discount (claude2 review of #321)', () => {
  const cachedPrompt = { promptTokens: 1000, completionTokens: 100, totalTokens: 1100, cacheReadTokens: 800 };

  it('the shared pricer bills the cache fail-closed when a caller passes no policy at runtime', () => {
    expect(priceUsageWithCacheSplit(cachedPrompt, { input: 2, output: 4 }, undefined as never)).toBeCloseTo(
      (200 * 2 + 800 * 2 * 1 + 100 * 4) / 1_000_000,
      12
    );
  });

  it('a provider billed through the Anthropic table prices the cache at its own policy', () => {
    const haiku = (read: number) => (200 * 1 + 800 * 1 * read + 100 * 5) / 1_000_000;
    expect(defaultPricerForProvider('anthropic')('claude-haiku-4-5', cachedPrompt)).toBeCloseTo(haiku(0.1), 12);
    expect(defaultPricerForProvider('gemini')('claude-haiku-4-5', cachedPrompt)).toBeCloseTo(haiku(0.25), 12);
    expect(defaultPricerForProvider('sovereign')('claude-haiku-4-5', cachedPrompt)).toBeCloseTo(haiku(1), 12);
  });

  it('the ceiling fallback bills a cached OpenAI prompt above its real bill (the measured case)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cost-guard-321-ceiling-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // o1 has no row in the OpenAI table, so the OpenAI pricer throws and the guard bills the ceiling.
      const guard = new CostGuard({
        statePath: join(dir, 'cost.json'),
        dailyBudgetUsd: 1000,
        pricer: defaultPricerForProvider('openai'),
      });
      const res = guard.recordUsage('o1', {
        promptTokens: 200_000,
        completionTokens: 300,
        totalTokens: 200_300,
        cacheReadTokens: 196_000,
      });
      // claude2 priced this call on o1's own sheet at 1.548 USD; a guard must not read less.
      expect(res.costUsd).toBeGreaterThanOrEqual(1.548);
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// task_1786329027132_mt9u. HOLOSCRIPT_AGENT_MODEL was never checked against the pricing tables
// at startup: an unpriced model (a typo, a newly adopted id) reached the runner, and the only
// signal was one console.warn on the first priced call while the day billed at the ceiling.
describe('the configured model is checked against the pricing tables at startup (mt9u)', () => {
  const usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cost-guard-mt9u-'));
    resetUnpricedModelWarnings();
  });

  it('says a model is unpriced exactly when the live guard bills it at the ceiling, for every provider', async () => {
    const mod = await import('../cost-guard.js');
    expect(typeof mod.describeModelPricing).toBe('function');
    const cases: Array<[string, string]> = [
      ['anthropic', 'claude-haiku-4-5'],
      ['anthropic', 'claude-opus-4-7-20260101'],
      ['anthropic', 'claude-fable-5 [replay transcript]'],
      ['anthropic', 'no-such-model-9'],
      ['openai', 'gpt-5.6'],
      ['openai', 'no-such-model-9'],
      ['openai', 'claude-haiku-4-5'],
      ['xai', 'grok-4.3'],
      ['xai', 'no-such-model-9'],
      ['openrouter', 'anthropic/claude-haiku-4-5'],
      ['gemini', 'gemini-3-pro'],
      ['sovereign', 'qwen2.5-coder:7b'],
      ['local-llm', 'Qwen/Qwen2.5-0.5B-Instruct'],
      ['mock', 'mock-1'],
      ['bitnet', 'bitnet-b1.58-2B'],
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const [provider, model] of cases) {
        resetUnpricedModelWarnings();
        warn.mockClear();
        const guard = new CostGuard({
          statePath: join(dir, `${provider}.json`),
          dailyBudgetUsd: 1000,
          pricer: mod.defaultPricerForProvider(provider),
        });
        guard.recordUsage(model, usage);
        const billedAtCeiling = warn.mock.calls.some((c) => String(c[0]).startsWith('[cost-guard]'));
        expect({ provider, model, priced: mod.describeModelPricing(provider, model).priced }).toEqual({
          provider,
          model,
          priced: !billedAtCeiling,
        });
      }
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the policy defaults to warn, reads warn or refuse in any case, and names a bad value', async () => {
    const mod = await import('../cost-guard.js');
    expect(typeof mod.unpricedModelPolicy).toBe('function');
    expect(mod.unpricedModelPolicy({})).toBe('warn');
    expect(mod.unpricedModelPolicy({ HOLOSCRIPT_AGENT_UNPRICED_MODEL: '  ' })).toBe('warn');
    expect(mod.unpricedModelPolicy({ HOLOSCRIPT_AGENT_UNPRICED_MODEL: 'REFUSE' })).toBe('refuse');
    expect(mod.unpricedModelPolicy({ HOLOSCRIPT_AGENT_UNPRICED_MODEL: ' warn ' })).toBe('warn');
    expect(() => mod.unpricedModelPolicy({ HOLOSCRIPT_AGENT_UNPRICED_MODEL: 'stop' })).toThrow(
      'HOLOSCRIPT_AGENT_UNPRICED_MODEL must be "warn" or "refuse", got "stop"'
    );
  });

  it('passes a priced model, and names the table and the other setting for an unpriced one', async () => {
    const mod = await import('../cost-guard.js');
    expect(typeof mod.checkConfiguredModelPricing).toBe('function');
    expect(mod.checkConfiguredModelPricing('anthropic', 'claude-opus-4-7', 'refuse').action).toBe('ok');
    expect(mod.checkConfiguredModelPricing('local-llm', 'anything', 'refuse').action).toBe('ok');
    const warned = mod.checkConfiguredModelPricing('openai', 'gpt-9-imaginary', 'warn');
    expect(warned.action).toBe('warn');
    expect(warned.pricing.table).toBe('OPENAI_PRICING_USD_PER_MTOK');
    expect(warned.message).toContain('"gpt-9-imaginary"');
    expect(warned.message).toContain('HOLOSCRIPT_AGENT_UNPRICED_MODEL=refuse');
    const refused = mod.checkConfiguredModelPricing('gemini', 'gemini-3-pro', 'refuse');
    expect(refused.action).toBe('refuse');
    expect(refused.message).toContain('provider gemini has no table of its own');
    expect(refused.message).toContain('HOLOSCRIPT_AGENT_UNPRICED_MODEL=warn');
  });

  it('an unpriced model still accrues at the ceiling (no regression of wj1m)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const guard = new CostGuard({ statePath: join(dir, 'wj1m.json'), dailyBudgetUsd: 1 });
      const res = guard.recordUsage('no-such-model-9', usage);
      const ceiling = resolveModelPricingOrFallback('no-such-model-9').price;
      expect(res.costUsd).toBeGreaterThan(0);
      expect(res.costUsd).toBeCloseTo((100 * ceiling.input + 50 * ceiling.output) / 1_000_000, 12);
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the single-agent run checks the routed model before it builds a provider, and refuses when told to', () => {
    const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8');
    const run = source.slice(
      source.indexOf('async function cmdRun'),
      source.indexOf('function supervisorProviderFactory')
    );
    const check = run.search(/checkConfiguredModelPricing\(\s*effectiveIdentity\.llmProvider,\s*effectiveIdentity\.llmModel/);
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(run.indexOf('buildProvider(effectiveIdentity)'));
    expect(run).toMatch(/if \(pricingCheck\.action === 'refuse'\) \{\s*throw new Error/);
  });
});
