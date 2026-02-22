/**
 * FracturePattern.test.ts
 *
 * Tests for fracture pattern generation.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import { describe, it, expect } from 'vitest';
import { FracturePattern, type BoundingVolume } from '../FracturePattern';

describe('FracturePattern', () => {
  const bounds: BoundingVolume = {
    min: { x: -10, y: -10, z: -10 },
    max: { x: 10, y: 10, z: 10 },
  };

  describe('Voronoi Pattern', () => {
    it('should generate Voronoi points', () => {
      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 10,
        seed: 123,
      });

      const points = pattern.generatePoints(bounds);

      expect(points.length).toBe(10);
    });

    it('should generate points within bounds', () => {
      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 20,
        seed: 456,
      });

      const points = pattern.generatePoints(bounds);

      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.min.x);
        expect(point.x).toBeLessThanOrEqual(bounds.max.x);
        expect(point.y).toBeGreaterThanOrEqual(bounds.min.y);
        expect(point.y).toBeLessThanOrEqual(bounds.max.y);
        expect(point.z).toBeGreaterThanOrEqual(bounds.min.z);
        expect(point.z).toBeLessThanOrEqual(bounds.max.z);
      }
    });

    it('should generate reproducible points with same seed', () => {
      const pattern1 = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 5,
        seed: 789,
      });

      const pattern2 = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 5,
        seed: 789,
      });

      const points1 = pattern1.generatePoints(bounds);
      const points2 = pattern2.generatePoints(bounds);

      expect(points1).toEqual(points2);
    });

    it('should generate different points with different seeds', () => {
      const pattern1 = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 5,
        seed: 111,
      });

      const pattern2 = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 5,
        seed: 222,
      });

      const points1 = pattern1.generatePoints(bounds);
      const points2 = pattern2.generatePoints(bounds);

      expect(points1).not.toEqual(points2);
    });
  });

  describe('Radial Pattern', () => {
    it('should generate radial points', () => {
      const pattern = new FracturePattern({
        type: 'radial',
        fragmentCount: 12,
        seed: 321,
      });

      const points = pattern.generatePoints(bounds);

      expect(points.length).toBe(12);
    });

    it('should generate points in rings', () => {
      const pattern = new FracturePattern({
        type: 'radial',
        fragmentCount: 16,
        seed: 654,
      });

      const points = pattern.generatePoints(bounds);
      const center = {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
      };

      // Check that points are distributed radially
      let distances = points.map((p) => {
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const dz = p.z - center.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      });

      // Should have points at various distances
      const uniqueDistances = new Set(distances.map((d) => Math.floor(d)));
      expect(uniqueDistances.size).toBeGreaterThan(1);
    });
  });

  describe('Grid Pattern', () => {
    it('should generate grid points', () => {
      const pattern = new FracturePattern({
        type: 'grid',
        fragmentCount: 8,
        seed: 987,
      });

      const points = pattern.generatePoints(bounds);

      expect(points.length).toBe(8);
    });

    it('should generate points in grid arrangement', () => {
      const pattern = new FracturePattern({
        type: 'grid',
        fragmentCount: 27, // 3x3x3
        seed: 135,
      });

      const points = pattern.generatePoints(bounds);

      expect(points.length).toBe(27);

      // Points should be somewhat evenly distributed
      const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      const avgZ = points.reduce((sum, p) => sum + p.z, 0) / points.length;

      expect(avgX).toBeCloseTo(0, 0);
      expect(avgY).toBeCloseTo(0, 0);
      expect(avgZ).toBeCloseTo(0, 0);
    });
  });

  describe('Custom Pattern', () => {
    it('should use custom generator', () => {
      const customPoints = [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 5, z: 5 },
      ];

      const pattern = new FracturePattern({
        type: 'custom',
        customGenerator: () => customPoints,
      });

      const points = pattern.generatePoints(bounds);

      expect(points).toEqual(customPoints);
    });
  });

  describe('Voronoi Cells', () => {
    it('should generate Voronoi cells from points', () => {
      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 5,
        seed: 246,
      });

      const points = pattern.generatePoints(bounds);
      const cells = pattern.generateVoronoiCells(points, bounds, 5);

      expect(cells.size).toBe(5);
    });

    it('should assign voxels to nearest point', () => {
      const points = [
        { x: -5, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
      ];

      const pattern = new FracturePattern({
        type: 'voronoi',
        seed: 369,
      });

      const cells = pattern.generateVoronoiCells(points, bounds, 10);

      expect(cells.size).toBe(2);

      // Each cell should have some voxels
      for (const voxels of cells.values()) {
        expect(voxels.length).toBeGreaterThan(0);
      }
    });

    it('should handle single point', () => {
      const points = [{ x: 0, y: 0, z: 0 }];

      const pattern = new FracturePattern({
        type: 'voronoi',
        seed: 147,
      });

      const cells = pattern.generateVoronoiCells(points, bounds, 5);

      expect(cells.size).toBe(1);
      expect(cells.get(0)!.length).toBeGreaterThan(0);
    });
  });

  describe('Geometry Generation', () => {
    it('should convert cells to geometry', () => {
      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 3,
        seed: 258,
      });

      const points = pattern.generatePoints(bounds);
      const cells = pattern.generateVoronoiCells(points, bounds, 5);
      const geometries = pattern.cellsToGeometry(cells);

      expect(geometries.length).toBeGreaterThan(0);
    });

    it('should generate geometry with vertices', () => {
      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 2,
        seed: 741,
      });

      const points = pattern.generatePoints(bounds);
      const cells = pattern.generateVoronoiCells(points, bounds, 5);
      const geometries = pattern.cellsToGeometry(cells);

      for (const geom of geometries) {
        expect(geom.vertices.length).toBeGreaterThan(0);
        expect(geom.indices.length).toBeGreaterThan(0);
        expect(geom.normals.length).toBeGreaterThan(0);
        expect(geom.centroid).toBeDefined();
        expect(geom.volume).toBeGreaterThan(0);
      }
    });

    it('should skip empty cells', () => {
      const cells = new Map<number, Array<{ x: number; y: number; z: number }>>([
        [0, []],
        [1, [{ x: 0, y: 0, z: 0 }]],
      ]);

      const pattern = new FracturePattern({
        type: 'voronoi',
        seed: 852,
      });

      const geometries = pattern.cellsToGeometry(cells);

      expect(geometries.length).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero fragments', () => {
      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 0,
        seed: 963,
      });

      const points = pattern.generatePoints(bounds);

      expect(points.length).toBe(0);
    });

    it('should handle very small bounds', () => {
      const smallBounds: BoundingVolume = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0.1, y: 0.1, z: 0.1 },
      };

      const pattern = new FracturePattern({
        type: 'voronoi',
        fragmentCount: 5,
        seed: 159,
      });

      expect(() => {
        pattern.generatePoints(smallBounds);
      }).not.toThrow();
    });

    it('should handle large fragment count', () => {
      const pattern = new FracturePattern({
        type: 'grid',
        fragmentCount: 1000,
        seed: 357,
      });

      const points = pattern.generatePoints(bounds);

      expect(points.length).toBe(1000);
    });
  });
});
