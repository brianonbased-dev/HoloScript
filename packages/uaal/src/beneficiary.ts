/**
 * beneficiary.ts — the beneficiary HOLARCHY as native uAAL semantics.
 *
 * uAAL already carries the atoms: a single `beneficiary` field (UAALTelosIR / UAALSemanticEvent,
 * with a `tt2_beneficiary_fidelity` benchmark) and a deontic prohibition force ('F' = Forbiddance,
 * UAALDeonticForce) with a 'violated' norm status. This module folds the multi-beneficiary reward
 * holarchy (packages/absorb-service/src/self-improvement/BeneficiaryRewards.ts) into the MEANING
 * layer: WHO an action serves — {self ⊂ agents ⊂ humans}, nested outward — and whether it holds the
 * HARD, non-tradeable human floor.
 *
 * Why fold it here instead of leaving it reward-only: the GRPO reward is just ONE consumer. Once the
 * beneficiary distribution and the human-floor status are native uAAL facts, ANY uAAL reader — the
 * board, the founder-gate, the daimōn — can ask "who did this serve, and did it hold the human
 * floor?" And the floor inherits the three-body discipline (P.041): resolveBeneficiary ABSTAINS
 * (unresolvable) when the human impact is UNSTATED. You cannot certify that you did not harm a human
 * if you do not KNOW the human impact — claiming the floor held on unknown impact is confabulation.
 * See research/2026-07-10_three-body-disposition-gap-pilot.md and
 * research/2026-07-11_multi-beneficiary-reward-holarchy.md.
 *
 * @module @holoscript/uaal
 */

import type { UAALDeonticNorm, UAALResolution } from './semantic';
import { structuredGap } from './semantic';

// =============================================================================
// TYPES — the holarchy levels + an action's IR
// =============================================================================

export type UAALBeneficiary = 'self' | 'agents' | 'humans';

/**
 * The holarchy order, innermost → outermost. A part (self) may never optimise itself by damaging
 * an outer whole (agents, then humans). Humans are the outermost whole and its floor is hard.
 */
export const UAAL_BENEFICIARY_HOLARCHY: readonly UAALBeneficiary[] = ['self', 'agents', 'humans'];

export type UAALHumanFloor = 'held' | 'breached';

/**
 * One declared effect of an action on a beneficiary level. `value` is signed benefit (negative =
 * harm); `harmful:true` forces a harm regardless of `value`. A level's ABSENCE from `impacts` means
 * its impact is UNSTATED — distinct from an explicit no-effect (declare it in IR.unaffected). That
 * three-state distinction (benefit / harm / unstated) is what lets resolveBeneficiary abstain
 * honestly, mirroring occlusion's opaque:true / :false / :absent.
 */
export interface UAALBeneficiaryImpact {
  beneficiary: UAALBeneficiary;
  value?: number;
  harmful?: boolean;
  [key: string]: unknown;
}

export interface UAALBeneficiaryIR {
  impacts?: UAALBeneficiaryImpact[];
  /**
   * Deontic norms bearing on the action. A Forbiddance (force 'F') carrying `protects: 'humans'`
   * is the explicit human-floor norm; its presence is recorded on the recovery, and it is violated
   * exactly when humans are net-harmed (the floor is intrinsic — the norm just names it).
   */
  norms?: UAALDeonticNorm[];
  /** Levels the action explicitly asserts it leaves unaffected — an honest "no human impact" here. */
  unaffected?: UAALBeneficiary[];
  query?: { [key: string]: unknown };
  [key: string]: unknown;
}

export interface UAALBeneficiaryMetadata extends Record<string, unknown> {
  id?: string;
  served?: UAALBeneficiary;
  human_floor?: UAALHumanFloor;
}

export interface BeneficiaryRecovery {
  /** Signed net benefit per level; absent/unaffected levels default to 0. */
  distribution: Record<UAALBeneficiary, number>;
  /** The level with the greatest positive contribution; ties favour the OUTER whole. */
  served: UAALBeneficiary;
  /** True iff humans are not net-harmed (the hard floor holds). */
  humanFloorHeld: boolean;
  /** The id of the human-floor Forbiddance norm, if one is declared; else null. */
  floorNormId: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function isBeneficiary(x: unknown): x is UAALBeneficiary {
  return x === 'self' || x === 'agents' || x === 'humans';
}

function numOr(v: unknown, d: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : d;
}

/** Effective signed benefit of an impact: harmful forces a negative magnitude (default 1). */
function effectiveValue(imp: UAALBeneficiaryImpact): number {
  if (imp.harmful === true) return -Math.abs(numOr(imp.value, 1));
  return numOr(imp.value, 0);
}

/** A human-floor norm is a Forbiddance ('F') that protects humans. */
function isHumanFloorNorm(norm: UAALDeonticNorm): boolean {
  return norm.force === 'F' && (norm as { protects?: unknown }).protects === 'humans';
}

/** Argmax by contribution; on ties prefer the outer whole (humans > agents > self). */
function servedFrom(distribution: Record<UAALBeneficiary, number>): UAALBeneficiary {
  let served: UAALBeneficiary = 'self';
  let best = distribution.self;
  for (const level of UAAL_BENEFICIARY_HOLARCHY) {
    // >= so later (outer) levels win ties; iteration order self→agents→humans makes humans win an all-tie.
    if (distribution[level] >= best) {
      best = distribution[level];
      served = level;
    }
  }
  return served;
}

// =============================================================================
// RECOVER — the coercing view (absent human impact → 0, floor optimistically held)
// =============================================================================

/**
 * Derive the beneficiary distribution + human-floor status from an action IR. Like recoverOcclusion,
 * this is the OPTIMISTIC view: an unstated level coerces to 0 (indistinguishable from explicit
 * no-effect). Use resolveBeneficiary when the unstated-vs-stated distinction matters (it does for
 * the human floor — see below).
 */
export function recoverBeneficiary(ir: UAALBeneficiaryIR): BeneficiaryRecovery {
  const distribution: Record<UAALBeneficiary, number> = { self: 0, agents: 0, humans: 0 };
  for (const imp of ir.impacts || []) {
    if (!imp || !isBeneficiary(imp.beneficiary)) continue;
    distribution[imp.beneficiary] += effectiveValue(imp);
  }
  const floorNorm = (ir.norms || []).find(isHumanFloorNorm) || null;
  const humanFloorHeld = distribution.humans >= 0;
  return {
    distribution,
    served: servedFrom(distribution),
    humanFloorHeld,
    floorNormId: floorNorm ? String(floorNorm.id) : null,
  };
}

// =============================================================================
// RESOLVE — the honest, three-body view (unknown human impact → gap, not a pass)
// =============================================================================

/**
 * Resolve who an action serves, honest about what is UNKNOWN. The human floor is the outer whole,
 * so it gets the strict treatment:
 *
 *   - human impact UNSTATED (no 'humans' impact and not declared unaffected) → `unresolvable`,
 *     reason `missing_precondition`. Certifying the floor on unknown impact would be confabulation.
 *   - human impact both benefits AND harms with no precedence → `unresolvable`,
 *     reason `unprioritized_conflict`. The floor status is genuinely indeterminate.
 *   - otherwise → `resolved` with recoverBeneficiary's answer.
 *
 * A determinate IR always resolves; only genuine gaps flip. This is the same verifier discipline as
 * resolveNormStatus / resolveOcclusion.
 */
export function resolveBeneficiary(ir: UAALBeneficiaryIR): UAALResolution<BeneficiaryRecovery> {
  const impacts = (ir.impacts || []).filter((i) => i && isBeneficiary(i.beneficiary));
  const humanImpacts = impacts.filter((i) => i.beneficiary === 'humans');
  const declaredUnaffected = (ir.unaffected || []).includes('humans');

  if (humanImpacts.length === 0 && !declaredUnaffected) {
    return {
      query: 'beneficiary',
      status: 'unresolvable',
      reason: 'missing_precondition',
      gap: structuredGap('beneficiary', 'beneficiary.unstated_impact', 'missing_precondition', 'humans'),
      obstruction: 'human impact of the action is unstated — cannot certify the human floor without it',
    };
  }

  const anyHarm = humanImpacts.some((i) => i.harmful === true || numOr(i.value, 0) < 0);
  const anyBenefit = humanImpacts.some((i) => i.harmful !== true && numOr(i.value, 0) > 0);
  if (anyHarm && anyBenefit) {
    return {
      query: 'beneficiary',
      status: 'unresolvable',
      reason: 'unprioritized_conflict',
      gap: structuredGap('beneficiary', 'beneficiary.benefit_harm_conflict', 'unprioritized_conflict', 'humans'),
      obstruction: 'action both benefits and harms humans with no precedence — floor status indeterminate',
    };
  }

  return { query: 'beneficiary', status: 'resolved', answer: recoverBeneficiary(ir) };
}
