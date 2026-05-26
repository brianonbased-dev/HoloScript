import { describe, expect, it } from 'vitest';
import {
  batchCheckPlausibility,
  checkPlausibility,
  type MotionBonePose,
  type MotionCategory,
  type MotionClip,
  type PlausibilityBatchResult,
  type PlausibilityResult,
} from '../PhysicsPlausibilityContract';

const FOOT_FLOOR_THRESHOLD = -0.05;
const ZMP_HALF_SUPPORT = 0.35;
const JOINT_ANGLE_LIMIT_RAD = 2.094;
const COLLISION_RADIUS = 0.1;
const MAX_IMPULSE_MPS = 5.0;
const MICRO_MAX_METRES = 0.05;
const MICRO_MIN_METRES = 1e-4;

const IDENTITY_ROT: readonly [number, number, number, number] = [0, 0, 0, 1];

function pose(
  boneId: string,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number, number] = IDENTITY_ROT,
): MotionBonePose {
  return { boneId, position, rotation };
}

function baseFrame(): MotionBonePose[] {
  return [
    pose('root', [0, 1.0, 0]),
    pose('spine', [0, 1.5, 0]),
    pose('l_foot', [-0.2, 0, 0]),
    pose('r_foot', [0.2, 0, 0]),
    pose('l_hand', [-0.4, 1.2, 0]),
    pose('r_hand', [0.4, 1.2, 0]),
  ];
}

function clip(
  id: string,
  category: MotionCategory,
  frames: MotionBonePose[][],
): MotionClip {
  return { id, category, frames, dt: 0.05 };
}

function quatAngle(rotation: readonly [number, number, number, number]): number {
  const w = Math.max(-1, Math.min(1, rotation[3]));
  return 2 * Math.acos(Math.abs(w));
}

function dist2(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function dist(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.sqrt(dist2(a, b));
}

function pass(category: MotionCategory, clipId: string): PlausibilityResult {
  return { pass: true, category, clipId };
}

function fail(
  clipToCheck: MotionClip,
  violatedConstraint: string,
  frameIndex: number,
  boneId: string,
): PlausibilityResult {
  return {
    pass: false,
    category: clipToCheck.category,
    clipId: clipToCheck.id,
    violatedConstraint,
    frameIndex,
    boneId,
  };
}

function referenceCheckPlausibility(clipToCheck: MotionClip): PlausibilityResult {
  switch (clipToCheck.category) {
    case 'locomotion':
      return referenceLocomotion(clipToCheck, true);
    case 'gesture':
      return referenceGesture(clipToCheck);
    case 'interaction':
      return referenceInteraction(clipToCheck);
    case 'acrobatics':
      return referenceAcrobatics(clipToCheck);
    case 'micro-gesture':
      return referenceMicroGesture(clipToCheck);
  }
}

function divergentReferenceWithoutZmp(clipToCheck: MotionClip): PlausibilityResult {
  if (clipToCheck.category !== 'locomotion') {
    return referenceCheckPlausibility(clipToCheck);
  }
  return referenceLocomotion(clipToCheck, false);
}

function referenceLocomotion(
  clipToCheck: MotionClip,
  includeZmpClause: boolean,
): PlausibilityResult {
  for (let fi = 0; fi < clipToCheck.frames.length; fi++) {
    const frame = clipToCheck.frames[fi]!;
    for (const bone of frame) {
      if (/foot|toe|ankle/i.test(bone.boneId) && bone.position[1] < FOOT_FLOOR_THRESHOLD) {
        return fail(clipToCheck, 'foot_below_floor', fi, bone.boneId);
      }
      if (
        includeZmpClause &&
        /root|pelvis|hips/i.test(bone.boneId) &&
        Math.abs(bone.position[0]) > ZMP_HALF_SUPPORT
      ) {
        return fail(clipToCheck, 'zmp_outside_support', fi, bone.boneId);
      }
    }
  }
  return pass('locomotion', clipToCheck.id);
}

function referenceGesture(clipToCheck: MotionClip): PlausibilityResult {
  for (let fi = 0; fi < clipToCheck.frames.length; fi++) {
    const frame = clipToCheck.frames[fi]!;
    for (const bone of frame) {
      if (quatAngle(bone.rotation) > JOINT_ANGLE_LIMIT_RAD) {
        return fail(clipToCheck, 'joint_limit_burst', fi, bone.boneId);
      }
    }
  }
  return pass('gesture', clipToCheck.id);
}

function referenceInteraction(clipToCheck: MotionClip): PlausibilityResult {
  const collisionRadius2 = COLLISION_RADIUS * COLLISION_RADIUS;
  for (let fi = 0; fi < clipToCheck.frames.length; fi++) {
    const frame = clipToCheck.frames[fi]!;
    for (let i = 0; i < frame.length; i++) {
      for (let j = i + 1; j < frame.length; j++) {
        if (dist2(frame[i]!.position, frame[j]!.position) < collisionRadius2) {
          return fail(clipToCheck, 'bone_penetration', fi, frame[i]!.boneId);
        }
      }
    }
  }
  return pass('interaction', clipToCheck.id);
}

function referenceAcrobatics(clipToCheck: MotionClip): PlausibilityResult {
  const maxDist = MAX_IMPULSE_MPS * clipToCheck.dt;
  for (let fi = 1; fi < clipToCheck.frames.length; fi++) {
    const prev = clipToCheck.frames[fi - 1]!;
    const curr = clipToCheck.frames[fi]!;
    for (let bi = 0; bi < curr.length; bi++) {
      if (dist(curr[bi]!.position, prev[bi]!.position) > maxDist) {
        return fail(clipToCheck, 'impulse_exceeded', fi, curr[bi]!.boneId);
      }
    }
  }
  return pass('acrobatics', clipToCheck.id);
}

function referenceMicroGesture(clipToCheck: MotionClip): PlausibilityResult {
  for (let fi = 1; fi < clipToCheck.frames.length; fi++) {
    const prev = clipToCheck.frames[fi - 1]!;
    const curr = clipToCheck.frames[fi]!;
    for (let bi = 0; bi < curr.length; bi++) {
      const movement = dist(curr[bi]!.position, prev[bi]!.position);
      if (movement > 0 && movement < MICRO_MIN_METRES) {
        return fail(clipToCheck, 'frozen_jitter', fi, curr[bi]!.boneId);
      }
      if (movement > MICRO_MAX_METRES) {
        return fail(clipToCheck, 'micro_limit_exceeded', fi, curr[bi]!.boneId);
      }
    }
  }
  return pass('micro-gesture', clipToCheck.id);
}

function referenceBatchCheck(clips: MotionClip[]): Omit<PlausibilityBatchResult, 'checkTimeMs'> {
  const violations: Record<string, number> = {};
  let passed = 0;

  for (const clipToCheck of clips) {
    const result = referenceCheckPlausibility(clipToCheck);
    if (result.pass) {
      passed++;
    } else {
      const key = result.violatedConstraint ?? 'unknown';
      violations[key] = (violations[key] ?? 0) + 1;
    }
  }

  return {
    total: clips.length,
    passed,
    failed: clips.length - passed,
    passRate: passed / clips.length,
    violations,
  };
}

function withBone(
  frame: MotionBonePose[],
  boneId: string,
  patch: Partial<Pick<MotionBonePose, 'position' | 'rotation'>>,
): MotionBonePose[] {
  return frame.map((bone) => (bone.boneId === boneId ? { ...bone, ...patch } : bone));
}

const highAngle = 2.4;
const highRotation: readonly [number, number, number, number] = [
  Math.sin(highAngle / 2),
  0,
  0,
  Math.cos(highAngle / 2),
];

function twinFixtures(): MotionClip[] {
  const valid = baseFrame();

  return [
    clip('locomotion-valid', 'locomotion', [valid, valid]),
    clip('locomotion-foot-fail', 'locomotion', [
      valid,
      withBone(valid, 'l_foot', { position: [-0.2, -0.08, 0] }),
    ]),
    clip('locomotion-zmp-fail', 'locomotion', [
      valid,
      withBone(valid, 'root', { position: [0.6, 1.0, 0] }),
    ]),
    clip('gesture-valid', 'gesture', [valid, valid]),
    clip('gesture-joint-fail', 'gesture', [
      valid,
      withBone(valid, 'spine', { rotation: highRotation }),
    ]),
    clip('interaction-valid', 'interaction', [valid, valid]),
    clip('interaction-penetration-fail', 'interaction', [
      valid,
      withBone(valid, 'l_hand', { position: [0.4, 1.2, 0] }),
    ]),
    clip('acrobatics-valid', 'acrobatics', [valid, valid]),
    clip('acrobatics-impulse-fail', 'acrobatics', [
      valid,
      withBone(valid, 'root', { position: [2.0, 1.0, 0] }),
    ]),
    clip('micro-valid', 'micro-gesture', [
      valid,
      withBone(valid, 'l_hand', { position: [-0.395, 1.2, 0] }),
    ]),
    clip('micro-frozen-fail', 'micro-gesture', [
      valid,
      withBone(valid, 'l_hand', { position: [-0.39995, 1.2, 0] }),
    ]),
    clip('micro-limit-fail', 'micro-gesture', [
      valid,
      withBone(valid, 'l_hand', { position: [-0.3, 1.2, 0] }),
    ]),
  ];
}

describe('Paper-9 MotionPlausibility twin-test equivalence', () => {
  it('matches an independent TypeScript reference for every constraint clause', () => {
    for (const fixture of twinFixtures()) {
      expect(checkPlausibility(fixture)).toEqual(referenceCheckPlausibility(fixture));
    }
  });

  it('matches the independent reference batch aggregate except wall-clock timing', () => {
    const fixtures = twinFixtures();
    const production = batchCheckPlausibility(fixtures);
    const reference = referenceBatchCheck(fixtures);

    expect({
      total: production.total,
      passed: production.passed,
      failed: production.failed,
      passRate: production.passRate,
      violations: production.violations,
    }).toEqual(reference);
  });

  it('failure guard rejects a deliberately divergent twin that drops the ZMP clause', () => {
    const zmpFixture = twinFixtures().find((fixture) => fixture.id === 'locomotion-zmp-fail');
    if (!zmpFixture) throw new Error('locomotion-zmp-fail fixture missing');

    const production = checkPlausibility(zmpFixture);
    const divergent = divergentReferenceWithoutZmp(zmpFixture);

    expect(production.pass).toBe(false);
    expect(production.violatedConstraint).toBe('zmp_outside_support');
    expect(divergent.pass).toBe(true);
    expect(production).not.toEqual(divergent);
  });
});
