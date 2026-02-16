import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletalBlender, type AnimLayer, type AnimPose } from '../animation/SkeletalBlender';

// =============================================================================
// C296 — Skeletal Blender
// =============================================================================

function pose(boneId: string, tx = 0, ty = 0, tz = 0, sx = 1, sy = 1, sz = 1): AnimPose {
  return { boneId, tx, ty, tz, sx, sy, sz };
}

function layer(id: string, poses: AnimPose[], weight = 1, mode: 'override' | 'additive' = 'override', mask?: Set<string>): AnimLayer {
  return { id, poses, weight, mode, mask };
}

describe('SkeletalBlender', () => {
  let blender: SkeletalBlender;
  beforeEach(() => { blender = new SkeletalBlender(); });

  it('single layer override at weight=1 yields exact pose', () => {
    blender.addLayer(layer('idle', [pose('hip', 1, 2, 3)]));
    const out = blender.blend();
    expect(out.get('hip')?.tx).toBeCloseTo(1);
    expect(out.get('hip')?.ty).toBeCloseTo(2);
  });

  it('override at weight=0.5 lerps from identity', () => {
    blender.addLayer(layer('walk', [pose('hip', 4, 0, 0)], 0.5));
    const out = blender.blend();
    expect(out.get('hip')?.tx).toBeCloseTo(2); // lerp(0,4,0.5)
  });

  it('additive layer adds weighted delta on top', () => {
    blender.addLayer(layer('base', [pose('hip', 2, 0, 0)]));
    blender.addLayer(layer('add', [pose('hip', 1, 0, 0)], 1, 'additive'));
    const out = blender.blend();
    expect(out.get('hip')?.tx).toBeCloseTo(3);
  });

  it('additive scale multiplies (1 + (s-1)*w)', () => {
    blender.addLayer(layer('base', [pose('hip', 0, 0, 0, 2, 2, 2)]));
    blender.addLayer(layer('add', [pose('hip', 0, 0, 0, 3, 3, 3)], 0.5, 'additive'));
    const out = blender.blend();
    // base.sx * (1 + (3-1)*0.5) = 2 * 2 = 4
    expect(out.get('hip')?.sx).toBeCloseTo(4);
  });

  it('mask restricts layer to specific bones', () => {
    blender.addLayer(layer('full', [pose('hip', 1, 0, 0), pose('arm', 2, 0, 0)]));
    blender.addLayer(layer('arm_only', [pose('hip', 10, 0, 0), pose('arm', 10, 0, 0)], 1, 'override', new Set(['arm'])));
    const out = blender.blend();
    expect(out.get('hip')?.tx).toBeCloseTo(1); // untouched by masked layer
    expect(out.get('arm')?.tx).toBeCloseTo(10);
  });

  it('setLayerWeight clamps 0-1', () => {
    blender.addLayer(layer('x', [], 0.5));
    blender.setLayerWeight('x', 2);
    expect(blender.getLayerWeight('x')).toBe(1);
    blender.setLayerWeight('x', -1);
    expect(blender.getLayerWeight('x')).toBe(0);
  });

  it('removeLayer removes by id', () => {
    blender.addLayer(layer('a', []));
    blender.addLayer(layer('b', []));
    blender.removeLayer('a');
    expect(blender.getLayerCount()).toBe(1);
  });

  it('crossfade adjusts from/to weights', () => {
    blender.addLayer(layer('from', [pose('hip', 0, 0, 0)], 1));
    blender.addLayer(layer('to', [pose('hip', 10, 0, 0)], 0));
    blender.crossfade('from', 'to', 0.75);
    expect(blender.getLayerWeight('from')).toBeCloseTo(0.25);
    expect(blender.getLayerWeight('to')).toBeCloseTo(0.75);
  });

  it('zero-weight layer is skipped', () => {
    blender.addLayer(layer('skip', [pose('hip', 99, 0, 0)], 0));
    const out = blender.blend();
    expect(out.size).toBe(0);
  });

  it('blend returns a new Map copy', () => {
    blender.addLayer(layer('a', [pose('hip', 1, 0, 0)]));
    const m1 = blender.blend();
    const m2 = blender.blend();
    expect(m1).not.toBe(m2);
  });
});
