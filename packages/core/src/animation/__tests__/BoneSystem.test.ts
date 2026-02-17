import { describe, it, expect, beforeEach } from 'vitest';
import { BoneSystem } from '../BoneSystem';

describe('BoneSystem', () => {
  let bs: BoneSystem;

  beforeEach(() => { bs = new BoneSystem(); });

  // Bone management
  it('addBone creates bone with defaults', () => {
    bs.addBone('root', 'Root', null);
    expect(bs.getBoneCount()).toBe(1);
    const bone = bs.getBone('root')!;
    expect(bone.name).toBe('Root');
    expect(bone.parentId).toBeNull();
  });

  it('addBone with parent links child', () => {
    bs.addBone('root', 'Root', null);
    bs.addBone('spine', 'Spine', 'root', { ty: 1 });
    const root = bs.getBone('root')!;
    expect(root.childIds).toContain('spine');
    expect(bs.getBone('spine')!.parentId).toBe('root');
  });

  it('getRoots returns root bones', () => {
    bs.addBone('r1', 'A', null);
    bs.addBone('r2', 'B', null);
    expect(bs.getRoots().length).toBe(2);
  });

  // Local transform
  it('setLocalTransform updates bone', () => {
    bs.addBone('root', 'Root', null);
    bs.setLocalTransform('root', { tx: 5, ty: 10 });
    const bone = bs.getBone('root')!;
    expect(bone.local.tx).toBe(5);
    expect(bone.local.ty).toBe(10);
  });

  // World transforms
  it('updateWorldTransforms propagates to children', () => {
    bs.addBone('root', 'Root', null, { tx: 10 });
    bs.addBone('child', 'Child', 'root', { tx: 5 });
    bs.updateWorldTransforms();
    const child = bs.getBone('child')!;
    expect(child.world.tx).toBe(15); // 10 + 5 * sx(1)
  });

  it('updateWorldTransforms handles scale', () => {
    bs.addBone('root', 'Root', null, { sx: 2, sy: 2, sz: 2 });
    bs.addBone('child', 'Child', 'root', { tx: 5 });
    bs.updateWorldTransforms();
    expect(bs.getBone('child')!.world.tx).toBe(10); // 0 + 5 * 2
  });

  // Bind pose
  it('captureBindPose stores inverse', () => {
    bs.addBone('root', 'Root', null, { tx: 5 });
    bs.captureBindPose();
    const bone = bs.getBone('root')!;
    expect(bone.bindInverse.tx).toBeCloseTo(-5);
  });

  // Skinning matrix
  it('getSkinningMatrix returns identity at bind pose', () => {
    bs.addBone('root', 'Root', null, { tx: 10 });
    bs.captureBindPose();
    const skinning = bs.getSkinningMatrix('root')!;
    // world * bindInverse: (10 + (-10)*1) = 0
    expect(skinning.tx).toBeCloseTo(0);
  });

  it('getSkinningMatrix reflects movement from bind', () => {
    bs.addBone('root', 'Root', null, { tx: 10 });
    bs.captureBindPose();
    bs.setLocalTransform('root', { tx: 15 });
    const skinning = bs.getSkinningMatrix('root')!;
    expect(skinning.tx).toBeCloseTo(5); // 15 + (-10) = 5
  });

  it('getSkinningMatrix returns null for unknown', () => {
    expect(bs.getSkinningMatrix('nope')).toBeNull();
  });

  // World position
  it('getWorldPosition returns world-space coords', () => {
    bs.addBone('root', 'Root', null, { tx: 1, ty: 2, tz: 3 });
    const pos = bs.getWorldPosition('root')!;
    expect(pos.x).toBe(1);
    expect(pos.y).toBe(2);
    expect(pos.z).toBe(3);
  });

  it('getWorldPosition returns null for unknown', () => {
    expect(bs.getWorldPosition('nope')).toBeNull();
  });

  // Chain
  it('getChain returns root-to-leaf path', () => {
    bs.addBone('root', 'Root', null);
    bs.addBone('spine', 'Spine', 'root');
    bs.addBone('head', 'Head', 'spine');
    const chain = bs.getChain('head');
    expect(chain).toEqual(['root', 'spine', 'head']);
  });
});
