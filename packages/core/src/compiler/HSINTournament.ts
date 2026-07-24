/**
 * HSI N3 falsification harness — the matched structural-semantic tournament battery
 * (board task ghmo, research/2026-07-14_holoscript-native-intelligence-opportunity-EVOLVED.md, Stage D).
 *
 * This is the FIRST, deterministic, $0/no-accelerator layer of the N3 tournament: the falsification
 * battery that scores model arms. The actual 20-50M-parameter arms (flat tokens / tokens+types /
 * AST-DFG / object-event-state graph / graph+exact-trace) are trained on GPU and implement the
 * `TournamentArm` interface here; this module defines what they are scored against so a structure-blind
 * arm CANNOT pass silently (the task's hard requirement).
 *
 * What the harness provides (all deterministic, imports Stage A, no LLM/GPU):
 *   - a parameterized HS-Core world generator (clean control over OOD axes: object count, opacity
 *     composition, renaming) so train and out-of-distribution splits are held out by construction;
 *   - a metamorphic battery: rename/reorder (semantics-preserving -> oracle INVARIANT) and
 *     edge-removal/edge-scramble/opacity-flip (semantics-changing -> oracle SENSITIVE);
 *   - an oracle that computes ground-truth from Stage A (observation policy = what structure+opacity
 *     determine; dynamics = runExactTrace) — never a model;
 *   - a TournamentArm interface + reference arms (exact-oracle, edge-blind, dynamics-only) that PROVE
 *     the battery discriminates: the edge-blind arm passes flat cases but fails structural sensitivity;
 *   - a scorecard + deterministic receipt identifying compiler / data / verifiers / device.
 *
 * The falsification claim the battery enforces: an arm that drops type/edge/graph structure has
 * structuralSensitivity ~= 0 while the oracle changes under sensitive transforms, so `runTournament`
 * flags `structureBlind: true` and the arm does not pass. Negative results are valid (task NMoS).
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { parseHoloStrict } from '../parser/HoloCompositionParser';
import {
  renameComposition,
  reorderComposition,
  applyIntervention,
  type HSIRenameMap,
} from './HSIAuditVerifier';
import { runExactTrace } from './HSIExactTrace';
import { lowerCompositionToHSIIR } from './HSIIRCompiler';
import { hsiSha256, type HSIAccess, type HSIIRDocument, type HSIScenarioStep } from './HSIIRTypes';

export const HSI_N3_TOURNAMENT_SCHEMA_VERSION = 'holoscript.hsi-n3-tournament.v0.1.0' as const;
export type HSIN3TournamentSchemaVersion = typeof HSI_N3_TOURNAMENT_SCHEMA_VERSION;
export const HSI_N3_CHECKPOINT_BUNDLE_SCHEMA_VERSION =
  'holoscript.hsi-n3-checkpoint-predictions.v0.1.0' as const;
export type HSIN3CheckpointBundleSchemaVersion = typeof HSI_N3_CHECKPOINT_BUNDLE_SCHEMA_VERSION;

export type HSINOodAxis = 'train' | 'ood-object-count' | 'ood-opacity-composition' | 'ood-rename';

export type HSINMetamorphicKind =
  | 'rename-invariant'
  | 'reorder-invariant'
  | 'edge-removal-sensitive'
  | 'edge-scramble-sensitive'
  | 'opacity-flip-sensitive';

export type HSINOpacityLabel = 'transparent' | 'opaque' | 'unknown';

export interface HSINBarrierSpec {
  readonly name: string;
  readonly opacity: HSINOpacityLabel;
}

export interface HSINWorldParams {
  readonly worldName: string;
  readonly agent: string;
  readonly target: string;
  readonly barriers: readonly HSINBarrierSpec[];
}

/** The structural prediction target: what a world's structure + opacity determine about perception + dynamics. */
export interface HSINPrediction {
  readonly access: HSIAccess; // aggregate observation access of agent -> target
  readonly mediatorCount: number; // number of barriers shielding the target
  readonly goalReached: boolean; // dynamics after the canonical traverse scenario
}

export interface HSINWorldVariant {
  readonly id: string;
  readonly axis: HSINOodAxis;
  readonly split: 'train' | 'eval';
  readonly params: HSINWorldParams;
  readonly ir: HSIIRDocument;
  readonly oracle: HSINPrediction;
}

export interface HSINMetamorphicCase {
  readonly id: string;
  readonly kind: HSINMetamorphicKind;
  readonly expectation: 'invariant' | 'sensitive';
  readonly baseIr: HSIIRDocument;
  readonly transformedIr: HSIIRDocument;
  readonly baseOracle: HSINPrediction;
  readonly transformedOracle: HSINPrediction;
}

export interface HSINBattery {
  readonly schemaVersion: HSIN3TournamentSchemaVersion;
  readonly variants: readonly HSINWorldVariant[];
  readonly metamorphic: readonly HSINMetamorphicCase[];
  readonly dataDigest: string;
}

/** A model arm predicts the structural target for a world (given its IR). Real 20-50M arms implement this. */
export interface TournamentArm {
  readonly id: string;
  predict(ir: HSIIRDocument): HSINPrediction;
}

/**
 * Offline predictions exported from a trained checkpoint.
 *
 * The v1 `n3_train.py` target contains exact-trace `{machines,state}` only. It
 * does not train observation access or mediator count. The bundle therefore
 * admits checkpoint-derived `goalReached` while pinning unsupported perception
 * fields to their fail-closed sentinels. These scorecards are diagnostic-only
 * and MUST NOT alter the preregistered v1 arm/seed branch decision.
 */
export interface HSINCheckpointPredictionBundle {
  readonly schemaVersion: HSIN3CheckpointBundleSchemaVersion;
  readonly kind: 'HSINCheckpointPredictionBundle';
  readonly armId: string;
  readonly checkpoint: {
    readonly sha256: string;
    readonly trainingArm: string;
    readonly seed: number;
  };
  readonly batteryDataDigest: string;
  readonly decisionAuthority: 'diagnostic-only';
  readonly support: {
    readonly access: 'unsupported';
    readonly mediatorCount: 'unsupported';
    readonly goalReached: 'checkpoint-exact-trace';
  };
  readonly predictions: readonly HSINCheckpointPrediction[];
  readonly deterministicDigest: string;
}

export interface HSINCheckpointPrediction {
  readonly irDigest: string;
  readonly prediction: HSINPrediction;
  /** Hash of the checkpoint's canonical decoded `{machines,state}` JSON. */
  readonly decodedFinalDigest: string;
}

export interface HSINCheckpointPredictionBundleInput {
  readonly armId: string;
  readonly checkpoint: HSINCheckpointPredictionBundle['checkpoint'];
  readonly batteryDataDigest: string;
  readonly predictions: readonly HSINCheckpointPrediction[];
}

const CHECKPOINT_BUNDLE_SUPPORT = {
  access: 'unsupported',
  mediatorCount: 'unsupported',
  goalReached: 'checkpoint-exact-trace',
} as const;

function tournamentQueryDigests(battery: HSINBattery): string[] {
  const digests = new Set<string>();
  for (const variant of battery.variants) {
    digests.add(variant.ir.provenance.deterministicDigest);
  }
  for (const metamorphic of battery.metamorphic) {
    digests.add(metamorphic.baseIr.provenance.deterministicDigest);
    digests.add(metamorphic.transformedIr.provenance.deterministicDigest);
  }
  return [...digests].sort();
}

function assertSha256(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase sha256 digest`);
  }
}

/**
 * Canonicalize checkpoint output into a custody-bound, diagnostic-only bundle.
 * Predictions are sorted by IR digest so the receipt hash is deterministic.
 */
export function createCheckpointPredictionBundle(
  input: HSINCheckpointPredictionBundleInput
): HSINCheckpointPredictionBundle {
  if (!input.armId.trim()) throw new Error('checkpoint armId must not be empty');
  if (!input.checkpoint.trainingArm.trim()) {
    throw new Error('checkpoint trainingArm must not be empty');
  }
  if (!Number.isSafeInteger(input.checkpoint.seed)) {
    throw new Error('checkpoint seed must be a safe integer');
  }
  assertSha256(input.checkpoint.sha256, 'checkpoint.sha256');
  assertSha256(input.batteryDataDigest, 'batteryDataDigest');

  const seen = new Set<string>();
  const predictions = [...input.predictions]
    .map((entry) => {
      assertSha256(entry.irDigest, 'prediction.irDigest');
      assertSha256(entry.decodedFinalDigest, 'prediction.decodedFinalDigest');
      if (seen.has(entry.irDigest)) {
        throw new Error(`duplicate checkpoint prediction for ${entry.irDigest}`);
      }
      seen.add(entry.irDigest);
      if (entry.prediction.access !== 'unknown' || entry.prediction.mediatorCount !== 0) {
        throw new Error(
          `checkpoint prediction ${entry.irDigest} must use fail-closed unsupported perception sentinels`
        );
      }
      return entry;
    })
    .sort((a, b) => a.irDigest.localeCompare(b.irDigest));

  const withoutDigest = {
    schemaVersion: HSI_N3_CHECKPOINT_BUNDLE_SCHEMA_VERSION,
    kind: 'HSINCheckpointPredictionBundle' as const,
    armId: input.armId,
    checkpoint: input.checkpoint,
    batteryDataDigest: input.batteryDataDigest,
    decisionAuthority: 'diagnostic-only' as const,
    support: CHECKPOINT_BUNDLE_SUPPORT,
    predictions,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

/**
 * Adapt a custody-bound offline checkpoint bundle to the synchronous
 * `TournamentArm` contract. Missing, extra, stale, or tampered predictions
 * fail closed before any score is computed.
 */
export function checkpointBundleToTournamentArm(
  bundle: HSINCheckpointPredictionBundle,
  battery: HSINBattery
): TournamentArm {
  if (bundle.schemaVersion !== HSI_N3_CHECKPOINT_BUNDLE_SCHEMA_VERSION) {
    throw new Error(`unsupported checkpoint bundle schema ${bundle.schemaVersion}`);
  }
  if (bundle.decisionAuthority !== 'diagnostic-only') {
    throw new Error('checkpoint battery scores must remain diagnostic-only');
  }
  if (
    bundle.support.access !== 'unsupported' ||
    bundle.support.mediatorCount !== 'unsupported' ||
    bundle.support.goalReached !== 'checkpoint-exact-trace'
  ) {
    throw new Error('checkpoint bundle support declaration is invalid');
  }
  if (bundle.batteryDataDigest !== battery.dataDigest) {
    throw new Error(
      `checkpoint bundle battery digest ${bundle.batteryDataDigest} does not match ${battery.dataDigest}`
    );
  }
  const { deterministicDigest, ...withoutDigest } = bundle;
  if (hsiSha256(withoutDigest) !== deterministicDigest) {
    throw new Error('checkpoint bundle deterministic digest mismatch');
  }

  const expected = tournamentQueryDigests(battery);
  const predictions = new Map<string, HSINPrediction>();
  for (const entry of bundle.predictions) {
    if (predictions.has(entry.irDigest)) {
      throw new Error(`duplicate checkpoint prediction for ${entry.irDigest}`);
    }
    if (entry.prediction.access !== 'unknown' || entry.prediction.mediatorCount !== 0) {
      throw new Error(
        `checkpoint prediction ${entry.irDigest} violates unsupported perception sentinels`
      );
    }
    predictions.set(entry.irDigest, entry.prediction);
  }
  const actual = [...predictions.keys()].sort();
  if (
    actual.length !== expected.length ||
    actual.some((digest, index) => digest !== expected[index])
  ) {
    throw new Error(
      `checkpoint bundle coverage mismatch: expected ${expected.length} unique battery IRs, got ${actual.length}`
    );
  }

  return {
    id: bundle.armId,
    predict: (ir) => {
      const digest = ir.provenance.deterministicDigest;
      const prediction = predictions.get(digest);
      if (!prediction) {
        throw new Error(`checkpoint arm ${bundle.armId} has no prediction for ${digest}`);
      }
      return prediction;
    },
  };
}

// ---------------------------------------------------------------------------
// Parameterized HS-Core world generator (deterministic; clean OOD-axis control).
// ---------------------------------------------------------------------------

const OPACITY_PROP: Record<HSINOpacityLabel, string> = {
  transparent: '    opaque: false\n',
  opaque: '    opaque: true\n',
  unknown: '', // absent-in-source = unknown (Stage A custody: never coerce)
};

/** Emit valid HS-Core `.hsplus` source for a barrier world. The base fixture is one point in this space. */
export function generateBarrierWorldSource(params: HSINWorldParams): string {
  const lines: string[] = [];
  lines.push(`composition "${params.worldName}" {`);
  lines.push('  state {');
  lines.push('    scoutZone: "west"');
  lines.push('    goalReached: false');
  lines.push('    inspections: 0');
  lines.push('    traversals: 0');
  lines.push('  }');
  lines.push(`  template "AgentBody" {\n    geometry: "sphere"\n    role: "agent"\n  }`);
  lines.push(`  template "BeaconCore" {\n    geometry: "box"\n    role: "target"\n  }`);
  for (const barrier of params.barriers) {
    lines.push(
      `  template "${barrier.name}Wall" {\n    geometry: "box"\n    role: "barrier"\n${OPACITY_PROP[barrier.opacity]}  }`
    );
  }
  lines.push(`  object "${params.agent}" using "AgentBody" {\n    position: [-4, 0, 0]\n  }`);
  lines.push(`  object "${params.target}" using "BeaconCore" {\n    position: [4, 0, 0]\n  }`);
  params.barriers.forEach((barrier, i) => {
    lines.push(
      `  object "${barrier.name}" using "${barrier.name}Wall" {\n    position: [0, 0, ${i}]\n  }`
    );
  });
  lines.push(`  connect ${params.agent} to ${params.target} as "seeks"`);
  for (const barrier of params.barriers) {
    lines.push(`  connect ${barrier.name} to ${params.target} as "shields"`);
  }
  lines.push('  logic {');
  lines.push(
    '    on_traverse {\n      traversals += 1\n      scoutZone = "east"\n      goalReached = true\n    }'
  );
  lines.push('    on_inspect {\n      inspections += 1\n    }');
  lines.push('  }');
  lines.push('  sim_contract {');
  lines.push('    invariant "bounded_traversals" { traversals <= 3 }');
  lines.push('    invariant "bounded_inspections" { inspections <= 5 }');
  lines.push('    receipt { goalReached: boolean, traversals: number }');
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}

function lowerParams(params: HSINWorldParams): HSIIRDocument {
  const source = generateBarrierWorldSource(params);
  return lowerCompositionToHSIIR(parseHoloStrict(source), { sourceText: source });
}

// ---------------------------------------------------------------------------
// Oracle: ground-truth from Stage A (never a model).
// ---------------------------------------------------------------------------

const TRAVERSE_SCENARIO: readonly HSIScenarioStep[] = [
  { kind: 'fire-event', event: 'on_traverse' },
];

/** Aggregate observation access of the (single) agent observer over its observed target. */
function aggregateAccess(ir: HSIIRDocument): { access: HSIAccess; mediatorCount: number } {
  const rule = ir.observationPolicy.find((r) => r.mediators.length > 0) ?? ir.observationPolicy[0];
  if (!rule) return { access: 'unknown', mediatorCount: 0 };
  return { access: rule.access, mediatorCount: rule.mediators.length };
}

/** Compute the structural + dynamic ground truth. This is what an arm must predict. */
export function oracleLabel(ir: HSIIRDocument): HSINPrediction {
  const { access, mediatorCount } = aggregateAccess(ir);
  const trace = runExactTrace(ir, [...TRAVERSE_SCENARIO]);
  return { access, mediatorCount, goalReached: trace.final.state.goalReached === true };
}

// ---------------------------------------------------------------------------
// Battery generation: train + OOD variants + metamorphic pairs.
// ---------------------------------------------------------------------------

const BASE_PARAMS: HSINWorldParams = {
  worldName: 'HSCoreBarrierWorld',
  agent: 'Scout',
  target: 'Beacon',
  barriers: [
    { name: 'GlassPane', opacity: 'transparent' },
    { name: 'StoneSlab', opacity: 'opaque' },
    { name: 'VeilPanel', opacity: 'unknown' },
  ],
};

const RENAME_MAP: HSIRenameMap = {
  Scout: 'Pathfinder',
  Beacon: 'Lodestar',
  GlassPane: 'ClearPane',
};

function cloneComposition(source: string): HoloComposition {
  return parseHoloStrict(source);
}

function variant(
  id: string,
  axis: HSINOodAxis,
  split: 'train' | 'eval',
  params: HSINWorldParams
): HSINWorldVariant {
  const ir = lowerParams(params);
  return { id, axis, split, params, ir, oracle: oracleLabel(ir) };
}

/** Build the deterministic tournament battery. `barrierPoolSize` extends the OOD object-count axis. */
export function generateTournamentBattery(): HSINBattery {
  const variants: HSINWorldVariant[] = [
    variant('train:base', 'train', 'train', BASE_PARAMS),
    variant('train:two-transparent', 'train', 'train', {
      ...BASE_PARAMS,
      worldName: 'TwoTransparent',
      barriers: [
        { name: 'GlassPane', opacity: 'transparent' },
        { name: 'ClearPane', opacity: 'transparent' },
      ],
    }),
    // OOD: unseen object count (5 barriers, never in train).
    variant('ood:object-count', 'ood-object-count', 'eval', {
      ...BASE_PARAMS,
      worldName: 'FiveBarrier',
      barriers: [
        { name: 'GlassPane', opacity: 'transparent' },
        { name: 'StoneSlab', opacity: 'opaque' },
        { name: 'VeilPanel', opacity: 'unknown' },
        { name: 'IronGate', opacity: 'opaque' },
        { name: 'MistScreen', opacity: 'unknown' },
      ],
    }),
    // OOD: unseen opacity composition (all-unknown — the abstention regime).
    variant('ood:opacity-composition', 'ood-opacity-composition', 'eval', {
      ...BASE_PARAMS,
      worldName: 'AllUnknown',
      barriers: [
        { name: 'VeilPanel', opacity: 'unknown' },
        { name: 'MistScreen', opacity: 'unknown' },
      ],
    }),
  ];

  // OOD: renaming (alpha-rename of the base world) — dynamics/access must be invariant.
  const renamedComposition = cloneComposition(generateBarrierWorldSource(BASE_PARAMS));
  renameComposition(renamedComposition, RENAME_MAP);
  const renamedIr = lowerCompositionToHSIIR(renamedComposition, {});
  variants.push({
    id: 'ood:rename',
    axis: 'ood-rename',
    split: 'eval',
    params: BASE_PARAMS,
    ir: renamedIr,
    oracle: oracleLabel(renamedIr),
  });

  const metamorphic = buildMetamorphicCases();
  const dataDigest = hsiSha256({
    variants: variants.map((v) => ({
      id: v.id,
      digest: v.ir.provenance.deterministicDigest,
      oracle: v.oracle,
    })),
    metamorphic: metamorphic.map((m) => ({ id: m.id, kind: m.kind, expectation: m.expectation })),
  });

  return { schemaVersion: HSI_N3_TOURNAMENT_SCHEMA_VERSION, variants, metamorphic, dataDigest };
}

function buildMetamorphicCases(): HSINMetamorphicCase[] {
  const baseSource = generateBarrierWorldSource(BASE_PARAMS);
  const baseIr = lowerParams(BASE_PARAMS);
  const baseOracle = oracleLabel(baseIr);
  const cases: HSINMetamorphicCase[] = [];

  // rename-invariant: alpha-rename preserves access + dynamics.
  const renamed = cloneComposition(baseSource);
  renameComposition(renamed, RENAME_MAP);
  const renamedIr = lowerCompositionToHSIIR(renamed, {});
  cases.push({
    id: 'mm:rename',
    kind: 'rename-invariant',
    expectation: 'invariant',
    baseIr,
    transformedIr: renamedIr,
    baseOracle,
    transformedOracle: oracleLabel(renamedIr),
  });

  // reorder-invariant: independent declaration reorder preserves behavior.
  const reordered = cloneComposition(baseSource);
  reorderComposition(reordered);
  const reorderedIr = lowerCompositionToHSIIR(reordered, {});
  cases.push({
    id: 'mm:reorder',
    kind: 'reorder-invariant',
    expectation: 'invariant',
    baseIr,
    transformedIr: reorderedIr,
    baseOracle,
    transformedOracle: oracleLabel(reorderedIr),
  });

  // edge-removal-sensitive: drop the opaque wall's shields edge -> aggregate access changes (blocked -> unknown).
  const removedParams: HSINWorldParams = {
    ...BASE_PARAMS,
    worldName: 'StoneRemoved',
    barriers: BASE_PARAMS.barriers.filter((b) => b.name !== 'StoneSlab'),
  };
  const removedIr = lowerParams(removedParams);
  cases.push({
    id: 'mm:edge-removal',
    kind: 'edge-removal-sensitive',
    expectation: 'sensitive',
    baseIr,
    transformedIr: removedIr,
    baseOracle,
    transformedOracle: oracleLabel(removedIr),
  });

  // edge-scramble-sensitive: reassign the opaque wall's opacity to transparent via an intervention
  // (a structure-changing edit of the opacity that mediates the observation edge).
  const scrambled = cloneComposition(baseSource);
  applyIntervention(scrambled, {
    id: 'scramble',
    kind: 'set-opacity',
    entity: 'StoneSlab',
    opaque: false,
  });
  const scrambledIr = lowerCompositionToHSIIR(scrambled, {});
  cases.push({
    id: 'mm:edge-scramble',
    kind: 'edge-scramble-sensitive',
    expectation: 'sensitive',
    baseIr,
    transformedIr: scrambledIr,
    baseOracle,
    transformedOracle: oracleLabel(scrambledIr),
  });

  // opacity-flip-sensitive: make the transparent wall opaque -> still blocked, but mediator opacity changed;
  // use a single-transparent-barrier world so the flip moves aggregate access visible -> blocked.
  const singleTransparent: HSINWorldParams = {
    ...BASE_PARAMS,
    worldName: 'SingleTransparent',
    barriers: [{ name: 'GlassPane', opacity: 'transparent' }],
  };
  const singleIr = lowerParams(singleTransparent);
  const singleSource = generateBarrierWorldSource(singleTransparent);
  const flipped = cloneComposition(singleSource);
  applyIntervention(flipped, {
    id: 'flip',
    kind: 'set-opacity',
    entity: 'GlassPane',
    opaque: true,
  });
  const flippedIr = lowerCompositionToHSIIR(flipped, {});
  cases.push({
    id: 'mm:opacity-flip',
    kind: 'opacity-flip-sensitive',
    expectation: 'sensitive',
    baseIr: singleIr,
    transformedIr: flippedIr,
    baseOracle: oracleLabel(singleIr),
    transformedOracle: oracleLabel(flippedIr),
  });

  return cases;
}

// ---------------------------------------------------------------------------
// Reference arms (prove the battery discriminates; real 20-50M arms plug in later).
// ---------------------------------------------------------------------------

/** Perfect structural model: reads the oracle. Passes everything. */
export const exactOracleArm: TournamentArm = {
  id: 'ref:exact-oracle',
  predict: (ir) => oracleLabel(ir),
};

/** Structure-blind: ignores edges/opacity, predicts a fixed perception. Must be CAUGHT by sensitivity. */
export const edgeBlindArm: TournamentArm = {
  id: 'ref:edge-blind',
  predict: (ir) => ({
    access: 'visible',
    mediatorCount: 0,
    goalReached: oracleLabel(ir).goalReached,
  }),
};

/** Dynamics-only: predicts state dynamics correctly but treats perception as a constant. */
export const dynamicsOnlyArm: TournamentArm = {
  id: 'ref:dynamics-only',
  predict: (ir) => ({
    access: 'blocked',
    mediatorCount: ir.observationPolicy[0]?.mediators.length ?? 0,
    goalReached: oracleLabel(ir).goalReached,
  }),
};

// ---------------------------------------------------------------------------
// Scoring.
// ---------------------------------------------------------------------------

export interface HSINScorecard {
  readonly armId: string;
  readonly parseRate: number; // fraction of battery worlds that lowered (kept separate per acceptance)
  readonly accessAccuracy: number; // observation access predicted correctly
  readonly dynamicsAccuracy: number; // goalReached predicted correctly
  readonly oodGeneralization: Record<HSINOodAxis, number>;
  readonly structuralSensitivity: number; // fraction of sensitive cases where the arm's prediction changed with the oracle
  readonly invariance: number; // fraction of invariant cases where the arm's prediction stayed invariant with the oracle
  readonly structureBlind: boolean; // true if structuralSensitivity is below the falsification floor
}

const SENSITIVITY_FLOOR = 0.5;

function predictionsEqual(a: HSINPrediction, b: HSINPrediction): boolean {
  return (
    a.access === b.access && a.mediatorCount === b.mediatorCount && a.goalReached === b.goalReached
  );
}

function accessMatches(pred: HSINPrediction, oracle: HSINPrediction): boolean {
  return pred.access === oracle.access;
}

export function scoreArm(arm: TournamentArm, battery: HSINBattery): HSINScorecard {
  const axes: HSINOodAxis[] = [
    'train',
    'ood-object-count',
    'ood-opacity-composition',
    'ood-rename',
  ];
  const perAxisHits: Record<HSINOodAxis, { hit: number; total: number }> = {
    train: { hit: 0, total: 0 },
    'ood-object-count': { hit: 0, total: 0 },
    'ood-opacity-composition': { hit: 0, total: 0 },
    'ood-rename': { hit: 0, total: 0 },
  };

  let accessHits = 0;
  let dynamicsHits = 0;
  for (const v of battery.variants) {
    const pred = arm.predict(v.ir);
    if (accessMatches(pred, v.oracle)) accessHits += 1;
    if (pred.goalReached === v.oracle.goalReached) dynamicsHits += 1;
    perAxisHits[v.axis].total += 1;
    if (accessMatches(pred, v.oracle) && pred.goalReached === v.oracle.goalReached)
      perAxisHits[v.axis].hit += 1;
  }

  let sensitiveTotal = 0;
  let sensitiveCaught = 0;
  let invariantTotal = 0;
  let invariantHeld = 0;
  for (const mm of battery.metamorphic) {
    const basePred = arm.predict(mm.baseIr);
    const transformedPred = arm.predict(mm.transformedIr);
    const oracleChanged = !predictionsEqual(mm.baseOracle, mm.transformedOracle);
    const armChanged = !predictionsEqual(basePred, transformedPred);
    if (mm.expectation === 'sensitive') {
      sensitiveTotal += 1;
      // The oracle genuinely changes here; a structure-using arm must change too.
      if (oracleChanged && armChanged) sensitiveCaught += 1;
    } else {
      invariantTotal += 1;
      // The oracle is invariant; a correct arm must be invariant too.
      if (!armChanged) invariantHeld += 1;
    }
  }

  const oodGeneralization = Object.fromEntries(
    axes.map((axis) => [
      axis,
      perAxisHits[axis].total === 0 ? 1 : perAxisHits[axis].hit / perAxisHits[axis].total,
    ])
  ) as Record<HSINOodAxis, number>;

  const structuralSensitivity = sensitiveTotal === 0 ? 1 : sensitiveCaught / sensitiveTotal;
  const invariance = invariantTotal === 0 ? 1 : invariantHeld / invariantTotal;

  return {
    armId: arm.id,
    parseRate: 1, // every battery world lowered by construction; real arms record their own parse rate
    accessAccuracy: battery.variants.length === 0 ? 1 : accessHits / battery.variants.length,
    dynamicsAccuracy: battery.variants.length === 0 ? 1 : dynamicsHits / battery.variants.length,
    oodGeneralization,
    structuralSensitivity,
    invariance,
    structureBlind: structuralSensitivity < SENSITIVITY_FLOOR,
  };
}

export interface HSINTournamentReceipt {
  readonly schemaVersion: HSIN3TournamentSchemaVersion;
  readonly kind: 'HSINTournamentReceipt';
  readonly dataDigest: string;
  readonly device: 'cpu-reference';
  readonly verifiers: readonly string[];
  readonly scorecards: readonly HSINScorecard[];
  readonly ranking: readonly string[]; // arm ids, best-first, structure-blind arms last
  readonly deterministicDigest: string;
}

/** Run the tournament: score every arm, rank them, and emit a deterministic receipt. */
export function runTournament(
  arms: readonly TournamentArm[],
  battery: HSINBattery
): HSINTournamentReceipt {
  const scorecards = arms.map((arm) => scoreArm(arm, battery));
  const rankOf = (s: HSINScorecard): number =>
    (s.structureBlind ? 0 : 1) * 1000 +
    s.structuralSensitivity * 100 +
    s.invariance * 10 +
    s.accessAccuracy +
    s.dynamicsAccuracy;
  const ranking = [...scorecards].sort((a, b) => rankOf(b) - rankOf(a)).map((s) => s.armId);

  const withoutDigest = {
    schemaVersion: HSI_N3_TOURNAMENT_SCHEMA_VERSION,
    kind: 'HSINTournamentReceipt' as const,
    dataDigest: battery.dataDigest,
    device: 'cpu-reference' as const,
    verifiers: [
      'access-accuracy',
      'dynamics-accuracy',
      'ood-generalization',
      'structural-sensitivity',
      'metamorphic-invariance',
      'structure-blind-floor',
    ],
    scorecards,
    ranking,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}
