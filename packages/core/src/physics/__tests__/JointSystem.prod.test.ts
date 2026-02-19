/**
 * JointSystem — Production Test Suite
 *
 * Covers: createJoint, removeJoint, solve (hinge/spring/distance/slider),
 * motors, setEnabled, breakForce, queries (getJoint, getState, getBrokenJoints, getJointsForBody).
 */
import { describe, it, expect } from 'vitest';
import { JointSystem } from '../JointSystem';

describe('JointSystem — Production', () => {
  // ─── Creation / Removal ───────────────────────────────────────────
  it('createJoint adds a joint with defaults', () => {
    const js = new JointSystem();
    const j = js.createJoint('hinge', 'bodyA', 'bodyB');
    expect(j.type).toBe('hinge');
    expect(j.bodyA).toBe('bodyA');
    expect(j.enabled).toBe(true);
    expect(j.broken).toBe(false);
    expect(js.getJointCount()).toBe(1);
  });

  it('removeJoint removes by ID', () => {
    const js = new JointSystem();
    const j = js.createJoint('ball', 'a', 'b');
    expect(js.removeJoint(j.id)).toBe(true);
    expect(js.getJointCount()).toBe(0);
  });

  it('removeJoint returns false for missing', () => {
    const js = new JointSystem();
    expect(js.removeJoint('nope')).toBe(false);
  });

  // ─── Solve ────────────────────────────────────────────────────────
  it('solve hinge applies motor and updates angle', () => {
    const js = new JointSystem();
    const j = js.createJoint('hinge', 'a', 'b', { motorSpeed: 2, motorForce: 10 });
    js.solve(1/60);
    const st = js.getState(j.id)!;
    expect(st.currentAngle).toBeGreaterThan(0);
  });

  it('solve hinge clamps to limits', () => {
    const js = new JointSystem();
    const j = js.createJoint('hinge', 'a', 'b', {
      motorSpeed: 0, motorForce: 0,
      limits: { min: -1, max: 1 },
    });
    js.setAngle(j.id, 5);
    js.solve(1/60);
    const st = js.getState(j.id)!;
    // Without motor, angle should be clamped to max limit
    expect(st.currentAngle).toBeLessThanOrEqual(1);
  });

  it('solve spring computes force from stiffness + damping', () => {
    const js = new JointSystem();
    const j = js.createJoint('spring', 'a', 'b', {
      stiffness: 100, damping: 0.5,
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 5, y: 0, z: 0 },
    });
    js.getState(j.id)!.currentDistance = 10; // stretched
    js.solve(1/60);
    expect(js.getState(j.id)!.currentForce).not.toBe(0);
  });

  it('solve slider clamps distance to limits', () => {
    const js = new JointSystem();
    const j = js.createJoint('slider', 'a', 'b', { limits: { min: 0, max: 5 } });
    js.setDistance(j.id, 10);
    js.solve(1/60);
    expect(js.getState(j.id)!.currentDistance).toBeLessThanOrEqual(5);
  });

  it('solve distance updates state', () => {
    const js = new JointSystem();
    const j = js.createJoint('distance', 'a', 'b', {
      anchorA: { x: 0, y: 0, z: 0 },
      anchorB: { x: 3, y: 4, z: 0 },
    });
    js.solve(1/60);
    expect(js.getState(j.id)!.currentDistance).toBeCloseTo(5, 1);
  });

  // ─── Break Force ──────────────────────────────────────────────────
  it('joint breaks when force exceeds breakForce', () => {
    const js = new JointSystem();
    const j = js.createJoint('hinge', 'a', 'b', {
      breakForce: 0.001, stiffness: 100, motorSpeed: 100, motorForce: 10,
    });
    js.setAngle(j.id, 100);
    js.solve(1/60);
    expect(j.broken).toBe(true);
    expect(js.getBrokenJoints().length).toBe(1);
  });

  // ─── Disabled Joint ───────────────────────────────────────────────
  it('disabled joint is skipped during solve', () => {
    const js = new JointSystem();
    const j = js.createJoint('hinge', 'a', 'b', { motorSpeed: 10, motorForce: 5 });
    js.setEnabled(j.id, false);
    js.solve(1/60);
    expect(js.getState(j.id)!.currentAngle).toBe(0);
  });

  // ─── Motor ────────────────────────────────────────────────────────
  it('setMotor updates motor parameters', () => {
    const js = new JointSystem();
    const j = js.createJoint('hinge', 'a', 'b');
    js.setMotor(j.id, 5, 20);
    expect(j.motorSpeed).toBe(5);
    expect(j.motorForce).toBe(20);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getJointsForBody returns all joints for a given body', () => {
    const js = new JointSystem();
    js.createJoint('ball', 'a', 'b');
    js.createJoint('hinge', 'a', 'c');
    expect(js.getJointsForBody('a').length).toBe(2);
    expect(js.getJointsForBody('c').length).toBe(1);
    expect(js.getJointsForBody('z').length).toBe(0);
  });
});
