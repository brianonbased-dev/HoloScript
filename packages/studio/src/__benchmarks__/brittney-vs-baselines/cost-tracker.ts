import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  resolveModelPricingOrFallback,
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

/**
 * Locally-hosted models bill no API cost.
 *
 * ASSUMPTION: local compute is treated as free. If you would rather amortize
 * GPU/power cost per token, replace this with a real rate — the benchmark's
 * cloud-vs-local Pareto comparison is only as honest as this number.
 */
export const LOCAL_MODEL_PRICING: ModelPricing = {
  input_per_mtok_usd: 0,
  output_per_mtok_usd: 0,
  cache_write_per_mtok_usd: 0,
  cache_read_per_mtok_usd: 0,
};

const warnedUnknownModels = new Set<string>();

/**
 * Resolve pricing for a model id, at a point in time.
 *
 * The resolution ORDER (exact → undecorated → undated → local → most-expensive
 * fallback) is no longer implemented here. It lives in
 * `resolveModelPricingOrFallback` in `@holoscript/holoscript-agent/cost-guard`,
 * alongside the rate table it resolves against, and this function is now a thin
 * projection of it into the benchmark's four-field `ModelPricing` shape.
 *
 * That consolidation is the same lesson as the table itself (see the header
 * comment above): this module's private copy of the RATES drifted a full
 * generation before it was merged upstream. A private copy of the RESOLUTION
 * would drift the same way — and this copy was the tested one, while the live
 * agent spend guard had no equivalent at all and threw instead, which is the
 * defect this consolidation closes.
 *
 * `localIdsFree` is on here and off in the live guard, deliberately: an offline
 * benchmark must cost local baselines at $0 or its Pareto comparison is a lie,
 * whereas the live guard learns locality from provider dispatch and must never
 * let an unrecognized id sniff its way to a free pass.
 *
 * @param at Date the run happened. Defaults to now. Pass the run's own
 *   timestamp to re-cost a historical benchmark at the rate that was actually
 *   in effect, rather than at today's.
 */
export function pricingFor(model_id: string, at?: Date | string): ModelPricing {
  const resolved = resolveModelPricingOrFallback(model_id, { at, localIdsFree: true });

  if (resolved.source === 'local') return LOCAL_MODEL_PRICING;

  // Unknown model: the shared resolver has already substituted the MOST
  // EXPENSIVE known rate, because this feeds `CostTracker.exceeded()` and the
  // safe failure mode is to over-estimate and stop early. Warn once per ID so a
  // missing entry is visible instead of silently distorting a whole run.
  if (resolved.source === 'fallback' && !warnedUnknownModels.has(model_id)) {
    warnedUnknownModels.add(model_id);
    console.warn(
      `[cost-tracker] No pricing entry for "${model_id}"; falling back to ` +
        `"${resolved.resolvedFrom}" rates (most expensive known). Costs for this ` +
        `model are an upper bound, not an estimate. Add it to ` +
        `ANTHROPIC_PRICING_USD_PER_MTOK in @holoscript/holoscript-agent/cost-guard.`
    );
  }

  return toModelPricing(resolved.price);
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
