import type { TokenUsage } from './types';

export interface ModelPricing {
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  cache_write_per_mtok_usd?: number;
  cache_read_per_mtok_usd?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7': {
    input_per_mtok_usd: 15,
    output_per_mtok_usd: 75,
    cache_write_per_mtok_usd: 18.75,
    cache_read_per_mtok_usd: 1.5,
  },
  'claude-sonnet-4-6': {
    input_per_mtok_usd: 3,
    output_per_mtok_usd: 15,
    cache_write_per_mtok_usd: 3.75,
    cache_read_per_mtok_usd: 0.3,
  },
  'claude-haiku-4-5-20251001': {
    input_per_mtok_usd: 1,
    output_per_mtok_usd: 5,
    cache_write_per_mtok_usd: 1.25,
    cache_read_per_mtok_usd: 0.1,
  },
};

export function pricingFor(model_id: string): ModelPricing {
  if (model_id in MODEL_PRICING) return MODEL_PRICING[model_id];
  const base = model_id.split('-').slice(0, 3).join('-');
  if (base in MODEL_PRICING) return MODEL_PRICING[base];
  return MODEL_PRICING['claude-opus-4-7'];
}

export function costOf(usage: TokenUsage, model_id: string): number {
  const p = pricingFor(model_id);
  const standardInput = usage.input_tokens / 1_000_000;
  const output = usage.output_tokens / 1_000_000;
  const cacheCreate = (usage.cache_creation_input_tokens ?? 0) / 1_000_000;
  const cacheRead = (usage.cache_read_input_tokens ?? 0) / 1_000_000;

  return (
    standardInput * p.input_per_mtok_usd +
    output * p.output_per_mtok_usd +
    cacheCreate * (p.cache_write_per_mtok_usd ?? p.input_per_mtok_usd * 1.25) +
    cacheRead * (p.cache_read_per_mtok_usd ?? p.input_per_mtok_usd * 0.1)
  );
}

export class CostTracker {
  private total = 0;
  constructor(private readonly budget_usd_max: number) {}
  add(usage: TokenUsage, model_id: string): number {
    const delta = costOf(usage, model_id);
    this.total += delta;
    return delta;
  }
  used(): number {
    return this.total;
  }
  remaining(): number {
    return Math.max(0, this.budget_usd_max - this.total);
  }
  exceeded(): boolean {
    return this.total > this.budget_usd_max;
  }
}
