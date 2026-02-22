/**
 * ShockWave.test.ts
 *
 * Tests for shock wave propagation.
 *
 * Week 8: Explosive Demolition - Day 2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShockWave, type ShockWaveConfig } from '../ShockWave';

describe('ShockWave', () => {
  let config: ShockWaveConfig;

  beforeEach(() => {
    config = {
      origin: { x: 0, y: 0, z: 0 },
      energy: 100000,
      speed: 343,
      attenuation: 0.9,
      maxRadius: 500,
      duration: 3.0,
    };
  });

  describe('Initialization', () => {
    it('should create shock wave', () => {
      const wave = new ShockWave(config);

      expect(wave.id).toBeDefined();
      expect(wave.origin).toEqual(config.origin);
    });

    it('should use default speed if not provided', () => {
      const wave = new ShockWave({
        origin: { x: 0, y: 0, z: 0 },
        energy: 1000,
      });

      expect(wave.config.speed).toBe(343); // Speed of sound
    });

    it('should start at radius zero', () => {
      const wave = new ShockWave(config);

      expect(wave.getRadius()).toBe(0);
    });

    it('should start active', () => {
      const wave = new ShockWave(config);

      expect(wave.isActive()).toBe(true);
    });

    it('should start at age zero', () => {
      const wave = new ShockWave(config);

      expect(wave.getAge()).toBe(0);
    });
  });

  describe('Propagation', () => {
    it('should propagate outward', () => {
      const wave = new ShockWave(config);

      wave.update(1.0);

      expect(wave.getRadius()).toBeCloseTo(343, 0);
    });

    it('should propagate at configured speed', () => {
      const fastWave = new ShockWave({
        ...config,
        speed: 1000,
      });

      fastWave.update(0.5);

      expect(fastWave.getRadius()).toBeCloseTo(500, 0);
    });

    it('should increase age', () => {
      const wave = new ShockWave(config);

      wave.update(0.5);
      expect(wave.getAge()).toBeCloseTo(0.5, 2);

      wave.update(0.3);
      expect(wave.getAge()).toBeCloseTo(0.8, 2);
    });

    it('should not propagate with zero time', () => {
      const wave = new ShockWave(config);

      wave.update(0);

      expect(wave.getRadius()).toBe(0);
    });

    it('should not propagate if inactive', () => {
      const wave = new ShockWave(config);
      wave.deactivate();

      wave.update(1.0);

      expect(wave.getRadius()).toBe(0);
    });
  });

  describe('Deactivation', () => {
    it('should deactivate when max radius reached', () => {
      const wave = new ShockWave({
        ...config,
        maxRadius: 100,
      });

      wave.update(1.0); // Radius will be 343 > 100

      expect(wave.isActive()).toBe(false);
    });

    it('should deactivate when duration exceeded', () => {
      const wave = new ShockWave({
        ...config,
        duration: 0.5,
      });

      wave.update(1.0);

      expect(wave.isActive()).toBe(false);
    });

    it('should deactivate manually', () => {
      const wave = new ShockWave(config);

      wave.deactivate();

      expect(wave.isActive()).toBe(false);
    });
  });

  describe('Impact Calculation', () => {
    it('should calculate impact at wavefront', () => {
      const wave = new ShockWave(config);
      wave.update(1.0); // Radius = 343

      const point = { x: 343, y: 0, z: 0 };
      const impact = wave.calculateImpact(point);

      expect(impact).not.toBeNull();
      expect(impact?.distance).toBeCloseTo(343, 0);
    });

    it('should not impact points far from wavefront', () => {
      const wave = new ShockWave(config);
      wave.update(1.0); // Radius = 343

      const point = { x: 1000, y: 0, z: 0 };
      const impact = wave.calculateImpact(point);

      expect(impact).toBeNull();
    });

    it('should calculate correct direction', () => {
      const wave = new ShockWave(config);
      wave.update(1.0);

      const point = { x: 343, y: 0, z: 0 };
      const impact = wave.calculateImpact(point);

      expect(impact?.direction.x).toBeCloseTo(1, 1);
      expect(impact?.direction.y).toBeCloseTo(0, 1);
      expect(impact?.direction.z).toBeCloseTo(0, 1);
    });

    it('should have force that decreases with distance', () => {
      const wave = new ShockWave(config);

      wave.update(0.5); // Small radius
      const nearPoint = { x: wave.getRadius(), y: 0, z: 0 };
      const nearImpact = wave.calculateImpact(nearPoint);

      wave.update(2.0); // Large radius
      const farPoint = { x: wave.getRadius(), y: 0, z: 0 };
      const farImpact = wave.calculateImpact(farPoint);

      if (nearImpact && farImpact) {
        expect(nearImpact.forceMagnitude).toBeGreaterThan(farImpact.forceMagnitude);
      }
    });

    it('should return null for inactive wave', () => {
      const wave = new ShockWave(config);
      wave.deactivate();

      const point = { x: 100, y: 0, z: 0 };
      const impact = wave.calculateImpact(point);

      expect(impact).toBeNull();
    });
  });

  describe('Point Queries', () => {
    it('should check if point is affected', () => {
      const wave = new ShockWave(config);
      wave.update(1.0);

      const point = { x: 343, y: 0, z: 0 };
      expect(wave.affectsPoint(point)).toBe(true);
    });

    it('should check if wave has reached point', () => {
      const wave = new ShockWave(config);
      wave.update(1.0); // Radius = 343

      const nearPoint = { x: 100, y: 0, z: 0 };
      const farPoint = { x: 500, y: 0, z: 0 };

      expect(wave.hasReached(nearPoint)).toBe(true);
      expect(wave.hasReached(farPoint)).toBe(false);
    });

    it('should calculate time to reach point', () => {
      const wave = new ShockWave(config);

      const point = { x: 343, y: 0, z: 0 };
      const timeToReach = wave.getTimeToReach(point);

      expect(timeToReach).toBeCloseTo(1.0, 1);
    });

    it('should return zero time for already reached points', () => {
      const wave = new ShockWave(config);
      wave.update(2.0);

      const point = { x: 100, y: 0, z: 0 };
      const timeToReach = wave.getTimeToReach(point);

      expect(timeToReach).toBe(0);
    });
  });

  describe('Energy and Pressure', () => {
    it('should calculate current energy with attenuation', () => {
      const wave = new ShockWave({
        ...config,
        attenuation: 0.5,
      });

      wave.update(1.0);

      const currentEnergy = wave.getCurrentEnergy();
      expect(currentEnergy).toBeLessThan(config.energy);
    });

    it('should calculate wavefront area', () => {
      const wave = new ShockWave(config);
      wave.update(1.0);

      const area = wave.getWavefrontArea();
      const expectedArea = 4 * Math.PI * 343 * 343;

      expect(area).toBeCloseTo(expectedArea, -2);
    });

    it('should calculate peak overpressure', () => {
      const wave = new ShockWave(config);

      const pressure = wave.getPeakOverpressure(100);

      expect(pressure).toBeGreaterThan(0);
    });

    it('should have infinite pressure at origin', () => {
      const wave = new ShockWave(config);

      const pressure = wave.getPeakOverpressure(0);

      expect(pressure).toBe(Infinity);
    });

    it('should have decreasing pressure with distance', () => {
      const wave = new ShockWave(config);

      const pressure1 = wave.getPeakOverpressure(10);
      const pressure2 = wave.getPeakOverpressure(100);

      expect(pressure1).toBeGreaterThan(pressure2);
    });
  });

  describe('Statistics', () => {
    it('should get statistics', () => {
      const wave = new ShockWave(config);
      wave.update(1.0);

      const stats = wave.getStatistics();

      expect(stats.radius).toBeGreaterThan(0);
      expect(stats.age).toBeGreaterThan(0);
      expect(stats.active).toBe(true);
      expect(stats.energy).toBeGreaterThan(0);
      expect(stats.wavefrontArea).toBeGreaterThan(0);
      expect(stats.coverage).toBeGreaterThan(0);
    });

    it('should calculate coverage percentage', () => {
      const wave = new ShockWave({
        ...config,
        maxRadius: 1000,
      });

      wave.update(1.0); // Radius = 343

      const stats = wave.getStatistics();
      expect(stats.coverage).toBeCloseTo(34.3, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero energy', () => {
      const wave = new ShockWave({
        ...config,
        energy: 0,
      });

      expect(() => {
        wave.update(1.0);
      }).not.toThrow();
    });

    it('should handle very high energy', () => {
      const wave = new ShockWave({
        ...config,
        energy: 1000000000,
      });

      expect(() => {
        wave.update(1.0);
      }).not.toThrow();
    });

    it('should handle origin point', () => {
      const wave = new ShockWave(config);
      wave.update(1.0);

      const impact = wave.calculateImpact(wave.origin);

      // Origin is not at wavefront
      expect(impact).toBeNull();
    });

    it('should handle negative delta time', () => {
      const wave = new ShockWave(config);

      wave.update(-1.0);

      expect(wave.getRadius()).toBe(0);
    });
  });
});
