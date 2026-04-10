import { describe, it, expect, beforeEach } from 'vitest';
import { FoliageSystem } from '../FoliageSystem';
import type { FoliageType } from '../FoliageSystem';

const grassType: FoliageType = {
  id: 'grass',
  meshId: 'grass_mesh',
  density: 10,
  minScale: 0.8,
  maxScale: 1.2,
  alignToNormal: true,
  windResponse: 0.5,
  castsShadow: false,
  lodDistances: [20, 40, 60],
};

describe('FoliageSystem', () => {
  let sys: FoliageSystem;

  beforeEach(() => {
    sys = new FoliageSystem();
    sys.registerType(grassType);
  });

  it('registers and retrieves types', () => {
    expect(sys.getType('grass')).toBeDefined();
    expect(sys.getTypeCount()).toBe(1);
  });

  it('scatter creates a patch', () => {
    const patch = sys.scatter('p1', 'grass', { x: 0, z: 0, w: 10, h: 10 }, 50);
    expect(patch.instances).toHaveLength(50);
    expect(sys.getPatchCount()).toBe(1);
  });

  it('scatter throws for unknown type', () => {
    expect(() => sys.scatter('p1', 'unknown', { x: 0, z: 0, w: 5, h: 5 }, 10)).toThrow(
      'Unknown foliage type'
    );
  });

  it('instances have valid properties', () => {
    const patch = sys.scatter('p1', 'grass', { x: 0, z: 0, w: 10, h: 10 }, 5);
    for (const inst of patch.instances) {
      expect(inst.scale).toBeGreaterThanOrEqual(grassType.minScale);
      expect(inst.scale).toBeLessThanOrEqual(grassType.maxScale);
      expect(inst.visible).toBe(true);
    }
  });

  it('update computes LOD based on camera distance', () => {
    const patch = sys.scatter('p1', 'grass', { x: 0, z: 0, w: 1, h: 1 }, 1);
    sys.update(0, { x: 1000, z: 1000 });
    // Far from camera → highest LOD level
    const inst = sys.getPatch('p1')!.instances[0];
    expect(inst.lodLevel).toBeGreaterThanOrEqual(grassType.lodDistances.length);
  });

  it('nearby instances remain visible', () => {
    sys.scatter('p1', 'grass', { x: 0, z: 0, w: 1, h: 1 }, 5);
    sys.update(0, { x: 0, z: 0 });
    expect(sys.getVisibleCount()).toBe(5);
  });

  it('setWind and getWind', () => {
    sys.setWind(1, 0, 0.8);
    const w = sys.getWind();
    expect(w.strength).toBeCloseTo(0.8);
    expect(w.dirX).toBeCloseTo(1);
  });

  it('wind strength is clamped 0-1', () => {
    sys.setWind(1, 0, 2.0);
    expect(sys.getWind().strength).toBe(1);
    sys.setWind(1, 0, -1);
    expect(sys.getWind().strength).toBe(0);
  });

  it('getWindOffset returns sway values', () => {
    sys.scatter('p1', 'grass', { x: 0, z: 0, w: 1, h: 1 }, 1);
    const patch = sys.getPatch('p1')!;
    sys.update(1.0, { x: 0, z: 0 });
    const offset = sys.getWindOffset(patch.instances[0]);
    expect(offset.x).toBeDefined();
    expect(offset.z).toBeDefined();
  });

  it('removePatch removes a patch', () => {
    sys.scatter('p1', 'grass', { x: 0, z: 0, w: 1, h: 1 }, 5);
    expect(sys.removePatch('p1')).toBe(true);
    expect(sys.getPatchCount()).toBe(0);
  });

  it('getTotalInstanceCount sums all patches', () => {
    sys.scatter('p1', 'grass', { x: 0, z: 0, w: 5, h: 5 }, 10);
    sys.scatter('p2', 'grass', { x: 10, z: 10, w: 5, h: 5 }, 20);
    expect(sys.getTotalInstanceCount()).toBe(30);
  });
});
