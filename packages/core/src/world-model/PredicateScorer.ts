/**
 * Predicate scorer — computes SemanticPredicateScore + CurriculumPriority
 * for an adversarial trajectory.
 *
 * Operationalizes acceptance criterion 3 of the AUTONOMIZE doc:
 *   "Score each trace by predicate violation, novelty, learnability,
 *    regression, and invalidity."
 *
 * Pure function. No scene runtime, no model dependency, no I/O.
 *
 * Score components (each normalized to [0, 1]):
 *   - violation:    soft-anchor violation magnitude (0 = no violation, 1 = max)
 *   - novelty:      1 / (1 + Jaccard-overlap with action-trace history)
 *   - learnability: caller-supplied estimate (default 0.5 if unknown)
 *   - regression:   1 if a `solved` trajectory now violates again, else 0
 *   - invalidity:   1 if ANY hard `ValidityAnchor.evaluate` returns false
 *
 * Priority formula:
 *   - invalidity > 0 → priority = 0 (G.PROWL.AUTO.001 short-circuit)
 *   - else priority = max(violation, regression) * (0.5 + 0.5 * novelty) * (0.5 + 0.5 * learnability)
 *
 * The formula prioritizes confirmed failures (violation/regression) weighted
 * by how novel/learnable they are. Pure-novelty trajectories without
 * violation get low priority — peer's G.PROWL.AUTO.001 anti-junk guard.
 *
 * @module @holoscript/core/world-model
 */

import type {
  AdversarialTrajectory,
  ActionStep,
  CurriculumPriority,
  SemanticPredicateScore,
  ValidityAnchor,
} from './AdversarialTrajectory';

/**
 * Soft anchor — returns a graded violation magnitude in [0, 1] instead
 * of the hard pass/fail of `ValidityAnchor`. Use these for predicates
 * that have degrees (e.g. "how far did the object drift from its
 * expected pose").
 */
export interface SoftAnchor {
  readonly id: string;
  readonly description: string;
  /** Returns violation magnitude in [0, 1]. 0 = no violation. */
  evaluate(trajectory: AdversarialTrajectory): number;
}

export interface ScorerInputs {
  readonly trajectory: AdversarialTrajectory;
  readonly hardAnchors: readonly ValidityAnchor[];
  readonly softAnchors: readonly SoftAnchor[];
  /** Prior action-step type frequencies for novelty calculation (Jaccard input) */
  readonly historyActionTypes: ReadonlySet<string>;
  /** Caller-supplied learnability estimate; default 0.5 */
  readonly learnabilityEstimate?: number;
  /** Previous trajectory status — used for regression detection */
  readonly previousStatus?: AdversarialTrajectory['status'];
}

export interface ScorerOutput {
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function actionTypeSet(actions: readonly ActionStep[]): Set<string> {
  const s = new Set<string>();
  for (const a of actions) s.add(a.type);
  return s;
}

function jaccardOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Compute the score + priority for a trajectory.
 *
 * Determinism: this function is pure. The same inputs MUST produce the
 * same output regardless of when it's called.
 */
export function scoreTrajectory(inputs: ScorerInputs): ScorerOutput {
  const {
    trajectory,
    hardAnchors,
    softAnchors,
    historyActionTypes,
    learnabilityEstimate = 0.5,
    previousStatus,
  } = inputs;

  // Invalidity: ANY hard anchor failure short-circuits everything.
  let invalidity = 0;
  for (const anchor of hardAnchors) {
    if (!anchor.evaluate(trajectory)) {
      invalidity = 1;
      break;
    }
  }

  // Violation: max soft-anchor magnitude.
  let violation = 0;
  for (const anchor of softAnchors) {
    const v = clamp01(anchor.evaluate(trajectory));
    if (v > violation) violation = v;
  }

  // Novelty: 1 - Jaccard(traj action types, history action types).
  const trajActionTypes = actionTypeSet(trajectory.actionTrace);
  const novelty = clamp01(1 - jaccardOverlap(trajActionTypes, historyActionTypes));

  // Learnability: caller-supplied, clamped.
  const learnability = clamp01(learnabilityEstimate);

  // Regression: 1 if previously solved and now violates.
  const regression =
    previousStatus === 'solved' && (violation > 0 || invalidity > 0) ? 1 : 0;

  const predicateScore: SemanticPredicateScore = {
    violation,
    novelty,
    learnability,
    regression,
    invalidity,
  };

  // Priority formula.
  let priority = 0;
  let rationale = 'invalid';
  if (invalidity === 0) {
    const base = Math.max(violation, regression);
    const noveltyWeight = 0.5 + 0.5 * novelty;
    const learnWeight = 0.5 + 0.5 * learnability;
    priority = clamp01(base * noveltyWeight * learnWeight);
    rationale =
      regression > 0
        ? `regression detected (violation=${violation.toFixed(2)})`
        : `violation=${violation.toFixed(2)} × novelty=${novelty.toFixed(2)} × learn=${learnability.toFixed(2)}`;
  }

  // Tie-breaker: lower step count wins (shorter failures are cheaper to debug).
  const tieBreaker = trajectory.actionTrace.length;

  return {
    predicateScore,
    priority: { priority, tieBreaker, rationale },
  };
}
