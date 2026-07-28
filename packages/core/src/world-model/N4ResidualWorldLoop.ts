/**
 * N4 exact-plus-learned residual world loop.
 *
 * The exact plane owns authored kinematics. Learned processors may predict
 * only the closed residual vocabulary declared below. One .hsplus source is
 * lowered to HSI-IR/LearningGraph and binds every generated dataset/model
 * artifact. There is no provider call and no host-language escape in the
 * learned action vocabulary.
 */

import { projectLearningGraph } from '../compiler/HSILearningGraph';
import { hsiSha256, type HSIIRDocument, type HSILearningGraph } from '../compiler/HSIIRTypes';
import { lowerHSPlusProgramToHSIIR } from '../compiler/HSPlusHSIIRCompiler';

export const N4_RESIDUAL_WORLD_SCHEMA_VERSION = 'holoscript.n4-residual-world-loop.v0.1.0' as const;
export const N4_METRIC_CONTRACT_SHA256 =
  'a4451c1378e705b354261e0f12172288fabdb1f4d26a7f946e096a0bbb516663' as const;
export const N4_DT = 0.1;
export const N4_LONG_HORIZON = 24;
export const N4_TRAIN_SEEDS = Object.freeze(Array.from({ length: 64 }, (_, index) => 4100 + index));
export const N4_OOD_SEEDS = Object.freeze(Array.from({ length: 64 }, (_, index) => 9100 + index));
export const N4_PLANNING_SEEDS = Object.freeze(
  Array.from({ length: 32 }, (_, index) => 15000 + index)
);
export const N4_BOOTSTRAP_SEEDS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 12001 + index)
);
export const N4_SAMPLE_BUDGETS = Object.freeze([8, 16, 32, 64] as const);

export const N4_RESIDUAL_TARGETS = Object.freeze([
  'object.drag',
  'event.gust',
  'event.contact',
] as const);
export type N4ResidualTarget = (typeof N4_RESIDUAL_TARGETS)[number];
export type N4Arm =
  | 'exact-only'
  | 'learned-only-object'
  | 'exact-plus-untyped-residual'
  | 'exact-plus-typed-residual'
  | 'exact-plus-typed-residual-uncertainty';

export const N4_ARMS: readonly N4Arm[] = Object.freeze([
  'exact-only',
  'learned-only-object',
  'exact-plus-untyped-residual',
  'exact-plus-typed-residual',
  'exact-plus-typed-residual-uncertainty',
]);

export interface N4Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface N4Object2D {
  readonly id: string;
  readonly kind: 'orb' | 'crate';
  readonly position: N4Vec2;
  readonly velocity: N4Vec2;
  readonly massKg: number;
  readonly dragPerSecond: number;
  /** Verifier-only deterministic environmental variation; never a model feature. */
  readonly latentContactScale: number;
}

export type N4WorldEvent =
  | { readonly type: 'gust'; readonly impulse: N4Vec2 }
  | { readonly type: 'contact'; readonly objectIds: readonly string[] };

export interface N4WorldScene {
  readonly seed: number;
  readonly split: 'train' | 'ood' | 'planning';
  readonly step: number;
  readonly objects: readonly N4Object2D[];
  readonly events: readonly N4WorldEvent[];
}

export interface N4SourceContract {
  readonly schemaVersion: typeof N4_RESIDUAL_WORLD_SCHEMA_VERSION;
  readonly metricContractSha256: typeof N4_METRIC_CONTRACT_SHA256;
  readonly sourceDigest: string;
  readonly ir: HSIIRDocument;
  readonly learningGraph: HSILearningGraph;
  readonly residualTargets: typeof N4_RESIDUAL_TARGETS;
  readonly actionVocabulary: readonly ['move'];
  readonly deterministicDigest: string;
}

export interface N4LinearModel {
  readonly kind: 'ridge-linear';
  readonly featureNames: readonly string[];
  readonly outputNames: readonly string[];
  /** Row-major output x feature tensor, rounded to Float32 at custody boundary. */
  readonly weights: readonly number[];
  readonly shape: readonly [number, number];
  readonly deterministicDigest: string;
}

export interface N4ModelSet {
  readonly learnedOnly: N4LinearModel;
  readonly untypedResidual: N4LinearModel;
  readonly typedResidual: N4LinearModel;
  readonly typedEnsemble: readonly N4LinearModel[];
  readonly uncertaintyScale: number;
  readonly deterministicDigest: string;
}

export interface N4ObjectPrediction {
  readonly id: string;
  readonly next: N4Object2D;
  readonly residualVelocity: N4Vec2;
  readonly standardDeviation: N4Vec2;
}

export interface N4ScenePrediction {
  readonly arm: N4Arm;
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string | null;
  readonly residualTargets: readonly N4ResidualTarget[];
  readonly objects: readonly N4ObjectPrediction[];
  readonly deterministicDigest: string;
}

export interface N4ArmMetrics {
  readonly arm: N4Arm;
  readonly oodOneStepRmse: number;
  readonly oodLongHorizonRmse: number;
  readonly planningSuccess: number;
  readonly calibrationError: number;
  readonly sampleEfficiency: number | null;
  readonly verifierDisagreementRate: number;
}

export interface N4TypedMoveAction {
  readonly type: 'move';
  readonly entityId: string;
  readonly position: N4Vec2;
  readonly confidence: number;
  readonly residualScope: readonly N4ResidualTarget[];
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly deterministicDigest: string;
}

export interface N4WeightsManifest {
  readonly sourceDigest: string;
  readonly irDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly featureSchemaDigest: string;
  readonly featureNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly weightTensor: readonly number[];
  readonly weightShape: readonly [number, number];
  readonly typeTensor: readonly number[];
  readonly typeShape: readonly [number, number];
  /** Browser/WASM-verifiable checksum over the exact tensor custody payload. */
  readonly tensorChecksum: string;
  readonly deterministicDigest: string;
}

export interface N4GeneratedArtifacts {
  readonly contract: N4SourceContract;
  readonly dataManifest: {
    readonly trainSeeds: readonly number[];
    readonly oodSeeds: readonly number[];
    readonly planningSeeds: readonly number[];
    readonly trainSceneDigests: readonly string[];
    readonly oodSceneDigests: readonly string[];
    readonly deterministicDigest: string;
  };
  readonly models: N4ModelSet;
  readonly weightsManifest: N4WeightsManifest;
  readonly verifierCases: readonly {
    readonly id: string;
    readonly expected: 'accept' | 'reject';
  }[];
  readonly deterministicDigest: string;
}

export interface N4ExperimentReceipt {
  readonly schemaVersion: typeof N4_RESIDUAL_WORLD_SCHEMA_VERSION;
  readonly metricContractSha256: typeof N4_METRIC_CONTRACT_SHA256;
  readonly sourceDigest: string;
  readonly irDigest: string;
  readonly graphDigest: string;
  readonly weightsManifestDigest: string;
  readonly metrics: readonly N4ArmMetrics[];
  readonly admitted: boolean;
  readonly failedGates: readonly string[];
  readonly claim: 'n4-candidate' | 'narrowed';
  readonly deterministicDigest: string;
}

const REQUIRED_INPUTS = Object.freeze([
  'object_x',
  'object_y',
  'velocity_x',
  'velocity_y',
  'mass_kg',
  'drag_per_second',
  'action_x',
  'action_y',
  'object_kind',
  'residual_uncertainty',
  'act',
  'gust',
  'contact',
  'verify',
]);

const TYPED_FEATURE_NAMES = Object.freeze([
  'bias',
  'drag-vx-orb',
  'drag-vy-orb',
  'drag-vx-crate',
  'drag-vy-crate',
  'gust-x-per-mass',
  'gust-y-per-mass',
  'contact-vx-orb',
  'contact-vy-orb',
  'contact-vx-crate',
  'contact-vy-crate',
]);

const UNTYPED_FEATURE_NAMES = Object.freeze([
  'bias',
  'object-vx',
  'object-vy',
  'scene-mean-drag',
  'scene-mean-mass',
  'gust-x',
  'gust-y',
  'contact',
]);

const LEARNED_FEATURE_NAMES = Object.freeze([
  'bias',
  'x',
  'y',
  'vx',
  'vy',
  'mass',
  'drag',
  'action-x',
  'action-y',
  'gust-x',
  'gust-y',
  'contact',
  'kind-orb',
  'kind-crate',
]);

interface TrainingRow {
  readonly scene: N4WorldScene;
  readonly object: N4Object2D;
  readonly action: N4Vec2;
  readonly exact: N4Object2D;
  readonly truth: N4Object2D;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`non-finite ${label}`);
  return value;
}

function f32(value: number): number {
  return Math.fround(finite(value, 'tensor value'));
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function range(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}

function eventSummary(
  scene: N4WorldScene,
  objectId: string
): {
  gust: N4Vec2;
  contact: boolean;
} {
  let gustX = 0;
  let gustY = 0;
  let contact = false;
  for (const event of scene.events) {
    if (event.type === 'gust') {
      gustX += event.impulse.x;
      gustY += event.impulse.y;
    } else if (event.objectIds.includes(objectId)) {
      contact = true;
    }
  }
  return { gust: { x: gustX, y: gustY }, contact };
}

function sceneMeans(scene: N4WorldScene): { mass: number; drag: number } {
  const divisor = Math.max(1, scene.objects.length);
  return {
    mass: scene.objects.reduce((sum, object) => sum + object.massKg, 0) / divisor,
    drag: scene.objects.reduce((sum, object) => sum + object.dragPerSecond, 0) / divisor,
  };
}

function replaceDynamics(object: N4Object2D, position: N4Vec2, velocity: N4Vec2): N4Object2D {
  return { ...object, position, velocity };
}

/** Exact authored kinematics. Learned code cannot replace this function. */
export function stepN4Exact(scene: N4WorldScene, action: N4Vec2): N4WorldScene {
  const objects = scene.objects.map((object) => {
    const velocity = {
      x: object.velocity.x + action.x * N4_DT,
      y: object.velocity.y + action.y * N4_DT,
    };
    const position = {
      x: object.position.x + velocity.x * N4_DT,
      y: object.position.y + velocity.y * N4_DT,
    };
    return replaceDynamics(object, position, velocity);
  });
  return { ...scene, step: scene.step + 1, objects };
}

function directResidualVelocity(scene: N4WorldScene, object: N4Object2D): N4Vec2 {
  const events = eventSummary(scene, object.id);
  const dragCoefficient = object.kind === 'orb' ? 0.9 : 1.3;
  const contactCoefficient = object.kind === 'orb' ? 0.32 : 0.48;
  const contactScale = events.contact ? object.latentContactScale : 0;
  return {
    x:
      (-dragCoefficient * object.dragPerSecond * object.velocity.x * N4_DT) / object.massKg +
      (0.34 * events.gust.x) / object.massKg -
      contactCoefficient * contactScale * object.velocity.x,
    y:
      (-dragCoefficient * object.dragPerSecond * object.velocity.y * N4_DT) / object.massKg +
      (0.34 * events.gust.y) / object.massKg -
      contactCoefficient * contactScale * object.velocity.y,
  };
}

/** Independent environment truth: exact plane plus only declared residual families. */
export function stepN4Truth(scene: N4WorldScene, action: N4Vec2): N4WorldScene {
  const exact = stepN4Exact(scene, action);
  const objects = scene.objects.map((object, index) => {
    const residual = directResidualVelocity(scene, object);
    const exactObject = exact.objects[index]!;
    return replaceDynamics(
      exactObject,
      {
        x: exactObject.position.x + residual.x * N4_DT,
        y: exactObject.position.y + residual.y * N4_DT,
      },
      {
        x: exactObject.velocity.x + residual.x,
        y: exactObject.velocity.y + residual.y,
      }
    );
  });
  return { ...exact, objects };
}

export function generateN4Scene(seed: number, split: N4WorldScene['split']): N4WorldScene {
  const random = mulberry32(seed);
  const isTrain = split === 'train';
  const objectCount = isTrain ? 2 + (seed % 2) : 4 + (seed % 3);
  const objects: N4Object2D[] = [];
  for (let index = 0; index < objectCount; index += 1) {
    const massKg = isTrain ? range(random, 0.8, 2) : range(random, 2.4, 4);
    const dragPerSecond = isTrain ? range(random, 0.04, 0.14) : range(random, 0.18, 0.32);
    objects.push({
      id: `object-${index}`,
      kind: (seed + index) % 2 === 0 ? 'orb' : 'crate',
      position: { x: range(random, -0.6, 0.6), y: range(random, -0.4, 0.4) },
      velocity: { x: range(random, -0.7, 0.7), y: range(random, -0.45, 0.45) },
      massKg,
      dragPerSecond,
      latentContactScale: range(random, 0.88, 1.12),
    });
  }

  const gust: N4WorldEvent = {
    type: 'gust',
    impulse: { x: range(random, 0.18, 0.62), y: range(random, -0.24, 0.24) },
  };
  const contact: N4WorldEvent = {
    type: 'contact',
    objectIds: objects.filter((_, index) => (index + seed) % 2 === 0).map((object) => object.id),
  };
  let events: readonly N4WorldEvent[];
  if (!isTrain) events = [gust, contact];
  else if (seed % 3 === 0) events = [];
  else if (seed % 3 === 1) events = [gust];
  else events = [contact];

  return { seed, split, step: 0, objects, events };
}

function actionForTraining(seed: number): N4Vec2 {
  const random = mulberry32(seed ^ 0xa5a5a5a5);
  return { x: range(random, -2, 2), y: range(random, -1, 1) };
}

function typedFeatures(scene: N4WorldScene, object: N4Object2D): number[] {
  const { gust, contact } = eventSummary(scene, object.id);
  const orb = object.kind === 'orb' ? 1 : 0;
  const crate = 1 - orb;
  return [
    1,
    (orb * object.dragPerSecond * object.velocity.x * N4_DT) / object.massKg,
    (orb * object.dragPerSecond * object.velocity.y * N4_DT) / object.massKg,
    (crate * object.dragPerSecond * object.velocity.x * N4_DT) / object.massKg,
    (crate * object.dragPerSecond * object.velocity.y * N4_DT) / object.massKg,
    gust.x / object.massKg,
    gust.y / object.massKg,
    contact ? orb * object.velocity.x : 0,
    contact ? orb * object.velocity.y : 0,
    contact ? crate * object.velocity.x : 0,
    contact ? crate * object.velocity.y : 0,
  ];
}

/** Compiler-typed feature projection carried unchanged into CPU/WASM/WebGPU. */
export function projectN4TypedFeatures(scene: N4WorldScene, object: N4Object2D): readonly number[] {
  return typedFeatures(scene, object).map(f32);
}

function untypedFeatures(scene: N4WorldScene, object: N4Object2D): number[] {
  const { gust, contact } = eventSummary(scene, object.id);
  const means = sceneMeans(scene);
  return [
    1,
    object.velocity.x,
    object.velocity.y,
    means.drag,
    means.mass,
    gust.x,
    gust.y,
    contact ? 1 : 0,
  ];
}

function learnedFeatures(scene: N4WorldScene, object: N4Object2D, action: N4Vec2): number[] {
  const { gust, contact } = eventSummary(scene, object.id);
  return [
    1,
    object.position.x,
    object.position.y,
    object.velocity.x,
    object.velocity.y,
    object.massKg,
    object.dragPerSecond,
    action.x,
    action.y,
    gust.x,
    gust.y,
    contact ? 1 : 0,
    object.kind === 'orb' ? 1 : 0,
    object.kind === 'crate' ? 1 : 0,
  ];
}

function trainingRows(scenes: readonly N4WorldScene[]): TrainingRow[] {
  const rows: TrainingRow[] = [];
  for (const scene of scenes) {
    const action = actionForTraining(scene.seed);
    const exact = stepN4Exact(scene, action);
    const truth = stepN4Truth(scene, action);
    for (let index = 0; index < scene.objects.length; index += 1) {
      rows.push({
        scene,
        object: scene.objects[index]!,
        action,
        exact: exact.objects[index]!,
        truth: truth.objects[index]!,
      });
    }
  }
  return rows;
}

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    if (Math.abs(divisor) < 1e-12) throw new Error('ridge solve is singular');
    for (let entry = column; entry <= size; entry += 1) augmented[column]![entry]! /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row]![entry]! -= factor * augmented[column]![entry]!;
      }
    }
  }
  return augmented.map((row) => f32(row[size]!));
}

function fitRidge(
  rows: readonly TrainingRow[],
  featureNames: readonly string[],
  outputNames: readonly string[],
  feature: (row: TrainingRow) => number[],
  target: (row: TrainingRow) => number[]
): N4LinearModel {
  const featureCount = featureNames.length;
  const outputCount = outputNames.length;
  const xtx = Array.from({ length: featureCount }, () => Array(featureCount).fill(0) as number[]);
  const xty = Array.from({ length: outputCount }, () => Array(featureCount).fill(0) as number[]);
  for (const row of rows) {
    const x = feature(row);
    const y = target(row);
    if (x.length !== featureCount || y.length !== outputCount)
      throw new Error('model shape mismatch');
    for (let left = 0; left < featureCount; left += 1) {
      for (let right = 0; right < featureCount; right += 1)
        xtx[left]![right]! += x[left]! * x[right]!;
      for (let output = 0; output < outputCount; output += 1) {
        xty[output]![left]! += x[left]! * y[output]!;
      }
    }
  }
  for (let index = 1; index < featureCount; index += 1) xtx[index]![index]! += 1e-5;
  const weights = xty.flatMap((rhs) =>
    solveLinear(
      xtx.map((row) => [...row]),
      rhs
    )
  );
  const withoutDigest = {
    kind: 'ridge-linear' as const,
    featureNames: [...featureNames],
    outputNames: [...outputNames],
    weights,
    shape: [outputCount, featureCount] as const,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

function infer(model: N4LinearModel, features: readonly number[]): number[] {
  if (features.length !== model.shape[1]) throw new Error('inference feature shape mismatch');
  const output: number[] = [];
  for (let row = 0; row < model.shape[0]; row += 1) {
    let sum = Math.fround(0);
    for (let column = 0; column < model.shape[1]; column += 1) {
      sum = Math.fround(
        sum + Math.fround(model.weights[row * model.shape[1] + column]! * features[column]!)
      );
    }
    output.push(sum);
  }
  return output;
}

function residualTarget(row: TrainingRow): number[] {
  return [row.truth.velocity.x - row.exact.velocity.x, row.truth.velocity.y - row.exact.velocity.y];
}

function fullTarget(row: TrainingRow): number[] {
  return [row.truth.position.x, row.truth.position.y, row.truth.velocity.x, row.truth.velocity.y];
}

function bootstrapRows(rows: readonly TrainingRow[], seed: number): TrainingRow[] {
  const random = mulberry32(seed);
  return Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]!);
}

function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(probability * sorted.length));
  return sorted[index]!;
}

function ensembleResidual(
  models: readonly N4LinearModel[],
  features: readonly number[],
  uncertaintyScale: number
): { mean: N4Vec2; std: N4Vec2 } {
  const samples = models.map((model) => infer(model, features));
  const mean = {
    x: samples.reduce((sum, sample) => sum + sample[0]!, 0) / samples.length,
    y: samples.reduce((sum, sample) => sum + sample[1]!, 0) / samples.length,
  };
  const variance = {
    x: samples.reduce((sum, sample) => sum + (sample[0]! - mean.x) ** 2, 0) / samples.length,
    y: samples.reduce((sum, sample) => sum + (sample[1]! - mean.y) ** 2, 0) / samples.length,
  };
  return {
    mean,
    std: {
      x: Math.max(1e-6, Math.sqrt(variance.x) * uncertaintyScale),
      y: Math.max(1e-6, Math.sqrt(variance.y) * uncertaintyScale),
    },
  };
}

function calibrateUncertainty(
  rows: readonly TrainingRow[],
  models: readonly N4LinearModel[]
): number {
  const ratios: number[] = [];
  for (const row of rows) {
    const features = typedFeatures(row.scene, row.object);
    const raw = ensembleResidual(models, features, 1);
    const target = residualTarget(row);
    ratios.push(Math.abs(target[0]! - raw.mean.x) / raw.std.x);
    ratios.push(Math.abs(target[1]! - raw.mean.y) / raw.std.y);
  }
  return Math.max(1, quantile(ratios, 0.6827));
}

export function compileN4ResidualWorldSource(source: string): N4SourceContract {
  const ir = lowerHSPlusProgramToHSIIR(source, { worldName: 'N4ResidualWorldLoop' });
  const machine = ir.machines.find((candidate) => candidate.name === 'ResidualWorldLoop');
  if (!machine) throw new Error('N4 source must declare state_machine ResidualWorldLoop');
  const inputNames = new Set(machine.inputs.map((input) => input.name));
  for (const required of REQUIRED_INPUTS) {
    if (!inputNames.has(required)) throw new Error(`N4 source missing typed input "${required}"`);
  }
  for (const state of ['ready', 'acting', 'verified']) {
    if (!machine.states.includes(state)) throw new Error(`N4 source missing state "${state}"`);
  }
  const learningGraph = projectLearningGraph(ir);
  const withoutDigest = {
    schemaVersion: N4_RESIDUAL_WORLD_SCHEMA_VERSION,
    metricContractSha256: N4_METRIC_CONTRACT_SHA256,
    sourceDigest: ir.world.sourceDigest,
    ir,
    learningGraph,
    residualTargets: N4_RESIDUAL_TARGETS,
    actionVocabulary: ['move'] as const,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

export function trainN4Models(trainScenes: readonly N4WorldScene[]): N4ModelSet {
  const rows = trainingRows(trainScenes);
  const learnedOnly = fitRidge(
    rows,
    LEARNED_FEATURE_NAMES,
    ['position-x', 'position-y', 'velocity-x', 'velocity-y'],
    (row) => learnedFeatures(row.scene, row.object, row.action),
    fullTarget
  );
  const untypedResidual = fitRidge(
    rows,
    UNTYPED_FEATURE_NAMES,
    ['residual-vx', 'residual-vy'],
    (row) => untypedFeatures(row.scene, row.object),
    residualTarget
  );
  const typedResidual = fitRidge(
    rows,
    TYPED_FEATURE_NAMES,
    ['residual-vx', 'residual-vy'],
    (row) => typedFeatures(row.scene, row.object),
    residualTarget
  );
  const typedEnsemble = N4_BOOTSTRAP_SEEDS.map((seed) =>
    fitRidge(
      bootstrapRows(rows, seed),
      TYPED_FEATURE_NAMES,
      ['residual-vx', 'residual-vy'],
      (row) => typedFeatures(row.scene, row.object),
      residualTarget
    )
  );
  const uncertaintyScale = calibrateUncertainty(rows, typedEnsemble);
  const withoutDigest = {
    learnedOnly,
    untypedResidual,
    typedResidual,
    typedEnsemble,
    uncertaintyScale,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

function modelForArm(models: N4ModelSet, arm: N4Arm): N4LinearModel | null {
  if (arm === 'learned-only-object') return models.learnedOnly;
  if (arm === 'exact-plus-untyped-residual') return models.untypedResidual;
  if (arm === 'exact-plus-typed-residual') return models.typedResidual;
  if (arm === 'exact-plus-typed-residual-uncertainty') return models.typedResidual;
  return null;
}

export function predictN4Scene(
  contract: N4SourceContract,
  models: N4ModelSet,
  arm: N4Arm,
  scene: N4WorldScene,
  action: N4Vec2
): N4ScenePrediction {
  const exact = stepN4Exact(scene, action);
  const model = modelForArm(models, arm);
  const predictions = scene.objects.map((object, index): N4ObjectPrediction => {
    const exactObject = exact.objects[index]!;
    let residual = { x: 0, y: 0 };
    let standardDeviation = { x: 0, y: 0 };
    let next = exactObject;

    if (arm === 'learned-only-object') {
      const output = infer(models.learnedOnly, learnedFeatures(scene, object, action));
      next = replaceDynamics(
        object,
        { x: output[0]!, y: output[1]! },
        { x: output[2]!, y: output[3]! }
      );
      residual = {
        x: output[2]! - exactObject.velocity.x,
        y: output[3]! - exactObject.velocity.y,
      };
    } else if (arm === 'exact-plus-untyped-residual') {
      const output = infer(models.untypedResidual, untypedFeatures(scene, object));
      residual = { x: output[0]!, y: output[1]! };
    } else if (arm === 'exact-plus-typed-residual') {
      const output = infer(models.typedResidual, typedFeatures(scene, object));
      residual = { x: output[0]!, y: output[1]! };
    } else if (arm === 'exact-plus-typed-residual-uncertainty') {
      const ensemble = ensembleResidual(
        models.typedEnsemble,
        typedFeatures(scene, object),
        models.uncertaintyScale
      );
      residual = ensemble.mean;
      standardDeviation = ensemble.std;
    }

    if (arm !== 'learned-only-object' && arm !== 'exact-only') {
      next = replaceDynamics(
        exactObject,
        {
          x: exactObject.position.x + residual.x * N4_DT,
          y: exactObject.position.y + residual.y * N4_DT,
        },
        {
          x: exactObject.velocity.x + residual.x,
          y: exactObject.velocity.y + residual.y,
        }
      );
    }
    return { id: object.id, next, residualVelocity: residual, standardDeviation };
  });
  const residualTargets = arm.startsWith('exact-plus-') ? [...N4_RESIDUAL_TARGETS] : [];
  const withoutDigest = {
    arm,
    sourceDigest: contract.sourceDigest,
    graphDigest: contract.learningGraph.deterministicDigest,
    modelDigest: model?.deterministicDigest ?? null,
    residualTargets,
    objects: predictions,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

function predictionScene(scene: N4WorldScene, prediction: N4ScenePrediction): N4WorldScene {
  return {
    ...scene,
    step: scene.step + 1,
    objects: prediction.objects.map((object) => object.next),
  };
}

function sceneRmse(predicted: N4WorldScene, truth: N4WorldScene): number {
  let squared = 0;
  let count = 0;
  for (let index = 0; index < truth.objects.length; index += 1) {
    const actual = truth.objects[index]!;
    const estimate = predicted.objects[index]!;
    for (const [left, right] of [
      [estimate.position.x, actual.position.x],
      [estimate.position.y, actual.position.y],
      [estimate.velocity.x, actual.velocity.x],
      [estimate.velocity.y, actual.velocity.y],
    ] as const) {
      squared += (left - right) ** 2;
      count += 1;
    }
  }
  return Math.sqrt(squared / Math.max(1, count));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function evaluateErrors(
  contract: N4SourceContract,
  models: N4ModelSet,
  arm: N4Arm
): { oneStep: number; longHorizon: number } {
  const oneStep: number[] = [];
  const longHorizon: number[] = [];
  for (const seed of N4_OOD_SEEDS) {
    const scene = generateN4Scene(seed, 'ood');
    const action = actionForTraining(seed);
    const truthOne = stepN4Truth(scene, action);
    const predictionOne = predictN4Scene(contract, models, arm, scene, action);
    oneStep.push(sceneRmse(predictionScene(scene, predictionOne), truthOne));

    let truth = scene;
    let predicted = scene;
    for (let step = 0; step < N4_LONG_HORIZON; step += 1) {
      truth = stepN4Truth(truth, action);
      predicted = predictionScene(
        predicted,
        predictN4Scene(contract, models, arm, predicted, action)
      );
    }
    longHorizon.push(sceneRmse(predicted, truth));
  }
  return { oneStep: mean(oneStep), longHorizon: mean(longHorizon) };
}

function terminalMeanX(scene: N4WorldScene): number {
  return mean(scene.objects.map((object) => object.position.x));
}

const PLANNING_ACTIONS: readonly N4Vec2[] = Object.freeze([
  { x: -2, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
]);

function rolloutTruth(scene: N4WorldScene, action: N4Vec2): N4WorldScene {
  let current = scene;
  for (let step = 0; step < N4_LONG_HORIZON; step += 1) current = stepN4Truth(current, action);
  return current;
}

function rolloutPrediction(
  contract: N4SourceContract,
  models: N4ModelSet,
  arm: N4Arm,
  scene: N4WorldScene,
  action: N4Vec2
): { scene: N4WorldScene; uncertainty: number } {
  let current = scene;
  let uncertainty = 0;
  for (let step = 0; step < N4_LONG_HORIZON; step += 1) {
    const prediction = predictN4Scene(contract, models, arm, current, action);
    uncertainty += mean(
      prediction.objects.map(
        (object) => (object.standardDeviation.x + object.standardDeviation.y) / 2
      )
    );
    current = predictionScene(current, prediction);
  }
  return { scene: current, uncertainty };
}

function evaluatePlanning(contract: N4SourceContract, models: N4ModelSet, arm: N4Arm): number {
  let successes = 0;
  for (const seed of N4_PLANNING_SEEDS) {
    const scene = generateN4Scene(seed, 'planning');
    const oracle = rolloutTruth(scene, PLANNING_ACTIONS[2]!);
    const target = terminalMeanX(oracle);
    const alternatives = PLANNING_ACTIONS.filter((_, index) => index !== 2).map((action) =>
      Math.abs(terminalMeanX(rolloutTruth(scene, action)) - target)
    );
    const tolerance = Math.max(1e-4, 0.45 * Math.min(...alternatives));

    let selected = PLANNING_ACTIONS[0]!;
    let selectedScore = Number.POSITIVE_INFINITY;
    for (const action of PLANNING_ACTIONS) {
      const result = rolloutPrediction(contract, models, arm, scene, action);
      const score =
        Math.abs(terminalMeanX(result.scene) - target) +
        (arm === 'exact-plus-typed-residual-uncertainty' ? 0.5 * result.uncertainty : 0);
      if (score < selectedScore) {
        selected = action;
        selectedScore = score;
      }
    }
    const actual = rolloutTruth(scene, selected);
    if (Math.abs(terminalMeanX(actual) - target) <= tolerance) successes += 1;
  }
  return successes / N4_PLANNING_SEEDS.length;
}

function evaluateCalibration(contract: N4SourceContract, models: N4ModelSet, arm: N4Arm): number {
  if (arm !== 'exact-plus-typed-residual-uncertainty') return 1;
  let within = 0;
  let total = 0;
  for (const seed of N4_OOD_SEEDS) {
    const scene = generateN4Scene(seed, 'ood');
    const action = actionForTraining(seed);
    const truth = stepN4Truth(scene, action);
    const prediction = predictN4Scene(contract, models, arm, scene, action);
    for (let index = 0; index < prediction.objects.length; index += 1) {
      const estimate = prediction.objects[index]!;
      const actual = truth.objects[index]!;
      if (Math.abs(estimate.next.velocity.x - actual.velocity.x) <= estimate.standardDeviation.x)
        within += 1;
      if (Math.abs(estimate.next.velocity.y - actual.velocity.y) <= estimate.standardDeviation.y)
        within += 1;
      total += 2;
    }
  }
  return Math.abs(within / Math.max(1, total) - 0.6827);
}

export function verifyN4Prediction(
  contract: N4SourceContract,
  prediction: N4ScenePrediction,
  before: N4WorldScene,
  action: N4Vec2
): boolean {
  if (
    prediction.sourceDigest !== contract.sourceDigest ||
    prediction.graphDigest !== contract.learningGraph.deterministicDigest
  )
    return false;
  if (
    prediction.residualTargets.some(
      (target) => !(N4_RESIDUAL_TARGETS as readonly string[]).includes(target)
    )
  )
    return false;
  if (prediction.objects.length !== before.objects.length) return false;
  const exact = stepN4Exact(before, action);
  for (let index = 0; index < prediction.objects.length; index += 1) {
    const object = prediction.objects[index]!;
    const exactObject = exact.objects[index]!;
    const values = [
      object.next.position.x,
      object.next.position.y,
      object.next.velocity.x,
      object.next.velocity.y,
      object.residualVelocity.x,
      object.residualVelocity.y,
    ];
    if (values.some((value) => !Number.isFinite(value))) return false;
    if (prediction.arm.startsWith('exact-plus-')) {
      if (
        Math.abs(
          object.next.position.x - (exactObject.position.x + object.residualVelocity.x * N4_DT)
        ) > 1e-5 ||
        Math.abs(
          object.next.position.y - (exactObject.position.y + object.residualVelocity.y * N4_DT)
        ) > 1e-5
      )
        return false;
    }
  }
  return true;
}

function evaluateVerifier(contract: N4SourceContract, models: N4ModelSet, arm: N4Arm): number {
  let disagreements = 0;
  for (const seed of N4_OOD_SEEDS) {
    const scene = generateN4Scene(seed, 'ood');
    const action = actionForTraining(seed);
    if (
      !verifyN4Prediction(
        contract,
        predictN4Scene(contract, models, arm, scene, action),
        scene,
        action
      )
    ) {
      disagreements += 1;
    }
  }
  return disagreements / N4_OOD_SEEDS.length;
}

function sampleEfficiency(contract: N4SourceContract, arm: N4Arm): number | null {
  for (const budget of N4_SAMPLE_BUDGETS) {
    const models = trainN4Models(
      N4_TRAIN_SEEDS.slice(0, budget).map((seed) => generateN4Scene(seed, 'train'))
    );
    if (evaluateErrors(contract, models, arm).oneStep <= 0.075) return budget;
  }
  return null;
}

export function evaluateN4Arm(
  contract: N4SourceContract,
  models: N4ModelSet,
  arm: N4Arm
): N4ArmMetrics {
  const errors = evaluateErrors(contract, models, arm);
  return {
    arm,
    oodOneStepRmse: errors.oneStep,
    oodLongHorizonRmse: errors.longHorizon,
    planningSuccess: evaluatePlanning(contract, models, arm),
    calibrationError: evaluateCalibration(contract, models, arm),
    sampleEfficiency: sampleEfficiency(contract, arm),
    verifierDisagreementRate: evaluateVerifier(contract, models, arm),
  };
}

function meanTypedModel(models: N4ModelSet): N4LinearModel {
  const exemplar = models.typedEnsemble[0]!;
  const weights = exemplar.weights.map((_, index) =>
    f32(mean(models.typedEnsemble.map((model) => model.weights[index]!)))
  );
  const withoutDigest = {
    kind: 'ridge-linear' as const,
    featureNames: [...exemplar.featureNames],
    outputNames: [...exemplar.outputNames],
    weights,
    shape: exemplar.shape,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

export function buildN4WeightsManifest(
  contract: N4SourceContract,
  models: N4ModelSet
): N4WeightsManifest {
  const model = meanTypedModel(models);
  const typeTensor = contract.learningGraph.nodes
    .flatMap((node) => [
      node.nodeType === 'state' ? 1 : 0,
      node.nodeType === 'action' ? 1 : 0,
      node.nodeType === 'event' ? 1 : 0,
    ])
    .map(f32);
  const featureSchemaDigest = hsiSha256({
    featureNames: model.featureNames,
    residualTargets: N4_RESIDUAL_TARGETS,
    actionVocabulary: contract.actionVocabulary,
  });
  const tensorChecksum = fnv1a64(
    JSON.stringify({
      sourceDigest: contract.sourceDigest,
      irDigest: contract.ir.provenance.deterministicDigest,
      graphDigest: contract.learningGraph.deterministicDigest,
      modelDigest: model.deterministicDigest,
      featureSchemaDigest,
      featureNames: model.featureNames,
      outputNames: model.outputNames,
      weightTensor: model.weights,
      weightShape: model.shape,
      typeTensor,
      typeShape: [contract.learningGraph.nodes.length, 3],
    })
  );
  const withoutDigest = {
    sourceDigest: contract.sourceDigest,
    irDigest: contract.ir.provenance.deterministicDigest,
    graphDigest: contract.learningGraph.deterministicDigest,
    modelDigest: model.deterministicDigest,
    featureSchemaDigest,
    featureNames: model.featureNames,
    outputNames: model.outputNames,
    weightTensor: model.weights,
    weightShape: model.shape,
    typeTensor,
    typeShape: [contract.learningGraph.nodes.length, 3] as const,
    tensorChecksum,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

export function generateN4Artifacts(source: string): N4GeneratedArtifacts {
  const contract = compileN4ResidualWorldSource(source);
  const trainScenes = N4_TRAIN_SEEDS.map((seed) => generateN4Scene(seed, 'train'));
  const oodScenes = N4_OOD_SEEDS.map((seed) => generateN4Scene(seed, 'ood'));
  const models = trainN4Models(trainScenes);
  const dataWithoutDigest = {
    trainSeeds: N4_TRAIN_SEEDS,
    oodSeeds: N4_OOD_SEEDS,
    planningSeeds: N4_PLANNING_SEEDS,
    trainSceneDigests: trainScenes.map((scene) => hsiSha256(scene)),
    oodSceneDigests: oodScenes.map((scene) => hsiSha256(scene)),
  };
  const dataManifest = {
    ...dataWithoutDigest,
    deterministicDigest: hsiSha256(dataWithoutDigest),
  };
  const weightsManifest = buildN4WeightsManifest(contract, models);
  const verifierCases = Object.freeze([
    { id: 'canonical', expected: 'accept' as const },
    { id: 'source-digest-tamper', expected: 'reject' as const },
    { id: 'learning-graph-digest-tamper', expected: 'reject' as const },
    { id: 'weight-tensor-tamper', expected: 'reject' as const },
    { id: 'type-tensor-reorder', expected: 'reject' as const },
    { id: 'undeclared-residual-target', expected: 'reject' as const },
    { id: 'stale-action-digest', expected: 'reject' as const },
    { id: 'uaal-log-tamper', expected: 'reject' as const },
    { id: 'wasm-output-drift', expected: 'reject' as const },
    { id: 'webgpu-output-drift', expected: 'reject' as const },
  ]);
  const withoutDigest = { contract, dataManifest, models, weightsManifest, verifierCases };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

export function proposeN4TypedMove(
  contract: N4SourceContract,
  models: N4ModelSet,
  scene: N4WorldScene,
  entityId: string,
  action: N4Vec2
): N4TypedMoveAction {
  const prediction = predictN4Scene(
    contract,
    models,
    'exact-plus-typed-residual-uncertainty',
    scene,
    action
  );
  if (!verifyN4Prediction(contract, prediction, scene, action)) {
    throw new Error('N4 prediction failed verifier');
  }
  const object = prediction.objects.find((candidate) => candidate.id === entityId);
  if (!object) throw new Error(`N4 action target "${entityId}" is not in the typed scene`);
  const uncertainty = (object.standardDeviation.x + object.standardDeviation.y) / 2;
  if (!Number.isFinite(uncertainty) || uncertainty > 0.5) {
    throw new Error('N4 action abstained: uncertainty exceeds 0.5');
  }
  const withoutDigest = {
    type: 'move' as const,
    entityId,
    position: object.next.position,
    confidence: Math.max(0, 1 - uncertainty),
    residualScope: [...N4_RESIDUAL_TARGETS],
    sourceDigest: contract.sourceDigest,
    graphDigest: contract.learningGraph.deterministicDigest,
    modelDigest: models.typedResidual.deterministicDigest,
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}

export function verifyN4TypedMove(action: N4TypedMoveAction): boolean {
  if (
    action.type !== 'move' ||
    action.entityId.length === 0 ||
    !Number.isFinite(action.position.x) ||
    !Number.isFinite(action.position.y) ||
    !Number.isFinite(action.confidence) ||
    action.confidence < 0 ||
    action.confidence > 1 ||
    action.residualScope.length !== N4_RESIDUAL_TARGETS.length ||
    !action.residualScope.every((target, index) => target === N4_RESIDUAL_TARGETS[index]) ||
    !action.sourceDigest.startsWith('sha256:') ||
    !action.graphDigest.startsWith('sha256:') ||
    !action.modelDigest.startsWith('sha256:')
  ) {
    return false;
  }
  const withoutDigest = {
    type: action.type,
    entityId: action.entityId,
    position: action.position,
    confidence: action.confidence,
    residualScope: [...action.residualScope],
    sourceDigest: action.sourceDigest,
    graphDigest: action.graphDigest,
    modelDigest: action.modelDigest,
  };
  return hsiSha256(withoutDigest) === action.deterministicDigest;
}

function admission(metrics: readonly N4ArmMetrics[]): {
  admitted: boolean;
  failedGates: string[];
} {
  const byArm = new Map(metrics.map((metric) => [metric.arm, metric]));
  const exact = byArm.get('exact-only')!;
  const learned = byArm.get('learned-only-object')!;
  const typed = byArm.get('exact-plus-typed-residual')!;
  const untyped = byArm.get('exact-plus-untyped-residual')!;
  const winner = byArm.get('exact-plus-typed-residual-uncertainty')!;
  const failed: string[] = [];
  if (winner.oodOneStepRmse > 0.8 * Math.min(exact.oodOneStepRmse, learned.oodOneStepRmse)) {
    failed.push('ood-one-step-ratio');
  }
  if (
    winner.oodLongHorizonRmse >
    0.85 * Math.min(exact.oodLongHorizonRmse, learned.oodLongHorizonRmse)
  ) {
    failed.push('ood-long-horizon-ratio');
  }
  if (winner.planningSuccess < Math.max(exact.planningSuccess, learned.planningSuccess) + 0.1) {
    failed.push('planning-margin');
  }
  if (winner.calibrationError > 0.15) failed.push('calibration');
  if (winner.sampleEfficiency === null) failed.push('sample-efficiency-null');
  else if (
    learned.sampleEfficiency === null
      ? winner.sampleEfficiency > 32
      : winner.sampleEfficiency > learned.sampleEfficiency / 2
  )
    failed.push('sample-efficiency');
  if (winner.verifierDisagreementRate !== 0) failed.push('verifier-disagreement');
  if (
    typed.oodOneStepRmse >= untyped.oodOneStepRmse ||
    typed.oodLongHorizonRmse >= untyped.oodLongHorizonRmse
  )
    failed.push('typed-factorization');
  return { admitted: failed.length === 0, failedGates: failed };
}

export function runN4Experiment(source: string): N4ExperimentReceipt {
  const artifacts = generateN4Artifacts(source);
  const metrics = N4_ARMS.map((arm) => evaluateN4Arm(artifacts.contract, artifacts.models, arm));
  const verdict = admission(metrics);
  const withoutDigest = {
    schemaVersion: N4_RESIDUAL_WORLD_SCHEMA_VERSION,
    metricContractSha256: N4_METRIC_CONTRACT_SHA256,
    sourceDigest: artifacts.contract.sourceDigest,
    irDigest: artifacts.contract.ir.provenance.deterministicDigest,
    graphDigest: artifacts.contract.learningGraph.deterministicDigest,
    weightsManifestDigest: artifacts.weightsManifest.deterministicDigest,
    metrics,
    admitted: verdict.admitted,
    failedGates: verdict.failedGates,
    claim: verdict.admitted ? ('n4-candidate' as const) : ('narrowed' as const),
  };
  return { ...withoutDigest, deterministicDigest: hsiSha256(withoutDigest) };
}
