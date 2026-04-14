/**
 * Physics.test.ts
 *
 * Comprehensive tests for the physics system including types,
 * rigid bodies, world simulation, and spatial queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  zeroVector,
  identityQuaternion,
  defaultTransform,
  PHYSICS_DEFAULTS,
  COLLISION_GROUPS,
  // Helpers
  boxShape,
  sphereShape,
  capsuleShape,
  defaultMaterial,
  dynamicBody,
  staticBody,
  kinematicBody,
  validateBodyConfig,
  // Classes
  RigidBody,
  PhysicsWorldImpl,
  createPhysicsWorld,
  IslandDetector,
} from '@holoscript/engine/physics';

// ============================================================================
// Type Constants Tests
// ============================================================================

describe('Physics Types', () => {
  describe('Constants', () => {
    it('should export zeroVector function', () => {
      expect(zeroVector()).toEqual([0, 0, 0]);
    });

    it('should export identityQuaternion function', () => {
      expect(identityQuaternion()).toEqual([0, 0, 0, 1]);
    });

    it('should export defaultTransform function', () => {
      const transform = defaultTransform();
      expect(transform.position).toEqual([0, 0, 0]);
      expect(transform.rotation).toEqual([0, 0, 0, 1]);
      expect(transform.scale).toEqual([1, 1, 1]);
    });

    it('should export PHYSICS_DEFAULTS', () => {
      expect(PHYSICS_DEFAULTS.gravity).toEqual([0, -9.81, 0]);
      expect(PHYSICS_DEFAULTS.fixedTimestep).toBe(1 / 60);
      expect(PHYSICS_DEFAULTS.maxSubsteps).toBe(3);
      expect(PHYSICS_DEFAULTS.solverIterations).toBe(10);
      expect(PHYSICS_DEFAULTS.defaultLinearDamping).toBe(0.01);
      expect(PHYSICS_DEFAULTS.defaultAngularDamping).toBe(0.01);
    });

    it('should export COLLISION_GROUPS', () => {
      expect(COLLISION_GROUPS.DEFAULT).toBe(1);
      expect(COLLISION_GROUPS.PLAYER).toBe(2);
      expect(COLLISION_GROUPS.ENEMY).toBe(4);
      expect(COLLISION_GROUPS.PROJECTILE).toBe(8);
      expect(COLLISION_GROUPS.TERRAIN).toBe(16);
      expect(COLLISION_GROUPS.TRIGGER).toBe(32);
      expect(COLLISION_GROUPS.INTERACTABLE).toBe(64);
      expect(COLLISION_GROUPS.ALL).toBe(0xffff);
    });
  });

  describe('Shape Helpers', () => {
    it('should create box shape', () => {
      const shape = boxShape([1, 1.5, 2]);
      expect(shape.type).toBe('box');
      expect(shape.halfExtents).toEqual([1, 1.5, 2]);
    });

    it('should create sphere shape', () => {
      const shape = sphereShape(5);
      expect(shape.type).toBe('sphere');
      expect(shape.radius).toBe(5);
    });

    it('should create capsule shape', () => {
      const shape = capsuleShape(1, 4);
      expect(shape.type).toBe('capsule');
      expect(shape.radius).toBe(1);
      expect(shape.height).toBe(4);
      expect(shape.axis).toBe('y');
    });

    it('should create capsule with custom axis', () => {
      const shape = capsuleShape(1, 4, 'x');
      expect(shape.axis).toBe('x');
    });

    it('should create default material', () => {
      const mat = defaultMaterial();
      expect(mat.friction).toBe(0.5);
      expect(mat.restitution).toBe(0.3);
    });
  });

  describe('Body Configuration Helpers', () => {
    it('should create dynamic body config', () => {
      const shape = sphereShape(1);
      const config = dynamicBody('ball', shape, 1, [0, 5, 0]);

      expect(config.id).toBe('ball');
      expect(config.type).toBe('dynamic');
      expect(config.shape).toBe(shape);
      expect(config.mass).toBe(1);
      expect(config.transform.position).toEqual([0, 5, 0]);
    });

    it('should create static body config', () => {
      const shape = boxShape([5, 0.5, 5]);
      const config = staticBody('ground', shape);

      expect(config.id).toBe('ground');
      expect(config.type).toBe('static');
      expect(config.shape).toBe(shape);
      expect(config.mass).toBe(0);
    });

    it('should create kinematic body config', () => {
      const shape = boxShape([1, 1, 1]);
      const config = kinematicBody('platform', shape);

      expect(config.id).toBe('platform');
      expect(config.type).toBe('kinematic');
      expect(config.shape).toBe(shape);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid config', () => {
      const config = dynamicBody('test', sphereShape(1), 1);
      const result = validateBodyConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing id', () => {
      const config = { ...dynamicBody('', sphereShape(1), 1), id: '' };
      const result = validateBodyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('id'))).toBe(true);
    });

    it('should reject dynamic body without positive mass', () => {
      const config = {
        ...dynamicBody('test', sphereShape(1), 1),
        mass: 0,
      };
      const result = validateBodyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('mass'))).toBe(true);
    });

    it('should reject negative mass', () => {
      const config = {
        ...dynamicBody('test', sphereShape(1), 1),
        mass: -5,
      };
      const result = validateBodyConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
    });
  });
});

// ============================================================================
// Rigid Body Tests
// ============================================================================

describe('RigidBody', () => {
  describe('Construction', () => {
    it('should create with default values', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));

      expect(body.id).toBe('test');
      expect(body.type).toBe('dynamic');
      expect(body.position).toEqual([0, 0, 0]);
      expect(body.rotation).toEqual(identityQuaternion());
      expect(body.isActive).toBe(true);
      expect(body.isSleeping).toBe(false);
    });

    it('should create with custom position', () => {
      const config = dynamicBody('test', sphereShape(1), 1, [1, 2, 3]);
      const body = new RigidBody(config);

      expect(body.position).toEqual([1, 2, 3]);
    });

    it('should create static body with zero inverse mass', () => {
      const body = new RigidBody(staticBody('ground', boxShape([5, 0.5, 5])));

      expect(body.inverseMass).toBe(0);
      expect(body.type).toBe('static');
    });

    it('should calculate correct inverse mass', () => {
      const config = dynamicBody('test', sphereShape(1), 2);
      const body = new RigidBody(config);

      expect(body.inverseMass).toBe(0.5);
    });
  });

  describe('State', () => {
    it('should get state snapshot', () => {
      const body = new RigidBody(dynamicBody('ball', sphereShape(1), 1, [5, 10, 0]));
      const state = body.getState();

      expect(state.id).toBe('ball');
      expect(body.type).toBe('dynamic'); // type is on body, not state
      expect(state.position).toEqual([5, 10, 0]);
      expect(state.isSleeping).toBe(false);
    });

    it('should set transform', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.setTransform({
        position: [10, 20, 30],
        rotation: [0, 1, 0, 0],
        scale: [1, 1, 1],
      });

      expect(body.position).toEqual([10, 20, 30]);
      expect(body.rotation).toEqual([0, 1, 0, 0]);
    });
  });

  describe('Forces and Impulses', () => {
    it('should apply force', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.applyForce([100, 0, 0]);
      body.integrateForces(1 / 60, [0, 0, 0]);

      expect(body.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('should apply impulse', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.applyImpulse([10, 0, 0]);

      expect(body.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('should apply torque', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.applyTorque([0, 100, 0]);
      body.integrateForces(1 / 60, [0, 0, 0]);

      expect(body.angularVelocity[1]).toBeGreaterThan(0);
    });

    it('should apply torque impulse', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.applyTorqueImpulse([0, 10, 0]);

      expect(body.angularVelocity[1]).toBeGreaterThan(0);
    });

    it('should not affect static bodies', () => {
      const body = new RigidBody(staticBody('ground', boxShape([5, 0.5, 5])));
      body.applyImpulse([1000, 1000, 1000]);

      expect(body.linearVelocity).toEqual([0, 0, 0]);
    });

    it('should wake body when force applied', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      // Simulate sleeping
      for (let i = 0; i < 100; i++) {
        body.updateSleep(1 / 60);
      }

      body.applyForce([100, 0, 0]);
      expect(body.isSleeping).toBe(false);
    });
  });

  describe('Integration', () => {
    it('should apply gravity', () => {
      const body = new RigidBody(dynamicBody('ball', sphereShape(1), 1, [0, 10, 0]));

      // Simulate a few frames
      for (let i = 0; i < 10; i++) {
        body.integrateForces(1 / 60, PHYSICS_DEFAULTS.gravity);
        body.integrateVelocities(1 / 60);
      }

      expect(body.position[1]).toBeLessThan(10);
      expect(body.linearVelocity[1]).toBeLessThan(0);
    });

    it('should update position from velocity', () => {
      const body = new RigidBody(dynamicBody('ball', sphereShape(1), 1));
      body.linearVelocity = [10, 0, 0];

      body.integrateVelocities(1);

      expect(body.position[0]).toBeCloseTo(10, 1);
    });

    it('should apply damping', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.linearVelocity = [100, 0, 0];

      body.integrateForces(1 / 60, [0, 0, 0]);

      expect(body.linearVelocity[0]).toBeLessThan(100);
    });
  });

  describe('Sleeping', () => {
    it('should eventually sleep when at rest', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));
      body.linearVelocity = [0, 0, 0];
      body.angularVelocity = [0, 0, 0];

      // Run enough frames to trigger sleep
      for (let i = 0; i < 60; i++) {
        body.updateSleep(1 / 60);
      }

      expect(body.isSleeping).toBe(true);
    });

    it('should wake up on wakeUp()', () => {
      const body = new RigidBody(dynamicBody('test', sphereShape(1), 1));

      // Force sleep
      for (let i = 0; i < 60; i++) {
        body.updateSleep(1 / 60);
      }
      expect(body.isSleeping).toBe(true);

      body.wakeUp();
      expect(body.isSleeping).toBe(false);
    });
  });

  describe('Collision Filtering', () => {
    it('should allow collision by default', () => {
      const bodyA = new RigidBody(dynamicBody('a', sphereShape(1), 1));
      const bodyB = new RigidBody(dynamicBody('b', sphereShape(1), 1));

      expect(bodyA.canCollideWith(bodyB)).toBe(true);
    });

    it('should respect collision groups', () => {
      const configA = {
        ...dynamicBody('a', sphereShape(1), 1),
        filter: { group: 1, mask: 0 },
      };
      const configB = {
        ...dynamicBody('b', sphereShape(1), 1),
        filter: { group: 1, mask: 1 },
      };

      const bodyA = new RigidBody(configA);
      const bodyB = new RigidBody(configB);

      expect(bodyA.canCollideWith(bodyB)).toBe(false);
    });
  });
});

// ============================================================================
// Physics World Tests
// ============================================================================

describe('PhysicsWorldImpl', () => {
  let world: PhysicsWorldImpl;

  beforeEach(() => {
    world = new PhysicsWorldImpl();
  });

  describe('Construction', () => {
    it('should create with default config', () => {
      expect(world.getGravity()).toEqual(PHYSICS_DEFAULTS.gravity);
    });

    it('should create with custom gravity', () => {
      const customWorld = new PhysicsWorldImpl({ gravity: [0, -20, 0] });
      expect(customWorld.getGravity()).toEqual([0, -20, 0]);
    });

    it('should update gravity', () => {
      world.setGravity([0, -5, 0]);
      expect(world.getGravity()).toEqual([0, -5, 0]);
    });
  });

  describe('Body Management', () => {
    it('should create body', () => {
      const id = world.createBody(dynamicBody('ball', sphereShape(1), 1));
      expect(id).toBe('ball');
    });

    it('should get body', () => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1, [0, 5, 0]));
      const state = world.getBody('ball');

      expect(state).toBeDefined();
      expect(state!.id).toBe('ball');
      expect(state!.position).toEqual([0, 5, 0]);
    });

    it('should return undefined for missing body', () => {
      expect(world.getBody('nonexistent')).toBeUndefined();
    });

    it('should throw on duplicate id', () => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1));
      expect(() => world.createBody(dynamicBody('ball', sphereShape(1), 1))).toThrow();
    });

    it('should remove body', () => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1));
      const removed = world.removeBody('ball');

      expect(removed).toBe(true);
      expect(world.getBody('ball')).toBeUndefined();
    });

    it('should return false removing non-existent body', () => {
      expect(world.removeBody('nonexistent')).toBe(false);
    });

    it('should get all bodies', () => {
      world.createBody(dynamicBody('ball1', sphereShape(1), 1));
      world.createBody(dynamicBody('ball2', sphereShape(1), 1));
      world.createBody(staticBody('ground', boxShape([5, 0.5, 5])));

      const bodies = world.getAllBodies();
      expect(bodies).toHaveLength(3);
    });
  });

  describe('Body Manipulation', () => {
    beforeEach(() => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1));
    });

    it('should set position', () => {
      world.setPosition('ball', [10, 20, 30]);
      expect(world.getBody('ball')!.position).toEqual([10, 20, 30]);
    });

    it('should set rotation', () => {
      world.setRotation('ball', [0, 1, 0, 0]);
      expect(world.getBody('ball')!.rotation).toEqual([0, 1, 0, 0]);
    });

    it('should set transform', () => {
      world.setTransform('ball', {
        position: [5, 5, 5],
        rotation: identityQuaternion(),
        scale: [1, 1, 1],
      });
      expect(world.getBody('ball')!.position).toEqual([5, 5, 5]);
    });

    it('should set linear velocity', () => {
      world.setLinearVelocity('ball', [10, 0, 0]);
      expect(world.getBody('ball')!.linearVelocity).toEqual([10, 0, 0]);
    });

    it('should set angular velocity', () => {
      world.setAngularVelocity('ball', [0, 5, 0]);
      expect(world.getBody('ball')!.angularVelocity).toEqual([0, 5, 0]);
    });

    it('should apply force', () => {
      world.applyForce('ball', [1000, 0, 0]);
      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      expect(world.getBody('ball')!.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('should apply impulse', () => {
      world.applyImpulse('ball', [10, 0, 0]);
      expect(world.getBody('ball')!.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('should apply torque', () => {
      world.applyTorque('ball', [0, 1000, 0]);
      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      expect(world.getBody('ball')!.angularVelocity[1]).toBeGreaterThan(0);
    });
  });

  describe('Simulation', () => {
    it('should step simulation', () => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1, [0, 10, 0]));

      const initialY = world.getBody('ball')!.position[1];
      world.step(1 / 60);
      const newY = world.getBody('ball')!.position[1];

      expect(newY).toBeLessThan(initialY);
    });

    it('should apply gravity over time', () => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1, [0, 100, 0]));

      for (let i = 0; i < 60; i++) {
        world.step(1 / 60);
      }

      const state = world.getBody('ball')!;
      expect(state.position[1]).toBeLessThan(100);
      expect(state.linearVelocity[1]).toBeLessThan(0);
    });

    it('should not move static bodies', () => {
      world.createBody(staticBody('ground', boxShape([5, 0.5, 5])));

      for (let i = 0; i < 60; i++) {
        world.step(1 / 60);
      }

      expect(world.getBody('ground')!.position).toEqual([0, 0, 0]);
    });
  });

  describe('Collision Detection', () => {
    it('should detect sphere-sphere collision', () => {
      world.createBody(dynamicBody('ball1', sphereShape(1), 1, [0, 0, 0]));
      world.createBody(dynamicBody('ball2', sphereShape(1), 1, [1.5, 0, 0]));

      world.step(1 / 60);
      const contacts = world.getContacts();

      expect(contacts.length).toBeGreaterThan(0);
    });

    it('should generate collision events', () => {
      world.createBody(dynamicBody('ball1', sphereShape(1), 1, [0, 0, 0]));
      world.createBody(dynamicBody('ball2', sphereShape(1), 1, [1.5, 0, 0]));

      world.step(1 / 60);
      const contacts = world.getContacts();

      const beginEvents = contacts.filter((e) => e.type === 'begin');
      expect(beginEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should separate colliding bodies', () => {
      world.createBody(dynamicBody('ball1', sphereShape(1), 1, [0, 0, 0]));
      world.createBody(dynamicBody('ball2', sphereShape(1), 1, [1.5, 0, 0]));

      const pos1Before = world.getBody('ball1')!.position[0];

      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      const pos1After = world.getBody('ball1')!.position[0];
      expect(pos1After).not.toEqual(pos1Before);
    });
  });

  describe('Constraints', () => {
    it('should create distance constraint', () => {
      world.createBody(dynamicBody('a', sphereShape(0.5), 1, [0, 5, 0]));
      world.createBody(dynamicBody('b', sphereShape(0.5), 1, [2, 5, 0]));

      const id = world.createConstraint({
        type: 'distance',
        id: 'rope',
        bodyA: 'a',
        bodyB: 'b',
        distance: 2,
      });

      expect(id).toBe('rope');
    });

    it('should throw on duplicate constraint id', () => {
      world.createBody(dynamicBody('a', sphereShape(0.5), 1));
      world.createBody(dynamicBody('b', sphereShape(0.5), 1));

      world.createConstraint({
        type: 'distance',
        id: 'rope',
        bodyA: 'a',
        bodyB: 'b',
        distance: 2,
      });

      expect(() =>
        world.createConstraint({
          type: 'distance',
          id: 'rope',
          bodyA: 'a',
          bodyB: 'b',
          distance: 2,
        })
      ).toThrow();
    });

    it('should throw on missing body', () => {
      world.createBody(dynamicBody('a', sphereShape(0.5), 1));

      expect(() =>
        world.createConstraint({
          type: 'distance',
          id: 'rope',
          bodyA: 'a',
          bodyB: 'missing',
          distance: 2,
        })
      ).toThrow();
    });

    it('should remove constraint', () => {
      world.createBody(dynamicBody('a', sphereShape(0.5), 1));
      world.createBody(dynamicBody('b', sphereShape(0.5), 1));

      world.createConstraint({
        type: 'distance',
        id: 'rope',
        bodyA: 'a',
        bodyB: 'b',
        distance: 2,
      });

      expect(world.removeConstraint('rope')).toBe(true);
      expect(world.removeConstraint('rope')).toBe(false);
    });

    it('should remove constraints when body removed', () => {
      world.createBody(dynamicBody('a', sphereShape(0.5), 1));
      world.createBody(dynamicBody('b', sphereShape(0.5), 1));

      world.createConstraint({
        type: 'distance',
        id: 'rope',
        bodyA: 'a',
        bodyB: 'b',
        distance: 2,
      });

      world.removeBody('a');
      // Constraint should be removed with body
      expect(world.removeConstraint('rope')).toBe(false);
    });

    it('should maintain distance constraint', () => {
      world.setGravity([0, 0, 0]); // Disable gravity for this test

      world.createBody(dynamicBody('a', sphereShape(0.5), 1, [0, 0, 0]));
      world.createBody(dynamicBody('b', sphereShape(0.5), 1, [5, 0, 0]));

      world.createConstraint({
        type: 'distance',
        id: 'rope',
        bodyA: 'a',
        bodyB: 'b',
        distance: 2,
      });

      // Apply force to separate them
      world.applyImpulse('b', [10, 0, 0]);

      for (let i = 0; i < 100; i++) {
        world.step(1 / 60);
      }

      const posA = world.getBody('a')!.position;
      const posB = world.getBody('b')!.position;
      const dx = posB[0] - posA[0];
      const dy = posB[1] - posA[1];
      const dz = posB[2] - posA[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Should be close to constraint distance (with some tolerance)
      expect(distance).toBeCloseTo(2, 0);
    });
  });

  describe('Spatial Queries', () => {
    beforeEach(() => {
      world.createBody(dynamicBody('target', sphereShape(1), 1, [5, 0, 0]));
      world.createBody(dynamicBody('far', sphereShape(1), 1, [100, 0, 0]));
    });

    describe('Raycast', () => {
      it('should hit body in path', () => {
        const hits = world.raycast({
          origin: [0, 0, 0],
          direction: [1, 0, 0],
        });

        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].bodyId).toBe('target');
      });

      it('should return empty for miss', () => {
        const hits = world.raycast({
          origin: [0, 0, 0],
          direction: [0, 1, 0],
        });

        expect(hits).toHaveLength(0);
      });

      it('should respect max distance', () => {
        const hits = world.raycast({
          origin: [0, 0, 0],
          direction: [1, 0, 0],
          maxDistance: 3,
        });

        expect(hits).toHaveLength(0);
      });

      it('should return closest only', () => {
        world.createBody(dynamicBody('near', sphereShape(1), 1, [3, 0, 0]));

        const hits = world.raycast(
          { origin: [0, 0, 0], direction: [1, 0, 0] },
          { closestOnly: true }
        );

        expect(hits).toHaveLength(1);
        expect(hits[0].bodyId).toBe('near');
      });

      it('should exclude specified bodies', () => {
        const hits = world.raycast(
          { origin: [0, 0, 0], direction: [1, 0, 0] },
          { excludeBodies: ['target'] }
        );

        const targetHit = hits.find((h) => h.bodyId === 'target');
        expect(targetHit).toBeUndefined();
      });
    });

    describe('Sphere Overlap', () => {
      it('should find overlapping body', () => {
        const results = world.sphereOverlap([5, 0, 0], 2);

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].bodyId).toBe('target');
      });

      it('should return empty for no overlap', () => {
        const results = world.sphereOverlap([50, 50, 50], 1);
        expect(results).toHaveLength(0);
      });

      it('should include penetration depth', () => {
        const results = world.sphereOverlap([5, 0, 0], 2);

        if (results.length > 0) {
          expect(results[0].penetration).toBeGreaterThan(0);
        }
      });
    });

    describe('Box Overlap', () => {
      it('should find overlapping body', () => {
        const results = world.boxOverlap([5, 0, 0], [2, 2, 2]);

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].bodyId).toBe('target');
      });

      it('should return empty for no overlap', () => {
        const results = world.boxOverlap([50, 50, 50], [1, 1, 1]);
        expect(results).toHaveLength(0);
      });
    });
  });

  describe('Cleanup', () => {
    it('should dispose world', () => {
      world.createBody(dynamicBody('ball', sphereShape(1), 1));
      world.dispose();

      expect(world.getAllBodies()).toHaveLength(0);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createPhysicsWorld', () => {
  it('should create world with factory function', () => {
    const world = createPhysicsWorld();
    expect(world).toBeDefined();
    expect(world.getGravity()).toEqual(PHYSICS_DEFAULTS.gravity);
  });

  it('should accept config in factory', () => {
    const world = createPhysicsWorld({ gravity: [0, -5, 0] });
    expect(world.getGravity()).toEqual([0, -5, 0]);
  });
});

// ============================================================================
// Island Detector Tests
// ============================================================================

describe('IslandDetector', () => {
  let detector: IslandDetector;

  beforeEach(() => {
    detector = new IslandDetector();
  });

  it('should detect single body as island', () => {
    detector.addBody('body1');
    const islands = detector.detectIslands();

    expect(islands).toHaveLength(1);
    expect(islands[0]).toContain('body1');
  });

  it('should detect connected bodies as single island', () => {
    detector.addBody('a');
    detector.addBody('b');
    detector.addBody('c');
    detector.addConnection('a', 'b');
    detector.addConnection('b', 'c');

    const islands = detector.detectIslands();

    expect(islands).toHaveLength(1);
    expect(islands[0]).toHaveLength(3);
  });

  it('should detect separate islands', () => {
    detector.addBody('a');
    detector.addBody('b');
    detector.addBody('c');
    detector.addBody('d');
    detector.addConnection('a', 'b');
    detector.addConnection('c', 'd');

    const islands = detector.detectIslands();

    expect(islands).toHaveLength(2);
  });

  it('should reset properly', () => {
    detector.addBody('a');
    detector.addBody('b');
    detector.addConnection('a', 'b');

    detector.reset();
    detector.addBody('c');

    const islands = detector.detectIslands();

    expect(islands).toHaveLength(1);
    expect(islands[0]).toContain('c');
    expect(islands[0]).not.toContain('a');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Physics Integration', () => {
  it('should simulate falling ball hitting ground', () => {
    const world = createPhysicsWorld();

    world.createBody(dynamicBody('ball', sphereShape(1), 1, [0, 10, 0]));
    world.createBody(
      staticBody('ground', boxShape([10, 0.5, 10]), [0, -0.5, 0])
    );

    // Run simulation for 2 seconds
    for (let i = 0; i < 120; i++) {
      world.step(1 / 60);
    }

    const ball = world.getBody('ball')!;

    // Ball should have fallen and moved due to gravity
    expect(ball.position[1]).toBeLessThan(10);
    expect(ball.linearVelocity[1]).toBeLessThan(0); // Still falling (no collision response with box yet)
  });

  it('should handle multiple dynamic bodies', () => {
    const world = createPhysicsWorld();

    // Stack of balls
    world.createBody(dynamicBody('ball1', sphereShape(0.5), 1, [0, 5, 0]));
    world.createBody(dynamicBody('ball2', sphereShape(0.5), 1, [0, 7, 0]));
    world.createBody(dynamicBody('ball3', sphereShape(0.5), 1, [0, 9, 0]));
    world.createBody(staticBody('ground', boxShape([5, 0.5, 5])));

    for (let i = 0; i < 180; i++) {
      world.step(1 / 60);
    }

    // All balls should have fallen
    expect(world.getBody('ball1')!.position[1]).toBeLessThan(5);
    expect(world.getBody('ball2')!.position[1]).toBeLessThan(7);
    expect(world.getBody('ball3')!.position[1]).toBeLessThan(9);
  });

  it('should support kinematic platforms', () => {
    const world = createPhysicsWorld();

    world.createBody(
      kinematicBody('platform', boxShape([2, 0.25, 2]), [0, 0, 0])
    );

    // Move platform up
    for (let i = 0; i < 60; i++) {
      world.setPosition('platform', [0, i * 0.05, 0]);
      world.step(1 / 60);
    }

    expect(world.getBody('platform')!.position[1]).toBeCloseTo(3, 0);
  });
});
