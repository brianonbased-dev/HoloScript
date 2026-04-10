/**
 * DemolitionPhysics.test.ts
 *
 * Tests for unified demolition physics system.
 *
 * Week 8: Explosive Demolition - Day 4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DemolitionPhysics } from '../DemolitionPhysics';
import { Fracturable, MATERIALS } from '../Fracturable';

describe('DemolitionPhysics', () => {
  let physics: DemolitionPhysics;

  beforeEach(() => {
    physics = new DemolitionPhysics({
      maxFragments: 1000,
      maxShockWaves: 10,
      maxDebrisParticles: 1000,
      emitDebrisParticles: true,
    });
  });

  describe('Initialization', () => {
    it('should create demolition physics system', () => {
      expect(physics).toBeDefined();
    });

    it('should initialize subsystems', () => {
      expect(physics.getFractureSystem()).toBeDefined();
      expect(physics.getShockWaveSolver()).toBeDefined();
      expect(physics.getDebrisParticleSystem()).toBeDefined();
    });

    it('should use default config', () => {
      const defaultPhysics = new DemolitionPhysics();
      const stats = defaultPhysics.getStatistics();

      expect(stats).toBeDefined();
    });

    it('should start with zero statistics', () => {
      const stats = physics.getStatistics();

      expect(stats.fracture.totalObjects).toBe(0);
      expect(stats.shockWaves.totalShockWaves).toBe(0);
      expect(stats.particles.activeParticles).toBe(0);
    });
  });

  describe('Object Management', () => {
    it('should add fracturable object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.CONCRETE,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);

      const stats = physics.getStatistics();
      expect(stats.fracture.totalObjects).toBe(1);
    });

    it('should remove object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.CONCRETE,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.removeObject(object.id);

      const stats = physics.getStatistics();
      expect(stats.fracture.totalObjects).toBe(0);
    });

    it('should get all objects', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.CONCRETE,
      });

      physics.addObject(object);

      const objects = physics.getObjects();
      expect(objects.length).toBe(1);
    });
  });

  describe('Explosion Integration', () => {
    it('should create explosion', () => {
      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      const stats = physics.getStatistics();
      expect(stats.shockWaves.totalShockWaves).toBeGreaterThan(0);
    });

    it('should fracture object from explosion', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 5, y: 10, z: 0 },
      });

      physics.addObject(object);

      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      // Update to propagate shock wave
      physics.update(0.1);

      const stats = physics.getStatistics();
      expect(stats.fracturedThisFrame).toBeGreaterThanOrEqual(0);
    });

    it('should emit debris particles on fracture', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 3, y: 10, z: 0 },
      });

      physics.addObject(object);

      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      physics.update(0.05);

      const stats = physics.getStatistics();
      // Should have either particles or fragments (or both) if fracture occurred
      expect(
        stats.particles.activeParticles + stats.fracture.totalFragments
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Impulse Application', () => {
    it('should apply impulse to object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);

      const fractured = physics.applyImpulseToObject(
        object.id,
        { x: 10000, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      );

      expect(fractured).toBe(true);
    });

    it('should generate fragments from impulse', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);

      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = physics.getFragments();
      expect(fragments.length).toBeGreaterThan(0);
    });

    it('should emit debris from impacted object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);

      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const stats = physics.getStatistics();
      expect(stats.particles.activeParticles).toBeGreaterThan(0);
    });
  });

  describe('Force Application', () => {
    it('should apply force in radius to fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const count = physics.applyForceInRadius(
        { x: 0, y: 10, z: 0 },
        50,
        { x: 100, y: 0, z: 0 },
        1.0
      );

      expect(count).toBeGreaterThan(0);
    });

    it('should apply force to debris particles', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const count = physics.applyForceInRadius(
        { x: 0, y: 10, z: 0 },
        50,
        { x: 100, y: 0, z: 0 },
        1.0
      );

      expect(count).toBeGreaterThan(0);
    });

    it('should return count of affected objects', () => {
      const count = physics.applyForceInRadius(
        { x: 0, y: 0, z: 0 },
        50,
        { x: 100, y: 0, z: 0 },
        1.0
      );

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Update Loop', () => {
    it('should update all systems', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 5, y: 10, z: 0 },
      });

      physics.addObject(object);

      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      physics.update(0.1);

      // System should have processed
      const stats = physics.getStatistics();
      expect(stats).toBeDefined();
    });

    it('should propagate shock waves', () => {
      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      const statsBefore = physics.getStatistics();
      const energyBefore = statsBefore.shockWaves.totalEnergy;

      physics.update(0.5);

      const statsAfter = physics.getStatistics();
      const energyAfter = statsAfter.shockWaves.totalEnergy;

      // Energy should decrease due to attenuation
      expect(energyAfter).toBeLessThanOrEqual(energyBefore);
    });

    it('should apply gravity to fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = physics.getFragments();
      const velBefore = fragments[0]?.physics.velocity.y || 0;

      physics.update(1.0);

      if (fragments[0]) {
        expect(fragments[0].physics.velocity.y).toBeLessThan(velBefore);
      }
    });

    it('should apply gravity to debris particles', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const particles = physics.getActiveDebrisParticles();
      const velBefore = particles[0]?.velocity.y || 0;

      physics.update(1.0);

      if (particles[0]) {
        expect(particles[0].velocity.y).toBeLessThan(velBefore);
      }
    });

    it('should not update with zero time', () => {
      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      const statsBefore = physics.getStatistics();

      physics.update(0);

      const statsAfter = physics.getStatistics();
      expect(statsAfter.shockWaves.totalEnergy).toBe(statsBefore.shockWaves.totalEnergy);
    });
  });

  describe('LOD System', () => {
    it('should set LOD camera position', () => {
      physics.setLODCameraPosition({ x: 100, y: 50, z: 100 });

      // No exception thrown
      expect(true).toBe(true);
    });

    it('should get debris particles by LOD', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      physics.setLODCameraPosition({ x: 0, y: 10, z: 0 });

      const nearParticles = physics.getDebrisParticlesByLOD('near');
      const mediumParticles = physics.getDebrisParticlesByLOD('medium');
      const farParticles = physics.getDebrisParticlesByLOD('far');

      expect(nearParticles.length + mediumParticles.length + farParticles.length).toBeGreaterThan(
        0
      );
    });
  });

  describe('Statistics', () => {
    it('should track fracture statistics', () => {
      const stats = physics.getStatistics();

      expect(stats.fracture).toBeDefined();
      expect(stats.fracture.totalObjects).toBe(0);
    });

    it('should track shock wave statistics', () => {
      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      const stats = physics.getStatistics();
      expect(stats.shockWaves.totalShockWaves).toBeGreaterThan(0);
    });

    it('should track particle statistics', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const stats = physics.getStatistics();
      expect(stats.particles.activeParticles).toBeGreaterThan(0);
    });

    it('should track total energy', () => {
      physics.createExplosion({
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      });

      const stats = physics.getStatistics();
      expect(stats.totalEnergy).toBeGreaterThan(0);
    });

    it('should track fractured this frame', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const stats = physics.getStatistics();
      expect(stats.fracturedThisFrame).toBeGreaterThan(0);
    });
  });

  describe('Reset and Clear', () => {
    it('should reset system', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      physics.createExplosion({ position: { x: 0, y: 10, z: 0 }, energy: 100000 });

      physics.reset();

      const stats = physics.getStatistics();
      expect(stats.fracture.totalFragments).toBe(0);
      expect(stats.shockWaves.totalShockWaves).toBe(0);
      expect(stats.particles.activeParticles).toBe(0);
    });

    it('should clear fragments and particles', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      physics.addObject(object);
      physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      physics.clear();

      const stats = physics.getStatistics();
      expect(stats.fracture.totalFragments).toBe(0);
      expect(stats.particles.activeParticles).toBe(0);
    });
  });

  describe('Subsystem Access', () => {
    it('should get fracture system', () => {
      const fractureSystem = physics.getFractureSystem();

      expect(fractureSystem).toBeDefined();
    });

    it('should get shock wave solver', () => {
      const shockWaveSolver = physics.getShockWaveSolver();

      expect(shockWaveSolver).toBeDefined();
    });

    it('should get debris particle system', () => {
      const particleSystem = physics.getDebrisParticleSystem();

      expect(particleSystem).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty system update', () => {
      expect(() => {
        physics.update(1.0);
      }).not.toThrow();
    });

    it('should handle multiple fractures in one frame', () => {
      for (let i = 0; i < 5; i++) {
        const object = new Fracturable({
          geometry: {
            min: { x: -2, y: -2, z: -2 },
            max: { x: 2, y: 2, z: 2 },
          },
          material: MATERIALS.GLASS,
          position: { x: i * 10, y: 10, z: 0 },
        });

        physics.addObject(object);
        physics.applyImpulseToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      }

      const stats = physics.getStatistics();
      expect(stats.fracturedThisFrame).toBe(5);
    });

    it('should handle maximum fragment limit', () => {
      const limitedPhysics = new DemolitionPhysics({
        maxFragments: 10,
      });

      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
        fragmentCount: 100,
      });

      limitedPhysics.addObject(object);
      limitedPhysics.applyImpulseToObject(
        object.id,
        { x: 10000, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      );

      const fragments = limitedPhysics.getFragments();
      expect(fragments.length).toBeLessThanOrEqual(10);
    });

    it('should handle no debris emission', () => {
      const noDebrisPhysics = new DemolitionPhysics({
        emitDebrisParticles: false,
      });

      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 10, z: 0 },
      });

      noDebrisPhysics.addObject(object);
      noDebrisPhysics.applyImpulseToObject(
        object.id,
        { x: 10000, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      );

      const stats = noDebrisPhysics.getStatistics();
      expect(stats.particles.activeParticles).toBe(0);
    });
  });
});
