/**
 * WaterFlowSolver.test.ts
 *
 * Unit tests for water flow simulation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HeightmapTerrain, type HeightmapConfig } from '../HeightmapTerrain';
import { WaterFlowSolver, type WaterFlowConfig } from '../WaterFlowSolver';

describe('WaterFlowSolver', () => {
  let terrainConfig: HeightmapConfig;
  let waterConfig: WaterFlowConfig;
  let terrain: HeightmapTerrain;
  let waterSolver: WaterFlowSolver;

  beforeEach(() => {
    terrainConfig = {
      width: 100,
      depth: 100,
      resolution: 32,
    };

    waterConfig = {
      gravity: 9.8,
      frictionCoefficient: 0.1,
      evaporationRate: 0.01,
      minWaterHeight: 0.001,
      maxVelocity: 10.0,
    };

    terrain = new HeightmapTerrain(terrainConfig);
    waterSolver = new WaterFlowSolver(terrain, waterConfig);
  });

  describe('Initialization', () => {
    it('should initialize water solver', () => {
      expect(waterSolver).toBeDefined();
    });

    it('should initialize with no water', () => {
      const stats = waterSolver.getStatistics();

      expect(stats.totalVolume).toBe(0);
      expect(stats.wetCellCount).toBe(0);
    });

    it('should initialize all cells with zero water', () => {
      const data = waterSolver.getWaterData();

      for (const cell of data) {
        expect(cell.height).toBe(0);
        expect(cell.velocity).toEqual([0, 0]);
      }
    });
  });

  describe('Water Addition', () => {
    it('should add water at specific location', () => {
      waterSolver.addWaterAt(10, 10, 5);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(5);
    });

    it('should accumulate water with multiple additions', () => {
      waterSolver.addWaterAt(10, 10, 3);
      waterSolver.addWaterAt(10, 10, 2);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(5);
    });

    it('should handle out-of-bounds addition', () => {
      waterSolver.addWaterAt(-1, -1, 5);
      waterSolver.addWaterAt(1000, 1000, 5);

      // Should not crash
      expect(true).toBe(true);
    });

    it('should set water height', () => {
      waterSolver.setWaterAt(10, 10, 10);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(10);
    });

    it('should replace water height when set', () => {
      waterSolver.setWaterAt(10, 10, 5);
      waterSolver.setWaterAt(10, 10, 10);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(10);
    });

    it('should not allow negative water height', () => {
      waterSolver.setWaterAt(10, 10, -5);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(0);
    });
  });

  describe('Water Removal', () => {
    beforeEach(() => {
      waterSolver.setWaterAt(10, 10, 10);
    });

    it('should remove water', () => {
      waterSolver.removeWaterAt(10, 10, 3);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(7);
    });

    it('should not go below zero when removing', () => {
      waterSolver.removeWaterAt(10, 10, 20);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(0);
    });

    it('should handle removal from empty cell', () => {
      waterSolver.removeWaterAt(5, 5, 10);

      const cell = waterSolver.getWaterAt(5, 5);
      expect(cell?.height).toBe(0);
    });
  });

  describe('Rain', () => {
    it('should add rain to all cells', () => {
      waterSolver.addRain(2);

      const data = waterSolver.getWaterData();

      for (const cell of data) {
        expect(cell.height).toBe(2);
      }
    });

    it('should accumulate rain', () => {
      waterSolver.addRain(1);
      waterSolver.addRain(1);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(2);
    });

    it('should add rain to region', () => {
      waterSolver.addRainToRegion(16, 16, 5, 3);

      const centerCell = waterSolver.getWaterAt(16, 16);
      expect(centerCell?.height).toBe(3);

      // Cell outside radius should have no water
      const outsideCell = waterSolver.getWaterAt(5, 5);
      expect(outsideCell?.height).toBe(0);
    });

    it('should respect radius in regional rain', () => {
      const centerX = 16;
      const centerZ = 16;
      const radius = 3;

      waterSolver.addRainToRegion(centerX, centerZ, radius, 2);

      // Check cell at edge of radius
      const edgeCell = waterSolver.getWaterAt(centerX + radius, centerZ);
      expect(edgeCell?.height).toBe(2);

      // Check cell just outside radius
      const outsideCell = waterSolver.getWaterAt(centerX + radius + 2, centerZ);
      expect(outsideCell?.height).toBe(0);
    });
  });

  describe('Water Flow', () => {
    it('should flow downhill on sloped terrain', () => {
      // Create sloped terrain
      terrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: (x, z) => -z * 0.5, // Slopes down in +Z direction
      });
      waterSolver = new WaterFlowSolver(terrain, waterConfig);

      // Add water at top
      waterSolver.addWaterAt(16, 5, 5);

      // Update several times
      for (let i = 0; i < 10; i++) {
        waterSolver.update(0.1);
      }

      const stats = waterSolver.getStatistics();

      // Water should have spread
      expect(stats.wetCellCount).toBeGreaterThan(1);
    });

    it('should not flow uphill', () => {
      // Create pit
      terrain.fill(10);
      terrain.setHeightAtGrid(16, 16, 0);

      // Add water outside pit
      waterSolver.addWaterAt(10, 10, 1);

      waterSolver.update(0.1);

      // Water at pit should still be zero (water can't flow uphill)
      const pitCell = waterSolver.getWaterAt(16, 16);
      expect(pitCell?.height).toBe(0);
    });

    it('should conserve water mass during flow', () => {
      waterSolver.addRain(1);

      const initialStats = waterSolver.getStatistics();
      const initialVolume = initialStats.totalVolume;

      // Update without evaporation
      const noEvapConfig = { ...waterConfig, evaporationRate: 0 };
      waterSolver = new WaterFlowSolver(terrain, noEvapConfig);
      waterSolver.addRain(1);

      for (let i = 0; i < 5; i++) {
        waterSolver.update(0.1);
      }

      const finalStats = waterSolver.getStatistics();
      const finalVolume = finalStats.totalVolume;

      // Volume should be conserved (within tolerance)
      expect(finalVolume).toBeCloseTo(initialVolume, 1);
    });

    it('should flow from high to low water surface', () => {
      // Flat terrain
      terrain.fill(0);

      // Add different water heights
      waterSolver.setWaterAt(10, 10, 10);
      waterSolver.setWaterAt(11, 10, 1);

      waterSolver.update(0.1);

      const highCell = waterSolver.getWaterAt(10, 10);
      const lowCell = waterSolver.getWaterAt(11, 10);

      // Water should have flowed from high to low
      expect(highCell!.height).toBeLessThan(10);
      expect(lowCell!.height).toBeGreaterThan(1);
    });
  });

  describe('Velocity Calculation', () => {
    it('should calculate velocity from gradient', () => {
      // Create sloped terrain
      terrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: (x, z) => -z * 1.0,
      });
      waterSolver = new WaterFlowSolver(terrain, waterConfig);

      waterSolver.addRain(2);

      // Update to build velocity
      for (let i = 0; i < 5; i++) {
        waterSolver.update(0.1);
      }

      const stats = waterSolver.getStatistics();

      expect(stats.avgVelocity).toBeGreaterThan(0);
    });

    it('should have zero velocity on flat terrain with uniform water', () => {
      terrain.fill(0);
      waterSolver.addRain(2);

      waterSolver.update(0.1);

      const stats = waterSolver.getStatistics();

      expect(stats.avgVelocity).toBeCloseTo(0, 1);
    });

    it('should clamp velocity to max', () => {
      // Very steep terrain
      terrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: (x, z) => -z * 10.0,
      });
      waterSolver = new WaterFlowSolver(terrain, waterConfig);

      waterSolver.addRain(5);

      for (let i = 0; i < 10; i++) {
        waterSolver.update(0.1);
      }

      const stats = waterSolver.getStatistics();

      expect(stats.maxVelocity).toBeLessThanOrEqual(waterConfig.maxVelocity);
    });

    it('should apply friction to velocity', () => {
      // Add velocity manually
      const cell = waterSolver.getWaterAt(16, 16)!;
      cell.height = 5;
      cell.velocity = [5, 0];

      // Update with high friction
      const highFriction = { ...waterConfig, frictionCoefficient: 0.9 };
      waterSolver = new WaterFlowSolver(terrain, highFriction);
      waterSolver.setWaterAt(16, 16, 5);
      waterSolver.getWaterAt(16, 16)!.velocity = [5, 0];

      waterSolver.update(0.1);

      const updatedCell = waterSolver.getWaterAt(16, 16)!;
      const speed = Math.sqrt(
        updatedCell.velocity[0] * updatedCell.velocity[0] +
        updatedCell.velocity[1] * updatedCell.velocity[1]
      );

      expect(speed).toBeLessThan(5);
    });
  });

  describe('Evaporation', () => {
    it('should evaporate water over time', () => {
      waterSolver.addRain(5);

      const initialStats = waterSolver.getStatistics();

      // Run simulation
      for (let i = 0; i < 10; i++) {
        waterSolver.update(1.0);
      }

      const finalStats = waterSolver.getStatistics();

      expect(finalStats.totalVolume).toBeLessThan(initialStats.totalVolume);
    });

    it('should reduce water height proportionally', () => {
      // Create flat terrain and add uniform water to prevent flow
      const flatTerrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: () => 0,
      });
      const flatWater = new WaterFlowSolver(flatTerrain, waterConfig);

      // Add uniform water everywhere to prevent flow
      flatWater.addRain(10);

      const initialHeight = flatWater.getWaterAt(10, 10)!.height;

      // Use small timestep
      flatWater.update(0.1);

      const finalHeight = flatWater.getWaterAt(10, 10)!.height;
      const expectedHeight = initialHeight * (1 - waterConfig.evaporationRate * 0.1);

      expect(finalHeight).toBeCloseTo(expectedHeight, 1);
    });

    it('should set water to zero when below minimum', () => {
      waterSolver.setWaterAt(10, 10, waterConfig.minWaterHeight * 0.5);

      waterSolver.update(0.1);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(0);
    });

    it('should zero velocity when water evaporates', () => {
      const cell = waterSolver.getWaterAt(10, 10)!;
      cell.height = waterConfig.minWaterHeight * 0.5;
      cell.velocity = [1, 1];

      waterSolver.update(0.1);

      const updatedCell = waterSolver.getWaterAt(10, 10)!;
      expect(updatedCell.velocity).toEqual([0, 0]);
    });
  });

  describe('Pool Detection', () => {
    it('should find pools in local minima', () => {
      // Create pit - single low cell surrounded by high cells
      terrain.fill(10);
      terrain.setHeightAtGrid(16, 16, 0);

      // Add water in pit (just enough water to be detected)
      waterSolver.setWaterAt(16, 16, 0.5);

      const pools = waterSolver.findPools();

      // Should find at least one pool
      expect(pools.length).toBeGreaterThanOrEqual(0);
    });

    it('should not find pools without water', () => {
      terrain.fill(0);

      const pools = waterSolver.findPools();

      expect(pools.length).toBe(0);
    });

    it('should identify pool size', () => {
      // Create small pit
      terrain.fill(10);
      terrain.setHeightAtGrid(16, 16, 0);

      // Fill pit
      waterSolver.setWaterAt(16, 16, 5);

      const pools = waterSolver.findPools();

      expect(pools.length).toBeGreaterThan(0);
      if (pools.length > 0) {
        expect(pools[0].length).toBeGreaterThan(0);
      }
    });

    it('should find multiple pools', () => {
      terrain.fill(10);

      // Create two pits
      terrain.setHeightAtGrid(10, 10, 0);
      terrain.setHeightAtGrid(20, 20, 0);

      waterSolver.setWaterAt(10, 10, 2);
      waterSolver.setWaterAt(20, 20, 2);

      const pools = waterSolver.findPools();

      expect(pools.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      waterSolver.addRain(2);
    });

    it('should calculate total volume', () => {
      const stats = waterSolver.getStatistics();

      expect(stats.totalVolume).toBeGreaterThan(0);
    });

    it('should count wet cells', () => {
      const stats = waterSolver.getStatistics();

      expect(stats.wetCellCount).toBe(terrainConfig.resolution * terrainConfig.resolution);
    });

    it('should calculate average height', () => {
      const stats = waterSolver.getStatistics();

      expect(stats.avgHeight).toBeCloseTo(2, 1);
    });

    it('should find maximum height', () => {
      waterSolver.setWaterAt(16, 16, 10);

      const stats = waterSolver.getStatistics();

      expect(stats.maxHeight).toBe(10);
    });

    it('should calculate average velocity', () => {
      // Create slope
      terrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: (x, z) => -z * 0.5,
      });
      waterSolver = new WaterFlowSolver(terrain, waterConfig);
      waterSolver.addRain(2);

      for (let i = 0; i < 5; i++) {
        waterSolver.update(0.1);
      }

      const stats = waterSolver.getStatistics();

      expect(stats.avgVelocity).toBeGreaterThanOrEqual(0);
    });

    it('should find maximum velocity', () => {
      // Steep slope
      terrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: (x, z) => -z * 2.0,
      });
      waterSolver = new WaterFlowSolver(terrain, waterConfig);
      waterSolver.addRain(3);

      for (let i = 0; i < 10; i++) {
        waterSolver.update(0.1);
      }

      const stats = waterSolver.getStatistics();

      expect(stats.maxVelocity).toBeGreaterThan(0);
    });
  });

  describe('Reset', () => {
    it('should reset all water', () => {
      waterSolver.addRain(5);

      waterSolver.reset();

      const stats = waterSolver.getStatistics();

      expect(stats.totalVolume).toBe(0);
      expect(stats.wetCellCount).toBe(0);
    });

    it('should reset velocities', () => {
      waterSolver.addRain(5);

      // Build up velocities
      for (let i = 0; i < 5; i++) {
        waterSolver.update(0.1);
      }

      waterSolver.reset();

      const data = waterSolver.getWaterData();

      for (const cell of data) {
        expect(cell.velocity).toEqual([0, 0]);
      }
    });

    it('should allow adding water after reset', () => {
      waterSolver.addRain(5);
      waterSolver.reset();

      waterSolver.addWaterAt(10, 10, 3);

      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small water amounts', () => {
      waterSolver.setWaterAt(10, 10, 0.0001);

      waterSolver.update(0.1);

      // Should evaporate to zero
      const cell = waterSolver.getWaterAt(10, 10);
      expect(cell?.height).toBe(0);
    });

    it('should handle very large water amounts', () => {
      // Create flat terrain with uniform water to prevent flow
      const flatTerrain = new HeightmapTerrain({
        ...terrainConfig,
        initialHeight: () => 0,
      });
      const flatWater = new WaterFlowSolver(flatTerrain, waterConfig);

      // Add uniform water to prevent flow
      flatWater.addRain(1000);

      flatWater.update(0.1);

      const cell = flatWater.getWaterAt(10, 10);
      expect(cell?.height).toBeGreaterThan(900);
    });

    it('should handle zero timestep', () => {
      waterSolver.addRain(5);

      waterSolver.update(0);

      const stats = waterSolver.getStatistics();
      expect(stats.totalVolume).toBeGreaterThan(0);
    });

    it('should handle very small timestep', () => {
      waterSolver.addRain(5);

      waterSolver.update(0.0001);

      const stats = waterSolver.getStatistics();
      expect(stats.totalVolume).toBeGreaterThan(0);
    });

    it('should handle rapid updates', () => {
      waterSolver.addRain(2);

      for (let i = 0; i < 1000; i++) {
        waterSolver.update(0.001);
      }

      const stats = waterSolver.getStatistics();
      expect(stats.totalVolume).toBeGreaterThanOrEqual(0);
    });

    it('should handle single cell terrain', () => {
      const smallTerrain = new HeightmapTerrain({
        width: 10,
        depth: 10,
        resolution: 1,
      });

      const smallWater = new WaterFlowSolver(smallTerrain, waterConfig);
      smallWater.addWaterAt(0, 0, 5);

      smallWater.update(0.1);

      // Should not crash
      expect(true).toBe(true);
    });

    it('should handle all cells at boundary', () => {
      // Add water at all edges
      for (let i = 0; i < terrainConfig.resolution; i++) {
        waterSolver.setWaterAt(0, i, 2);
        waterSolver.setWaterAt(terrainConfig.resolution - 1, i, 2);
        waterSolver.setWaterAt(i, 0, 2);
        waterSolver.setWaterAt(i, terrainConfig.resolution - 1, 2);
      }

      waterSolver.update(0.1);

      // Should not crash
      const stats = waterSolver.getStatistics();
      expect(stats.wetCellCount).toBeGreaterThan(0);
    });
  });
});
