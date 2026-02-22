/**
 * DebrisParticle.test.ts
 *
 * Tests for debris particle.
 *
 * Week 8: Explosive Demolition - Day 3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DebrisParticle, type DebrisParticleConfig } from '../DebrisParticle';

describe('DebrisParticle', () => {
  let config: DebrisParticleConfig;

  beforeEach(() => {
    config = {
      position: { x: 10, y: 20, z: 30 },
      velocity: { x: 1, y: 2, z: 3 },
      size: 0.5,
      mass: 0.1,
    };
  });

  describe('Initialization', () => {
    it('should create particle with config', () => {
      const particle = new DebrisParticle(config);

      expect(particle.position).toEqual({ x: 10, y: 20, z: 30 });
      expect(particle.velocity).toEqual({ x: 1, y: 2, z: 3 });
      expect(particle.size).toBe(0.5);
      expect(particle.mass).toBe(0.1);
    });

    it('should use default values', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
      });

      expect(particle.velocity).toEqual({ x: 0, y: 0, z: 0 });
      expect(particle.size).toBe(0.1);
      expect(particle.mass).toBe(0.01);
    });

    it('should be active initially', () => {
      const particle = new DebrisParticle(config);

      expect(particle.isActive()).toBe(true);
    });

    it('should have zero age initially', () => {
      const particle = new DebrisParticle(config);

      expect(particle.getAge()).toBe(0);
    });

    it('should set color', () => {
      const particle = new DebrisParticle({
        ...config,
        color: { r: 1, g: 0.5, b: 0.2, a: 0.8 },
      });

      expect(particle.color).toEqual({ r: 1, g: 0.5, b: 0.2, a: 0.8 });
    });

    it('should set shape', () => {
      const particle = new DebrisParticle({
        ...config,
        shape: 'sphere',
      });

      expect(particle.shape).toBe('sphere');
    });
  });

  describe('Physics Update', () => {
    it('should update position', () => {
      const particle = new DebrisParticle(config);

      particle.update(1.0, { x: 0, y: 0, z: 0 });

      expect(particle.position.x).toBeCloseTo(11, 1);
      expect(particle.position.y).toBeCloseTo(22, 1);
      expect(particle.position.z).toBeCloseTo(33, 1);
    });

    it('should apply gravity', () => {
      const particle = new DebrisParticle(config);

      particle.update(1.0, { x: 0, y: -9.8, z: 0 });

      expect(particle.velocity.y).toBeCloseTo(2 - 9.8, 1);
    });

    it('should update rotation', () => {
      const particle = new DebrisParticle({
        ...config,
        angularVelocity: { x: 1, y: 2, z: 3 },
      });

      particle.update(1.0, { x: 0, y: 0, z: 0 });

      expect(particle.rotation.x).toBeCloseTo(1, 1);
      expect(particle.rotation.y).toBeCloseTo(2, 1);
      expect(particle.rotation.z).toBeCloseTo(3, 1);
    });

    it('should normalize rotation', () => {
      const particle = new DebrisParticle({
        ...config,
        angularVelocity: { x: 10, y: 10, z: 10 },
      });

      particle.update(1.0, { x: 0, y: 0, z: 0 });

      expect(particle.rotation.x).toBeLessThan(2 * Math.PI);
      expect(particle.rotation.y).toBeLessThan(2 * Math.PI);
      expect(particle.rotation.z).toBeLessThan(2 * Math.PI);
    });

    it('should not update when inactive', () => {
      const particle = new DebrisParticle(config);
      particle.deactivate();

      const posBefore = { ...particle.position };

      particle.update(1.0, { x: 0, y: -9.8, z: 0 });

      expect(particle.position).toEqual(posBefore);
    });

    it('should increment age', () => {
      const particle = new DebrisParticle(config);

      particle.update(0.5, { x: 0, y: 0, z: 0 });

      expect(particle.getAge()).toBeCloseTo(0.5, 2);
    });
  });

  describe('Lifetime', () => {
    it('should deactivate when lifetime expires', () => {
      const particle = new DebrisParticle({
        ...config,
        lifetime: 1.0,
      });

      particle.update(0.5, { x: 0, y: 0, z: 0 });
      expect(particle.isActive()).toBe(true);

      particle.update(0.6, { x: 0, y: 0, z: 0 });
      expect(particle.isActive()).toBe(false);
    });

    it('should not deactivate with infinite lifetime', () => {
      const particle = new DebrisParticle({
        ...config,
        lifetime: 0,
      });

      particle.update(1000, { x: 0, y: 0, z: 0 });

      expect(particle.isActive()).toBe(true);
    });

    it('should get lifetime progress', () => {
      const particle = new DebrisParticle({
        ...config,
        lifetime: 10,
      });

      particle.update(5, { x: 0, y: 0, z: 0 });

      expect(particle.getLifetimeProgress()).toBeCloseTo(0.5, 2);
    });

    it('should clamp lifetime progress to 1', () => {
      const particle = new DebrisParticle({
        ...config,
        lifetime: 10,
      });

      particle.update(15, { x: 0, y: 0, z: 0 });

      expect(particle.getLifetimeProgress()).toBe(1);
    });
  });

  describe('Ground Collision', () => {
    it('should collide with ground', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0.04, z: 0 },
        velocity: { x: 0, y: -5, z: 0 },
        size: 0.1,
      });

      const collided = particle.handleGroundCollision(0);

      expect(collided).toBe(true);
      expect(particle.position.y).toBeGreaterThanOrEqual(0);
    });

    it('should apply restitution', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0.04, z: 0 },
        velocity: { x: 0, y: -5, z: 0 },
        size: 0.1,
        restitution: 0.5,
      });

      particle.handleGroundCollision(0);

      expect(particle.velocity.y).toBeGreaterThan(0);
      expect(particle.velocity.y).toBeLessThan(5);
    });

    it('should apply friction to horizontal velocity', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0.04, z: 0 },
        velocity: { x: 5, y: -5, z: 3 },
        size: 0.1,
        friction: 0.5,
      });

      particle.handleGroundCollision(0);

      expect(particle.velocity.x).toBeLessThan(5);
      expect(particle.velocity.z).toBeLessThan(3);
    });

    it('should not collide when above ground', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 10, z: 0 },
        velocity: { x: 0, y: -5, z: 0 },
        size: 0.1,
      });

      const collided = particle.handleGroundCollision(0);

      expect(collided).toBe(false);
    });
  });

  describe('Forces and Impulses', () => {
    it('should apply impulse', () => {
      const particle = new DebrisParticle(config);

      particle.applyImpulse({ x: 1, y: 2, z: 3 });

      expect(particle.velocity.x).toBeGreaterThan(1);
      expect(particle.velocity.y).toBeGreaterThan(2);
    });

    it('should scale impulse by mass', () => {
      const heavyParticle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        mass: 10,
      });

      const lightParticle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        mass: 0.1,
      });

      heavyParticle.applyImpulse({ x: 10, y: 0, z: 0 });
      lightParticle.applyImpulse({ x: 10, y: 0, z: 0 });

      expect(lightParticle.velocity.x).toBeGreaterThan(heavyParticle.velocity.x);
    });

    it('should apply force over time', () => {
      const particle = new DebrisParticle(config);

      particle.applyForce({ x: 10, y: 0, z: 0 }, 1.0);

      expect(particle.velocity.x).toBeGreaterThan(1);
    });

    it('should not apply force when inactive', () => {
      const particle = new DebrisParticle(config);
      particle.deactivate();

      const velBefore = { ...particle.velocity };

      particle.applyImpulse({ x: 100, y: 100, z: 100 });

      expect(particle.velocity).toEqual(velBefore);
    });
  });

  describe('Rest Detection', () => {
    it('should detect particle at rest', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0.05, y: 0.05, z: 0.05 },
        angularVelocity: { x: 0.05, y: 0.05, z: 0.05 },
      });

      expect(particle.isAtRest(0.1)).toBe(true);
    });

    it('should detect moving particle', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 5, y: 0, z: 0 },
      });

      expect(particle.isAtRest(0.1)).toBe(false);
    });

    it('should consider angular velocity', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 5, y: 0, z: 0 },
      });

      expect(particle.isAtRest(0.1)).toBe(false);
    });
  });

  describe('Distance Calculation', () => {
    it('should calculate distance from point', () => {
      const particle = new DebrisParticle({
        position: { x: 3, y: 4, z: 0 },
      });

      const distance = particle.distanceFrom({ x: 0, y: 0, z: 0 });

      expect(distance).toBeCloseTo(5, 1);
    });

    it('should handle zero distance', () => {
      const particle = new DebrisParticle({
        position: { x: 5, y: 10, z: 15 },
      });

      const distance = particle.distanceFrom({ x: 5, y: 10, z: 15 });

      expect(distance).toBeCloseTo(0, 1);
    });
  });

  describe('Energy Calculation', () => {
    it('should calculate kinetic energy', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 10, y: 0, z: 0 },
        mass: 1.0,
      });

      const energy = particle.getKineticEnergy();

      expect(energy).toBeGreaterThan(0);
    });

    it('should include angular energy', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 10, y: 0, z: 0 },
        mass: 1.0,
        size: 1.0,
      });

      const energy = particle.getKineticEnergy();

      expect(energy).toBeGreaterThan(0);
    });

    it('should return zero for stationary particle', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
      });

      const energy = particle.getKineticEnergy();

      expect(energy).toBe(0);
    });
  });

  describe('Activation/Deactivation', () => {
    it('should deactivate particle', () => {
      const particle = new DebrisParticle(config);

      particle.deactivate();

      expect(particle.isActive()).toBe(false);
    });

    it('should activate particle', () => {
      const particle = new DebrisParticle(config);
      particle.deactivate();

      particle.activate();

      expect(particle.isActive()).toBe(true);
      expect(particle.getAge()).toBe(0);
    });
  });

  describe('Reset', () => {
    it('should reset particle with new config', () => {
      const particle = new DebrisParticle(config);

      particle.update(5.0, { x: 0, y: -9.8, z: 0 });

      particle.reset({
        position: { x: 100, y: 200, z: 300 },
        velocity: { x: 5, y: 10, z: 15 },
      });

      expect(particle.position).toEqual({ x: 100, y: 200, z: 300 });
      expect(particle.velocity).toEqual({ x: 5, y: 10, z: 15 });
      expect(particle.getAge()).toBe(0);
      expect(particle.isActive()).toBe(true);
    });
  });

  describe('Spatial Hash Cell', () => {
    it('should set spatial hash cell', () => {
      const particle = new DebrisParticle(config);

      particle.setSpatialHashCell('10,20,30');

      expect(particle.getSpatialHashCell()).toBe('10,20,30');
    });

    it('should clear spatial hash cell', () => {
      const particle = new DebrisParticle(config);
      particle.setSpatialHashCell('10,20,30');

      particle.setSpatialHashCell(null);

      expect(particle.getSpatialHashCell()).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero time update', () => {
      const particle = new DebrisParticle(config);
      const posBefore = { ...particle.position };

      particle.update(0, { x: 0, y: -9.8, z: 0 });

      expect(particle.position).toEqual(posBefore);
    });

    it('should handle very small particles', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        size: 0.001,
        mass: 0.0001,
      });

      expect(particle.size).toBe(0.001);
      expect(particle.mass).toBe(0.0001);
    });

    it('should handle very large particles', () => {
      const particle = new DebrisParticle({
        position: { x: 0, y: 0, z: 0 },
        size: 100,
        mass: 10000,
      });

      expect(particle.size).toBe(100);
      expect(particle.mass).toBe(10000);
    });
  });
});
