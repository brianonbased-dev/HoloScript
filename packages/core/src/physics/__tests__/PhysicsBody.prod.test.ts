/**
 * PhysicsBody (RigidBody) Production Tests
 *
 * Pure-CPU rigid body: construction, getters/setters, force/impulse/torque,
 * integration (forces + velocities), sleep, state, transform, collision filter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RigidBody } from '../PhysicsBody';
import { zeroVector, identityQuaternion, COLLISION_GROUPS } from '../PhysicsTypes';

function makeDynamic(overrides: any = {}): RigidBody {
  return new RigidBody({
    id: 'body1',
    type: 'dynamic',
    shape: 'box',
    mass: 1.0,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: identityQuaternion(),
    },
    ...overrides,
  });
}

function makeStatic(): RigidBody {
  return new RigidBody({
    id: 'static1',
    type: 'static',
    shape: 'box',
    transform: {
      position: { x: 0, y: 5, z: 0 },
      rotation: identityQuaternion(),
    },
  });
}

describe('RigidBody — Production', () => {
  let body: RigidBody;

  beforeEach(() => {
    body = makeDynamic();
  });

  describe('construction', () => {
    it('sets id, type, shape', () => {
      expect(body.id).toBe('body1');
      expect(body.type).toBe('dynamic');
      expect(body.shape).toBe('box');
    });

    it('initializes at origin', () => {
      expect(body.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('starts with zero velocity', () => {
      expect(body.linearVelocity).toEqual(zeroVector());
    });

    it('static body has zero mass', () => {
      const s = makeStatic();
      expect(s.mass).toBe(0);
      expect(s.inverseMass).toBe(0);
    });

    it('dynamic body has non-zero mass', () => {
      expect(body.mass).toBe(1.0);
      expect(body.inverseMass).toBe(1.0);
    });
  });

  describe('getters/setters', () => {
    it('position get/set', () => {
      body.position = { x: 1, y: 2, z: 3 };
      expect(body.position).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('linearVelocity get/set', () => {
      body.linearVelocity = { x: 5, y: 0, z: 0 };
      expect(body.linearVelocity.x).toBe(5);
    });

    it('gravityScale get/set', () => {
      body.gravityScale = 0.5;
      expect(body.gravityScale).toBe(0.5);
    });

    it('ccd get/set', () => {
      body.ccd = true;
      expect(body.ccd).toBe(true);
    });

    it('userData get/set', () => {
      body.userData = { tag: 'player' };
      expect(body.userData).toEqual({ tag: 'player' });
    });
  });

  describe('applyForce', () => {
    it('accumulates force', () => {
      body.applyForce({ x: 10, y: 0, z: 0 });
      body.applyForce({ x: 5, y: 0, z: 0 });
      // Force is internal, test via integration
      body.integrateForces(1.0, zeroVector());
      expect(body.linearVelocity.x).toBeGreaterThan(0);
    });

    it('no-ops on static body', () => {
      const s = makeStatic();
      s.applyForce({ x: 1000, y: 0, z: 0 });
      s.integrateForces(1.0, zeroVector());
      expect(s.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('applyImpulse', () => {
    it('instantaneously changes velocity', () => {
      body.applyImpulse({ x: 5, y: 0, z: 0 });
      expect(body.linearVelocity.x).toBe(5); // mass=1, so dv = impulse * inverseMass
    });

    it('no-ops on static body', () => {
      const s = makeStatic();
      s.applyImpulse({ x: 100, y: 0, z: 0 });
      expect(s.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('applyTorque', () => {
    it('accumulates torque', () => {
      body.applyTorque({ x: 0, y: 10, z: 0 });
      body.integrateForces(1.0, zeroVector());
      expect(body.angularVelocity.y).toBeGreaterThan(0);
    });
  });

  describe('clearForces', () => {
    it('clears accumulated forces', () => {
      body.applyForce({ x: 100, y: 0, z: 0 });
      body.clearForces();
      body.integrateForces(1.0, zeroVector());
      expect(body.linearVelocity.x).toBeCloseTo(0, 5);
    });
  });

  describe('integrateForces', () => {
    it('applies gravity', () => {
      body.integrateForces(1.0, { x: 0, y: -9.81, z: 0 });
      expect(body.linearVelocity.y).toBeLessThan(0);
    });

    it('skips sleeping bodies', () => {
      const sleepy = makeDynamic({ sleeping: true });
      sleepy.integrateForces(1.0, { x: 0, y: -9.81, z: 0 });
      expect(sleepy.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('integrateVelocities', () => {
    it('updates position from velocity', () => {
      body.linearVelocity = { x: 10, y: 0, z: 0 };
      body.integrateVelocities(1.0);
      expect(body.position.x).toBeCloseTo(10, 1);
    });
  });

  describe('sleep', () => {
    it('starts awake', () => {
      expect(body.isSleeping).toBe(false);
    });

    it('wakeUp wakes sleeping body', () => {
      const sleepy = makeDynamic({ sleeping: true });
      expect(sleepy.isSleeping).toBe(true);
      sleepy.wakeUp();
      expect(sleepy.isSleeping).toBe(false);
    });
  });

  describe('getState', () => {
    it('returns state snapshot', () => {
      body.position = { x: 1, y: 2, z: 3 };
      const state = body.getState();
      expect(state.position).toEqual({ x: 1, y: 2, z: 3 });
      expect(state.isSleeping).toBe(false);
    });
  });

  describe('getTransform / setTransform', () => {
    it('round-trips transform', () => {
      const t = {
        position: { x: 5, y: 10, z: 15 },
        rotation: identityQuaternion(),
      };
      body.setTransform(t);
      const result = body.getTransform();
      expect(result.position).toEqual({ x: 5, y: 10, z: 15 });
    });
  });

  describe('canCollideWith', () => {
    it('default bodies can collide', () => {
      const b2 = makeDynamic({ id: 'body2' });
      expect(body.canCollideWith(b2)).toBe(true);
    });

    it('filtered bodies cannot collide', () => {
      const b1 = makeDynamic({
        id: 'b1',
        filter: { group: COLLISION_GROUPS.DEFAULT, mask: 0 },
      });
      const b2 = makeDynamic({ id: 'b2' });
      expect(b1.canCollideWith(b2)).toBe(false);
    });
  });
});
