/**
 * BeneficiaryRewards.ts
 *
 * The multi-beneficiary reward holarchy (founder design, 2026-07-11).
 *
 * Every existing GRPO term — test / type / lint / coverage / circuit-breaker
 * (GRPORewardFunctions.ts) plus the optional V and Z_m (ProvenanceCalibration-
 * Rewards.ts) — measures ONE thing: is the completion good for the AGENT'S OWN
 * task? That is a self-regarding reward. A part that optimizes only itself can
 * damage the whole it belongs to. The naming canon forbids exactly that
 * (HOLON.md): a part may never optimize itself by damaging the containing whole.
 *
 * So this module scores WHO an action serves — {R_self, R_agents, R_humans} —
 * and composes them as a NESTED HOLARCHY (self ⊂ agents ⊂ humans), NOT a flat
 * weighted sum:
 *
 *   R_humans below its floor  →  the whole reward COLLAPSES to 0, no matter how
 *                                high R_self / R_agents are. You cannot buy past
 *                                human harm with self- or sibling-benefit. This
 *                                hard, non-tradeable floor is what makes the
 *                                reward non-extractive by construction.
 *   within the human floor    →  a softer agent-commons floor (damaging the
 *                                commons is discouraged, not disqualified),
 *   within both floors        →  a role-specific weighted DIAL over the three
 *                                (Jarvis dials humans high; a commons/research
 *                                agent dials siblings high).
 *
 * Two new flag-gated reward TERMS extend the spine, with the same TRL-compatible
 * contract and the same FAIL-CLOSED discipline as ProvenanceCalibrationRewards:
 *
 *   R_agents — agent-benefit: did this help sibling agents? Reuse-by-siblings,
 *              unblock-of-dependents, and shared-substrate fitness (the "build to
 *              compound, not to complete" principle) measured off the provenance/
 *              reuse graph and supplied per completion as gold, exactly like
 *              Z_m's externally-measured F_gold.
 *
 *   R_humans — human-benefit: did this complete a human-VALUED task, well and
 *              HONESTLY? Gold human-benefit is supplied per completion from the
 *              flat human-benefit set (real completed board arcs + honesty-
 *              contrast negatives). The honesty gate is the human floor at the
 *              TERM level: a verification claim with no checkable evidence is a
 *              fabrication, and deceiving a human drives R_humans to 0 — never a
 *              tradeable cost.
 *
 * Both terms FAIL CLOSED: missing/malformed context, an out-of-range gold, or a
 * detected fabrication scores 0 — never a lenient default.
 *
 * @module self-improvement
 */

import type { GRPORewardFunction, RewardFunctionOptions } from './GRPORewardFunctions';

// =============================================================================
// CONTEXTS (batch-level, index-aligned — the caller supplies the gold)
// =============================================================================

/** Batch-level context for the agent-benefit (R_agents) reward. */
export interface AgentBenefitRewardContext {
  /**
   * Gold agent-benefit per completion (index-aligned), each in [0,1].
   * Externally computed from the provenance/reuse graph — reuse by siblings,
   * unblock of dependents, shared-substrate fitness (compound-not-complete).
   * It is an INPUT to the term, not something the term can derive from the
   * completion text alone (reuse happens in the future).
   */
  agentBenefitGold: number[];
}

/** Batch-level context for the human-benefit (R_humans) reward. */
export interface HumanBenefitRewardContext {
  /**
   * Gold human-benefit per completion (index-aligned), each in [0,1].
   * Externally computed from the flat human-benefit set: task-success (a
   * verifiable outcome the human can trust) × acceptance. Fabrication is caught
   * separately by the term's honesty gate and overrides this to 0.
   */
  humanBenefitGold: number[];
}

// =============================================================================
// HONESTY GATE — the human floor at the term level
// =============================================================================

/**
 * A completion ASSERTS that checking happened ("verified", "all green",
 * "fully tested"…). Distinct from merely claiming the work is done — a plain
 * "fixed the typo" is a completion claim, not a verification claim, and is NOT
 * gated (its value is whatever the gold reflects).
 */
const VERIFICATION_CLAIM =
  /\b(verified|validated|fully[ -]tested|thoroughly[ -]tested|all(?: tests?)? green|100%\s*(?:coverage|tested)|guaranteed(?:[ -]correct)?)\b/i;

/**
 * A CHECKABLE evidence token the human could actually inspect: a commit-hash-
 * like hex, a `key=value` validation marker, a numeric test ratio (12/12), a
 * coverage figure, or a concrete file path. The evidence must be structurally
 * distinct from the bare claim.
 */
const STRUCTURED_EVIDENCE =
  /(\b[0-9a-f]{7,40}\b|\b[a-z_]{3,}=[^\s]|\b\d+\/\d+\b|coverage[:=]\s*\d|\b[\w-]+\.(?:ts|tsx|mjs|cjs|js|jsx|py|md|json|rs|holo|hsplus|hs)\b)/i;

/**
 * Fabrication := a verification claim with NO checkable evidence. This is the
 * exact failure mode the board-arc corpus principle names — "Never fabricate
 * evidence you did not produce." A conservative v0 heuristic: it flags confident
 * unbacked assertions of verification, not honest small completions. (Future:
 * actually replay the claimed commit / re-run the claimed validation, the way V
 * replays a derivation, and fail closed on a mismatch.)
 */
export function isFabricatedClaim(completion: string): boolean {
  const text = String(completion ?? '');
  if (!VERIFICATION_CLAIM.test(text)) return false; // no verification asserted → nothing to fabricate
  return !STRUCTURED_EVIDENCE.test(text); // asserted, but nothing the human can check → fabricated
}

// =============================================================================
// REWARD TERMS (TRL-compatible)
// =============================================================================

function validGold(g: unknown): g is number {
  return typeof g === 'number' && !Number.isNaN(g) && g >= 0 && g <= 1;
}

/**
 * Agent-benefit reward. Requires kwargs.agentBenefit.agentBenefitGold aligned to
 * the batch; a missing context, missing gold, or out-of-range gold scores 0
 * (the term is explicitly enabled, so absent context is a caller error and must
 * not silently pass).
 */
export const agentBenefitReward: GRPORewardFunction = async (
  completions: string[],
  kwargs?: RewardFunctionOptions
): Promise<number[]> => {
  const gold = kwargs?.agentBenefit?.agentBenefitGold;
  if (!Array.isArray(gold)) return completions.map(() => 0);
  return completions.map((_, i) => (validGold(gold[i]) ? (gold[i] as number) : 0));
};

/**
 * Human-benefit reward. Requires kwargs.humanBenefit.humanBenefitGold aligned to
 * the batch. The gold is gated by the honesty check: a fabricated (unbacked)
 * verification claim scores 0 regardless of gold — the human floor at the term
 * level. Missing/out-of-range gold also scores 0 (fail closed).
 */
export const humanBenefitReward: GRPORewardFunction = async (
  completions: string[],
  kwargs?: RewardFunctionOptions
): Promise<number[]> => {
  const gold = kwargs?.humanBenefit?.humanBenefitGold;
  if (!Array.isArray(gold)) return completions.map(() => 0);
  return completions.map((completion, i) => {
    if (!validGold(gold[i])) return 0;
    if (isFabricatedClaim(completion)) return 0; // deceiving a human is never a tradeable cost
    return gold[i] as number;
  });
};

// =============================================================================
// HOLARCHIC COMPOSITION — the nested {self ⊂ agents ⊂ humans} with hard floor
// =============================================================================

/** The three beneficiary scores for one completion, each in [0,1]. */
export interface BeneficiaryScores {
  rSelf: number;
  rAgents: number;
  rHumans: number;
}

/**
 * The role-specific dial over {self, agents, humans}. Must sum to 1.0. This is
 * the "who does this agent exist to serve" weighting, applied ONLY within the
 * floors — it can never trade away a floor breach.
 */
export interface BeneficiaryDial {
  self: number;
  agents: number;
  humans: number;
}

/** Configuration for the holarchic composition. */
export interface BeneficiaryComposeConfig {
  /**
   * HARD human floor in [0,1]. R_humans strictly below this collapses the total
   * reward to 0, irrespective of R_self / R_agents. Non-tradeable — this is the
   * non-extractive guarantee. Default 0.5.
   */
  humanFloor: number;
  /**
   * SOFT agent-commons floor in [0,1]. When R_agents is below it the composed
   * reward is multiplied by agentPenaltyMultiplier (discouraged, not
   * disqualified). Default 0 (no agent floor).
   */
  agentFloor: number;
  /** Multiplier applied to the dialled reward when R_agents < agentFloor. Default 0.5. */
  agentPenaltyMultiplier: number;
  /** Role-specific dial over {self, agents, humans}; must sum to 1.0. */
  dial: BeneficiaryDial;
}

/** A readable record of who an action served and how the reward was composed. */
export interface BeneficiaryReceipt {
  /** The three beneficiary scores, echoed for auditability. */
  self: number;
  agents: number;
  humans: number;
  /** Which beneficiary received the largest dialled contribution. */
  served: 'self' | 'agents' | 'humans';
  /** Non-null when a floor was breached ('humans' = hard collapse, 'agents' = soft penalty). */
  floorBreached: 'humans' | 'agents' | null;
  /** The final composed reward in [0,1]. */
  reward: number;
}

/** Balanced default dial. */
export const BALANCED_DIAL: BeneficiaryDial = { self: 0.34, agents: 0.33, humans: 0.33 };
/** Jarvis-style dial: the private founder assistant serves the human first. */
export const HUMAN_FIRST_DIAL: BeneficiaryDial = { self: 0.2, agents: 0.2, humans: 0.6 };
/** Commons-style dial: a research/substrate agent serves the sibling commons first. */
export const COMMONS_DIAL: BeneficiaryDial = { self: 0.2, agents: 0.5, humans: 0.3 };

/** Default composition config: balanced dial, hard human floor at 0.5, soft agent floor off. */
export const DEFAULT_BENEFICIARY_CONFIG: BeneficiaryComposeConfig = {
  humanFloor: 0.5,
  agentFloor: 0,
  agentPenaltyMultiplier: 0.5,
  dial: BALANCED_DIAL,
};

function clamp01(x: number): number {
  if (typeof x !== 'number' || Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** Validate a dial sums to 1.0 (within float tolerance). Throws on violation. */
export function assertDialSumsToOne(dial: BeneficiaryDial): void {
  const sum = dial.self + dial.agents + dial.humans;
  if (!(Math.abs(sum - 1.0) <= 1e-6)) {
    throw new Error(`beneficiary dial must sum to 1.0 but got ${sum}`);
  }
  if (dial.self < 0 || dial.agents < 0 || dial.humans < 0) {
    throw new Error('beneficiary dial weights must be non-negative');
  }
}

/**
 * Compose {R_self, R_agents, R_humans} into a single reward via the nested
 * holarchy. The order of operations IS the holon principle:
 *
 *   1. HARD human floor — if R_humans < humanFloor, collapse to 0. Checked
 *      first and unconditionally: no self/agent benefit can rescue human harm.
 *   2. Dial the three within the floor (weighted sum by role).
 *   3. SOFT agent floor — if R_agents < agentFloor, penalise (multiply), but do
 *      not zero: damaging the commons is discouraged, not disqualified.
 *
 * Returns a BeneficiaryReceipt: the composed reward plus a readable record of
 * who was served and whether a floor bit.
 */
export function composeBeneficiaryReward(
  scores: BeneficiaryScores,
  config: BeneficiaryComposeConfig = DEFAULT_BENEFICIARY_CONFIG
): BeneficiaryReceipt {
  assertDialSumsToOne(config.dial);
  const self = clamp01(scores.rSelf);
  const agents = clamp01(scores.rAgents);
  const humans = clamp01(scores.rHumans);

  // 1. HARD human floor — non-tradeable.
  if (humans < config.humanFloor) {
    return { self, agents, humans, served: 'humans', floorBreached: 'humans', reward: 0 };
  }

  // 2. Dial within the floor.
  const cSelf = config.dial.self * self;
  const cAgents = config.dial.agents * agents;
  const cHumans = config.dial.humans * humans;
  const dialled = cSelf + cAgents + cHumans;

  // 3. SOFT agent floor.
  const agentBreached = agents < config.agentFloor;
  const reward = clamp01(agentBreached ? dialled * config.agentPenaltyMultiplier : dialled);

  // Served = largest dialled contribution; ties favour the outer whole.
  let served: 'self' | 'agents' | 'humans' = 'self';
  let best = cSelf;
  if (cAgents > best) {
    served = 'agents';
    best = cAgents;
  }
  if (cHumans >= best) {
    served = 'humans';
  }

  return { self, agents, humans, served, floorBreached: agentBreached ? 'agents' : null, reward };
}
