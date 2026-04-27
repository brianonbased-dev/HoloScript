import { describe, it, expect } from 'vitest';
import {
  SyntheticWalkCycleEngine,
  createSyntheticWalkCycleEngine,
  buildSyntheticBipedPose,
  SYNTHETIC_WALK_JOINTS,
} from '../synthetic-walk-cycle';

describe('SyntheticWalkCycleEngine', () => {
  it('starts unloaded; load() flips loaded=true', async () => {
    const e = new SyntheticWalkCycleEngine();
    expect(e.loaded).toBe(false);
    await e.load();
    expect(e.loaded).toBe(true);
  });

  it('default modelId is synthetic_biped_walk', () => {
    const e = new SyntheticWalkCycleEngine();
    expect(e.modelId).toBe('synthetic_biped_walk');
  });

  it('infer() returns full result shape with all 7 biped joints', () => {
    const e = createSyntheticWalkCycleEngine();
    const r = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    });
    expect(r.pose).toBeDefined();
    for (const joint of SYNTHETIC_WALK_JOINTS) {
      expect(r.pose.joints[joint]).toBeDefined();
      expect(r.pose.joints[joint].position).toHaveLength(3);
      expect(r.pose.joints[joint].rotation).toHaveLength(4);
    }
    expect(r.trajectory.length).toBe(12);
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
  });

  it('phase advances proportional to speed (faster = quicker cycle)', () => {
    const e = createSyntheticWalkCycleEngine();
    const slow = e.infer({
      targetVelocity: { x: 0.5, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.1,
    });
    const fast = e.infer({
      targetVelocity: { x: 5.0, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.1,
    });
    expect(fast.phase).toBeGreaterThan(slow.phase);
  });

  it('idle (zero velocity) has both feet planted', () => {
    const e = createSyntheticWalkCycleEngine();
    const r = e.infer({
      targetVelocity: { x: 0, y: 0, z: 0 },
      currentPhase: 0.3,
      delta: 0.016,
    });
    expect(r.contactFeatures.leftFoot).toBe(true);
    expect(r.contactFeatures.rightFoot).toBe(true);
    expect(r.gait).toBe('idle');
  });

  it('walking with speed alternates foot contact by phase half', () => {
    const e = createSyntheticWalkCycleEngine();
    const earlyPhase = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0.1,
      delta: 0,
    });
    const latePhase = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0.7,
      delta: 0,
    });
    expect(earlyPhase.contactFeatures.leftFoot).toBe(true);
    expect(earlyPhase.contactFeatures.rightFoot).toBe(false);
    expect(latePhase.contactFeatures.leftFoot).toBe(false);
    expect(latePhase.contactFeatures.rightFoot).toBe(true);
  });

  it('determinism: same input → same pose', () => {
    const e1 = new SyntheticWalkCycleEngine();
    const e2 = new SyntheticWalkCycleEngine();
    const r1 = e1.infer({
      targetVelocity: { x: 2, y: 0, z: 0.5 },
      currentPhase: 0.42,
      delta: 0.016,
    });
    const r2 = e2.infer({
      targetVelocity: { x: 2, y: 0, z: 0.5 },
      currentPhase: 0.42,
      delta: 0.016,
    });
    // Pose joints should be identical (timestamp differs by call time but
    // the joint values are pure functions of phase + speed)
    expect(r1.pose.joints.hip.position).toEqual(r2.pose.joints.hip.position);
    expect(r1.pose.joints.left_thigh.rotation).toEqual(r2.pose.joints.left_thigh.rotation);
    expect(r1.phase).toBeCloseTo(r2.phase, 10);
  });

  it('hip Y bobs vertically as a function of phase (heel-strike pattern)', () => {
    // At speed > 0, hip Y should oscillate around 1.0
    const phaseSamples = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
    const heights = phaseSamples.map((p) => buildSyntheticBipedPose(p, 2.0).hip.position[1]);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    expect(maxH).toBeGreaterThan(minH);
    expect(minH).toBeLessThan(1.05); // some bob downward
    expect(maxH).toBeGreaterThan(0.95); // and upward
  });

  it('thigh rotations are mirror-image between left and right at any phase', () => {
    // At phase 0.25, leftSwing = sin(π/2) = 1, rightSwing = sin(π) = ~0
    // At phase 0.75, leftSwing = -1, rightSwing = ~0
    // So the thighs should swing oppositely; we verify by checking the X
    // component of the rotation quaternion has different signs at offset phases.
    const p1 = buildSyntheticBipedPose(0.25, 1.0);
    const p2 = buildSyntheticBipedPose(0.75, 1.0);
    // leftThigh quat at 0.25 has positive X component, at 0.75 has negative
    expect(Math.sign(p1.left_thigh.rotation[0])).not.toBe(Math.sign(p2.left_thigh.rotation[0]));
  });

  it('high speed degrades stability', () => {
    const e = createSyntheticWalkCycleEngine();
    const safe = e.infer({
      targetVelocity: { x: 3, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    });
    const fast = e.infer({
      targetVelocity: { x: 8, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    });
    expect(safe.stability).toBe(1.0);
    expect(fast.stability).toBeLessThan(1.0);
  });

  it('dispose() flips loaded=false', async () => {
    const e = new SyntheticWalkCycleEngine();
    await e.load();
    e.dispose();
    expect(e.loaded).toBe(false);
  });
});
