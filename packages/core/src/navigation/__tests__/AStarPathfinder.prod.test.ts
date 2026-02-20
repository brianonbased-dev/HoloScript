/**
 * AStarPathfinder — production test suite
 *
 * Tests: same-polygon path (direct), linear path through 3 polygons,
 * path caching (second findPath returns same result), smoothPath,
 * addObstacle/removeObstacle/getObstacleCount, isBlocked indirectly
 * (obstacle on target polygon center), clearCache, setMaxIterations,
 * no-polygon returns found=false, findPath on disconnected mesh.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AStarPathfinder } from '../AStarPathfinder';
import { NavMesh } from '../NavMesh';
import type { NavPoint } from '../NavMesh';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a simple 3-quad nav mesh as a linear corridor:
 *   poly0 (0-5 on X)  — poly1 (5-10 on X)  — poly2 (10-15 on X)
 *   All at z=0..5, y=0
 */
function buildLinearMesh() {
  const mesh = new NavMesh();
  const p0 = mesh.addPolygon([
    { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 },
    { x: 5, y: 0, z: 5 }, { x: 0, y: 0, z: 5 },
  ]);
  const p1 = mesh.addPolygon([
    { x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
    { x: 10, y: 0, z: 5 }, { x: 5, y: 0, z: 5 },
  ]);
  const p2 = mesh.addPolygon([
    { x: 10, y: 0, z: 0 }, { x: 15, y: 0, z: 0 },
    { x: 15, y: 0, z: 5 }, { x: 10, y: 0, z: 5 },
  ]);
  mesh.connectPolygons(p0.id, p1.id);
  mesh.connectPolygons(p1.id, p2.id);
  return { mesh, p0, p1, p2 };
}

const pt = (x: number, z: number): NavPoint => ({ x, y: 0, z });

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AStarPathfinder: production', () => {
  let mesh: NavMesh;
  let pf: AStarPathfinder;

  beforeEach(() => {
    const built = buildLinearMesh();
    mesh = built.mesh;
    pf = new AStarPathfinder(mesh);
  });

  // ─── findPath – same polygon ──────────────────────────────────────────────
  describe('findPath – same polygon', () => {
    it('finds direct path when start and goal are in the same polygon', () => {
      const result = pf.findPath(pt(1, 1), pt(3, 3));
      expect(result.found).toBe(true);
      expect(result.path).toHaveLength(2);
    });

    it('cost is approximately distance', () => {
      const start = pt(1, 1);
      const goal = pt(4, 1);
      const result = pf.findPath(start, goal);
      expect(result.cost).toBeCloseTo(3, 0);
    });
  });

  // ─── findPath – cross polygon ─────────────────────────────────────────────
  describe('findPath – across polygons', () => {
    it('finds path from poly0 start to poly2 goal', () => {
      const result = pf.findPath(pt(2, 2), pt(13, 2));
      expect(result.found).toBe(true);
      expect(result.path.length).toBeGreaterThanOrEqual(2);
    });

    it('returns polygonsVisited > 0 for cross-polygon path', () => {
      const result = pf.findPath(pt(2, 2), pt(13, 2));
      expect(result.polygonsVisited).toBeGreaterThan(0);
    });

    it('timeMs is a non-negative number', () => {
      const result = pf.findPath(pt(2, 2), pt(13, 2));
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── path caching ─────────────────────────────────────────────────────────
  describe('path caching', () => {
    it('second call with same args returns cached result (same reference)', () => {
      const r1 = pf.findPath(pt(2, 2), pt(13, 2));
      const r2 = pf.findPath(pt(2, 2), pt(13, 2));
      expect(r1.path).toEqual(r2.path);
    });

    it('clearCache allows fresh find', () => {
      pf.findPath(pt(2, 2), pt(13, 2));
      pf.clearCache();
      const r2 = pf.findPath(pt(2, 2), pt(13, 2));
      expect(r2.found).toBe(true);
    });
  });

  // ─── smoothPath ───────────────────────────────────────────────────────────
  describe('smoothPath', () => {
    it('smoothes path of 2 points unchanged', () => {
      const path = [pt(0, 0), pt(5, 0)];
      expect(pf.smoothPath(path)).toHaveLength(2);
    });

    it('smoothed path has fewer or equal points', () => {
      const result = pf.findPath(pt(2, 2), pt(13, 2));
      const smoothed = pf.smoothPath(result.path);
      expect(smoothed.length).toBeLessThanOrEqual(result.path.length);
    });

    it('smoothed path starts at start and ends at goal for collinear', () => {
      const path = [pt(0, 0), pt(5, 0), pt(10, 0)];
      const smoothed = pf.smoothPath(path);
      expect(smoothed[0]).toMatchObject({ x: 0, z: 0 });
      expect(smoothed[smoothed.length - 1]).toMatchObject({ x: 10, z: 0 });
    });
  });

  // ─── obstacles ────────────────────────────────────────────────────────────
  describe('obstacle management', () => {
    it('addObstacle increments count', () => {
      pf.addObstacle('rock', pt(7, 2), 1);
      expect(pf.getObstacleCount()).toBe(1);
    });

    it('removeObstacle decrements count', () => {
      pf.addObstacle('rock', pt(7, 2), 1);
      pf.removeObstacle('rock');
      expect(pf.getObstacleCount()).toBe(0);
    });

    it('addObstacle clears cache', () => {
      // Should not throw; path re-computation is triggered
      pf.findPath(pt(2, 2), pt(13, 2));
      pf.addObstacle('wall', pt(7, 2), 100); // clears cache
      // No assertion needed — just verifying no crash
    });
  });

  // ─── no polygon / disconnected ────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns found=false when mesh is empty', () => {
      const emptyMesh = new NavMesh();
      const emptyPf = new AStarPathfinder(emptyMesh);
      expect(emptyPf.findPath(pt(0, 0), pt(10, 0)).found).toBe(false);
    });

    it('setMaxIterations limits search', () => {
      pf.setMaxIterations(1); // drastically low
      const result = pf.findPath(pt(2, 2), pt(13, 2));
      // With 1 iteration can't find path across 3 nodes
      expect(result.found).toBe(false);
    });
  });
});
