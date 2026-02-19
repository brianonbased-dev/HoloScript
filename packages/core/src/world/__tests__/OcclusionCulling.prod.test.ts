/**
 * OcclusionCulling Production Tests
 *
 * Tests object management, frustum culling, AABB overlap,
 * portal zone traversal, and culling queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OcclusionCulling } from '../../world/OcclusionCulling';
import type { AABB, FrustumPlane } from '../../world/OcclusionCulling';

const box = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): AABB => ({
  min: { x: x1, y: y1, z: z1 },
  max: { x: x2, y: y2, z: z2 },
});

describe('OcclusionCulling — Production', () => {
  let oc: OcclusionCulling;

  beforeEach(() => {
    oc = new OcclusionCulling();
  });

  // ─── Object Management ────────────────────────────────────────────

  it('register creates visible object', () => {
    const obj = oc.register('cube', box(0, 0, 0, 1, 1, 1));
    expect(obj.id).toBe('cube');
    expect(obj.visible).toBe(true);
  });

  it('unregister removes object', () => {
    oc.register('a', box(0, 0, 0, 1, 1, 1));
    expect(oc.unregister('a')).toBe(true);
    expect(oc.getTotalCount()).toBe(0);
  });

  it('updateBounds changes object bounds', () => {
    oc.register('b', box(0, 0, 0, 1, 1, 1));
    oc.updateBounds('b', box(10, 10, 10, 20, 20, 20));
    // Verify via query
    const found = oc.queryRegion(box(9, 9, 9, 21, 21, 21));
    expect(found.length).toBe(1);
  });

  // ─── Frustum Culling ──────────────────────────────────────────────

  it('no frustum = everything visible', () => {
    oc.register('c', box(0, 0, 0, 1, 1, 1));
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
  });

  it('objects inside frustum are visible', () => {
    oc.register('inside', box(0, 0, 0, 1, 1, 1));
    // Single plane: normal pointing +x, everything at x >= 0 passes
    oc.setFrustum([{ normal: { x: 1, y: 0, z: 0 }, distance: 0 }]);
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
  });

  it('objects outside frustum are culled', () => {
    oc.register('outside', box(-10, -10, -10, -5, -5, -5));
    // Plane at x=0, only objects with positive x pass
    oc.setFrustum([{ normal: { x: 1, y: 0, z: 0 }, distance: 0 }]);
    oc.performCulling();
    expect(oc.getCulledCount()).toBe(1);
    expect(oc.getVisibleCount()).toBe(0);
  });

  it('layer mask culls objects', () => {
    oc.register('layer0', box(0, 0, 0, 1, 1, 1), 0);
    oc.register('layer5', box(0, 0, 0, 1, 1, 1), 5);
    oc.setLayerMask(1 << 0); // Only layer 0
    oc.performCulling();
    expect(oc.getVisibleCount()).toBe(1);
    expect(oc.getCulledCount()).toBe(1);
  });

  // ─── AABB Overlap ─────────────────────────────────────────────────

  it('testAABBOverlap returns true for overlapping boxes', () => {
    const a = box(0, 0, 0, 5, 5, 5);
    const b = box(3, 3, 3, 8, 8, 8);
    expect(oc.testAABBOverlap(a, b)).toBe(true);
  });

  it('testAABBOverlap returns false for separated boxes', () => {
    const a = box(0, 0, 0, 1, 1, 1);
    const b = box(5, 5, 5, 6, 6, 6);
    expect(oc.testAABBOverlap(a, b)).toBe(false);
  });

  it('queryRegion finds objects in region', () => {
    oc.register('in', box(1, 1, 1, 2, 2, 2));
    oc.register('out', box(100, 100, 100, 101, 101, 101));
    const results = oc.queryRegion(box(0, 0, 0, 5, 5, 5));
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('in');
  });

  // ─── Portal Zone Traversal ────────────────────────────────────────

  it('getVisibleZones returns start zone', () => {
    oc.addZone('z1', box(0, 0, 0, 10, 10, 10));
    const zones = oc.getVisibleZones('z1');
    expect(zones).toContain('z1');
  });

  it('getVisibleZones traverses open portals', () => {
    oc.addZone('z1', box(0, 0, 0, 10, 10, 10));
    oc.addZone('z2', box(10, 0, 0, 20, 10, 10));
    oc.addPortal('p1', box(9, 0, 0, 11, 10, 10), 'z1', 'z2');
    const zones = oc.getVisibleZones('z1');
    expect(zones).toContain('z2');
  });

  it('getVisibleZones stops at closed portals', () => {
    oc.addZone('z1', box(0, 0, 0, 10, 10, 10));
    oc.addZone('z2', box(10, 0, 0, 20, 10, 10));
    oc.addPortal('p1', box(9, 0, 0, 11, 10, 10), 'z1', 'z2');
    oc.setPortalOpen('p1', false);
    const zones = oc.getVisibleZones('z1');
    expect(zones).not.toContain('z2');
  });

  // ─── Queries ──────────────────────────────────────────────────────

  it('getCullRatio returns 0 for empty', () => {
    expect(oc.getCullRatio()).toBe(0);
  });

  it('getCurrentFrame increments on performCulling', () => {
    expect(oc.getCurrentFrame()).toBe(0);
    oc.performCulling();
    expect(oc.getCurrentFrame()).toBe(1);
    oc.performCulling();
    expect(oc.getCurrentFrame()).toBe(2);
  });

  it('getVisibleObjects returns only visible', () => {
    oc.register('v', box(0, 0, 0, 1, 1, 1));
    oc.register('c', box(-10, -10, -10, -9, -9, -9));
    oc.setFrustum([{ normal: { x: 1, y: 0, z: 0 }, distance: 0 }]);
    oc.performCulling();
    const vis = oc.getVisibleObjects();
    expect(vis.length).toBe(1);
    expect(vis[0].id).toBe('v');
  });
});
