import { describe, it, expect, beforeEach } from 'vitest';
import { JointSystem } from '../JointSystem';

describe('JointSystem', () => {
  let sys: JointSystem;

  beforeEach(() => {
    sys = new JointSystem();
  });

  // ---------- Creation ----------
  it('creates a joint and counts it', () => {
    sys.createJoint('hinge', 'a', 'b');
    expect(sys.getJointCount()).toBe(1);
  });

  it('creates different joint types', () => {
    const hinge = sys.createJoint('hinge', 'a', 'b');
    const spring = sys.createJoint('spring', 'c', 'd');
    expect(hinge.type).toBe('hinge');
    expect(spring.type).toBe('spring');
  });

  it('creates joint with custom config', () => {
    const j = sys.createJoint('slider', 'a', 'b', {
      stiffness: 5, damping: 0.5, breakForce: 100
    });
    expect(j.stiffness).toBe(5);
    expect(j.breakForce).toBe(100);
  });

  // ---------- Removal ----------
  it('removes a joint', () => {
    const j = sys.createJoint('fixed', 'a', 'b');
    expect(sys.removeJoint(j.id)).toBe(true);
    expect(sys.getJointCount()).toBe(0);
  });

  it('removeJoint returns false for nonexistent', () => {
    expect(sys.removeJoint('ghost')).toBe(false);
  });

  // ---------- Body index ----------
  it('getJointsForBody returns connected joints', () => {
    sys.createJoint('ball', 'body1', 'body2');
    sys.createJoint('hinge', 'body1', 'body3');
    const joints = sys.getJointsForBody('body1');
    expect(joints.length).toBe(2);
  });

  // ---------- Enable/Disable ----------
  it('setEnabled disables a joint', () => {
    const j = sys.createJoint('hinge', 'a', 'b');
    sys.setEnabled(j.id, false);
    expect(sys.getJoint(j.id)!.enabled).toBe(false);
  });

  // ---------- Motor ----------
  it('setMotor updates motor speed and force', () => {
    const j = sys.createJoint('hinge', 'a', 'b');
    sys.setMotor(j.id, 5, 10);
    const joint = sys.getJoint(j.id)!;
    expect(joint.motorSpeed).toBe(5);
    expect(joint.motorForce).toBe(10);
  });

  // ---------- Breakable joints ----------
  it('breaks joint when force exceeds breakForce', () => {
    const j = sys.createJoint('spring', 'a', 'b', {
      breakForce: 0.001, stiffness: 100,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 0, y: 0, z: 0 },
    });
    // Set a large distance to generate high force
    sys.setDistance(j.id, 100);
    sys.solve(1 / 60);
    expect(sys.getBrokenJoints().length).toBeGreaterThanOrEqual(1);
  });

  // ---------- State ----------
  it('getState returns joint state', () => {
    const j = sys.createJoint('hinge', 'a', 'b');
    const state = sys.getState(j.id);
    expect(state).toBeDefined();
    expect(state!.currentAngle).toBe(0);
  });

  it('setAngle updates state angle', () => {
    const j = sys.createJoint('hinge', 'a', 'b');
    sys.setAngle(j.id, Math.PI / 4);
    expect(sys.getState(j.id)!.currentAngle).toBeCloseTo(Math.PI / 4);
  });

  it('setDistance updates state distance', () => {
    const j = sys.createJoint('distance', 'a', 'b');
    sys.setDistance(j.id, 5.0);
    expect(sys.getState(j.id)!.currentDistance).toBe(5.0);
  });

  // ---------- Hinge solve ----------
  it('hinge motor advances angle', () => {
    const j = sys.createJoint('hinge', 'a', 'b', { motorSpeed: 1, motorForce: 10 });
    sys.solve(1); // dt = 1
    const state = sys.getState(j.id)!;
    expect(state.currentAngle).toBeCloseTo(1);
  });
});
