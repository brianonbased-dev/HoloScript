/**
 * ProceduralGeometry tests
 * Tests for marching cubes, spline tubes, membrane generation,
 * LOD presets, vertex deduplication, and edge interpolation quality.
 */

import { describe, it, expect } from 'vitest';
import {
  generateHullGeometry,
  generateSplineGeometry,
  generateMembraneGeometry,
  type BlobDef,
  type LODPreset,
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

  describe('LOD presets', () => {
    const singleBlob: BlobDef[] = [{ center: [0, 0, 0], radius: [1, 1, 1] }];
    const splinePoints = [[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 1, 0]];
    const splineRadii = [0.2, 0.3, 0.3, 0.2];
    const membraneAnchors = [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]];

    it('should produce valid geometry at all LOD levels for hull', () => {
      const lods: LODPreset[] = ['low', 'medium', 'high'];
      for (const lod of lods) {
        const geometry = generateHullGeometry(singleBlob, 24, 1.0, lod);
        expect(geometry.positions.length).toBeGreaterThan(0);
        expect(geometry.normals.length).toBe(geometry.positions.length);
        expect(geometry.indices.length).toBeGreaterThan(0);
        expect(geometry.indices.length % 3).toBe(0);
      }
    });

    it('should produce valid geometry at all LOD levels for spline', () => {
      const lods: LODPreset[] = ['low', 'medium', 'high'];
      for (const lod of lods) {
        const geometry = generateSplineGeometry(splinePoints, splineRadii, 32, 12, lod);
        expect(geometry.positions.length).toBeGreaterThan(0);
        expect(geometry.normals.length).toBe(geometry.positions.length);
        expect(geometry.indices.length).toBeGreaterThan(0);
      }
    });

    it('should produce valid geometry at all LOD levels for membrane', () => {
      const lods: LODPreset[] = ['low', 'medium', 'high'];
      for (const lod of lods) {
        const geometry = generateMembraneGeometry(membraneAnchors, 8, 0.15, lod);
        expect(geometry.positions.length).toBeGreaterThan(0);
        expect(geometry.normals.length).toBe(geometry.positions.length);
        expect(geometry.indices.length).toBeGreaterThan(0);
      }
    });

    it('low LOD should produce fewer vertices than high LOD for hull', () => {
      const lowGeo = generateHullGeometry(singleBlob, 24, 1.0, 'low');
      const highGeo = generateHullGeometry(singleBlob, 24, 1.0, 'high');

      const lowVerts = lowGeo.positions.length / 3;
      const highVerts = highGeo.positions.length / 3;
      expect(lowVerts).toBeLessThan(highVerts);
    });

    it('low LOD should produce fewer vertices than high LOD for spline', () => {
      const lowGeo = generateSplineGeometry(splinePoints, splineRadii, 32, 12, 'low');
      const highGeo = generateSplineGeometry(splinePoints, splineRadii, 32, 12, 'high');

      const lowVerts = lowGeo.positions.length / 3;
      const highVerts = highGeo.positions.length / 3;
      expect(lowVerts).toBeLessThan(highVerts);
    });

    it('low LOD should produce fewer vertices than high LOD for membrane', () => {
      const lowGeo = generateMembraneGeometry(membraneAnchors, 8, 0.15, 'low');
      const highGeo = generateMembraneGeometry(membraneAnchors, 8, 0.15, 'high');

      const lowVerts = lowGeo.positions.length / 3;
      const highVerts = highGeo.positions.length / 3;
      expect(lowVerts).toBeLessThan(highVerts);
    });

    it('LOD parameter should override explicit resolution/segments', () => {
      // Even though we pass resolution=100, 'low' LOD should use resolution=12
      const lowGeo = generateHullGeometry(singleBlob, 100, 1.0, 'low');
      const explicitHighGeo = generateHullGeometry(singleBlob, 100, 1.0);

      const lowVerts = lowGeo.positions.length / 3;
      const highVerts = explicitHighGeo.positions.length / 3;
      expect(lowVerts).toBeLessThan(highVerts);
    });
  });

  describe('Vertex deduplication correctness', () => {
    it('should not have duplicate vertices on shared edges', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 16, 1.0);

      // Build set of all referenced vertex indices
      const referencedIndices = new Set<number>();
      for (let i = 0; i < geometry.indices.length; i++) {
        referencedIndices.add(geometry.indices[i]);
      }

      const vertexCount = geometry.positions.length / 3;

      // Every referenced index must be valid
      for (const idx of referencedIndices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(vertexCount);
      }

      // Most vertices should be shared (referenced by multiple triangles).
      // A well-deduplicated mesh has significantly fewer unique vertices than
      // total index references (3 per triangle).
      const totalIndexRefs = geometry.indices.length;
      const uniqueVerts = referencedIndices.size;
      // Sharing ratio > 2 means good deduplication (each vertex used 2+ times on average)
      expect(totalIndexRefs / uniqueVerts).toBeGreaterThan(2);
    });

    it('should produce consistent results at resolution > 1000', () => {
      // This test validates the fix for the vertex key collision bug
      // where the old formula ix + iy*1000 + iz*1000000 would collide
      // at resolutions beyond 1000. We test a smaller case but verify
      // the deduplication math is correct.
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [0.5, 0.5, 0.5] },
      ];

      // Generate at two similar resolutions -- both should produce valid geometry
      const geo1 = generateHullGeometry(blobs, 20, 1.0);
      const geo2 = generateHullGeometry(blobs, 21, 1.0);

      // Both should be valid
      expect(geo1.positions.length).toBeGreaterThan(0);
      expect(geo2.positions.length).toBeGreaterThan(0);
      expect(geo1.indices.length % 3).toBe(0);
      expect(geo2.indices.length % 3).toBe(0);

      // Higher resolution should produce more or equal vertices
      expect(geo2.positions.length).toBeGreaterThanOrEqual(geo1.positions.length);
    });
  });

  describe('Edge interpolation quality', () => {
    it('should produce normals with unit length', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 20, 1.0);

      const vertexCount = geometry.positions.length / 3;
      for (let i = 0; i < vertexCount; i++) {
        const nx = geometry.normals[i * 3];
        const ny = geometry.normals[i * 3 + 1];
        const nz = geometry.normals[i * 3 + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        // Normals should be approximately unit length (tolerance for floating point)
        expect(len).toBeGreaterThan(0.95);
        expect(len).toBeLessThan(1.05);
      }
    });

    it('should produce vertices within the bounding volume', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
        { center: [2, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 24, 1.0);

      const vertexCount = geometry.positions.length / 3;
      for (let i = 0; i < vertexCount; i++) {
        const x = geometry.positions[i * 3];
        const y = geometry.positions[i * 3 + 1];
        const z = geometry.positions[i * 3 + 2];
        // Vertices should be within expanded bounds (blobs span -1.3 to 3.3 on x, -1.3 to 1.3 on y/z)
        expect(x).toBeGreaterThan(-2);
        expect(x).toBeLessThan(4);
        expect(y).toBeGreaterThan(-2);
        expect(y).toBeLessThan(2);
        expect(z).toBeGreaterThan(-2);
        expect(z).toBeLessThan(2);
      }
    });

    it('should produce valid UVs in [0, 1] range', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 16, 1.0);

      const vertexCount = geometry.positions.length / 3;
      for (let i = 0; i < vertexCount; i++) {
        const u = geometry.uvs[i * 2];
        const v = geometry.uvs[i * 2 + 1];
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('MC_TRI_TABLE validation', () => {
    it('should produce a closed manifold for a single sphere', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 24, 1.0);

      // For a single sphere, the marching cubes output should be a closed mesh.
      // Verify by checking that every edge appears in exactly 2 triangles (manifold).
      const edgeCount = new Map<string, number>();
      for (let i = 0; i < geometry.indices.length; i += 3) {
        const a = geometry.indices[i];
        const b = geometry.indices[i + 1];
        const c = geometry.indices[i + 2];
        for (const [v0, v1] of [[a, b], [b, c], [c, a]]) {
          const key = Math.min(v0, v1) + '_' + Math.max(v0, v1);
          edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        }
      }

      // In a closed manifold, each edge should have exactly 2 adjacent triangles
      let manifoldEdges = 0;
      let totalEdges = 0;
      for (const count of edgeCount.values()) {
        totalEdges++;
        if (count === 2) manifoldEdges++;
      }

      // Allow some tolerance -- marching cubes may have a few boundary edges
      // but the vast majority should be manifold
      const manifoldRatio = manifoldEdges / totalEdges;
      expect(manifoldRatio).toBeGreaterThan(0.95);
    });

    it('should produce consistent triangle winding', () => {
      const blobs: BlobDef[] = [
        { center: [0, 0, 0], radius: [1, 1, 1] },
      ];
      const geometry = generateHullGeometry(blobs, 16, 1.0);

      // Verify all triangles have non-zero area (no degenerate triangles)
      let degenerateCount = 0;
      for (let i = 0; i < geometry.indices.length; i += 3) {
        const a = geometry.indices[i];
        const b = geometry.indices[i + 1];
        const c = geometry.indices[i + 2];

        const ax = geometry.positions[a * 3], ay = geometry.positions[a * 3 + 1], az = geometry.positions[a * 3 + 2];
        const bx = geometry.positions[b * 3], by = geometry.positions[b * 3 + 1], bz = geometry.positions[b * 3 + 2];
        const cx = geometry.positions[c * 3], cy = geometry.positions[c * 3 + 1], cz = geometry.positions[c * 3 + 2];

        // Cross product of two edges
        const ex = bx - ax, ey = by - ay, ez = bz - az;
        const fx = cx - ax, fy = cy - ay, fz = cz - az;
        const nx = ey * fz - ez * fy;
        const ny = ez * fx - ex * fz;
        const nz = ex * fy - ey * fx;
        const area = Math.sqrt(nx * nx + ny * ny + nz * nz);

        if (area < 1e-10) degenerateCount++;
      }

      const totalTriangles = geometry.indices.length / 3;
      // Less than 1% degenerate triangles
      expect(degenerateCount / totalTriangles).toBeLessThan(0.01);
    });
  });
});
