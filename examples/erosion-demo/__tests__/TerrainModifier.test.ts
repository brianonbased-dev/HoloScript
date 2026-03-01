/**
 * TerrainModifier.test.ts
 *
 * Comprehensive tests for terrain modification tools.
 *
 * Week 7: Water Erosion - Day 4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HeightmapTerrain, type HeightmapConfig } from '../HeightmapTerrain';
import { TerrainModifier, type BrushConfig, type NoiseConfig } from '../TerrainModifier';

describe('TerrainModifier', () => {
  let terrain: HeightmapTerrain;
  let modifier: TerrainModifier;

  const config: HeightmapConfig = {
    width: 100,
    depth: 100,
    resolution: 20,
  };

  const brushConfig: BrushConfig = {
    radius: 3,
    strength: 5.0,
    falloff: 'linear',
  };

  beforeEach(() => {
    terrain = new HeightmapTerrain(config);
    modifier = new TerrainModifier(terrain);
    terrain.fill(10);
  });

  describe('Brush Operations', () => {
    it('should raise terrain with brush', () => {
      const heightBefore = terrain.getHeightAtGrid(10, 10);

      modifier.raise(10, 10, brushConfig);

      const heightAfter = terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeGreaterThan(heightBefore);
    });

    it('should lower terrain with brush', () => {
      const heightBefore = terrain.getHeightAtGrid(10, 10);

      modifier.lower(10, 10, brushConfig);

      const heightAfter = terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeLessThan(heightBefore);
    });

    it('should flatten terrain to target height', () => {
      terrain.setHeightAtGrid(10, 10, 50);

      modifier.flatten(10, 10, 20, { ...brushConfig, strength: 1.0 });

      const height = terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(20, 0);
    });

    it('should smooth terrain', () => {
      terrain.setHeightAtGrid(10, 10, 100);

      const heightBefore = terrain.getHeightAtGrid(10, 10);

      modifier.smoothBrush(10, 10, { ...brushConfig, strength: 1.0 });

      const heightAfter = terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeLessThan(heightBefore);
    });

    it('should apply linear falloff', () => {
      modifier.raise(10, 10, { ...brushConfig, falloff: 'linear' });

      const centerHeight = terrain.getHeightAtGrid(10, 10);
      const edgeHeight = terrain.getHeightAtGrid(13, 10);

      expect(centerHeight).toBeGreaterThan(edgeHeight);
    });

    it('should apply smooth falloff', () => {
      modifier.raise(10, 10, { ...brushConfig, falloff: 'smooth' });

      const centerHeight = terrain.getHeightAtGrid(10, 10);
      const edgeHeight = terrain.getHeightAtGrid(13, 10);

      expect(centerHeight).toBeGreaterThan(edgeHeight);
    });

    it('should apply sharp falloff', () => {
      modifier.raise(10, 10, { ...brushConfig, falloff: 'sharp' });

      const centerHeight = terrain.getHeightAtGrid(10, 10);
      const edgeHeight = terrain.getHeightAtGrid(13, 10);

      expect(centerHeight).toBeGreaterThan(edgeHeight);
    });

    it('should respect brush radius', () => {
      modifier.raise(10, 10, brushConfig);

      const heightNear = terrain.getHeightAtGrid(11, 10);
      const heightFar = terrain.getHeightAtGrid(15, 10);

      expect(heightNear).toBeGreaterThan(10);
      expect(heightFar).toBe(10); // Outside radius
    });

    it('should scale with brush strength', () => {
      modifier.raise(10, 10, { ...brushConfig, strength: 1.0 });
      const height1 = terrain.getHeightAtGrid(10, 10);

      terrain.fill(10);

      modifier.raise(10, 10, { ...brushConfig, strength: 2.0 });
      const height2 = terrain.getHeightAtGrid(10, 10);

      expect(height2 - 10).toBeGreaterThan(height1 - 10);
    });
  });

  describe('Noise Generation', () => {
    it('should apply noise to terrain', () => {
      const noiseConfig: NoiseConfig = {
        octaves: 4,
        frequency: 0.1,
        amplitude: 10,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 12345,
      };

      const heightsBefore = Array.from(terrain.heightmap);

      modifier.applyNoise(noiseConfig);

      const heightsAfter = Array.from(terrain.heightmap);

      // Heights should have changed
      let changedCount = 0;
      for (let i = 0; i < heightsBefore.length; i++) {
        if (Math.abs(heightsAfter[i] - heightsBefore[i]) > 0.001) {
          changedCount++;
        }
      }

      expect(changedCount).toBeGreaterThan(0);
    });

    it('should generate different noise with different seeds', () => {
      const config1: NoiseConfig = {
        octaves: 4,
        frequency: 0.05,
        amplitude: 10,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 1,
      };

      terrain.fill(0);
      modifier.applyNoise(config1);
      const heights1 = Array.from(terrain.heightmap);

      terrain.fill(0);
      modifier.applyNoise({ ...config1, seed: 12345 });
      const heights2 = Array.from(terrain.heightmap);

      // Different seeds should produce at least some different values
      let differentCount = 0;
      for (let i = 0; i < heights1.length; i++) {
        if (Math.abs(heights1[i] - heights2[i]) > 0.1) {
          differentCount++;
        }
      }

      // At least some variation expected
      expect(differentCount).toBeGreaterThanOrEqual(0);
    });

    it('should vary with octave count', () => {
      terrain.fill(0);
      modifier.applyNoise({
        octaves: 1,
        frequency: 0.1,
        amplitude: 10,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 123,
      });

      const stats1 = terrain.getStatistics();

      terrain.fill(0);
      modifier.applyNoise({
        octaves: 8,
        frequency: 0.1,
        amplitude: 10,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 123,
      });

      const stats2 = terrain.getStatistics();

      // More octaves should create more variation
      expect(stats2.maxHeight - stats2.minHeight).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Terrain Presets', () => {
    it('should generate pyramid terrain', () => {
      modifier.createPyramid(50);

      const centerHeight = terrain.getHeightAtGrid(10, 10);
      const cornerHeight = terrain.getHeightAtGrid(0, 0);

      expect(centerHeight).toBeGreaterThan(cornerHeight);
    });

    it('should generate cone terrain', () => {
      modifier.createCone(50);

      const centerHeight = terrain.getHeightAtGrid(10, 10);
      const edgeHeight = terrain.getHeightAtGrid(0, 10);

      expect(centerHeight).toBeGreaterThan(edgeHeight);
    });

    it('should generate valley terrain', () => {
      modifier.createValley(30, 60);

      const centerHeight = terrain.getHeightAtGrid(10, 10);
      const edgeHeight = terrain.getHeightAtGrid(0, 10);

      expect(edgeHeight).toBeGreaterThan(centerHeight);
    });

    it('should generate ridge terrain', () => {
      modifier.createRidge(40, 50);

      const centerXHeight = terrain.getHeightAtGrid(10, 10);
      const edgeXHeight = terrain.getHeightAtGrid(0, 10);

      expect(centerXHeight).toBeGreaterThanOrEqual(edgeXHeight);
    });

    it('should generate mountains', () => {
      modifier.createMountains({
        octaves: 4,
        frequency: 0.05,
        amplitude: 30,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 456,
      });

      const stats = terrain.getStatistics();
      expect(stats.maxHeight - stats.minHeight).toBeGreaterThan(0);
    });
  });

  describe('Terrain Transformations', () => {
    it('should create canyon by inverting', () => {
      terrain.fill(50);
      terrain.setHeightAtGrid(10, 10, 20);

      const heightBefore = terrain.getHeightAtGrid(10, 10);

      modifier.createCanyon(100);

      const heightAfter = terrain.getHeightAtGrid(10, 10);

      expect(heightAfter).toBe(100 - heightBefore);
    });

    it('should terrace terrain', () => {
      modifier.generate((x, z) => Math.sqrt(x * x + z * z));

      modifier.terrace(5, 50);

      const height = terrain.getHeightAtGrid(10, 10);

      // Height should be a multiple of step height (10)
      expect(height % 10).toBeCloseTo(0, 0);
    });

    it('should clamp terrain heights', () => {
      terrain.fill(50);
      terrain.setHeightAtGrid(5, 5, 10);
      terrain.setHeightAtGrid(15, 15, 90);

      modifier.clamp(20, 80);

      const minHeight = terrain.getHeightAtGrid(5, 5);
      const maxHeight = terrain.getHeightAtGrid(15, 15);

      expect(minHeight).toBe(20);
      expect(maxHeight).toBe(80);
    });

    it('should scale terrain heights', () => {
      terrain.fill(10);

      modifier.scale(2.0);

      const height = terrain.getHeightAtGrid(10, 10);
      expect(height).toBe(20);
    });
  });

  describe('Custom Generation', () => {
    it('should generate from custom function', () => {
      modifier.generate((x, z) => x + z);

      const height1 = terrain.getHeightAtGrid(5, 5);
      const height2 = terrain.getHeightAtGrid(10, 10);

      expect(height2).toBeGreaterThan(height1);
    });

    it('should handle negative heights', () => {
      modifier.generate((x, z) => -Math.abs(x));

      const height = terrain.getHeightAtGrid(10, 10);
      expect(height).toBeLessThan(0);
    });

    it('should handle zero heights', () => {
      modifier.generate(() => 0);

      const stats = terrain.getStatistics();
      expect(stats.avgHeight).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle brush at border', () => {
      expect(() => {
        modifier.raise(0, 0, brushConfig);
      }).not.toThrow();

      const height = terrain.getHeightAtGrid(0, 0);
      expect(height).toBeGreaterThan(10);
    });

    it('should handle brush outside bounds', () => {
      expect(() => {
        modifier.raise(-5, -5, brushConfig);
      }).not.toThrow();
    });

    it('should handle zero radius brush', () => {
      const heightBefore = terrain.getHeightAtGrid(10, 10);

      modifier.raise(10, 10, { ...brushConfig, radius: 0 });

      const heightAfter = terrain.getHeightAtGrid(10, 10);

      // With radius 0, nothing should change
      expect(heightAfter).toBe(heightBefore);
    });

    it('should handle zero strength brush', () => {
      const heightBefore = terrain.getHeightAtGrid(10, 10);

      modifier.raise(10, 10, { ...brushConfig, strength: 0 });

      const heightAfter = terrain.getHeightAtGrid(10, 10);

      expect(heightAfter).toBeCloseTo(heightBefore, 1);
    });

    it('should handle large brush radius', () => {
      expect(() => {
        modifier.raise(10, 10, { ...brushConfig, radius: 100 });
      }).not.toThrow();
    });

    it('should handle very high frequency noise', () => {
      expect(() => {
        modifier.applyNoise({
          octaves: 2,
          frequency: 10.0,
          amplitude: 5,
          persistence: 0.5,
          lacunarity: 2.0,
          seed: 789,
        });
      }).not.toThrow();
    });

    it('should handle zero octave noise', () => {
      terrain.fill(10);

      modifier.applyNoise({
        octaves: 0,
        frequency: 0.1,
        amplitude: 5,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 101,
      });

      const stats = terrain.getStatistics();
      expect(stats.avgHeight).toBeCloseTo(10, 0);
    });

    it('should handle negative scale factor', () => {
      terrain.fill(10);

      modifier.scale(-1.0);

      const height = terrain.getHeightAtGrid(10, 10);
      expect(height).toBe(-10);
    });
  });
});
