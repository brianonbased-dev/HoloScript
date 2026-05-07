/**
 * Capability-aware provider router (Lane 3 Phase 4b)
 *
 * Pure function `pickProvider({brain, envOverride, candidates})` that picks
 * an LLM provider for a brain at session start based on:
 *   1. The brain's `requires` / `prefers` / `avoids` capability arrays
 *      (declared in the `.hsplus` identity block — Phase 2).
 *   2. Each registered provider's `Capabilities` manifest (declared as
 *      `<NAME>_CAPABILITIES` exports per adapter — Phase 4a).
 *   3. The `HOLOSCRIPT_AGENT_PROVIDER` env override.
 *
 * Per founder ruling 2026-05-06 (universal+segregated foundation, path b
 * backward-compatible):
 *   - Brains declare needs as data; router does set arithmetic.
 *   - `HOLOSCRIPT_AGENT_PROVIDER` env becomes OVERRIDE, not source-of-truth.
 *   - Brains without `requires` get implicit empty arrays = open routing
 *     (matches today's behavior — backward-compat preserved).
 *
 * Override semantics: an env-set provider always wins among satisfying
 * candidates. If env is set but doesn't satisfy a `requires` entry, the
 * router still picks env (founder said "override") but reports the
 * mismatch via `reason: 'env-override-mismatch'` + `unsatisfiedRequires`.
 * Callers can decide to abort or proceed.
 *
 * Pure function — no I/O, no logging, no env reads. The caller injects
 * `envOverride` from `HOLOSCRIPT_AGENT_PROVIDER` (or `AgentSpec.provider`
 * in the supervisor path) and consumes the `RoutingDecision` to construct
 * the actual provider via the existing factory pattern.
 */

import type { Capabilities, LLMProviderName } from '@holoscript/llm-provider';
import {
  ANTHROPIC_CAPABILITIES,
  OPENAI_CAPABILITIES,
  GEMINI_CAPABILITIES,
  XAI_CAPABILITIES,
  OPENROUTER_CAPABILITIES,
  LOCAL_LLM_CAPABILITIES,
  BITNET_CAPABILITIES,
  MOCK_CAPABILITIES,
} from '@holoscript/llm-provider';

export interface BrainRequirements {
  /** Capability keys the brain MUST have. Empty = open routing. */
  requires: string[];
  /** Capability keys the brain prefers. Used for tie-breaking. */
  prefers: string[];
  /** Capability keys the brain explicitly excludes. */
  avoids: string[];
}

export interface RoutingCandidate {
  name: LLMProviderName;
  capabilities: Capabilities;
}

export type RoutingReason =
  /** Brain has no requires; env was honored. Today's behavior. */
  | 'env-override-no-requirements'
  /** Brain has requires; env satisfies them. Env wins among satisfying candidates. */
  | 'env-override-satisfies'
  /** Brain has requires; env doesn't satisfy. Env still picked (founder ruling), mismatch flagged. */
  | 'env-override-mismatch'
  /** Env unset; picked by capability match (most prefers wins, tie-breaker order). */
  | 'capability-best-fit'
  /** Brain has no requires AND no env; picked first candidate by tie-breaker order. */
  | 'open-routing-default';

export interface RoutingDecision {
  picked: LLMProviderName;
  reason: RoutingReason;
  /** Empty unless `reason === 'env-override-mismatch'` — capability keys env doesn't satisfy. */
  unsatisfiedRequires: string[];
  /** Capability keys the picked provider satisfies from the brain's `prefers` list. */
  matchedPrefers: string[];
  /** Provider names excluded because their capabilities matched any `avoids` entry. */
  excludedByAvoids: LLMProviderName[];
  /** Other candidates that also satisfied `requires` (sorted by prefers descending). */
  alternatives: LLMProviderName[];
}

export class NoEligibleProviderError extends Error {
  constructor(
    public readonly requires: readonly string[],
    public readonly avoids: readonly string[],
    public readonly considered: readonly LLMProviderName[],
    public readonly excludedByAvoids: readonly LLMProviderName[]
  ) {
    super(
      `No provider satisfies brain requires=[${requires.join(', ')}] avoids=[${avoids.join(', ')}]. ` +
        `Considered: [${considered.join(', ')}]. ` +
        `Excluded by avoids: [${excludedByAvoids.join(', ')}].`
    );
    this.name = 'NoEligibleProviderError';
  }
}

/**
 * Returns true if the capability key is declared truthy on the manifest.
 * Boolean fields: returns the boolean value. Numeric fields: returns true
 * if > 0 (used for `contextWindow` / `maxOutput` declarations). Undefined:
 * returns false (capability not declared). String/object fields are
 * meaningless for routing keys and return false.
 */
function satisfies(capabilities: Capabilities, key: string): boolean {
  const value = (capabilities as unknown as Record<string, unknown>)[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return false;
}

function countMatches(capabilities: Capabilities, keys: readonly string[]): number {
  let count = 0;
  for (const key of keys) {
    if (satisfies(capabilities, key)) count++;
  }
  return count;
}

function unsatisfiedKeys(capabilities: Capabilities, keys: readonly string[]): string[] {
  return keys.filter((key) => !satisfies(capabilities, key));
}

/**
 * Pick a provider for a brain. Pure function — see module doc-comment for
 * the routing algorithm.
 */
export function pickProvider(opts: {
  brain: BrainRequirements;
  envOverride?: LLMProviderName;
  candidates: RoutingCandidate[];
  /**
   * Tie-breaker order when multiple candidates have equal `prefers` match
   * counts. Defaults to insertion order of `candidates`. Useful for the
   * supervisor to express "prefer Anthropic over Gemini at equal capability."
   */
  tieBreakerOrder?: readonly LLMProviderName[];
}): RoutingDecision {
  const { brain, envOverride, candidates } = opts;
  const tieBreaker = opts.tieBreakerOrder ?? candidates.map((c) => c.name);

  if (candidates.length === 0) {
    throw new Error('pickProvider: no candidates supplied');
  }

  // Identify avoids-excluded candidates first (used in error reporting + filtering)
  const excludedByAvoids: LLMProviderName[] = [];
  const notAvoided: RoutingCandidate[] = [];
  for (const candidate of candidates) {
    const matchesAvoid = brain.avoids.some((a) => satisfies(candidate.capabilities, a));
    if (matchesAvoid) {
      excludedByAvoids.push(candidate.name);
    } else {
      notAvoided.push(candidate);
    }
  }

  // ─── Open routing path (no requires) ────────────────────────────────
  if (brain.requires.length === 0) {
    if (envOverride !== undefined) {
      // Env honored. Note: avoids are advisory in open-routing mode
      // (today's behavior is "env wins"); we still record the mismatch.
      const envCandidate = candidates.find((c) => c.name === envOverride);
      const matchedPrefers = envCandidate
        ? brain.prefers.filter((p) => satisfies(envCandidate.capabilities, p))
        : [];
      return {
        picked: envOverride,
        reason: 'env-override-no-requirements',
        unsatisfiedRequires: [],
        matchedPrefers,
        excludedByAvoids,
        alternatives: candidates.filter((c) => c.name !== envOverride).map((c) => c.name),
      };
    }
    // No env, no requires — pick first candidate by tie-breaker order
    const ordered = orderCandidates(notAvoided, tieBreaker);
    if (ordered.length === 0) {
      // All candidates avoided — fall back to first overall (avoids are
      // advisory without requires; otherwise we'd starve the agent)
      return {
        picked: candidates[0]!.name,
        reason: 'open-routing-default',
        unsatisfiedRequires: [],
        matchedPrefers: brain.prefers.filter((p) =>
          satisfies(candidates[0]!.capabilities, p)
        ),
        excludedByAvoids,
        alternatives: candidates.slice(1).map((c) => c.name),
      };
    }
    return {
      picked: ordered[0]!.name,
      reason: 'open-routing-default',
      unsatisfiedRequires: [],
      matchedPrefers: brain.prefers.filter((p) => satisfies(ordered[0]!.capabilities, p)),
      excludedByAvoids,
      alternatives: ordered.slice(1).map((c) => c.name),
    };
  }

  // ─── Capability-aware path (has requires) ──────────────────────────
  // Filter to candidates that satisfy ALL requires (and aren't avoided)
  const eligible = notAvoided.filter((c) => unsatisfiedKeys(c.capabilities, brain.requires).length === 0);

  if (eligible.length === 0) {
    // No candidate satisfies. If env is set, founder ruling says env
    // overrides — pick env, flag mismatch, list unsatisfied requires.
    if (envOverride !== undefined) {
      const envCandidate = candidates.find((c) => c.name === envOverride);
      const unsatisfied = envCandidate
        ? unsatisfiedKeys(envCandidate.capabilities, brain.requires)
        : brain.requires.slice();
      const matchedPrefers = envCandidate
        ? brain.prefers.filter((p) => satisfies(envCandidate.capabilities, p))
        : [];
      return {
        picked: envOverride,
        reason: 'env-override-mismatch',
        unsatisfiedRequires: unsatisfied,
        matchedPrefers,
        excludedByAvoids,
        alternatives: [],
      };
    }
    // No env, no eligible candidate — fail fast
    throw new NoEligibleProviderError(
      brain.requires,
      brain.avoids,
      candidates.map((c) => c.name),
      excludedByAvoids
    );
  }

  // Sort eligible by prefers count descending, tie-break by tieBreakerOrder
  const ranked = [...eligible].sort((a, b) => {
    const aMatches = countMatches(a.capabilities, brain.prefers);
    const bMatches = countMatches(b.capabilities, brain.prefers);
    if (aMatches !== bMatches) return bMatches - aMatches; // higher first
    const aIdx = tieBreaker.indexOf(a.name);
    const bIdx = tieBreaker.indexOf(b.name);
    // Names not in tie-breaker order go to the end
    const aRank = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const bRank = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
    return aRank - bRank;
  });

  // Env override wins among eligible candidates
  if (envOverride !== undefined) {
    const envEligible = ranked.find((c) => c.name === envOverride);
    if (envEligible) {
      return {
        picked: envOverride,
        reason: 'env-override-satisfies',
        unsatisfiedRequires: [],
        matchedPrefers: brain.prefers.filter((p) => satisfies(envEligible.capabilities, p)),
        excludedByAvoids,
        alternatives: ranked.filter((c) => c.name !== envOverride).map((c) => c.name),
      };
    }
    // Env set but not eligible (e.g. excluded by avoids, or unknown name).
    // Founder ruling: env overrides — pick env, flag mismatch.
    const envCandidate = candidates.find((c) => c.name === envOverride);
    const unsatisfied = envCandidate
      ? unsatisfiedKeys(envCandidate.capabilities, brain.requires)
      : brain.requires.slice();
    return {
      picked: envOverride,
      reason: 'env-override-mismatch',
      unsatisfiedRequires: unsatisfied,
      matchedPrefers: envCandidate
        ? brain.prefers.filter((p) => satisfies(envCandidate.capabilities, p))
        : [],
      excludedByAvoids,
      alternatives: ranked.map((c) => c.name),
    };
  }

  // No env — pick the highest-ranked eligible
  const top = ranked[0]!;
  return {
    picked: top.name,
    reason: 'capability-best-fit',
    unsatisfiedRequires: [],
    matchedPrefers: brain.prefers.filter((p) => satisfies(top.capabilities, p)),
    excludedByAvoids,
    alternatives: ranked.slice(1).map((c) => c.name),
  };
}

/**
 * Default candidate list — every adapter that ships with `@holoscript/llm-provider`.
 * Suppliers can pass their own subset to `pickProvider` (e.g. supervisor
 * limits to only the providers it has API keys for, or test code uses
 * a synthetic candidate list).
 */
export const BUILT_IN_CANDIDATES: RoutingCandidate[] = [
  { name: 'anthropic', capabilities: ANTHROPIC_CAPABILITIES },
  { name: 'openai', capabilities: OPENAI_CAPABILITIES },
  { name: 'gemini', capabilities: GEMINI_CAPABILITIES },
  { name: 'xai', capabilities: XAI_CAPABILITIES },
  { name: 'openrouter', capabilities: OPENROUTER_CAPABILITIES },
  { name: 'local-llm', capabilities: LOCAL_LLM_CAPABILITIES },
  { name: 'bitnet', capabilities: BITNET_CAPABILITIES },
  { name: 'mock', capabilities: MOCK_CAPABILITIES },
];

function orderCandidates(
  candidates: readonly RoutingCandidate[],
  tieBreaker: readonly LLMProviderName[]
): RoutingCandidate[] {
  return [...candidates].sort((a, b) => {
    const aIdx = tieBreaker.indexOf(a.name);
    const bIdx = tieBreaker.indexOf(b.name);
    const aRank = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const bRank = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
    return aRank - bRank;
  });
}
