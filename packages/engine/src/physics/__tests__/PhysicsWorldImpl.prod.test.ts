/**
 * PhysicsWorldImpl — production test suite
 *
 * Tests: gravity get/set, body lifecycle (create/remove/get/getAll),
 * duplicate body rejection, body manipulation (setPosition, setRotation,
 * setLinearVelocity, applyForce, applyImpulse, applyTorque),
 * constraint lifecycle (create valid, missing body throws, duplicate throws,
 * removeConstraint, setConstraintEnabled), step() accumulator integration,
 * sphere-sphere collision events (overlapping = begin, separated = none),
 * removeBody cascade-removes associated constraints.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsWorldImpl } from '..';
import type { IRigidBodyConfig } from '@holoscript/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWorld() {
  return new PhysicsWorldImpl({ gravity: [0, -9.81, 0 ] });
}

function sphereBody(
  id: string,
  radius = 0.5,
  pos = [0, 0, 0 ],
  type: 'dynamic' | 'static' = 'dynamic'
): IRigidBodyConfig {
  return {
    id,
    type,
    mass: type === 'static' ? 0 : 1,
    shape: { type: 'sphere', radius },
    transform: {
      position: pos,
      rotation: [0, 0, 0, 1 ],
    },
    material: { friction: 0.5, restitution: 0.3 },
  };
}

function boxBody(
  id: string,
  half = [0.5, 0.5, 0.5 ],
  pos = [0, 0, 0 ]
): IRigidBodyConfig {
  return {
    id,
    type: 'dynamic',
    mass: 1,
    shape: { type: 'box', halfExtents: half },
    transform: {
      position: pos,
      rotation: [0, 0, 0, 1 ],
    },
    material: { friction: 0.5, restitution: 0.3 },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PhysicsWorldImpl: production', () => {
  let world: PhysicsWorldImpl;

  beforeEach(() => {
    world = makeWorld();
  });

  // ─── Gravity ──────────────────────────────────────────────────────────────
  describe('gravity', () => {
    it('getGravity returns default gravity', () => {
      const g = world.getGravity();
      expect(g[1]).toBeCloseTo(-9.81);
    });

    it('setGravity updates gravity', () => {
      world.setGravity([0, -1, 0 ]);
      expect(world.getGravity()[1]).toBeCloseTo(-1);
    });

    it('getGravity returns a copy (immutable)', () => {
      const g = world.getGravity();
      g[1] = 999;
      expect(world.getGravity()[1]).toBeCloseTo(-9.81);
    });

    it('zero gravity constructor', () => {
      const w = new PhysicsWorldImpl({ gravity: [0, 0, 0 ] });
      expect(w.getGravity()[1]).toBe(0);
    });
  });

  // ─── Body Lifecycle ───────────────────────────────────────────────────────
  describe('createBody / removeBody / getBody / getAllBodies', () => {
    it('createBody returns the body id', () => {
      const id = world.createBody(sphereBody('s1'));
      expect(id).toBe('s1');
    });

    it('getBody returns state after creation', () => {
      world.createBody(sphereBody('s1'));
      const state = world.getBody('s1');
      expect(state).toBeDefined();
      expect(state?.id).toBe('s1');
    });

    it('getBody returns undefined for unknown id', () => {
      expect(world.getBody('nope')).toBeUndefined();
    });

    it('getAllBodies returns all created bodies', () => {
      world.createBody(sphereBody('a'));
      world.createBody(sphereBody('b'));
      expect(world.getAllBodies()).toHaveLength(2);
    });

    it('duplicate id throws', () => {
      world.createBody(sphereBody('s1'));
      expect(() => world.createBody(sphereBody('s1'))).toThrow('already exists');
    });

    it('removeBody returns true for existing id', () => {
      world.createBody(sphereBody('s1'));
      expect(world.removeBody('s1')).toBe(true);
    });

    it('removeBody returns false for missing id', () => {
      expect(world.removeBody('nope')).toBe(false);
    });

    it('removeBody removes body from getAllBodies', () => {
      world.createBody(sphereBody('s1'));
      world.removeBody('s1');
      expect(world.getAllBodies()).toHaveLength(0);
    });

    it('getBody returns undefined after removal', () => {
      world.createBody(sphereBody('s1'));
      world.removeBody('s1');
      expect(world.getBody('s1')).toBeUndefined();
    });
  });

  // ─── Body manipulation ────────────────────────────────────────────────────
  describe('body manipulation', () => {
    beforeEach(() => {
      world.createBody(sphereBody('s1', 0.5, [0, 0, 0 ]));
    });

    it('setPosition updates body position', () => {
      world.setPosition('s1', [5, 10, 3 ]);
      const state = world.getBody('s1');
      expect(state?.position[0]).toBeCloseTo(5);
      expect(state?.position[1]).toBeCloseTo(10);
    });

    it('setRotation updates body rotation', () => {
      world.setRotation('s1', [0, 0.707, 0, 0.707 ]);
      const state = world.getBody('s1');
      expect(state?.rotation[3]).toBeCloseTo(0.707, 2);
    });

    it('setLinearVelocity updates velocity', () => {
      world.setLinearVelocity('s1', [1, 2, 3 ]);
      const state = world.getBody('s1');
      expect(state?.linearVelocity[0]).toBeCloseTo(1);
    });

    it('setAngularVelocity updates angular velocity', () => {
      world.setAngularVelocity('s1', [0, 1, 0 ]);
      const state = world.getBody('s1');
      expect(state?.angularVelocity[1]).toBeCloseTo(1);
    });

    it('applyForce does not throw for existing body', () => {
      expect(() => world.applyForce('s1', [0, 100, 0 ])).not.toThrow();
    });

    it('applyForce at point does not throw', () => {
      expect(() =>
        world.applyForce('s1', [0, 100, 0 ], [1, 0, 0 ])
      ).not.toThrow();
    });

    it('applyImpulse does not throw for existing body', () => {
      expect(() => world.applyImpulse('s1', [0, 5, 0 ])).not.toThrow();
    });

    it('applyTorque does not throw for existing body', () => {
      expect(() => world.applyTorque('s1', [0, 1, 0 ])).not.toThrow();
    });

    it('applyTorqueImpulse does not throw for existing body', () => {
      expect(() => world.applyTorqueImpulse('s1', [0, 1, 0 ])).not.toThrow();
    });

    it('setPosition no-ops for unknown id', () => {
      expect(() => world.setPosition('nope', [0, 0, 0 ])).not.toThrow();
    });
  });

  // ─── Constraints ──────────────────────────────────────────────────────────
  describe('constraint management', () => {
    beforeEach(() => {
      world.createBody(sphereBody('a'));
      world.createBody(sphereBody('b'));
    });

    it('createConstraint returns constraint id', () => {
      const id = world.createConstraint({
        id: 'c1',
        type: 'fixed',
        bodyA: 'a',
        bodyB: 'b',
        pivotA: [0, 0, 0 ],
      });
      expect(id).toBe('c1');
    });

    it('createConstraint throws for unknown bodyA', () => {
      expect(() =>
        world.createConstraint({
          id: 'c1',
          type: 'fixed',
          bodyA: 'missing',
          bodyB: 'b',
          pivotA: [0, 0, 0 ],
        })
      ).toThrow();
    });

    it('createConstraint throws for unknown bodyB', () => {
      expect(() =>
        world.createConstraint({
          id: 'c1',
          type: 'fixed',
          bodyA: 'a',
          bodyB: 'missing',
          pivotA: [0, 0, 0 ],
        })
      ).toThrow();
    });

    it('duplicate constraint id throws', () => {
      world.createConstraint({
        id: 'c1',
        type: 'fixed',
        bodyA: 'a',
        bodyB: 'b',
        pivotA: [0, 0, 0 ],
      });
      expect(() =>
        world.createConstraint({
          id: 'c1',
          type: 'fixed',
          bodyA: 'a',
          bodyB: 'b',
          pivotA: [0, 0, 0 ],
        })
      ).toThrow();
    });

    it('removeConstraint returns true for existing id', () => {
      world.createConstraint({
        id: 'c1',
        type: 'fixed',
        bodyA: 'a',
        bodyB: 'b',
        pivotA: [0, 0, 0 ],
      });
      expect(world.removeConstraint('c1')).toBe(true);
    });

    it('removeConstraint returns false for unknown id', () => {
      expect(world.removeConstraint('nope')).toBe(false);
    });

    it('setConstraintEnabled does not throw', () => {
      world.createConstraint({
        id: 'c1',
        type: 'fixed',
        bodyA: 'a',
        bodyB: 'b',
        pivotA: [0, 0, 0 ],
      });
      expect(() => world.setConstraintEnabled('c1', false)).not.toThrow();
    });

    it('removeBody cleans up its associated constraints', () => {
      world.createConstraint({
        id: 'c1',
        type: 'fixed',
        bodyA: 'a',
        bodyB: 'b',
        pivotA: [0, 0, 0 ],
      });
      world.removeBody('a');
      // The constraint tied to 'a' is cascade-removed, so removeConstraint returns false
      expect(world.removeConstraint('c1')).toBe(false);
    });
  });

  // ─── Step / simulation ────────────────────────────────────────────────────
  describe('step and simulation', () => {
    it('step does not throw with no bodies', () => {
      expect(() => world.step(1 / 60)).not.toThrow();
    });

    it('step with dynamic body moves it under gravity', () => {
      world.createBody(sphereBody('s1', 0.5, [0, 10, 0 ]));
      const before = world.getBody('s1')!.position[1];
      world.step(0.5);
      const after = world.getBody('s1')!.position[1];
      expect(after).toBeLessThan(before);
    });

    it('static body does not move under gravity', () => {
      world.createBody(sphereBody('floor', 0.5, [0, 0, 0 ], 'static'));
      world.step(1);
      const state = world.getBody('floor')!;
      expect(state.position[1]).toBeCloseTo(0);
    });

    it('multiple step calls accumulate movement', () => {
      world.createBody(sphereBody('s1', 0.5, [0, 100, 0 ]));
      world.step(0.1);
      const y1 = world.getBody('s1')!.position[1];
      world.step(0.1);
      const y2 = world.getBody('s1')!.position[1];
      expect(y2).toBeLessThan(y1);
    });
  });

  // ─── Sphere-sphere collision ──────────────────────────────────────────────
  describe('sphere-sphere collision detection', () => {
    it('overlapping spheres emit a collision event on step', () => {
      world.createBody(sphereBody('a', 1, [0, 0, 0 ]));
      world.createBody(sphereBody('b', 1, [1, 0, 0 ])); // dist=1 < sum=2
      world.step(1 / 60);
      const contacts = world.getContacts();
      expect(contacts.some((e) => e.type === 'begin' || e.type === 'persist')).toBe(true);
    });

    it('separated spheres emit no begin collision event', () => {
      world.createBody(sphereBody('a', 0.5, [0, 0, 0 ]));
      world.createBody(sphereBody('b', 0.5, [10, 0, 0 ]));
      world.step(1 / 60);
      const contacts = world.getContacts();
      expect(contacts.filter((e) => e.type === 'begin')).toHaveLength(0);
    });

    it('box + sphere collision does not throw', () => {
      world.createBody(sphereBody('s', 0.5, [0, 0, 0 ]));
      world.createBody(boxBody('b', [0.5, 0.5, 0.5 ], [0.3, 0, 0 ]));
      expect(() => world.step(1 / 60)).not.toThrow();
    });
  });

  // ─── Default config ───────────────────────────────────────────────────────
  describe('default config', () => {
    it('world with no config uses default gravity', () => {
      const w = new PhysicsWorldImpl();
      expect(w.getGravity()[1]).toBeCloseTo(-9.81);
    });

    it('multiple bodies can be added and queried independently', () => {
      for (let i = 0; i < 10; i++) {
        world.createBody(sphereBody(`body${i}`, 0.5, [i, 0, 0 ]));
      }
      expect(world.getAllBodies()).toHaveLength(10);
    });

    it('step with many bodies does not throw', () => {
      for (let i = 0; i < 10; i++) {
        world.createBody(sphereBody(`body${i}`, 0.5, [i * 5, 0, 0 ]));
      }
      expect(() => world.step(1 / 60)).not.toThrow();
    });
  });
});
