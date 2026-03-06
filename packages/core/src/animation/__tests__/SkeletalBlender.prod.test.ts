/**
 * SkeletalBlender.prod.test.ts
 * Production tests for SkeletalBlender — layer CRUD, override blending,
 * additive blending, bone mask, crossfade, and pose queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletalBlender, AnimLayer, AnimPose } from '../SkeletalBlender';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePose(boneId: string, tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1): AnimPose {
  return { boneId, tx, ty, tz, sx, sy, sz };
}

function makeLayer(
  id: string,
  poses: AnimPose[],
  weight = 1,
  mode: 'override' | 'additive' = 'override',
  mask?: Set<string>,
): AnimLayer {
  return { id, poses, weight, mode, mask };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SkeletalBlender', () => {
  let blender: SkeletalBlender;

  beforeEach(() => {
    blender = new SkeletalBlender();
  });

  // -------------------------------------------------------------------------
  // Layer Management
  // -------------------------------------------------------------------------
  describe('layer management', () => {
    it('starts with zero layers', () => {
      expect(blender.getLayerCount()).toBe(0);
    });

    it('addLayer adds a layer', () => {
      blender.addLayer(makeLayer('base', []));
      expect(blender.getLayerCount()).toBe(1);
    });

    it('removeLayer removes by id', () => {
      blender.addLayer(makeLayer('base', []));
      blender.addLayer(makeLayer('overlay', []));
      blender.removeLayer('base');
      expect(blender.getLayerCount()).toBe(1);
    });

    it('removeLayer is a no-op for missing id', () => {
      blender.addLayer(makeLayer('base', []));
      blender.removeLayer('missing');
      expect(blender.getLayerCount()).toBe(1);
    });

    it('setLayerWeight updates weight', () => {
      blender.addLayer(makeLayer('base', [], 1));
      blender.setLayerWeight('base', 0.5);
      expect(blender.getLayerWeight('base')).toBeCloseTo(0.5, 5);
    });

    it('setLayerWeight clamps to [0, 1]', () => {
      blender.addLayer(makeLayer('base', [], 1));
      blender.setLayerWeight('base', 2);
      expect(blender.getLayerWeight('base')).toBe(1);
      blender.setLayerWeight('base', -1);
      expect(blender.getLayerWeight('base')).toBe(0);
    });

    it('getLayerWeight returns 0 for missing layer', () => {
      expect(blender.getLayerWeight('none')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Override Blending
  // -------------------------------------------------------------------------
  describe('blend() — override mode', () => {
    it('returns empty map when no layers', () => {
      expect(blender.blend().size).toBe(0);
    });

    it('single layer at weight=1 → pose = layer pose (direct)', () => {
      const pose = makePose('Spine', 1, 2, 3);
      blender.addLayer(makeLayer('base', [pose], 1, 'override'));
      const result = blender.blend();
      // override lerps from identity to pose at t=1 → equals pose
      expect(result.get('Spine')!.tx).toBeCloseTo(1, 5);
      expect(result.get('Spine')!.ty).toBeCloseTo(2, 5);
      expect(result.get('Spine')!.tz).toBeCloseTo(3, 5);
    });

    it('weight=0 layer has no effect', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 5, 5, 5)], 0));
      expect(blender.blend().size).toBe(0);
    });

    it('weight=0.5 lerps half-way from identity', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 10, 0, 0)], 0.5, 'override'));
      const result = blender.blend();
      // lerpPose(identity, pose, 0.5) → tx = 0 + (10-0)*0.5 = 5
      expect(result.get('Spine')!.tx).toBeCloseTo(5, 5);
    });

    it('second override layer overwrites first at same weight', () => {
      blender.addLayer(makeLayer('base',    [makePose('Spine', 1, 0, 0)], 1, 'override'));
      blender.addLayer(makeLayer('overlay', [makePose('Spine', 0, 5, 0)], 1, 'override'));
      const result = blender.blend();
      // Second override layer blends from the result of the first
      expect(result.get('Spine')!.ty).toBeCloseTo(5, 5);
    });

    it('multiple bones are blended independently', () => {
      blender.addLayer(makeLayer('base', [
        makePose('Spine', 1, 0, 0),
        makePose('Head',  0, 2, 0),
      ], 1, 'override'));
      const result = blender.blend();
      expect(result.get('Spine')!.tx).toBeCloseTo(1, 5);
      expect(result.get('Head')!.ty).toBeCloseTo(2, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Additive Blending
  // -------------------------------------------------------------------------
  describe('blend() — additive mode', () => {
    it('adds weighted pose delta on top of existing', () => {
      // First layer sets Spine to tx=2
      blender.addLayer(makeLayer('base',  [makePose('Spine', 2, 0, 0)], 1, 'override'));
      // Second layer adds tx=3 at weight=0.5 → adds 1.5
      blender.addLayer(makeLayer('extra', [makePose('Spine', 3, 0, 0)], 0.5, 'additive'));
      const result = blender.blend();
      expect(result.get('Spine')!.tx).toBeCloseTo(2 + 3 * 0.5, 5);
    });

    it('scale is multiplicatively blended in additive mode', () => {
      blender.addLayer(makeLayer('base',  [makePose('Spine', 0, 0, 0, 1, 1, 1)], 1, 'override'));
      blender.addLayer(makeLayer('scale', [makePose('Spine', 0, 0, 0, 2, 2, 2)], 0.5, 'additive'));
      const result = blender.blend();
      // sx = 1 * (1 + (2-1)*0.5) = 1.5
      expect(result.get('Spine')!.sx).toBeCloseTo(1.5, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Bone Mask
  // -------------------------------------------------------------------------
  describe('bone mask', () => {
    it('masked layer only affects bones in the mask', () => {
      blender.addLayer(makeLayer('base',    [makePose('Spine', 1, 0, 0), makePose('Head', 2, 0, 0)], 1, 'override'));
      blender.addLayer(makeLayer('masked',  [makePose('Head', 10, 0, 0)], 1, 'override', new Set(['Head'])));
      const result = blender.blend();
      // Spine should come from base only (tx=1)
      expect(result.get('Spine')!.tx).toBeCloseTo(1, 5);
      // Head should have been overridden by masked layer (tx=10)
      expect(result.get('Head')!.tx).toBeCloseTo(10, 5);
    });

    it('masked layer skips bones not in the mask', () => {
      blender.addLayer(makeLayer('overlay', [makePose('Spine', 9, 0, 0)], 1, 'override', new Set(['Head'])));
      const result = blender.blend();
      // Spine is not in mask → not affected
      expect(result.get('Spine')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Crossfade
  // -------------------------------------------------------------------------
  describe('crossfade()', () => {
    it('sets from weight = 1-t and to weight = t', () => {
      blender.addLayer(makeLayer('idle', []));
      blender.addLayer(makeLayer('walk', []));
      blender.crossfade('idle', 'walk', 0.3);
      expect(blender.getLayerWeight('idle')).toBeCloseTo(0.7, 5);
      expect(blender.getLayerWeight('walk')).toBeCloseTo(0.3, 5);
    });

    it('t=1 fully transitions to the to-layer', () => {
      blender.addLayer(makeLayer('idle', []));
      blender.addLayer(makeLayer('run',  []));
      blender.crossfade('idle', 'run', 1);
      expect(blender.getLayerWeight('idle')).toBe(0);
      expect(blender.getLayerWeight('run')).toBe(1);
    });

    it('t=0 keeps from-layer at full weight', () => {
      blender.addLayer(makeLayer('idle', []));
      blender.addLayer(makeLayer('run',  []));
      blender.crossfade('idle', 'run', 0);
      expect(blender.getLayerWeight('idle')).toBe(1);
      expect(blender.getLayerWeight('run')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getBlendedPose
  // -------------------------------------------------------------------------
  describe('getBlendedPose()', () => {
    it('returns undefined before any blend() call', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 1, 0, 0)]));
      // blend() not yet called
      expect(blender.getBlendedPose('Spine')).toBeUndefined();
    });

    it('returns the pose after blend()', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 1, 2, 3)], 1));
      blender.blend();
      const pose = blender.getBlendedPose('Spine');
      expect(pose).not.toBeUndefined();
      expect(pose!.tx).toBeCloseTo(1, 5);
    });

    it('returns undefined for bone not in any layer', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 1, 0, 0)], 1));
      blender.blend();
      expect(blender.getBlendedPose('NonExistentBone')).toBeUndefined();
    });

    it('blend() clears previous blended poses', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 1, 0, 0)], 1));
      blender.blend();
      blender.removeLayer('base');
      blender.blend();
      expect(blender.getBlendedPose('Spine')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('empty layer contributes nothing', () => {
      blender.addLayer(makeLayer('empty', [], 1));
      expect(blender.blend().size).toBe(0);
    });

    it('layer with single bone produces one result', () => {
      blender.addLayer(makeLayer('single', [makePose('Head', 0, 1, 0)], 1));
      const result = blender.blend();
      expect(result.size).toBe(1);
      expect(result.has('Head')).toBe(true);
    });

    it('blend returns a new Map each call', () => {
      blender.addLayer(makeLayer('base', [makePose('Spine', 1, 0, 0)], 1));
      const r1 = blender.blend();
      const r2 = blender.blend();
      expect(r1).not.toBe(r2);
    });
  });
});
