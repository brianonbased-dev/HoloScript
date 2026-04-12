import { describe, it, expect } from 'vitest';
import {
  meshBox,
  meshSurface,
  meshQuality,
  findNodesOnFace,
  findNodesInSphere,
} from '../AutoMesher';
import { tet4ToTet10 } from '../StructuralSolverTET10';

describe('AutoMesher', () => {
  describe('meshBox', () => {
    it('generates correct node and element counts', () => {
      const mesh = meshBox({ size: [1, 1, 1], divisions: [2, 2, 2] });
      expect(mesh.nodeCount).toBe(3 * 3 * 3); // 27
      expect(mesh.elementCount).toBe(2 * 2 * 2 * 5); // 40
      expect(mesh.vertices.length).toBe(27 * 3);
      expect(mesh.tetrahedra.length).toBe(40 * 4);
    });

    it('respects origin offset', () => {
      const mesh = meshBox({ origin: [10, 20, 30], size: [1, 1, 1], divisions: [1, 1, 1] });
      // First vertex at origin
      expect(mesh.vertices[0]).toBeCloseTo(10);
      expect(mesh.vertices[1]).toBeCloseTo(20);
      expect(mesh.vertices[2]).toBeCloseTo(30);
      // Last vertex at origin + size
      const last = (mesh.nodeCount - 1) * 3;
      expect(mesh.vertices[last]).toBeCloseTo(11);
      expect(mesh.vertices[last + 1]).toBeCloseTo(21);
      expect(mesh.vertices[last + 2]).toBeCloseTo(31);
    });

    it('produces positive-volume elements', () => {
      const mesh = meshBox({ size: [2, 3, 4], divisions: [3, 3, 3] });
      const quality = meshQuality(mesh);
      expect(quality.invertedCount).toBe(0);
      expect(quality.minVolume).toBeGreaterThan(0);
    });

    it('total volume equals box volume', () => {
      const mesh = meshBox({ size: [2, 3, 5], divisions: [4, 4, 4] });
      const quality = meshQuality(mesh);
      const totalVol = quality.avgVolume * mesh.elementCount;
      expect(totalVol).toBeCloseTo(2 * 3 * 5, 5);
    });

    it('throws on invalid dimensions', () => {
      expect(() => meshBox({ size: [0, 1, 1] })).toThrow();
      expect(() => meshBox({ size: [1, 1, 1], divisions: [0, 1, 1] })).toThrow();
    });
  });

  describe('findNodesOnFace', () => {
    it('finds nodes on each face of a unit cube', () => {
      const mesh = meshBox({ size: [1, 1, 1], divisions: [2, 2, 2] });
      // Each face of a 2×2×2 grid has (2+1)×(2+1) = 9 nodes
      expect(findNodesOnFace(mesh, 'x-').length).toBe(9);
      expect(findNodesOnFace(mesh, 'x+').length).toBe(9);
      expect(findNodesOnFace(mesh, 'y-').length).toBe(9);
      expect(findNodesOnFace(mesh, 'y+').length).toBe(9);
      expect(findNodesOnFace(mesh, 'z-').length).toBe(9);
      expect(findNodesOnFace(mesh, 'z+').length).toBe(9);
    });

    it('works with offset origin', () => {
      const mesh = meshBox({ origin: [5, 5, 5], size: [1, 1, 1], divisions: [1, 1, 1] });
      const xMinus = findNodesOnFace(mesh, 'x-');
      expect(xMinus.length).toBe(4); // 2×2 face
      // All nodes at x=5
      for (const n of xMinus) {
        expect(mesh.vertices[n * 3]).toBeCloseTo(5);
      }
    });
  });

  describe('findNodesInSphere', () => {
    it('finds nodes within a radius', () => {
      const mesh = meshBox({ size: [1, 1, 1], divisions: [4, 4, 4] });
      const center: [number, number, number] = [0.5, 0.5, 0.5];
      const nodes = findNodesInSphere(mesh, center, 0.1);
      expect(nodes.length).toBeGreaterThan(0);
      // All found nodes should be within radius
      for (const n of nodes) {
        const dx = mesh.vertices[n * 3] - 0.5;
        const dy = mesh.vertices[n * 3 + 1] - 0.5;
        const dz = mesh.vertices[n * 3 + 2] - 0.5;
        expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeLessThanOrEqual(0.1 + 1e-10);
      }
    });
  });

  describe('meshQuality', () => {
    it('reports quality stats for a regular mesh', () => {
      const mesh = meshBox({ size: [1, 1, 1], divisions: [3, 3, 3] });
      const q = meshQuality(mesh);
      expect(q.invertedCount).toBe(0);
      expect(q.minVolume).toBeGreaterThan(0);
      expect(q.maxVolume).toBeGreaterThan(0);
      expect(q.avgVolume).toBeGreaterThan(0);
      expect(q.minAspectRatio).toBeGreaterThan(0);
      expect(q.minAspectRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('meshSurface (fallback)', () => {
    it('generates a tet mesh from surface triangles (bbox fallback)', async () => {
      // Simple cube surface: 8 vertices, 12 triangles
      const vertices = new Float64Array([
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
        0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
      ]);
      const triangles = new Uint32Array([
        0, 1, 2, 0, 2, 3, // -z
        4, 6, 5, 4, 7, 6, // +z
        0, 4, 5, 0, 5, 1, // -y
        2, 6, 7, 2, 7, 3, // +y
        0, 3, 7, 0, 7, 4, // -x
        1, 5, 6, 1, 6, 2, // +x
      ]);

      const mesh = await meshSurface({ vertices, triangles });
      expect(mesh.nodeCount).toBeGreaterThan(0);
      expect(mesh.elementCount).toBeGreaterThan(0);
      const q = meshQuality(mesh);
      expect(q.invertedCount).toBe(0);
    });
  });

  describe('TET10 upgrade integration', () => {
    it('meshBox → tet4ToTet10 produces valid TET10 mesh', () => {
      const tet4 = meshBox({ size: [1, 1, 1], divisions: [2, 2, 2] });
      const tet10 = tet4ToTet10(tet4.vertices, tet4.tetrahedra);

      // TET10 should have more nodes (mid-edge) but same element count
      expect(tet10.vertices.length / 3).toBeGreaterThan(tet4.nodeCount);
      expect(tet10.tetrahedra.length / 10).toBe(tet4.elementCount);
    });
  });
});
