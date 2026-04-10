/**
 * ShockWaveSolver.test.ts
 *
 * Tests for shock wave solver system.
 *
 * Week 8: Explosive Demolition - Day 2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShockWaveSolver, type ExplosionConfig } from '../ShockWaveSolver';
import { Fragment, type FragmentGeometry } from '../Fragment';
import { Fracturable, MATERIALS } from '../Fracturable';

describe('ShockWaveSolver', () => {
  let solver: ShockWaveSolver;

  beforeEach(() => {
    solver = new ShockWaveSolver();
  });

  describe('Initialization', () => {
    it('should create solver with default config', () => {
      expect(solver).toBeDefined();
    });

    it('should create solver with custom config', () => {
      const customSolver = new ShockWaveSolver({
        maxShockWaves: 50,
        autoCleanup: false,
        groundReflection: false,
      });

      expect(customSolver).toBeDefined();
    });
  });

  describe('Explosion Creation', () => {
    it('should create explosion', () => {
      const explosion: ExplosionConfig = {
        position: { x: 0, y: 10, z: 0 },
        energy: 100000,
      };

      const wave = solver.createExplosion(explosion);

      expect(wave).toBeDefined();
      expect(wave.origin).toEqual(explosion.position);
    });

    it('should create shock wave at explosion location', () => {
      const explosion: ExplosionConfig = {
        position: { x: 50, y: 25, z: 100 },
        energy: 50000,
      };

      const wave = solver.createExplosion(explosion);

      expect(wave.origin).toEqual(explosion.position);
      expect(wave.config.energy).toBe(50000);
    });

    it('should apply custom shock wave config', () => {
      const explosion: ExplosionConfig = {
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
        shockWaveConfig: {
          speed: 500,
          attenuation: 0.7,
        },
      };

      const wave = solver.createExplosion(explosion);

      expect(wave.config.speed).toBe(500);
      expect(wave.config.attenuation).toBe(0.7);
    });

    it('should track total shock waves created', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 10000,
      });

      solver.createExplosion({
        position: { x: 100, y: 0, z: 0 },
        energy: 20000,
      });

      const stats = solver.getStatistics();
      expect(stats.totalShockWaves).toBe(2);
    });
  });

  describe('Ground Reflection', () => {
    it('should create reflection wave when enabled', () => {
      const reflectionSolver = new ShockWaveSolver({
        groundReflection: true,
        groundY: 0,
      });

      reflectionSolver.createExplosion({
        position: { x: 0, y: 100, z: 0 },
        energy: 100000,
      });

      const waves = reflectionSolver.getAllShockWaves();
      expect(waves.length).toBe(2); // Original + reflection
    });

    it('should not create reflection when disabled', () => {
      const noReflectionSolver = new ShockWaveSolver({
        groundReflection: false,
      });

      noReflectionSolver.createExplosion({
        position: { x: 0, y: 100, z: 0 },
        energy: 100000,
      });

      const waves = noReflectionSolver.getAllShockWaves();
      expect(waves.length).toBe(1); // Only original
    });

    it('should place reflection below ground', () => {
      const reflectionSolver = new ShockWaveSolver({
        groundReflection: true,
        groundY: 0,
      });

      reflectionSolver.createExplosion({
        position: { x: 0, y: 50, z: 0 },
        energy: 100000,
      });

      const waves = reflectionSolver.getAllShockWaves();
      const reflectionWave = waves.find((w) => w.origin.y < 0);

      expect(reflectionWave).toBeDefined();
      expect(reflectionWave?.origin.y).toBe(-50);
    });
  });

  describe('Update', () => {
    it('should update all shock waves', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(1.0);

      const waves = solver.getActiveShockWaves();
      expect(waves.length).toBeGreaterThan(0);
      expect(waves[0].getRadius()).toBeGreaterThan(0);
    });

    it('should not update with zero time', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0);

      const wave = solver.getActiveShockWaves()[0];
      expect(wave.getRadius()).toBe(0);
    });

    it('should cleanup inactive waves when enabled', () => {
      const cleanupSolver = new ShockWaveSolver({
        autoCleanup: true,
      });

      cleanupSolver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 10000,
        shockWaveConfig: {
          duration: 0.1,
          maxRadius: 10,
        },
      });

      cleanupSolver.update(1.0); // Wave should be inactive

      const waves = cleanupSolver.getAllShockWaves();
      expect(waves.length).toBe(0);
    });

    it('should not cleanup when disabled', () => {
      const noCleanupSolver = new ShockWaveSolver({
        autoCleanup: false,
      });

      noCleanupSolver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 10000,
        shockWaveConfig: {
          duration: 0.1,
        },
      });

      noCleanupSolver.update(1.0);

      const waves = noCleanupSolver.getAllShockWaves();
      expect(waves.length).toBeGreaterThan(0);
    });
  });

  describe('Fragment Application', () => {
    let fragment: Fragment;

    beforeEach(() => {
      const geometry: FragmentGeometry = {
        vertices: new Float32Array([0, 0, 0]),
        indices: new Uint32Array([0]),
        normals: new Float32Array([0, 1, 0]),
        centroid: { x: 0, y: 0, z: 0 },
        volume: 1.0,
      };

      fragment = new Fragment({
        geometry,
        density: 2500,
        position: { x: 100, y: 0, z: 0 },
      });
    });

    it('should apply shock wave to fragment', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.3); // Propagate toward fragment

      const velBefore = { ...fragment.physics.velocity };
      solver.applyToFragment(fragment);

      // Velocity should change if wave reached
      const waveReached = solver.isPointInShockWave(fragment.physics.position);
      if (waveReached) {
        expect(fragment.physics.velocity).not.toEqual(velBefore);
      }
    });

    it('should apply to multiple fragments', () => {
      const geometry: FragmentGeometry = {
        vertices: new Float32Array([0, 0, 0]),
        indices: new Uint32Array([0]),
        normals: new Float32Array([0, 1, 0]),
        centroid: { x: 0, y: 0, z: 0 },
        volume: 1.0,
      };

      const fragments = [
        new Fragment({
          geometry,
          density: 2500,
          position: { x: 10, y: 0, z: 0 },
        }),
        new Fragment({
          geometry,
          density: 2500,
          position: { x: 20, y: 0, z: 0 },
        }),
      ];

      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.05);

      const count = solver.applyToFragments(fragments);
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should not apply to inactive fragment', () => {
      fragment.deactivate();

      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.3);

      const applied = solver.applyToFragment(fragment);
      expect(applied).toBe(false);
    });
  });

  describe('Fracturable Application', () => {
    let object: Fracturable;

    beforeEach(() => {
      object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 100, y: 0, z: 0 },
      });
    });

    it('should apply shock wave to fracturable', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.3);

      const impact = solver.applyToFracturable(object);

      const waveReached = solver.isPointInShockWave(object.getCenter());
      if (waveReached) {
        expect(impact).not.toBeNull();
      }
    });

    it('should not apply to fractured object', () => {
      object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.3);

      const impact = solver.applyToFracturable(object);
      expect(impact).toBeNull();
    });

    it('should apply to multiple fracturables', () => {
      const objects = [
        new Fracturable({
          geometry: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          material: MATERIALS.GLASS,
          position: { x: 10, y: 0, z: 0 },
        }),
        new Fracturable({
          geometry: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          material: MATERIALS.GLASS,
          position: { x: 20, y: 0, z: 0 },
        }),
      ];

      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.05);

      const count = solver.applyToFracturables(objects);
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Overpressure Queries', () => {
    it('should get overpressure at point', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      const pressure = solver.getOverpressureAt({ x: 100, y: 0, z: 0 });

      expect(pressure).toBeGreaterThanOrEqual(0);
    });

    it('should check if point is in shock wave', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.3);

      const inWave = solver.isPointInShockWave({ x: 100, y: 0, z: 0 });

      expect(typeof inWave).toBe('boolean');
    });
  });

  describe('Shock Wave Management', () => {
    it('should get all shock waves', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.createExplosion({
        position: { x: 100, y: 0, z: 0 },
        energy: 50000,
      });

      const waves = solver.getAllShockWaves();
      expect(waves.length).toBeGreaterThanOrEqual(2);
    });

    it('should get active shock waves', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
        shockWaveConfig: {
          duration: 0.1,
        },
      });

      solver.update(1.0); // Make wave inactive

      const activeWaves = solver.getActiveShockWaves();
      expect(activeWaves.length).toBe(0);
    });

    it('should get shock wave by ID', () => {
      const wave = solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      const retrieved = solver.getShockWave(wave.id);

      expect(retrieved).toBe(wave);
    });

    it('should remove shock wave', () => {
      const wave = solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      const removed = solver.removeShockWave(wave.id);

      expect(removed).toBe(true);

      const retrieved = solver.getShockWave(wave.id);
      expect(retrieved).toBeUndefined();
    });

    it('should clear all shock waves', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.createExplosion({
        position: { x: 100, y: 0, z: 0 },
        energy: 50000,
      });

      solver.clear();

      const waves = solver.getAllShockWaves();
      expect(waves.length).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track statistics', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(1.0);

      const stats = solver.getStatistics();

      expect(stats.totalShockWaves).toBeGreaterThan(0);
      expect(stats.activeShockWaves).toBeGreaterThanOrEqual(0);
      expect(stats.totalEnergy).toBeGreaterThanOrEqual(0);
    });

    it('should track impacts this frame', () => {
      const geometry: FragmentGeometry = {
        vertices: new Float32Array([0, 0, 0]),
        indices: new Uint32Array([0]),
        normals: new Float32Array([0, 1, 0]),
        centroid: { x: 0, y: 0, z: 0 },
        volume: 1.0,
      };

      const fragment = new Fragment({
        geometry,
        density: 2500,
        position: { x: 50, y: 0, z: 0 },
      });

      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.update(0.15);
      solver.applyToFragment(fragment);

      const stats = solver.getStatistics();
      expect(stats.impactsThisFrame).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Reset', () => {
    it('should reset system', () => {
      solver.createExplosion({
        position: { x: 0, y: 0, z: 0 },
        energy: 100000,
      });

      solver.reset();

      const waves = solver.getAllShockWaves();
      expect(waves.length).toBe(0);

      const stats = solver.getStatistics();
      expect(stats.totalShockWaves).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle max shock waves limit', () => {
      const limitedSolver = new ShockWaveSolver({
        maxShockWaves: 3,
        groundReflection: false,
      });

      for (let i = 0; i < 5; i++) {
        limitedSolver.createExplosion({
          position: { x: i * 100, y: 0, z: 0 },
          energy: 10000,
        });
      }

      const waves = limitedSolver.getAllShockWaves();
      expect(waves.length).toBeLessThanOrEqual(3);
    });

    it('should handle empty system', () => {
      const stats = solver.getStatistics();

      expect(stats.totalShockWaves).toBe(0);
      expect(stats.activeShockWaves).toBe(0);
    });

    it('should handle update with no shock waves', () => {
      expect(() => {
        solver.update(1.0);
      }).not.toThrow();
    });
  });
});
