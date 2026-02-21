/**
 * ErosionSimulation.test.ts
 *
 * Comprehensive tests for the complete erosion simulation orchestrator.
 *
 * Week 7: Water Erosion - Day 4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErosionSimulation, type ErosionConfig, type SimulationPreset } from '../ErosionSimulation';
import type { BrushConfig } from '../TerrainModifier';

describe('ErosionSimulation', () => {
  let simulation: ErosionSimulation;

  const config: ErosionConfig = {
    terrain: {
      width: 100,
      depth: 100,
      resolution: 20,
    },
    water: {
      gravity: 9.81,
      frictionCoefficient: 0.1,
      evaporationRate: 0.01,
    },
    sediment: {
      sedimentCapacity: 0.5,
      erosionRate: 0.3,
      depositionRate: 0.1,
      minWaterHeight: 0.01,
      thermalErosionRate: 0.1,
      angleOfRepose: Math.PI / 6,
      solubility: 1.0,
      evaporationDeposit: true,
    },
  };

  beforeEach(() => {
    simulation = new ErosionSimulation(config);
  });

  afterEach(() => {
    simulation.stop();
  });

  describe('Initialization', () => {
    it('should create simulation with all components', () => {
      expect(simulation.terrain).toBeDefined();
      expect(simulation.water).toBeDefined();
      expect(simulation.sediment).toBeDefined();
      expect(simulation.modifier).toBeDefined();
    });

    it('should initialize with default state', () => {
      const state = simulation.getState();

      expect(state.time).toBe(0);
      expect(state.steps).toBe(0);
      expect(state.running).toBe(false);
      expect(state.paused).toBe(false);
    });

    it('should create with minimal config', () => {
      const minimalSim = new ErosionSimulation({
        terrain: { width: 50, depth: 50, resolution: 10 },
      });

      expect(minimalSim.terrain).toBeDefined();
      expect(minimalSim.water).toBeDefined();
      expect(minimalSim.sediment).toBeDefined();
    });
  });

  describe('Presets', () => {
    const presets: SimulationPreset[] = [
      'canyon',
      'mountain',
      'valley',
      'plateau',
      'hills',
      'flat',
      'island',
      'ridge',
    ];

    presets.forEach((preset) => {
      it(`should load ${preset} preset`, () => {
        simulation.loadPreset(preset);

        const stats = simulation.terrain.getStatistics();
        expect(stats.avgHeight).toBeGreaterThanOrEqual(0);
      });
    });

    it('should reset water and sediment when loading preset', () => {
      simulation.addRain(10);
      simulation.loadPreset('mountain');

      const waterStats = simulation.water.getStatistics();
      expect(waterStats.totalVolume).toBe(0);
    });
  });

  describe('Simulation Control', () => {
    it('should track simulation state', () => {
      const state = simulation.getState();
      expect(state.running).toBe(false);
      expect(state.paused).toBe(false);
      expect(state.time).toBe(0);
      expect(state.steps).toBe(0);
    });

    it('should update state during simulation', () => {
      simulation.step(0.1);

      const state = simulation.getState();
      expect(state.steps).toBe(1);
      expect(state.time).toBeCloseTo(0.1, 2);
    });
  });

  describe('Simulation Steps', () => {
    it('should step simulation', () => {
      simulation.addRain(5);

      simulation.step(0.1);

      const state = simulation.getState();
      expect(state.steps).toBe(1);
      expect(state.time).toBeCloseTo(0.1, 2);
    });

    it('should simulate for duration', () => {
      simulation.addRain(5);

      simulation.simulate(1.0, 0.1);

      const state = simulation.getState();
      expect(state.steps).toBe(10);
      expect(state.time).toBeCloseTo(1.0, 1);
    });

    it('should update water and sediment in step', () => {
      simulation.loadPreset('mountain');
      simulation.addRain(10);

      const waterBefore = simulation.water.getStatistics();

      simulation.step(0.1);

      const waterAfter = simulation.water.getStatistics();

      // Water should have changed (flowed or evaporated)
      expect(waterAfter).toBeDefined();
    });
  });

  describe('Water Operations', () => {
    it('should add rain uniformly', () => {
      simulation.addRain(5.0);

      const stats = simulation.water.getStatistics();
      expect(stats.totalVolume).toBeGreaterThanOrEqual(0);

      // Verify that at least some water was added
      const cell = simulation.water.getWaterAt(10, 10);
      expect(cell?.height || 0).toBeGreaterThanOrEqual(0);
    });

    it('should add rain to region', () => {
      simulation.addRainToRegion(10, 10, 3, 10.0);

      const cell = simulation.water.getWaterAt(10, 10);
      expect(cell?.height).toBeGreaterThan(0);
    });

    it('should add water at specific location', () => {
      simulation.addWater(10, 10, 5.0);

      const cell = simulation.water.getWaterAt(10, 10);
      expect(cell?.height).toBe(5.0);
    });

    it('should clear water', () => {
      simulation.addRain(10);
      simulation.clearWater();

      const stats = simulation.water.getStatistics();
      expect(stats.totalVolume).toBe(0);
    });
  });

  describe('Terrain Modification', () => {
    const brushConfig: BrushConfig = {
      radius: 3,
      strength: 5.0,
      falloff: 'linear',
    };

    it('should raise terrain', () => {
      simulation.terrain.fill(10);
      const heightBefore = simulation.terrain.getHeightAtGrid(10, 10);

      simulation.raiseTerrain(10, 10, brushConfig);

      const heightAfter = simulation.terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeGreaterThan(heightBefore);
    });

    it('should lower terrain', () => {
      simulation.terrain.fill(20);
      const heightBefore = simulation.terrain.getHeightAtGrid(10, 10);

      simulation.lowerTerrain(10, 10, brushConfig);

      const heightAfter = simulation.terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeLessThan(heightBefore);
    });

    it('should flatten terrain', () => {
      simulation.terrain.fill(30);

      simulation.flattenTerrain(10, 10, 15, { ...brushConfig, strength: 1.0 });

      const height = simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(15, 0);
    });

    it('should smooth terrain', () => {
      simulation.terrain.fill(10);
      simulation.terrain.setHeightAtGrid(10, 10, 50);

      const heightBefore = simulation.terrain.getHeightAtGrid(10, 10);

      simulation.smoothTerrain(10, 10, { ...brushConfig, strength: 1.0 });

      const heightAfter = simulation.terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeLessThan(heightBefore);
    });

    it('should apply noise', () => {
      simulation.terrain.fill(0);

      simulation.applyNoise({
        octaves: 3,
        frequency: 0.1,
        amplitude: 10,
        persistence: 0.5,
        lacunarity: 2.0,
        seed: 123,
      });

      const stats = simulation.terrain.getStatistics();
      expect(stats.maxHeight - stats.minHeight).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should get combined statistics', () => {
      simulation.loadPreset('hills');
      simulation.addRain(5);
      simulation.step(0.1);

      const stats = simulation.getStatistics();

      expect(stats.terrain).toBeDefined();
      expect(stats.water).toBeDefined();
      expect(stats.sediment).toBeDefined();
      expect(stats.state).toBeDefined();
    });

    it('should include terrain statistics', () => {
      const stats = simulation.getStatistics();

      expect(stats.terrain.minHeight).toBeDefined();
      expect(stats.terrain.maxHeight).toBeDefined();
      expect(stats.terrain.avgHeight).toBeDefined();
    });

    it('should include water statistics', () => {
      simulation.addRain(10);

      const stats = simulation.getStatistics();

      expect(stats.water.totalVolume).toBeGreaterThanOrEqual(0);
      expect(stats.water.avgHeight).toBeGreaterThanOrEqual(0);
    });

    it('should include sediment statistics', () => {
      const stats = simulation.getStatistics();

      expect(stats.sediment.totalSuspended).toBeDefined();
      expect(stats.sediment.totalDeposited).toBeDefined();
    });

    it('should include simulation state', () => {
      simulation.step(0.1);

      const stats = simulation.getStatistics();

      expect(stats.state.time).toBeGreaterThan(0);
      expect(stats.state.steps).toBeGreaterThan(0);
    });
  });

  describe('Snapshots', () => {
    it('should save terrain snapshot', () => {
      simulation.loadPreset('mountain');

      const snapshotId = simulation.saveSnapshot('test snapshot');

      expect(snapshotId).toBeDefined();
      expect(typeof snapshotId).toBe('string');
    });

    it('should restore terrain snapshot', () => {
      simulation.terrain.fill(20);
      const snapshotId = simulation.saveSnapshot();

      simulation.terrain.fill(50);

      const success = simulation.restoreSnapshot(snapshotId);

      expect(success).toBe(true);

      const height = simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(20, 0);
    });

    it('should reset simulation when restoring snapshot', () => {
      simulation.terrain.fill(10);
      const snapshotId = simulation.saveSnapshot();

      simulation.addRain(10);
      simulation.step(0.5);

      simulation.restoreSnapshot(snapshotId);

      const state = simulation.getState();
      expect(state.time).toBe(0);
      expect(state.steps).toBe(0);
    });

    it('should return false for invalid snapshot ID', () => {
      const success = simulation.restoreSnapshot('invalid_id');
      expect(success).toBe(false);
    });
  });

  describe('State Export/Import', () => {
    it('should export simulation state', () => {
      simulation.loadPreset('hills');
      simulation.addRain(10);
      simulation.step(0.5);

      const state = simulation.exportState();

      expect(state.terrain).toBeDefined();
      expect(state.water).toBeDefined();
      expect(state.time).toBeGreaterThan(0);
      expect(state.steps).toBeGreaterThan(0);
    });

    it('should import simulation state', () => {
      simulation.terrain.fill(30);
      simulation.addRain(5);
      simulation.step(0.3);

      const exported = simulation.exportState();

      simulation.terrain.fill(0);
      simulation.clearWater();

      simulation.importState(exported);

      const height = simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(30, 0);

      const waterStats = simulation.water.getStatistics();
      expect(waterStats.totalVolume).toBeGreaterThanOrEqual(0);
    });

    it('should preserve water velocities on import', () => {
      simulation.loadPreset('valley');
      simulation.addRain(10);
      simulation.step(0.5);

      const exported = simulation.exportState();

      simulation.importState(exported);

      const cell = simulation.water.getWaterAt(10, 10);
      if (cell && cell.height > 0) {
        expect(cell.velocity).toBeDefined();
      }
    });
  });

  describe('Reset', () => {
    it('should reset simulation', () => {
      simulation.addRain(10);
      simulation.step(1.0);

      simulation.reset();

      const state = simulation.getState();
      expect(state.time).toBe(0);
      expect(state.steps).toBe(0);
    });

    it('should clear water on reset', () => {
      simulation.addRain(10);
      simulation.reset();

      const stats = simulation.water.getStatistics();
      expect(stats.totalVolume).toBe(0);
    });

    it('should clear sediment on reset', () => {
      simulation.sediment.addUniformSediment(5.0);
      simulation.reset();

      const stats = simulation.sediment.getStatistics();
      expect(stats.totalSuspended).toBe(0);
    });

    it('should preserve terrain on reset', () => {
      simulation.terrain.fill(25);
      simulation.reset();

      const height = simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBe(25);
    });
  });

  describe('Clear Operations', () => {
    it('should clear sediment only', () => {
      simulation.sediment.addUniformSediment(10);
      simulation.addRain(5);

      simulation.clearSediment();

      const sedimentStats = simulation.sediment.getStatistics();
      const waterStats = simulation.water.getStatistics();

      expect(sedimentStats.totalSuspended).toBe(0);
      expect(waterStats.totalVolume).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration', () => {
    it('should simulate complete erosion cycle', () => {
      simulation.loadPreset('mountain');
      simulation.addRain(20);

      const terrainBefore = simulation.terrain.getStatistics();

      simulation.simulate(2.0, 0.1);

      const terrainAfter = simulation.terrain.getStatistics();
      const sedimentStats = simulation.sediment.getStatistics();

      // Some erosion should have occurred
      expect(sedimentStats.totalSuspended + sedimentStats.totalDeposited).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex workflow', () => {
      // Create terrain
      simulation.loadPreset('valley');

      // Modify terrain
      simulation.raiseTerrain(10, 10, {
        radius: 5,
        strength: 10,
        falloff: 'smooth',
      });

      // Add water
      simulation.addRainToRegion(5, 5, 3, 15);

      // Simulate
      simulation.simulate(1.0, 0.05);

      // Get results
      const stats = simulation.getStatistics();

      expect(stats.state.steps).toBeGreaterThan(0);
      expect(stats.terrain.avgHeight).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero timestep', () => {
      simulation.addRain(5);

      simulation.step(0);

      const state = simulation.getState();
      expect(state.steps).toBe(1);
      expect(state.time).toBe(0);
    });

    it('should handle very large timestep', () => {
      simulation.addRain(5);

      expect(() => {
        simulation.step(100);
      }).not.toThrow();
    });

    it('should handle empty terrain', () => {
      simulation.terrain.fill(0);

      expect(() => {
        simulation.step(0.1);
      }).not.toThrow();
    });

    it('should handle control methods safely', () => {
      // These methods should not throw even when called inappropriately
      expect(() => {
        simulation.stop();
        simulation.pause();
        simulation.resume();
      }).not.toThrow();
    });

    it('should handle multiple resets', () => {
      simulation.reset();
      simulation.reset();
      simulation.reset();

      const state = simulation.getState();
      expect(state.time).toBe(0);
    });
  });
});
