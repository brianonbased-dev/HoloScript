import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CostGuard, defaultAnthropicPricer, ANTHROPIC_PRICING_USD_PER_MTOK } from '../cost-guard.js';
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
