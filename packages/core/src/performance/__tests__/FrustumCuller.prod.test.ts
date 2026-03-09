/**
 * FrustumCuller — production test suite
 *
 * Tests: setFrustumFromPerspective, isVisible, cull,
 * getLastCullCount, edge cases (no planes, zero radius).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FrustumCuller } from '../FrustumCuller';
import type { BoundingSphere } from '../FrustumCuller';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSphere(id: string, x: number, y: number, z: number, radius = 1): BoundingSphere {
  return { id, x, y, z, radius };
}

// Camera looking down +Z axis, positioned at origin
const CAM_POS = { x: 0, y: 0, z: 0 };
const CAM_FWD = { x: 0, y: 0, z: 1 }; // normalized
const CAM_UP = { x: 0, y: 1, z: 0 };

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('FrustumCuller: production', () => {
  let culler: FrustumCuller;

  beforeEach(() => {
    culler = new FrustumCuller();
    // Camera at origin, looking down +Z, near=1, far=100
    culler.setFrustumFromPerspective(CAM_POS, CAM_FWD, CAM_UP, 60, 1.77, 1, 100);
  });

  // ─── Before any frustum is set ─────────────────────────────────────────────
  describe('default state', () => {
    it('all objects visible before any frustum is set (no planes)', () => {
      const fresh = new FrustumCuller();
      const sphere = makeSphere('s', 0, 0, 5);
      expect(fresh.isVisible(sphere)).toBe(true);
    });

    it('getLastCullCount starts at 0', () => {
      const fresh = new FrustumCuller();
      expect(fresh.getLastCullCount()).toBe(0);
    });
  });

  // ─── isVisible ────────────────────────────────────────────────────────────
  describe('isVisible', () => {
    it('object in front of camera within far plane is visible', () => {
      expect(culler.isVisible(makeSphere('in', 0, 0, 50))).toBe(true);
    });

    it('object beyond far plane is NOT visible', () => {
      // z=200 >> far=100; without fov side planes only near/far used
      expect(culler.isVisible(makeSphere('far', 0, 0, 200))).toBe(false);
    });

    it('object behind camera (before near plane) is NOT visible', () => {
      expect(culler.isVisible(makeSphere('behind', 0, 0, -5))).toBe(false);
    });

    it('object exactly at near plane boundary is visible (on-plane)', () => {
      // z = near(1) + radius(1) → center at z=1 on the near plane
      expect(culler.isVisible(makeSphere('near', 0, 0, 2, 2))).toBe(true);
    });

    it('large radius sphere behind camera can still be visible (sphere overlaps frustum)', () => {
      // center at z=-5 but radius=10 → sphere overlaps near plane
      expect(culler.isVisible(makeSphere('big', 0, 0, -5, 10))).toBe(true);
    });
  });

  // ─── cull ────────────────────────────────────────────────────────────────
  describe('cull', () => {
    it('returns empty array for empty input', () => {
      expect(culler.cull([])).toEqual([]);
    });

    it('returns all objects when all are in-frustum', () => {
      const objs = [makeSphere('a', 0, 0, 10), makeSphere('b', 0, 0, 50)];
      expect(culler.cull(objs).length).toBe(2);
    });

    it('filters out objects outside frustum', () => {
      const objs = [
        makeSphere('visible', 0, 0, 20),
        makeSphere('behind', 0, 0, -50),
        makeSphere('tooFar', 0, 0, 500),
      ];
      const visible = culler.cull(objs);
      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe('visible');
    });

    it('returns correct visible subset with mixed objects', () => {
      const objs = [
        makeSphere('v1', 0, 0, 5),
        makeSphere('v2', 0, 0, 80),
        makeSphere('c1', 0, 0, -10), // culled
        makeSphere('c2', 0, 0, 150), // culled
      ];
      const visible = culler.cull(objs);
      const ids = visible.map((o) => o.id);
      expect(ids).toContain('v1');
      expect(ids).toContain('v2');
      expect(ids).not.toContain('c1');
      expect(ids).not.toContain('c2');
    });
  });

  // ─── getLastCullCount ─────────────────────────────────────────────────────
  describe('getLastCullCount', () => {
    it('reports 0 culled when all are visible', () => {
      culler.cull([makeSphere('a', 0, 0, 10), makeSphere('b', 0, 0, 30)]);
      expect(culler.getLastCullCount()).toBe(0);
    });

    it('reports correct count of culled objects', () => {
      culler.cull([
        makeSphere('v', 0, 0, 10), // visible
        makeSphere('c1', 0, 0, -20), // culled
        makeSphere('c2', 0, 0, 300), // culled
      ]);
      expect(culler.getLastCullCount()).toBe(2);
    });

    it('updates after every cull call', () => {
      culler.cull([makeSphere('c', 0, 0, -50)]);
      expect(culler.getLastCullCount()).toBe(1);
      culler.cull([]);
      expect(culler.getLastCullCount()).toBe(0);
    });
  });
});
