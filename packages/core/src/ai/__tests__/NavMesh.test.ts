/**
 * NavMesh Unit Tests
 *
 * Tests polygon management, A* pathfinding, path smoothing,
 * walkability, and cost-based routing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NavMesh } from '../NavMesh';

function tri(cx: number, cz: number): { x: number; z: number }[] {
  return [
    { x: cx - 1, z: cz - 1 },
    { x: cx + 1, z: cz - 1 },
    { x: cx, z: cz + 1 },
  ];
}

describe('NavMesh', () => {
  let mesh: NavMesh;

  beforeEach(() => {
    mesh = new NavMesh();
  });

  describe('polygon management', () => {
    it('should add polygons and assign sequential IDs', () => {
      const id0 = mesh.addPolygon(tri(0, 0));
      const id1 = mesh.addPolygon(tri(5, 0));
      expect(id0).toBe(0);
      expect(id1).toBe(1);
      expect(mesh.getPolygonCount()).toBe(2);
    });

    it('should compute center from vertices', () => {
      const id = mesh.addPolygon([
        { x: 0, z: 0 },
        { x: 6, z: 0 },
        { x: 3, z: 6 },
      ]);
      const poly = mesh.getPolygon(id)!;
      expect(poly.center.x).toBeCloseTo(3);
      expect(poly.center.z).toBeCloseTo(2);
    });

    it('should set walkability', () => {
      const id = mesh.addPolygon(tri(0, 0));
      mesh.setWalkable(id, false);
      expect(mesh.getPolygon(id)!.walkable).toBe(false);
    });
  });

  describe('connection', () => {
    it('should connect two polygons bidirectionally', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const b = mesh.addPolygon(tri(3, 0));
      expect(mesh.connect(a, b)).toBe(true);
      expect(mesh.getPolygon(a)!.neighbors).toContain(b);
      expect(mesh.getPolygon(b)!.neighbors).toContain(a);
    });

    it('should return false for invalid polygon IDs', () => {
      expect(mesh.connect(99, 100)).toBe(false);
    });

    it('should not duplicate neighbor entries', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const b = mesh.addPolygon(tri(3, 0));
      mesh.connect(a, b);
      mesh.connect(a, b);
      expect(mesh.getPolygon(a)!.neighbors.length).toBe(1);
    });
  });

  describe('pathfinding', () => {
    it('should find direct path between connected polys', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const b = mesh.addPolygon(tri(3, 0));
      mesh.connect(a, b);

      const path = mesh.findPath(a, b);
      expect(path).not.toBeNull();
      expect(path!.polygonIds).toEqual([a, b]);
      expect(path!.waypoints.length).toBe(2);
    });

    it('should find multi-hop path', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const b = mesh.addPolygon(tri(3, 0));
      const c = mesh.addPolygon(tri(6, 0));
      mesh.connect(a, b);
      mesh.connect(b, c);

      const path = mesh.findPath(a, c);
      expect(path).not.toBeNull();
      expect(path!.polygonIds).toEqual([a, b, c]);
    });

    it('should return null for disconnected polys', () => {
      const a = mesh.addPolygon(tri(0, 0));
      mesh.addPolygon(tri(100, 0)); // not connected
      expect(mesh.findPath(a, 1)).toBeNull();
    });

    it('should return null for non-walkable start/end', () => {
      const a = mesh.addPolygon(tri(0, 0), false);
      const b = mesh.addPolygon(tri(3, 0));
      mesh.connect(a, b);
      expect(mesh.findPath(a, b)).toBeNull();
    });

    it('should avoid non-walkable intermediate polys', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const blocked = mesh.addPolygon(tri(3, 0), false);
      const c = mesh.addPolygon(tri(6, 0));
      mesh.connect(a, blocked);
      mesh.connect(blocked, c);
      expect(mesh.findPath(a, c)).toBeNull();
    });

    it('should prefer lower-cost paths', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const cheapB = mesh.addPolygon(tri(3, 0), true, 1);
      const expensiveC = mesh.addPolygon(tri(0, 3), true, 100);
      const d = mesh.addPolygon(tri(6, 0));
      mesh.connect(a, cheapB);
      mesh.connect(a, expensiveC);
      mesh.connect(cheapB, d);
      mesh.connect(expensiveC, d);

      const path = mesh.findPath(a, d);
      expect(path).not.toBeNull();
      expect(path!.polygonIds).toContain(cheapB);
    });
  });

  describe('smoothPath', () => {
    it('should reduce waypoints when possible', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const b = mesh.addPolygon(tri(3, 0));
      const c = mesh.addPolygon(tri(6, 0));
      mesh.connect(a, b);
      mesh.connect(b, c);

      const path = mesh.findPath(a, c)!;
      const smoothed = mesh.smoothPath(path);
      expect(smoothed.waypoints.length).toBeLessThanOrEqual(path.waypoints.length);
    });

    it('should preserve single-segment paths', () => {
      const a = mesh.addPolygon(tri(0, 0));
      const b = mesh.addPolygon(tri(3, 0));
      mesh.connect(a, b);
      const path = mesh.findPath(a, b)!;
      const smoothed = mesh.smoothPath(path);
      expect(smoothed.waypoints.length).toBe(2);
    });
  });
});
