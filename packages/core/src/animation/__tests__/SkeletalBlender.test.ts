import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletalBlender } from '../SkeletalBlender';
import type { AnimLayer, AnimPose } from '../SkeletalBlender';

function makePose(boneId: string, tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1): AnimPose {
  return { boneId, tx, ty, tz, sx, sy, sz };
}

function makeLayer(id: string, poses: AnimPose[], weight = 1, mode: 'override' | 'additive' = 'override'): AnimLayer {
  return { id, poses, weight, mode };
}

describe('SkeletalBlender', () => {
  let blender: SkeletalBlender;

  beforeEach(() => { blender = new SkeletalBlender(); });

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  it('addLayer increases layer count', () => {
    blender.addLayer(makeLayer('idle', [makePose('spine')]));
    expect(blender.getLayerCount()).toBe(1);
  });

  it('removeLayer removes by id', () => {
    blender.addLayer(makeLayer('idle', []));
    blender.removeLayer('idle');
    expect(blender.getLayerCount()).toBe(0);
  });

  it('setLayerWeight updates weight', () => {
    blender.addLayer(makeLayer('idle', [], 1));
    blender.setLayerWeight('idle', 0.5);
    expect(blender.getLayerWeight('idle')).toBeCloseTo(0.5);
  });

  it('setLayerWeight clamps to 0-1', () => {
    blender.addLayer(makeLayer('idle', [], 1));
    blender.setLayerWeight('idle', 2);
    expect(blender.getLayerWeight('idle')).toBe(1);
    blender.setLayerWeight('idle', -1);
    expect(blender.getLayerWeight('idle')).toBe(0);
  });

  it('getLayerWeight returns 0 for unknown', () => {
    expect(blender.getLayerWeight('nope')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Blending
  // ---------------------------------------------------------------------------

  it('blend with single override layer returns weighted pose', () => {
    blender.addLayer(makeLayer('idle', [makePose('spine', 1, 2, 3)], 1));
    const result = blender.blend();
    const spine = result.get('spine')!;
    expect(spine.tx).toBeCloseTo(1);
    expect(spine.ty).toBeCloseTo(2);
  });

  it('blend with zero-weight layer skips it', () => {
    blender.addLayer(makeLayer('idle', [makePose('spine', 10, 10, 10)], 0));
    const result = blender.blend();
    expect(result.size).toBe(0);
  });

  it('blend additive layer adds weighted delta', () => {
    blender.addLayer(makeLayer('base', [makePose('spine', 1, 0, 0)], 1, 'override'));
    blender.addLayer(makeLayer('head_bob', [makePose('spine', 0, 0.5, 0)], 1, 'additive'));
    const result = blender.blend();
    const spine = result.get('spine')!;
    // Additive adds translation on top of existing
    expect(spine.tx).toBeCloseTo(1);
    expect(spine.ty).toBeCloseTo(0.5);
  });

  it('blend respects layer mask', () => {
    const mask = new Set(['spine']);
    blender.addLayer({
      id: 'upper',
      poses: [makePose('spine', 1, 0, 0), makePose('hips', 2, 0, 0)],
      weight: 1,
      mode: 'override',
      mask,
    });
    const result = blender.blend();
    expect(result.has('spine')).toBe(true);
    expect(result.has('hips')).toBe(false);
  });

  it('getBlendedPose retrieves last blended pose', () => {
    blender.addLayer(makeLayer('idle', [makePose('spine', 5, 5, 5)], 1));
    blender.blend();
    const pose = blender.getBlendedPose('spine');
    expect(pose).toBeDefined();
    expect(pose!.tx).toBeCloseTo(5);
  });

  it('getBlendedPose returns undefined if not blended', () => {
    expect(blender.getBlendedPose('spine')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Crossfade
  // ---------------------------------------------------------------------------

  it('crossfade adjusts weights of two layers', () => {
    blender.addLayer(makeLayer('idle', [makePose('spine', 0, 0, 0)], 1));
    blender.addLayer(makeLayer('walk', [makePose('spine', 1, 1, 1)], 0));
    blender.crossfade('idle', 'walk', 0.5);
    expect(blender.getLayerWeight('idle')).toBeCloseTo(0.5);
    expect(blender.getLayerWeight('walk')).toBeCloseTo(0.5);
  });

  it('crossfade at t=1 fully transitions', () => {
    blender.addLayer(makeLayer('idle', [], 1));
    blender.addLayer(makeLayer('walk', [], 0));
    blender.crossfade('idle', 'walk', 1);
    expect(blender.getLayerWeight('idle')).toBeCloseTo(0);
    expect(blender.getLayerWeight('walk')).toBeCloseTo(1);
  });
});
