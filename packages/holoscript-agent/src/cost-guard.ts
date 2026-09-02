import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TokenUsage, AudioUsage } from '@holoscript/llm-provider';
import type { CostState, ModelPricer } from './types.js';

export interface PricingPeriodUsdPerMTok {
  effectiveFrom: string;
  effectiveThrough?: string;
  price: { input: number; output: number };
}

export const ANTHROPIC_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Corrected 2026-08-03: Opus 4.8 was listed at $10/$50 with a comment
  // claiming it was "3× cheaper than 4.7" — while pricing it at DOUBLE the
  // 4.7 row directly beneath it. Both models are $5/$25. Because
  // `claude-opus-4-8` is CLOUD_DEFAULT_MODEL, every agent on the default
  // model was billed 2× actual against HOLOSCRIPT_AGENT_BUDGET_USD_DAY and
  // tripped its daily cap at half the real spend.
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-sonnet-5': { input: 2, output: 10 }, // Intro pricing through 2026-08-31; schedule below flips after.
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * Prompt-cache price multipliers, relative to a model's base input rate.
 * Uniform across the Claude line.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute TTL; the 1-hour TTL is 2x
export const CACHE_READ_MULTIPLIER = 0.1;

export const ANTHROPIC_PRICING_SCHEDULE_USD_PER_MTOK: Record<
  string,
  readonly PricingPeriodUsdPerMTok[]
> = {
  'claude-sonnet-5': [
    {
      effectiveFrom: '2026-06-30',
      effectiveThrough: '2026-08-31',
      price: { input: 2, output: 10 },
    },
    {
      effectiveFrom: '2026-09-01',
      price: { input: 3, output: 15 },
    },
  ],
};

function priceDateKey(at: Date | string = new Date()): string {
  return typeof at === 'string' ? at.slice(0, 10) : at.toISOString().slice(0, 10);
}

export function resolveAnthropicPricing(
  model: string,
  at: Date | string = new Date()
): { input: number; output: number } | undefined {
  const schedule = ANTHROPIC_PRICING_SCHEDULE_USD_PER_MTOK[model];
  if (schedule) {
    const key = priceDateKey(at);
    const period = schedule.find(
      (entry) =>
        key >= entry.effectiveFrom && (!entry.effectiveThrough || key <= entry.effectiveThrough)
    );
    if (period) return period.price;
  }
  return ANTHROPIC_PRICING_USD_PER_MTOK[model];
}

/**
 * Price a `TokenUsage` against a per-MTok rate, splitting the prompt-cache
 * components out at their own multipliers.
 *
 * `promptTokens` is the FULL prompt and INCLUDES any portion served from or
 * written to a provider-side prompt cache. Billing all of it at the base input
 * rate over-states a cache read by 10×, and an agent on a stable system prefix
 * reads from cache on nearly every tick — so this is the dominant term, not a
 * rounding error.
 *
 * No-op for providers that do not report cache usage: both fields are
 * undefined there, `uncachedInput === promptTokens`, and the arithmetic
 * collapses to the plain input+output formula this replaced.
 */
function priceUsageWithCacheSplit(
  usage: TokenUsage,
  price: { input: number; output: number }
): number {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const uncachedInput = Math.max(0, usage.promptTokens - cacheRead - cacheWrite);

  return (
    (uncachedInput * price.input +
      cacheWrite * price.input * CACHE_WRITE_MULTIPLIER +
      cacheRead * price.input * CACHE_READ_MULTIPLIER +
      usage.completionTokens * price.output) /
    1_000_000
  );
}

/**
 * Model id whose rate seeds the conservative fallback. The actual ceiling is
 * recomputed across the whole table (see `mostExpensivePricing`), so adding a
 * pricier model raises it automatically instead of leaving this stale.
 */
export const FALLBACK_PRICING_MODEL_ID = 'claude-fable-5';

/** Locally-hosted models bill no API cost. */
export const LOCAL_MODEL_PRICE: { input: number; output: number } = { input: 0, output: 0 };

/**
 * How a model id was matched. Anything other than `exact` means the id was not
 * a literal table key — `fallback` in particular means the cost is an UPPER
 * BOUND, not an estimate.
 */
export type PricingResolutionSource = 'exact' | 'undecorated' | 'undated' | 'local' | 'fallback';

export interface ResolvedModelPricing {
  price: { input: number; output: number };
  source: PricingResolutionSource;
  /** The id actually used for the successful lookup. */
  resolvedFrom: string;
}

/**
 * A model id is local only if it is NOT a `claude-*` id and it either looks
 * like an Ollama tag (`qwen2.5-coder:7b`) or is explicitly namespaced.
 * Deliberately narrow: anything else unrecognized takes the conservative cloud
 * fallback, so a genuinely unknown CLOUD model is never costed at zero.
 */
export function isLocalModelId(model: string): boolean {
  if (model.startsWith('claude-')) return false;
  return /:/.test(model) || /^(ollama|local|holoserve|bitnet)[-/]?/i.test(model);
}

/**
 * The most expensive rate in a pricing table, at a point in time. Computed
 * rather than pinned to a literal so a newly-added pricier model raises the
 * ceiling on its own.
 */
export function mostExpensivePricing(
  table: Record<string, { input: number; output: number }> = ANTHROPIC_PRICING_USD_PER_MTOK,
  at?: Date | string
): { input: number; output: number } {
  let worst: { input: number; output: number } | undefined;
  for (const id of Object.keys(table)) {
    // Date-bounded schedules only exist for the Anthropic table; for every
    // other table `resolveAnthropicPricing` misses and the raw row is used.
    const candidate =
      (table === ANTHROPIC_PRICING_USD_PER_MTOK ? resolveAnthropicPricing(id, at) : undefined) ??
      table[id];
    if (candidate && (!worst || candidate.input > worst.input)) worst = candidate;
  }
  return worst ?? { input: 10, output: 50 };
}

/**
 * The absolute ceiling across every token-priced provider table. Used when a
 * pricer fails outright and the accounting still has to charge something: the
 * safe failure mode is to over-estimate and stop early, never to under-estimate
 * and overspend.
 */
export function ceilingPricingAcrossProviders(at?: Date | string): {
  input: number;
  output: number;
} {
  const tables = [
    ANTHROPIC_PRICING_USD_PER_MTOK,
    XAI_PRICING_USD_PER_MTOK,
    OPENAI_PRICING_USD_PER_MTOK,
    OPENROUTER_PRICING_USD_PER_MTOK,
  ];
  let worst: { input: number; output: number } | undefined;
  for (const table of tables) {
    if (Object.keys(table).length === 0) continue;
    const candidate = mostExpensivePricing(table, at);
    if (!worst || candidate.input > worst.input) worst = candidate;
  }
  return worst ?? { input: 10, output: 50 };
}

/**
 * Resolve pricing for a model id, ALWAYS returning a rate.
 *
 * Resolution order: exact key → id with a trailing bracketed annotation
 * stripped (`claude-fable-5 [replay transcript]`) → id with a trailing dated
 * snapshot suffix stripped (`claude-haiku-4-5-20251001`) → optionally a
 * zero rate for locally-hosted ids → the most expensive known rate.
 *
 * This is the canonical resolver. It replaced a throw in
 * `defaultAnthropicPricer` that was strictly worse than a ceiling estimate:
 * because `CostGuard.recordUsage` prices BEFORE it accrues, the throw aborted
 * the accrual after the provider call had already been paid for, so
 * `spentUsd` stayed 0 and `isOverBudget()` never tripped. Charging an upper
 * bound over-states spend; throwing under-stated it to zero and made the
 * budget unenforceable.
 *
 * @param opts.localIdsFree Treat Ollama-style/namespaced ids as $0. Correct for
 *   offline benchmark costing, WRONG for the live guard — there, locality is
 *   decided by provider dispatch (`defaultPricerForProvider`), and id-sniffing
 *   to zero would be a hole any unrecognized id could fall through.
 */
export function resolveModelPricingOrFallback(
  model: string,
  opts: { at?: Date | string; localIdsFree?: boolean } = {}
): ResolvedModelPricing {
  const { at, localIdsFree = false } = opts;

  const exact = resolveAnthropicPricing(model, at);
  if (exact) return { price: exact, source: 'exact', resolvedFrom: model };

  // Some configs decorate the id for provenance — `fable5-ultracode` reports
  // "claude-fable-5 [ultracode reference transcript replay]" — and that should
  // price as the model it names, by intent rather than by fallback coincidence.
  const undecorated = model.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  const byUndecorated = resolveAnthropicPricing(undecorated, at);
  if (byUndecorated)
    return { price: byUndecorated, source: 'undecorated', resolvedFrom: undecorated };

  // Dated snapshots (`claude-haiku-4-5-20251001`) price as their alias.
  const undated = undecorated.replace(/-\d{8}$/, '');
  const byUndated = resolveAnthropicPricing(undated, at);
  if (byUndated) return { price: byUndated, source: 'undated', resolvedFrom: undated };

  if (localIdsFree && isLocalModelId(undecorated)) {
    return { price: LOCAL_MODEL_PRICE, source: 'local', resolvedFrom: undecorated };
  }

  return {
    price: mostExpensivePricing(ANTHROPIC_PRICING_USD_PER_MTOK, at),
    source: 'fallback',
    resolvedFrom: FALLBACK_PRICING_MODEL_ID,
  };
}

const warnedUnpricedModels = new Set<string>();

/** Test seam: clear the warn-once ledger so a spec can observe the warning. */
export function resetUnpricedModelWarnings(): void {
  warnedUnpricedModels.clear();
}

/** Warn at most once per model id, so a missing row is visible but not spammy. */
function warnUnpricedOnce(model: string, tableName: string): void {
  if (warnedUnpricedModels.has(model)) return;
  warnedUnpricedModels.add(model);
  console.warn(
    `[cost-guard] No pricing entry for model "${model}"; billing it at the most ` +
      `expensive known rate. Spend recorded for this model is an UPPER BOUND, not ` +
      `an estimate — add it to ${tableName} to bill accurately.`
  );
}

/**
 * Anthropic pricer. Never throws on an unknown model: an unpriced model is
 * charged at the most expensive known rate and warned about once.
 *
 * It used to throw. That looked like the cautious choice and was the opposite
 * of one — see `resolveModelPricingOrFallback` for why (the throw landed after
 * the paid call and before the accrual, leaving `spentUsd` at 0 forever).
 */
export function defaultAnthropicPricer(model: string, usage: TokenUsage): number {
  const resolved = resolveModelPricingOrFallback(model);
  if (resolved.source === 'fallback') {
    warnUnpricedOnce(model, 'ANTHROPIC_PRICING_USD_PER_MTOK');
  }
  return priceUsageWithCacheSplit(usage, resolved.price);
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

// xAI / Grok pricing — credential-verified 2026-07-10 via GET
// https://api.x.ai/v1/language-models (task task_1783674145823_tthf; see
// docs/llm-capabilities/xai-grok.md and XAI_MODEL_CAPABILITIES in
// @holoscript/llm-provider for the full per-model surface).
// Base-tier prices only: above each model's 200K long-context threshold the
// API doubles input AND output prices, and cached input is cheaper — this
// flat dict under-estimates long-context requests (conservative fields live
// in XAI_MODEL_CAPABILITIES). defaultXAIPricer throws on missing model with
// a helpful pointer (matches defaultAnthropicPricer behavior).
// Never paste training-era pricing here — F.014 / W.GOLD.341.
export const XAI_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'grok-4.3': { input: 1.25, output: 2.5 }, // HoloScript xAI default
  'grok-4.5': { input: 2.0, output: 6.0 }, // launched 2026-07-08; NOT default (eval-gated)
  'grok-build-0.1': { input: 1.0, output: 2.0 }, // alias grok-code-fast-1
  'grok-4.20-0309-reasoning': { input: 1.25, output: 2.5 },
  'grok-4.20-0309-non-reasoning': { input: 1.25, output: 2.5 },
  'grok-4.20-multi-agent-0309': { input: 1.25, output: 2.5 },
};

export function defaultXAIPricer(model: string, usage: TokenUsage): number {
  const price = XAI_PRICING_USD_PER_MTOK[model];
  if (!price) {
    throw new Error(
      `No xAI pricing configured for model "${model}" — add to XAI_PRICING_USD_PER_MTOK ` +
        `(credential-verify via /v1/language-models; see docs/llm-capabilities/xai-grok.md) ` +
        `or pass a custom pricer`
    );
  }
  return priceUsageWithCacheSplit(usage, price);
}

// OpenRouter pricing is per-model and varies by upstream — populated lazily.
// Empty until verified pricing lands.
// OpenAI GPT-5.6 text pricing — official OpenAI pricing/model docs verified
// 2026-07-13. Flat table uses standard short-context rows; long-context,
// batch, priority, cache-write, and cached-input dimensions are separate
// surfaces and must not be silently collapsed into this two-field token pricer.
export const OPENAI_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2.5, output: 15 },
  'gpt-5.6-luna': { input: 1, output: 6 },
  'gpt-5.5': { input: 5, output: 30 },
};

export function defaultOpenAIPricer(model: string, usage: TokenUsage): number {
  const price = OPENAI_PRICING_USD_PER_MTOK[model];
  if (!price) {
    throw new Error(
      `No OpenAI pricing configured for model "${model}" — add to OPENAI_PRICING_USD_PER_MTOK ` +
        `(verify via official OpenAI models/pricing docs) or pass a custom pricer`
    );
  }
  return priceUsageWithCacheSplit(usage, price);
}

export const OPENROUTER_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> =
  {};

export function defaultOpenRouterPricer(model: string, usage: TokenUsage): number {
  const price = OPENROUTER_PRICING_USD_PER_MTOK[model];
  if (!price) {
    throw new Error(
      `No OpenRouter pricing configured for model "${model}" — populate OPENROUTER_PRICING_USD_PER_MTOK ` +
        `or pass a custom pricer`
    );
  }
  return priceUsageWithCacheSplit(usage, price);
}

// =============================================================================
// Realtime voice (audio) pricing — SEPARATE dimension from text TokenUsage.
// =============================================================================
//
// A realtime voice session breaks the text `{input, output}` shape two ways:
// (a) pricing has THREE audio rates (audio-in / cached-audio-in / audio-out),
// and (b) one vendor (xAI) bills per-HOUR, not per-token. `AudioUsage`
// (imported from @holoscript/llm-provider — the type lives with the session
// that emits it) carries the three audio dims + optional text dims; the pricer
// + table live here with CostGuard. See plan §3.

/**
 * Per-M-token audio pricing. Realtime sessions still bill text (transcripts,
 * tool args), hence the optional text dims.
 */
export interface AudioPricing {
  audioInput: number; // USD / M audio input tokens
  cachedAudioInput: number; // USD / M cached audio input tokens
  audioOutput: number; // USD / M audio output tokens
  textInput?: number; // realtime sessions still bill text
  textOutput?: number;
}

// Verified 2026-07-10 (docs/llm-capabilities/openai.md model table, task r7y5).
// Never paste training-era pricing — F.014 / W.GOLD.341. Realtime pricing is
// scoped WITH the transport build (plan §3.5), not before it.
export const OPENAI_REALTIME_PRICING_USD_PER_MTOK: Record<string, AudioPricing> = {
  'gpt-realtime-2.1': {
    audioInput: 32,
    cachedAudioInput: 0.4,
    audioOutput: 64,
    textInput: 4,
    textOutput: 24,
  },
  'gpt-realtime-2.1-mini': {
    audioInput: 10,
    cachedAudioInput: 0.3,
    audioOutput: 20,
    textInput: 0.6,
    textOutput: 2.4,
  },
  // Older rows (not default; cached-audio rate to re-verify before use):
  'gpt-realtime-2': {
    audioInput: 32,
    cachedAudioInput: 0.4,
    audioOutput: 64,
    textInput: 4,
    textOutput: 24,
  },
  'gpt-realtime-1.5': {
    audioInput: 32,
    cachedAudioInput: 0.4,
    audioOutput: 64,
    textInput: 4,
    textOutput: 16,
  },
  'gpt-realtime-mini': {
    audioInput: 10,
    cachedAudioInput: 0.3,
    audioOutput: 20,
    textInput: 0.6,
    textOutput: 2.4,
  },
};

/**
 * OpenAI realtime per-token pricer. Prices a session's (or a delta's)
 * `AudioUsage` at the verified per-M rates. Throws on unknown model with a
 * pointer (matches defaultAnthropicPricer/defaultXAIPricer behavior) so callers
 * cannot silently undercount.
 */
export function defaultOpenAIRealtimePricer(model: string, usage: AudioUsage): number {
  const p = OPENAI_REALTIME_PRICING_USD_PER_MTOK[model];
  if (!p) {
    throw new Error(
      `No realtime pricing configured for model "${model}" — add to ` +
        `OPENAI_REALTIME_PRICING_USD_PER_MTOK (verify via docs/llm-capabilities/openai.md)`
    );
  }
  return (
    (usage.audioInputTokens * p.audioInput +
      usage.cachedAudioInputTokens * p.cachedAudioInput +
      usage.audioOutputTokens * p.audioOutput +
      (usage.textInputTokens ?? 0) * (p.textInput ?? 0) +
      (usage.textOutputTokens ?? 0) * (p.textOutput ?? 0)) /
    1_000_000
  );
}

// xAI Voice Agent (realtime) pricing — PER-HOUR, not per-token. Verified
// 2026-07-10 (docs/llm-capabilities/xai-grok.md § Voice pricing): the realtime
// voice agent is billed at $3.00/hour of session wall-clock. This is the
// per-DURATION accrual model the RealtimePricer union reserves — a session's
// cost is a function of how long it stayed open, finalized at session.close, NOT
// summed over per-token `usage` events like OpenAI/Gemini. (The separate REST STT
// $0.10-0.20/hr and TTS $15/1M-char surfaces are NOT realtime-session cost and
// are priced elsewhere if/when those adapters land.) The xAI realtime WebSocket
// wire frames + the session opener are a slice-E live-endpoint known-unknown;
// this per-duration pricer is a pure function of duration and needs neither.
// Never paste training-era pricing — F.014 / W.GOLD.341.
export const XAI_REALTIME_PRICING_USD_PER_HOUR: Record<string, number> = {
  'grok-voice-think-fast-1.0': 3.0, // realtime voice agent, GA 2026-06-08
};

/**
 * xAI realtime PER-DURATION pricer — the per-duration variant of the
 * `RealtimePricer` union. Prices a voice session from its wall-clock duration at
 * the verified per-hour rate (cost = rate/hour × durationSeconds/3600). Throws on
 * an unknown model with a pointer (matches defaultOpenAIRealtimePricer /
 * defaultXAIPricer / defaultAnthropicPricer) so callers cannot silently
 * undercount. Pure function: fixed durationSeconds in, exact USD out — no network,
 * no hardware. Distinct signature from the per-token pricers: it takes
 * `durationSeconds`, never `AudioUsage`, because xAI does not expose per-token
 * audio accrual for the voice agent.
 */
export function defaultXaiRealtimePricer(model: string, durationSeconds: number): number {
  const perHour = XAI_REALTIME_PRICING_USD_PER_HOUR[model];
  if (perHour === undefined) {
    throw new Error(
      `No xAI realtime voice pricing configured for model "${model}" — add to ` +
        `XAI_REALTIME_PRICING_USD_PER_HOUR (verify via docs/llm-capabilities/xai-grok.md)`
    );
  }
  return (perHour / 3600) * durationSeconds;
}

/**
 * Discriminated union so budget enforcement knows which accrual model applies:
 * OpenAI/Gemini are per-TOKEN (finalize each `usage` event); xAI voice is
 * per-DURATION ($3/hr — only finalizes at close). BOTH variants are now
 * implemented: `defaultOpenAIRealtimePricer` (per-token, slice A+B) and
 * `defaultXaiRealtimePricer` (per-duration, slice D). The union let slice D's xAI
 * pricer land as headroom without changing this type. A Gemini Live pricer, when
 * it lands, is another `per-token` entry (Gemini bills per-token audio).
 */
export type RealtimePricer =
  | { kind: 'per-token'; price: (model: string, usage: AudioUsage) => number }
  | { kind: 'per-duration'; price: (model: string, durationSeconds: number) => number };

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
 * Known gap (separate task): non-Anthropic non-local providers other than
 * OpenAI/xAI/OpenRouter (for example gemini) still fall through to
 * defaultAnthropicPricer here. xai +
 * openrouter were added 2026-05-06 with explicit dispatch (Lane A — see
 * docs/LLM_CAPABILITIES.md); xAI pricing was credential-verified and
 * populated 2026-07-10, openrouter's dict remains empty until verified.
 */
export function defaultPricerForProvider(
  provider: 'anthropic' | 'local-llm' | 'openai' | 'xai' | 'openrouter' | string
): ModelPricer {
  if (provider === 'local-llm' || provider === 'mock') return defaultLocalLlmPricer;
  if (provider === 'openai') return defaultOpenAIPricer;
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

  /**
   * Price `usage` without ever letting a pricing failure destroy the accrual.
   *
   * The call this is accounting for has ALREADY been paid to the provider. A
   * pricer that throws (every non-Anthropic default pricer still does, by
   * design, for an unknown model) or that returns a non-finite/negative number
   * must not be allowed to skip `spentUsd += cost` — that is precisely how
   * unbounded spend hides behind a total that reads zero. So: charge the
   * cross-provider ceiling and keep going.
   *
   * Over-charging is a self-correcting failure (the agent stops early and a
   * human notices a budget trip); under-charging is not (nothing stops).
   */
  private priceOrCeiling(model: string, usage: TokenUsage): number {
    let costUsd: number;
    try {
      costUsd = this.pricer(model, usage);
    } catch (err) {
      warnUnpricedOnce(
        model,
        `the pricing table for this provider (pricer threw: ${
          err instanceof Error ? err.message : String(err)
        })`
      );
      return priceUsageWithCacheSplit(usage, ceilingPricingAcrossProviders());
    }
    if (!Number.isFinite(costUsd) || costUsd < 0) {
      // A NaN cost is worse than a throw: it propagates into spentUsd, and
      // `NaN >= budget` is false, so the guard silently never trips again.
      warnUnpricedOnce(model, `the pricing table for this provider (pricer returned ${costUsd})`);
      return priceUsageWithCacheSplit(usage, ceilingPricingAcrossProviders());
    }
    return costUsd;
  }

  recordUsage(
    model: string,
    usage: TokenUsage
  ): { costUsd: number; spentUsd: number; remainingUsd: number } {
    this.rolloverIfNewDay();
    const costUsd = this.priceOrCeiling(model, usage);
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
