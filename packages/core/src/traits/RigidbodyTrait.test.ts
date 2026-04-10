/**
 * RigidbodyTrait Tests
 *
 * Tests for physics simulation with mass, velocity, forces, and colliders.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RigidbodyTrait, createRigidbodyTrait } from './RigidbodyTrait';

describe('RigidbodyTrait', () => {
  let trait: RigidbodyTrait;

  beforeEach(() => {
    trait = createRigidbodyTrait();
  });

  describe('factory function', () => {
    it('should create rigidbody trait with factory', () => {
      expect(trait).toBeInstanceOf(RigidbodyTrait);
    });

    it('should create with custom config', () => {
      const custom = createRigidbodyTrait({
        bodyType: 'kinematic',
        mass: 10,
      });
      expect(custom.getConfig().bodyType).toBe('kinematic');
      expect(custom.getConfig().mass).toBe(10);
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.bodyType).toBeDefined();
    });

    it('should have default body type as dynamic', () => {
      expect(trait.getConfig().bodyType).toBe('dynamic');
    });

    it('should have default mass of 1', () => {
      expect(trait.getConfig().mass).toBe(1);
    });

    it('should respect gravity setting', () => {
      const noGravity = createRigidbodyTrait({ useGravity: false });
      expect(noGravity.getConfig().useGravity).toBe(false);
    });
  });

  describe('body types', () => {
    it('should support dynamic body', () => {
      const dynamic = createRigidbodyTrait({ bodyType: 'dynamic' });
      expect(dynamic.getConfig().bodyType).toBe('dynamic');
    });

    it('should support kinematic body', () => {
      const kinematic = createRigidbodyTrait({ bodyType: 'kinematic' });
      expect(kinematic.getConfig().bodyType).toBe('kinematic');
    });

    it('should support static body', () => {
      const staticBody = createRigidbodyTrait({ bodyType: 'static' });
      expect(staticBody.getConfig().bodyType).toBe('static');
    });
  });

  describe('state management', () => {
    it('should get current state', () => {
      const state = trait.getState();
      expect(state).toBeDefined();
      expect(state.position).toBeDefined();
      expect(state.velocity).toBeDefined();
    });

    it('should track sleeping state', () => {
      const state = trait.getState();
      expect(typeof state.isSleeping).toBe('boolean');
    });

    it('should put to sleep', () => {
      trait.sleep();
      expect(trait.getState().isSleeping).toBe(true);
    });

    it('should wake from sleep', () => {
      trait.sleep();
      trait.wakeUp();
      expect(trait.getState().isSleeping).toBe(false);
    });
  });

  describe('force application', () => {
    it('should add force', () => {
      trait.addForce({ x: 10, y: 0, z: 0 });
      expect(trait.getState().isSleeping).toBe(false);
    });

    it('should add impulse', () => {
      trait.addForce({ x: 0, y: 100, z: 0 }, 'impulse');
      expect(trait.getState().isSleeping).toBe(false);
    });

    it('should add torque', () => {
      trait.addTorque({ x: 0, y: 5, z: 0 });
      expect(trait.getState().isSleeping).toBe(false);
    });

    it('should add force at position', () => {
      trait.addForceAtPosition({ x: 10, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      expect(trait.getState().isSleeping).toBe(false);
    });
  });

  describe('velocity', () => {
    it('should set velocity', () => {
      trait.setVelocity({ x: 5, y: 0, z: 0 });
      expect(trait.getState().velocity.x).toBe(5);
    });

    it('should get velocity', () => {
      trait.setVelocity({ x: 5, y: 0, z: 0 });
      const velocity = trait.getVelocity();
      expect(velocity.x).toBe(5);
    });

    it('should set angular velocity', () => {
      trait.setAngularVelocity({ x: 0, y: 1, z: 0 });
      expect(trait.getState().angularVelocity.y).toBe(1);
    });
  });

  describe('colliders', () => {
    it('should add collider', () => {
      trait.addCollider({
        shape: 'sphere',
        size: { x: 1, y: 1, z: 1 },
      });
      const colliders = trait.getColliders();
      expect(colliders.length).toBe(1);
    });

    it('should support multiple collider shapes', () => {
      trait.addCollider({ shape: 'box', size: { x: 1, y: 1, z: 1 } });
      trait.addCollider({ shape: 'sphere', size: { x: 0.5, y: 0.5, z: 0.5 } });
      trait.addCollider({ shape: 'capsule', size: { x: 0.5, y: 2, z: 0.5 } });
      expect(trait.getColliders().length).toBe(3);
    });
  });

  describe('constraints', () => {
    it('should set constraints', () => {
      trait.setConstraints({
        freezePositionX: true,
        freezeRotationY: true,
      });
      const config = trait.getConfig();
      expect(config.constraints?.freezePositionX).toBe(true);
    });
  });

  describe('mass properties', () => {
    it('should set mass', () => {
      trait.setMass(5);
      expect(trait.getMass()).toBe(5);
    });

    it('should get mass', () => {
      expect(trait.getMass()).toBe(1);
    });
  });

  describe('drag', () => {
    it('should set drag', () => {
      trait.setDrag(0.5);
      expect(trait.getConfig().drag).toBe(0.5);
    });

    it('should set angular drag', () => {
      trait.setAngularDrag(0.3);
      expect(trait.getConfig().angularDrag).toBe(0.3);
    });
  });

  describe('gravity', () => {
    it('should toggle gravity', () => {
      trait.setUseGravity(false);
      expect(trait.getConfig().useGravity).toBe(false);
    });
  });

  describe('kinematic', () => {
    it('should set kinematic mode', () => {
      trait.setKinematic(true);
      expect(trait.isKinematic()).toBe(true);
    });
  });

  describe('collision detection', () => {
    it('should configure collision detection mode', () => {
      const continuous = createRigidbodyTrait({
        collisionDetection: 'continuous',
      });
      expect(continuous.getConfig().collisionDetection).toBe('continuous');
    });
  });
});
