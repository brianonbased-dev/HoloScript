/**
 * SdfConjecture — the proof-carrying-SDF sub-class of the Conjecture Engine.
 *
 * A signed distance field is "well-formed" when it is 1-Lipschitz:
 * |f(a) - f(b)| <= |a - b| for all points a, b. True distance functions (sphere,
 * box, …) satisfy this exactly; many popular "SDFs" (gyroid, fractal estimators)
 * are only bounds and violate it — which is why ray-marchers need a per-shape
 * Lipschitz fudge factor. This sub-class carries the 1-Lipschitz invariant as
 * receipt evidence, computed by adversarially sampling the JS-side
 * `evaluateSDFNode` over a deterministic point-pair lattice.
 *
 * HONEST ASYMMETRY (W.511): empirical sampling is SOUND for falsification — a
 * sampled pair with ratio > 1 IS a genuine counterexample — but only EVIDENCE
 * for survival: "no violation found in the sample" is NOT a proof of global
 * 1-Lipschitzness (a violation could hide between sample points). A true proof
 * is Lean-tier / interval-arithmetic (out of receipt-tier scope). So `survived`
 * here means receipt-carrying evidence; `falsified` means a sound counterexample.
 *
 * Built on the shipped SDFPointEvaluator (commit b090bc4a5) and the generic
 * `buildConjectureStableKey` receipt primitive.
 */

import { buildConjectureStableKey } from './ConjectureEngine';
import { evaluateSDFNode, type SDFNode, type SDFPoint } from './SDFPointEvaluator';

export const PROOF_CARRYING_SDF_V1 = 'conjecture.geometry.proof-carrying-sdf.v1' as const;
export type ProofCarryingSdfSolverType = typeof PROOF_CARRYING_SDF_V1;

export type SdfConjectureStatus = 'survived' | 'falsified' | 'undecided';
export type SdfProbeStatus = 'pass' | 'fail';

/** Default Lipschitz tolerance: ratios up to 1 + this are treated as 1-Lipschitz. */
export const LIPSCHITZ_TOLERANCE = 1e-3;

export interface SdfConjectureCandidate {
  id: string;
  family: string;
  node: SDFNode;
  parameters?: Readonly<Record<string, number | string>>;
}

export interface LipschitzWitness {
  a: SDFPoint;
  b: SDFPoint;
  fa: number;
  fb: number;
  distance: number;
  ratio: number;
}

export interface LipschitzResult {
  maxRatio: number;
  witness: LipschitzWitness | null;
  pairsSampled: number;
}

export interface SdfEvaluation {
  candidateId: string;
  family: string;
  status: SdfProbeStatus;
  maxRatio: number;
  witness: LipschitzWitness | null;
  message: string;
}

export interface SdfCounterexample {
  candidateId: string;
  family: string;
  witness: LipschitzWitness;
}

export interface SdfScenario {
  id: string;
  role: 'survivor' | 'falsifier';
  statement: string;
  evaluations: ReadonlyArray<SdfEvaluation>;
  status: SdfConjectureStatus;
  counterexamples: ReadonlyArray<SdfCounterexample>;
}

export interface ProofCarryingSdfReceipt {
  solverType: ProofCarryingSdfSolverType;
  specVersion: 1;
  tolerance: number;
  scenarios: ReadonlyArray<SdfScenario>;
  gate: {
    survivorScenarioId: string | null;
    falsifierScenarioId: string | null;
    passed: boolean;
  };
  receiptKey: string;
}

export interface ProofCarryingSdfOptions {
  tolerance?: number;
}

/**
 * Deterministic adversarial sample lattice: a coarse base grid (avoiding the
 * origin, where some estimators are undefined) crossed with small fixed offset
 * vectors. The max local difference ratio over these pairs is a tight empirical
 * estimate of the Lipschitz constant (the worst ratio is attained by close pairs).
 */
const BASE_COORDS: ReadonlyArray<number> = [-1, -0.34, 0.34, 1];
const OFFSETS: ReadonlyArray<SDFPoint> = [
  [0.02, 0, 0],
  [0, 0.02, 0],
  [0, 0, 0.02],
  [0.0141, 0.0141, 0],
  [0, 0.0141, 0.0141],
  [0.0115, 0.0115, 0.0115],
];

function lipschitzSampleBasePoints(): ReadonlyArray<SDFPoint> {
  const points: SDFPoint[] = [];
  for (const x of BASE_COORDS) {
    for (const y of BASE_COORDS) {
      for (const z of BASE_COORDS) {
        points.push([x, y, z]);
      }
    }
  }
  return points;
}

function pointDistance(a: SDFPoint, b: SDFPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Compute the maximum sampled Lipschitz ratio |f(a)-f(b)|/|a-b| for an SDF node,
 * returning the worst witnessing pair. Non-finite evaluations are skipped.
 */
export function empiricalLipschitzRatio(node: SDFNode): LipschitzResult {
  const basePoints = lipschitzSampleBasePoints();
  let maxRatio = 0;
  let witness: LipschitzWitness | null = null;
  let pairsSampled = 0;

  for (const a of basePoints) {
    const fa = evaluateSDFNode(node, a);
    if (!Number.isFinite(fa)) continue;
    for (const offset of OFFSETS) {
      const b: SDFPoint = [a[0] + offset[0], a[1] + offset[1], a[2] + offset[2]];
      const fb = evaluateSDFNode(node, b);
      if (!Number.isFinite(fb)) continue;
      const distance = pointDistance(a, b);
      if (distance === 0) continue;
      pairsSampled += 1;
      const ratio = Math.abs(fa - fb) / distance;
      if (ratio > maxRatio) {
        maxRatio = ratio;
        witness = { a, b, fa, fb, distance, ratio };
      }
    }
  }
  return { maxRatio, witness, pairsSampled };
}

function evaluateCandidate(candidate: SdfConjectureCandidate, tolerance: number): SdfEvaluation {
  const { maxRatio, witness } = empiricalLipschitzRatio(candidate.node);
  const pass = maxRatio <= 1 + tolerance;
  return {
    candidateId: candidate.id,
    family: candidate.family,
    status: pass ? 'pass' : 'fail',
    maxRatio,
    witness: pass ? null : witness,
    message: pass
      ? `1-Lipschitz within sample (max ratio ${maxRatio.toFixed(4)} <= 1+${tolerance})`
      : `1-Lipschitz violated: sampled ratio ${maxRatio.toFixed(4)} > 1 (counterexample pair carried)`,
  };
}

/** A true-distance sphere of given radius — exact, 1-Lipschitz. */
export function sphereCandidate(radius: number): SdfConjectureCandidate {
  if (!(radius > 0) || !Number.isFinite(radius)) {
    throw new Error('SdfConjecture: sphere radius must be a positive finite number');
  }
  return {
    id: `sphere-r${radius}`,
    family: 'sphere',
    node: { type: 'primitive', primitive: 'sphere', params: { radius } },
    parameters: { radius },
  };
}

/** A gyroid — an implicit-surface function, NOT a true distance; not 1-Lipschitz. */
export function gyroidCandidate(scale: number): SdfConjectureCandidate {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error('SdfConjecture: gyroid scale must be a positive finite number');
  }
  return {
    id: `gyroid-s${scale}`,
    family: 'gyroid',
    node: { type: 'primitive', primitive: 'gyroid', params: { scale, thickness: 0.03 } },
    parameters: { scale, thickness: 0.03 },
  };
}

export function generateSphereFamily(
  radii: ReadonlyArray<number> = [0.5, 1, 1.5, 2]
): ReadonlyArray<SdfConjectureCandidate> {
  return radii.map((r) => sphereCandidate(r));
}

export function generateGyroidFamily(
  scales: ReadonlyArray<number> = [3, 5, 8]
): ReadonlyArray<SdfConjectureCandidate> {
  return scales.map((s) => gyroidCandidate(s));
}

function buildScenario(
  id: string,
  role: 'survivor' | 'falsifier',
  statement: string,
  candidates: ReadonlyArray<SdfConjectureCandidate>,
  tolerance: number
): SdfScenario {
  const evaluations = candidates.map((c) => evaluateCandidate(c, tolerance));
  const counterexamples: SdfCounterexample[] = evaluations
    .filter(
      (e): e is SdfEvaluation & { witness: LipschitzWitness } =>
        e.status === 'fail' && e.witness !== null
    )
    .map((e) => ({ candidateId: e.candidateId, family: e.family, witness: e.witness }));

  let status: SdfConjectureStatus;
  if (role === 'survivor') {
    // survival is EVIDENCE, not proof — but a found violation still falsifies it.
    status = counterexamples.length > 0 ? 'falsified' : 'survived';
  } else {
    status = counterexamples.length > 0 ? 'falsified' : 'survived';
  }
  return { id, role, statement, evaluations, status, counterexamples };
}

/**
 * Run the proof-carrying-SDF conjecture sub-class end to end: a survivor family
 * (true-distance spheres — 1-Lipschitz) and a discovering falsifier family
 * (gyroids — implicit-surface functions whose sampled gradient exceeds 1). The
 * gate passes when the survivor family shows no violation AND the falsifier family
 * yields at least one sound counterexample pair. Deterministic receipt key.
 */
export function runProofCarryingSdfConjecture(
  options: ProofCarryingSdfOptions = {}
): ProofCarryingSdfReceipt {
  const tolerance = options.tolerance ?? LIPSCHITZ_TOLERANCE;
  if (!(tolerance >= 0) || !Number.isFinite(tolerance)) {
    throw new Error('SdfConjecture: tolerance must be a non-negative finite number');
  }

  const survivor = buildScenario(
    'proof-carrying-sdf.spheres-are-1-lipschitz',
    'survivor',
    'Every true-distance sphere SDF is 1-Lipschitz (no violation found in the deterministic sample).',
    generateSphereFamily(),
    tolerance
  );
  const falsifier = buildScenario(
    'proof-carrying-sdf.gyroids-are-1-lipschitz',
    'falsifier',
    'Every gyroid SDF is 1-Lipschitz (deliberately false — gyroid is an implicit surface, not a distance).',
    generateGyroidFamily(),
    tolerance
  );
  const scenarios = [survivor, falsifier];

  const survivorOk = survivor.status === 'survived';
  const falsifierRefuted = falsifier.status === 'falsified' && falsifier.counterexamples.length > 0;

  const withoutKey = {
    solverType: PROOF_CARRYING_SDF_V1,
    specVersion: 1 as const,
    tolerance,
    scenarios,
    gate: {
      survivorScenarioId: survivorOk ? survivor.id : null,
      falsifierScenarioId: falsifierRefuted ? falsifier.id : null,
      passed: survivorOk && falsifierRefuted,
    },
  };

  return {
    ...withoutKey,
    receiptKey: buildConjectureStableKey('conjecture.geometry.proof-carrying-sdf', withoutKey),
  };
}
