import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TokenUsage } from '@holoscript/llm-provider';
import type { CostState, ModelPricer } from './types.js';

export const ANTHROPIC_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function defaultAnthropicPricer(model: string, usage: TokenUsage): number {
  const price = ANTHROPIC_PRICING_USD_PER_MTOK[model];
  if (!price) {
    throw new Error(
      `No pricing configured for model "${model}" — add to ANTHROPIC_PRICING_USD_PER_MTOK or pass a custom pricer`
    );
  }
  return (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1_000_000;
}

/**
 * Pricer for local-llm providers (vLLM-on-GPU). The compute cost is the
 * Vast.ai (or other GPU) hourly rental, NOT per-token. From the agent's
 * perspective each LLM call has $0 marginal cost — the budget guard for
 * local-llm should track tick count or wall-clock time, not tokens.
 *
 * Returns 0 unconditionally. Token counts are still recorded in CostState
 * so usage analytics work, but cost-guard never trips on token spend.
 */
export function defaultLocalLlmPricer(_model: string, _usage: TokenUsage): number {
  return 0;
}

// xAI / Grok pricing — populated by /research task task_1778109552044_qed8.
// Empty until verified pricing lands. defaultXAIPricer throws on missing
// model with a helpful pointer (matches defaultAnthropicPricer behavior).
// Never paste training-era pricing here — F.014 / W.GOLD.341.
export const XAI_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {};

export function defaultXAIPricer(model: string, usage: TokenUsage): number {
  const price = XAI_PRICING_USD_PER_MTOK[model];
  if (!price) {
    throw new Error(
      `No xAI pricing configured for model "${model}" — populate XAI_PRICING_USD_PER_MTOK ` +
      `(see /research task_1778109552044_qed8 in docs/LLM_CAPABILITIES.md) or pass a custom pricer`
    );
  }
  return (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1_000_000;
}

// OpenRouter pricing is per-model and varies by upstream — populated lazily.
// Empty until verified pricing lands.
export const OPENROUTER_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {};

export function defaultOpenRouterPricer(model: string, usage: TokenUsage): number {
  const price = OPENROUTER_PRICING_USD_PER_MTOK[model];
  if (!price) {
    throw new Error(
      `No OpenRouter pricing configured for model "${model}" — populate OPENROUTER_PRICING_USD_PER_MTOK ` +
      `or pass a custom pricer`
    );
  }
  return (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1_000_000;
}

/**
 * Provider-aware default pricer dispatch. Picks the right pricer by
 * provider so the holoscript-agent runtime works for both Anthropic
 * (per-token billing) and local-llm (compute already paid via GPU
 * rental) without a custom pricer at every call site.
 *
 * Refs: 2026-04-26 mw02 boot loop — local-llm workers tick-erroring with
 * "No pricing configured for model 'Qwen/Qwen2.5-0.5B-Instruct'" because
 * defaultAnthropicPricer was wired in for ALL providers regardless of
 * which LLM the agent uses.
 *
 * Known gap (separate task): non-Anthropic non-local providers (openai,
 * gemini) still fall through to defaultAnthropicPricer here. xai +
 * openrouter were added 2026-05-06 with explicit dispatch + empty
 * pricing dicts (Lane A — see docs/LLM_CAPABILITIES.md).
 */
export function defaultPricerForProvider(
  provider: 'anthropic' | 'local-llm' | 'openai' | 'xai' | 'openrouter' | string
): ModelPricer {
  if (provider === 'local-llm' || provider === 'mock') return defaultLocalLlmPricer;
  if (provider === 'xai') return defaultXAIPricer;
  if (provider === 'openrouter') return defaultOpenRouterPricer;
  return defaultAnthropicPricer;
}

export class CostGuard {
  private state: CostState;
  private readonly statePath: string;
  private readonly dailyBudgetUsd: number;
  private readonly pricer: ModelPricer;

  constructor(opts: { statePath: string; dailyBudgetUsd: number; pricer?: ModelPricer }) {
    this.statePath = opts.statePath;
    this.dailyBudgetUsd = opts.dailyBudgetUsd;
    this.pricer = opts.pricer ?? defaultAnthropicPricer;
    this.state = this.loadOrInit();
  }

  recordUsage(model: string, usage: TokenUsage): { costUsd: number; spentUsd: number; remainingUsd: number } {
    this.rolloverIfNewDay();
    const costUsd = this.pricer(model, usage);
    this.state.spentUsd += costUsd;
    this.state.promptTokens += usage.promptTokens;
    this.state.completionTokens += usage.completionTokens;
    this.state.callCount += 1;
    this.persist();
    return {
      costUsd,
      spentUsd: this.state.spentUsd,
      remainingUsd: Math.max(0, this.dailyBudgetUsd - this.state.spentUsd),
    };
  }

  isOverBudget(): boolean {
    if (this.dailyBudgetUsd === 0) return false;
    this.rolloverIfNewDay();
    return this.state.spentUsd >= this.dailyBudgetUsd;
  }

  getRemainingUsd(): number {
    if (this.dailyBudgetUsd === 0) return Number.POSITIVE_INFINITY;
    this.rolloverIfNewDay();
    return Math.max(0, this.dailyBudgetUsd - this.state.spentUsd);
  }

  getState(): Readonly<CostState> {
    this.rolloverIfNewDay();
    return { ...this.state };
  }

  private rolloverIfNewDay(): void {
    const today = todayUtc();
    if (this.state.date !== today) {
      this.state = { date: today, spentUsd: 0, promptTokens: 0, completionTokens: 0, callCount: 0 };
      this.persist();
    }
  }

  private loadOrInit(): CostState {
    if (existsSync(this.statePath)) {
      const raw = readFileSync(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as CostState;
      if (parsed.date === todayUtc()) return parsed;
    }
    return { date: todayUtc(), spentUsd: 0, promptTokens: 0, completionTokens: 0, callCount: 0 };
  }

  private persist(): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
