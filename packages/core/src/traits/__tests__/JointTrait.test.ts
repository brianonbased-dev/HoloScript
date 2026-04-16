import { describe, it, expect, beforeEach } from 'vitest';
import { JointTrait } from '../JointTrait';

describe('JointTrait', () => {
  let joint: JointTrait;

  beforeEach(() => {
    joint = new JointTrait({
      jointType: 'hinge',
      connectedBody: 'Frame',
      anchor: [-0.5, 0, 0 ],
      axis: [0, 1, 0 ],
      angularLimits: { min: 0, max: 120 },
    });
  });

  it('initializes with config', () => {
    const cfg = joint.getConfig();
    expect(cfg.jointType).toBe('hinge');
    expect(cfg.connectedBody).toBe('Frame');
    expect(cfg.anchor?.[0]).toBe(-0.5);
  });

  it('initial state is not broken', () => {
    const state = joint.getState();
    expect(state.broken).toBe(false);
    expect(state.atLimit).toBe(false);
  });

  it('setLimits updates angular limits', () => {
    joint.setLimits({ min: -90, max: 90 });
    const cfg = joint.getConfig();
    expect(cfg.angularLimits?.min).toBe(-90);
    expect(cfg.angularLimits?.max).toBe(90);
  });

  it('setLimits with linear type', () => {
    joint.setLimits({ min: 0, max: 5 }, 'linear');
    expect(joint.getConfig().linearLimits?.max).toBe(5);
  });

  it('setSpring configures spring', () => {
    joint.setSpring({ stiffness: 100, damping: 10 });
    expect(joint.getConfig().spring?.stiffness).toBe(100);
  });

  it('setMotor configures motor', () => {
    joint.setMotor({ targetVelocity: 5, maxForce: 100 });
    const cfg = joint.getConfig();
    expect(cfg.motor?.targetVelocity).toBe(5);
    expect(cfg.motor?.maxForce).toBe(100);
  });

  it('enableMotor toggles motor enabled', () => {
    joint.setMotor({ targetVelocity: 1, maxForce: 50 });
    joint.enableMotor(true);
    expect(joint.getConfig().motor?.enabled).toBe(true);
    joint.enableMotor(false);
    expect(joint.getConfig().motor?.enabled).toBe(false);
  });

  it('setMotorVelocity updates velocity', () => {
    joint.setMotor({ targetVelocity: 0, maxForce: 10 });
    joint.setMotorVelocity(3);
    expect(joint.getConfig().motor?.targetVelocity).toBe(3);
  });

  it('setBreakForce updates break force', () => {
    joint.setBreakForce(500);
    expect(joint.getConfig().breakForce).toBe(500);
  });

  it('on registers listener without error', () => {
    expect(() => joint.on('break', () => {})).not.toThrow();
  });

  it('serialize returns config snapshot', () => {
    const s = joint.serialize();
    expect(s.type).toBe('hinge');
    expect(s.connectedBody).toBe('Frame');
  });
});
