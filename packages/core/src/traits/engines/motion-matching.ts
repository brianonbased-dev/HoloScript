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
  energyCost: number;
}

export interface MotionMatchingEngine {
  readonly modelId: string;
  readonly loaded: boolean;
  load(): Promise<void>;
  infer(input: MotionInferenceInput): MotionInferenceResult;
  dispose(): void;
}

export type MotionMatchingEngineFactory = (modelId: string) => MotionMatchingEngine;

const TRAJECTORY_HORIZON_FRAMES = 12;
const TRAJECTORY_FRAME_DT = 1 / 30;

function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function classifyGait(speed: number, energyEfficiency: number): Gait {
  const efficiencyPenalty = energyEfficiency > 1.0 ? 0.85 : 1.0;
  const adjusted = speed * efficiencyPenalty;
  if (adjusted < 0.05) return 'idle';
  if (adjusted < 1.4) return 'walk';
  if (adjusted < 3.0) return 'trot';
  if (adjusted < 6.0) return 'run';
  return 'run';
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

    const trajectory: Array<[number, number, number]> = [];
    for (let i = 1; i <= TRAJECTORY_HORIZON_FRAMES; i++) {
      const t = i * TRAJECTORY_FRAME_DT;
      trajectory.push([
        input.targetVelocity.x * t,
        input.targetVelocity.y * t,
        input.targetVelocity.z * t,
      ]);
    }

    const leftFootContact = phase < 0.5;
    const rightFootContact = phase >= 0.5;

    return {
      pose: { joints: {}, timestamp: Date.now() },
      phase,
      trajectory,
      stability: 1.0,
      contactFeatures: { leftFoot: leftFootContact, rightFoot: rightFootContact },
      gait: classifyGait(speed, energyEfficiency),
      energyCost: speed * speed * energyEfficiency,
    };
  }

  dispose(): void {
    this.loaded = false;
  }
}

export function createNullMotionMatchingEngine(modelId: string): MotionMatchingEngine {
  return new NullMotionMatchingEngine(modelId);
}
