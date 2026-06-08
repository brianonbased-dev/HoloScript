/**
 * NumberTheoryConjecture — the first NON-geometry Conjecture Engine sub-class.
 *
 * The shipped ConjectureEngine candidate type is mesh-only (vertices/elements),
 * so number theory does not fit it. Rather than hack integers into a geometry
 * mesh, this module models Diophantine conjectures directly and reuses the
 * GENERIC receipt-key primitive (`buildConjectureStableKey`) so the engine's
 * receipt spine — not its geometry candidate type — is what generalizes.
 *
 * Target: the Erdős–Straus conjecture, 4/n = 1/x + 1/y + 1/z (n >= 2, x,y,z > 0
 * integers). Verified for all n < 1e17; OPEN in general. We therefore make a
 * BOUNDED, honest claim: every n in a finite range admits a decomposition our
 * bounded search finds — survivors are receipt-carrying evidence, an unfound n
 * is `undecided` (NOT falsified — absence within a bound is not a counterexample),
 * and we NEVER claim "solved Erdős–Straus".
 *
 * All arithmetic is exact integer arithmetic — deterministic and hashable.
 * Receipt-carrying evidence, NOT a Lean proof (W.511).
 */

import { buildConjectureStableKey } from './ConjectureEngine';

export const ERDOS_STRAUS_V1 = 'conjecture.numbertheory.erdos-straus.v1' as const;
export type ErdosStrausSolverType = typeof ERDOS_STRAUS_V1;

export type NumberConjectureStatus = 'survived' | 'falsified' | 'undecided';
export type NumberProbeStatus = 'pass' | 'fail' | 'inconclusive';

export interface UnitFractionDecomposition {
  n: number;
  x: number;
  y: number;
  z: number;
}

export interface NumberConjectureEvaluation {
  n: number;
  status: NumberProbeStatus;
  witness: UnitFractionDecomposition | null;
  message: string;
}

export interface NumberConjectureCounterexample {
  n: number;
  reason: string;
}

export interface NumberConjectureScenario {
  id: string;
  role: 'survivor' | 'falsifier';
  statement: string;
  evaluations: ReadonlyArray<NumberConjectureEvaluation>;
  status: NumberConjectureStatus;
  counterexamples: ReadonlyArray<NumberConjectureCounterexample>;
}

export interface ErdosStrausReceipt {
  solverType: ErdosStrausSolverType;
  specVersion: 1;
  minN: number;
  maxN: number;
  searchBound: number;
  scenarios: ReadonlyArray<NumberConjectureScenario>;
  gate: {
    survivorScenarioId: string | null;
    falsifierScenarioId: string | null;
    undecidedCount: number;
    passed: boolean;
  };
  receiptKey: string;
}

export interface ErdosStrausOptions {
  /** Smallest n (inclusive). Must be >= 2. Default 2. */
  minN?: number;
  /** Largest n (inclusive). Default 50. */
  maxN?: number;
  /** Maximum denominator searched before declaring a case `undecided`. Default 4000. */
  searchBound?: number;
}

/**
 * Exact integer check of 4/n = 1/x + 1/y + 1/z.
 * Cross-multiplied: 4·x·y·z == n·(y·z + x·z + x·y), with x,y,z > 0.
 */
export function verifyErdosStraus(n: number, x: number, y: number, z: number): boolean {
  if (![n, x, y, z].every((v) => Number.isInteger(v))) return false;
  if (x <= 0 || y <= 0 || z <= 0 || n < 2) return false;
  return 4 * x * y * z === n * (y * z + x * z + x * y);
}

/**
 * Bounded exact-integer search for a decomposition of 4/n. Returns the
 * lexicographically-first ordered triple (x <= y <= z) found, or null if none
 * exists with denominators <= searchBound. Uses only integer arithmetic.
 *
 * 1/x is the largest term, so x ∈ [ceil(n/4), floor(3n/4)].
 * Given x, the remainder is r = (4x - n)/(n·x); then 1/y + 1/z = r with
 * y ∈ (1/r, 2/r], and z = (n·x·y)/((4x - n)·y - n·x) when that is a positive integer.
 */
export function findErdosStrausDecomposition(
  n: number,
  searchBound = 4000
): UnitFractionDecomposition | null {
  if (!Number.isInteger(n) || n < 2) return null;

  const xMin = Math.ceil(n / 4);
  const xMax = Math.min(Math.floor((3 * n) / 4) + 1, searchBound);
  for (let x = Math.max(1, xMin); x <= xMax; x++) {
    // r = 4/n - 1/x = (4x - n)/(n·x)
    const rNum = 4 * x - n;
    const rDen = n * x;
    if (rNum <= 0) continue; // 1/x >= 4/n leaves no positive remainder

    // 1/y + 1/z = rNum/rDen, with y >= x and y <= 2·rDen/rNum.
    const yMin = Math.max(x, Math.floor(rDen / rNum) + 1);
    const yMax = Math.min(Math.floor((2 * rDen) / rNum), searchBound);
    for (let y = yMin; y <= yMax; y++) {
      // 1/z = rNum/rDen - 1/y = (rNum·y - rDen)/(rDen·y)
      const zNum = rNum * y - rDen;
      if (zNum <= 0) continue;
      const zDenTimesNum = rDen * y;
      if (zDenTimesNum % zNum !== 0) continue;
      const z = zDenTimesNum / zNum;
      if (z >= y && verifyErdosStraus(n, x, y, z)) {
        return { n, x, y, z };
      }
    }
  }
  return null;
}

/**
 * The deliberately-FALSE companion claim used as the falsifier scenario:
 * "4/n has an equal-denominator decomposition 4/n = 3/x with integer x."
 * x = 3n/4 is an integer only when 4 | n, so every n not divisible by 4 is a
 * discovered counterexample. This proves the engine refutes a false number-theory
 * claim by construction, mirroring the geometry suite's discovering falsifier.
 */
export function findEqualUnitFraction(n: number): number | null {
  if (!Number.isInteger(n) || n < 2) return null;
  if ((3 * n) % 4 !== 0) return null;
  const x = (3 * n) / 4;
  // 4/n = 3/x  <=>  4·x = 3·n
  return 4 * x === 3 * n ? x : null;
}

function buildSurvivorScenario(
  minN: number,
  maxN: number,
  searchBound: number
): NumberConjectureScenario {
  const evaluations: NumberConjectureEvaluation[] = [];
  for (let n = minN; n <= maxN; n++) {
    const witness = findErdosStrausDecomposition(n, searchBound);
    if (witness) {
      evaluations.push({
        n,
        status: 'pass',
        witness,
        message: `4/${n} = 1/${witness.x} + 1/${witness.y} + 1/${witness.z}`,
      });
    } else {
      evaluations.push({
        n,
        status: 'inconclusive',
        witness: null,
        message: `no decomposition found within denominator bound ${searchBound} (undecided, not a counterexample)`,
      });
    }
  }
  const anyInconclusive = evaluations.some((e) => e.status === 'inconclusive');
  return {
    id: 'erdos-straus.decomposition-exists',
    role: 'survivor',
    statement: `Every n in [${minN}, ${maxN}] admits a unit-fraction decomposition 4/n = 1/x + 1/y + 1/z.`,
    evaluations,
    // No counterexample is possible for the true conjecture; an unfound case is undecided.
    status: anyInconclusive ? 'undecided' : 'survived',
    counterexamples: [],
  };
}

function buildFalsifierScenario(minN: number, maxN: number): NumberConjectureScenario {
  const evaluations: NumberConjectureEvaluation[] = [];
  const counterexamples: NumberConjectureCounterexample[] = [];
  for (let n = minN; n <= maxN; n++) {
    const x = findEqualUnitFraction(n);
    if (x !== null) {
      evaluations.push({
        n,
        status: 'pass',
        witness: { n, x, y: x, z: x },
        message: `4/${n} = 3/${x} (equal-denominator form exists)`,
      });
    } else {
      evaluations.push({
        n,
        status: 'fail',
        witness: null,
        message: `4/${n} has no integer equal-denominator form 3/x`,
      });
      counterexamples.push({ n, reason: '3n not divisible by 4 — no integer x with 4/n = 3/x' });
    }
  }
  return {
    id: 'erdos-straus.equal-denominator-exists',
    role: 'falsifier',
    statement: `Every n in [${minN}, ${maxN}] admits an equal-denominator form 4/n = 3/x with integer x.`,
    evaluations,
    status: counterexamples.length > 0 ? 'falsified' : 'survived',
    counterexamples,
  };
}

/**
 * Run the Erdős–Straus conjecture sub-class end to end: a survivor scenario
 * (decomposition exists — bounded, honest `undecided` on misses) and a
 * discovering falsifier (the false equal-denominator claim). Deterministic
 * receipt key via the shared `buildConjectureStableKey` primitive.
 *
 * The gate passes when the survivor is fully survived AND the falsifier is
 * refuted by at least one discovered counterexample.
 */
export function runErdosStrausConjecture(options: ErdosStrausOptions = {}): ErdosStrausReceipt {
  const minN = options.minN ?? 2;
  const maxN = options.maxN ?? 50;
  const searchBound = options.searchBound ?? 4000;
  if (!Number.isInteger(minN) || !Number.isInteger(maxN) || minN < 2 || maxN < minN) {
    throw new Error('NumberTheoryConjecture: require integers 2 <= minN <= maxN');
  }

  const survivor = buildSurvivorScenario(minN, maxN, searchBound);
  const falsifier = buildFalsifierScenario(minN, maxN);
  const scenarios = [survivor, falsifier];

  const undecidedCount = survivor.evaluations.filter((e) => e.status === 'inconclusive').length;
  const survivorOk = survivor.status === 'survived';
  const falsifierRefuted = falsifier.status === 'falsified' && falsifier.counterexamples.length > 0;

  const withoutKey = {
    solverType: ERDOS_STRAUS_V1,
    specVersion: 1 as const,
    minN,
    maxN,
    searchBound,
    scenarios,
    gate: {
      survivorScenarioId: survivorOk ? survivor.id : null,
      falsifierScenarioId: falsifierRefuted ? falsifier.id : null,
      undecidedCount,
      passed: survivorOk && falsifierRefuted,
    },
  };

  return {
    ...withoutKey,
    receiptKey: buildConjectureStableKey('conjecture.numbertheory.erdos-straus', withoutKey),
  };
}
