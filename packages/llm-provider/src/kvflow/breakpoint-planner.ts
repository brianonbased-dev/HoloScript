/**
 * breakpoint-planner — turn KVFlow scheduling knowledge into cache-breakpoint
 * placement.
 *
 * ## Why this exists
 *
 * Cache breakpoints are a scarce, fixed budget (Anthropic allows 4 per request,
 * one of which the system+tools prefix always consumes). Something has to
 * decide which turns get the remaining few.
 *
 * The default policy is pure recency: take the most recent assistant turns.
 * That is a reasonable guess with no other information, but it has a specific
 * pathology — **the most recent turn is also the most ephemeral one**. In an
 * agent tool-loop the tail of the conversation is `scene-turn` content that
 * churns every tick and will essentially never be read back, so recency spends
 * the entire budget on the lowest-reuse content in the request.
 *
 * KVFlow already models exactly the missing signal, for exactly this reason:
 *   - `KVFlowScope` says how reusable a span is (`shared-prefix` is team-board
 *     context reused across many agents; `scene-turn` is per-turn churn).
 *   - `stepsToExecution` says how soon the owning agent runs again — the core
 *     KVFlow insight that beats LRU, because it looks forward at the workflow
 *     graph instead of backward at access times.
 *
 * This module is the bridge. It is deliberately a PURE FUNCTION over plain
 * data rather than a dependency on `KVFlowCacheManager`:
 *
 *   1. Provider adapters must stay stateless. One adapter instance serves many
 *      concurrent conversations (see `sovereign-resolver`), so a manager handle
 *      on the adapter would cross-wire scheduling state between unrelated
 *      threads — the same reasoning that keeps `previousMessageId` caller-owned.
 *   2. The ranking is backend-agnostic. Anthropic's prompt cache is the first
 *      consumer, but HoloLlama (the OpenAI-compatible Ollama replacement) and
 *      HoloServe (novel inference) face the identical question — which prefix
 *      spans are worth keeping hot. Nothing here is Anthropic-shaped.
 */

import type { KVFlowScope } from './types';

/**
 * A caller-supplied hint about one message's cache value.
 *
 * `messageIndex` addresses the caller's OWN `request.messages` array, system
 * messages included. Provider adapters translate to their internal indexing —
 * callers should never have to model an adapter's message-splitting rules.
 */
export interface CacheBreakpointHint {
  messageIndex: number;
  /** Reuse class of this span. */
  scope: KVFlowScope;
  /**
   * KVFlow steps-to-execution: 0 = executing now, higher = more steps before
   * the owning agent is re-activated. Lower is more valuable to keep cached.
   * Omit when unknown.
   */
  stepsToExecution?: number;
}

/**
 * Reuse value per scope. Higher wins a scarce breakpoint.
 *
 * `scene-turn` sits at 0 rather than a negative value so that an explicitly
 * hinted ephemeral turn still outranks nothing at all — the ordering that
 * matters is shared-prefix > role-overlay > scene-turn, and the recency
 * tiebreak below resolves the rest.
 */
const SCOPE_RANK: Record<KVFlowScope, number> = {
  'shared-prefix': 2,
  'role-overlay': 1,
  'scene-turn': 0,
};

/** Rank assigned to an eligible turn with no hint. See `planCacheBreakpoints`. */
const UNHINTED_RANK = -1;

/**
 * Choose which of `eligibleIndices` should carry a cache breakpoint.
 *
 * Ranking, in order:
 *   1. Scope — higher reuse class first.
 *   2. Steps-to-execution — lower (sooner reuse) first.
 *   3. Recency — later index first.
 *
 * Partial hints degrade gracefully. An eligible turn with no hint ranks below
 * every hinted turn but is still ordered by recency among its peers, so a
 * caller supplying zero hints gets exactly the legacy recency behaviour and a
 * caller hinting only the valuable spans gets those honoured first.
 *
 * @param eligibleIndices Indices (in the ADAPTER's own message array) that may
 *   legally carry a breakpoint. The adapter owns eligibility — this function
 *   never widens it.
 * @param hints Hints already translated into the same index space.
 * @param budget How many breakpoints remain after the system prefix.
 * @returns Selected indices in ASCENDING order. Position matters to the wire
 *   format, so callers must not re-sort by rank.
 */
export function planCacheBreakpoints(
  eligibleIndices: number[],
  hints: CacheBreakpointHint[],
  budget: number
): number[] {
  if (budget <= 0 || eligibleIndices.length === 0) return [];

  const byIndex = new Map<number, CacheBreakpointHint>();
  for (const hint of hints) byIndex.set(hint.messageIndex, hint);

  const ranked = eligibleIndices.map((index) => {
    const hint = byIndex.get(index);
    return {
      index,
      scopeRank: hint ? SCOPE_RANK[hint.scope] : UNHINTED_RANK,
      // Unhinted and hint-without-STE both sort last on this key, leaving the
      // recency tiebreak to decide — never treat "unknown" as "imminent".
      ste: hint?.stepsToExecution ?? Number.POSITIVE_INFINITY,
    };
  });

  ranked.sort((a, b) => {
    if (a.scopeRank !== b.scopeRank) return b.scopeRank - a.scopeRank;
    if (a.ste !== b.ste) return a.ste - b.ste;
    return b.index - a.index; // recency tiebreak: later turn wins
  });

  return ranked
    .slice(0, budget)
    .map((r) => r.index)
    .sort((a, b) => a - b);
}
