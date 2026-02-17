import { describe, it, expect, beforeEach } from 'vitest';
import { OcclusionCulling, AABB, FrustumPlane } from '../OcclusionCulling';

function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): AABB {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

describe('OcclusionCulling', () => {
  let oc: OcclusionCulling;

  beforeEach(() => { oc = new OcclusionCulling(); });

  // --- Registration ---
  it('register / getTotalCount', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1));
    oc.register('b', aabb(2, 0, 0, 3, 1, 1));
    expect(oc.getTotalCount()).toBe(2);
  });

  it('unregister removes object', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1));
    expect(oc.unregister('a')).toBe(true);
    expect(oc.getTotalCount()).toBe(0);
  });

  it('unregister returns false for unknown', () => {
    expect(oc.unregister('x')).toBe(false);
  });

  it('updateBounds updates stored bounds', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1));
    oc.updateBounds('a', aabb(10, 10, 10, 20, 20, 20));
    // After culling with no frustum, should still be visible
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
  });

  // --- Culling without frustum (everything visible) ---
  it('no frustum means all visible', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1));
    oc.register('b', aabb(10, 10, 10, 11, 11, 11));
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(2);
    expect(oc.getCulledCount()).toBe(0);
  });

  // --- Frustum Culling ---
  it('frustum culls objects outside', () => {
    oc.register('inside', aabb(0, 0, 0, 1, 1, 1));
    oc.register('outside', aabb(100, 100, 100, 101, 101, 101));
    // Simple frustum: a single plane at x=10 facing left
    const planes: FrustumPlane[] = [
      { normal: { x: -1, y: 0, z: 0 }, distance: 10 },
    ];
    oc.setFrustum(planes);
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
    expect(oc.getCulledCount()).toBe(1);
  });

  it('frame counter increments each performCulling', () => {
    expect(oc.getCurrentFrame()).toBe(0);
    oc.performCulling();
    expect(oc.getCurrentFrame()).toBe(1);
    oc.performCulling();
    expect(oc.getCurrentFrame()).toBe(2);
  });

  // --- Layer Mask ---
  it('layer mask filters objects', () => {
    oc.register('layer0', aabb(0, 0, 0, 1, 1, 1), 0);
    oc.register('layer3', aabb(0, 0, 0, 1, 1, 1), 3);
    oc.setLayerMask(1 << 0); // Only layer 0
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1); // only layer0
    expect(oc.getCulledCount()).toBe(1);
  });

  // --- getCullRatio ---
  it('getCullRatio returns ratio', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1), 0);
    oc.register('b', aabb(0, 0, 0, 1, 1, 1), 3);
    oc.setLayerMask(1 << 0);
    oc.performCulling();
    expect(oc.getCullRatio()).toBeCloseTo(0.5);
  });

  it('getCullRatio returns 0 when no objects', () => {
    expect(oc.getCullRatio()).toBe(0);
  });

  // --- AABB Overlap ---
  it('testAABBOverlap returns true for overlapping', () => {
    expect(oc.testAABBOverlap(aabb(0, 0, 0, 2, 2, 2), aabb(1, 1, 1, 3, 3, 3))).toBe(true);
  });

  it('testAABBOverlap returns false for non-overlapping', () => {
    expect(oc.testAABBOverlap(aabb(0, 0, 0, 1, 1, 1), aabb(5, 5, 5, 6, 6, 6))).toBe(false);
  });

  // --- queryRegion ---
  it('queryRegion returns objects in region', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1));
    oc.register('b', aabb(10, 10, 10, 11, 11, 11));
    const result = oc.queryRegion(aabb(-1, -1, -1, 2, 2, 2));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  // --- Zones & Portals ---
  it('addZone / addPortal / getVisibleZones', () => {
    oc.addZone('z1', aabb(0, 0, 0, 10, 10, 10));
    oc.addZone('z2', aabb(10, 0, 0, 20, 10, 10));
    oc.addPortal('p1', aabb(9, 0, 0, 11, 10, 10), 'z1', 'z2');
    const visible = oc.getVisibleZones('z1');
    expect(visible).toContain('z1');
    expect(visible).toContain('z2');
  });

  it('closed portal blocks zone visibility', () => {
    oc.addZone('z1', aabb(0, 0, 0, 10, 10, 10));
    oc.addZone('z2', aabb(10, 0, 0, 20, 10, 10));
    oc.addPortal('p1', aabb(9, 0, 0, 11, 10, 10), 'z1', 'z2');
    oc.setPortalOpen('p1', false);
    const visible = oc.getVisibleZones('z1');
    expect(visible).toContain('z1');
    expect(visible).not.toContain('z2');
  });

  it('chained portals traverse multiple zones', () => {
    oc.addZone('z1', aabb(0, 0, 0, 5, 5, 5));
    oc.addZone('z2', aabb(5, 0, 0, 10, 5, 5));
    oc.addZone('z3', aabb(10, 0, 0, 15, 5, 5));
    oc.addPortal('p12', aabb(4, 0, 0, 6, 5, 5), 'z1', 'z2');
    oc.addPortal('p23', aabb(9, 0, 0, 11, 5, 5), 'z2', 'z3');
    const visible = oc.getVisibleZones('z1');
    expect(visible).toHaveLength(3);
  });

  // --- getVisibleObjects ---
  it('getVisibleObjects filters visible only', () => {
    oc.register('a', aabb(0, 0, 0, 1, 1, 1));
    oc.register('b', aabb(0, 0, 0, 1, 1, 1), 5);
    oc.setLayerMask(1 << 0);
    oc.performCulling();
    const vis = oc.getVisibleObjects();
    expect(vis).toHaveLength(1);
    expect(vis[0].id).toBe('a');
  });
});
