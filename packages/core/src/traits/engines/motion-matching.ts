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
