import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CostGuard,
  defaultAnthropicPricer,
  defaultLocalLlmPricer,
  defaultPricerForProvider,
  ANTHROPIC_PRICING_USD_PER_MTOK,
} from '../cost-guard.js';
import type { CostState } from '../types.js';

describe('defaultAnthropicPricer', () => {
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

  it('throws on unknown model so callers cannot silently undercount', () => {
    expect(() =>
      defaultAnthropicPricer('claude-imaginary-9000', {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      })
    ).toThrowError(/No pricing configured/);
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

  it('falls back to Anthropic pricer for unrecognized providers (safe default — fail loud on unknown model)', () => {
    expect(defaultPricerForProvider('openai')).toBe(defaultAnthropicPricer);
    expect(defaultPricerForProvider('some-future-provider')).toBe(defaultAnthropicPricer);
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
    const r = guard.recordUsage('free-local', { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 });
    expect(r.costUsd).toBe(0);
    const r2 = guard.recordUsage('paid-cloud', { promptTokens: 500, completionTokens: 500, totalTokens: 1000 });
    expect(r2.costUsd).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
