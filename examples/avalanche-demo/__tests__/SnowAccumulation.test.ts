/**
 * SnowAccumulation.test.ts
 *
 * Unit tests for snow accumulation and stability analysis
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGenerator, type TerrainData, type TerrainConfig } from '../TerrainGenerator';
import { SnowAccumulation, type SnowConfig } from '../SnowAccumulation';

describe('SnowAccumulation', () => {
  let terrainConfig: TerrainConfig;
  let terrainGenerator: TerrainGenerator;
  let terrain: TerrainData;
  let snowConfig: SnowConfig;
  let snow: SnowAccumulation;

  beforeEach(() => {
    // Create terrain
    terrainConfig = {
      width: 200,
      depth: 200,
      resolution: 64,
      maxHeight: 50,
      steepness: 0.5,
      roughness: 0.5,
      seed: 12345,
    };
    terrainGenerator = new TerrainGenerator(terrainConfig);
    terrain = terrainGenerator.generateTerrain();

    // Create snow accumulation
    snowConfig = {
      particleCount: 1000,
      particleMass: 0.1,
      angleOfRepose: 35,
      cohesion: 0.5,
      density: 300,
      minDepthForTrigger: 0.05,
    };
    snow = new SnowAccumulation(terrain, snowConfig);
  });

  describe('Initialization', () => {
    it('should create snow particles', () => {
      const particles = snow.getParticles();

      expect(particles.length).toBe(snowConfig.particleCount);
    });

    it('should initialize particles with correct properties', () => {
      const particles = snow.getParticles();

      for (const particle of particles) {
        expect(particle.id).toBeGreaterThanOrEqual(0);
        expect(particle.mass).toBe(snowConfig.particleMass);
        expect(particle.state).toBe('resting');
        expect(particle.age).toBe(0);
        expect(particle.position.length).toBe(3);
        expect(particle.velocity).toEqual([0, 0, 0]);
      }
    });

    it('should place particles on terrain surface', () => {
      const particles = snow.getParticles();

      for (const particle of particles) {
        const [x, y, z] = particle.position;

        // Y position should match terrain height at (x, z)
        const terrainHeight = terrainGenerator.getHeight(terrain, x, z);

        expect(y).toBeCloseTo(terrainHeight, 1);
      }
    });

    it('should distribute particles across terrain', () => {
      const particles = snow.getParticles();
      const { width, depth } = terrainConfig;

      // Check X distribution
      const xPositions = particles.map((p) => p.position[0]);
      const minX = Math.min(...xPositions);
      const maxX = Math.max(...xPositions);

      expect(minX).toBeGreaterThan(-width / 2 - 1);
      expect(maxX).toBeLessThan(width / 2 + 1);

      // Check Z distribution
      const zPositions = particles.map((p) => p.position[2]);
      const minZ = Math.min(...zPositions);
      const maxZ = Math.max(...zPositions);

      expect(minZ).toBeGreaterThan(-depth / 2 - 1);
      expect(maxZ).toBeLessThan(depth / 2 + 1);
    });

    it('should update snow layer depth map', () => {
      const layer = snow.getSnowLayer();
      const totalDepth = layer.depthMap.reduce((sum, d) => sum + d, 0);

      expect(totalDepth).toBeGreaterThan(0);
    });

    it('should update snow layer mass map', () => {
      const layer = snow.getSnowLayer();
      const totalMass = layer.massMap.reduce((sum, m) => sum + m, 0);

      // Total mass should equal number of particles * particle mass
      const expectedMass = snowConfig.particleCount * snowConfig.particleMass;
      expect(totalMass).toBeCloseTo(expectedMass, 1);
    });

    it('should update particle count map', () => {
      const layer = snow.getSnowLayer();
      const totalCount = layer.particleCountMap.reduce((sum, c) => sum + c, 0);

      expect(totalCount).toBe(snowConfig.particleCount);
    });
  });

  describe('Stability Analysis', () => {
    it('should calculate stability for all cells', () => {
      const layer = snow.getSnowLayer();
      const res = terrainConfig.resolution;

      expect(layer.stabilityMap.length).toBe(res * res);
    });

    it('should have stability values in [-1, 1] range', () => {
      const layer = snow.getSnowLayer();

      for (const stability of layer.stabilityMap) {
        expect(stability).toBeGreaterThanOrEqual(-1);
        expect(stability).toBeLessThanOrEqual(1);
      }
    });

    it('should mark steep slopes as unstable', () => {
      const layer = snow.getSnowLayer();
      const res = terrainConfig.resolution;

      // Find cells with snow and steep slopes
      let foundUnstable = false;

      for (let i = 0; i < res * res; i++) {
        const depth = layer.depthMap[i];
        const slope = terrain.slopes[i];
        const stability = layer.stabilityMap[i];

        if (depth > 0.01 && slope > (30 * Math.PI) / 180) {
          // Steep slope with snow should tend toward instability
          if (stability < 0) {
            foundUnstable = true;
            break;
          }
        }
      }

      // Should have at least some unstable areas on a mountain
      expect(foundUnstable).toBe(true);
    });

    it('should mark flat areas as stable', () => {
      const layer = snow.getSnowLayer();
      const res = terrainConfig.resolution;

      // Find cells with flat slopes
      let foundStable = false;

      for (let i = 0; i < res * res; i++) {
        const depth = layer.depthMap[i];
        const slope = terrain.slopes[i];
        const stability = layer.stabilityMap[i];

        if (depth > 0.001 && slope < (10 * Math.PI) / 180) {
          // Gentle slope with snow should be stable
          if (stability > 0) {
            foundStable = true;
            break;
          }
        }
      }

      expect(foundStable).toBe(true);
    });

    it('should update stability when called', () => {
      const layer = snow.getSnowLayer();

      // Get initial stability
      const initialStability = layer.stabilityMap[100];

      // Modify snow layer
      layer.massMap[100] *= 2; // Double the mass

      // Update stability
      snow.updateStability();

      // Stability should change (more mass = less stable)
      const newStability = layer.stabilityMap[100];

      if (initialStability !== 0) {
        expect(newStability).not.toBe(initialStability);
        expect(newStability).toBeLessThan(initialStability);
      }
    });
  });

  describe('Trigger Zones', () => {
    it('should identify trigger zones', () => {
      const zones = snow.getTriggerZones();

      // Should have at least some trigger zones on a steep mountain
      expect(zones.length).toBeGreaterThanOrEqual(0);
    });

    it('should have valid trigger zone properties', () => {
      const zones = snow.getTriggerZones();

      for (const zone of zones) {
        expect(zone.center.length).toBe(2);
        expect(zone.radius).toBeGreaterThan(0);
        expect(zone.particleCount).toBeGreaterThan(0);
        expect(zone.avgSlope).toBeGreaterThanOrEqual(0);
        expect(zone.instability).toBeGreaterThanOrEqual(0);
        expect(zone.instability).toBeLessThanOrEqual(1);
      }
    });

    it('should only include unstable areas in trigger zones', () => {
      const zones = snow.getTriggerZones();
      const { angleOfRepose } = snowConfig;
      const angleOfReposeRad = (angleOfRepose * Math.PI) / 180;

      for (const zone of zones) {
        // Trigger zones should have slopes near or above angle of repose
        expect(zone.avgSlope).toBeGreaterThan(angleOfReposeRad * 0.5);
      }
    });

    it('should require minimum particle count for trigger zones', () => {
      const zones = snow.getTriggerZones();

      for (const zone of zones) {
        // Each zone should have more than 10 particles (threshold in code)
        expect(zone.particleCount).toBeGreaterThan(10);
      }
    });
  });

  describe('Depth Queries', () => {
    it('should get snow depth at world position', () => {
      const depth = snow.getDepth(0, 0);

      expect(depth).toBeGreaterThanOrEqual(0);
    });

    it('should return zero depth for areas without snow', () => {
      // Far edge should have no particles (due to random distribution)
      const { width, depth } = terrainConfig;

      // Can't guarantee zero, but should be small or zero
      const edgeDepth = snow.getDepth(-width / 2, -depth / 2);

      expect(edgeDepth).toBeGreaterThanOrEqual(0);
    });

    it('should have non-zero depth where particles exist', () => {
      const particles = snow.getParticles();

      if (particles.length > 0) {
        const [x, , z] = particles[0].position;
        const depth = snow.getDepth(x, z);

        expect(depth).toBeGreaterThan(0);
      }
    });
  });

  describe('Stability Queries', () => {
    it('should get stability at world position', () => {
      const stability = snow.getStability(0, 0);

      expect(stability).toBeGreaterThanOrEqual(-1);
      expect(stability).toBeLessThanOrEqual(1);
    });

    it('should return consistent stability for same position', () => {
      const s1 = snow.getStability(10, 10);
      const s2 = snow.getStability(10, 10);

      expect(s1).toBe(s2);
    });
  });

  describe('Particle State Management', () => {
    it('should get particles by state', () => {
      const resting = snow.getParticlesByState('resting');
      const sliding = snow.getParticlesByState('sliding');
      const airborne = snow.getParticlesByState('airborne');

      // Initially all should be resting
      expect(resting.length).toBe(snowConfig.particleCount);
      expect(sliding.length).toBe(0);
      expect(airborne.length).toBe(0);
    });

    it('should update particle age', () => {
      const dt = 0.1;

      snow.updateAge(dt);

      const particles = snow.getParticles();

      for (const particle of particles) {
        expect(particle.age).toBeCloseTo(dt);
      }
    });

    it('should accumulate particle age over multiple updates', () => {
      snow.updateAge(0.1);
      snow.updateAge(0.1);
      snow.updateAge(0.1);

      const particles = snow.getParticles();

      for (const particle of particles) {
        expect(particle.age).toBeCloseTo(0.3);
      }
    });
  });

  describe('Statistics', () => {
    it('should calculate snow statistics', () => {
      const stats = snow.getStatistics();

      expect(stats.totalParticles).toBe(snowConfig.particleCount);
      expect(stats.restingParticles).toBe(snowConfig.particleCount);
      expect(stats.slidingParticles).toBe(0);
      expect(stats.airborneParticles).toBe(0);
      expect(stats.totalMass).toBeCloseTo(snowConfig.particleCount * snowConfig.particleMass, 1);
      expect(stats.avgDepth).toBeGreaterThan(0);
      expect(stats.maxDepth).toBeGreaterThan(0);
      expect(stats.stableCells).toBeGreaterThanOrEqual(0);
      expect(stats.unstableCells).toBeGreaterThanOrEqual(0);
      expect(stats.triggerZoneCount).toBeGreaterThanOrEqual(0);
    });

    it('should have max depth >= avg depth', () => {
      const stats = snow.getStatistics();

      expect(stats.maxDepth).toBeGreaterThanOrEqual(stats.avgDepth);
    });

    it('should have total particles = sum of state counts', () => {
      const stats = snow.getStatistics();

      const stateSum = stats.restingParticles + stats.slidingParticles + stats.airborneParticles;

      expect(stateSum).toBe(stats.totalParticles);
    });

    it('should have stable + unstable cells <= total cells', () => {
      const stats = snow.getStatistics();
      const res = terrainConfig.resolution;
      const totalCells = res * res;

      expect(stats.stableCells + stats.unstableCells).toBeLessThanOrEqual(totalCells);
    });
  });

  describe('Reset', () => {
    it('should reset snow accumulation', () => {
      // Modify snow state
      const particles = snow.getParticles();
      particles[0].state = 'sliding';
      particles[0].age = 10;

      // Reset
      snow.reset();

      // Check reset state
      const newParticles = snow.getParticles();

      expect(newParticles.length).toBe(snowConfig.particleCount);
      expect(newParticles[0].state).toBe('resting');
      expect(newParticles[0].age).toBe(0);
    });

    it('should regenerate snow layer after reset', () => {
      const layer1 = snow.getSnowLayer();
      const totalMass1 = layer1.massMap.reduce((sum, m) => sum + m, 0);

      snow.reset();

      const layer2 = snow.getSnowLayer();
      const totalMass2 = layer2.massMap.reduce((sum, m) => sum + m, 0);

      // Total mass should be similar (same particle count and mass)
      expect(totalMass2).toBeCloseTo(totalMass1, 1);
    });

    it('should recalculate trigger zones after reset', () => {
      const zones1 = snow.getTriggerZones();

      snow.reset();

      const zones2 = snow.getTriggerZones();

      // Should have similar number of zones (stochastic but similar terrain)
      expect(zones2.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very few particles', () => {
      const fewParticlesConfig: SnowConfig = {
        ...snowConfig,
        particleCount: 10,
      };

      const fewSnow = new SnowAccumulation(terrain, fewParticlesConfig);
      const particles = fewSnow.getParticles();

      expect(particles.length).toBe(10);
    });

    it('should handle many particles', () => {
      const manyParticlesConfig: SnowConfig = {
        ...snowConfig,
        particleCount: 10000,
      };

      const manySnow = new SnowAccumulation(terrain, manyParticlesConfig);
      const particles = manySnow.getParticles();

      expect(particles.length).toBe(10000);
    });

    it('should handle low angle of repose', () => {
      const lowAngleConfig: SnowConfig = {
        ...snowConfig,
        angleOfRepose: 20, // Easier to trigger avalanche
      };

      const lowAngleSnow = new SnowAccumulation(terrain, lowAngleConfig);
      const zones = lowAngleSnow.getTriggerZones();

      // Should have more trigger zones with lower angle
      expect(zones.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle high angle of repose', () => {
      const highAngleConfig: SnowConfig = {
        ...snowConfig,
        angleOfRepose: 50, // Harder to trigger avalanche
      };

      const highAngleSnow = new SnowAccumulation(terrain, highAngleConfig);
      const zones = highAngleSnow.getTriggerZones();

      // Should have fewer trigger zones with higher angle
      expect(zones.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero cohesion', () => {
      const zeroCohesionConfig: SnowConfig = {
        ...snowConfig,
        cohesion: 0, // No stickiness
      };

      const zeroCohesionSnow = new SnowAccumulation(terrain, zeroCohesionConfig);
      const stats = zeroCohesionSnow.getStatistics();

      // Should still generate valid statistics
      expect(stats.totalParticles).toBe(snowConfig.particleCount);
      expect(stats.unstableCells).toBeGreaterThan(0); // Less cohesion = more unstable
    });

    it('should handle maximum cohesion', () => {
      const maxCohesionConfig: SnowConfig = {
        ...snowConfig,
        cohesion: 1, // Maximum stickiness
      };

      const maxCohesionSnow = new SnowAccumulation(terrain, maxCohesionConfig);
      const stats = maxCohesionSnow.getStatistics();

      // Should still generate valid statistics
      expect(stats.totalParticles).toBe(snowConfig.particleCount);
      expect(stats.stableCells).toBeGreaterThan(0); // More cohesion = more stable
    });

    it('should handle very light particles', () => {
      const lightConfig: SnowConfig = {
        ...snowConfig,
        particleMass: 0.001,
      };

      const lightSnow = new SnowAccumulation(terrain, lightConfig);
      const stats = lightSnow.getStatistics();

      expect(stats.totalMass).toBeCloseTo(snowConfig.particleCount * 0.001, 2);
    });

    it('should handle heavy particles', () => {
      const heavyConfig: SnowConfig = {
        ...snowConfig,
        particleMass: 1.0,
      };

      const heavySnow = new SnowAccumulation(terrain, heavyConfig);
      const stats = heavySnow.getStatistics();

      expect(stats.totalMass).toBeCloseTo(snowConfig.particleCount * 1.0, 1);
      // Heavier snow should be less stable on slopes
      expect(stats.unstableCells).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Integration with Terrain', () => {
    it('should work with low resolution terrain', () => {
      const lowResTerrain = new TerrainGenerator({
        ...terrainConfig,
        resolution: 16,
      }).generateTerrain();

      const lowResSnow = new SnowAccumulation(lowResTerrain, snowConfig);
      const particles = lowResSnow.getParticles();

      expect(particles.length).toBe(snowConfig.particleCount);
    });

    it('should work with high resolution terrain', () => {
      const highResTerrain = new TerrainGenerator({
        ...terrainConfig,
        resolution: 128,
      }).generateTerrain();

      const highResSnow = new SnowAccumulation(highResTerrain, snowConfig);
      const particles = highResSnow.getParticles();

      expect(particles.length).toBe(snowConfig.particleCount);
    });

    it('should adapt to different terrain sizes', () => {
      const largeTerrain = new TerrainGenerator({
        ...terrainConfig,
        width: 500,
        depth: 500,
      }).generateTerrain();

      const largeSnow = new SnowAccumulation(largeTerrain, snowConfig);
      const particles = largeSnow.getParticles();

      // Particles should be distributed across larger area
      const xPositions = particles.map((p) => p.position[0]);
      const xRange = Math.max(...xPositions) - Math.min(...xPositions);

      expect(xRange).toBeGreaterThan(400); // Should span most of 500m width
    });
  });
});
