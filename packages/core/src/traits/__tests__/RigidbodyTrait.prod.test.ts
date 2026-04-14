/**
 * RigidbodyTrait — Production Tests
 *
 * Tests: constructor defaults, all 4 ForceMode variants, addForceAtPosition torque
 * calculation (cross-product), kinematic guard, setVelocity/set/getAngularVelocity,
 * movePosition/moveRotation (kinematic only), sleep/wakeUp lifecycle,
 * collider CRUD, enable/disable, event emit, clearForces, updateState patch, serialize.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RigidbodyTrait, createRigidbodyTrait } from '../RigidbodyTrait';
import type { CollisionEvent } from '../RigidbodyTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function mkRb(opts: Parameters<typeof RigidbodyTrait>[0] = {}) {
  return new RigidbodyTrait(opts);
}

const V = (x: number, y: number, z: number) => ({ x, y, z });

// ─── Constructor / defaults ──────────────────────────────────────────────────────

describe('RigidbodyTrait — constructor', () => {
  it('createRigidbodyTrait factory returns instance', () => {
    expect(createRigidbodyTrait()).toBeInstanceOf(RigidbodyTrait);
  });

  it('bodyType defaults to dynamic', () => expect(mkRb().getConfig().bodyType).toBe('dynamic'));
  it('mass defaults to 1.0', () => expect(mkRb().getMass()).toBe(1.0));
  it('drag defaults to 0', () => expect(mkRb().getConfig().drag).toBe(0));
  it('angularDrag defaults to 0.05', () => expect(mkRb().getConfig().angularDrag).toBe(0.05));
  it('useGravity defaults to true', () => expect(mkRb().getConfig().useGravity).toBe(true));
  it('isKinematic defaults to false', () => expect(mkRb().isKinematic()).toBe(false));
  it('starts awake (not sleeping)', () => expect(mkRb().isSleepingState()).toBe(false));
  it('starts enabled', () => expect(mkRb().isEnabled()).toBe(true));
  it('initial velocity is zero vector', () => {
    const v = mkRb().getVelocity();
    expect(v).toEqual([0, 0, 0 ]);
  });
  it('accepts initial velocity', () => {
    const rb = mkRb({ velocity: V(1, 2, 3) });
    expect(rb.getVelocity()).toEqual(V(1, 2, 3));
  });
});

// ─── Mass / Drag ─────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — mass / drag', () => {
  it('setMass updates mass', () => {
    const rb = mkRb();
    rb.setMass(5);
    expect(rb.getMass()).toBe(5);
  });
  it('setMass clamps to minimum 0.0001', () => {
    const rb = mkRb();
    rb.setMass(-10);
    expect(rb.getMass()).toBe(0.0001);
  });
  it('setDrag clamps to 0', () => {
    const rb = mkRb();
    rb.setDrag(-1);
    expect(rb.getConfig().drag).toBe(0);
  });
  it('setAngularDrag clamps to 0', () => {
    const rb = mkRb();
    rb.setAngularDrag(-5);
    expect(rb.getConfig().angularDrag).toBe(0);
  });
});

// ─── addForce — ForceMode variants ───────────────────────────────────────────────

describe('RigidbodyTrait — addForce: force mode', () => {
  it('force mode accumulates in state.force', () => {
    const rb = mkRb({ mass: 2 });
    rb.addForce(V(10, 0, 0), 'force');
    expect(rb.getState().force[0]).toBe(10);
    expect(rb.getState().velocity[0]).toBe(0); // not immediate
  });

  it('impulse mode changes velocity directly (F/m)', () => {
    const rb = mkRb({ mass: 2 });
    rb.addForce(V(10, 0, 0), 'impulse');
    expect(rb.getVelocity().x).toBe(5); // 10/2
    expect(rb.getState().force[0]).toBe(0);
  });

  it('velocity-change mode adds to velocity regardless of mass', () => {
    const rb = mkRb({ mass: 10 });
    rb.addForce(V(5, 0, 0), 'velocity-change');
    expect(rb.getVelocity().x).toBe(5);
  });

  it('acceleration mode multiplies by mass to get force', () => {
    const rb = mkRb({ mass: 3 });
    rb.addForce(V(4, 0, 0), 'acceleration');
    expect(rb.getState().force[0]).toBe(12); // 4*3
  });

  it('addForce wakes up sleeping body', () => {
    const rb = mkRb();
    rb.sleep();
    rb.addForce(V(1, 0, 0), 'impulse');
    expect(rb.isSleepingState()).toBe(false);
  });

  it('addForce is no-op for kinematic body', () => {
    const rb = mkRb({ isKinematic: true });
    rb.addForce(V(100, 0, 0), 'impulse');
    expect(rb.getVelocity().x).toBe(0);
  });
});

// ─── addTorque ───────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — addTorque', () => {
  it('force mode accumulates in state.torque', () => {
    const rb = mkRb();
    rb.addTorque(V(0, 5, 0), 'force');
    expect(rb.getState().torque.y).toBe(5);
  });

  it('impulse mode changes angularVelocity directly (T/inertia)', () => {
    const rb = mkRb({ inertiaTensor: V(2, 2, 2) });
    rb.addTorque(V(4, 0, 0), 'impulse');
    expect(rb.getAngularVelocity().x).toBe(2); // 4/2
  });

  it('velocity-change mode adds directly', () => {
    const rb = mkRb();
    rb.addTorque(V(0, 3, 0), 'velocity-change');
    expect(rb.getAngularVelocity().y).toBe(3);
  });

  it('no-op for kinematic body', () => {
    const rb = mkRb({ isKinematic: true });
    rb.addTorque(V(1, 1, 1), 'force');
    expect(rb.getState().torque).toEqual(V(0, 0, 0));
  });
});

// ─── addForceAtPosition ──────────────────────────────────────────────────────────

describe('RigidbodyTrait — addForceAtPosition', () => {
  it('applies force to velocity (impulse) AND generates torque', () => {
    const rb = mkRb({ mass: 1, inertiaTensor: V(1, 1, 1) });
    // Force (0,0,1) at (1,0,0) relative to origin → torque = (1,0,0) x (0,0,1) = (0*1-0*0, 0*0-1*1, 1*0-0*0) = (0,-1,0)
    rb.addForceAtPosition(V(0, 0, 1), V(1, 0, 0), 'impulse');
    expect(rb.getVelocity().z).toBeCloseTo(1);
    expect(rb.getAngularVelocity().y).toBeCloseTo(-1);
  });
});

// ─── Velocity ────────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — velocity', () => {
  it('setVelocity sets velocity directly', () => {
    const rb = mkRb();
    rb.setVelocity(V(3, -1, 2));
    expect(rb.getVelocity()).toEqual(V(3, -1, 2));
  });

  it('setVelocity wakes body', () => {
    const rb = mkRb();
    rb.sleep();
    rb.setVelocity(V(1, 0, 0));
    expect(rb.isSleepingState()).toBe(false);
  });

  it('setAngularVelocity sets angular velocity directly', () => {
    const rb = mkRb();
    rb.setAngularVelocity(V(0, Math.PI, 0));
    expect(rb.getAngularVelocity().y).toBeCloseTo(Math.PI);
  });
});

// ─── Kinematic ───────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — kinematic', () => {
  it('movePosition updates state.position only when kinematic', () => {
    const rb = mkRb({ isKinematic: true });
    rb.movePosition(V(5, 10, -3));
    expect(rb.getPosition()).toEqual(V(5, 10, -3));
  });

  it('movePosition is no-op for dynamic bodies', () => {
    const rb = mkRb({ isKinematic: false });
    rb.movePosition(V(99, 0, 0));
    expect(rb.getPosition()).toEqual(V(0, 0, 0));
  });

  it('moveRotation updates rotation only when kinematic', () => {
    const rb = mkRb({ isKinematic: true });
    rb.moveRotation([0, 0.707, 0, 0.707 ]);
    expect(rb.getState().rotation[1]).toBeCloseTo(0.707);
  });

  it('setKinematic(true) makes body kinematic', () => {
    const rb = mkRb();
    rb.setKinematic(true);
    expect(rb.isKinematic()).toBe(true);
  });
});

// ─── Sleep / WakeUp ──────────────────────────────────────────────────────────────

describe('RigidbodyTrait — sleep / wakeUp', () => {
  it('sleep sets isSleeping=true and zeroes velocities', () => {
    const rb = mkRb();
    rb.setVelocity(V(5, 0, 0));
    rb.sleep();
    expect(rb.isSleepingState()).toBe(true);
    expect(rb.getVelocity()).toEqual(V(0, 0, 0));
  });

  it('wakeUp sets isSleeping=false', () => {
    const rb = mkRb();
    rb.sleep();
    rb.wakeUp();
    expect(rb.isSleepingState()).toBe(false);
  });
});

// ─── Colliders ───────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — colliders', () => {
  it('addCollider appends to collider list', () => {
    const rb = mkRb();
    rb.addCollider({ shape: 'box' });
    expect(rb.getColliders()).toHaveLength(1);
    expect(rb.getColliders()[0].shape).toBe('box');
  });

  it('getColliders returns a copy, not the internal array', () => {
    const rb = mkRb();
    rb.addCollider({ shape: 'sphere' });
    const colliders = rb.getColliders();
    colliders.push({ shape: 'capsule' });
    expect(rb.getColliders()).toHaveLength(1); // original unchanged
  });

  it('initialises colliders from config', () => {
    const rb = mkRb({ colliders: [{ shape: 'mesh' }, { shape: 'convex-hull' }] });
    expect(rb.getColliders()).toHaveLength(2);
  });
});

// ─── Enable / Disable ────────────────────────────────────────────────────────────

describe('RigidbodyTrait — enable/disable', () => {
  it('setEnabled(false) disables and sleeps body', () => {
    const rb = mkRb();
    rb.setVelocity(V(10, 0, 0));
    rb.setEnabled(false);
    expect(rb.isEnabled()).toBe(false);
    expect(rb.isSleepingState()).toBe(true);
    expect(rb.getVelocity()).toEqual(V(0, 0, 0));
  });

  it('setEnabled(true) re-enables', () => {
    const rb = mkRb();
    rb.setEnabled(false);
    rb.setEnabled(true);
    expect(rb.isEnabled()).toBe(true);
  });
});

// ─── Constraints ─────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — constraints', () => {
  it('setConstraints merges with existing', () => {
    const rb = mkRb({ constraints: { freezePositionX: true } });
    rb.setConstraints({ freezeRotationY: true });
    const c = rb.getConfig().constraints;
    expect(c?.freezePositionX).toBe(true);
    expect(c?.freezeRotationY).toBe(true);
  });
});

// ─── Physics step helpers ─────────────────────────────────────────────────────────

describe('RigidbodyTrait — clearForces / updateState', () => {
  it('clearForces zeroes force and torque', () => {
    const rb = mkRb();
    rb.addForce(V(5, 5, 5), 'force');
    rb.addTorque(V(1, 1, 1), 'force');
    rb.clearForces();
    expect(rb.getState().force).toEqual(V(0, 0, 0));
    expect(rb.getState().torque).toEqual(V(0, 0, 0));
  });

  it('updateState patches state fields', () => {
    const rb = mkRb();
    rb.updateState({ velocity: V(7, 0, 0), isSleeping: true });
    expect(rb.getVelocity().x).toBe(7);
    expect(rb.isSleepingState()).toBe(true);
  });
});

// ─── Events ──────────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — events', () => {
  it('on/emit fires callback for matching event type', () => {
    const rb = mkRb();
    const cb = vi.fn();
    rb.on('collision-enter', cb);
    const evt: CollisionEvent = {
      type: 'collision-enter',
      other: 'wall',
      timestamp: Date.now(),
    };
    rb.emit(evt);
    expect(cb).toHaveBeenCalledWith(evt);
  });

  it('off removes a listener', () => {
    const rb = mkRb();
    const cb = vi.fn();
    rb.on('trigger-enter', cb);
    rb.off('trigger-enter', cb);
    rb.emit({ type: 'trigger-enter', other: 'zone', timestamp: Date.now() });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not fire for non-matching event type', () => {
    const rb = mkRb();
    const cb = vi.fn();
    rb.on('collision-exit', cb);
    rb.emit({ type: 'collision-enter', other: 'x', timestamp: Date.now() });
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── Serialize ───────────────────────────────────────────────────────────────────

describe('RigidbodyTrait — serialize', () => {
  it('serialize returns expected shape', () => {
    const rb = mkRb({ bodyType: 'kinematic', mass: 5, useGravity: false });
    const out = rb.serialize();
    expect(out.bodyType).toBe('kinematic');
    expect(out.mass).toBe(5);
    expect(out.useGravity).toBe(false);
    expect(out.enabled).toBe(true);
    expect(out.state).toBeDefined();
  });
});
