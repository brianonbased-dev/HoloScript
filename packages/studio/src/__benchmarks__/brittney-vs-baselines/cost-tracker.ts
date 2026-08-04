import {
  ANTHROPIC_PRICING_USD_PER_MTOK,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  resolveAnthropicPricing,
} from '@holoscript/holoscript-agent/cost-guard';
import type { TokenUsage } from './types';

export { CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER };

export interface ModelPricing {
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  cache_write_per_mtok_usd?: number;
  cache_read_per_mtok_usd?: number;
}

/**
 * Rates come from `@holoscript/holoscript-agent/cost-guard`, which is the
 * single source of truth for Anthropic pricing across the repo — the same
 * table the live agent spend guard bills against.
 *
 * This module previously carried its own hardcoded copy. That copy drifted:
 * it listed Opus 4.7 at $15/$75 (Claude 3 Opus rates, a generation stale and
 * 3x high) and had no entry at all for Opus 5, Opus 4.8 or Sonnet 5. Two
 * tables meant two chances to be wrong, and the benchmark's was the one
 * nobody was billing against, so nobody noticed.
 *
 * The shared source is also DATE-BOUNDED via `resolveAnthropicPricing(id, at)`,
 * which this module could not express on its own. Sonnet 5 runs promotional
 * $2/$10 through 2026-08-31 and reverts to $3/$15 on 09-01; the old local copy
 * deliberately hardcoded the standard rate to avoid baking in an expiring
 * number. That workaround is no longer needed — a benchmark run is now priced
 * at the rate actually in effect on its run date, and a historical run can be
 * re-costed correctly by passing `at`.
 *
 * Cache rates stay derived from the base input rate rather than hand-listed,
 * so they cannot drift from it.
 */
function toModelPricing(price: { input: number; output: number }): ModelPricing {
  return {
    input_per_mtok_usd: price.input,
    output_per_mtok_usd: price.output,
    cache_write_per_mtok_usd: price.input * CACHE_WRITE_MULTIPLIER,
    cache_read_per_mtok_usd: price.input * CACHE_READ_MULTIPLIER,
  };
}

/** Most expensive known model — the conservative fallback for unknown IDs. */
const FALLBACK_MODEL_ID = 'claude-fable-5';

/**
 * The conservative fallback rate, computed from the shared table rather than
 * pinned to a literal, so adding a pricier model automatically raises the
 * ceiling instead of silently leaving it stale.
 */
function fallbackPricing(at?: Date | string): ModelPricing {
  let worst = resolveAnthropicPricing(FALLBACK_MODEL_ID, at);
  for (const id of Object.keys(ANTHROPIC_PRICING_USD_PER_MTOK)) {
    const candidate = resolveAnthropicPricing(id, at);
    if (candidate && (!worst || candidate.input > worst.input)) worst = candidate;
  }
  // The shared table always has entries, but stay total rather than assert.
  return toModelPricing(worst ?? { input: 10, output: 50 });
}

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

/**
 * Resolve pricing for a model id, at a point in time.
 *
 * @param at Date the run happened. Defaults to now. Pass the run's own
 *   timestamp to re-cost a historical benchmark at the rate that was actually
 *   in effect, rather than at today's.
 */
export function pricingFor(model_id: string, at?: Date | string): ModelPricing {
  const direct = resolveAnthropicPricing(model_id, at);
  if (direct) return toModelPricing(direct);

  // Strip a trailing bracketed annotation before lookup. Some configs decorate
  // the ID for provenance — `fable5-ultracode` reports
  // "claude-fable-5 [ultracode reference transcript replay]" — and that should
  // price as the model it names, by intent rather than by fallback coincidence.
  const undecorated = model_id.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const byUndecorated = resolveAnthropicPricing(undecorated, at);
  if (byUndecorated) return toModelPricing(byUndecorated);

  // Dated snapshots (`claude-haiku-4-5-20251001`) price as their alias.
  // The original `split('-').slice(0, 3)` normalization was broken for the
  // current four-segment ID scheme — it mapped `claude-sonnet-4-6` to
  // `claude-sonnet-4`, which is not a key, so every Sonnet/Haiku ID fell
  // through to the fallback.
  const undated = undecorated.replace(/-\d{8}$/, '');
  const byUndated = resolveAnthropicPricing(undated, at);
  if (byUndated) return toModelPricing(byUndated);

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
        `model are an upper bound, not an estimate. Add it to ` +
        `ANTHROPIC_PRICING_USD_PER_MTOK in @holoscript/holoscript-agent/cost-guard.`
    );
  }
  return fallbackPricing(at);
}

export function costOf(
  usage: TokenUsage,
  model_id: string,
  opts?: { localCompute?: boolean; at?: Date | string }
): number {
  // An explicit locality flag from the config beats id pattern-matching:
  // self-hosted routes report raw model names (GGUF filenames, HoloServe
  // artifact ids) that no prefix rule can reliably classify.
  const p = opts?.localCompute ? LOCAL_MODEL_PRICING : pricingFor(model_id, opts?.at);
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
  add(
    usage: TokenUsage,
    model_id: string,
    opts?: { localCompute?: boolean; at?: Date | string }
  ): number {
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
