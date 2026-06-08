/**
 * @holoscript/core/traits/engines — motion-matching engine surface
 *
 * Hand-crafted declarations mirroring packages/core/src/traits/engines/index.ts
 * (a barrel of: motion-matching, onnx-motion-matching, synthetic-walk-cycle,
 * onnx-adapter, pfnn-network, motion-data-schema, cloth-verlet, noise, tensor-ops).
 */

// ── motion-matching ───────────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SkeletonPose {
  joints: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>;
  timestamp: number;
}

export interface ContactFeatures {
  leftFoot: boolean;
  rightFoot: boolean;
  [extra: string]: boolean;
}

export type Gait = 'idle' | 'walk' | 'trot' | 'run' | 'crouch';

export interface MotionInferenceInput {
  targetVelocity: Vec3;
  currentPhase: number;
  delta: number;
  terrainNormal?: Vec3;
  energyEfficiency?: number;
}

export interface MotionInferenceResult {
  pose: SkeletonPose;
  phase: number;
  trajectory: Array<[number, number, number]>;
  stability: number;
  contactFeatures: ContactFeatures;
  gait: Gait;
  kineticEnergyProxy: number;
}

export interface MotionMatchingEngine {
  readonly modelId: string;
  readonly loaded: boolean;
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}

export type MotionMatchingEngineFactory = (modelId: string) => MotionMatchingEngine;

export declare const TRAJECTORY_HORIZON_FRAMES: 12;
export declare const TRAJECTORY_FRAME_DT: number;

export declare function magnitude(v: Vec3): number;
export declare function classifyGait(speed: number, energyEfficiency: number): Gait;
export declare function projectLinearTrajectory(velocity: Vec3): Array<[number, number, number]>;

export declare class NullMotionMatchingEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded: boolean;
  constructor(modelId: string);
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}
export declare function createNullMotionMatchingEngine(modelId: string): MotionMatchingEngine;

// ── onnx-motion-matching ─────────────────────────────────────────────────────

export declare const INPUT_DIM: number;
export declare const OUTPUT_DIM: number;

export interface ModelDescriptor {
  id: string;
  url: string;
  inputDim: number;
  outputDim: number;
  description?: string;
}

export declare const BUNDLED_MODELS: Record<string, ModelDescriptor>;

export declare function encodeInputTensor(input: MotionInferenceInput): Float32Tensor;

export declare class OnnxMotionMatchingEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded: boolean;
  constructor(modelId: string);
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}
export declare function createOnnxMotionMatchingEngine(modelId: string): MotionMatchingEngine;

// ── synthetic-walk-cycle ──────────────────────────────────────────────────────

export declare const SYNTHETIC_WALK_JOINTS: readonly string[];
export declare function buildSyntheticBipedPose(
  phase: number,
  speed: number
): Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>;

export declare class SyntheticWalkCycleEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded: boolean;
  constructor(modelId: string);
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}
export declare function createSyntheticWalkCycleEngine(modelId?: string): MotionMatchingEngine;

// ── onnx-adapter ─────────────────────────────────────────────────────────────

export type ExecutionProvider = 'webgpu' | 'wasm' | 'cpu' | 'cuda';
export type TensorShape = readonly number[];

export interface Float32Tensor {
  data: Float32Array;
  shape: TensorShape;
}

export interface InferenceRequest {
  inputs: Record<string, Float32Tensor>;
  outputs?: string[];
}

export interface InferenceResponse {
  outputs: Record<string, Float32Tensor>;
  durationMs: number;
  providerUsed: ExecutionProvider;
}

export interface InferenceAdapter {
  readonly name: string;
  readonly preferredProvider: ExecutionProvider;
  readonly loaded: boolean;
  load(modelUrl: string): Promise<void>;
  run(request: InferenceRequest): Promise<InferenceResponse>;
  runSync?(request: InferenceRequest): InferenceResponse;
  dispose(): void;
}

export declare class NoOpInferenceAdapter implements InferenceAdapter {
  readonly name: 'NoOpInferenceAdapter';
  readonly preferredProvider: ExecutionProvider;
  loaded: boolean;
  load(modelUrl: string): Promise<void>;
  runSync(request: InferenceRequest): InferenceResponse;
  run(request: InferenceRequest): Promise<InferenceResponse>;
  dispose(): void;
}
export declare function createNoOpInferenceAdapter(): InferenceAdapter;

export declare class PureJsInferenceAdapter implements InferenceAdapter {
  readonly name: 'PureJsInferenceAdapter';
  readonly preferredProvider: ExecutionProvider;
  loaded: boolean;
  constructor(inputDim?: number, outputDim?: number);
  load(modelUrl: string): Promise<void>;
  runSync(request: InferenceRequest): InferenceResponse;
  run(request: InferenceRequest): Promise<InferenceResponse>;
  dispose(): void;
}
export declare function createPureJsInferenceAdapter(inputDim?: number, outputDim?: number): InferenceAdapter;

export declare class OnnxNodeInferenceAdapter implements InferenceAdapter {
  readonly name: 'OnnxNodeInferenceAdapter';
  readonly preferredProvider: ExecutionProvider;
  loaded: boolean;
  constructor(preferredProvider?: ExecutionProvider);
  load(modelUrl: string): Promise<void>;
  run(request: InferenceRequest): Promise<InferenceResponse>;
  dispose(): void;
}
export declare function createOnnxNodeInferenceAdapter(preferredProvider?: ExecutionProvider): InferenceAdapter;
export declare function resolveOnnxModelPath(modelUrl: string): Promise<string | null>;

// ── pfnn-network ──────────────────────────────────────────────────────────────

export declare const PHASE_CONTROL_POINTS: 4;
export declare const HIDDEN_DIM: 64;

export declare function eluInPlace(data: Float32Array): void;

export declare class PfnnNetwork {
  readonly inputDim: number;
  readonly outputDim: number;
  constructor(inputDim: number, outputDim: number, seed?: number);
  forward(input: Float32Array, phase: number): Float32Array;
}

export declare const BUNDLED_MODEL_SEED: number;
export declare function createBundledPfnn(inputDim: number, outputDim: number): PfnnNetwork;

// ── motion-data-schema ────────────────────────────────────────────────────────

export declare const MOTION_DATA_SCHEMA_VERSION: 1;

export interface TrainingFrame {
  timestampMs: number;
  velocity: Vec3;
  pose: SkeletonPose;
  contact: ContactFeatures;
  phase: number;
  gait: Gait;
}

export interface InferenceFrame {
  timestampMs: number;
  input: MotionInferenceInput;
  output: MotionInferenceResult;
}

export interface MotionCapture {
  captureId: string;
  createdAtMs: number;
  frameRateHz: number;
  jointNames: string[];
  frames: TrainingFrame[];
}

export interface TrainingCorpus {
  schemaVersion: typeof MOTION_DATA_SCHEMA_VERSION;
  corpusId: string;
  createdAtMs: number;
  motionCaptures: MotionCapture[];
}

// ── cloth-verlet ──────────────────────────────────────────────────────────────

export interface ClothVerletState {
  positions: Float32Array;
  prevPositions: Float32Array;
  pinned: Set<number>;
  constraints: Array<[number, number, number]>;
  time: number;
}

export interface ClothVerletConfig {
  stiffness: number;
  damping: number;
  gravityScale: number;
  windResponse: number;
}

export declare function buildClothConstraints(
  resolution: number,
  positions: Float32Array
): Array<[number, number, number]>;

export declare function stepClothVerlet(
  state: ClothVerletState,
  config: ClothVerletConfig,
  delta: number
): void;

// ── noise ─────────────────────────────────────────────────────────────────────

export declare function noise(t: number, seed: number): number;
export declare function smoothNoise(t: number, seed: number): number;

// ── tensor-ops ────────────────────────────────────────────────────────────────

export interface DenseTensor {
  shape: number[];
  data: Float32Array;
}

export declare function createTensor(shape: number[], data?: ArrayLike<number>): DenseTensor;
export declare function add(a: DenseTensor, b: DenseTensor): DenseTensor;
export declare function matmul(a: DenseTensor, b: DenseTensor): DenseTensor;
