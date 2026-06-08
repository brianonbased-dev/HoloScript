/**
 * EXP-1 metrics + PRE-REGISTERED kill criteria.
 *
 * The thesis dies cleanly — with evidence and zero GPU burned (F.108
 * cheapest-falsification) — if any load-bearing claim fails on the bench:
 *
 *   C1 dead: Arm B (IR) uses >= Arm A (NL) input tokens AND pass-rate(B) <= pass-rate(A).
 *            → IR is not a more efficient representation; the context-reduction premise is false.
 *   C2 dead: Arm C (small+offload) does not reach >= retention * pass-rate(A) at lower params.
 *            → externalization does not buy back capability; "lite model" is wishful.
 *   C3 dead: best provenance coverage < floor.
 *            → outputs are not provenance-bearing by construction.
 *
 * thesisDead is keyed on C1 OR C2 (the load-bearing claims). C3 is a dependability
 * bar reported alongside — a failing C3 weakens the "dependable" claim but does not,
 * by itself, falsify context-reduction or offload.
 *
 * NOTE on C2's "at lower params": this is guaranteed by CONSTRUCTION — Arm C is
 * configured with a strictly smaller model than the Arm A/baseline model. The
 * harness verifies the retention ratio; the param inequality is an arm-config
 * invariant the caller must honor (asserted via the optional armCParamsLower flag).
 */

import type { Arm, BenchReport } from './types';

export interface KillThresholds {
  /** Arm C must reach >= this fraction of Arm A's pass-rate. Research default: 0.9. */
  c2Retention: number;
  /** Minimum acceptable provenance coverage. Research default: 0.8. */
  c3CoverageFloor: number;
}

export const DEFAULT_KILL_THRESHOLDS: KillThresholds = {
  c2Retention: 0.9,
  c3CoverageFloor: 0.8,
};

export interface KillVerdict {
  c1Dead: boolean;
  c2Dead: boolean;
  c3Dead: boolean;
  /** The thesis is falsified if either load-bearing claim (C1 or C2) is dead. */
  thesisDead: boolean;
  detail: {
    nlTokens: number;
    irTokens: number;
    tokenRatioBoverA: number; // < 1 means IR is more token-efficient
    passRateA: number;
    passRateB: number;
    passRateC: number;
    c2RetentionObserved: number; // passRate(C) / passRate(A)
    bestProvenanceCoverage: number;
  };
  /** Human-readable one-liner per claim. */
  summary: string[];
}

export function evaluateKillCriteria(
  report: BenchReport,
  thresholds: KillThresholds = DEFAULT_KILL_THRESHOLDS,
  opts: { armCParamsLower?: boolean } = {}
): KillVerdict {
  const A = report.arms.A;
  const B = report.arms.B;
  const C = report.arms.C;

  const c1Dead = B.meanInputTokens >= A.meanInputTokens && B.passRate <= A.passRate;

  const c2RetentionObserved = A.passRate === 0 ? 0 : C.passRate / A.passRate;
  // C2 requires BOTH the retention bar AND that Arm C genuinely ran a smaller model.
  // If the caller cannot assert lower params, C2 cannot be credited (defaults dead).
  const paramsLower = opts.armCParamsLower ?? false;
  const c2Dead = !(paramsLower && c2RetentionObserved >= thresholds.c2Retention);

  const bestProvenanceCoverage = Math.max(B.provenanceCoverage, C.provenanceCoverage);
  const c3Dead = bestProvenanceCoverage < thresholds.c3CoverageFloor;

  const tokenRatioBoverA =
    A.meanInputTokens === 0 ? Infinity : B.meanInputTokens / A.meanInputTokens;

  const summary = [
    c1Dead
      ? `C1 DEAD — IR not more efficient (B tokens ${B.meanInputTokens.toFixed(0)} >= A ${A.meanInputTokens.toFixed(0)} and pass ${pct(B.passRate)} <= ${pct(A.passRate)})`
      : `C1 alive — IR token ratio B/A = ${tokenRatioBoverA.toFixed(2)}, pass ${pct(B.passRate)} vs ${pct(A.passRate)}`,
    c2Dead
      ? `C2 DEAD — small+offload retention ${pct(c2RetentionObserved)} ${paramsLower ? `< ${pct(thresholds.c2Retention)}` : '(arm-C lower-params not asserted)'}`
      : `C2 alive — small+offload retains ${pct(c2RetentionObserved)} of baseline at lower params`,
    c3Dead
      ? `C3 weak — provenance coverage ${pct(bestProvenanceCoverage)} < floor ${pct(thresholds.c3CoverageFloor)}`
      : `C3 ok — provenance coverage ${pct(bestProvenanceCoverage)}`,
  ];

  return {
    c1Dead,
    c2Dead,
    c3Dead,
    thesisDead: c1Dead || c2Dead,
    detail: {
      nlTokens: A.meanInputTokens,
      irTokens: B.meanInputTokens,
      tokenRatioBoverA,
      passRateA: A.passRate,
      passRateB: B.passRate,
      passRateC: C.passRate,
      c2RetentionObserved,
      bestProvenanceCoverage,
    },
    summary,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

/** Convenience: which arm carried the most token-efficient passing representation. */
export function mostEfficientArm(report: BenchReport): Arm {
  const arms = [report.arms.A, report.arms.B, report.arms.C];
  // Efficiency = pass-rate per input token; higher is better.
  const scored = arms.map((a) => ({
    arm: a.arm,
    eff: a.meanInputTokens === 0 ? 0 : a.passRate / a.meanInputTokens,
  }));
  scored.sort((x, y) => y.eff - x.eff);
  return scored[0].arm;
}
