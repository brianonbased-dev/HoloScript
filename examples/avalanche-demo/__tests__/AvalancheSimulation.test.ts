/**
 * AvalancheSimulation.test.ts
 *
 * Unit tests for CPU-GPU integration layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGenerator, type TerrainData, type TerrainConfig } from '../TerrainGenerator';
import { SnowAccumulation, type SnowConfig } from '../SnowAccumulation';
import { AvalanchePhysics, type AvalancheConfig } from '../AvalanchePhysics';
import { AvalancheSimulation, type SimulationConfig } from '../AvalancheSimulation';

describe('AvalancheSimulation', () => {
  let terrainConfig: TerrainConfig;
  let terrain: TerrainData;
  let snowConfig: SnowConfig;
  let snow: SnowAccumulation;
  let avalancheConfig: AvalancheConfig;
  let physics: AvalanchePhysics;
  let simulationConfig: SimulationConfig;
  let simulation: AvalancheSimulation;

  beforeEach(() => {
    // Create terrain
    terrainConfig = {
      width: 200,
      depth: 200,
      resolution: 64,
      maxHeight: 50,
      steepness: 0.7,
      roughness: 0.3,
      seed: 12345,
    };
    const terrainGen = new TerrainGenerator(terrainConfig);
    terrain = terrainGen.generateTerrain();

    // Create snow accumulation
    snowConfig = {
      particleCount: 500,
      particleMass: 0.1,
      angleOfRepose: 35,
      cohesion: 0.3,
      density: 300,
      minDepthForTrigger: 0.05,
    };
    snow = new SnowAccumulation(terrain, snowConfig);

    // Create physics
    avalancheConfig = {
      gravity: 9.8,
      frictionCoefficient: 0.2,
      dragCoefficient: 0.5,
      entrainmentRadius: 2.0,
      entrainmentThreshold: 3.0,
      restitution: 0.3,
      settlingVelocity: 0.5,
    };
    physics = new AvalanchePhysics(terrain, snow.getParticles(), avalancheConfig);

    // Create simulation
    simulationConfig = {
      useGPU: false, // Disable GPU for tests (no WebGPU in Node)
      maxParticles: 10000,
      enableProfiling: true,
    };
    simulation = new AvalancheSimulation(terrain, physics, simulationConfig);
  });

  describe('Initialization', () => {
    it('should initialize with terrain and physics', () => {
      expect(simulation).toBeDefined();
    });

    it('should prepare terrain data for GPU', () => {
      const gpuTerrain = simulation.getGPUTerrainData();

      expect(gpuTerrain).not.toBeNull();
      expect(gpuTerrain!.heightmapBuffer).toBeDefined();
      expect(gpuTerrain!.metadataBuffer).toBeDefined();
    });

    it('should have correct terrain metadata', () => {
      const gpuTerrain = simulation.getGPUTerrainData();
      const metadata = gpuTerrain!.metadataBuffer;

      expect(metadata[0]).toBe(terrainConfig.width);
      expect(metadata[1]).toBe(terrainConfig.depth);
      expect(metadata[2]).toBe(terrainConfig.resolution);
      expect(metadata[3]).toBe(terrainConfig.maxHeight);
    });

    it('should initialize performance metrics', () => {
      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.cpuPhysicsTime).toBe(0);
      expect(metrics.gpuUploadTime).toBe(0);
      expect(metrics.gpuComputeTime).toBe(0);
      expect(metrics.totalFrameTime).toBe(0);
      expect(metrics.fps).toBe(0);
      expect(metrics.activeParticles).toBe(0);
    });

    it('should get particles from physics', () => {
      const particles = simulation.getParticles();

      expect(particles.length).toBe(snowConfig.particleCount);
    });
  });

  describe('Avalanche Triggering', () => {
    it('should trigger avalanche through simulation', () => {
      simulation.triggerAvalanche([0, 0], 20);

      const stats = simulation.getStatistics();

      expect(stats.isActive).toBe(true);
      expect(stats.slidingCount).toBeGreaterThan(0);
    });

    it('should forward trigger to physics engine', () => {
      simulation.triggerAvalanche([10, 10], 15);

      const particles = simulation.getParticles();
      const slidingParticles = particles.filter((p) => p.state === 'sliding');

      expect(slidingParticles.length).toBeGreaterThan(0);
    });
  });

  describe('Update Loop', () => {
    beforeEach(async () => {
      simulation.triggerAvalanche([0, 0], 20);
    });

    it('should update simulation', async () => {
      await simulation.update(0.1);

      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBeCloseTo(0.1);
    });

    it('should measure CPU physics time', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.cpuPhysicsTime).toBeGreaterThan(0);
    });

    it('should track active particles', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();
      const stats = simulation.getStatistics();

      expect(metrics.activeParticles).toBe(stats.slidingCount + stats.airborneCount);
    });

    it('should calculate FPS after multiple frames', async () => {
      for (let i = 0; i < 10; i++) {
        await simulation.update(0.016); // ~60 FPS
      }

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.fps).toBeGreaterThan(0);
    });

    it('should update memory estimate', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.memoryUsage).toBeGreaterThan(0);
    });

    it('should measure total frame time', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.totalFrameTime).toBeGreaterThan(0);
    });
  });

  describe('GPU Integration', () => {
    it('should handle GPU disabled mode', async () => {
      simulation.setGPUEnabled(false);

      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      // GPU times should be zero when disabled
      expect(metrics.gpuUploadTime).toBe(0);
      expect(metrics.gpuComputeTime).toBe(0);
    });

    it('should enable GPU mode', () => {
      simulation.setGPUEnabled(true);

      // Should not throw
      expect(() => simulation.update(0.1)).not.toThrow();
    });

    it('should disable GPU mode', () => {
      simulation.setGPUEnabled(true);
      simulation.setGPUEnabled(false);

      // Should work with GPU disabled
      expect(() => simulation.update(0.1)).not.toThrow();
    });

    it('should prepare heightmap buffer', () => {
      const gpuTerrain = simulation.getGPUTerrainData();

      expect(gpuTerrain!.heightmapBuffer.length).toBe(terrain.heightmap.length);
    });

    it('should preserve heightmap data', () => {
      const gpuTerrain = simulation.getGPUTerrainData();

      // Sample a few values
      expect(gpuTerrain!.heightmapBuffer[0]).toBeCloseTo(terrain.heightmap[0]);
      expect(gpuTerrain!.heightmapBuffer[100]).toBeCloseTo(terrain.heightmap[100]);
      expect(gpuTerrain!.heightmapBuffer[1000]).toBeCloseTo(terrain.heightmap[1000]);
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      simulation.triggerAvalanche([0, 0], 20);
    });

    it('should track CPU physics time', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.cpuPhysicsTime).toBeGreaterThanOrEqual(0);
    });

    it('should track total frame time', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.totalFrameTime).toBeGreaterThanOrEqual(metrics.cpuPhysicsTime);
    });

    it('should calculate FPS from frame history', async () => {
      // Run multiple frames
      for (let i = 0; i < 5; i++) {
        await simulation.update(0.016);
      }

      const metrics = simulation.getPerformanceMetrics();

      // Should have calculated FPS (very high in test environment due to fast execution)
      expect(metrics.fps).toBeGreaterThan(0);
      expect(metrics.fps).toBeLessThan(1000000); // Reasonable upper bound for test environment
    });

    it('should estimate memory usage', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();

      // Memory should be proportional to particle count
      expect(metrics.memoryUsage).toBeGreaterThan(0);
      expect(metrics.memoryUsage).toBeLessThan(100); // < 100MB for 500 particles
    });

    it('should track active particle count', async () => {
      await simulation.update(0.1);

      const metrics = simulation.getPerformanceMetrics();
      const stats = simulation.getStatistics();

      expect(metrics.activeParticles).toBeLessThanOrEqual(
        stats.restingCount + stats.slidingCount + stats.airborneCount
      );
    });
  });

  describe('Statistics', () => {
    it('should get statistics from physics', () => {
      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBeDefined();
      expect(stats.isActive).toBeDefined();
      expect(stats.restingCount).toBeDefined();
      expect(stats.slidingCount).toBeDefined();
      expect(stats.airborneCount).toBeDefined();
    });

    it('should forward statistics correctly', async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);

      const stats = simulation.getStatistics();

      expect(stats.isActive).toBe(true);
      expect(stats.elapsedTime).toBeCloseTo(0.1);
    });
  });

  describe('Profiling', () => {
    it('should enable profiling', () => {
      simulation.setProfilingEnabled(true);

      // Should not throw
      expect(() => simulation.getProfilingInfo()).not.toThrow();
    });

    it('should disable profiling', () => {
      simulation.setProfilingEnabled(false);

      // Should still work
      expect(() => simulation.getProfilingInfo()).not.toThrow();
    });

    it('should generate profiling info', async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);

      const info = simulation.getProfilingInfo();

      expect(info).toContain('Frame Time');
      expect(info).toContain('CPU Physics');
      expect(info).toContain('FPS');
      expect(info).toContain('Active Particles');
    });

    it('should include performance metrics in profiling', async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);

      const info = simulation.getProfilingInfo();

      expect(info).toContain('Memory');
      expect(info).toContain('Particle States');
      expect(info).toContain('Simulation');
    });
  });

  describe('Reset', () => {
    beforeEach(async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);
      await simulation.update(0.1);
    });

    it('should reset simulation', () => {
      simulation.reset();

      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBe(0);
      expect(stats.isActive).toBe(false);
    });

    it('should reset performance metrics', () => {
      simulation.reset();

      const metrics = simulation.getPerformanceMetrics();

      expect(metrics.cpuPhysicsTime).toBe(0);
      expect(metrics.totalFrameTime).toBe(0);
      expect(metrics.fps).toBe(0);
    });

    it('should reset all particles', () => {
      simulation.reset();

      const stats = simulation.getStatistics();

      expect(stats.restingCount).toBe(snowConfig.particleCount);
      expect(stats.slidingCount).toBe(0);
      expect(stats.airborneCount).toBe(0);
    });

    it('should allow re-triggering after reset', async () => {
      simulation.reset();

      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);

      const stats = simulation.getStatistics();

      expect(stats.isActive).toBe(true);
      expect(stats.slidingCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle update with no triggered avalanche', async () => {
      await simulation.update(0.1);

      const stats = simulation.getStatistics();

      expect(stats.isActive).toBe(false);
    });

    it('should handle zero delta time', async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0);

      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBe(0);
    });

    it('should handle very large delta time', async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(10);

      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBe(10);
    });

    it('should handle maximum particle count limit', () => {
      const limitedConfig: SimulationConfig = {
        ...simulationConfig,
        maxParticles: 10,
      };

      const limitedSim = new AvalancheSimulation(terrain, physics, limitedConfig);

      expect(limitedSim).toBeDefined();
    });

    it('should handle very few particles', async () => {
      const fewSnow = new SnowAccumulation(terrain, { ...snowConfig, particleCount: 5 });
      const fewPhysics = new AvalanchePhysics(terrain, fewSnow.getParticles(), avalancheConfig);
      const fewSim = new AvalancheSimulation(terrain, fewPhysics, simulationConfig);

      await fewSim.update(0.1);

      const metrics = fewSim.getPerformanceMetrics();

      expect(metrics.activeParticles).toBeLessThanOrEqual(5);
    });

    it('should handle many particles', async () => {
      const manySnow = new SnowAccumulation(terrain, { ...snowConfig, particleCount: 5000 });
      const manyPhysics = new AvalanchePhysics(terrain, manySnow.getParticles(), avalancheConfig);
      const manySim = new AvalancheSimulation(terrain, manyPhysics, simulationConfig);

      manySim.triggerAvalanche([0, 0], 50);
      await manySim.update(0.1);

      const stats = manySim.getStatistics();

      expect(stats.restingCount + stats.slidingCount + stats.airborneCount).toBe(5000);
    });

    it('should handle rapid consecutive updates', async () => {
      simulation.triggerAvalanche([0, 0], 20);

      for (let i = 0; i < 100; i++) {
        await simulation.update(0.001);
      }

      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBeCloseTo(0.1, 1);
    });

    it('should handle GPU mode toggle during simulation', async () => {
      simulation.triggerAvalanche([0, 0], 20);

      await simulation.update(0.1);
      simulation.setGPUEnabled(true);
      await simulation.update(0.1);
      simulation.setGPUEnabled(false);
      await simulation.update(0.1);

      const stats = simulation.getStatistics();

      expect(stats.elapsedTime).toBeCloseTo(0.3, 1);
    });
  });

  describe('Integration', () => {
    it('should integrate with TerrainGenerator', () => {
      const gpuTerrain = simulation.getGPUTerrainData();

      expect(gpuTerrain!.heightmapBuffer.length).toBe(
        terrainConfig.resolution * terrainConfig.resolution
      );
    });

    it('should integrate with SnowAccumulation', () => {
      const particles = simulation.getParticles();

      expect(particles.length).toBe(snowConfig.particleCount);
    });

    it('should integrate with AvalanchePhysics', async () => {
      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);

      const stats = simulation.getStatistics();
      const metrics = simulation.getPerformanceMetrics();

      // Should reflect physics state
      expect(stats.isActive).toBe(true);
      expect(metrics.activeParticles).toBe(stats.slidingCount + stats.airborneCount);
    });

    it('should maintain particle reference integrity', async () => {
      const particlesBefore = simulation.getParticles();
      const firstParticle = particlesBefore[0];

      simulation.triggerAvalanche([0, 0], 20);
      await simulation.update(0.1);

      const particlesAfter = simulation.getParticles();

      // Same particle objects should be returned
      expect(particlesAfter[0]).toBe(firstParticle);
    });
  });
});
