/**
 * TropicalBezoutConjecture — the string-math (tropical / toric geometry) sub-class
 * of the Conjecture Engine.
 *
 * String theory AS PHYSICS is unfalsifiable and out of scope (W.530); string theory
 * AS MATHEMATICS gives exactly-checkable proof-carrying geometry. This module verifies
 * the cleanest correctly-implementable instance of the tropical↔classical correspondence:
 *
 *   Bernstein–Kushnirenko / BKK ("tropical Bézout"): the number of solutions of a
 *   generic system of two plane polynomials with Newton polygons P, Q equals the
 *   normalized mixed volume MV(P, Q). For the degree-d Newton triangle T_d, this
 *   recovers classical Bézout: MV(T_{d1}, T_{d2}) = d1·d2.
 *
 * The mixed volume is computed for real — a genuine Minkowski-sum + convex-hull +
 * shoelace pipeline over lattice polygons, in exact integer arithmetic — NOT a formula
 * assertion. The conjecture survives iff the computed MV equals the classical Bézout
 * number across the swept degrees; a deliberately-false companion claim is the
 * discovering falsifier.
 *
 * Receipt-carrying evidence, NOT a Lean proof (W.511). This verifies finite instances
 * of the correspondence; PROVING mirror symmetry / the Gross–Siebert program is
 * Lean-tier (Paper 22). Full Mikhalkin curve-counting (N_d with multiplicities) is the
 * harder next rung; BKK/Bézout is the correct, tractable first slice.
 *
 * Built on the same tropical/toric backbone as the rest of the stack (Paper 29).
 */

import { buildConjectureStableKey } from './ConjectureEngine';

export const TROPICAL_BEZOUT_V1 = 'conjecture.stringmath.tropical-bezout.v1' as const;
export type TropicalBezoutSolverType = typeof TROPICAL_BEZOUT_V1;

export type TropicalConjectureStatus = 'survived' | 'falsified' | 'undecided';
export type TropicalProbeStatus = 'pass' | 'fail';

export type LatticePoint = readonly [number, number];

export interface MixedVolumeEvaluation {
  d1: number;
  d2: number;
  mixedVolume: number;
  classicalBezout: number;
  status: TropicalProbeStatus;
  message: string;
}

export interface TropicalCounterexample {
  d1: number;
  d2: number;
  expected: number;
  actual: number;
  reason: string;
}

export interface TropicalScenario {
  id: string;
  role: 'survivor' | 'falsifier';
  statement: string;
  evaluations: ReadonlyArray<MixedVolumeEvaluation>;
  status: TropicalConjectureStatus;
  counterexamples: ReadonlyArray<TropicalCounterexample>;
}

export interface TropicalBezoutReceipt {
  solverType: TropicalBezoutSolverType;
  specVersion: 1;
  maxDegree: number;
  scenarios: ReadonlyArray<TropicalScenario>;
  gate: {
    survivorScenarioId: string | null;
    falsifierScenarioId: string | null;
    passed: boolean;
  };
  receiptKey: string;
}

export interface TropicalBezoutOptions {
  /** Largest degree swept (inclusive), for both factors. Must be >= 1. Default 6. */
  maxDegree?: number;
}

/** The standard degree-d Newton triangle conv{(0,0),(d,0),(0,d)}. */
export function degreeTriangle(d: number): LatticePoint[] {
  if (!Number.isInteger(d) || d < 1) {
    throw new Error('TropicalBezout: degree must be an integer >= 1');
  }
  return [
    [0, 0],
    [d, 0],
    [0, d],
  ];
}

/** Twice the Euclidean area of a polygon via the shoelace formula (exact integer). */
export function twiceArea(polygon: ReadonlyArray<LatticePoint>): number {
  let acc = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    acc += x1 * y2 - x2 * y1;
  }
  return Math.abs(acc);
}

function cross(o: LatticePoint, a: LatticePoint, b: LatticePoint): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Convex hull (CCW, no collinear interior points) via Andrew's monotone chain. */
export function convexHull(points: ReadonlyArray<LatticePoint>): LatticePoint[] {
  const pts = [...points]
    .map((p): LatticePoint => [p[0], p[1]])
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  // dedupe
  const uniq: LatticePoint[] = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) uniq.push(p);
  }
  if (uniq.length <= 2) return uniq;

  const lower: LatticePoint[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: LatticePoint[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Minkowski sum of two lattice polygons: convex hull of all pairwise vertex sums. */
export function minkowskiSum(
  p: ReadonlyArray<LatticePoint>,
  q: ReadonlyArray<LatticePoint>,
): LatticePoint[] {
  const sums: LatticePoint[] = [];
  for (const a of p) {
    for (const b of q) {
      sums.push([a[0] + b[0], a[1] + b[1]]);
    }
  }
  return convexHull(sums);
}

/**
 * Normalized 2D mixed volume MV(P, Q) = (Area(P⊕Q) − Area(P) − Area(Q)), which by
 * Bernstein–Kushnirenko is the generic intersection number of two plane curves with
 * Newton polygons P, Q. Computed in exact integer arithmetic via twice-areas.
 */
export function mixedVolume2D(
  p: ReadonlyArray<LatticePoint>,
  q: ReadonlyArray<LatticePoint>,
): number {
  const numerator = twiceArea(minkowskiSum(p, q)) - twiceArea(p) - twiceArea(q);
  if (numerator % 2 !== 0) {
    throw new Error('TropicalBezout: non-integer mixed volume (geometry error)');
  }
  return numerator / 2;
}

function buildSurvivorScenario(maxDegree: number): TropicalScenario {
  const evaluations: MixedVolumeEvaluation[] = [];
  for (let d1 = 1; d1 <= maxDegree; d1++) {
    for (let d2 = 1; d2 <= maxDegree; d2++) {
      const mv = mixedVolume2D(degreeTriangle(d1), degreeTriangle(d2));
      const bezout = d1 * d2;
      evaluations.push({
        d1,
        d2,
        mixedVolume: mv,
        classicalBezout: bezout,
        status: mv === bezout ? 'pass' : 'fail',
        message: `MV(T_${d1}, T_${d2}) = ${mv}; classical Bézout = ${bezout}`,
      });
    }
  }
  const counterexamples: TropicalCounterexample[] = evaluations
    .filter((e) => e.status === 'fail')
    .map((e) => ({
      d1: e.d1,
      d2: e.d2,
      expected: e.classicalBezout,
      actual: e.mixedVolume,
      reason: 'computed mixed volume disagrees with classical Bézout',
    }));
  return {
    id: 'tropical-bezout.mixed-volume-equals-bezout',
    role: 'survivor',
    statement: `For all 1 <= d1,d2 <= ${maxDegree}, MV(T_d1, T_d2) = d1·d2 (BKK / tropical Bézout).`,
    evaluations,
    status: counterexamples.length === 0 ? 'survived' : 'falsified',
    counterexamples,
  };
}

function buildFalsifierScenario(maxDegree: number): TropicalScenario {
  // Deliberately FALSE companion: "MV(T_d1,T_d2) = d1 + d2". True only when d1·d2 = d1+d2
  // (i.e. (2,2)); every other pair is a discovered counterexample.
  const evaluations: MixedVolumeEvaluation[] = [];
  const counterexamples: TropicalCounterexample[] = [];
  for (let d1 = 1; d1 <= maxDegree; d1++) {
    for (let d2 = 1; d2 <= maxDegree; d2++) {
      const mv = mixedVolume2D(degreeTriangle(d1), degreeTriangle(d2));
      const falseClaim = d1 + d2;
      const pass = mv === falseClaim;
      evaluations.push({
        d1,
        d2,
        mixedVolume: mv,
        classicalBezout: falseClaim,
        status: pass ? 'pass' : 'fail',
        message: `MV(T_${d1}, T_${d2}) = ${mv}; false claim d1+d2 = ${falseClaim}`,
      });
      if (!pass) {
        counterexamples.push({
          d1,
          d2,
          expected: falseClaim,
          actual: mv,
          reason: 'mixed volume is the product d1·d2, not the sum d1+d2',
        });
      }
    }
  }
  return {
    id: 'tropical-bezout.mixed-volume-equals-sum',
    role: 'falsifier',
    statement: `For all 1 <= d1,d2 <= ${maxDegree}, MV(T_d1, T_d2) = d1 + d2 (deliberately false).`,
    evaluations,
    status: counterexamples.length > 0 ? 'falsified' : 'survived',
    counterexamples,
  };
}

/**
 * Run the tropical-Bézout (BKK) string-math conjecture sub-class end to end:
 * a survivor (mixed volume == classical Bézout, computed for real) and a discovering
 * falsifier (the false sum-claim). Deterministic receipt key via the shared
 * `buildConjectureStableKey` primitive. The gate passes when the survivor is fully
 * survived AND the falsifier is refuted by at least one discovered counterexample.
 */
export function runTropicalBezoutConjecture(
  options: TropicalBezoutOptions = {},
): TropicalBezoutReceipt {
  const maxDegree = options.maxDegree ?? 6;
  if (!Number.isInteger(maxDegree) || maxDegree < 1) {
    throw new Error('TropicalBezout: maxDegree must be an integer >= 1');
  }

  const survivor = buildSurvivorScenario(maxDegree);
  const falsifier = buildFalsifierScenario(maxDegree);
  const scenarios = [survivor, falsifier];

  const survivorOk = survivor.status === 'survived';
  const falsifierRefuted = falsifier.status === 'falsified' && falsifier.counterexamples.length > 0;

  const withoutKey = {
    solverType: TROPICAL_BEZOUT_V1,
    specVersion: 1 as const,
    maxDegree,
    scenarios,
    gate: {
      survivorScenarioId: survivorOk ? survivor.id : null,
      falsifierScenarioId: falsifierRefuted ? falsifier.id : null,
      passed: survivorOk && falsifierRefuted,
    },
  };

  return {
    ...withoutKey,
    receiptKey: buildConjectureStableKey('conjecture.stringmath.tropical-bezout', withoutKey),
  };
}
