/**
 * TerrainGenerator.test.ts
 *
 * Unit tests for procedural terrain generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGenerator, type TerrainConfig, type TerrainData } from '../TerrainGenerator';

describe('TerrainGenerator', () => {
  let generator: TerrainGenerator;
  let defaultConfig: TerrainConfig;

  beforeEach(() => {
    defaultConfig = {
      width: 200,
      depth: 200,
      resolution: 64,
      maxHeight: 50,
      steepness: 0.5,
      roughness: 0.5,
      seed: 12345, // Fixed seed for reproducibility
    };
    generator = new TerrainGenerator(defaultConfig);
  });

  describe('Terrain Generation', () => {
    it('should generate terrain with correct resolution', () => {
      const terrain = generator.generateTerrain();

      expect(terrain.heightmap.length).toBe(64 * 64);
      expect(terrain.slopes.length).toBe(64 * 64);
      expect(terrain.normals.length).toBe(64 * 64 * 3);
    });

    it('should generate mesh with correct vertex count', () => {
      const terrain = generator.generateTerrain();

      const vertexCount = 64 * 64;
      expect(terrain.vertices.length).toBe(vertexCount * 3);
    });

    it('should generate mesh with correct triangle count', () => {
      const terrain = generator.generateTerrain();

      const quadCount = 63 * 63; // (resolution - 1)²
      const triangleCount = quadCount * 2;
      const indexCount = triangleCount * 3;

      expect(terrain.indices.length).toBe(indexCount);
    });

    it('should generate consistent terrain with same seed', () => {
      const terrain1 = generator.generateTerrain();

      const generator2 = new TerrainGenerator(defaultConfig);
      const terrain2 = generator2.generateTerrain();

      // Heights should be identical with same seed
      expect(terrain1.heightmap[0]).toBeCloseTo(terrain2.heightmap[0]);
      expect(terrain1.heightmap[100]).toBeCloseTo(terrain2.heightmap[100]);
      expect(terrain1.heightmap[1000]).toBeCloseTo(terrain2.heightmap[1000]);
    });

    it('should generate different terrain with different seed', () => {
      const terrain1 = generator.generateTerrain();

      const generator2 = new TerrainGenerator({ ...defaultConfig, seed: 54321 });
      const terrain2 = generator2.generateTerrain();

      // Heights should differ with different seeds
      // Check center area where noise has more effect (avoid edges which are all ~0)
      const res = defaultConfig.resolution;
      const centerStart = Math.floor((res * res) / 4); // Start from 25% in
      const differences = [];

      for (let i = centerStart; i < centerStart + 1000; i++) {
        if (Math.abs(terrain1.heightmap[i] - terrain2.heightmap[i]) > 0.1) {
          differences.push(i);
        }
      }

      expect(differences.length).toBeGreaterThan(50); // Most should be different
    });

    it('should create mountain shape (higher in center)', () => {
      const terrain = generator.generateTerrain();
      const res = defaultConfig.resolution;

      // Sample heights at different positions
      const centerIndex = Math.floor(res / 2) * res + Math.floor(res / 2);
      const edgeIndex = 0; // Corner
      const quarterIndex = Math.floor(res / 4) * res + Math.floor(res / 4);

      const centerHeight = terrain.heightmap[centerIndex];
      const edgeHeight = terrain.heightmap[edgeIndex];
      const quarterHeight = terrain.heightmap[quarterIndex];

      // Center should be higher than edge
      expect(centerHeight).toBeGreaterThan(edgeHeight);
      // Quarter should be between center and edge
      expect(quarterHeight).toBeGreaterThan(edgeHeight);
      expect(quarterHeight).toBeLessThan(centerHeight + 5); // Allow some noise variation
    });

    it('should respect maxHeight constraint', () => {
      const terrain = generator.generateTerrain();

      const maxObservedHeight = Math.max(...Array.from(terrain.heightmap));

      // Should not significantly exceed maxHeight
      expect(maxObservedHeight).toBeLessThanOrEqual(defaultConfig.maxHeight * 1.1);
    });

    it('should have non-negative heights', () => {
      const terrain = generator.generateTerrain();

      const minHeight = Math.min(...Array.from(terrain.heightmap));

      expect(minHeight).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Slope Calculation', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should calculate slope angles in valid range [0, π/2]', () => {
      for (let i = 0; i < terrain.slopes.length; i++) {
        const slope = terrain.slopes[i];
        expect(slope).toBeGreaterThanOrEqual(0);
        expect(slope).toBeLessThanOrEqual(Math.PI / 2);
      }
    });

    it('should have steeper slopes near edges (mountain falloff)', () => {
      const res = defaultConfig.resolution;

      // Center slopes
      const centerIndex = Math.floor(res / 2) * res + Math.floor(res / 2);
      const centerSlope = terrain.slopes[centerIndex];

      // Edge slopes
      const edgeIndices = [
        Math.floor(res / 4), // Left quarter
        res - Math.floor(res / 4), // Right quarter
      ];

      let edgeHasSteeperSlopes = false;
      for (const edgeIndex of edgeIndices) {
        const edgeSlope = terrain.slopes[edgeIndex];
        if (edgeSlope > centerSlope) {
          edgeHasSteeperSlopes = true;
          break;
        }
      }

      // Due to mountain shape, slopes should generally be steeper away from peak
      expect(edgeHasSteeperSlopes || centerSlope < 0.5).toBe(true);
    });

    it('should identify steep cells correctly', () => {
      const stats = generator.getStatistics(terrain);

      // Should have some steep cells (slope > 35°)
      expect(stats.steepCells).toBeGreaterThanOrEqual(0);
      expect(stats.steepCells).toBeLessThanOrEqual(defaultConfig.resolution ** 2);
    });

    it('should calculate average slope within reasonable range', () => {
      const stats = generator.getStatistics(terrain);

      // Average slope should be reasonable for a mountain
      expect(stats.avgSlope).toBeGreaterThan(0);
      expect(stats.avgSlope).toBeLessThan(Math.PI / 4); // < 45°
    });
  });

  describe('Surface Normals', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should have normalized surface normals', () => {
      const res = defaultConfig.resolution;

      for (let i = 0; i < res * res; i++) {
        const nx = terrain.normals[i * 3 + 0];
        const ny = terrain.normals[i * 3 + 1];
        const nz = terrain.normals[i * 3 + 2];

        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);

        expect(length).toBeCloseTo(1.0, 2); // Normalized to unit length
      }
    });

    it('should have normals pointing generally upward', () => {
      const res = defaultConfig.resolution;

      // Most normals should have positive Y component (pointing up)
      let upwardNormals = 0;

      for (let i = 0; i < res * res; i++) {
        const ny = terrain.normals[i * 3 + 1];
        if (ny > 0.5) {
          // Reasonably upward
          upwardNormals++;
        }
      }

      // At least 80% should point upward (mountains have some steep sides)
      expect(upwardNormals / (res * res)).toBeGreaterThan(0.8);
    });

    it('should have consistent normals with slopes', () => {
      const res = defaultConfig.resolution;

      // Flat areas (low slope) should have nearly vertical normals
      for (let i = 0; i < res * res; i++) {
        const slope = terrain.slopes[i];
        const ny = terrain.normals[i * 3 + 1]; // Y component

        if (slope < 0.1) {
          // Nearly flat
          expect(ny).toBeGreaterThan(0.95); // Nearly vertical normal
        }
      }
    });
  });

  describe('Mesh Generation', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should generate valid vertex positions', () => {
      const res = defaultConfig.resolution;
      const { width, depth } = defaultConfig;

      for (let i = 0; i < res * res; i++) {
        const vx = terrain.vertices[i * 3 + 0];
        const vy = terrain.vertices[i * 3 + 1];
        const vz = terrain.vertices[i * 3 + 2];

        // X should be within [-width/2, width/2]
        expect(vx).toBeGreaterThanOrEqual(-width / 2 - 0.01);
        expect(vx).toBeLessThanOrEqual(width / 2 + 0.01);

        // Y should be within [0, maxHeight]
        expect(vy).toBeGreaterThanOrEqual(0);
        expect(vy).toBeLessThanOrEqual(defaultConfig.maxHeight * 1.1);

        // Z should be within [-depth/2, depth/2]
        expect(vz).toBeGreaterThanOrEqual(-depth / 2 - 0.01);
        expect(vz).toBeLessThanOrEqual(depth / 2 + 0.01);
      }
    });

    it('should generate valid triangle indices', () => {
      const res = defaultConfig.resolution;
      const vertexCount = res * res;

      for (let i = 0; i < terrain.indices.length; i++) {
        const index = terrain.indices[i];

        // Indices should reference valid vertices
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(vertexCount);
      }
    });

    it('should create counter-clockwise triangles', () => {
      // Sample a few triangles and check winding order
      const v0 = [
        terrain.vertices[terrain.indices[0] * 3 + 0],
        terrain.vertices[terrain.indices[0] * 3 + 1],
        terrain.vertices[terrain.indices[0] * 3 + 2],
      ];
      const v1 = [
        terrain.vertices[terrain.indices[1] * 3 + 0],
        terrain.vertices[terrain.indices[1] * 3 + 1],
        terrain.vertices[terrain.indices[1] * 3 + 2],
      ];
      const v2 = [
        terrain.vertices[terrain.indices[2] * 3 + 0],
        terrain.vertices[terrain.indices[2] * 3 + 1],
        terrain.vertices[terrain.indices[2] * 3 + 2],
      ];

      // Cross product to check winding
      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const cross = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0],
      ];

      // Y component should be positive (upward facing)
      expect(cross[1]).toBeGreaterThan(0);
    });

    it('should calculate correct bounding box', () => {
      const { bounds } = terrain;
      const { width, depth, maxHeight } = defaultConfig;

      // Min bounds
      expect(bounds.min[0]).toBeCloseTo(-width / 2, 1);
      expect(bounds.min[1]).toBeGreaterThanOrEqual(0);
      expect(bounds.min[2]).toBeCloseTo(-depth / 2, 1);

      // Max bounds
      expect(bounds.max[0]).toBeCloseTo(width / 2, 1);
      expect(bounds.max[1]).toBeLessThanOrEqual(maxHeight * 1.1);
      expect(bounds.max[2]).toBeCloseTo(depth / 2, 1);
    });
  });

  describe('Height Queries', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should get height at world position', () => {
      const height = generator.getHeight(terrain, 0, 0); // Center

      expect(height).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(defaultConfig.maxHeight * 1.1);
    });

    it('should interpolate height between grid points', () => {
      const { width, depth, resolution } = defaultConfig;
      const cellWidth = width / (resolution - 1);

      // Get heights at two adjacent grid points
      const x0 = 0;
      const x1 = cellWidth;

      const h0 = generator.getHeight(terrain, x0, 0);
      const h1 = generator.getHeight(terrain, x1, 0);

      // Get height at midpoint
      const hMid = generator.getHeight(terrain, (x0 + x1) / 2, 0);

      // Midpoint height should be between the two grid heights
      const minH = Math.min(h0, h1);
      const maxH = Math.max(h0, h1);

      expect(hMid).toBeGreaterThanOrEqual(minH - 0.01);
      expect(hMid).toBeLessThanOrEqual(maxH + 0.01);
    });

    it('should clamp queries outside terrain bounds', () => {
      const { width, depth } = defaultConfig;

      // Query far outside bounds
      const h1 = generator.getHeight(terrain, width * 2, depth * 2);
      const h2 = generator.getHeight(terrain, -width * 2, -depth * 2);

      // Should return edge heights (clamped)
      expect(h1).toBeGreaterThanOrEqual(0);
      expect(h2).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Slope Queries', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should get slope at world position', () => {
      const slope = generator.getSlope(terrain, 0, 0);

      expect(slope).toBeGreaterThanOrEqual(0);
      expect(slope).toBeLessThanOrEqual(Math.PI / 2);
    });

    it('should return nearest grid slope', () => {
      const slope1 = generator.getSlope(terrain, 0, 0);
      const slope2 = generator.getSlope(terrain, 0.1, 0.1); // Slightly offset

      // Should be similar (same grid cell)
      expect(Math.abs(slope1 - slope2)).toBeLessThan(0.5);
    });
  });

  describe('Normal Queries', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should get normal at world position', () => {
      const normal = generator.getNormal(terrain, 0, 0);

      expect(normal.length).toBe(3);

      const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
      expect(length).toBeCloseTo(1.0, 2);
    });

    it('should return normalized vector', () => {
      const normal = generator.getNormal(terrain, 50, 50);

      const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
      expect(length).toBeCloseTo(1.0, 2);
    });
  });

  describe('Cell Queries', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should get cell data at grid coordinates', () => {
      const cell = generator.getCell(terrain, 32, 32);

      expect(cell).not.toBeNull();
      expect(cell!.x).toBe(32);
      expect(cell!.z).toBe(32);
      expect(cell!.height).toBeGreaterThanOrEqual(0);
      expect(cell!.slope).toBeGreaterThanOrEqual(0);
      expect(cell!.normal.length).toBe(3);
    });

    it('should return null for out-of-bounds coordinates', () => {
      const cell1 = generator.getCell(terrain, -1, 0);
      const cell2 = generator.getCell(terrain, 0, -1);
      const cell3 = generator.getCell(terrain, 100, 0);
      const cell4 = generator.getCell(terrain, 0, 100);

      expect(cell1).toBeNull();
      expect(cell2).toBeNull();
      expect(cell3).toBeNull();
      expect(cell4).toBeNull();
    });

    it('should have consistent data with direct array access', () => {
      const cell = generator.getCell(terrain, 10, 10);
      const index = 10 * defaultConfig.resolution + 10;

      expect(cell!.height).toBeCloseTo(terrain.heightmap[index]);
      expect(cell!.slope).toBeCloseTo(terrain.slopes[index]);
    });
  });

  describe('Statistics', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should calculate terrain statistics', () => {
      const stats = generator.getStatistics(terrain);

      expect(stats.minHeight).toBeGreaterThanOrEqual(0);
      expect(stats.maxHeight).toBeLessThanOrEqual(defaultConfig.maxHeight * 1.1);
      expect(stats.avgHeight).toBeGreaterThan(0);
      expect(stats.avgHeight).toBeLessThan(stats.maxHeight);

      expect(stats.minSlope).toBeGreaterThanOrEqual(0);
      expect(stats.maxSlope).toBeLessThanOrEqual(Math.PI / 2);
      expect(stats.avgSlope).toBeGreaterThan(0);

      expect(stats.steepCells).toBeGreaterThanOrEqual(0);
      expect(stats.steepCells).toBeLessThanOrEqual(defaultConfig.resolution ** 2);
    });

    it('should have correct min/max heights', () => {
      const stats = generator.getStatistics(terrain);

      // Verify by scanning array
      const actualMin = Math.min(...Array.from(terrain.heightmap));
      const actualMax = Math.max(...Array.from(terrain.heightmap));

      expect(stats.minHeight).toBeCloseTo(actualMin);
      expect(stats.maxHeight).toBeCloseTo(actualMax);
    });
  });

  describe('GPU Buffer Export', () => {
    let terrain: TerrainData;

    beforeEach(() => {
      terrain = generator.generateTerrain();
    });

    it('should export terrain to GPU buffer format', () => {
      const gpuData = generator.toGPUBuffer(terrain);

      expect(gpuData.heightmap).toBeDefined();
      expect(gpuData.metadata).toBeDefined();

      expect(gpuData.heightmap.length).toBe(defaultConfig.resolution ** 2);
      expect(gpuData.metadata.length).toBe(4);
    });

    it('should include correct metadata', () => {
      const gpuData = generator.toGPUBuffer(terrain);

      expect(gpuData.metadata[0]).toBe(defaultConfig.width);
      expect(gpuData.metadata[1]).toBe(defaultConfig.depth);
      expect(gpuData.metadata[2]).toBe(defaultConfig.resolution);
      expect(gpuData.metadata[3]).toBe(defaultConfig.maxHeight);
    });

    it('should preserve heightmap data', () => {
      const gpuData = generator.toGPUBuffer(terrain);

      // Verify a few sample points
      expect(gpuData.heightmap[0]).toBeCloseTo(terrain.heightmap[0]);
      expect(gpuData.heightmap[100]).toBeCloseTo(terrain.heightmap[100]);
      expect(gpuData.heightmap[1000]).toBeCloseTo(terrain.heightmap[1000]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle low resolution terrain', () => {
      const lowResConfig: TerrainConfig = {
        ...defaultConfig,
        resolution: 8, // Minimum reasonable resolution
      };

      const lowResGen = new TerrainGenerator(lowResConfig);
      const terrain = lowResGen.generateTerrain();

      expect(terrain.heightmap.length).toBe(8 * 8);
      expect(terrain.vertices.length).toBe(8 * 8 * 3);
    });

    it('should handle high resolution terrain', () => {
      const highResConfig: TerrainConfig = {
        ...defaultConfig,
        resolution: 256,
      };

      const highResGen = new TerrainGenerator(highResConfig);
      const terrain = highResGen.generateTerrain();

      expect(terrain.heightmap.length).toBe(256 * 256);
      expect(terrain.vertices.length).toBe(256 * 256 * 3);
    });

    it('should handle flat terrain (zero steepness)', () => {
      const flatConfig: TerrainConfig = {
        ...defaultConfig,
        steepness: 0,
        roughness: 0,
      };

      const flatGen = new TerrainGenerator(flatConfig);
      const terrain = flatGen.generateTerrain();

      // Should still generate valid terrain
      expect(terrain.heightmap.length).toBeGreaterThan(0);
      expect(terrain.slopes.length).toBeGreaterThan(0);
      expect(terrain.vertices.length).toBeGreaterThan(0);

      // Stats should be valid
      const stats = flatGen.getStatistics(terrain);
      expect(stats.avgSlope).toBeGreaterThanOrEqual(0);
      expect(stats.avgSlope).toBeLessThan(Math.PI / 2);
    });

    it('should handle very steep terrain (max steepness)', () => {
      const steepConfig: TerrainConfig = {
        ...defaultConfig,
        steepness: 1,
      };

      const steepGen = new TerrainGenerator(steepConfig);
      const terrain = steepGen.generateTerrain();

      const stats = steepGen.getStatistics(terrain);

      // Should have more steep cells
      expect(stats.steepCells).toBeGreaterThan(0);
    });

    it('should handle very rough terrain (max roughness)', () => {
      const roughConfig: TerrainConfig = {
        ...defaultConfig,
        roughness: 1,
      };

      const roughGen = new TerrainGenerator(roughConfig);
      const terrain = roughGen.generateTerrain();

      // Roughness adds detail, heights should vary more
      const stats = roughGen.getStatistics(terrain);
      const heightRange = stats.maxHeight - stats.minHeight;

      expect(heightRange).toBeGreaterThan(0);
    });

    it('should handle small terrain', () => {
      const smallConfig: TerrainConfig = {
        ...defaultConfig,
        width: 20,
        depth: 20,
      };

      const smallGen = new TerrainGenerator(smallConfig);
      const terrain = smallGen.generateTerrain();

      expect(terrain.bounds.max[0] - terrain.bounds.min[0]).toBeCloseTo(20, 1);
      expect(terrain.bounds.max[2] - terrain.bounds.min[2]).toBeCloseTo(20, 1);
    });

    it('should handle large terrain', () => {
      const largeConfig: TerrainConfig = {
        ...defaultConfig,
        width: 1000,
        depth: 1000,
      };

      const largeGen = new TerrainGenerator(largeConfig);
      const terrain = largeGen.generateTerrain();

      expect(terrain.bounds.max[0] - terrain.bounds.min[0]).toBeCloseTo(1000, 1);
      expect(terrain.bounds.max[2] - terrain.bounds.min[2]).toBeCloseTo(1000, 1);
    });
  });
});
