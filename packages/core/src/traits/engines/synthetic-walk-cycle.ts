/**
 * SyntheticWalkCycleEngine — procedural walk-cycle implementation of MotionMatchingEngine.
 *
 * NOT a neural network. NOT trained. Hand-crafted sin-wave biped gait that
 * produces a deterministic, license-clean walk cycle. Useful as:
 *   - Testing fixture for the runtime wrapper (visible motion in unit tests
 *     without needing trained weights or a real ONNX backend).
 *   - License-clean training-data generator — emits TrainingFrames that the
 *     real BUILD-1 NN can learn from (procedural-to-neural distillation).
 *   - Studio demo content while the real engine is in development.
 *
 * Explicitly NOT a substitute for the real neural inference (BUILD-1
 * follow-up per /founder ruling 2026-04-26 — primary-literature
 * reimplementation). Named "synthetic" so the trait surface stays honest:
 * a future @stub-audit run that finds this engine knows it's intentional
 * scaffolding, not a stubbed-real-thing.
 */

import {
  classifyGait,
  magnitude,
  projectLinearTrajectory,
  type ContactFeatures,
  type MotionInferenceInput,
  type MotionInferenceResult,
  type MotionMatchingEngine,
  type SkeletonPose,
} from './motion-matching';

const STRIDE_AMPLITUDE_RAD = 0.6;
const KNEE_FLEXION_AMPLITUDE_RAD = 0.5;
const HIP_BOB_AMPLITUDE = 0.04;

/** Joint names this engine drives — matches a generic biped rig. */
export const SYNTHETIC_WALK_JOINTS = [
  'hip',
  'left_thigh',
  'right_thigh',
  'left_knee',
  'right_knee',
  'left_foot',
  'right_foot',
] as const;

/**
 * Build a biped pose at a given phase + speed. Pure function — same inputs
 * always produce the same pose. No timestamp in the joint values themselves
 * (timestamp is set by the engine on the SkeletonPose wrapper).
 */
export function buildSyntheticBipedPose(phase: number, speed: number): Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }> {
  // Two-foot cycle: left foot leads in [0, 0.5), right foot leads in [0.5, 1).
  const leftSwing = Math.sin(phase * 2 * Math.PI);
  const rightSwing = Math.sin((phase + 0.5) * 2 * Math.PI);
  const speedScale = Math.min(speed, 6) / 6; // saturate at 6 m/s

  // Hip bobs vertically twice per cycle (heel strikes)
  const hipY = 1.0 + Math.cos(phase * 4 * Math.PI) * HIP_BOB_AMPLITUDE * speedScale;
  // Hip rotates around vertical to follow stride
  const hipYawRad = leftSwing * 0.05 * speedScale;
  const hipQuat: [number, number, number, number] = [0, Math.sin(hipYawRad / 2), 0, Math.cos(hipYawRad / 2)];

  // Thighs swing fore/aft (rotation around X axis = pitch)
  const leftThighPitchRad = leftSwing * STRIDE_AMPLITUDE_RAD * speedScale;
  const rightThighPitchRad = rightSwing * STRIDE_AMPLITUDE_RAD * speedScale;
  const leftThighQuat: [number, number, number, number] = [Math.sin(leftThighPitchRad / 2), 0, 0, Math.cos(leftThighPitchRad / 2)];
  const rightThighQuat: [number, number, number, number] = [Math.sin(rightThighPitchRad / 2), 0, 0, Math.cos(rightThighPitchRad / 2)];

  // Knees flex when foot is in front of root (positive thigh pitch + lift phase)
  const leftKneeRad = Math.max(0, leftSwing) * KNEE_FLEXION_AMPLITUDE_RAD * speedScale;
  const rightKneeRad = Math.max(0, rightSwing) * KNEE_FLEXION_AMPLITUDE_RAD * speedScale;
  const leftKneeQuat: [number, number, number, number] = [Math.sin(leftKneeRad / 2), 0, 0, Math.cos(leftKneeRad / 2)];
  const rightKneeQuat: [number, number, number, number] = [Math.sin(rightKneeRad / 2), 0, 0, Math.cos(rightKneeRad / 2)];

  // Ankles compensate so foot stays parallel to ground when planted
  const leftFootRad = -leftThighPitchRad * 0.5;
  const rightFootRad = -rightThighPitchRad * 0.5;
  const leftFootQuat: [number, number, number, number] = [Math.sin(leftFootRad / 2), 0, 0, Math.cos(leftFootRad / 2)];
  const rightFootQuat: [number, number, number, number] = [Math.sin(rightFootRad / 2), 0, 0, Math.cos(rightFootRad / 2)];

  return {
    hip: { position: [0, hipY, 0], rotation: hipQuat },
    left_thigh: { position: [0.1, hipY - 0.4, 0], rotation: leftThighQuat },
    right_thigh: { position: [-0.1, hipY - 0.4, 0], rotation: rightThighQuat },
    left_knee: { position: [0.1, hipY - 0.8, 0], rotation: leftKneeQuat },
    right_knee: { position: [-0.1, hipY - 0.8, 0], rotation: rightKneeQuat },
    left_foot: { position: [0.1, hipY - 1.0, 0], rotation: leftFootQuat },
    right_foot: { position: [-0.1, hipY - 1.0, 0], rotation: rightFootQuat },
  };
}

export class SyntheticWalkCycleEngine implements MotionMatchingEngine {
  readonly modelId: string;
  loaded = false;

  constructor(modelId: string = 'synthetic_biped_walk') {
    this.modelId = modelId;
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  infer(input: MotionInferenceInput): MotionInferenceResult {
    const speed = magnitude(input.targetVelocity);
    const energyEfficiency = input.energyEfficiency ?? 1.0;

    // Phase advances proportional to speed (faster walking = quicker cycle).
    // At 1 m/s, cycle period ~1.0s. At idle, phase still drifts slowly to
    // animate idle sway.
    const phaseAdvance = (Math.max(speed, 0.1) * 0.5) * input.delta;
    const phase = (input.currentPhase + phaseAdvance) % 1.0;

    const joints = buildSyntheticBipedPose(phase, speed);
    const pose: SkeletonPose = { joints, timestamp: Date.now() };

    // Foot contact: left planted in [0, 0.5), right in [0.5, 1.0). Idle =
    // both planted.
    const leftFoot = speed < 0.05 || phase < 0.5;
    const rightFoot = speed < 0.05 || phase >= 0.5;
    const contactFeatures: ContactFeatures = { leftFoot, rightFoot };

    return {
      pose,
      phase,
      trajectory: projectLinearTrajectory(input.targetVelocity),
      stability: speed > 5.0 ? Math.max(0.1, 1.0 - (speed - 5.0) * 0.2) : 1.0,
      contactFeatures,
      gait: classifyGait(speed, energyEfficiency),
      kineticEnergyProxy: speed * speed * energyEfficiency,
    };
  }

  dispose(): void {
    this.loaded = false;
  }
}

export function createSyntheticWalkCycleEngine(modelId?: string): MotionMatchingEngine {
  return new SyntheticWalkCycleEngine(modelId);
}
