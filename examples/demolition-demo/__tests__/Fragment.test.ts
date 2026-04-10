/**
 * Fragment.test.ts
 *
 * Tests for debris fragment physics and behavior.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Fragment, type FragmentConfig, type FragmentGeometry } from '../Fragment';

describe('Fragment', () => {
  let geometry: FragmentGeometry;
  let config: FragmentConfig;

  beforeEach(() => {
    // Create a simple cube fragment
    geometry = {
      vertices: new Float32Array([
        -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
      ]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4]),
      normals: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, -1, 0, 0, 1, 0, 0]),
      centroid: { x: 0, y: 0, z: 0 },
      volume: 8.0,
    };

    config = {
      geometry,
      density: 2500,
      position: { x: 0, y: 10, z: 0 },
    };
  });

  describe('Initialization', () => {
    it('should create fragment with geometry', () => {
      const fragment = new Fragment(config);

      expect(fragment.geometry).toBe(geometry);
      expect(fragment.id).toBeDefined();
    });

    it('should calculate mass from volume and density', () => {
      const fragment = new Fragment(config);

      expect(fragment.physics.mass).toBe(8.0 * 2500);
    });

    it('should initialize with position', () => {
      const fragment = new Fragment(config);

      expect(fragment.physics.position).toEqual({ x: 0, y: 10, z: 0 });
    });

    it('should initialize with zero velocity by default', () => {
      const fragment = new Fragment(config);

      expect(fragment.physics.velocity).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should initialize with custom velocity', () => {
      const fragment = new Fragment({
        ...config,
        velocity: { x: 5, y: 10, z: -3 },
      });

      expect(fragment.physics.velocity).toEqual({ x: 5, y: 10, z: -3 });
    });

    it('should calculate bounding box', () => {
      const fragment = new Fragment(config);

      expect(fragment.boundingBox.min).toBeDefined();
      expect(fragment.boundingBox.max).toBeDefined();
    });

    it('should start active', () => {
      const fragment = new Fragment(config);

      expect(fragment.isActive()).toBe(true);
    });
  });

  describe('Physics Update', () => {
    it('should apply gravity', () => {
      const fragment = new Fragment(config);

      fragment.update(0.1);

      expect(fragment.physics.velocity.y).toBeCloseTo(-0.981, 2);
    });

    it('should update position', () => {
      const fragment = new Fragment({
        ...config,
        velocity: { x: 10, y: 0, z: 0 },
      });

      fragment.update(0.1);

      expect(fragment.physics.position.x).toBeCloseTo(1.0, 1);
    });

    it('should not update if inactive', () => {
      const fragment = new Fragment(config);
      fragment.deactivate();

      const posBefore = { ...fragment.physics.position };
      fragment.update(0.1);

      expect(fragment.physics.position).toEqual(posBefore);
    });

    it('should not update with zero delta time', () => {
      const fragment = new Fragment(config);

      const velBefore = { ...fragment.physics.velocity };
      fragment.update(0);

      expect(fragment.physics.velocity).toEqual(velBefore);
    });

    it('should increment age', () => {
      const fragment = new Fragment(config);

      fragment.update(0.5);
      expect(fragment.getAge()).toBeCloseTo(0.5, 2);

      fragment.update(0.3);
      expect(fragment.getAge()).toBeCloseTo(0.8, 2);
    });
  });

  describe('Impulse Application', () => {
    it('should apply linear impulse', () => {
      const fragment = new Fragment(config);
      const mass = fragment.physics.mass;

      fragment.applyImpulse({ x: 1000, y: 0, z: 0 });

      expect(fragment.physics.velocity.x).toBeCloseTo(1000 / mass, 2);
    });

    it('should apply angular impulse with contact point', () => {
      const fragment = new Fragment(config);

      const angularVelBefore = { ...fragment.physics.angularVelocity };

      fragment.applyImpulse({ x: 100, y: 0, z: 0 }, { x: 1, y: 1, z: 0 });

      expect(fragment.physics.angularVelocity).not.toEqual(angularVelBefore);
    });

    it('should not apply impulse if inactive', () => {
      const fragment = new Fragment(config);
      fragment.deactivate();

      const velBefore = { ...fragment.physics.velocity };
      fragment.applyImpulse({ x: 1000, y: 0, z: 0 });

      expect(fragment.physics.velocity).toEqual(velBefore);
    });
  });

  describe('Force Application', () => {
    it('should apply force over time', () => {
      const fragment = new Fragment(config);
      const mass = fragment.physics.mass;

      fragment.applyForce({ x: 1000, y: 0, z: 0 }, 0.1);

      expect(fragment.physics.velocity.x).toBeCloseTo((1000 * 0.1) / mass, 2);
    });

    it('should not apply force with zero time', () => {
      const fragment = new Fragment(config);

      const velBefore = { ...fragment.physics.velocity };
      fragment.applyForce({ x: 1000, y: 0, z: 0 }, 0);

      expect(fragment.physics.velocity).toEqual(velBefore);
    });
  });

  describe('Ground Collision', () => {
    it('should detect ground collision', () => {
      const fragment = new Fragment({
        ...config,
        position: { x: 0, y: 0.5, z: 0 },
        velocity: { x: 0, y: -10, z: 0 },
      });

      const collided = fragment.handleGroundCollision(0);

      expect(collided).toBe(true);
    });

    it('should reflect velocity with restitution', () => {
      const fragment = new Fragment({
        ...config,
        position: { x: 0, y: 0.5, z: 0 },
        velocity: { x: 0, y: -10, z: 0 },
        restitution: 0.5,
      });

      fragment.handleGroundCollision(0);

      expect(fragment.physics.velocity.y).toBeCloseTo(5, 1);
    });

    it('should apply friction to horizontal velocity', () => {
      const fragment = new Fragment({
        ...config,
        position: { x: 0, y: 0.5, z: 0 },
        velocity: { x: 10, y: -10, z: 5 },
        friction: 0.5,
      });

      fragment.handleGroundCollision(0);

      expect(fragment.physics.velocity.x).toBeLessThan(10);
      expect(fragment.physics.velocity.z).toBeLessThan(5);
    });

    it('should not collide if moving upward', () => {
      const fragment = new Fragment({
        ...config,
        position: { x: 0, y: 0.5, z: 0 },
        velocity: { x: 0, y: 10, z: 0 },
      });

      const collided = fragment.handleGroundCollision(0);

      expect(collided).toBe(false);
    });

    it('should not collide if above ground', () => {
      const fragment = new Fragment(config);

      const collided = fragment.handleGroundCollision(0);

      expect(collided).toBe(false);
    });
  });

  describe('Rest Detection', () => {
    it('should detect fragment at rest', () => {
      const fragment = new Fragment({
        ...config,
        velocity: { x: 0.05, y: 0.05, z: 0.05 },
      });

      expect(fragment.isAtRest()).toBe(true);
    });

    it('should detect moving fragment', () => {
      const fragment = new Fragment({
        ...config,
        velocity: { x: 10, y: 0, z: 0 },
      });

      expect(fragment.isAtRest()).toBe(false);
    });

    it('should consider angular velocity', () => {
      const fragment = new Fragment(config);
      fragment.physics.angularVelocity = { x: 10, y: 0, z: 0 };

      expect(fragment.isAtRest()).toBe(false);
    });
  });

  describe('Activation/Deactivation', () => {
    it('should deactivate fragment', () => {
      const fragment = new Fragment(config);

      fragment.deactivate();

      expect(fragment.isActive()).toBe(false);
    });

    it('should reactivate fragment', () => {
      const fragment = new Fragment(config);

      fragment.deactivate();
      fragment.activate();

      expect(fragment.isActive()).toBe(true);
    });
  });

  describe('Energy Calculation', () => {
    it('should calculate kinetic energy', () => {
      const fragment = new Fragment({
        ...config,
        velocity: { x: 10, y: 0, z: 0 },
      });

      const ke = fragment.getKineticEnergy();

      expect(ke).toBeGreaterThan(0);
    });

    it('should include linear and angular energy', () => {
      const fragment = new Fragment({
        ...config,
        velocity: { x: 10, y: 0, z: 0 },
      });
      fragment.physics.angularVelocity = { x: 5, y: 0, z: 0 };

      const ke = fragment.getKineticEnergy();

      expect(ke).toBeGreaterThan(0);
    });

    it('should have zero energy at rest', () => {
      const fragment = new Fragment(config);

      const ke = fragment.getKineticEnergy();

      expect(ke).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero volume', () => {
      const zeroVolumeGeom = { ...geometry, volume: 0 };

      const fragment = new Fragment({
        ...config,
        geometry: zeroVolumeGeom,
      });

      expect(fragment.physics.mass).toBe(0);
    });

    it('should handle negative delta time', () => {
      const fragment = new Fragment(config);

      const posBefore = { ...fragment.physics.position };
      fragment.update(-0.1);

      expect(fragment.physics.position).toEqual(posBefore);
    });

    it('should handle very small impulse', () => {
      const fragment = new Fragment(config);

      expect(() => {
        fragment.applyImpulse({ x: 0.001, y: 0, z: 0 });
      }).not.toThrow();
    });

    it('should handle very large impulse', () => {
      const fragment = new Fragment(config);

      expect(() => {
        fragment.applyImpulse({ x: 1000000, y: 0, z: 0 });
      }).not.toThrow();
    });
  });
});
