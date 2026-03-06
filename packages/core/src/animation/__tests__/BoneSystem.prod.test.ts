/**
 * BoneSystem.prod.test.ts
 * Production tests for BoneSystem — bone CRUD, hierarchy, world transforms,
 * bind pose, skinning matrix, chain queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BoneSystem } from '../BoneSystem';

describe('BoneSystem', () => {
  let bs: BoneSystem;

  beforeEach(() => {
    bs = new BoneSystem();
  });

  // -------------------------------------------------------------------------
  // Bone Management
  // -------------------------------------------------------------------------
  describe('addBone() / getBone()', () => {
    it('starts empty', () => {
      expect(bs.getBoneCount()).toBe(0);
    });

    it('addBone increases count', () => {
      bs.addBone('root', 'Root', null);
      expect(bs.getBoneCount()).toBe(1);
    });

    it('getBone retrieves the bone', () => {
      bs.addBone('hip', 'Hip', null, { tx: 1, ty: 2, tz: 3 });
      const bone = bs.getBone('hip');
      expect(bone).toBeDefined();
      expect(bone!.name).toBe('Hip');
      expect(bone!.local.tx).toBe(1);
      expect(bone!.local.ty).toBe(2);
    });

    it('unfound bone returns undefined', () => {
      expect(bs.getBone('missing')).toBeUndefined();
    });

    it('default local transform has identity scale', () => {
      bs.addBone('root', 'Root', null);
      const b = bs.getBone('root')!;
      expect(b.local.sx).toBe(1);
      expect(b.local.sy).toBe(1);
      expect(b.local.sz).toBe(1);
    });

    it('default local transform has identity quaternion', () => {
      bs.addBone('root', 'Root', null);
      const b = bs.getBone('root')!;
      expect(b.local.rw).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Hierarchy
  // -------------------------------------------------------------------------
  describe('hierarchy', () => {
    it('root bone has no parent', () => {
      bs.addBone('root', 'Root', null);
      expect(bs.getBone('root')!.parentId).toBeNull();
    });

    it('child bone has parentId set', () => {
      bs.addBone('root', 'Root', null);
      bs.addBone('spine', 'Spine', 'root');
      expect(bs.getBone('spine')!.parentId).toBe('root');
    });

    it('parent lists child in childIds', () => {
      bs.addBone('root', 'Root', null);
      bs.addBone('spine', 'Spine', 'root');
      expect(bs.getBone('root')!.childIds).toContain('spine');
    });

    it('multiple children are all listed', () => {
      bs.addBone('root', 'Root', null);
      bs.addBone('left', 'Left', 'root');
      bs.addBone('right', 'Right', 'root');
      const children = bs.getBone('root')!.childIds;
      expect(children).toContain('left');
      expect(children).toContain('right');
      expect(children.length).toBe(2);
    });

    it('getRoots returns only root bones', () => {
      bs.addBone('root', 'Root', null);
      bs.addBone('root2', 'Root2', null);
      bs.addBone('child', 'Child', 'root');
      const roots = bs.getRoots();
      expect(roots).toContain('root');
      expect(roots).toContain('root2');
      expect(roots).not.toContain('child');
    });
  });

  // -------------------------------------------------------------------------
  // World Transform Update
  // -------------------------------------------------------------------------
  describe('updateWorldTransforms()', () => {
    it('root world transform equals local transform', () => {
      bs.addBone('root', 'Root', null, { tx: 5, ty: 3, tz: 2 });
      bs.updateWorldTransforms();
      const b = bs.getBone('root')!;
      expect(b.world.tx).toBe(5);
      expect(b.world.ty).toBe(3);
    });

    it('child world position is parent.world + child.local * parent.scale', () => {
      bs.addBone('root', 'Root', null, { tx: 0, ty: 10, tz: 0, sx: 1, sy: 1, sz: 1 });
      bs.addBone('spine', 'Spine', 'root', { tx: 0, ty: 5, tz: 0 });
      bs.updateWorldTransforms();
      const spine = bs.getBone('spine')!;
      // parent.ty=10, child.local.ty=5 → world.ty = 10 + 5*1 = 15
      expect(spine.world.ty).toBeCloseTo(15, 5);
    });

    it('scale propagates through the chain', () => {
      bs.addBone('root', 'Root', null, { sx: 2, sy: 2, sz: 2 });
      bs.addBone('child', 'Child', 'root', { tx: 3, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 });
      bs.updateWorldTransforms();
      const child = bs.getBone('child')!;
      // tx = parent.tx(0) + child.local.tx(3) * parent.sx(2) = 6
      expect(child.world.tx).toBeCloseTo(6, 5);
      // sx = parent.sx(2) * child.sx(1) = 2
      expect(child.world.sx).toBeCloseTo(2, 5);
    });

    it('dirty flag prevents re-update until transform changes', () => {
      bs.addBone('root', 'Root', null, { ty: 5 });
      bs.updateWorldTransforms();
      bs.updateWorldTransforms(); // should be no-op (dirty=false)
      expect(bs.getBone('root')!.world.ty).toBe(5);
    });

    it('setLocalTransform marks dirty and recalculates', () => {
      bs.addBone('root', 'Root', null, { ty: 5 });
      bs.updateWorldTransforms();
      bs.setLocalTransform('root', { ty: 99 });
      bs.updateWorldTransforms();
      expect(bs.getBone('root')!.world.ty).toBe(99);
    });
  });

  // -------------------------------------------------------------------------
  // Bind Pose & Skinning
  // -------------------------------------------------------------------------
  describe('captureBindPose() / getSkinningMatrix()', () => {
    it('getSkinningMatrix returns null for unknown bone', () => {
      expect(bs.getSkinningMatrix('missing')).toBeNull();
    });

    it('skinning matrix at bind pose is identity (tx=0, scale=1)', () => {
      bs.addBone('root', 'Root', null, { tx: 5, ty: 0, tz: 0 });
      bs.captureBindPose();
      const mat = bs.getSkinningMatrix('root')!;
      // world(5) combine with bindInverse(-5) → tx ≈ 0
      expect(mat.tx).toBeCloseTo(0, 5);
    });

    it('skinning matrix after moving bone is non-zero', () => {
      bs.addBone('root', 'Root', null, { tx: 0 });
      bs.captureBindPose();
      bs.setLocalTransform('root', { tx: 10 });
      bs.updateWorldTransforms();
      const mat = bs.getSkinningMatrix('root')!;
      // world(10) * bindInverse(tx=-0, scale=1) → tx = 10 + 0*isx = 10
      expect(mat.tx).toBeCloseTo(10, 5);
    });
  });

  // -------------------------------------------------------------------------
  // World Position Query
  // -------------------------------------------------------------------------
  describe('getWorldPosition()', () => {
    it('returns null for unknown bone', () => {
      expect(bs.getWorldPosition('missing')).toBeNull();
    });

    it('returns world position after update', () => {
      bs.addBone('root', 'Root', null, { tx: 3, ty: 7, tz: 2 });
      const pos = bs.getWorldPosition('root');
      expect(pos).not.toBeNull();
      expect(pos!.x).toBeCloseTo(3, 5);
      expect(pos!.y).toBeCloseTo(7, 5);
      expect(pos!.z).toBeCloseTo(2, 5);
    });

    it('child world position accounts for parent transform', () => {
      bs.addBone('root', 'Root', null, { tx: 10, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 });
      bs.addBone('child', 'Child', 'root', { tx: 5, ty: 0, tz: 0 });
      const pos = bs.getWorldPosition('child');
      expect(pos!.x).toBeCloseTo(15, 5);
    });
  });

  // -------------------------------------------------------------------------
  // getChain
  // -------------------------------------------------------------------------
  describe('getChain()', () => {
    it('single root bone returns [root]', () => {
      bs.addBone('root', 'Root', null);
      expect(bs.getChain('root')).toEqual(['root']);
    });

    it('chain from leaf to root is in root-first order', () => {
      bs.addBone('root', 'Root', null);
      bs.addBone('spine', 'Spine', 'root');
      bs.addBone('head', 'Head', 'spine');
      expect(bs.getChain('head')).toEqual(['root', 'spine', 'head']);
    });

    it('3-bone chain has length 3', () => {
      bs.addBone('root', 'Root', null);
      bs.addBone('mid', 'Mid', 'root');
      bs.addBone('tip', 'Tip', 'mid');
      expect(bs.getChain('tip')).toHaveLength(3);
    });

    it('returns array with just the id for unknown bone', () => {
      // getChain walks up from leafId; if the bone has no entry the loop
      // advances current to an empty string (falsy) and exits after adding the id.
      expect(bs.getChain('missing')).toEqual(['missing']);
    });
  });

  // -------------------------------------------------------------------------
  // setLocalTransform
  // -------------------------------------------------------------------------
  describe('setLocalTransform()', () => {
    it('is a no-op for missing bone', () => {
      expect(() => bs.setLocalTransform('missing', { tx: 5 })).not.toThrow();
    });

    it('does partial update (only specified fields change)', () => {
      bs.addBone('root', 'Root', null, { tx: 1, ty: 2 });
      bs.setLocalTransform('root', { tx: 99 });
      const b = bs.getBone('root')!;
      expect(b.local.tx).toBe(99);
      expect(b.local.ty).toBe(2); // unchanged
    });
  });
});
