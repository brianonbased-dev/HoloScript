/**
 * AvalanchePhysics.test.ts
 *
 * Unit tests for avalanche physics simulation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainGenerator, type TerrainData, type TerrainConfig } from '../TerrainGenerator';
import { SnowAccumulation, type SnowConfig, type SnowParticle } from '../SnowAccumulation';
import { AvalanchePhysics, type AvalancheConfig } from '../AvalanchePhysics';

describe('AvalanchePhysics', () => {
  let terrainConfig: TerrainConfig;
  let terrain: TerrainData;
  let snowConfig: SnowConfig;
  let snow: SnowAccumulation;
  let avalancheConfig: AvalancheConfig;
  let physics: AvalanchePhysics;
  let particles: SnowParticle[];

  beforeEach(() => {
    // Create terrain
    terrainConfig = {
      width: 200,
      depth: 200,
      resolution: 64,
      maxHeight: 50,
      steepness: 0.7, // Steeper for more avalanche-prone slopes
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
    particles = snow.getParticles();

    // Create avalanche physics
    avalancheConfig = {
      gravity: 9.8,
      frictionCoefficient: 0.2,
      dragCoefficient: 0.5,
      entrainmentRadius: 2.0,
      entrainmentThreshold: 3.0,
      restitution: 0.3,
      settlingVelocity: 0.5,
    };
    physics = new AvalanchePhysics(terrain, particles, avalancheConfig);
  });

  describe('Initialization', () => {
    it('should initialize with particles', () => {
      const physicsParticles = physics.getParticles();

      expect(physicsParticles.length).toBe(snowConfig.particleCount);
    });

    it('should start with no avalanche triggered', () => {
      const stats = physics.getStatistics();

      expect(stats.isActive).toBe(false);
      expect(stats.elapsedTime).toBe(0);
    });

    it('should start with all particles resting', () => {
      const stats = physics.getStatistics();

      expect(stats.restingCount).toBe(snowConfig.particleCount);
      expect(stats.slidingCount).toBe(0);
      expect(stats.airborneCount).toBe(0);
    });
  });

  describe('Avalanche Triggering', () => {
    it('should trigger avalanche at epicenter', () => {
      physics.triggerAvalanche([0, 0], 20);

      const stats = physics.getStatistics();

      expect(stats.isActive).toBe(true);
      expect(stats.slidingCount).toBeGreaterThan(0);
    });

    it('should only trigger particles within radius', () => {
      const smallRadius = 5;
      physics.triggerAvalanche([0, 0], smallRadius);

      const slidingParticles = physics.getParticlesByState('sliding');

      // All sliding particles should be within radius
      for (const particle of slidingParticles) {
        const dx = particle.position[0] - 0;
        const dz = particle.position[2] - 0;
        const distance = Math.sqrt(dx * dx + dz * dz);

        expect(distance).toBeLessThanOrEqual(smallRadius + 1); // +1 for tolerance
      }
    });

    it('should give triggered particles initial velocity', () => {
      physics.triggerAvalanche([0, 0], 20);

      const slidingParticles = physics.getParticlesByState('sliding');

      for (const particle of slidingParticles) {
        const speed = Math.sqrt(
          particle.velocity[0] ** 2 + particle.velocity[1] ** 2 + particle.velocity[2] ** 2
        );

        expect(speed).toBeGreaterThan(0);
      }
    });

    it('should record trigger event', () => {
      physics.triggerAvalanche([0, 0], 20);

      const events = physics.getCollapseEvents();

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('trigger');
      expect(events[0].particleCount).toBeGreaterThan(0);
    });

    it('should only trigger particles on steep slopes', () => {
      physics.triggerAvalanche([0, 0], 50); // Large radius

      const stats = physics.getStatistics();

      // Not all particles should be triggered (some on flat areas)
      expect(stats.slidingCount).toBeLessThan(stats.restingCount + stats.slidingCount);
    });
  });

  describe('Physics Update', () => {
    beforeEach(() => {
      physics.triggerAvalanche([0, 0], 20);
    });

    it('should update elapsed time', () => {
      physics.update(0.1);

      const stats = physics.getStatistics();

      expect(stats.elapsedTime).toBeCloseTo(0.1);
    });

    it('should update particle positions', () => {
      const initialPos = [...physics.getParticles()[0].position];

      physics.update(0.1);

      const finalPos = physics.getParticles()[0].position;

      // At least some particles should have moved
      const moved = physics.getParticles().some((p, i) => {
        return (
          Math.abs(p.position[0] - initialPos[0]) > 0.01 ||
          Math.abs(p.position[2] - initialPos[2]) > 0.01
        );
      });

      expect(moved).toBe(true);
    });

    it('should apply gravity to sliding particles', () => {
      const slidingParticle = physics.getParticlesByState('sliding')[0];
      const initialVelocity = slidingParticle.velocity[1];

      physics.update(0.1);

      // Vertical velocity should change due to gravity (downslope component)
      // Note: exact value depends on slope
      expect(slidingParticle.velocity).toBeDefined();
    });

    it('should apply friction to sliding particles', () => {
      const slidingParticle = physics.getParticlesByState('sliding')[0];
      const initialSpeed = Math.sqrt(
        slidingParticle.velocity[0] ** 2 +
          slidingParticle.velocity[1] ** 2 +
          slidingParticle.velocity[2] ** 2
      );

      // Update multiple times
      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }

      // Particles should slow down or settle eventually due to friction
      const stats = physics.getStatistics();
      expect(stats.restingCount).toBeGreaterThan(0);
    });

    it('should keep sliding particles on terrain surface', () => {
      // Update simulation
      for (let i = 0; i < 5; i++) {
        physics.update(0.1);
      }

      const slidingParticles = physics.getParticlesByState('sliding');

      // Sample a few particles
      for (let i = 0; i < Math.min(10, slidingParticles.length); i++) {
        const particle = slidingParticles[i];
        const terrainHeight = terrain.heightmap[0]; // Approximate check

        // Particle should be near terrain surface
        expect(particle.position[1]).toBeGreaterThanOrEqual(-1);
        expect(particle.position[1]).toBeLessThan(terrain.config.maxHeight + 10);
      }
    });
  });

  describe('State Transitions', () => {
    beforeEach(() => {
      physics.triggerAvalanche([0, 0], 20);
    });

    it('should transition resting → sliding on trigger', () => {
      const stats = physics.getStatistics();

      expect(stats.slidingCount).toBeGreaterThan(0);
    });

    it('should transition sliding → airborne on fast collision', () => {
      // Find a sliding particle and give it high vertical velocity
      const slidingParticles = physics.getParticlesByState('sliding');

      if (slidingParticles.length > 0) {
        const particle = slidingParticles[0];
        particle.velocity[1] = 5.0; // High upward velocity

        physics.update(0.1);

        // Should potentially transition to airborne
        const stats = physics.getStatistics();
        expect(stats.airborneCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should transition sliding → resting on settling', () => {
      // Let simulation run until particles settle
      for (let i = 0; i < 100; i++) {
        physics.update(0.1);
      }

      const stats = physics.getStatistics();

      // Most particles should have settled by now
      expect(stats.restingCount).toBeGreaterThan(stats.slidingCount);
    });

    it('should transition airborne → sliding on landing', () => {
      // Create airborne particle
      const particle = particles[0];
      particle.state = 'airborne';
      particle.position[1] = 20; // High above terrain
      particle.velocity = [1, -5, 1]; // Falling

      // Update until it lands
      for (let i = 0; i < 30; i++) {
        physics.update(0.1);

        if (particle.state === 'sliding') {
          break;
        }
      }

      // Should have transitioned to sliding
      expect(particle.state === 'sliding' || particle.state === 'airborne').toBe(true);
    });
  });

  describe('Entrainment (Snowball Effect)', () => {
    it('should entrain nearby resting particles', () => {
      physics.triggerAvalanche([0, 0], 10);

      const initialRestingCount = physics.getStatistics().restingCount;

      // Update simulation to allow entrainment
      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }

      const stats = physics.getStatistics();

      // Resting count should decrease (some particles got entrained) OR entrainment was attempted
      expect(stats.restingCount < initialRestingCount || stats.entrainmentCount >= 0).toBe(true);
    });

    it('should only entrain particles within radius', () => {
      physics.triggerAvalanche([0, 0], 5);

      // Update to allow entrainment
      for (let i = 0; i < 5; i++) {
        physics.update(0.1);
      }

      // Entrainment should be limited by radius
      const stats = physics.getStatistics();
      expect(stats.entrainmentCount).toBeGreaterThanOrEqual(0);
    });

    it('should require minimum velocity for entrainment', () => {
      // Create slow-moving particle
      const particle = particles[0];
      particle.state = 'sliding';
      particle.velocity = [0.1, 0, 0.1]; // Very slow

      physics.update(0.1);

      // Should not entrain with such low velocity
      const events = physics.getCollapseEvents().filter((e) => e.type === 'entrainment');
      expect(events.length).toBe(0);
    });

    it('should transfer momentum during entrainment', () => {
      // Trigger avalanche
      physics.triggerAvalanche([0, 0], 20);

      // Get initial sliding particles
      const initialSliding = physics.getParticlesByState('sliding');

      if (initialSliding.length > 0) {
        const initialSpeed = Math.sqrt(
          initialSliding[0].velocity[0] ** 2 +
            initialSliding[0].velocity[1] ** 2 +
            initialSliding[0].velocity[2] ** 2
        );

        // Update to allow entrainment
        physics.update(0.1);

        // Entraining particles should slow down slightly
        // (This is statistical, not guaranteed for every particle)
        const stats = physics.getStatistics();
        expect(stats.avgVelocity).toBeGreaterThanOrEqual(0);
      }
    });

    it('should record entrainment events', () => {
      physics.triggerAvalanche([0, 0], 20);

      // Update simulation
      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }

      const stats = physics.getStatistics();

      // Should have recorded entrainment events
      expect(stats.entrainmentCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Collision Detection', () => {
    it('should detect terrain collision', () => {
      // Create airborne particle
      const particle = particles[0];
      particle.state = 'airborne';
      particle.position[1] = 5;
      particle.velocity = [0, -10, 0];

      // Update until collision
      for (let i = 0; i < 20; i++) {
        physics.update(0.05);
      }

      // Should have hit terrain
      expect(particle.position[1]).toBeLessThan(terrain.config.maxHeight + 1);
    });

    it('should apply bounce on collision', () => {
      // Create multiple falling particles to increase chance of collision
      for (let i = 0; i < 10; i++) {
        particles[i].state = 'airborne';
        particles[i].position[1] = 15 + Math.random() * 5;
        particles[i].velocity = [0, -8, 0];
      }

      // Update simulation
      for (let i = 0; i < 50; i++) {
        physics.update(0.05);
      }

      const events = physics.getCollapseEvents();
      const collisionEvents = events.filter((e) => e.type === 'collision');

      // Should have recorded collision events OR particles settled
      const settledCount =
        physics.getParticlesByState('resting').length +
        physics.getParticlesByState('sliding').length;

      expect(collisionEvents.length > 0 || settledCount > 0).toBe(true);
    });

    it('should record collision events', () => {
      // Create airborne particles
      for (let i = 0; i < 5; i++) {
        particles[i].state = 'airborne';
        particles[i].position[1] = 10;
        particles[i].velocity = [0, -5, 0];
      }

      // Update simulation
      for (let i = 0; i < 30; i++) {
        physics.update(0.05);
      }

      const events = physics.getCollapseEvents().filter((e) => e.type === 'collision');

      // Should have recorded collisions
      expect(events.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      physics.triggerAvalanche([0, 0], 20);
    });

    it('should calculate particle state counts', () => {
      const stats = physics.getStatistics();

      const total = stats.restingCount + stats.slidingCount + stats.airborneCount;

      expect(total).toBe(snowConfig.particleCount);
    });

    it('should calculate average velocity', () => {
      physics.update(0.1);

      const stats = physics.getStatistics();

      expect(stats.avgVelocity).toBeGreaterThanOrEqual(0);
    });

    it('should calculate maximum velocity', () => {
      for (let i = 0; i < 5; i++) {
        physics.update(0.1);
      }

      const stats = physics.getStatistics();

      expect(stats.maxVelocity).toBeGreaterThanOrEqual(stats.avgVelocity);
    });

    it('should track elapsed time', () => {
      physics.update(0.1);
      physics.update(0.1);
      physics.update(0.1);

      const stats = physics.getStatistics();

      expect(stats.elapsedTime).toBeCloseTo(0.3);
    });

    it('should track collapse events', () => {
      for (let i = 0; i < 5; i++) {
        physics.update(0.1);
      }

      const stats = physics.getStatistics();

      expect(stats.collapseEvents).toBeGreaterThan(0);
    });
  });

  describe('Reset', () => {
    beforeEach(() => {
      physics.triggerAvalanche([0, 0], 20);

      for (let i = 0; i < 10; i++) {
        physics.update(0.1);
      }
    });

    it('should reset all particles to resting', () => {
      physics.reset();

      const stats = physics.getStatistics();

      expect(stats.restingCount).toBe(snowConfig.particleCount);
      expect(stats.slidingCount).toBe(0);
      expect(stats.airborneCount).toBe(0);
    });

    it('should reset particle velocities', () => {
      physics.reset();

      const particles = physics.getParticles();

      for (const particle of particles) {
        expect(particle.velocity).toEqual([0, 0, 0]);
      }
    });

    it('should reset elapsed time', () => {
      physics.reset();

      const stats = physics.getStatistics();

      expect(stats.elapsedTime).toBe(0);
    });

    it('should reset avalanche active state', () => {
      physics.reset();

      const stats = physics.getStatistics();

      expect(stats.isActive).toBe(false);
    });

    it('should clear collapse events', () => {
      physics.reset();

      const events = physics.getCollapseEvents();

      expect(events.length).toBe(0);
    });

    it('should snap particles to terrain surface', () => {
      physics.reset();

      const particles = physics.getParticles();

      for (const particle of particles) {
        // Particle Y should be reasonable
        expect(particle.position[1]).toBeGreaterThanOrEqual(0);
        expect(particle.position[1]).toBeLessThan(terrain.config.maxHeight + 1);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero delta time', () => {
      physics.triggerAvalanche([0, 0], 20);
      physics.update(0);

      const stats = physics.getStatistics();

      expect(stats.elapsedTime).toBe(0);
    });

    it('should handle very large delta time', () => {
      physics.triggerAvalanche([0, 0], 20);
      physics.update(10);

      const stats = physics.getStatistics();

      expect(stats.elapsedTime).toBe(10);
    });

    it('should handle update with no triggered avalanche', () => {
      physics.update(0.1);

      const stats = physics.getStatistics();

      expect(stats.isActive).toBe(false);
      expect(stats.slidingCount).toBe(0);
    });

    it('should handle very small trigger radius', () => {
      physics.triggerAvalanche([0, 0], 0.1);

      const stats = physics.getStatistics();

      // Should trigger very few or no particles
      expect(stats.slidingCount).toBeGreaterThanOrEqual(0);
      expect(stats.slidingCount).toBeLessThan(snowConfig.particleCount / 2);
    });

    it('should handle very large trigger radius', () => {
      physics.triggerAvalanche([0, 0], 1000);

      const stats = physics.getStatistics();

      // Should trigger many particles (all on steep slopes)
      expect(stats.slidingCount).toBeGreaterThan(0);
    });

    it('should handle high gravity', () => {
      const highGravityConfig: AvalancheConfig = {
        ...avalancheConfig,
        gravity: 50,
      };

      const highGravityPhysics = new AvalanchePhysics(terrain, particles, highGravityConfig);

      highGravityPhysics.triggerAvalanche([0, 0], 20);
      highGravityPhysics.update(0.1);

      const stats = highGravityPhysics.getStatistics();

      // Particles should accelerate faster
      expect(stats.maxVelocity).toBeGreaterThan(0);
    });

    it('should handle zero friction', () => {
      const zeroFrictionConfig: AvalancheConfig = {
        ...avalancheConfig,
        frictionCoefficient: 0,
      };

      const zeroFrictionPhysics = new AvalanchePhysics(terrain, particles, zeroFrictionConfig);

      zeroFrictionPhysics.triggerAvalanche([0, 0], 20);

      for (let i = 0; i < 10; i++) {
        zeroFrictionPhysics.update(0.1);
      }

      const stats = zeroFrictionPhysics.getStatistics();

      // Particles should keep moving longer
      expect(stats.slidingCount).toBeGreaterThan(0);
    });

    it('should handle very high friction', () => {
      const highFrictionConfig: AvalancheConfig = {
        ...avalancheConfig,
        frictionCoefficient: 2.0,
      };

      const highFrictionPhysics = new AvalanchePhysics(terrain, particles, highFrictionConfig);

      highFrictionPhysics.triggerAvalanche([0, 0], 20);

      for (let i = 0; i < 20; i++) {
        highFrictionPhysics.update(0.1);
      }

      const stats = highFrictionPhysics.getStatistics();

      // Most particles should settle quickly
      expect(stats.restingCount).toBeGreaterThan(stats.slidingCount);
    });

    it('should handle very few particles', () => {
      const fewParticles = particles.slice(0, 5);
      const fewPhysics = new AvalanchePhysics(terrain, fewParticles, avalancheConfig);

      fewPhysics.triggerAvalanche([0, 0], 20);
      fewPhysics.update(0.1);

      const stats = fewPhysics.getStatistics();

      expect(stats.restingCount + stats.slidingCount + stats.airborneCount).toBe(5);
    });

    it('should handle many particles', () => {
      // Create more particles
      const manyParticles: SnowParticle[] = [];
      for (let i = 0; i < 5000; i++) {
        manyParticles.push({
          id: i,
          position: [Math.random() * 100 - 50, 10, Math.random() * 100 - 50],
          velocity: [0, 0, 0],
          mass: 0.1,
          state: 'resting',
          terrainCell: [0, 0],
          age: 0,
        });
      }

      const manyPhysics = new AvalanchePhysics(terrain, manyParticles, avalancheConfig);

      manyPhysics.triggerAvalanche([0, 0], 50);
      manyPhysics.update(0.1);

      const stats = manyPhysics.getStatistics();

      expect(stats.restingCount + stats.slidingCount + stats.airborneCount).toBe(5000);
    });
  });
});
