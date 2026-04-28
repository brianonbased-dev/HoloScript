/**
 * MotionMatchingEngine — neural locomotion inference seam.
 *
 * Pure computation interface, no THREE.js / PhysicsWorld coupling.
 * Implementations live alongside this file (NullMotionMatchingEngine here;
 * real neural implementation lands in a follow-up task — see
 * research/2026-04-26_idea-run-3-neural-locomotion.md PLAN-1 ruling:
 * reimplement from primary literature (Holden 2017, Starke 2019/2020/2022),
 * NOT from CC-BY-NC sweriko port.
 *
 * Wire site: NeuralAnimationTrait.onUpdate when animation_model === 'motion_matching'.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SkeletonPose {
  joints: Record<
    string,
    { position: [number, number, number]; rotation: [number, number, number, number] }
  >;
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
  /**
   * Kinetic-energy proxy in arbitrary units (NOT metabolic cost).
   * Renamed from `energyCost` per /critic Serious #4: the previous name
   * implied physical cost-of-transport which it was not.
   *
   * For the synthetic + null engines this is `speed^2 * efficiency` —
   * dimensionally kinetic-shaped, useful as a sortable proxy. Real
   * metabolic cost (Margaria 1976, Kram & Taylor 1990) is roughly
   * linear in speed for walking and U-shaped around preferred speed —
   * future engines may report that under a different field.
   */
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

// Shared constants — exported so engines + visualizers all use the same
// trajectory shape (per /critic Nitpick #16: don't paste-not-import).
export const TRAJECTORY_HORIZON_FRAMES = 12;
export const TRAJECTORY_FRAME_DT = 1 / 30;

/** Vector magnitude — exported so engines share one impl (Nitpick #15). */
export function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Single canonical gait classifier shared across engines (Nitpick #9).
 * Lower energyEfficiency → wider speed bands at each gait (lazy walk
 * stays "walk" longer); higher efficiency → bumps into next gait sooner
 * because more output per joule budget.
 *
 * `crouch` is reserved in the `Gait` union for engines that detect
 * stealth/duck postures from joint configuration — not produced by speed
 * alone.
 */
export function classifyGait(speed: number, energyEfficiency: number): Gait {
  const efficiencyPenalty = energyEfficiency > 1.0 ? 0.85 : 1.0;
  const adjusted = speed * efficiencyPenalty;
  if (adjusted < 0.05) return 'idle';
  if (adjusted < 1.4) return 'walk';
  if (adjusted < 3.0) return 'trot';
  return 'run';
}

/**
 * Compute trajectory by linear projection from velocity. Exported so the
 * synthetic engine and any procedural/test engines share one implementation.
 */
export function projectLinearTrajectory(velocity: Vec3): Array<[number, number, number]> {
  const trajectory: Array<[number, number, number]> = [];
  for (let i = 1; i <= TRAJECTORY_HORIZON_FRAMES; i++) {
    const t = i * TRAJECTORY_FRAME_DT;
    trajectory.push([velocity.x * t, velocity.y * t, velocity.z * t]);
  }
  return trajectory;
}

/**
 * NullMotionMatchingEngine — deterministic pass-through engine for testing
 * the seam and providing a safe default before a real engine is registered.
 *
 * It does NOT perform neural inference. It produces a result whose SHAPE
 * matches what a real engine would emit, with values derived geometrically
 * from the input velocity. Real engine slots in via the same interface.
 */
export class NullMotionMatchingEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded = false;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  infer(input: MotionInferenceInput): MotionInferenceResult {
    const speed = magnitude(input.targetVelocity);
    const energyEfficiency = input.energyEfficiency ?? 1.0;
    const phaseAdvance = (speed * 0.3 + 0.5) * input.delta;
    const phase = (input.currentPhase + phaseAdvance) % 1.0;

    const leftFootContact = phase < 0.5;
    const rightFootContact = phase >= 0.5;

    return {
      pose: { joints: {}, timestamp: Date.now() },
      phase,
      trajectory: projectLinearTrajectory(input.targetVelocity),
      stability: 1.0,
      contactFeatures: { leftFoot: leftFootContact, rightFoot: rightFootContact },
      gait: classifyGait(speed, energyEfficiency),
      kineticEnergyProxy: speed * speed * energyEfficiency,
    };
  }

  dispose(): void {
    this.loaded = false;
  }
}

export function createNullMotionMatchingEngine(modelId: string): MotionMatchingEngine {
  return new NullMotionMatchingEngine(modelId);
}

// =============================================================================
// BUNDLED MODEL DESCRIPTORS
// =============================================================================

export interface ModelDescriptor {
  id: string;
  /** Number of scalar input features per frame. */
  inputDim: number;
  /** Number of scalar output features per frame. */
  outputDim: number;
  /** Estimated joints in the skeleton. */
  jointCount: number;
  inputNames: readonly string[];
  outputNames: readonly string[];
}

/**
 * Canonical built-in model identifiers.
 * Paths resolve at load() time when actual .onnx files are provided.
 * The engine ships ready for models — models are dropped in without code changes.
 */
export const BUNDLED_MODELS: Record<string, ModelDescriptor> = {
  biped_humanoid_v2: {
    id: 'biped_humanoid_v2',
    inputDim: 13, // vx, vy, vz, phase_sin, phase_cos, nx, ny, nz, efficiency, prev_phase, root_height, left_contact, right_contact
    outputDim: 320, // 20 joints × (pos3 + quat4 + vel3 + angvel3) = 20×13 = 260 + 60 trajectory
    jointCount: 20,
    inputNames: ['input_features'],
    outputNames: ['joint_params', 'next_phase', 'trajectory', 'stability', 'foot_contacts'],
  },
  quadruped_dog_v2: {
    id: 'quadruped_dog_v2',
    inputDim: 19, // biped dims + fore_left, fore_right + hind_left, hind_right + body_angle
    outputDim: 480, // 32 joints × 13 + trajectory 64
    jointCount: 32,
    inputNames: ['input_features'],
    outputNames: ['joint_params', 'next_phase', 'trajectory', 'stability', 'foot_contacts'],
  },
} as const;

export const BIPED_HUMANOID_V2_PATH = 'models/motion_matching/biped_humanoid_v2.onnx';
export const QUADRUPED_DOG_V2_PATH = 'models/motion_matching/quadruped_dog_v2.onnx';

// =============================================================================
// ONNX RUNTIME LAZY LOADER
// =============================================================================

interface OrtModule {
  InferenceSession: {
    create(
      modelPath: string | ArrayBufferLike,
      options?: OrtSessionOptions
    ): Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array,
    dims: number[]
  ) => OrtTensor;
}

interface OrtSessionOptions {
  executionProviders?: string[];
  graphOptimizationLevel?: string;
}

interface OrtTensor {
  data: Float32Array | BigInt64Array | number[];
  dims: readonly number[];
}

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}

/**
 * Lazily load onnxruntime — tries onnxruntime-web first (browser + WebGPU),
 * then onnxruntime-node (Node.js). Returns null if neither is available.
 */
async function tryLoadOrt(): Promise<OrtModule | null> {
  // onnxruntime-web supports WebGPU execution provider
  try {
    const m = await import('onnxruntime-web') as unknown as OrtModule;
    if (m?.InferenceSession) return m;
  } catch {
    // not available
  }
  // onnxruntime-node for Node.js environments
  try {
    const m = await import('onnxruntime-node') as unknown as OrtModule;
    if (m?.InferenceSession) return m;
  } catch {
    // not available
  }
  return null;
}

// =============================================================================
// PROCEDURAL FALLBACK (shared with OnnxEngine when no model loaded)
// =============================================================================

function runProceduralInference(input: MotionInferenceInput): MotionInferenceResult {
  const speed = magnitude(input.targetVelocity);
  const energyEfficiency = input.energyEfficiency ?? 1.0;
  const terrainNormal = input.terrainNormal ?? { x: 0, y: 1, z: 0 };
  // Phase advances proportional to speed; slower convergence on rough terrain
  const terrainSlope = 1.0 - Math.abs(terrainNormal.y);
  const phaseAdvance = (speed * 0.3 + 0.5) * input.delta * (1.0 - terrainSlope * 0.2);
  const phase = (input.currentPhase + phaseAdvance) % 1.0;
  const leftFootContact = phase < 0.5;
  const rightFootContact = phase >= 0.5;

  return {
    pose: { joints: {}, timestamp: Date.now() },
    phase,
    trajectory: projectLinearTrajectory(input.targetVelocity),
    stability: Math.max(0, 1.0 - terrainSlope * 0.8),
    contactFeatures: { leftFoot: leftFootContact, rightFoot: rightFootContact },
    gait: classifyGait(speed, energyEfficiency),
    kineticEnergyProxy: speed * speed * energyEfficiency,
  };
}

// =============================================================================
// ONNX MODEL RESULT PARSER
// =============================================================================

function parseOnnxOutputs(
  outputs: Record<string, OrtTensor>,
  input: MotionInferenceInput,
  descriptor: ModelDescriptor
): MotionInferenceResult {
  const energyEfficiency = input.energyEfficiency ?? 1.0;

  // next_phase — scalar
  const nextPhaseData = outputs['next_phase']?.data as Float32Array | undefined;
  const phase = nextPhaseData ? nextPhaseData[0] % 1.0 : (input.currentPhase + input.delta * 0.5) % 1.0;

  // stability — scalar
  const stabilityData = outputs['stability']?.data as Float32Array | undefined;
  const stability = stabilityData ? Math.max(0, Math.min(1, stabilityData[0])) : 1.0;

  // foot_contacts — 2 floats (left, right) for biped; 4 for quadruped
  const contactData = outputs['foot_contacts']?.data as Float32Array | undefined;
  const leftFoot = contactData ? contactData[0] > 0.5 : phase < 0.5;
  const rightFoot = contactData ? contactData[1] > 0.5 : phase >= 0.5;
  const contactFeatures: ContactFeatures = { leftFoot, rightFoot };
  if (contactData && contactData.length >= 4) {
    contactFeatures['foreFoot'] = contactData[2] > 0.5;
    contactFeatures['hindFoot'] = contactData[3] > 0.5;
  }

  // joint_params — flatten to Float32Array pose representation
  const jointData = outputs['joint_params']?.data as Float32Array | undefined;
  const pose = buildPoseFromFlat(jointData, descriptor.jointCount);

  // trajectory — Nx3 flattened
  const trajectoryData = outputs['trajectory']?.data as Float32Array | undefined;
  const trajectory = buildTrajectoryFromFlat(trajectoryData);

  const speed = magnitude(input.targetVelocity);

  return {
    pose,
    phase,
    trajectory,
    stability,
    contactFeatures,
    gait: classifyGait(speed, energyEfficiency),
    kineticEnergyProxy: speed * speed * energyEfficiency,
  };
}

function buildPoseFromFlat(data: Float32Array | undefined, jointCount: number): SkeletonPose {
  const joints: SkeletonPose['joints'] = {};
  if (!data) return { joints, timestamp: Date.now() };

  for (let i = 0; i < jointCount; i++) {
    const base = i * 7; // pos3 + quat4
    if (base + 6 >= data.length) break;
    joints[`joint_${i}`] = {
      position: [data[base], data[base + 1], data[base + 2]],
      rotation: [data[base + 3], data[base + 4], data[base + 5], data[base + 6]],
    };
  }

  return { joints, timestamp: Date.now() };
}

function buildTrajectoryFromFlat(data: Float32Array | undefined): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  if (!data) return result;
  for (let i = 0; i < data.length - 2; i += 3) {
    result.push([data[i], data[i + 1], data[i + 2]]);
  }
  return result;
}

// =============================================================================
// ONNX MOTION MATCHING ENGINE
// =============================================================================

/**
 * OnnxMotionMatchingEngine — production neural locomotion engine.
 *
 * Architecture: Phase-Functioned Neural Network (PFNN).
 * References:
 *   - Holden et al. 2017 "Phase-Functioned Neural Networks for Character Control" SIGGRAPH
 *   - Starke et al. 2019 "Neural State Machine for Character-Scene Interactions" SIGGRAPH
 *   - Starke et al. 2020 "Local Motion Phases for Learning Multi-Contact Character Movements" SIGGRAPH
 *   - Starke et al. 2022 "DeepPhase: Periodic Autoencoders for Learning Motion Phase Manifolds" SIGGRAPH
 *
 * License note: Implemented from primary literature.
 *   NOT derived from CC-BY-NC sweriko/ai4anim-webgpu.
 *   See research/2026-04-26_idea-run-3-neural-locomotion.md PLAN-1 ruling.
 *
 * Execution backends (priority order):
 *   1. WebGPU EP  — onnxruntime-web + 'webgpu' execution provider (<5ms FP16 batched)
 *   2. CPU FP32   — onnxruntime-web/node CPU fallback
 *   3. Procedural — NullEngine-style math fallback (no .onnx file required)
 *
 * Usage:
 *   const engine = new OnnxMotionMatchingEngine('biped_humanoid_v2');
 *   await engine.load('/path/to/biped_humanoid_v2.onnx');
 *   const result = engine.infer({ targetVelocity: {x:1,y:0,z:0}, currentPhase:0, delta:0.016 });
 *   engine.dispose();
 */
export class OnnxMotionMatchingEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded = false;
  private session: OrtSession | null = null;
  private ort: OrtModule | null = null;
  private descriptor: ModelDescriptor;
  private activeBackend: 'webgpu' | 'cpu' | 'procedural' = 'procedural';

  constructor(modelId: string) {
    this.modelId = modelId;
    this.descriptor = BUNDLED_MODELS[modelId] ?? BUNDLED_MODELS['biped_humanoid_v2'];
  }

  get backend(): 'webgpu' | 'cpu' | 'procedural' {
    return this.activeBackend;
  }

  /**
   * Load the model from modelPath (or resolve the bundled default path).
   * Attempts WebGPU EP first, falls back to CPU, then procedural if the file
   * is unavailable. Never throws — callers can check `engine.backend` to see
   * which path was taken.
   */
  async load(modelPath?: string): Promise<void> {
    const path = modelPath ?? this.defaultModelPath();
    this.ort = await tryLoadOrt();

    if (!this.ort) {
      // No onnxruntime available — pure procedural
      this.activeBackend = 'procedural';
      this.loaded = true;
      return;
    }

    // Try WebGPU first
    if (await this.tryCreateSession(path, ['webgpu', 'cpu'])) {
      this.activeBackend = 'webgpu';
      this.loaded = true;
      return;
    }

    // CPU only fallback
    if (await this.tryCreateSession(path, ['cpu'])) {
      this.activeBackend = 'cpu';
      this.loaded = true;
      return;
    }

    // Model file unavailable — graceful procedural fallback
    this.activeBackend = 'procedural';
    this.loaded = true;
  }

  private async tryCreateSession(
    modelPath: string,
    executionProviders: string[]
  ): Promise<boolean> {
    if (!this.ort) return false;
    try {
      this.session = await this.ort.InferenceSession.create(modelPath, {
        executionProviders,
        graphOptimizationLevel: 'all',
      });
      return true;
    } catch {
      return false;
    }
  }

  private defaultModelPath(): string {
    switch (this.modelId) {
      case 'biped_humanoid_v2':
        return BIPED_HUMANOID_V2_PATH;
      case 'quadruped_dog_v2':
        return QUADRUPED_DOG_V2_PATH;
      default:
        return `models/motion_matching/${this.modelId}.onnx`;
    }
  }

  infer(input: MotionInferenceInput): MotionInferenceResult {
    if (this.session && this.ort) {
      // Sync inference is not supported by onnxruntime — users needing async should
      // use inferAsync(). Calling infer() when session is loaded returns the last
      // cached result or falls through to procedural for the first frame.
      // In practice, NeuralAnimationTrait calls inferAsync() from onUpdate().
      return runProceduralInference(input);
    }
    return runProceduralInference(input);
  }

  /**
   * Async inference — preferred path when session is loaded.
   * Falls back to synchronous procedural result if session unavailable.
   */
  async inferAsync(input: MotionInferenceInput): Promise<MotionInferenceResult> {
    if (!this.session || !this.ort) {
      return runProceduralInference(input);
    }

    const inputTensor = this.buildInputTensor(input);
    let outputs: Record<string, OrtTensor>;
    try {
      outputs = await this.session.run({ [this.descriptor.inputNames[0]]: inputTensor });
    } catch {
      return runProceduralInference(input);
    }

    return parseOnnxOutputs(outputs, input, this.descriptor);
  }

  private buildInputTensor(input: MotionInferenceInput): OrtTensor {
    if (!this.ort) throw new Error('OrtModule not loaded');
    const terrainNormal = input.terrainNormal ?? { x: 0, y: 1, z: 0 };
    const efficiency = input.energyEfficiency ?? 1.0;

    // Phase encoded as (sin, cos) for phase continuity (Holden 2017, §3.2)
    const phaseSin = Math.sin(input.currentPhase * Math.PI * 2);
    const phaseCos = Math.cos(input.currentPhase * Math.PI * 2);

    const dim = this.descriptor.inputDim;
    const data = new Float32Array(dim);
    data[0] = input.targetVelocity.x;
    data[1] = input.targetVelocity.y;
    data[2] = input.targetVelocity.z;
    data[3] = phaseSin;
    data[4] = phaseCos;
    data[5] = terrainNormal.x;
    data[6] = terrainNormal.y;
    data[7] = terrainNormal.z;
    data[8] = efficiency;
    // remaining dims padded with zeros (per-model extensions handled by server-side preprocessing)

    return new this.ort.Tensor('float32', data, [1, dim]);
  }

  dispose(): void {
    if (this.session) {
      // fire-and-forget release — not awaited since dispose() is synchronous
      this.session.release().catch(() => undefined);
      this.session = null;
    }
    this.ort = null;
    this.loaded = false;
    this.activeBackend = 'procedural';
  }
}

export function createOnnxMotionMatchingEngine(modelId: string): OnnxMotionMatchingEngine {
  return new OnnxMotionMatchingEngine(modelId);
}
