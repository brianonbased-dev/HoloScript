import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AnimClip } from '../../../AnimationClip';
import {
  AnimationEngine,
  type AnimationClip as ScalarAnimationClip,
} from '../../../AnimationEngine';
import { BoneSystem } from '../../../BoneSystem';
import {
  runPaper6RuntimePoseBenchmark,
  runPaper6RuntimePoseFixture,
} from '../p6-runtime-pose-publication';

const artifact = runPaper6RuntimePoseBenchmark();
const packageReceiptText = readFileSync(
  new URL('../../../../../.bench-logs/paper-6-runtime-pose-publication.json', import.meta.url),
  'utf8'
);
const frozenArtifact = JSON.parse(packageReceiptText);

describe('paper-6 fixed runtime pose publication path', () => {
  it('drives retargeted quaternion tracks through engine playback and hierarchy composition', () => {
    expect(artifact.runtime_path).toEqual([
      'MixamoRetargeter.retarget',
      'AnimationEngine.playSkeletal/update',
      'AnimClip.sampleValues',
      'BoneSystem.applyLocalTransforms/updateWorldTransforms',
    ]);
    expect(artifact.fixture).toMatchObject({
      topology: 'hips -> leftUpperLeg -> leftLowerLeg',
      bone_order: ['hips', 'leftUpperLeg', 'leftLowerLeg'],
      sample_time_seconds: 0.5,
      encoding: 'IEEE-754 binary32 little-endian',
      pose_bytes: 240,
      hierarchy_scope: 'compact TRS with identity scale; no shear',
    });

    const upperWorld = artifact.expected_pose.leftUpperLeg.world;
    expect([upperWorld.tx, upperWorld.ty, upperWorld.tz]).toEqual([0, 2, 3]);
    expect([upperWorld.rx, upperWorld.ry, upperWorld.rz, upperWorld.rw]).toEqual([
      0.5, 0.5, 0.5, 0.5,
    ]);

    const lowerWorld = artifact.expected_pose.leftLowerLeg.world;
    expect([lowerWorld.tx, lowerWorld.ty, lowerWorld.tz]).toEqual([0, 2, 4]);
    expect([lowerWorld.rx, lowerWorld.ry, lowerWorld.rz, lowerWorld.rw]).toEqual([
      0.5, 0.5, 0.5, 0.5,
    ]);
  });

  it('pins same-process convergence and a discriminating parent-rotation control', () => {
    expect(artifact.verification).toMatchObject({
      expected_pose_asserted: true,
      repeat_runs: 3,
      unique_pose_hashes: 1,
      negative_control: 'root rotation removed',
      negative_control_diverged: true,
      negative_control_child_world_position_changed: true,
      negative_control_child_world_rotation_changed: true,
    });
    expect(artifact.verification.pose_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifact.verification.negative_control_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(artifact.verification.pose_hash).toBe(
      'sha256:cd6baaf5651417328c9b89ca25050e87f71e5730dc89ad159e31243d7a88e84d'
    );
    expect(artifact.verification.negative_control_hash).toBe(
      'sha256:aae123fed6147980637becae80a5f7d03ddbfe6756920e0a9811005a57d97979'
    );
    expect(artifact.verification.negative_control_hash).not.toBe(artifact.verification.pose_hash);

    const canonical = runPaper6RuntimePoseFixture();
    const control = runPaper6RuntimePoseFixture(true);
    expect(canonical.poseHash).toBe(artifact.verification.pose_hash);
    expect(control.poseHash).toBe(artifact.verification.negative_control_hash);
  });

  it('records the non-claims beside the positive evidence', () => {
    expect(artifact.claims).toEqual({
      same_process_fixed_fixture_pose_identity: true,
      quaternion_nlerp_local_sampling: true,
      hamilton_parent_child_rotation: true,
      parent_rotated_child_offsets: true,
      rendered: false,
      skinning_palette_verified: false,
      general_rig_or_nonuniform_scale_guarantee: false,
      independent_engine_or_implementation: false,
      gpu_or_wgsl: false,
      cross_browser_vendor_or_machine_identity: false,
      slerp: false,
      minimax_slerp: false,
    });
  });

  it('keeps strict pose application atomic when a mapped target is missing', () => {
    const clip = new AnimClip('strict-pose', 'Strict pose', 1);
    clip.addTrack({
      id: 'root-x',
      targetPath: 'root',
      property: 'position',
      component: 'x',
      interpolation: 'linear',
      keyframes: [
        { time: 0, value: 2 },
        { time: 1, value: 4 },
      ],
    });
    clip.addTrack({
      id: 'missing-rotation',
      targetPath: 'missing',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [
        { time: 0, value: [0, 0, 0, 1] },
        { time: 1, value: [0, 0, 1, 0] },
      ],
    });

    const bones = new BoneSystem();
    bones.addBone('root', 'root', null, { tx: 7 });
    const engine = new AnimationEngine();

    expect(() => engine.applySkeletalPose(clip, bones, 0.5)).toThrow(
      'missing bone targets: missing'
    );
    expect(bones.getBone('root')?.local.tx).toBe(7);
  });

  it('reports skipped targets in explicit non-strict mode', () => {
    const clip = new AnimClip('partial-pose', 'Partial pose', 1);
    clip.addTrack({
      id: 'known-scale-x',
      targetPath: 'source-root',
      property: 'scale',
      component: 'x',
      interpolation: 'linear',
      keyframes: [{ time: 0, value: 2 }],
    });
    clip.addTrack({
      id: 'unknown-x',
      targetPath: 'unknown',
      property: 'position',
      component: 'x',
      interpolation: 'linear',
      keyframes: [{ time: 0, value: 10 }],
    });

    const bones = new BoneSystem();
    bones.addBone('root', 'root', null);
    const result = new AnimationEngine().applySkeletalPose(clip, bones, 0, {
      strict: false,
      resolveBoneId: (targetPath) => (targetPath === 'source-root' ? 'root' : undefined),
    });

    expect(result).toMatchObject({
      appliedTracks: 1,
      updatedBoneIds: ['root'],
      missingTargets: ['unknown'],
      unsupportedTrackIds: [],
    });
    expect(bones.getBone('root')?.local.sx).toBe(2);
  });

  it('rejects legacy component rotations without leaving a partial quaternion', () => {
    const clip = new AnimClip('component-rotation', 'Component rotation', 1);
    clip.addTrack({
      id: 'root-rotation-w',
      targetPath: 'root',
      property: 'rotation',
      component: 'w',
      interpolation: 'linear',
      keyframes: [{ time: 0, value: 0 }],
    });
    const bones = new BoneSystem();
    bones.addBone('root', 'root', null);

    expect(() => new AnimationEngine().applySkeletalPose(clip, bones, 0)).toThrow(
      'unsupported pose tracks: root-rotation-w'
    );
    expect(bones.getBone('root')?.local).toMatchObject({ rx: 0, ry: 0, rz: 0, rw: 1 });
  });

  it('rolls back a batch when hierarchy validation rejects one transform', () => {
    const bones = new BoneSystem();
    bones.addBone('root', 'root', null, { tx: 1 });
    bones.addBone('child', 'child', 'root', { ty: 1 });
    bones.updateWorldTransforms();
    const before = JSON.stringify({
      root: bones.getBone('root'),
      child: bones.getBone('child'),
    });

    expect(() =>
      bones.applyLocalTransforms(
        new Map([
          ['root', { tx: 9 }],
          ['child', { rx: 0, ry: 0, rz: 0, rw: 0 }],
        ])
      )
    ).toThrow('Bone rotation must be a finite non-zero quaternion');

    expect(
      JSON.stringify({
        root: bones.getBone('root'),
        child: bones.getBone('child'),
      })
    ).toBe(before);
  });

  it('honors pause, resume, completion, and the existing scalar path', () => {
    const clip = new AnimClip('skeletal-lifecycle', 'Skeletal lifecycle', 1);
    clip.addTrack({
      id: 'root-rotation',
      targetPath: 'root',
      property: 'rotation',
      interpolation: 'nlerp',
      keyframes: [
        { time: 0, value: [0, 0, 0, 1] },
        { time: 1, value: [0, 0, 1, 0] },
      ],
    });
    const bones = new BoneSystem();
    bones.addBone('root', 'root', null);
    const onComplete = vi.fn();
    const engine = new AnimationEngine();
    engine.playSkeletal(clip, bones, { onComplete });
    engine.pause(clip.id);
    engine.update(0.5);
    expect(bones.getBone('root')?.local.rz).toBe(0);
    engine.resume(clip.id);
    engine.update(0.5);
    expect(bones.getBone('root')?.local.rz).toBeCloseTo(Math.SQRT1_2, 12);
    expect(engine.isActive(clip.id)).toBe(true);
    engine.update(0.5);
    expect(engine.isActive(clip.id)).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const scalarClip: ScalarAnimationClip = {
      id: 'scalar-regression',
      property: 'opacity',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 10 },
      ],
      duration: 1,
      loop: false,
      pingPong: false,
      delay: 0,
    };
    const setter = vi.fn();
    engine.play(scalarClip, setter);
    engine.update(0.5);
    expect(setter).toHaveBeenLastCalledWith(5);
    engine.update(0.5);
    expect(engine.isActive(scalarClip.id)).toBe(false);
  });

  it('keeps the captured rotated bind pose at an identity skinning transform', () => {
    const bones = new BoneSystem();
    bones.addBone('root', 'root', null, {
      tx: 1,
      ty: 2,
      tz: 3,
      rz: Math.SQRT1_2,
      rw: Math.SQRT1_2,
    });
    bones.addBone('child', 'child', 'root', {
      ty: 1,
      rx: Math.SQRT1_2,
      rw: Math.SQRT1_2,
    });
    bones.captureBindPose();

    for (const boneId of ['root', 'child']) {
      const skinning = bones.getSkinningMatrix(boneId);
      expect(skinning).not.toBeNull();
      for (const value of [
        skinning!.tx,
        skinning!.ty,
        skinning!.tz,
        skinning!.rx,
        skinning!.ry,
        skinning!.rz,
      ]) {
        expect(value).toBeCloseTo(0, 12);
      }
      expect(skinning!.rw).toBeCloseTo(1, 12);
      expect([skinning!.sx, skinning!.sy, skinning!.sz]).toEqual([1, 1, 1]);
    }
  });

  it('pins the committed package receipt to the live semantic result', () => {
    expect(frozenArtifact).toMatchObject({
      schema_version: 'paper-6-runtime-pose-v1',
      benchmark: 'paper-6-runtime-pose-publication',
      runtime_path: artifact.runtime_path,
      fixture: {
        pose_bytes: 240,
        hierarchy_scope: 'compact TRS with identity scale; no shear',
      },
      verification: {
        repeat_runs: 3,
        unique_pose_hashes: 1,
        pose_hash: artifact.verification.pose_hash,
        negative_control_hash: artifact.verification.negative_control_hash,
      },
      claims: artifact.claims,
    });
  });
});
