/**
 * MixamoRetargeter tests
 *
 * Validates Mixamo → VRM/URDF animation retargeting:
 * - Bone name mapping correctness
 * - Track generation (position, rotation, scale)
 * - Override behavior (scale, rotation offset, skip)
 * - Clip configuration (loop, speed)
 * - Determinism: identical input → identical output
 */

import { describe, it, expect } from 'vitest';
import {
  MixamoRetargeter,
  retargetToVRM,
  retargetToURDF,
  vrmRetargetConfig,
  urdfRetargetConfig,
  getRetargetableBones,
  isRetargetable,
  type MixamoAnimationSource,
  type MixamoBoneAnimation,
  type MixamoKeyframe,
} from '../MixamoRetargeter';
import type { ClipSampleValue, QuaternionValue } from '../AnimationClip';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeKeyframe(
  time: number,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number, number] = [0, 0, 0, 1],
  scale?: [number, number, number]
): MixamoKeyframe {
  return { time, position: pos, rotation: rot, scale };
}

function makeSource(boneAnims: MixamoBoneAnimation[]): MixamoAnimationSource {
  const duration = boneAnims.reduce((max, b) => {
    const boneMax = b.keyframes.reduce((m, kf) => Math.max(m, kf.time), 0);
    return Math.max(max, boneMax);
  }, 0);

  return {
    id: 'test-clip',
    name: 'Test Clip',
    duration,
    boneAnimations: boneAnims,
  };
}

function asQuaternion(value: ClipSampleValue | number | number[] | undefined): QuaternionValue {
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error('expected a quaternion value');
  }
  return value as QuaternionValue;
}

function quaternionNorm(value: QuaternionValue): number {
  return Math.hypot(value[0], value[1], value[2], value[3]);
}

const WALK_HIPS_ANIMATION: MixamoBoneAnimation = {
  mixamoBoneName: 'mixamorig:Hips',
  keyframes: [
    makeKeyframe(0.0, [0, 0.95, 0], [0, 0, 0, 1]),
    makeKeyframe(0.5, [0.05, 0.96, 0.02], [0, 0.05, 0, 0.9987]),
    makeKeyframe(1.0, [0, 0.95, 0], [0, 0, 0, 1]),
  ],
};

const WALK_LEFT_LEG_ANIMATION: MixamoBoneAnimation = {
  mixamoBoneName: 'mixamorig:LeftUpLeg',
  keyframes: [
    makeKeyframe(0.0, [0, 0, 0], [0, 0, 0, 1]),
    makeKeyframe(0.5, [0, -0.1, 0], [0.1, 0, 0, 0.995]),
    makeKeyframe(1.0, [0, 0, 0], [0, 0, 0, 1]),
  ],
};

const WALK_RIGHT_LEG_ANIMATION: MixamoBoneAnimation = {
  mixamoBoneName: 'mixamorig:RightUpLeg',
  keyframes: [
    makeKeyframe(0.0, [0, 0, 0], [0, 0, 0, 1]),
    makeKeyframe(0.5, [0, -0.1, 0], [-0.1, 0, 0, 0.995]),
    makeKeyframe(1.0, [0, 0, 0], [0, 0, 0, 1]),
  ],
};

// ---------------------------------------------------------------------------
// VRM Retargeting
// ---------------------------------------------------------------------------

describe('VRM retargeting', () => {
  it('maps Mixamo hips to VRM hips with position + rotation tracks', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const clip = retargetToVRM(source);

    expect(clip.getDuration()).toBe(1.0);

    const tracks = clip.getTracks();
    expect(tracks.length).toBe(4); // pos x,y,z + one quaternion rotation track

    const posX = tracks.find((t) => t.id === 'hips-pos-x');
    expect(posX).toBeDefined();
    expect(posX!.targetPath).toBe('hips');
    expect(posX!.property).toBe('position');
    expect(posX!.component).toBe('x');
    expect(posX!.keyframes.length).toBe(3);
    expect(posX!.keyframes[1].value).toBeCloseTo(0.05, 5);

    const rotation = tracks.find((t) => t.id === 'hips-rot');
    expect(rotation).toBeDefined();
    expect(rotation!.targetPath).toBe('hips');
    expect(rotation!.property).toBe('rotation');
    expect(rotation!.component).toBeUndefined();
    expect(rotation!.interpolation).toBe('nlerp');
    expect(asQuaternion(rotation!.keyframes[0].value)).toEqual([0, 0, 0, 1]);
    for (const keyframe of rotation!.keyframes) {
      expect(quaternionNorm(asQuaternion(keyframe.value))).toBeCloseTo(1, 12);
    }
  });

  it('retargets multiple bones', () => {
    const source = makeSource([
      WALK_HIPS_ANIMATION,
      WALK_LEFT_LEG_ANIMATION,
      WALK_RIGHT_LEG_ANIMATION,
    ]);
    const clip = retargetToVRM(source);

    const tracks = clip.getTracks();
    expect(tracks.length).toBe(12); // 3 bones × (3 scalar position + 1 quaternion rotation)

    // Left leg
    const leftLegPosY = tracks.find((t) => t.id === 'leftUpperLeg-pos-y');
    expect(leftLegPosY).toBeDefined();
    expect(leftLegPosY!.keyframes[1].value).toBeCloseTo(-0.1, 5);

    // Right leg
    const rightLegRotation = tracks.find((t) => t.id === 'rightUpperLeg-rot');
    expect(rightLegRotation).toBeDefined();
    expect(asQuaternion(rightLegRotation!.keyframes[1].value)[0]).toBeCloseTo(-0.1, 5);
  });
});

// ---------------------------------------------------------------------------
// URDF Retargeting
// ---------------------------------------------------------------------------

describe('URDF retargeting', () => {
  it('maps Mixamo hips to URDF hip_joint', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const clip = retargetToURDF(source);

    const tracks = clip.getTracks();
    const posX = tracks.find((t) => t.id === 'hip_joint-pos-x');
    expect(posX).toBeDefined();
    expect(posX!.targetPath).toBe('hip_joint');
  });

  it('maps left knee to left_knee_joint', () => {
    const source = makeSource([WALK_LEFT_LEG_ANIMATION]);
    const clip = retargetToURDF(source);

    const tracks = clip.getTracks();
    const posY = tracks.find((t) => t.id === 'left_hip_joint-pos-y');
    expect(posY).toBeDefined();
    expect(posY!.targetPath).toBe('left_hip_joint');
  });
});

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

describe('retarget overrides', () => {
  it('applies global position scale', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const clip = retargetToVRM(source, { globalPositionScale: 2.0 });

    const posY = clip.getTracks().find((t) => t.id === 'hips-pos-y')!;
    expect(posY.keyframes[0].value).toBeCloseTo(1.9, 5); // 0.95 * 2
  });

  it('applies per-bone position scale', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig({
      boneOverrides: {
        hips: { positionScale: 0.5 },
      },
    });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    const posY = clip.getTracks().find((t) => t.id === 'hips-pos-y')!;
    expect(posY.keyframes[0].value).toBeCloseTo(0.475, 5); // 0.95 * 0.5
  });

  it('combines global and per-bone scale', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig({
      globalPositionScale: 2.0,
      boneOverrides: {
        hips: { positionScale: 0.5 },
      },
    });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    const posY = clip.getTracks().find((t) => t.id === 'hips-pos-y')!;
    expect(posY.keyframes[0].value).toBeCloseTo(0.95, 5); // 0.95 * 2 * 0.5
  });

  it('skips bones when skip override is set', () => {
    const source = makeSource([WALK_HIPS_ANIMATION, WALK_LEFT_LEG_ANIMATION]);
    const config = vrmRetargetConfig({
      boneOverrides: {
        left_upper_leg: { skip: true },
      },
    });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    const tracks = clip.getTracks();
    expect(tracks.some((t) => t.targetPath === 'leftUpperLeg')).toBe(false);
    expect(tracks.some((t) => t.targetPath === 'hips')).toBe(true);
  });

  it('applies global rotation offset', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig({
      globalRotationOffset: [0, 0, Math.PI / 2],
    });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    // Identity rotation at t=0 should be offset by the global offset
    const rotation = clip.getTracks().find((t) => t.id === 'hips-rot')!;
    expect(asQuaternion(rotation.keyframes[0].value)[3]).toBeCloseTo(Math.cos(Math.PI / 4), 4);
  });

  it('inverts rotation when invertRotation is set', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig({
      boneOverrides: {
        hips: { invertRotation: true },
      },
    });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    const rotation = clip.getTracks().find((t) => t.id === 'hips-rot')!;
    expect(asQuaternion(rotation.keyframes[1].value)[1]).toBeCloseTo(-0.05, 5); // conjugated
  });

  it('allows target bone name override', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig({
      boneOverrides: {
        hips: { targetBoneName: 'customRoot' },
      },
    });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    const posX = clip.getTracks().find((t) => t.id === 'customRoot-pos-x');
    expect(posX).toBeDefined();
    expect(posX!.targetPath).toBe('customRoot');
  });
});

// ---------------------------------------------------------------------------
// Clip Configuration
// ---------------------------------------------------------------------------

describe('clip configuration', () => {
  it('sets loop and speed from config', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig({ loop: true, speed: 1.5 });
    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    expect(clip.isLooping()).toBe(true);
    expect(clip.getSpeed()).toBeCloseTo(1.5, 5);
  });

  it('migrates the legacy slerp config to linear scalars plus quaternion nlerp', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const clip = retargetToVRM(source, { interpolationMode: 'slerp' });

    const scalarTracks = clip.getTracks().filter((track) => track.property !== 'rotation');
    const rotation = clip.getTracks().find((track) => track.property === 'rotation');
    expect(scalarTracks.every((track) => track.interpolation === 'linear')).toBe(true);
    expect(rotation?.interpolation).toBe('nlerp');
  });
});

// ---------------------------------------------------------------------------
// Unmapped / Ignored Bones
// ---------------------------------------------------------------------------

describe('unmapped bones', () => {
  it('ignores Mixamo bones not in MIXAMO_BONE_MAP', () => {
    const unknownBone: MixamoBoneAnimation = {
      mixamoBoneName: 'mixamorig:SomeFinger',
      keyframes: [makeKeyframe(0.0)],
    };
    const source = makeSource([WALK_HIPS_ANIMATION, unknownBone]);
    const clip = retargetToVRM(source);

    const tracks = clip.getTracks();
    expect(tracks.some((t) => t.targetPath === 'SomeFinger')).toBe(false);
    expect(tracks.some((t) => t.targetPath === 'hips')).toBe(true);
  });

  it('ignores bones with no target mapping for the chosen format', () => {
    // spine1 has no VRM mapping (only spine + spine2/chest map)
    const spine1Anim: MixamoBoneAnimation = {
      mixamoBoneName: 'mixamorig:Spine1',
      keyframes: [makeKeyframe(0.0)],
    };
    const source = makeSource([spine1Anim]);
    const clip = retargetToVRM(source);

    expect(clip.getTracks().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scale Tracks
// ---------------------------------------------------------------------------

describe('scale tracks', () => {
  it('omits scale tracks when all scales are identity', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const clip = retargetToVRM(source);

    const scaleTracks = clip.getTracks().filter((t) => t.property === 'scale');
    expect(scaleTracks.length).toBe(0);
  });

  it('emits scale tracks when non-identity scale is present', () => {
    const scaledBone: MixamoBoneAnimation = {
      mixamoBoneName: 'mixamorig:Hips',
      keyframes: [
        makeKeyframe(0.0, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]),
        makeKeyframe(0.5, [0, 0, 0], [0, 0, 0, 1], [1.1, 1, 1]),
      ],
    };
    const source = makeSource([scaledBone]);
    const clip = retargetToVRM(source);

    const scaleTracks = clip.getTracks().filter((t) => t.property === 'scale');
    expect(scaleTracks.length).toBe(3); // x, y, z

    const scaleX = scaleTracks.find((t) => t.component === 'x')!;
    expect(scaleX.keyframes[0].value).toBe(1.0);
    expect(scaleX.keyframes[1].value).toBeCloseTo(1.1, 5);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces identical track values for identical input', () => {
    const source = makeSource([WALK_HIPS_ANIMATION, WALK_LEFT_LEG_ANIMATION]);
    const config = vrmRetargetConfig();

    const retargeterA = new MixamoRetargeter();
    const retargeterB = new MixamoRetargeter();
    const clipA = retargeterA.retarget(source, config);
    const clipB = retargeterB.retarget(source, config);

    expect(clipA.getTrackCount()).toBe(clipB.getTrackCount());

    const tracksA = clipA.getTracks();
    const tracksB = clipB.getTracks();

    for (let i = 0; i < tracksA.length; i++) {
      expect(tracksA[i].id).toBe(tracksB[i].id);
      expect(tracksA[i].keyframes.length).toBe(tracksB[i].keyframes.length);
      for (let j = 0; j < tracksA[i].keyframes.length; j++) {
        expect(tracksA[i].keyframes[j].time).toBe(tracksB[i].keyframes[j].time);
        expect(tracksA[i].keyframes[j].value).toEqual(tracksB[i].keyframes[j].value);
      }
    }
  });

  it('produces deterministic sample() output across runs', () => {
    const source = makeSource([WALK_HIPS_ANIMATION]);
    const config = vrmRetargetConfig();

    const retargeter = new MixamoRetargeter();
    const clip = retargeter.retarget(source, config);

    const sampleA = clip.sample(0.25);
    const sampleB = clip.sample(0.25);

    expect(sampleA.size).toBe(sampleB.size);
    for (const [key, valA] of sampleA) {
      expect(sampleB.get(key)).toEqual(valA);
    }
  });

  it('samples sign-equivalent retargeted quaternions on the shortest arc', () => {
    const orientation: QuaternionValue = [0.2, -0.3, 0.1, 0.9];
    const source = makeSource([
      {
        mixamoBoneName: 'mixamorig:Hips',
        keyframes: [
          makeKeyframe(0, [0, 0, 0], orientation),
          makeKeyframe(1, [0, 0, 0], orientation.map((component) => -component) as QuaternionValue),
        ],
      },
    ]);
    const clip = retargetToVRM(source);

    const start = asQuaternion(clip.sampleValues(0).get('hips.rotation'));
    const midpoint = asQuaternion(clip.sampleValues(0.5).get('hips.rotation'));
    expect(midpoint).toEqual(start);
    expect(quaternionNorm(midpoint)).toBeCloseTo(1, 12);
  });
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

describe('utility functions', () => {
  it('getRetargetableBones returns mapped Mixamo names for VRM', () => {
    const bones = getRetargetableBones('vrm');
    expect(bones).toContain('mixamorig:Hips');
    expect(bones).toContain('mixamorig:LeftArm');
    expect(bones).toContain('mixamorig:Head');
    expect(bones).not.toContain('mixamorig:Spine1'); // no VRM mapping
  });

  it('getRetargetableBones returns mapped Mixamo names for URDF', () => {
    const bones = getRetargetableBones('urdf');
    expect(bones).toContain('mixamorig:Hips');
    expect(bones).toContain('mixamorig:LeftUpLeg');
  });

  it('isRetargetable returns true for mapped bones', () => {
    expect(isRetargetable('mixamorig:Hips', 'vrm')).toBe(true);
    expect(isRetargetable('mixamorig:LeftArm', 'urdf')).toBe(true);
  });

  it('isRetargetable returns false for unmapped bones', () => {
    expect(isRetargetable('mixamorig:Unknown', 'vrm')).toBe(false);
    expect(isRetargetable('mixamorig:Spine1', 'vrm')).toBe(false); // no VRM mapping
  });
});
