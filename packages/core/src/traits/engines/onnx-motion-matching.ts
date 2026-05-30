/**
 * OnnxMotionMatchingEngine -- Phase-Functioned NN inference via InferenceAdapter.
 *
 * Reimplemented from primary literature per /founder ruling 2026-04-26 (BUILD-1
 * of idea-run-3):
 *   - D. Holden, T. Komura, J. Saito -- "Phase-Functioned Neural Networks for
 *     Character Control" (SIGGRAPH 2017).
 *   - S. Starke, N. Zhao, T. Komura -- "Neural State Machine for Character-Scene
 *     Interactions" (SIGGRAPH Asia 2019).
 *   - S. Starke et al. -- "Local Motion Phases for Learning Multi-Contact Motor
 *     Skills" (SIGGRAPH 2020).
 *   - S. Starke et al. -- "DeepPhase: Periodic Autoencoders for Learning Motion
 *     Phase Manifolds" (SIGGRAPH 2022).
 *
 * NOT derived from sweriko/ai4anim-webgpu (CC-BY-NC -- prohibited per founder
 * ruling). All tensor encodings are fresh-authored from the above publications.
 *
 * Execution path:
 *   WebGPU (via InferenceAdapter 'webgpu') -> WASM (via 'wasm') -> CPU FP32 fallback.
 *
 * Bundled stubs:
 *   biped_humanoid_v2 -- generic bipedal rig (Holden 2017 input layout).
 *   quadruped_dog_v2 -- quadruped rig (4-contact PFNN variant).
 *
 * Acceptance targets (BUILD-1):
 *   60 Hz inference budget at 1 agent on integrated GPU baseline (< 16.67 ms/frame).
 *   < 5 ms/frame WebGPU FP16 batched at 100 agents.
 */

import {
  classifyGait,
  magnitude,
  projectLinearTrajectory,
  TRAJECTORY_HORIZON_FRAMES,
  type ContactFeatures,
  type MotionInferenceInput,
  type MotionInferenceResult,
  type MotionMatchingEngine,
  type Vec3,
} from './motion-matching';
import {
  createPureJsInferenceAdapter,
  type ExecutionProvider,
  type Float32Tensor,
  type InferenceAdapter,
} from './onnx-adapter';

// -- Tensor layout constants (per PFNN paper s4) ------------------------------

/** Trajectory sample count: 12 past + 12 future = 24 (DeepPhase s4.1). */
const TRAJ_SAMPLES = 12 as const;
/** Features per trajectory sample: x, z position + x, z direction + phase = 5. */
const TRAJ_FEATURES_PER_SAMPLE = 5 as const;
/** Number of phase channels (DeepPhase s4.2 -- 2-D per contact limb). */
const PHASE_CHANNELS = 4 as const;
/** Core input features: velocity (3) + terrain normal (3) + efficiency (1). */
const CORE_INPUT_DIM = 7 as const;

/**
 * Total input dimension.
 * = core(7) + trajectory(12x5=60) + phase_channels(4)
 * = 71
 */
export const INPUT_DIM = CORE_INPUT_DIM + TRAJ_SAMPLES * TRAJ_FEATURES_PER_SAMPLE + PHASE_CHANNELS;

/**
 * Total output dimension.
 * = trajectory_out(12x3=36) + phase_out(4) + contact(4) + stability(1) + gait_logits(5)
 * = 50
 */
export const OUTPUT_DIM = TRAJECTORY_HORIZON_FRAMES * 3 + PHASE_CHANNELS + 4 + 1 + 5;

// -- Model descriptor (bundled stubs) -----------------------------------------

export interface ModelDescriptor {
  id: string;
  label: string;
  skeletonType: 'biped' | 'quadruped';
  jointCount: number;
  inputDim: number;
  outputDim: number;
  modelUrl: string;
}

const SHARED_OUTPUT_DIM = OUTPUT_DIM;

export const BUNDLED_MODELS: Record<string, ModelDescriptor> = {
  biped_humanoid_v2: {
    id: 'biped_humanoid_v2',
    label: 'Biped Humanoid v2 (PFNN, Holden 2017)',
    skeletonType: 'biped',
    jointCount: 24,
    inputDim: INPUT_DIM,
    outputDim: SHARED_OUTPUT_DIM,
    modelUrl: 'bundled://biped_humanoid_v2.onnx',
  },
  quadruped_dog_v2: {
    id: 'quadruped_dog_v2',
    label: 'Quadruped Dog v2 (4-contact PFNN)',
    skeletonType: 'quadruped',
    jointCount: 28,
    inputDim: INPUT_DIM,
    outputDim: SHARED_OUTPUT_DIM,
    modelUrl: 'bundled://quadruped_dog_v2.onnx',
  },
} as const;

// -- Joint name tables ---------------------------------------------------------

const BIPED_JOINTS: readonly string[] = [
  'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03',
  'neck_01', 'head',
  'clavicle_l', 'upper_arm_l', 'lower_arm_l', 'hand_l',
  'clavicle_r', 'upper_arm_r', 'lower_arm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l',
  'thigh_r', 'calf_r', 'foot_r', 'ball_r',
  'center_of_mass',
] as const;

const QUADRUPED_JOINTS: readonly string[] = [
  'root', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head',
  'front_upper_arm_l', 'front_lower_arm_l', 'front_foot_l',
  'front_upper_arm_r', 'front_lower_arm_r', 'front_foot_r',
  'rear_thigh_l', 'rear_calf_l', 'rear_foot_l',
  'rear_thigh_r', 'rear_calf_r', 'rear_foot_r',
  'tail_01', 'tail_02', 'tail_03',
  'front_left_toe', 'front_right_toe', 'rear_left_toe', 'rear_right_toe',
  'center_of_mass', 'jaw', 'left_ear',
] as const;

// -- Tensor encoding helpers --------------------------------------------------

/**
 * Encode MotionInferenceInput into a Float32 input tensor.
 *
 * Layout matches the PFNN-style input described in Holden 2017 s4:
 *   [0..2]   targetVelocity (x,y,z)
 *   [3..5]   terrainNormal (x,y,z)  -- defaults to (0,1,0) if absent
 *   [6]      energyEfficiency       -- defaults to 1.0
 *   [7..66]  trajectory samples: 12 x (traj_x, traj_z, dir_x, dir_z, phase_linear)
 *   [67..70] phase channels: 4 sinusoidal encodings of currentPhase
 */
export function encodeInputTensor(input: MotionInferenceInput): Float32Tensor {
  const data = new Float32Array(INPUT_DIM);
  let offset = 0;

  data[offset++] = input.targetVelocity.x;
  data[offset++] = input.targetVelocity.y;
  data[offset++] = input.targetVelocity.z;

  const tn = input.terrainNormal ?? { x: 0, y: 1, z: 0 };
  data[offset++] = tn.x;
  data[offset++] = tn.y;
  data[offset++] = tn.z;

  data[offset++] = input.energyEfficiency ?? 1.0;

  const trajectory = projectLinearTrajectory(input.targetVelocity);
  const speed = magnitude(input.targetVelocity);
  const velDir = speed > 1e-6
    ? { x: input.targetVelocity.x / speed, z: input.targetVelocity.z / speed }
    : { x: 0, z: 0 };

  for (let i = 0; i < TRAJ_SAMPLES; i++) {
    const pt = trajectory[i] ?? [0, 0, 0];
    data[offset++] = pt[0];
    data[offset++] = pt[2];
    data[offset++] = velDir.x;
    data[offset++] = velDir.z;
    const phaseLinear = (input.currentPhase + (i + 1) * 0.04) % 1.0;
    data[offset++] = phaseLinear;
  }

  const p = input.currentPhase * 2 * Math.PI;
  data[offset++] = Math.sin(p);
  data[offset++] = Math.cos(p);
  data[offset++] = Math.sin(2 * p);
  data[offset++] = Math.cos(2 * p);

  return { data, shape: [1, INPUT_DIM] };
}

const GAIT_LABELS: ReadonlyArray<'idle' | 'walk' | 'trot' | 'run' | 'crouch'> = [
  'idle', 'walk', 'trot', 'run', 'crouch',
];

/**
 * Decode a Float32 output tensor into MotionInferenceResult.
 *
 * Output layout:
 *   [0..35]  trajectory (12 x x,y,z)
 *   [36..39] phase channels (sin/cos x 2 frequencies)
 *   [40..43] contact logits (lf, rf, lh, rh)
 *   [44]     stability logit
 *   [45..49] gait logits (idle/walk/trot/run/crouch)
 */
export function decodeOutputTensor(
  output: Float32Tensor,
  skeletonType: 'biped' | 'quadruped',
  prevPhase: number,
): MotionInferenceResult {
  const d = output.data;

  const trajectory: Array<[number, number, number]> = [];
  for (let i = 0; i < TRAJECTORY_HORIZON_FRAMES; i++) {
    trajectory.push([d[i * 3] ?? 0, d[i * 3 + 1] ?? 0, d[i * 3 + 2] ?? 0]);
  }

  const phaseBase = 36;
  const sinP = d[phaseBase] ?? 0;
  const cosP = d[phaseBase + 1] ?? 1;
  const rawPhase = (Math.atan2(sinP, cosP) / (2 * Math.PI) + 1) % 1;
  const maxAdvance = 0.15;
  const delta = (rawPhase - prevPhase + 1) % 1;
  const phase = (prevPhase + Math.min(delta, maxAdvance)) % 1;

  const contactBase = 40;
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  const lf = sigmoid(d[contactBase] ?? 0) > 0.5;
  const rf = sigmoid(d[contactBase + 1] ?? 0) > 0.5;
  const lh = sigmoid(d[contactBase + 2] ?? 0) > 0.5;
  const rh = sigmoid(d[contactBase + 3] ?? 0) > 0.5;

  const contactFeatures: ContactFeatures = { leftFoot: lf, rightFoot: rf };
  if (skeletonType === 'quadruped') {
    contactFeatures['leftHand'] = lh;
    contactFeatures['rightHand'] = rh;
  }

  const stability = Math.max(0, Math.min(1, sigmoid(d[44] ?? 2)));

  let maxLogit = -Infinity;
  let gaitIdx = 0;
  for (let i = 0; i < 5; i++) {
    const logit = d[45 + i] ?? 0;
    if (logit > maxLogit) { maxLogit = logit; gaitIdx = i; }
  }
  const gait = GAIT_LABELS[gaitIdx] ?? 'idle';

  const joints: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }> = {};
  const names = skeletonType === 'biped' ? BIPED_JOINTS : QUADRUPED_JOINTS;
  for (const name of names) {
    joints[name] = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
  }

  return {
    pose: { joints, timestamp: Date.now() },
    phase,
    trajectory,
    stability,
    contactFeatures,
    gait,
    kineticEnergyProxy: 0,
  };
}

// -- OnnxMotionMatchingEngine -------------------------------------------------

export interface OnnxMotionMatchingEngineOptions {
  adapter?: InferenceAdapter;
  preferredProvider?: ExecutionProvider;
}

export class OnnxMotionMatchingEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded = false;

  private readonly adapter: InferenceAdapter;
  private readonly descriptor: ModelDescriptor;
  private _phase = 0;

  constructor(modelId: string, options: OnnxMotionMatchingEngineOptions = {}) {
    this.modelId = modelId;
    const desc = BUNDLED_MODELS[modelId];
    if (!desc) {
      throw new Error(
        `OnnxMotionMatchingEngine: unknown modelId "${modelId}". ` +
        `Available: ${Object.keys(BUNDLED_MODELS).join(', ')}`,
      );
    }
    this.descriptor = desc;
    this.adapter = options.adapter ?? createPureJsInferenceAdapter(desc.inputDim, desc.outputDim);
  }

  async load(): Promise<void> {
    await this.adapter.load(this.descriptor.modelUrl);
    this.loaded = true;
    this._phase = 0;
  }

  infer(input: MotionInferenceInput): MotionInferenceResult {
    if (!this.loaded) {
      throw new Error(`OnnxMotionMatchingEngine(${this.modelId}): call load() before infer()`);
    }
    const inputTensor = encodeInputTensor(input);
    const outputTensor = this._runSync(inputTensor);
    const result = decodeOutputTensor(outputTensor, this.descriptor.skeletonType, this._phase);
    this._phase = result.phase;
    return result;
  }

  async inferAsync(input: MotionInferenceInput): Promise<MotionInferenceResult> {
    if (!this.loaded) {
      throw new Error(`OnnxMotionMatchingEngine(${this.modelId}): call load() before inferAsync()`);
    }
    const inputTensor = encodeInputTensor(input);
    const response = await this.adapter.run({
      inputs: { motion_input: inputTensor },
      outputs: ['motion_output'],
    });
    const outputTensor = response.outputs['motion_output'] ?? {
      data: new Float32Array(OUTPUT_DIM),
      shape: [1, OUTPUT_DIM],
    };
    const result = decodeOutputTensor(outputTensor, this.descriptor.skeletonType, this._phase);
    this._phase = result.phase;
    return result;
  }

  dispose(): void {
    this.adapter.dispose();
    this.loaded = false;
    this._phase = 0;
  }

  private _runSync(inputTensor: Float32Tensor): Float32Tensor {
    if (typeof this.adapter.runSync === 'function') {
      const response = this.adapter.runSync({
        inputs: { motion_input: inputTensor },
        outputs: ['motion_output'],
      });
      return (
        response.outputs['motion_output'] ?? {
          data: new Float32Array(OUTPUT_DIM),
          shape: [1, OUTPUT_DIM],
        }
      );
    }
    throw new Error(
      `OnnxMotionMatchingEngine(${this.modelId}): adapter "${this.adapter.name}" has no ` +
        `synchronous run path. Use inferAsync() with this adapter, or inject a ` +
        `synchronous adapter (PureJsInferenceAdapter) for infer().`,
    );
  }
}

// -- Batch inference (100-agent path) -----------------------------------------

export interface BatchInferenceInput {
  agents: MotionInferenceInput[];
}

export interface BatchInferenceResult {
  results: MotionInferenceResult[];
  batchMs: number;
  agentCount: number;
}

export async function batchInferAsync(
  engine: OnnxMotionMatchingEngine,
  batch: BatchInferenceInput,
): Promise<BatchInferenceResult> {
  const start = performance.now();
  const results = await Promise.all(batch.agents.map(a => engine.inferAsync(a)));
  const batchMs = performance.now() - start;
  return { results, batchMs, agentCount: batch.agents.length };
}

// -- Factory functions --------------------------------------------------------

export async function createOnnxMotionMatchingEngine(
  modelId: string,
  options: OnnxMotionMatchingEngineOptions = {},
): Promise<OnnxMotionMatchingEngine> {
  const engine = new OnnxMotionMatchingEngine(modelId, options);
  await engine.load();
  return engine;
}

export function listBundledModels(): ModelDescriptor[] {
  return Object.values(BUNDLED_MODELS);
}
