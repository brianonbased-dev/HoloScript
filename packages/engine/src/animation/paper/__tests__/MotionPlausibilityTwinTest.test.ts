import { describe, expect, it } from 'vitest';
import {
  CONTRACT_CONSTANTS,
  checkPlausibility,
  type MotionBonePose,
  type MotionCategory,
  type MotionClip,
  type PlausibilityResult,
} from '../PhysicsPlausibilityContract';

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

const IDENTITY: Quat = [0, 0, 0, 1];

function bone(boneId: string, position: Vec3, rotation: Quat = IDENTITY): MotionBonePose {
  return { boneId, position, rotation };
}

function clip(category: MotionCategory, frames: MotionBonePose[][]): MotionClip {
  return { id: `${category}-fixture`, category, frames, dt: 0.05 };
}

function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function quatAngle(q: Quat): number {
  const w = Math.max(-1, Math.min(1, q[3]));
  return 2 * Math.acos(Math.abs(w));
}

function pass(category: MotionCategory, clipId: string): PlausibilityResult {
  return { pass: true, category, clipId };
}

function fail(
  category: MotionCategory,
  clipId: string,
  violatedConstraint: string,
  frameIndex: number,
  boneId: string,
): PlausibilityResult {
  return { pass: false, category, clipId, violatedConstraint, frameIndex, boneId };
}

function independentPlausibilityTwin(input: MotionClip): PlausibilityResult {
  if (input.category === 'locomotion') {
    for (let fi = 0; fi < input.frames.length; fi++) {
      for (const pose of input.frames[fi]!) {
        if (/foot|toe|ankle/i.test(pose.boneId) && pose.position[1] < CONTRACT_CONSTANTS.FOOT_FLOOR_THRESHOLD) {
          return fail(input.category, input.id, 'foot_below_floor', fi, pose.boneId);
        }
        if (/root|pelvis|hips/i.test(pose.boneId) && Math.abs(pose.position[0]) > CONTRACT_CONSTANTS.ZMP_HALF_SUPPORT) {
          return fail(input.category, input.id, 'zmp_outside_support', fi, pose.boneId);
        }
      }
    }
    return pass(input.category, input.id);
  }

  if (input.category === 'gesture') {
    for (let fi = 0; fi < input.frames.length; fi++) {
      for (const pose of input.frames[fi]!) {
        if (quatAngle(pose.rotation) > CONTRACT_CONSTANTS.JOINT_ANGLE_LIMIT_RAD) {
          return fail(input.category, input.id, 'joint_limit_burst', fi, pose.boneId);
        }
      }
    }
    return pass(input.category, input.id);
  }

  if (input.category === 'interaction') {
    for (let fi = 0; fi < input.frames.length; fi++) {
      const frame = input.frames[fi]!;
      for (let i = 0; i < frame.length; i++) {
        for (let j = i + 1; j < frame.length; j++) {
          if (distance(frame[i]!.position, frame[j]!.position) < CONTRACT_CONSTANTS.COLLISION_RADIUS) {
            return fail(input.category, input.id, 'bone_penetration', fi, frame[i]!.boneId);
          }
        }
      }
    }
    return pass(input.category, input.id);
  }

  if (input.category === 'acrobatics') {
    const maxStep = CONTRACT_CONSTANTS.MAX_IMPULSE_MPS * input.dt;
    for (let fi = 1; fi < input.frames.length; fi++) {
      const prev = input.frames[fi - 1]!;
      const curr = input.frames[fi]!;
      for (let bi = 0; bi < curr.length; bi++) {
        if (distance(prev[bi]!.position, curr[bi]!.position) > maxStep) {
          return fail(input.category, input.id, 'impulse_exceeded', fi, curr[bi]!.boneId);
        }
      }
    }
    return pass(input.category, input.id);
  }

  for (let fi = 1; fi < input.frames.length; fi++) {
    const prev = input.frames[fi - 1]!;
    const curr = input.frames[fi]!;
    for (let bi = 0; bi < curr.length; bi++) {
      const step = distance(prev[bi]!.position, curr[bi]!.position);
      if (step > 0 && step < CONTRACT_CONSTANTS.MICRO_MIN_METRES) {
        return fail(input.category, input.id, 'frozen_jitter', fi, curr[bi]!.boneId);
      }
      if (step > CONTRACT_CONSTANTS.MICRO_MAX_METRES) {
        return fail(input.category, input.id, 'micro_limit_exceeded', fi, curr[bi]!.boneId);
      }
    }
  }
  return pass(input.category, input.id);
}

function divergentLocomotionTwin(input: MotionClip): PlausibilityResult {
  if (input.category !== 'locomotion') return independentPlausibilityTwin(input);
  for (let fi = 0; fi < input.frames.length; fi++) {
    for (const pose of input.frames[fi]!) {
      if (/root|pelvis|hips/i.test(pose.boneId) && Math.abs(pose.position[0]) > 999) {
        return fail(input.category, input.id, 'zmp_outside_support', fi, pose.boneId);
      }
    }
  }
  return pass(input.category, input.id);
}

const fixtures: MotionClip[] = [
  clip('locomotion', [
    [bone('root', [0, 1, 0]), bone('l_foot', [0, 0, 0])],
    [bone('root', [0.6, 1, 0]), bone('l_foot', [0, 0, 0])],
  ]),
  clip('gesture', [
    [bone('spine', [0, 1, 0], [Math.sin(1.3), 0, 0, Math.cos(1.3)])],
  ]),
  clip('interaction', [
    [bone('l_hand', [0, 1, 0]), bone('r_hand', [0.02, 1, 0])],
  ]),
  clip('acrobatics', [
    [bone('root', [0, 1, 0])],
    [bone('root', [1.0, 1, 0])],
  ]),
  clip('micro-gesture', [
    [bone('l_hand', [0, 1, 0])],
    [bone('l_hand', [0.1, 1, 0])],
  ]),
  clip('micro-gesture', [
    [bone('l_hand', [0, 1, 0])],
    [bone('l_hand', [0.00001, 1, 0])],
  ]),
  clip('locomotion', [
    [bone('root', [0, 1, 0]), bone('l_foot', [0, 0, 0])],
    [bone('root', [0.1, 1, 0]), bone('l_foot', [0, 0.01, 0])],
  ]),
];

describe('Paper-9 MotionPlausibility twin-test', () => {
  it('matches production plausibility decisions with an independent reference evaluator', () => {
    for (const sample of fixtures) {
      const production = checkPlausibility(sample);
      const twin = independentPlausibilityTwin(sample);

      expect(twin.pass, sample.category).toBe(production.pass);
      expect(twin.violatedConstraint, sample.category).toBe(production.violatedConstraint);
      expect(twin.frameIndex, sample.category).toBe(production.frameIndex);
      expect(twin.boneId, sample.category).toBe(production.boneId);
    }
  });

  it('would fail if the twin drops the locomotion ZMP clause', () => {
    const zmpFixture = fixtures[0]!;
    const production = checkPlausibility(zmpFixture);
    const divergent = divergentLocomotionTwin(zmpFixture);

    expect(production.pass).toBe(false);
    expect(production.violatedConstraint).toBe('zmp_outside_support');
    expect(divergent.pass).not.toBe(production.pass);
  });
});
