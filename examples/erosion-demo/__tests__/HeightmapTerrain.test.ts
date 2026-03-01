/**
 * HeightmapTerrain.test.ts
 *
 * Unit tests for editable heightmap terrain
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HeightmapTerrain, type HeightmapConfig } from '../HeightmapTerrain';

describe('HeightmapTerrain', () => {
  let config: HeightmapConfig;
  let terrain: HeightmapTerrain;

  beforeEach(() => {
    config = {
      width: 100,
      depth: 100,
      resolution: 32,
    };

    terrain = new HeightmapTerrain(config);
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      expect(terrain).toBeDefined();
      expect(terrain.config.width).toBe(100);
      expect(terrain.config.depth).toBe(100);
      expect(terrain.config.resolution).toBe(32);
    });

    it('should initialize heightmap to zero', () => {
      expect(terrain.heightmap.length).toBe(32 * 32);

      for (let i = 0; i < terrain.heightmap.length; i++) {
        expect(terrain.heightmap[i]).toBe(0);
      }
    });

    it('should initialize with custom height function', () => {
      const customTerrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => Math.abs(x) + Math.abs(z),
      });

      // Center should be near zero
      const centerHeight = customTerrain.getHeightAt(0, 0);
      expect(centerHeight).toBeLessThan(5);

      // Corners should be higher
      const cornerHeight = customTerrain.getHeightAt(40, 40);
      expect(cornerHeight).toBeGreaterThan(centerHeight + 50);
    });

    it('should calculate slopes and normals', () => {
      const stats = terrain.getStatistics();

      expect(stats.avgSlope).toBeGreaterThanOrEqual(0);
      expect(stats.maxSlope).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Height Queries', () => {
    beforeEach(() => {
      // Create simple pyramid
      terrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => 10 - Math.abs(x) - Math.abs(z),
      });
    });

    it('should get height at grid coordinates', () => {
      const centerX = Math.floor(config.resolution / 2);
      const centerZ = Math.floor(config.resolution / 2);

      const height = terrain.getHeightAtGrid(centerX, centerZ);
      expect(height).toBeGreaterThan(0);
    });

    it('should get height at world coordinates', () => {
      const height = terrain.getHeightAt(0, 0);
      expect(height).toBeGreaterThan(0);
    });

    it('should use bilinear interpolation', () => {
      // Create simple sloped terrain for clearer interpolation test
      terrain.fill(0);
      terrain.setHeightAtGrid(10, 10, 10);
      terrain.setHeightAtGrid(11, 10, 20);

      const h1 = terrain.getHeightAtGrid(10, 10);
      const h2 = terrain.getHeightAtGrid(11, 10);

      // Height at midpoint should be approximately halfway between
      const { width, resolution } = config;
      const cellSizeX = width / (resolution - 1);
      const x1 = 10 * cellSizeX - width / 2;
      const x2 = 11 * cellSizeX - width / 2;
      const xMid = (x1 + x2) / 2;
      const z = 10 * cellSizeX - width / 2;

      const hMid = terrain.getHeightAt(xMid, z);
      const expected = (h1 + h2) / 2;

      expect(hMid).toBeCloseTo(expected, 0);
    });

    it('should clamp out-of-bounds queries', () => {
      // Fill terrain to have uniform values
      terrain.fill(10);

      // Query far out of bounds should clamp to edge and return interpolated value
      const height = terrain.getHeightAt(1000, 1000);
      expect(height).toBeCloseTo(10, 1);
    });

    it('should return zero for invalid grid coordinates', () => {
      const height = terrain.getHeightAtGrid(-1, -1);
      expect(height).toBe(0);
    });
  });

  describe('Height Modification', () => {
    it('should set height at grid coordinates', () => {
      terrain.setHeightAtGrid(5, 5, 10);

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBe(10);
    });

    it('should set height at world coordinates', () => {
      // setHeightAt affects nearest grid cell, then getHeightAt interpolates
      // So we use grid coords to verify exact value
      const { width, resolution } = config;
      const centerGridX = Math.floor(resolution / 2);
      const centerGridZ = Math.floor(resolution / 2);

      terrain.setHeightAt(0, 0, 10);

      const height = terrain.getHeightAtGrid(centerGridX, centerGridZ);
      expect(height).toBe(10);
    });

    it('should modify height at grid coordinates', () => {
      terrain.setHeightAtGrid(5, 5, 10);
      terrain.modifyHeightAtGrid(5, 5, 5);

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBe(15);
    });

    it('should modify height at world coordinates', () => {
      // Fill terrain to have uniform starting values
      terrain.fill(10);

      const { resolution } = config;
      const centerGridX = Math.floor(resolution / 2);
      const centerGridZ = Math.floor(resolution / 2);

      const initialHeight = terrain.getHeightAtGrid(centerGridX, centerGridZ);

      terrain.modifyHeightAt(0, 0, 5);

      const finalHeight = terrain.getHeightAtGrid(centerGridX, centerGridZ);

      // Height should have increased
      expect(finalHeight).toBeGreaterThan(initialHeight);
      expect(finalHeight).toBeCloseTo(initialHeight + 5, 0);
    });

    it('should ignore out-of-bounds modifications', () => {
      terrain.setHeightAtGrid(-1, -1, 100);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should mark mesh dirty after modification', () => {
      const mesh1 = terrain.generateMesh();

      const { resolution } = config;
      const idx = (5 * resolution + 5) * 3; // Vertex index for cell (5, 5)

      const y1 = mesh1.vertices[idx + 1]; // Y component

      terrain.setHeightAtGrid(5, 5, 10);
      const mesh2 = terrain.generateMesh();

      const y2 = mesh2.vertices[idx + 1];

      // Y value should have changed
      expect(y2).not.toEqual(y1);
      expect(y2).toBe(10);
    });
  });

  describe('Slope Queries', () => {
    beforeEach(() => {
      // Create sloped terrain
      terrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => x * 0.5,
      });
    });

    it('should get slope at grid coordinates', () => {
      const slope = terrain.getSlopeAtGrid(5, 5);

      expect(slope).toBeGreaterThan(0);
      expect(slope).toBeLessThan(Math.PI / 2);
    });

    it('should get slope at world coordinates', () => {
      const slope = terrain.getSlopeAt(10, 10);

      expect(slope).toBeGreaterThan(0);
      expect(slope).toBeLessThan(Math.PI / 2);
    });

    it('should return zero slope for flat terrain', () => {
      terrain.fill(5);

      const slope = terrain.getSlopeAt(0, 0);
      expect(slope).toBeCloseTo(0, 2);
    });

    it('should calculate slope from height differences', () => {
      // Steep terrain
      const steepTerrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => x * 2,
      });

      // Gentle terrain
      const gentleTerrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => x * 0.1,
      });

      const steepSlope = steepTerrain.getSlopeAt(0, 0);
      const gentleSlope = gentleTerrain.getSlopeAt(0, 0);

      expect(steepSlope).toBeGreaterThan(gentleSlope);
    });
  });

  describe('Normal Queries', () => {
    beforeEach(() => {
      terrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => x * 0.5,
      });
    });

    it('should get normal at grid coordinates', () => {
      const normal = terrain.getNormalAtGrid(5, 5);

      expect(normal).toHaveLength(3);
      expect(normal[0]).toBeDefined();
      expect(normal[1]).toBeDefined();
      expect(normal[2]).toBeDefined();
    });

    it('should get normal at world coordinates', () => {
      const normal = terrain.getNormalAt(10, 10);

      expect(normal).toHaveLength(3);
    });

    it('should return normalized normals', () => {
      const normal = terrain.getNormalAt(0, 0);

      const length = Math.sqrt(
        normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]
      );

      expect(length).toBeCloseTo(1.0, 2);
    });

    it('should return up vector for flat terrain', () => {
      terrain.fill(5);

      const normal = terrain.getNormalAt(0, 0);

      expect(normal[0]).toBeCloseTo(0, 2);
      expect(normal[1]).toBeCloseTo(1, 2);
      expect(normal[2]).toBeCloseTo(0, 2);
    });

    it('should return default for invalid coordinates', () => {
      const normal = terrain.getNormalAtGrid(-1, -1);

      expect(normal).toEqual([0, 1, 0]);
    });
  });

  describe('Mesh Generation', () => {
    it('should generate mesh', () => {
      const mesh = terrain.generateMesh();

      expect(mesh.vertices).toBeDefined();
      expect(mesh.normals).toBeDefined();
      expect(mesh.indices).toBeDefined();
    });

    it('should have correct vertex count', () => {
      const mesh = terrain.generateMesh();

      const vertexCount = config.resolution * config.resolution;
      expect(mesh.vertices.length).toBe(vertexCount * 3);
      expect(mesh.normals.length).toBe(vertexCount * 3);
    });

    it('should have correct index count', () => {
      const mesh = terrain.generateMesh();

      const triangleCount = (config.resolution - 1) * (config.resolution - 1) * 2;
      expect(mesh.indices.length).toBe(triangleCount * 3);
    });

    it('should cache mesh when not dirty', () => {
      const mesh1 = terrain.generateMesh();
      const mesh2 = terrain.generateMesh();

      // Should return same reference
      expect(mesh1).toBe(mesh2);
    });

    it('should regenerate mesh after modification', () => {
      const mesh1 = terrain.generateMesh();
      terrain.setHeightAtGrid(5, 5, 10);
      const mesh2 = terrain.generateMesh();

      // Should return different reference
      expect(mesh1).not.toBe(mesh2);
    });

    it('should force mesh regeneration', () => {
      const mesh1 = terrain.generateMesh();
      const mesh2 = terrain.regenerateMesh();

      // Should return different reference
      expect(mesh1).not.toBe(mesh2);
    });

    it('should generate valid triangle indices', () => {
      const mesh = terrain.generateMesh();

      const maxIndex = config.resolution * config.resolution - 1;

      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
        expect(mesh.indices[i]).toBeLessThanOrEqual(maxIndex);
      }
    });
  });

  describe('Snapshots', () => {
    it('should save snapshot', () => {
      terrain.setHeightAtGrid(5, 5, 10);

      const id = terrain.saveSnapshot('Test snapshot');

      expect(id).toBeDefined();
      expect(id).toContain('snapshot');
    });

    it('should restore snapshot', () => {
      terrain.setHeightAtGrid(5, 5, 10);
      const id = terrain.saveSnapshot();

      terrain.setHeightAtGrid(5, 5, 20);
      expect(terrain.getHeightAtGrid(5, 5)).toBe(20);

      const restored = terrain.restoreSnapshot(id);
      expect(restored).toBe(true);
      expect(terrain.getHeightAtGrid(5, 5)).toBe(10);
    });

    it('should fail to restore invalid snapshot', () => {
      const restored = terrain.restoreSnapshot('invalid_id');
      expect(restored).toBe(false);
    });

    it('should get all snapshots', () => {
      terrain.saveSnapshot('Snapshot 1');
      terrain.saveSnapshot('Snapshot 2');

      const snapshots = terrain.getSnapshots();
      expect(snapshots.length).toBe(2);
    });

    it('should sort snapshots by timestamp', () => {
      const id1 = terrain.saveSnapshot('First');
      const id2 = terrain.saveSnapshot('Second');

      const snapshots = terrain.getSnapshots();

      expect(snapshots[0].id).toBe(id1);
      expect(snapshots[1].id).toBe(id2);
    });

    it('should delete snapshot', () => {
      const id = terrain.saveSnapshot();

      const deleted = terrain.deleteSnapshot(id);
      expect(deleted).toBe(true);

      const snapshots = terrain.getSnapshots();
      expect(snapshots.length).toBe(0);
    });

    it('should fail to delete invalid snapshot', () => {
      const deleted = terrain.deleteSnapshot('invalid_id');
      expect(deleted).toBe(false);
    });

    it('should clear all snapshots', () => {
      terrain.saveSnapshot();
      terrain.saveSnapshot();

      terrain.clearSnapshots();

      const snapshots = terrain.getSnapshots();
      expect(snapshots.length).toBe(0);
    });

    it('should preserve snapshot data independently', () => {
      terrain.setHeightAtGrid(5, 5, 10);
      const id = terrain.saveSnapshot();

      terrain.setHeightAtGrid(5, 5, 20);

      // Snapshot should still have old value
      terrain.restoreSnapshot(id);
      expect(terrain.getHeightAtGrid(5, 5)).toBe(10);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      terrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => Math.max(0, 10 - Math.abs(x) - Math.abs(z)),
      });
    });

    it('should calculate min height', () => {
      const stats = terrain.getStatistics();

      expect(stats.minHeight).toBeGreaterThanOrEqual(0);
    });

    it('should calculate max height', () => {
      const stats = terrain.getStatistics();

      expect(stats.maxHeight).toBeGreaterThan(0);
    });

    it('should calculate average height', () => {
      const stats = terrain.getStatistics();

      expect(stats.avgHeight).toBeGreaterThan(stats.minHeight);
      expect(stats.avgHeight).toBeLessThan(stats.maxHeight);
    });

    it('should calculate volume', () => {
      const stats = terrain.getStatistics();

      expect(stats.volume).toBeGreaterThan(0);
    });

    it('should calculate average slope', () => {
      const stats = terrain.getStatistics();

      expect(stats.avgSlope).toBeGreaterThan(0);
      expect(stats.avgSlope).toBeLessThan(Math.PI / 2);
    });

    it('should calculate max slope', () => {
      const stats = terrain.getStatistics();

      expect(stats.maxSlope).toBeGreaterThanOrEqual(stats.avgSlope);
    });

    it('should update statistics after modification', () => {
      const stats1 = terrain.getStatistics();

      terrain.setHeightAtGrid(5, 5, 100);

      const stats2 = terrain.getStatistics();

      expect(stats2.maxHeight).toBeGreaterThan(stats1.maxHeight);
    });
  });

  describe('Utility Methods', () => {
    it('should reset terrain', () => {
      terrain = new HeightmapTerrain({
        ...config,
        initialHeight: (x, z) => 10,
      });

      terrain.setHeightAtGrid(5, 5, 20);

      terrain.reset();

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBeCloseTo(10, 1);
    });

    it('should reset to zero without initial height', () => {
      terrain.setHeightAtGrid(5, 5, 20);

      terrain.reset();

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBe(0);
    });

    it('should fill terrain with constant height', () => {
      terrain.fill(15);

      for (let i = 0; i < terrain.heightmap.length; i++) {
        expect(terrain.heightmap[i]).toBe(15);
      }
    });

    it('should smooth terrain', () => {
      // Create terrain with a spike in the center
      terrain.fill(5);
      const { resolution } = config;
      const centerX = Math.floor(resolution / 2);
      const centerZ = Math.floor(resolution / 2);

      terrain.setHeightAtGrid(centerX, centerZ, 50);

      const heightBefore = terrain.getHeightAtGrid(centerX, centerZ);

      terrain.smooth(5);

      const heightAfter = terrain.getHeightAtGrid(centerX, centerZ);

      // Smoothing should reduce the spike
      expect(heightAfter).toBeLessThan(heightBefore);
      expect(heightAfter).toBeGreaterThan(5);
    });

    it('should smooth multiple iterations', () => {
      terrain.setHeightAtGrid(10, 10, 100);

      terrain.smooth(1);
      const height1 = terrain.getHeightAtGrid(10, 10);

      terrain.setHeightAtGrid(10, 10, 100);
      terrain.smooth(5);
      const height5 = terrain.getHeightAtGrid(10, 10);

      // More iterations = more smoothing
      expect(height5).toBeLessThan(height1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single cell terrain', () => {
      const smallTerrain = new HeightmapTerrain({
        width: 10,
        depth: 10,
        resolution: 1,
      });

      expect(smallTerrain.heightmap.length).toBe(1);
    });

    it('should handle large terrain', () => {
      const largeTerrain = new HeightmapTerrain({
        width: 1000,
        depth: 1000,
        resolution: 128,
      });

      expect(largeTerrain.heightmap.length).toBe(128 * 128);
    });

    it('should handle negative heights', () => {
      terrain.setHeightAtGrid(5, 5, -10);

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBe(-10);
    });

    it('should handle very large heights', () => {
      terrain.setHeightAtGrid(5, 5, 10000);

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBe(10000);
    });

    it('should handle rapid modifications', () => {
      for (let i = 0; i < 1000; i++) {
        terrain.modifyHeightAtGrid(5, 5, 0.1);
      }

      const height = terrain.getHeightAtGrid(5, 5);
      expect(height).toBeCloseTo(100, 1);
    });
  });
});
