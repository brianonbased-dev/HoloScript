/**
 * ConjectureRunner is the first operator-facing loop around `conjecture.v1`:
 * generate a bounded suite, execute invariant probes, preserve falsifiers,
 * classify receipts, and graduate the survivor/falsifier pair as evidence.
 */

import {
  buildConjectureStableKey,
  buildConjectureV1Receipt,
  createDegenerateTriangleCandidate,
  createSquareSheetCandidate,
  createTetrahedronSurfaceCandidate,
  collisionEquivalenceProbe,
  curvatureBoundProbe,
  eulerCharacteristicProbe,
  geometryHashOrderInvariantProbe,
  manifoldEdgeProbe,
  nonDegenerateGeometryProbe,
  type ConjectureClaim,
  type ConjectureProbe,
  type ConjectureReceipt,
  type ConjectureStatus,
  type GeometryConjectureCandidate,
} from './ConjectureEngine';
import {
  generateCollisionEquivalenceFamily,
  generateCollapsingTriangleFamily,
  generateCurvatureConeFamily,
  generateRegularPolygonSheetFamily,
  generateSharedEdgeFanFamily,
} from './ConjectureGenerator';
import { stableStringify } from './equivalenceRecord';
import type { HashMode } from './hashes';

export const CONJECTURE_RUNNER_V1 = 'conjecture.runner.v1' as const;
export const PROOF_CARRYING_GEOMETRY_SMOKE_SUITE = 'proof-carrying-geometry-smoke' as const;
export const GENERATED_GEOMETRY_FAMILY_SUITE = 'generated-geometry-family' as const;

export type ConjectureRunnerV1SolverType = typeof CONJECTURE_RUNNER_V1;
export type ConjectureRunnerSuite =
  | typeof PROOF_CARRYING_GEOMETRY_SMOKE_SUITE
  | typeof GENERATED_GEOMETRY_FAMILY_SUITE;
export type ConjectureRunnerStatus = 'completed' | 'failed';
export type ConjectureRunnerPhase = 'GENERATE' | 'EXECUTE' | 'FALSIFY' | 'CLASSIFY' | 'GRADUATE';
export type ConjectureScenarioRole = 'survivor' | 'falsifier' | 'boundary';
export type ConjectureGraduationTarget =
  | 'receipt-carrying.geometry'
  | 'trait-invariant.candidate'
  | 'compiler-check.candidate'
  | 'lean-obligation.gated';

export interface ConjectureRunnerInput {
  suite?: ConjectureRunnerSuite;
  proposedBy?: string;
  hashMode?: HashMode;
  includeHashBoundary?: boolean;
}

export interface ConjectureRunnerStage {
  phase: ConjectureRunnerPhase;
  status: ConjectureRunnerStatus;
  summary: string;
  evidence: ReadonlyArray<string>;
}

export interface ConjectureRunnerReplay {
  scenarioId: string;
  status: ConjectureStatus;
  receiptKeyMatched: boolean;
  counterexampleMatched: boolean;
}

export interface ConjectureRunnerGate {
  survivorReceiptKey: string | null;
  falsifiedReceiptKey: string | null;
  replayCounterexampleMatched: boolean;
  passed: boolean;
}

export interface ConjectureRunnerClassification {
  scenarioId: string;
  role: ConjectureScenarioRole;
  status: ConjectureStatus;
  receiptKey: string;
  counterexampleCount: number;
}

export interface ConjectureRunnerResult {
  solverType: ConjectureRunnerV1SolverType;
  specVersion: 1;
  suite: ConjectureRunnerSuite;
  status: ConjectureRunnerStatus;
  receiptKey: string;
  stages: ReadonlyArray<ConjectureRunnerStage>;
  receipts: ReadonlyArray<ConjectureReceipt>;
  classifications: ReadonlyArray<ConjectureRunnerClassification>;
  replay: ReadonlyArray<ConjectureRunnerReplay>;
  gate: ConjectureRunnerGate;
  graduation: ReadonlyArray<ConjectureGraduationTarget>;
}

interface ConjectureScenario {
  id: string;
  role: ConjectureScenarioRole;
  claim: ConjectureClaim;
  candidates: ReadonlyArray<GeometryConjectureCandidate>;
  probes: ReadonlyArray<ConjectureProbe>;
  graduationTarget: ConjectureGraduationTarget;
}

const DEFAULT_PROPOSED_BY = 'codex-hardware';

function claimBase(
  proposedBy: string
): Pick<ConjectureClaim, 'kind' | 'assumptions' | 'evidenceRefs' | 'proposedBy'> {
  return {
    kind: 'geometry.invariant',
    assumptions: [
      'generated candidates carry explicit element arity',
      'receipt-carrying geometry is evidence, not a Lean proof',
      'falsifiers must replay with the same counterexample signature',
    ],
    evidenceRefs: [
      'research/2026-05-23_holoscript-conjecture-engine-AUTONOMIZE.md',
      'packages/engine/src/simulation/ConjectureEngine.ts',
    ],
    proposedBy,
  };
}

function buildProofCarryingGeometrySmokeScenarios(
  proposedBy: string,
  includeHashBoundary: boolean
): ReadonlyArray<ConjectureScenario> {
  const base = claimBase(proposedBy);
  const scenarios: ConjectureScenario[] = [
    {
      id: 'proof-carrying-geometry.survivor',
      role: 'survivor',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.SURVIVOR',
        statement:
          'A generated square sheet can carry a deterministic receipt for non-degeneracy, topology, and hash-order invariance.',
      },
      candidates: [createSquareSheetCandidate('runner-square-sheet')],
      probes: [
        nonDegenerateGeometryProbe(),
        geometryHashOrderInvariantProbe('sha256'),
        eulerCharacteristicProbe(1),
      ],
      graduationTarget: 'receipt-carrying.geometry',
    },
    {
      id: 'proof-carrying-geometry.falsifier',
      role: 'falsifier',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.FALSIFIER',
        statement:
          'Every generated triangle candidate is non-degenerate under the proof-carrying geometry smoke suite.',
      },
      candidates: [createDegenerateTriangleCandidate('runner-degenerate-triangle')],
      probes: [nonDegenerateGeometryProbe()],
      graduationTarget: 'trait-invariant.candidate',
    },
  ];

  if (includeHashBoundary) {
    scenarios.push({
      id: 'proof-carrying-geometry.hash-boundary',
      role: 'boundary',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.HASH_BOUNDARY',
        statement:
          'Four-triangle closed surfaces preserve geometry hash under primitive reordering.',
      },
      candidates: [createTetrahedronSurfaceCandidate('runner-tetrahedron-surface')],
      probes: [geometryHashOrderInvariantProbe('sha256')],
      graduationTarget: 'compiler-check.candidate',
    });
  }

  return scenarios;
}

function buildGeneratedGeometryFamilyScenarios(
  proposedBy: string
): ReadonlyArray<ConjectureScenario> {
  const base = claimBase(proposedBy);
  const survivorFamily = generateRegularPolygonSheetFamily({ minSides: 3, maxSides: 8 });
  const falsifierFamily = generateCollapsingTriangleFamily({
    steps: 6,
    startHeight: 1,
    endHeight: 0,
  });
  const manifoldFalsifierFamily = generateSharedEdgeFanFamily({ maxBlades: 4 });
  const collisionSurvivorFamily = generateCollisionEquivalenceFamily({ rotationsDegrees: [0] });
  const collisionFalsifierFamily = generateCollisionEquivalenceFamily({
    rotationsDegrees: [0, 45],
  });
  const curvatureSurvivorFamily = generateCurvatureConeFamily({ apexHeights: [0.5] });
  const curvatureFalsifierFamily = generateCurvatureConeFamily({ apexHeights: [0.5, 2] });

  return [
    {
      id: 'generated-geometry.regular-polygon-sheet-family',
      role: 'survivor',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.GENERATED_SURVIVOR',
        statement:
          'Every machine-generated regular polygon sheet (sides 3..8) is non-degenerate, edge-manifold, and has Euler characteristic 1.',
      },
      candidates: survivorFamily,
      probes: [nonDegenerateGeometryProbe(), manifoldEdgeProbe(), eulerCharacteristicProbe(1)],
      graduationTarget: 'receipt-carrying.geometry',
    },
    {
      id: 'generated-geometry.collapsing-triangle-sweep',
      role: 'falsifier',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.GENERATED_FALSIFIER',
        statement:
          'Every triangle in a machine-generated apex-height sweep (1 -> 0) is non-degenerate.',
      },
      candidates: falsifierFamily,
      probes: [nonDegenerateGeometryProbe()],
      graduationTarget: 'trait-invariant.candidate',
    },
    {
      id: 'generated-geometry.shared-edge-fan-sweep',
      role: 'falsifier',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.GENERATED_MANIFOLD_FALSIFIER',
        statement: 'Every machine-generated shared-edge fan (1..4 blades) is edge-manifold.',
      },
      candidates: manifoldFalsifierFamily,
      probes: [manifoldEdgeProbe()],
      graduationTarget: 'compiler-check.candidate',
    },
    {
      id: 'generated-geometry.collision-equivalence-survivor',
      role: 'survivor',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.COLLISION_EQUIVALENCE_SURVIVOR',
        statement:
          'An axis-aligned generated quad has equivalent convex-hull and AABB collision proxies.',
      },
      candidates: collisionSurvivorFamily,
      probes: [collisionEquivalenceProbe()],
      graduationTarget: 'trait-invariant.candidate',
    },
    {
      id: 'generated-geometry.collision-equivalence-sweep',
      role: 'falsifier',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.COLLISION_EQUIVALENCE_FALSIFIER',
        statement:
          'Every generated quad rotation preserves collision equivalence between convex-hull and AABB proxies.',
      },
      candidates: collisionFalsifierFamily,
      probes: [collisionEquivalenceProbe()],
      graduationTarget: 'compiler-check.candidate',
    },
    {
      id: 'generated-geometry.curvature-bound-survivor',
      role: 'survivor',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.CURVATURE_BOUND_SURVIVOR',
        statement:
          'A gentle generated cone/bipyramid stays within the receipt-tier curvature bound.',
      },
      candidates: curvatureSurvivorFamily,
      probes: [curvatureBoundProbe(2.5)],
      graduationTarget: 'trait-invariant.candidate',
    },
    {
      id: 'generated-geometry.curvature-bound-sweep',
      role: 'falsifier',
      claim: {
        ...base,
        id: 'C.GEOM.RUNNER.CURVATURE_BOUND_FALSIFIER',
        statement:
          'Every generated cone/bipyramid sharpness stays within the receipt-tier curvature bound.',
      },
      candidates: curvatureFalsifierFamily,
      probes: [curvatureBoundProbe(2.5)],
      graduationTarget: 'compiler-check.candidate',
    },
  ];
}

function runScenario(scenario: ConjectureScenario, hashMode: HashMode): ConjectureReceipt {
  return buildConjectureV1Receipt({
    claim: scenario.claim,
    candidates: scenario.candidates,
    probes: scenario.probes,
    hashMode,
  });
}

function counterexampleSignature(receipt: ConjectureReceipt): string {
  return stableStringify(
    receipt.counterexamples.map((counterexample) => ({
      candidateId: counterexample.candidateId,
      failedProbeIds: counterexample.failedProbes.map((probe) => probe.probeId).sort(),
      geometryHash: counterexample.geometryHash,
    }))
  );
}

function replayScenarios(
  scenarios: ReadonlyArray<ConjectureScenario>,
  receipts: ReadonlyArray<ConjectureReceipt>,
  hashMode: HashMode
): ReadonlyArray<ConjectureRunnerReplay> {
  return scenarios.map((scenario, index) => {
    const replayReceipt = runScenario(scenario, hashMode);
    const original = receipts[index];
    return {
      scenarioId: scenario.id,
      status: replayReceipt.status,
      receiptKeyMatched: replayReceipt.receiptKey === original.receiptKey,
      counterexampleMatched:
        counterexampleSignature(replayReceipt) === counterexampleSignature(original),
    };
  });
}

function classifyReceipts(
  scenarios: ReadonlyArray<ConjectureScenario>,
  receipts: ReadonlyArray<ConjectureReceipt>
): ReadonlyArray<ConjectureRunnerClassification> {
  return receipts.map((receipt, index) => ({
    scenarioId: scenarios[index].id,
    role: scenarios[index].role,
    status: receipt.status,
    receiptKey: receipt.receiptKey,
    counterexampleCount: receipt.counterexamples.length,
  }));
}

function buildGate(
  receipts: ReadonlyArray<ConjectureReceipt>,
  replay: ReadonlyArray<ConjectureRunnerReplay>
): ConjectureRunnerGate {
  const survivor = receipts.find((receipt) => receipt.status === 'survived');
  const falsified = receipts.find(
    (receipt) => receipt.status === 'falsified' && receipt.counterexamples.length > 0
  );
  const replayCounterexampleMatched = replay.some(
    (result) =>
      result.status === 'falsified' && result.receiptKeyMatched && result.counterexampleMatched
  );

  return {
    survivorReceiptKey: survivor?.receiptKey ?? null,
    falsifiedReceiptKey: falsified?.receiptKey ?? null,
    replayCounterexampleMatched,
    passed: Boolean(survivor && falsified && replayCounterexampleMatched),
  };
}

function buildStages(
  scenarios: ReadonlyArray<ConjectureScenario>,
  receipts: ReadonlyArray<ConjectureReceipt>,
  classifications: ReadonlyArray<ConjectureRunnerClassification>,
  replay: ReadonlyArray<ConjectureRunnerReplay>,
  gate: ConjectureRunnerGate
): ReadonlyArray<ConjectureRunnerStage> {
  return [
    {
      phase: 'GENERATE',
      status: 'completed',
      summary: 'Generated bounded proof-carrying geometry candidate worlds.',
      evidence: scenarios.map((scenario) => scenario.id),
    },
    {
      phase: 'EXECUTE',
      status: 'completed',
      summary: 'Executed invariant probes and minted conjecture.v1 receipts.',
      evidence: receipts.map((receipt) => receipt.receiptKey),
    },
    {
      phase: 'FALSIFY',
      status: gate.falsifiedReceiptKey ? 'completed' : 'failed',
      summary: 'Preserved counterexample worlds and replay signatures.',
      evidence: receipts
        .flatMap((receipt) => receipt.counterexamples)
        .map((counterexample) => counterexample.geometryHash),
    },
    {
      phase: 'CLASSIFY',
      status: 'completed',
      summary: 'Classified each receipt as survived, rediscovered, falsified, or inconclusive.',
      evidence: classifications.map(
        (classification) => `${classification.scenarioId}:${classification.status}`
      ),
    },
    {
      phase: 'GRADUATE',
      status: gate.passed ? 'completed' : 'failed',
      summary: 'Graduated the suite only when a survivor and replayable falsifier both exist.',
      evidence: replay.map(
        (result) =>
          `${result.scenarioId}:receipt=${result.receiptKeyMatched}:counterexample=${result.counterexampleMatched}`
      ),
    },
  ];
}

function resultSnapshot(
  result: Omit<ConjectureRunnerResult, 'receiptKey'>
): Record<string, unknown> {
  return {
    solverType: result.solverType,
    specVersion: result.specVersion,
    suite: result.suite,
    status: result.status,
    stages: result.stages,
    receipts: result.receipts,
    classifications: result.classifications,
    replay: result.replay,
    gate: result.gate,
    graduation: result.graduation,
  };
}

function runScenarioCycle(
  scenarios: ReadonlyArray<ConjectureScenario>,
  suite: ConjectureRunnerSuite,
  hashMode: HashMode
): ConjectureRunnerResult {
  const receipts = scenarios.map((scenario) => runScenario(scenario, hashMode));
  const replay = replayScenarios(scenarios, receipts, hashMode);
  const classifications = classifyReceipts(scenarios, receipts);
  const gate = buildGate(receipts, replay);
  const graduation = Array.from(
    new Set(
      scenarios
        .filter(
          (scenario, index) =>
            (scenario.role === 'survivor' || scenario.role === 'boundary') &&
            (receipts[index]?.status === 'survived' ||
              receipts[index]?.status === 'rediscovered')
        )
        .map((scenario) => scenario.graduationTarget)
    )
  );

  const withoutKey: Omit<ConjectureRunnerResult, 'receiptKey'> = {
    solverType: CONJECTURE_RUNNER_V1,
    specVersion: 1,
    suite,
    status: gate.passed ? 'completed' : 'failed',
    stages: [],
    receipts,
    classifications,
    replay,
    gate,
    graduation,
  };
  const stages = buildStages(scenarios, receipts, classifications, replay, gate);
  const withStages = { ...withoutKey, stages };

  return {
    ...withStages,
    receiptKey: buildConjectureStableKey(CONJECTURE_RUNNER_V1, resultSnapshot(withStages)),
  };
}

export function runProofCarryingGeometryConjectureCycle(
  input: ConjectureRunnerInput = {}
): ConjectureRunnerResult {
  const hashMode = input.hashMode ?? 'sha256';
  const scenarios = buildProofCarryingGeometrySmokeScenarios(
    input.proposedBy ?? DEFAULT_PROPOSED_BY,
    input.includeHashBoundary ?? true
  );
  return runScenarioCycle(scenarios, PROOF_CARRYING_GEOMETRY_SMOKE_SUITE, hashMode);
}

/**
 * GENERATE leg: build a conjecture over machine-generated candidate *families*
 * (a swept parameter), not hand-coded one-offs. The survivor family is a sweep
 * of regular polygon sheets; the falsifier family is an apex-height sweep that
 * discovers the degenerate (collinear) member. Survivors and the replayable
 * falsifier graduate exactly as in the smoke suite.
 */
export function runGeneratedGeometryConjectureCycle(
  input: ConjectureRunnerInput = {}
): ConjectureRunnerResult {
  const hashMode = input.hashMode ?? 'sha256';
  const scenarios = buildGeneratedGeometryFamilyScenarios(input.proposedBy ?? DEFAULT_PROPOSED_BY);
  return runScenarioCycle(scenarios, GENERATED_GEOMETRY_FAMILY_SUITE, hashMode);
}

export class ConjectureRunner {
  run(input: ConjectureRunnerInput = {}): ConjectureRunnerResult {
    const suite = input.suite ?? PROOF_CARRYING_GEOMETRY_SMOKE_SUITE;
    if (suite === PROOF_CARRYING_GEOMETRY_SMOKE_SUITE) {
      return runProofCarryingGeometryConjectureCycle(input);
    }
    if (suite === GENERATED_GEOMETRY_FAMILY_SUITE) {
      return runGeneratedGeometryConjectureCycle(input);
    }
    throw new Error(`conjecture.runner.v1: unsupported suite ${suite}`);
  }
}

export function runConjectureRunner(input: ConjectureRunnerInput = {}): ConjectureRunnerResult {
  return new ConjectureRunner().run(input);
}
