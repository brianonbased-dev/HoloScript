import { describe, it, expect } from 'vitest';
import { BoneSystem } from '@holoscript/engine/animation/BoneSystem';
import { SkeletalBlender, type AnimPose } from '@holoscript/engine/animation/SkeletalBlender';
import { MorphTargetSystem } from '@holoscript/engine/animation/MorphTargets';

describe('Cycle 156: Skeletal Animation', () => {
  // -------------------------------------------------------------------------
  // BoneSystem
  // -------------------------------------------------------------------------

  it('should compute world positions through bone chain', () => {
    const bones = new BoneSystem();
    bones.addBone('hip', 'Hip', null, { tx: 0, ty: 5, tz: 0 });
    bones.addBone('spine', 'Spine', 'hip', { tx: 0, ty: 3, tz: 0 });
    bones.addBone('head', 'Head', 'spine', { tx: 0, ty: 2, tz: 0 });

    const headPos = bones.getWorldPosition('head')!;
    expect(headPos.y).toBe(10); // 5 + 3 + 2
  });

  it('should capture bind pose and compute skinning matrix', () => {
    const bones = new BoneSystem();
    bones.addBone('root', 'Root', null, { tx: 10, ty: 0, tz: 0 });
    bones.captureBindPose();

    // Move the bone
    bones.setLocalTransform('root', { tx: 20 });
    const skin = bones.getSkinningMatrix('root')!;
    // Skinning matrix = world * bindInverse → should show the delta
    expect(skin.tx).toBe(10); // 20 + (-10)
  });

  // -------------------------------------------------------------------------
  // SkeletalBlender
  // -------------------------------------------------------------------------

  it('should blend override layers by weight', () => {
    const blender = new SkeletalBlender();

    blender.addLayer({
      id: 'idle',
      weight: 0.5,
      mode: 'override',
      poses: [{ boneId: 'arm', tx: 0, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 }],
    });
    blender.addLayer({
      id: 'wave',
      weight: 1.0,
      mode: 'override',
      poses: [{ boneId: 'arm', tx: 10, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 }],
    });

    const result = blender.blend();
    const arm = result.get('arm')!;
    expect(arm.tx).toBe(10); // wave overrides at weight 1.0
  });

  it('should apply additive blending', () => {
    const blender = new SkeletalBlender();

    blender.addLayer({
      id: 'base',
      weight: 1.0,
      mode: 'override',
      poses: [{ boneId: 'leg', tx: 5, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 }],
    });
    blender.addLayer({
      id: 'flinch',
      weight: 0.5,
      mode: 'additive',
      poses: [{ boneId: 'leg', tx: 4, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 }],
    });

    const result = blender.blend();
    const leg = result.get('leg')!;
    expect(leg.tx).toBe(7); // 5 + 4 * 0.5
  });

  // -------------------------------------------------------------------------
  // MorphTargets
  // -------------------------------------------------------------------------

  it('should deform vertices with morph targets', () => {
    const morph = new MorphTargetSystem(3);
    // 3 vertices × 3 floats
    const base = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);

    morph.addTarget('smile', [
      { vertexIndex: 0, dx: 0, dy: 1, dz: 0 },
      { vertexIndex: 2, dx: 0, dy: -1, dz: 0 },
    ]);
    morph.setWeight('smile', 0.5);

    const deformed = morph.computeDeformedPositions(base);
    expect(deformed[1]).toBeCloseTo(0.5); // vertex 0 y += 1 * 0.5
    expect(deformed[7]).toBeCloseTo(-0.5); // vertex 2 y += -1 * 0.5
  });

  it('should apply presets and list active targets', () => {
    const morph = new MorphTargetSystem(10);
    morph.addTarget('happy', []);
    morph.addTarget('sad', []);

    morph.addPreset(
      'emotion_happy',
      new Map([
        ['happy', 1.0],
        ['sad', 0.0],
      ])
    );
    morph.applyPreset('emotion_happy');

    expect(morph.getWeight('happy')).toBe(1.0);
    expect(morph.getWeight('sad')).toBe(0.0);
    expect(morph.getActiveTargets()).toEqual(['happy']);
  });
});
