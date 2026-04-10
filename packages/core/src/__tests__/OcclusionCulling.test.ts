import { describe, it, expect } from 'vitest';
import { OcclusionCulling } from '@holoscript/engine/world/OcclusionCulling';
import type { AABB, FrustumPlane } from '@holoscript/engine/world/OcclusionCulling';

// =============================================================================
// C213 — Occlusion Culling
// =============================================================================

function box(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): AABB {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

describe('OcclusionCulling', () => {
  // --- Registration ---

  it('register adds an object', () => {
    const oc = new OcclusionCulling();
    const obj = oc.register('a', box(0, 0, 0, 1, 1, 1));
    expect(obj.id).toBe('a');
    expect(obj.visible).toBe(true);
    expect(oc.getTotalCount()).toBe(1);
  });

  it('unregister removes an object', () => {
    const oc = new OcclusionCulling();
    oc.register('a', box(0, 0, 0, 1, 1, 1));
    expect(oc.unregister('a')).toBe(true);
    expect(oc.getTotalCount()).toBe(0);
  });

  it('updateBounds changes an object bounds', () => {
    const oc = new OcclusionCulling();
    oc.register('a', box(0, 0, 0, 1, 1, 1));
    oc.updateBounds('a', box(5, 5, 5, 10, 10, 10));
    // Verify by querying the new region
    const found = oc.queryRegion(box(4, 4, 4, 11, 11, 11));
    expect(found.length).toBe(1);
  });

  // --- Frustum Culling ---

  it('without frustum, all objects are visible', () => {
    const oc = new OcclusionCulling();
    oc.register('a', box(0, 0, 0, 1, 1, 1));
    oc.register('b', box(100, 100, 100, 200, 200, 200));
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(2);
    expect(oc.getCulledCount()).toBe(0);
  });

  it('frustum culls objects behind planes', () => {
    const oc = new OcclusionCulling();
    oc.register('inside', box(0, 0, 0, 1, 1, 1));
    oc.register('outside', box(-100, -100, -100, -99, -99, -99));
    // Simple frustum: one plane at x=0, normal pointing right (+x)
    const plane: FrustumPlane = { normal: { x: 1, y: 0, z: 0 }, distance: 0 };
    oc.setFrustum([plane]);
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
    expect(oc.getCulledCount()).toBe(1);
  });

  it('performCulling increments currentFrame', () => {
    const oc = new OcclusionCulling();
    oc.register('a', box(0, 0, 0, 1, 1, 1));
    oc.performCulling();
    oc.performCulling();
    expect(oc.getCurrentFrame()).toBe(2);
  });

  // --- Layer Mask ---

  it('layer mask filters objects by layer', () => {
    const oc = new OcclusionCulling();
    oc.register('layer0', box(0, 0, 0, 1, 1, 1), 0);
    oc.register('layer1', box(0, 0, 0, 1, 1, 1), 1);
    oc.register('layer2', box(0, 0, 0, 1, 1, 1), 2);
    // Only layer 0 visible
    oc.setLayerMask(1); // bit 0 only
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
    expect(oc.getCulledCount()).toBe(2);
  });

  // --- AABB ---

  it('testAABBOverlap returns true for overlapping boxes', () => {
    const oc = new OcclusionCulling();
    expect(oc.testAABBOverlap(box(0, 0, 0, 2, 2, 2), box(1, 1, 1, 3, 3, 3))).toBe(true);
  });

  it('testAABBOverlap returns false for separated boxes', () => {
    const oc = new OcclusionCulling();
    expect(oc.testAABBOverlap(box(0, 0, 0, 1, 1, 1), box(5, 5, 5, 6, 6, 6))).toBe(false);
  });

  it('queryRegion returns objects in region', () => {
    const oc = new OcclusionCulling();
    oc.register('near', box(0, 0, 0, 2, 2, 2));
    oc.register('far', box(100, 100, 100, 101, 101, 101));
    const results = oc.queryRegion(box(-1, -1, -1, 3, 3, 3));
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('near');
  });

  // --- Portals & Zones ---

  it('getVisibleZones with open portals traverses connections', () => {
    const oc = new OcclusionCulling();
    oc.addZone('A', box(0, 0, 0, 10, 10, 10));
    oc.addZone('B', box(10, 0, 0, 20, 10, 10));
    oc.addZone('C', box(20, 0, 0, 30, 10, 10));
    oc.addPortal('AB', box(10, 0, 0, 10, 10, 10), 'A', 'B');
    oc.addPortal('BC', box(20, 0, 0, 20, 10, 10), 'B', 'C');
    const zones = oc.getVisibleZones('A');
    expect(zones).toContain('A');
    expect(zones).toContain('B');
    expect(zones).toContain('C');
  });

  it('closed portal blocks zone traversal', () => {
    const oc = new OcclusionCulling();
    oc.addZone('A', box(0, 0, 0, 10, 10, 10));
    oc.addZone('B', box(10, 0, 0, 20, 10, 10));
    oc.addPortal('AB', box(10, 0, 0, 10, 10, 10), 'A', 'B');
    oc.setPortalOpen('AB', false);
    const zones = oc.getVisibleZones('A');
    expect(zones).toContain('A');
    expect(zones).not.toContain('B');
  });

  // --- Stats ---

  it('getCullRatio returns correct ratio', () => {
    const oc = new OcclusionCulling();
    oc.register('vis', box(0, 0, 0, 1, 1, 1));
    oc.register('cull', box(-100, -100, -100, -99, -99, -99));
    oc.setFrustum([{ normal: { x: 1, y: 0, z: 0 }, distance: 0 }]);
    oc.performCulling();
    expect(oc.getCullRatio()).toBeCloseTo(0.5);
  });

  it('getVisibleObjects returns only visible', () => {
    const oc = new OcclusionCulling();
    oc.register('vis', box(0, 0, 0, 1, 1, 1));
    oc.register('cull', box(-100, -100, -100, -99, -99, -99));
    oc.setFrustum([{ normal: { x: 1, y: 0, z: 0 }, distance: 0 }]);
    oc.performCulling();
    const vis = oc.getVisibleObjects();
    expect(vis.length).toBe(1);
    expect(vis[0].id).toBe('vis');
  });

  it('empty scene has 0 cull ratio', () => {
    const oc = new OcclusionCulling();
    expect(oc.getCullRatio()).toBe(0);
  });
});
