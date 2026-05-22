/**
 * @holoscript/core/traits/engines — motion-matching engine surface type declarations
 * Auto-generated stub — sources in packages/core/src/traits/engines/
 */

// motion-matching
export interface Vec3 { x: number; y: number; z: number; }

export interface SkeletonPose {
  joints: Record<string, { position: [number, number, number]; rotation: [number, number, number, number]; }>;
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
export declare const TRAJECTORY_HORIZON_FRAMES: number;
export declare const TRAJECTORY_FRAME_DT: number;
export declare function magnitude(v: Vec3): number;
export declare function classifyGait(speed: number, energyEfficiency: number): Gait;
export declare function projectLinearTrajectory(velocity: Vec3): Array<[number, number, number]>;
export declare class NullMotionMatchingEngine implements MotionMatchingEngine {
  readonly modelId: string;
  readonly loaded: boolean;
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}
export declare function createNullMotionMatchingEngine(modelId: string): MotionMatchingEngine;

// onnx-adapter
export type ExecutionProvider = 'webgpu' | 'wasm' | 'cpu' | 'cuda';
export type TensorShape = readonly number[];
export interface Float32Tensor { data: Float32Array; shape: TensorShape; }
export interface InferenceRequest { inputs: Record<string, Float32Tensor>; [key: string]: any; }
export interface InferenceResponse { outputs: Record<string, Float32Tensor>; [key: string]: any; }
export interface InferenceAdapter {
  run(req: InferenceRequest): Promise<InferenceResponse>;
  dispose?(): void;
  [key: string]: any;
}
export declare class NoOpInferenceAdapter implements InferenceAdapter {
  run(req: InferenceRequest): Promise<InferenceResponse>;
  [key: string]: any;
}
export declare function createNoOpInferenceAdapter(): InferenceAdapter;

// synthetic-walk-cycle
export declare const SYNTHETIC_WALK_JOINTS: string[];
export declare function buildSyntheticBipedPose(phase: number, speed: number): Record<string, { position: [number, number, number]; rotation: [number, number, number, number]; }>;
export declare class SyntheticWalkCycleEngine implements MotionMatchingEngine {
  readonly modelId: string;
  readonly loaded: boolean;
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}
export declare function createSyntheticWalkCycleEngine(modelId?: string): MotionMatchingEngine;

// motion-data-schema
export declare const MOTION_DATA_SCHEMA_VERSION: 1;
export interface TrainingFrame { joints: SkeletonPose['joints']; contacts?: ContactFeatures; timestamp?: number; [key: string]: any; }
export interface InferenceFrame { targetVelocity: Vec3; currentPhase: number; delta: number; timestamp?: number; [key: string]: any; }
export interface MotionCapture { frames: TrainingFrame[]; fps: number; [key: string]: any; }
export interface TrainingCorpus { captures: MotionCapture[]; [key: string]: any; }
export declare function validateTrainingFrame(frame: TrainingFrame): void;
export declare function validateMotionCapture(capture: MotionCapture): void;
export declare function validateTrainingCorpus(corpus: TrainingCorpus): void;
export declare function inferenceFrameToTensor(frame: InferenceFrame, ...args: any[]): Float32Array;

// cloth-verlet
export interface ClothVerletState { positions: Float32Array; prevPositions: Float32Array; velocities?: Float32Array; [key: string]: any; }
export interface ClothVerletConfig { gravity?: Vec3; damping?: number; iterations?: number; stiffness?: number; [key: string]: any; }
export declare function buildClothConstraints(...args: any[]): any;
export declare function stepClothVerlet(state: ClothVerletState, config?: ClothVerletConfig, ...args: any[]): ClothVerletState;

// noise
export declare function noise(t: number, seed: number): number;
export declare function smoothNoise(t: number, seed: number): number;
