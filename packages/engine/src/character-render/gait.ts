/**
 * gait — skeletal locomotion poses for the native character renderer.
 *
 * Fills the gap the render audit flagged: `LocomotionTrait` moves a node's root position, but
 * nothing maps movement to a *skinned walk cycle*. These pure functions produce an `AvatarPose`
 * (per-bone local rotations over a phase clock) that `CharacterHost` feeds to GPU skinning, so
 * the body actually strides. Modes line up with the real `LocomotionConfig.mode` vocabulary
 * (walk/run + an idle rest state); `speed` scales cadence.
 *
 * Bind pose is a T-pose (arms out along ±X), so each gait first brings the arms down to a
 * natural rest, then swings limbs about X for the stride. Pure math, no GPU.
 *
 * @module character-render
 */

import {
  type Quat,
  quatFromAxisAngle,
  quatMultiply,
} from './skin-math';

export type GaitMode = 'idle' | 'walk' | 'run';

/** Per-mode amplitudes (radians) for the stride cycle. */
interface GaitProfile {
  cadence: number; // step radians per second at speed 1
  legSwing: number; // thigh fore/aft amplitude
  kneeBend: number; // calf bend on swing-through
  armSwing: number; // shoulder fore/aft amplitude
  torsoSway: number; // spine side sway
}

const PROFILES: Record<GaitMode, GaitProfile> = {
  idle: { cadence: 1.2, legSwing: 0.0, kneeBend: 0.0, armSwing: 0.0, torsoSway: 0.03 },
  walk: { cadence: 5.0, legSwing: 0.5, kneeBend: 0.6, armSwing: 0.35, torsoSway: 0.05 },
  run: { cadence: 7.5, legSwing: 0.9, kneeBend: 1.1, armSwing: 0.7, torsoSway: 0.09 },
};

/** Bring an arm down from the T-pose to ~by the side (Z rotation), mirrored per side. */
const ARM_DOWN = 1.2;

/**
 * Compute the skeletal pose for a locomotion mode at time `t` (seconds), cadence scaled by
 * `speed`. Returns a map of bone → local rotation; absent bones stay at bind.
 */
export function gaitPose(mode: GaitMode, t: number, speed = 1.4): AvatarPoseMap {
  const p = PROFILES[mode];
  const phase = t * p.cadence * Math.max(0.1, speed) * 0.5;
  const s = Math.sin(phase);
  const sOpp = Math.sin(phase + Math.PI);
  const pose = new Map<string, Quat>();

  // Arms: base down + opposite-to-legs fore/aft swing about X.
  const leftArmDown = quatFromAxisAngle(0, 0, 1, -ARM_DOWN);
  const rightArmDown = quatFromAxisAngle(0, 0, 1, ARM_DOWN);
  pose.set('left_upper_arm', quatMultiply(leftArmDown, quatFromAxisAngle(1, 0, 0, sOpp * p.armSwing)));
  pose.set('right_upper_arm', quatMultiply(rightArmDown, quatFromAxisAngle(1, 0, 0, s * p.armSwing)));

  // Legs: opposite-phase fore/aft thigh swing about X.
  pose.set('left_upper_leg', quatFromAxisAngle(1, 0, 0, s * p.legSwing));
  pose.set('right_upper_leg', quatFromAxisAngle(1, 0, 0, sOpp * p.legSwing));

  // Knees: bend only as the leg swings forward (clamped positive sine).
  pose.set('left_lower_leg', quatFromAxisAngle(1, 0, 0, Math.max(0, s) * p.kneeBend));
  pose.set('right_lower_leg', quatFromAxisAngle(1, 0, 0, Math.max(0, sOpp) * p.kneeBend));

  // Torso: gentle counter-sway about Z.
  if (p.torsoSway > 0) {
    pose.set('spine1', quatFromAxisAngle(0, 0, 1, Math.sin(phase) * p.torsoSway));
  }

  return pose;
}

/** Map form returned by gaitPose (matches AvatarPose's ReadonlyMap shape). */
export type AvatarPoseMap = Map<string, Quat>;
