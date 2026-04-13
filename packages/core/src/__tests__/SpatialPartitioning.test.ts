/**
 * SpatialPartitioning.test.ts — Cycle 197
 *
 * Tests for OctreeSystem and FrustumCuller.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OctreeSystem } from '@holoscript/engine/spatial';
import { FrustumCuller } from '@holoscript/engine/spatial';

// =============================================================================
// OCTREE SYSTEM
// =============================================================================

describe('OctreeSystem', () => {
  let oct: OctreeSystem;
  beforeEach(() => {
    oct = new OctreeSystem(0, 0, 0, 100);
  });

  it('starts empty', () => {
    expect(oct.getEntryCount()).toBe(0);
  });

  it('inserts entries', () => {
    expect(oct.insert({ id: 'a', x: 10, y: 0, z: 0, radius: 1 })).toBe(true);
    expect(oct.getEntryCount()).toBe(1);
  });

  it('rejects entries outside bounds', () => {
    expect(oct.insert({ id: 'far', x: 500, y: 0, z: 0, radius: 1 })).toBe(false);
    expect(oct.getEntryCount()).toBe(0);
  });

  it('removes entries by id', () => {
    oct.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    expect(oct.remove('a')).toBe(true);
    expect(oct.getEntryCount()).toBe(0);
  });

  it('remove returns false for unknown id', () => {
    expect(oct.remove('nope')).toBe(false);
  });

  it('queryRadius finds nearby entries', () => {
    oct.insert({ id: 'a', x: 5, y: 0, z: 0, radius: 1 });
    oct.insert({ id: 'b', x: 50, y: 0, z: 0, radius: 1 });
    const results = oct.queryRadius(0, 0, 0, 10);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('queryRadius returns empty for distant search', () => {
    oct.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 1 });
    const results = oct.queryRadius(90, 90, 90, 1);
    expect(results).toHaveLength(0);
  });

  it('auto-subdivides when threshold exceeded', () => {
    for (let i = 0; i < 20; i++) {
      oct.insert({ id: `e${i}`, x: i * 2 - 20, y: 0, z: 0, radius: 0.5 });
    }
    expect(oct.getEntryCount()).toBe(20);
    // Query should still work after subdivision
    const near = oct.queryRadius(0, 0, 0, 5);
    expect(near.length).toBeGreaterThan(0);
  });

  it('clear removes everything', () => {
    for (let i = 0; i < 10; i++) oct.insert({ id: `e${i}`, x: i, y: 0, z: 0, radius: 1 });
    oct.clear();
    expect(oct.getEntryCount()).toBe(0);
  });

  it('queryRadius includes entries with radius overlap', () => {
    oct.insert({ id: 'big', x: 15, y: 0, z: 0, radius: 10 });
    const results = oct.queryRadius(0, 0, 0, 5);
    // entry at x=15 radius=10 overlaps query at 0 radius=5: distance 15 <= 5+10
    expect(results).toHaveLength(1);
  });

  it('handles many insertions', () => {
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      oct.insert({
        id: `p${i}`,
        x: Math.cos(angle) * 50,
        y: 0,
        z: Math.sin(angle) * 50,
        radius: 1,
      });
    }
    expect(oct.getEntryCount()).toBe(100);
    const sector = oct.queryRadius(50, 0, 0, 15);
    expect(sector.length).toBeGreaterThan(0);
    expect(sector.length).toBeLessThan(100);
  });
});

// =============================================================================
// FRUSTUM CULLER
// =============================================================================

describe('FrustumCuller', () => {
  let culler: FrustumCuller;
  beforeEach(() => {
    culler = new FrustumCuller();
    culler.setFrustumFromPerspective(60, 16 / 9, 0.1, 100, 0, 0, 0, 0, 0, -1);
  });

  it('sets planes from perspective', () => {
    expect(culler.getPlaneCount()).toBeGreaterThan(0);
  });

  it('setPlanes overrides', () => {
    culler.setPlanes([
      { a: 0, b: 0, c: 1, d: 0 },
      { a: 0, b: 0, c: -1, d: 100 },
    ]);
    expect(culler.getPlaneCount()).toBe(2);
  });

  it('adds and removes volumes', () => {
    culler.addVolume({ id: 'v1', type: 'sphere', centerX: 0, centerY: 0, centerZ: -10, radius: 2 });
    expect(culler.getVolumeCount()).toBe(1);
    culler.removeVolume('v1');
    expect(culler.getVolumeCount()).toBe(0);
  });

  it('testSphere inside frustum returns inside', () => {
    const result = culler.testSphere(0, 0, -10, 1);
    expect(result).not.toBe('outside');
  });

  it('testSphere outside frustum returns outside', () => {
    const result = culler.testSphere(0, 0, -200, 1);
    expect(result).toBe('outside');
  });

  it('testAABB inside frustum', () => {
    const result = culler.testAABB(0, 0, -10, 2, 2, 2);
    expect(result).not.toBe('outside');
  });

  it('testAABB outside frustum', () => {
    const result = culler.testAABB(0, 0, -200, 1, 1, 1);
    expect(result).toBe('outside');
  });

  it('cullAll returns visible volume ids', () => {
    culler.addVolume({
      id: 'near',
      type: 'sphere',
      centerX: 0,
      centerY: 0,
      centerZ: -10,
      radius: 2,
    });
    culler.addVolume({
      id: 'far',
      type: 'sphere',
      centerX: 0,
      centerY: 0,
      centerZ: -200,
      radius: 1,
    });
    const visible = culler.cullAll();
    expect(visible).toContain('near');
    expect(visible).not.toContain('far');
  });

  it('isVisible reflects last cullAll', () => {
    culler.addVolume({ id: 'v1', type: 'sphere', centerX: 0, centerY: 0, centerZ: -10, radius: 2 });
    culler.cullAll();
    expect(culler.isVisible('v1')).toBe(true);
  });

  it('getVisibleCount after cull', () => {
    culler.addVolume({ id: 'a', type: 'sphere', centerX: 0, centerY: 0, centerZ: -5, radius: 1 });
    culler.addVolume({ id: 'b', type: 'sphere', centerX: 0, centerY: 0, centerZ: -10, radius: 1 });
    culler.addVolume({ id: 'c', type: 'sphere', centerX: 0, centerY: 0, centerZ: -300, radius: 1 });
    culler.cullAll();
    expect(culler.getVisibleCount()).toBe(2);
  });

  it('AABB batch culling', () => {
    culler.addVolume({
      id: 'box1',
      type: 'aabb',
      centerX: 0,
      centerY: 0,
      centerZ: -5,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
    });
    culler.addVolume({
      id: 'box2',
      type: 'aabb',
      centerX: 0,
      centerY: 0,
      centerZ: -500,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
    });
    const visible = culler.cullAll();
    expect(visible).toContain('box1');
    expect(visible).not.toContain('box2');
  });
});
