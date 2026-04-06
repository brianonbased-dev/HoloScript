import { describe, it, expect, beforeEach } from 'vitest';
import { BoneSystem } from '@holoscript/engine/animation/BoneSystem';

// =============================================================================
// C258 — Bone System
// =============================================================================

describe('BoneSystem', () => {
  let sys: BoneSystem;
  beforeEach(() => {
    sys = new BoneSystem();
  });

  it('addBone creates bone with defaults', () => {
    sys.addBone('root', 'Root', null);
    const b = sys.getBone('root');
    expect(b).toBeDefined();
    expect(b!.local.rw).toBe(1); // identity quaternion
    expect(b!.local.sx).toBe(1); // unit scale
  });

  it('getBoneCount tracks additions', () => {
    sys.addBone('a', 'A', null);
    sys.addBone('b', 'B', 'a');
    expect(sys.getBoneCount()).toBe(2);
  });

  it('getRoots returns only root bones', () => {
    sys.addBone('root', 'Root', null);
    sys.addBone('child', 'Child', 'root');
    expect(sys.getRoots()).toEqual(['root']);
  });

  it('parent tracks childIds', () => {
    sys.addBone('root', 'Root', null);
    sys.addBone('c1', 'C1', 'root');
    sys.addBone('c2', 'C2', 'root');
    expect(sys.getBone('root')!.childIds).toEqual(['c1', 'c2']);
  });

  it('setLocalTransform updates bone local', () => {
    sys.addBone('root', 'Root', null);
    sys.setLocalTransform('root', { tx: 5 });
    expect(sys.getBone('root')!.local.tx).toBe(5);
  });

  it('updateWorldTransforms propagates to children', () => {
    sys.addBone('root', 'Root', null, { tx: 10 });
    sys.addBone('child', 'Child', 'root', { tx: 3 });
    sys.updateWorldTransforms();
    expect(sys.getBone('child')!.world.tx).toBe(13);
  });

  it('getWorldPosition combines chain', () => {
    sys.addBone('root', 'Root', null, { tx: 1, ty: 2 });
    sys.addBone('mid', 'Mid', 'root', { tx: 3 });
    sys.addBone('leaf', 'Leaf', 'mid', { tx: 5 });
    const pos = sys.getWorldPosition('leaf');
    expect(pos!.x).toBe(9);
    expect(pos!.y).toBe(2);
  });

  it('captureBindPose inverts world transforms', () => {
    sys.addBone('root', 'Root', null, { tx: 10 });
    sys.captureBindPose();
    const b = sys.getBone('root')!;
    expect(b.bindInverse.tx).toBe(-10);
  });

  it('getSkinningMatrix at bind pose is identity-like', () => {
    sys.addBone('root', 'Root', null, { tx: 5 });
    sys.captureBindPose();
    const skin = sys.getSkinningMatrix('root');
    expect(skin!.tx).toBeCloseTo(0);
  });

  it('getChain returns root-to-leaf path', () => {
    sys.addBone('root', 'Root', null);
    sys.addBone('mid', 'Mid', 'root');
    sys.addBone('leaf', 'Leaf', 'mid');
    expect(sys.getChain('leaf')).toEqual(['root', 'mid', 'leaf']);
  });

  it('scale propagates through hierarchy', () => {
    sys.addBone('root', 'Root', null, { sx: 2, sy: 2, sz: 2 });
    sys.addBone('child', 'Child', 'root', { tx: 5 });
    sys.updateWorldTransforms();
    expect(sys.getBone('child')!.world.tx).toBe(10); // 5 * 2
  });
});
