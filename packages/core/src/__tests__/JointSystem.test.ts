import { describe, it, expect, beforeEach } from 'vitest';
import { JointSystem } from '../physics/JointSystem';

// =============================================================================
// C294 — Joint System
// =============================================================================

describe('JointSystem', () => {
  let js: JointSystem;
  beforeEach(() => {
    js = new JointSystem();
  });

  it('creates a joint between two bodies', () => {
    const j = js.createJoint('hinge', 'bodyA', 'bodyB');
    expect(j.type).toBe('hinge');
    expect(js.getJointCount()).toBe(1);
  });

  it('removes a joint', () => {
    const j = js.createJoint('ball', 'a', 'b');
    expect(js.removeJoint(j.id)).toBe(true);
    expect(js.getJointCount()).toBe(0);
  });

  it('queries joints by body', () => {
    js.createJoint('hinge', 'a', 'b');
    js.createJoint('spring', 'a', 'c');
    expect(js.getJointsForBody('a')).toHaveLength(2);
  });

  it('spring joint computes force', () => {
    const j = js.createJoint('spring', 'a', 'b', {
      stiffness: 10,
      damping: 0.1,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 5, y: 0, z: 0 },
    });
    js.setDistance(j.id, 8); // stretched
    js.solve(0.016);
    const state = js.getState(j.id);
    expect(state?.currentForce).not.toBe(0);
  });

  it('hinge motor advances angle', () => {
    const j = js.createJoint('hinge', 'a', 'b');
    js.setMotor(j.id, 2.0, 10);
    js.solve(0.016);
    expect(js.getState(j.id)?.currentAngle).toBeGreaterThan(0);
  });

  it('hinge limits clamp angle', () => {
    const j = js.createJoint('hinge', 'a', 'b', { limits: { min: -1, max: 1 } });
    js.setAngle(j.id, 5);
    js.setMotor(j.id, 0, 0);
    js.solve(0.016);
    expect(js.getState(j.id)?.currentAngle).toBeLessThanOrEqual(1);
  });

  it('joint breaks when force exceeds breakForce', () => {
    const j = js.createJoint('spring', 'a', 'b', {
      stiffness: 1000,
      breakForce: 5,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 1, y: 0, z: 0 },
    });
    js.setDistance(j.id, 100); // extreme stretch
    js.solve(0.016);
    expect(js.getBrokenJoints()).toHaveLength(1);
  });

  it('disabled joint is not solved', () => {
    const j = js.createJoint('hinge', 'a', 'b');
    js.setEnabled(j.id, false);
    js.setMotor(j.id, 5, 10);
    js.solve(0.016);
    expect(js.getState(j.id)?.currentAngle).toBe(0);
  });

  it('slider joint clamps distance within limits', () => {
    const j = js.createJoint('slider', 'a', 'b', { limits: { min: 0, max: 3 } });
    js.setDistance(j.id, 10);
    js.solve(0.016);
    expect(js.getState(j.id)?.currentDistance).toBeLessThanOrEqual(3);
  });

  it('getJoint returns undefined for unknown id', () => {
    expect(js.getJoint('nope')).toBeUndefined();
  });
});
