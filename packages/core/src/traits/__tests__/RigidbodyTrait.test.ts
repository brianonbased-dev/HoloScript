import { describe, it, expect, beforeEach } from 'vitest';
import { RigidbodyTrait } from '../RigidbodyTrait';

describe('RigidbodyTrait', () => {
  let rb: RigidbodyTrait;

  beforeEach(() => {
    rb = new RigidbodyTrait({ mass: 2, drag: 0.1, useGravity: true });
  });

  it('initializes with config defaults', () => {
    const cfg = rb.getConfig();
    expect(cfg.mass).toBe(2);
    expect(cfg.drag).toBe(0.1);
    expect(cfg.useGravity).toBe(true);
    expect(cfg.bodyType).toBe('dynamic');
  });

  it('initial state is zeroed', () => {
    const s = rb.getState();
    expect(s.position).toEqual([0, 0, 0 ]);
    expect(s.velocity).toEqual([0, 0, 0 ]);
    expect(s.isSleeping).toBe(false);
  });

  it('setMass clamps to minimum', () => {
    rb.setMass(0);
    expect(rb.getMass()).toBe(0.0001);
    rb.setMass(5);
    expect(rb.getMass()).toBe(5);
  });

  it('setDrag clamps to zero', () => {
    rb.setDrag(-1);
    expect(rb.getConfig().drag).toBe(0);
  });

  it('setKinematic and isKinematic', () => {
    rb.setKinematic(true);
    expect(rb.isKinematic()).toBe(true);
  });

  it('addForce accumulates force', () => {
    rb.addForce([10, 0, 0 ], 'force');
    const s = rb.getState();
    expect(s.force[0]).toBe(10);
  });

  it('addForce impulse changes velocity', () => {
    rb.addForce([4, 0, 0 ], 'impulse');
    // v = F/m = 4/2 = 2
    expect(rb.getState().velocity[0]).toBe(2);
  });

  it('addForce velocity-change ignores mass', () => {
    rb.addForce([3, 0, 0 ], 'velocity-change');
    expect(rb.getState().velocity[0]).toBe(3);
  });

  it('addForce acceleration multiplies by mass', () => {
    rb.addForce([5, 0, 0 ], 'acceleration');
    // force = accel * mass = 5 * 2 = 10
    expect(rb.getState().force[0]).toBe(10);
  });

  it('kinematic body ignores addForce', () => {
    rb.setKinematic(true);
    rb.addForce([100, 0, 0 ]);
    expect(rb.getState().force[0]).toBe(0);
  });

  it('setConstraints merges', () => {
    rb.setConstraints({ freezePositionX: true });
    rb.setConstraints({ freezeRotationY: true });
    const c = rb.getConfig().constraints;
    expect(c?.freezePositionX).toBe(true);
    expect(c?.freezeRotationY).toBe(true);
  });

  it('clearForces zeroes force and torque', () => {
    rb.addForce([10, 5, 0 ]);
    rb.clearForces();
    const s = rb.getState();
    expect(s.force).toEqual([0, 0, 0 ]);
    expect(s.torque).toEqual([0, 0, 0 ]);
  });

  it('serialize returns config snapshot', () => {
    const data = rb.serialize();
    expect(data.mass).toBe(2);
    expect(data.bodyType).toBe('dynamic');
  });
});
