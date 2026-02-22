/**
 * JointTrait — Production Test Suite
 *
 * JointTrait is a pure TypeScript class (not a TraitHandler),
 * so tests instantiate it directly.
 */
import { describe, it, expect, vi } from 'vitest';
import { JointTrait, createJointTrait } from '../JointTrait';

// ─── constructor / defaults ───────────────────────────────────────────────────

describe('JointTrait — constructor defaults', () => {
  it('enableCollision defaults to false', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getConfig().enableCollision).toBe(false);
  });
  it('enablePreprocessing defaults to true', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getConfig().enablePreprocessing).toBe(true);
  });
  it('massScale defaults to 1', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getConfig().massScale).toBe(1);
  });
  it('connectedMassScale defaults to 1', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getConfig().connectedMassScale).toBe(1);
  });
  it('initial state: broken=false', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getState().broken).toBe(false);
  });
  it('initial state: atLimit=false', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getState().atLimit).toBe(false);
  });
});

// ─── Type defaults ─────────────────────────────────────────────────────────────

describe('JointTrait — type-specific defaults', () => {
  it('hinge defaults axis to Y-up', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    expect(j.getConfig().axis).toEqual({ x: 0, y: 1, z: 0 });
  });
  it('hinge with explicit axis keeps it', () => {
    const j = new JointTrait({ jointType: 'hinge', axis: { x: 1, y: 0, z: 0 } });
    expect(j.getConfig().axis).toEqual({ x: 1, y: 0, z: 0 });
  });
  it('slider defaults axis to X', () => {
    const j = new JointTrait({ jointType: 'slider' });
    expect(j.getConfig().axis).toEqual({ x: 1, y: 0, z: 0 });
  });
  it('spring creates default spring config', () => {
    const j = new JointTrait({ jointType: 'spring' });
    expect(j.getConfig().spring).toBeDefined();
    expect(j.getConfig().spring!.stiffness).toBe(100);
    expect(j.getConfig().spring!.damping).toBe(5);
    expect(j.getConfig().spring!.enabled).toBe(true);
  });
  it('ball joint has no default axis', () => {
    const j = new JointTrait({ jointType: 'ball' });
    expect(j.getConfig().axis).toBeUndefined();
  });
  it('fixed joint has no default axis', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.getConfig().axis).toBeUndefined();
  });
});

// ─── getConfig / getState ─────────────────────────────────────────────────────

describe('JointTrait — getConfig and getState', () => {
  it('getConfig returns copy (not reference)', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cfg = j.getConfig();
    cfg.enableCollision = true;
    expect(j.getConfig().enableCollision).toBe(false); // unchanged
  });
  it('getState returns copy (not reference)', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const s = j.getState();
    s.broken = true;
    expect(j.getState().broken).toBe(false); // unchanged
  });
});

// ─── setLimits ─────────────────────────────────────────────────────────────────

describe('JointTrait — setLimits', () => {
  it('sets angular limits by default', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.setLimits({ min: -90, max: 90 });
    expect(j.getConfig().angularLimits).toEqual({ min: -90, max: 90 });
  });
  it('sets linear limits when type=linear', () => {
    const j = new JointTrait({ jointType: 'slider' });
    j.setLimits({ min: 0, max: 1 }, 'linear');
    expect(j.getConfig().linearLimits).toEqual({ min: 0, max: 1 });
  });
});

// ─── setSpring ────────────────────────────────────────────────────────────────

describe('JointTrait — setSpring', () => {
  it('updates spring config', () => {
    const j = new JointTrait({ jointType: 'spring' });
    j.setSpring({ stiffness: 200, damping: 10 });
    expect(j.getConfig().spring!.stiffness).toBe(200);
    expect(j.getConfig().spring!.damping).toBe(10);
  });
});

// ─── setMotor / enableMotor / setMotorVelocity ────────────────────────────────

describe('JointTrait — motor controls', () => {
  it('setMotor assigns motor config', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.setMotor({ targetVelocity: 5, maxForce: 100, enabled: true });
    expect(j.getConfig().motor!.targetVelocity).toBe(5);
  });
  it('enableMotor toggles enabled flag', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.setMotor({ targetVelocity: 5, maxForce: 100, enabled: true });
    j.enableMotor(false);
    expect(j.getConfig().motor!.enabled).toBe(false);
  });
  it('enableMotor no-op when motor not set', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    expect(() => j.enableMotor(true)).not.toThrow();
  });
  it('setMotorVelocity updates targetVelocity', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.setMotor({ targetVelocity: 1, maxForce: 50 });
    j.setMotorVelocity(10);
    expect(j.getConfig().motor!.targetVelocity).toBe(10);
  });
  it('setMotorVelocity no-op when motor not set', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(() => j.setMotorVelocity(99)).not.toThrow();
  });
});

// ─── setBreakForce / setBreakTorque ──────────────────────────────────────────

describe('JointTrait — break force and torque', () => {
  it('setBreakForce sets config', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    j.setBreakForce(1000);
    expect(j.getConfig().breakForce).toBe(1000);
  });
  it('setBreakTorque sets config', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    j.setBreakTorque(500);
    expect(j.getConfig().breakTorque).toBe(500);
  });
});

// ─── isBroken / break / reset ────────────────────────────────────────────────

describe('JointTrait — break and reset', () => {
  it('isBroken() returns false initially', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    expect(j.isBroken()).toBe(false);
  });
  it('break() sets broken=true', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    j.break();
    expect(j.isBroken()).toBe(true);
  });
  it('break() emits break event to listeners', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb = vi.fn();
    j.on('break', cb);
    j.break();
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toMatchObject({ type: 'break' });
  });
  it('break() is idempotent — second call emits no event', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb = vi.fn();
    j.on('break', cb);
    j.break();
    j.break(); // second call should be no-op
    expect(cb).toHaveBeenCalledOnce();
  });
  it('reset() clears broken and atLimit', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    j.break();
    j.reset();
    expect(j.isBroken()).toBe(false);
    expect(j.getState().atLimit).toBe(false);
  });
  it('reset() emits reset event', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb = vi.fn();
    j.on('reset', cb);
    j.reset();
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toMatchObject({ type: 'reset' });
  });
  it('reset() clears angle and position', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.updateState({ angle: 45 });
    j.reset();
    expect(j.getAngle()).toBe(0);
  });
});

// ─── updateState ─────────────────────────────────────────────────────────────

describe('JointTrait — updateState', () => {
  it('merges new state fields', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.updateState({ angle: 30, atLimit: false });
    expect(j.getAngle()).toBe(30);
  });
  it('emits limitReached when atLimit transitions false→true', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    const cb = vi.fn();
    j.on('limitReached', cb);
    j.updateState({ atLimit: true });
    expect(cb).toHaveBeenCalledOnce();
  });
  it('no limitReached when atLimit was already true', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    const cb = vi.fn();
    j.updateState({ atLimit: true }); // first
    j.on('limitReached', cb);
    j.updateState({ atLimit: true }); // still true — no new emit
    expect(cb).not.toHaveBeenCalled();
  });
  it('auto-breaks when appliedForce exceeds breakForce', () => {
    const j = new JointTrait({ jointType: 'fixed', breakForce: 100 });
    j.updateState({ appliedForce: { x: 200, y: 0, z: 0 } });
    expect(j.isBroken()).toBe(true);
  });
  it('no auto-break when force below threshold', () => {
    const j = new JointTrait({ jointType: 'fixed', breakForce: 100 });
    j.updateState({ appliedForce: { x: 50, y: 0, z: 0 } });
    expect(j.isBroken()).toBe(false);
  });
  it('no auto-break when breakForce not set', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    j.updateState({ appliedForce: { x: 99999, y: 0, z: 0 } });
    expect(j.isBroken()).toBe(false);
  });
});

// ─── getAngle / getPosition ───────────────────────────────────────────────────

describe('JointTrait — getAngle and getPosition', () => {
  it('getAngle returns 0 when not set', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    expect(j.getAngle()).toBe(0);
  });
  it('getAngle returns set angle', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    j.updateState({ angle: 90 });
    expect(j.getAngle()).toBe(90);
  });
  it('getPosition returns 0 when not set', () => {
    const j = new JointTrait({ jointType: 'slider' });
    expect(j.getPosition()).toBe(0);
  });
  it('getPosition returns set position', () => {
    const j = new JointTrait({ jointType: 'slider' });
    j.updateState({ position: 0.5 });
    expect(j.getPosition()).toBe(0.5);
  });
});

// ─── on / off listeners ───────────────────────────────────────────────────────

describe('JointTrait — on/off listeners', () => {
  it('on() registers listener, receives events', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb = vi.fn();
    j.on('break', cb);
    j.break();
    expect(cb).toHaveBeenCalledOnce();
  });
  it('off() removes listener', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb = vi.fn();
    j.on('break', cb);
    j.off('break', cb);
    j.break();
    expect(cb).not.toHaveBeenCalled();
  });
  it('off() for non-registered listener is safe', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb = vi.fn();
    expect(() => j.off('break', cb)).not.toThrow();
  });
  it('multiple listeners on same event all called', () => {
    const j = new JointTrait({ jointType: 'fixed' });
    const cb1 = vi.fn(), cb2 = vi.fn();
    j.on('break', cb1);
    j.on('break', cb2);
    j.break();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});

// ─── serialize ────────────────────────────────────────────────────────────────

describe('JointTrait — serialize', () => {
  it('includes type', () => {
    const j = new JointTrait({ jointType: 'hinge' });
    expect(j.serialize().type).toBe('hinge');
  });
  it('includes connectedBody', () => {
    const j = new JointTrait({ jointType: 'fixed', connectedBody: 'frame' });
    expect(j.serialize().connectedBody).toBe('frame');
  });
  it('includes breakForce', () => {
    const j = new JointTrait({ jointType: 'fixed', breakForce: 200 });
    expect(j.serialize().breakForce).toBe(200);
  });
  it('includes enableCollision', () => {
    const j = new JointTrait({ jointType: 'fixed', enableCollision: true });
    expect(j.serialize().enableCollision).toBe(true);
  });
});

// ─── createJointTrait factory ─────────────────────────────────────────────────

describe('createJointTrait', () => {
  it('creates a JointTrait instance', () => {
    expect(createJointTrait()).toBeInstanceOf(JointTrait);
  });
  it('defaults to fixed type', () => {
    expect(createJointTrait().getConfig().jointType).toBe('fixed');
  });
  it('respects provided config overrides', () => {
    const j = createJointTrait({ jointType: 'hinge', connectedBody: 'wall' });
    expect(j.getConfig().jointType).toBe('hinge');
    expect(j.getConfig().connectedBody).toBe('wall');
  });
});
