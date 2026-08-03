import type { TokenUsage } from './types';

export interface ModelPricing {
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  cache_write_per_mtok_usd?: number;
  cache_read_per_mtok_usd?: number;
}

/**
 * Prompt-cache price multipliers, relative to a model's base input rate.
 * Uniform across the Claude line, so per-model cache rates are derived
 * rather than hand-maintained.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute TTL; the 1-hour TTL is 2x
export const CACHE_READ_MULTIPLIER = 0.1;

function priced(input_per_mtok_usd: number, output_per_mtok_usd: number): ModelPricing {
  return {
    input_per_mtok_usd,
    output_per_mtok_usd,
    cache_write_per_mtok_usd: input_per_mtok_usd * CACHE_WRITE_MULTIPLIER,
    cache_read_per_mtok_usd: input_per_mtok_usd * CACHE_READ_MULTIPLIER,
  };
}

/**
 * First-party Anthropic API list prices, USD per million tokens.
 *
 * Only models whose rates are known are listed — an absent model takes the
 * conservative fallback in `pricingFor()` rather than a guessed rate.
 *
 * Note: Sonnet 5 carries promotional pricing of $2/$10 through 2026-08-31.
 * The standard $3/$15 is used here deliberately: over-estimating is the safe
 * direction for a budget guard, and baking in a rate with an expiry date
 * would silently become wrong the day it lapses.
 *
 * These are first-party rates. Amazon Bedrock and Google Vertex are
 * partner-operated and priced separately.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-fable-5': priced(10, 50),
  'claude-mythos-5': priced(10, 50),
  'claude-opus-5': priced(5, 25),
  'claude-opus-4-8': priced(5, 25),
  'claude-opus-4-7': priced(5, 25),
  'claude-opus-4-6': priced(5, 25),
  'claude-sonnet-5': priced(3, 15),
  'claude-sonnet-4-6': priced(3, 15),
  'claude-haiku-4-5': priced(1, 5),
};

/** Most expensive known model — the conservative fallback for unknown IDs. */
const FALLBACK_MODEL_ID = 'claude-fable-5';

/**
 * Locally-hosted models bill no API cost.
 *
 * ASSUMPTION: local compute is treated as free. If you would rather amortize
 * GPU/power cost per token, replace this with a real rate — the benchmark's
 * cloud-vs-local Pareto comparison is only as honest as this number.
 *
 * Matching is deliberately narrow: an ID is local only if it is NOT a
 * `claude-*` ID and it looks like an Ollama tag (`qwen2.5-coder:7b`) or is
 * explicitly namespaced. Anything else unrecognized still takes the
 * conservative cloud fallback, so a genuinely unknown cloud model is never
 * silently costed at zero.
 */
export const LOCAL_MODEL_PRICING: ModelPricing = {
  input_per_mtok_usd: 0,
  output_per_mtok_usd: 0,
  cache_write_per_mtok_usd: 0,
  cache_read_per_mtok_usd: 0,
};

function isLocalModelId(model_id: string): boolean {
  if (model_id.startsWith('claude-')) return false;
  return /:/.test(model_id) || /^(ollama|local|holoserve|bitnet)[-/]?/i.test(model_id);
}

const warnedUnknownModels = new Set<string>();

export function pricingFor(model_id: string): ModelPricing {
  if (model_id in MODEL_PRICING) return MODEL_PRICING[model_id];

  // Strip a trailing bracketed annotation before lookup. Some configs decorate
  // the ID for provenance — `fable5-ultracode` reports
  // "claude-fable-5 [ultracode reference transcript replay]" — and that should
  // price as the model it names, by intent rather than by fallback coincidence.
  const undecorated = model_id.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  if (undecorated in MODEL_PRICING) return MODEL_PRICING[undecorated];

  // Dated snapshots (`claude-haiku-4-5-20251001`) price as their alias.
  // The previous `split('-').slice(0, 3)` normalization was broken for the
  // current four-segment ID scheme — it mapped `claude-sonnet-4-6` to
  // `claude-sonnet-4`, which is not a key, so every Sonnet/Haiku ID fell
  // through to the fallback.
  const undated = undecorated.replace(/-\d{8}$/, '');
  if (undated in MODEL_PRICING) return MODEL_PRICING[undated];

  // Locally-hosted model: no API cost. Checked before the unknown-model
  // fallback so local baselines stop being priced at frontier cloud rates
  // (they were billed as Opus 4.7 at $15/$75 before 2026-08-03).
  if (isLocalModelId(undecorated)) return LOCAL_MODEL_PRICING;

  // Unknown model. Fall back to the MOST EXPENSIVE known pricing rather than
  // an arbitrary entry: this feeds `CostTracker.exceeded()`, so the safe
  // failure mode is to over-estimate and stop early, never to under-estimate
  // and overspend. Warn once per ID so a missing entry is visible instead of
  // silently distorting a whole benchmark run.
  if (!warnedUnknownModels.has(model_id)) {
    warnedUnknownModels.add(model_id);
    console.warn(
      `[cost-tracker] No pricing entry for "${model_id}"; falling back to ` +
        `"${FALLBACK_MODEL_ID}" rates (most expensive known). Costs for this ` +
        `model are an upper bound, not an estimate. Add it to MODEL_PRICING.`
    );
  }
  return MODEL_PRICING[FALLBACK_MODEL_ID];
}

export function costOf(
  usage: TokenUsage,
  model_id: string,
  opts?: { localCompute?: boolean }
): number {
  // An explicit locality flag from the config beats id pattern-matching:
  // self-hosted routes report raw model names (GGUF filenames, HoloServe
  // artifact ids) that no prefix rule can reliably classify.
  const p = opts?.localCompute ? LOCAL_MODEL_PRICING : pricingFor(model_id);
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
  add(usage: TokenUsage, model_id: string, opts?: { localCompute?: boolean }): number {
    const delta = costOf(usage, model_id, opts);
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
