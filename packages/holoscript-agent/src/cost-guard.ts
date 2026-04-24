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
    this.rolloverIfNewDay();
    return this.state.spentUsd >= this.dailyBudgetUsd;
  }

  getRemainingUsd(): number {
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
