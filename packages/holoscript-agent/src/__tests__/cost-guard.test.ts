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

  it('falls back to Anthropic pricer for unrecognized providers (safe default — fail loud on unknown model)', () => {
    expect(defaultPricerForProvider('openai')).toBe(defaultOpenAIPricer);
    expect(defaultPricerForProvider('some-future-provider')).toBe(defaultAnthropicPricer);
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
