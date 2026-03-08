/**
 * ProceduralGeometry tests
 * Tests for marching cubes, spline tubes, and membrane generation
 */

import { describe, it, expect } from 'vitest';
import {
  generateHullGeometry,
  generateSplineGeometry,
  generateMembraneGeometry,
  type BlobDef,
} from '../ProceduralGeometry';

describe('ProceduralGeometry', () => {
  describe('generateHullGeometry', () => {
    it('should generate a basic metaball hull', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 16, 1.0);

      expect(geometry.positions.length).toBeGreaterThan(0);
      expect(geometry.normals.length).toBe(geometry.positions.length);
      expect(geometry.uvs.length).toBe((geometry.positions.length / 3) * 2);
      expect(geometry.indices.length).toBeGreaterThan(0);
      expect(geometry.indices.length % 3).toBe(0); // Triangles
    });

    it('should use Uint16Array for small meshes (<65535 vertices)', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 16, 1.0);

      const vertexCount = geometry.positions.length / 3;
      expect(vertexCount).toBeLessThan(65535);
      expect(geometry.indices).toBeInstanceOf(Uint16Array);
    });

    it('should use Uint32Array for large meshes (>65535 vertices)', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [3, 3, 3] },
        { center: [2, 0, 0], radius: [2, 2, 2] },
        { center: [-2, 0, 0], radius: [2, 2, 2] },
        { center: [0, 2, 0], radius: [2, 2, 2] },
        { center: [0, -2, 0], radius: [2, 2, 2] },
      ];
      const geometry = generateHullGeometry(blobs, 100, 1.0); // High resolution

      const vertexCount = geometry.positions.length / 3;

      // Should generate enough vertices to require Uint32Array
      if (vertexCount > 65535) {
        expect(geometry.indices).toBeInstanceOf(Uint32Array);

        // Verify indices are valid (no overflow)
        for (let i = 0; i < geometry.indices.length; i++) {
          expect(geometry.indices[i]).toBeLessThan(vertexCount);
          expect(geometry.indices[i]).toBeGreaterThanOrEqual(0);
        }
      } else {
        // If not large enough, just verify it works
        expect(geometry.indices).toBeInstanceOf(Uint16Array);
      }
    });

    it('should generate blended metaballs', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
        { center: [1.5, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 24, 1.0);

      expect(geometry.positions.length).toBeGreaterThan(0);
      expect(geometry.indices).toBeInstanceOf(Uint16Array);
    });

    it('should return fallback box for empty blobs', () => {
      const geometry = generateHullGeometry([], 16, 1.0);

      expect(geometry.positions.length).toBe(24 * 3); // 24 vertices (cube)
      expect(geometry.indices).toBeInstanceOf(Uint16Array);
    });
  });

  describe('generateSplineGeometry', () => {
    it('should generate a tube along a spline', () => {
      const points = [
        [0, 0, 0],
        [1, 1, 0],
        [2, 0, 0],
      ];
      const radii = [0.2, 0.3, 0.2];
      const geometry = generateSplineGeometry(points, radii, 16, 8);

      expect(geometry.positions.length).toBeGreaterThan(0);
      expect(geometry.normals.length).toBe(geometry.positions.length);
      expect(geometry.indices.length).toBeGreaterThan(0);
    });

    it('should use Uint16Array for normal splines', () => {
      const points = [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ];
      const radii = [0.2, 0.2, 0.2];
      const geometry = generateSplineGeometry(points, radii, 32, 12);

      expect(geometry.indices).toBeInstanceOf(Uint16Array);
    });

    it('should use Uint32Array for very detailed splines', () => {
      const points: number[][] = [];
      for (let i = 0; i < 100; i++) {
        points.push([i, Math.sin(i * 0.1), Math.cos(i * 0.1)]);
      }
      const radii = points.map(() => 0.5);
      const geometry = generateSplineGeometry(points, radii, 200, 50); // Very high detail

      const vertexCount = geometry.positions.length / 3;
      if (vertexCount > 65535) {
        expect(geometry.indices).toBeInstanceOf(Uint32Array);
      } else {
        expect(geometry.indices).toBeInstanceOf(Uint16Array);
      }
    });

    it('should return fallback box for too few points', () => {
      const geometry = generateSplineGeometry([[0, 0, 0]], [0.5]);

      expect(geometry.positions.length).toBe(24 * 3); // Fallback box
    });
  });

  describe('generateMembraneGeometry', () => {
    it('should generate a membrane from anchor points', () => {
      const anchors = [
        [1, 0, 0],
        [0, 1, 0],
        [-1, 0, 0],
        [0, -1, 0],
      ];
      const geometry = generateMembraneGeometry(anchors, 8, 0.2);

      expect(geometry.positions.length).toBeGreaterThan(0);
      expect(geometry.normals.length).toBe(geometry.positions.length);
      expect(geometry.indices.length).toBeGreaterThan(0);
    });

    it('should use Uint16Array for normal membranes', () => {
      const anchors = [
        [1, 0, 0],
        [0, 1, 0],
        [-1, 0, 0],
      ];
      const geometry = generateMembraneGeometry(anchors, 8, 0.15);

      expect(geometry.indices).toBeInstanceOf(Uint16Array);
    });

    it('should use Uint32Array for highly subdivided membranes', () => {
      const anchors: number[][] = [];
      const n = 100;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        anchors.push([Math.cos(angle), Math.sin(angle), 0]);
      }
      const geometry = generateMembraneGeometry(anchors, 200); // Very high subdivision

      const vertexCount = geometry.positions.length / 3;
      if (vertexCount > 65535) {
        expect(geometry.indices).toBeInstanceOf(Uint32Array);
      } else {
        expect(geometry.indices).toBeInstanceOf(Uint16Array);
      }
    });

    it('should be double-sided (reversed triangles)', () => {
      const anchors = [
        [1, 0, 0],
        [0, 1, 0],
        [-1, 0, 0],
      ];
      const geometry = generateMembraneGeometry(anchors, 4, 0.1);

      // Index count should be double due to reversed triangles
      const triangleCount = geometry.indices.length / 3;
      expect(triangleCount % 2).toBe(0); // Even number of triangles
    });

    it('should return fallback box for too few anchors', () => {
      const geometry = generateMembraneGeometry([[0, 0, 0], [1, 0, 0]], 8);

      expect(geometry.positions.length).toBe(24 * 3); // Fallback box
    });
  });

  describe('Index overflow protection', () => {
    it('should never have index values >= vertex count', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [2, 2, 2] },
      ];
      const geometry = generateHullGeometry(blobs, 50, 1.0);

      const vertexCount = geometry.positions.length / 3;

      for (let i = 0; i < geometry.indices.length; i++) {
        expect(geometry.indices[i]).toBeLessThan(vertexCount);
        expect(geometry.indices[i]).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle vertex count at boundary (65535)', () => {
      // This is a stress test - might not always generate exactly 65535 vertices
      // but should handle the boundary correctly
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [3, 3, 3] },
        { center: [3, 0, 0], radius: [2, 2, 2] },
      ];
      const geometry = generateHullGeometry(blobs, 80, 1.0);

      const vertexCount = geometry.positions.length / 3;

      // Verify correct array type based on vertex count
      if (vertexCount > 65535) {
        expect(geometry.indices).toBeInstanceOf(Uint32Array);
      } else {
        expect(geometry.indices).toBeInstanceOf(Uint16Array);
      }

      // Verify no index overflow
      for (let i = 0; i < geometry.indices.length; i++) {
        expect(geometry.indices[i]).toBeLessThan(vertexCount);
      }
    });
  });
});
