/**
 * NavMesh Production Tests
 *
 * Polygon management, point-in-polygon, nearest polygon, neighbors, export.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NavMesh } from '../NavMesh';

// Triangle at origin: (0,0,0), (10,0,0), (0,0,10)
const TRI = [
  { x: 0, y: 0, z: 0 },
  { x: 10, y: 0, z: 0 },
  { x: 0, y: 0, z: 10 },
];

// Square offset: (20,0,0)→(30,0,0)→(30,0,10)→(20,0,10)
const SQUARE = [
  { x: 20, y: 0, z: 0 },
  { x: 30, y: 0, z: 0 },
  { x: 30, y: 0, z: 10 },
  { x: 20, y: 0, z: 10 },
];

describe('NavMesh — Production', () => {
  let mesh: NavMesh;

  beforeEach(() => {
    mesh = new NavMesh();
  });

  describe('addPolygon / removePolygon', () => {
    it('adds polygon with center', () => {
      const poly = mesh.addPolygon(TRI);
      expect(poly.vertices).toHaveLength(3);
      expect(poly.center.x).toBeCloseTo(10 / 3);
      expect(poly.walkable).toBe(true);
      expect(mesh.getPolygonCount()).toBe(1);
    });

    it('removes polygon', () => {
      const poly = mesh.addPolygon(TRI);
      expect(mesh.removePolygon(poly.id)).toBe(true);
      expect(mesh.getPolygonCount()).toBe(0);
    });
  });

  describe('connectPolygons', () => {
    it('connects two polygons bidirectionally', () => {
      const p1 = mesh.addPolygon(TRI);
      const p2 = mesh.addPolygon(SQUARE);
      mesh.connectPolygons(p1.id, p2.id);
      expect(p1.neighbors).toContain(p2.id);
      expect(p2.neighbors).toContain(p1.id);
    });
  });

  describe('findPolygonAtPoint', () => {
    it('finds polygon containing point', () => {
      const poly = mesh.addPolygon(TRI);
      const found = mesh.findPolygonAtPoint({ x: 2, y: 0, z: 2 });
      expect(found?.id).toBe(poly.id);
    });

    it('returns null for point outside', () => {
      mesh.addPolygon(TRI);
      expect(mesh.findPolygonAtPoint({ x: 50, y: 0, z: 50 })).toBeNull();
    });
  });

  describe('findNearestPolygon', () => {
    it('finds nearest walkable polygon', () => {
      mesh.addPolygon(TRI);
      const sq = mesh.addPolygon(SQUARE);
      const nearest = mesh.findNearestPolygon({ x: 25, y: 0, z: 5 });
      expect(nearest?.id).toBe(sq.id);
    });
  });

  describe('getWalkableNeighbors', () => {
    it('returns walkable neighbors only', () => {
      const p1 = mesh.addPolygon(TRI);
      const p2 = mesh.addPolygon(SQUARE);
      const p3 = mesh.addPolygon([{ x: 40, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, { x: 50, y: 0, z: 10 }], false);
      mesh.connectPolygons(p1.id, p2.id);
      mesh.connectPolygons(p1.id, p3.id);
      const neighbors = mesh.getWalkableNeighbors(p1.id);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe(p2.id);
    });
  });

  describe('export', () => {
    it('exports all polygons with bounds', () => {
      mesh.addPolygon(TRI);
      mesh.addPolygon(SQUARE);
      const data = mesh.export();
      expect(data.polygons).toHaveLength(2);
      expect(data.bounds.min.x).toBe(0);
      expect(data.bounds.max.x).toBe(30);
    });
  });
});
