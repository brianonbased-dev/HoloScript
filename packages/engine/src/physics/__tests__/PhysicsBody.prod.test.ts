/**
 * PhysicsBody (RigidBody) Production Tests
 *
 * Pure-CPU rigid body: construction, getters/setters, force/impulse/torque,
 * integration (forces + velocities), sleep, state, transform, collision filter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RigidBody } from '..';
import { zeroVector, identityQuaternion, COLLISION_GROUPS } from '..';

function makeDynamic(overrides: any = {}): RigidBody {
  return new RigidBody({
    id: 'body1',
    type: 'dynamic',
    shape: 'box',
    mass: 1.0,
    transform: {
      position: [0, 0, 0],
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
      position: [0, 5, 0],
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
      expect(body.position).toEqual([0, 0, 0 ]);
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
      body.position = [1, 2, 3 ];
      expect(body.position).toEqual([1, 2, 3 ]);
    });

    it('linearVelocity get/set', () => {
      body.linearVelocity = [5, 0, 0 ];
      expect(body.linearVelocity[0]).toBe(5);
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
      body.applyForce([10, 0, 0 ]);
      body.applyForce([5, 0, 0 ]);
      // Force is internal, test via integration
      body.integrateForces(1.0, zeroVector());
      expect(body.linearVelocity[0]).toBeGreaterThan(0);
    });

    it('no-ops on static body', () => {
      const s = makeStatic();
      s.applyForce([1000, 0, 0 ]);
      s.integrateForces(1.0, zeroVector());
      expect(s.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('applyImpulse', () => {
    it('instantaneously changes velocity', () => {
      body.applyImpulse([5, 0, 0 ]);
      expect(body.linearVelocity[0]).toBe(5); // mass=1, so dv = impulse * inverseMass
    });

    it('no-ops on static body', () => {
      const s = makeStatic();
      s.applyImpulse([100, 0, 0 ]);
      expect(s.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('applyTorque', () => {
    it('accumulates torque', () => {
      body.applyTorque([0, 10, 0 ]);
      body.integrateForces(1.0, zeroVector());
      expect(body.angularVelocity[1]).toBeGreaterThan(0);
    });
  });

  describe('applyForceAtPoint', () => {
    it('adds both linear force and torque from offset', () => {
      body.position = [0, 0, 0 ];
      body.applyForceAtPoint([0, 10, 0 ], [1, 0, 0 ]);
      expect(body.getForce()[1]).toBe(10);
      expect(Math.abs(body.getTorque()[2])).toBeGreaterThan(0);
    });
  });

  describe('applyImpulseAtPoint / torque impulse', () => {
    it('changes angular velocity from off-center impulse', () => {
      body.position = [0, 0, 0 ];
      body.applyImpulseAtPoint([0, 10, 0 ], [1, 0, 0 ]);
      expect(Math.abs(body.angularVelocity[2])).toBeGreaterThan(0);
    });

    it('applyTorqueImpulse no-ops on static body', () => {
      const s = makeStatic();
      s.applyTorqueImpulse([0, 100, 0 ]);
      expect(s.angularVelocity).toEqual(zeroVector());
    });
  });

  describe('clearForces', () => {
    it('clears accumulated forces', () => {
      body.applyForce([100, 0, 0 ]);
      body.clearForces();
      body.integrateForces(1.0, zeroVector());
      expect(body.linearVelocity[0]).toBeCloseTo(0, 5);
    });
  });

  describe('integrateForces', () => {
    it('applies gravity', () => {
      body.integrateForces(1.0, [0, -9.81, 0 ]);
      expect(body.linearVelocity[1]).toBeLessThan(0);
    });

    it('skips sleeping bodies', () => {
      const sleepy = makeDynamic({ sleeping: true });
      sleepy.integrateForces(1.0, [0, -9.81, 0 ]);
      expect(sleepy.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('integrateVelocities', () => {
    it('updates position from velocity', () => {
      body.linearVelocity = [10, 0, 0 ];
      body.integrateVelocities(1.0);
      expect(body.position[0]).toBeCloseTo(10, 1);
    });

    it('normalizes rotation after angular integration', () => {
      body.angularVelocity = [0, 10, 0 ];
      body.integrateVelocities(0.5);
      const q = body.rotation;
      const len = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
      expect(len).toBeCloseTo(1, 5);
    });

    it('skips static body during velocity integration', () => {
      const s = makeStatic();
      s.integrateVelocities(1.0);
      expect(s.position).toEqual([0, 5, 0 ]);
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

    it('updateSleep eventually sleeps low-velocity dynamic bodies', () => {
      const sleepy = makeDynamic();
      for (let i = 0; i < 300; i++) {
        sleepy.updateSleep(1 / 60);
      }
      expect(sleepy.isSleeping).toBe(true);
      expect(sleepy.linearVelocity).toEqual(zeroVector());
    });
  });

  describe('getState', () => {
    it('returns state snapshot', () => {
      body.position = [1, 2, 3 ];
      const state = body.getState();
      expect(state.position).toEqual([1, 2, 3 ]);
      expect(state.isSleeping).toBe(false);
    });
  });

  describe('getTransform / setTransform', () => {
    it('round-trips transform', () => {
      const t = {
        position: [5, 10, 15],
        rotation: identityQuaternion(),
      };
      body.setTransform(t);
      const result = body.getTransform();
      expect(result.position).toEqual([5, 10, 15 ]);
    });
  });

  describe('material / filter getters and setters', () => {
    it('round-trips material changes', () => {
      body.material = { friction: 0.2, restitution: 0.9 };
      expect(body.material).toEqual({ friction: 0.2, restitution: 0.9 });
    });

    it('round-trips collision filter changes', () => {
      body.filter = { group: COLLISION_GROUPS.DEFAULT, mask: 0 };
      expect(body.filter.mask).toBe(0);
      expect(body.filter.group).toBe(COLLISION_GROUPS.DEFAULT);
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
