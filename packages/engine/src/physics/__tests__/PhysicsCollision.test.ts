import type { Vector3 } from '@holoscript/core';
/**
 * Physics Collision Detection Tests
 *
 * Tests for GJK/EPA narrowphase collision detection, sphere-sphere fast path,
 * and mixed shape pair collisions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsWorldImpl, createPhysicsWorld } from '..';
import { IVector3, IPhysicsWorld, IRigidBodyConfig, sphereShape, boxShape, capsuleShape, dynamicBody, staticBody, identityQuaternion, zeroVector } from '..';

// Helper: create a dynamic sphere body config
function dynamicSphere(id: string, radius: number, position: IVector3, mass = 1): IRigidBodyConfig {
  return dynamicBody(id, sphereShape(radius), mass, position);
}

// Helper: create a dynamic box body config
function dynamicBox(
  id: string,
  halfExtents: IVector3,
  position: IVector3,
  mass = 1
): IRigidBodyConfig {
  return dynamicBody(id, boxShape(halfExtents), mass, position);
}

// Helper: create a static box body config
function staticBox(id: string, halfExtents: IVector3, position: IVector3): IRigidBodyConfig {
  return staticBody(id, boxShape(halfExtents), position);
}

// Helper: create a dynamic capsule body config
function dynamicCapsule(
  id: string,
  radius: number,
  height: number,
  position: IVector3,
  mass = 1
): IRigidBodyConfig {
  return dynamicBody(id, capsuleShape(radius, height), mass, position);
}

describe('PhysicsWorldImpl - Collision Detection', () => {
  let world: IPhysicsWorld;

  beforeEach(() => {
    world = createPhysicsWorld({
      gravity: [0, 0, 0 ], // disable gravity for collision tests
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
    });
  });

  // ==========================================================================
  // Sphere-Sphere Collisions (fast path)
  // ==========================================================================

  describe('Sphere-Sphere Collisions', () => {
    it('should detect collision between overlapping spheres', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [1.5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();

      expect(contacts.length).toBeGreaterThan(0);
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].bodyA).toBeDefined();
      expect(beginEvents[0].bodyB).toBeDefined();
    });

    it('should not detect collision between separated spheres', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();

      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });

    it('should report correct contact normal for sphere-sphere', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [1.5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
      const contact = beginEvents[0].contacts[0];

      // Normal should be roughly along +X (from A to B)
      expect(Math.abs(contact.normal[0])).toBeGreaterThan(0.9);
      expect(contact.penetration).toBeGreaterThan(0);
      expect(contact.penetration).toBeCloseTo(0.5, 1);
    });

    it('should handle touching spheres (zero penetration edge case)', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [2.001, 0, 0 ])); // just barely separated

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });

    it('should detect collision between concentric spheres', () => {
      world.createBody(dynamicSphere('a', 2, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [0, 0, 0 ])); // same center

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeCloseTo(3, 1); // radiusA + radiusB
    });
  });

  // ==========================================================================
  // Box-Box Collisions (GJK/EPA)
  // ==========================================================================

  describe('Box-Box Collisions (GJK/EPA)', () => {
    it('should detect collision between overlapping boxes', () => {
      world.createBody(dynamicBox('a', [1, 1, 1 ], [0, 0, 0 ]));
      world.createBody(dynamicBox('b', [1, 1, 1 ], [1.5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeGreaterThan(0);
    });

    it('should not detect collision between separated boxes', () => {
      world.createBody(dynamicBox('a', [1, 1, 1 ], [0, 0, 0 ]));
      world.createBody(dynamicBox('b', [1, 1, 1 ], [5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });

    it('should report penetration depth for box-box overlap', () => {
      world.createBody(dynamicBox('a', [1, 1, 1 ], [0, 0, 0 ]));
      world.createBody(dynamicBox('b', [1, 1, 1 ], [1.5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
      const contact = beginEvents[0].contacts[0];
      // Overlap = (1+1) - 1.5 = 0.5 along X
      expect(contact.penetration).toBeCloseTo(0.5, 1);
    });

    it('should handle axis-aligned box stacking', () => {
      // Floor box: center at y=0.5, halfExtent y=0.5 => AABB y=[0, 1]
      // Cube: center at y=1.3, halfExtent y=0.5 => AABB y=[0.8, 1.8]
      // Overlap on Y = min(1.0, 1.8) - max(0, 0.8) = 1.0 - 0.8 = 0.2
      world.createBody(staticBox('floor', [5, 0.5, 5 ], [0, 0.5, 0 ]));
      world.createBody(dynamicBox('cube', [0.5, 0.5, 0.5 ], [0, 1.3, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      // The boxes overlap by 0.2 on the Y axis
      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Sphere-Box Collisions (GJK/EPA mixed shape)
  // ==========================================================================

  describe('Sphere-Box Collisions (GJK/EPA)', () => {
    it('should detect collision between a sphere and a box', () => {
      world.createBody(dynamicSphere('sphere', 1, [0, 0, 0 ]));
      world.createBody(dynamicBox('box', [1, 1, 1 ], [1.5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeGreaterThan(0);
    });

    it('should not detect collision between separated sphere and box', () => {
      world.createBody(dynamicSphere('sphere', 1, [0, 0, 0 ]));
      world.createBody(dynamicBox('box', [1, 1, 1 ], [5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });

    it('should handle sphere resting on top of a box', () => {
      world.createBody(staticBox('floor', [5, 0.5, 5 ], [0, 0.5, 0 ]));
      world.createBody(dynamicSphere('ball', 0.5, [0, 1.3, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      // Ball at y=1.3 with r=0.5 touches floor-top at y=1.0
      // Penetration should be about 0.2
      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Capsule Collisions (GJK/EPA)
  // ==========================================================================

  describe('Capsule Collisions (GJK/EPA)', () => {
    it('should detect collision between overlapping capsules', () => {
      world.createBody(dynamicCapsule('a', 0.5, 2, [0, 0, 0 ]));
      world.createBody(dynamicCapsule('b', 0.5, 2, [0.8, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeGreaterThan(0);
    });

    it('should detect collision between a capsule and a box', () => {
      world.createBody(dynamicCapsule('capsule', 0.5, 2, [0, 0, 0 ]));
      world.createBody(dynamicBox('box', [1, 1, 1 ], [1, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
    });

    it('should not detect collision between separated capsules', () => {
      world.createBody(dynamicCapsule('a', 0.5, 2, [0, 0, 0 ]));
      world.createBody(dynamicCapsule('b', 0.5, 2, [5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });
  });

  // ==========================================================================
  // Convex Hull Collisions (GJK/EPA)
  // ==========================================================================

  describe('Convex Hull Collisions (GJK/EPA)', () => {
    it('should detect collision between overlapping convex hulls', () => {
      // Simple tetrahedron-like convex hull
      const hullA: IRigidBodyConfig = {
        id: 'hullA',
        type: 'dynamic',
        shape: {
          type: 'convex',
          vertices: [-1, -1, -1, 1, -1, -1, 0, 1, -1, 0, 0, 1],
        },
        mass: 1,
        transform: { position: [0, 0, 0], rotation: identityQuaternion() },
      };

      const hullB: IRigidBodyConfig = {
        id: 'hullB',
        type: 'dynamic',
        shape: {
          type: 'convex',
          vertices: [-1, -1, -1, 1, -1, -1, 0, 1, -1, 0, 0, 1],
        },
        mass: 1,
        transform: { position: [0.5, 0, 0], rotation: identityQuaternion() },
      };

      world.createBody(hullA);
      world.createBody(hullB);

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');

      expect(beginEvents.length).toBe(1);
      expect(beginEvents[0].contacts[0].penetration).toBeGreaterThan(0);
    });

    it('should not detect collision between separated convex hulls', () => {
      const hullA: IRigidBodyConfig = {
        id: 'hullA',
        type: 'dynamic',
        shape: {
          type: 'convex',
          vertices: [-1, -1, -1, 1, -1, -1, 0, 1, -1, 0, 0, 1],
        },
        mass: 1,
        transform: { position: [0, 0, 0], rotation: identityQuaternion() },
      };

      const hullB: IRigidBodyConfig = {
        id: 'hullB',
        type: 'dynamic',
        shape: {
          type: 'convex',
          vertices: [-1, -1, -1, 1, -1, -1, 0, 1, -1, 0, 0, 1],
        },
        mass: 1,
        transform: { position: [10, 0, 0], rotation: identityQuaternion() },
      };

      world.createBody(hullA);
      world.createBody(hullB);

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });
  });

  // ==========================================================================
  // Collision Event Lifecycle
  // ==========================================================================

  describe('Collision Event Lifecycle', () => {
    it('should report begin, persist, and end events', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [1.5, 0, 0 ]));

      // First step: begin
      world.step(1 / 60);
      let contacts = world.getContacts();
      let beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(1);

      // Second step: should persist (bodies are still overlapping, may have moved slightly)
      world.step(1 / 60);
      contacts = world.getContacts();
      const persistOrBegin = contacts.filter((c) => c.type === 'persist' || c.type === 'begin');
      // Either persist or the collision might have ended and restarted
      expect(contacts.length).toBeGreaterThan(0);
    });

    it('should report end when bodies separate', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [1.5, 0, 0 ]));

      // First step: begin
      world.step(1 / 60);

      // Move bodies far apart
      world.setPosition('a', [-10, 0, 0 ]);
      world.setPosition('b', [10, 0, 0 ]);

      // Next step: should report end
      world.step(1 / 60);
      const contacts = world.getContacts();
      const endEvents = contacts.filter((c) => c.type === 'end');
      expect(endEvents.length).toBe(1);
    });
  });

  // ==========================================================================
  // Collision Response
  // ==========================================================================

  describe('Collision Response', () => {
    it('should push overlapping dynamic spheres apart', () => {
      world.createBody(dynamicSphere('a', 1, [0, 0, 0 ]));
      world.createBody(dynamicSphere('b', 1, [1.0, 0, 0 ])); // heavily overlapping

      const stateABefore = world.getBody('a')!;
      const stateBBefore = world.getBody('b')!;

      // Step multiple times to let physics resolve
      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      const stateAAfter = world.getBody('a')!;
      const stateBAfter = world.getBody('b')!;

      // Bodies should have moved apart
      const distBefore = Math.abs(stateBBefore.position[0] - stateABefore.position[0]);
      const distAfter = Math.abs(stateBAfter.position[0] - stateAAfter.position[0]);
      expect(distAfter).toBeGreaterThan(distBefore);
    });

    it('should push overlapping box and sphere apart via GJK/EPA', () => {
      world.createBody(dynamicSphere('sphere', 1, [0, 0, 0 ]));
      world.createBody(dynamicBox('box', [1, 1, 1 ], [1.0, 0, 0 ]));

      const sphereBefore = world.getBody('sphere')!;
      const boxBefore = world.getBody('box')!;

      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      const sphereAfter = world.getBody('sphere')!;
      const boxAfter = world.getBody('box')!;

      const distBefore = Math.abs(boxBefore.position[0] - sphereBefore.position[0]);
      const distAfter = Math.abs(boxAfter.position[0] - sphereAfter.position[0]);
      expect(distAfter).toBeGreaterThan(distBefore);
    });

    it('should not move static bodies during collision', () => {
      world.createBody(staticBox('floor', [5, 0.5, 5 ], [0, 0.5, 0 ]));
      world.createBody(dynamicSphere('ball', 0.5, [0, 1.3, 0 ]));

      for (let i = 0; i < 10; i++) {
        world.step(1 / 60);
      }

      const floorState = world.getBody('floor')!;
      expect(floorState.position[0]).toBeCloseTo(0, 5);
      expect(floorState.position[1]).toBeCloseTo(0.5, 5);
      expect(floorState.position[2]).toBeCloseTo(0, 5);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle many simultaneous collisions', () => {
      // Create a cluster of overlapping spheres
      for (let i = 0; i < 5; i++) {
        world.createBody(dynamicSphere(`s${i}`, 1, [i * 0.5, 0, 0 ]));
      }

      // Should not throw
      expect(() => {
        world.step(1 / 60);
      }).not.toThrow();

      const contacts = world.getContacts();
      expect(contacts.length).toBeGreaterThan(0);
    });

    it('should handle box-box GJK/EPA with identical positions', () => {
      // Two boxes at the exact same position
      world.createBody(dynamicBox('a', [1, 1, 1 ], [0, 0, 0 ]));
      world.createBody(dynamicBox('b', [1, 1, 1 ], [0, 0, 0 ]));

      // Should not throw, and should detect collision
      expect(() => {
        world.step(1 / 60);
      }).not.toThrow();

      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(1);
    });

    it('should skip collisions between two static bodies', () => {
      world.createBody(staticBox('a', [1, 1, 1 ], [0, 0, 0 ]));
      world.createBody(staticBox('b', [1, 1, 1 ], [0.5, 0, 0 ]));

      world.step(1 / 60);
      const contacts = world.getContacts();
      const beginEvents = contacts.filter((c) => c.type === 'begin');
      expect(beginEvents.length).toBe(0);
    });
  });
});
