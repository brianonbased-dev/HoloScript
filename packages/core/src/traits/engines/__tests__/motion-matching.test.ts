import { describe, it, expect } from 'vitest';
import {
  NullMotionMatchingEngine,
  createNullMotionMatchingEngine,
} from '../motion-matching';

describe('NullMotionMatchingEngine', () => {
  it('starts unloaded; load() flips loaded=true', async () => {
    const e = new NullMotionMatchingEngine('biped_humanoid_v2');
    expect(e.loaded).toBe(false);
    await e.load();
    expect(e.loaded).toBe(true);
  });

  it('infer() returns full result shape', () => {
    const e = createNullMotionMatchingEngine('biped_humanoid_v2');
    const r = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    });
    expect(r.pose).toBeDefined();
    expect(r.pose.joints).toEqual({});
    expect(typeof r.phase).toBe('number');
    expect(Array.isArray(r.trajectory)).toBe(true);
    expect(r.trajectory.length).toBe(12);
    expect(r.contactFeatures.leftFoot).toBe(true);
    expect(r.contactFeatures.rightFoot).toBe(false);
    expect(r.stability).toBe(1.0);
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
  });

  it('phase advances monotonically when delta>0 and velocity>0', () => {
    const e = createNullMotionMatchingEngine('biped_humanoid_v2');
    const r1 = e.infer({
      targetVelocity: { x: 2, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.05,
    });
    const r2 = e.infer({
      targetVelocity: { x: 2, y: 0, z: 0 },
      currentPhase: r1.phase,
      delta: 0.05,
    });
    expect(r2.phase).toBeGreaterThan(r1.phase);
    expect(r2.phase).toBeLessThan(1.0);
  });

  it('trajectory projects from velocity (linear at idle/no-acceleration)', () => {
    const e = createNullMotionMatchingEngine('biped_humanoid_v2');
    const r = e.infer({
      targetVelocity: { x: 3, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    });
    // First trajectory point at t=1/30 → x = 3 * (1/30) = 0.1
    expect(r.trajectory[0][0]).toBeCloseTo(0.1, 5);
    expect(r.trajectory[0][1]).toBe(0);
    expect(r.trajectory[0][2]).toBe(0);
    // Last (12th) → x = 3 * (12/30) = 1.2
    expect(r.trajectory[11][0]).toBeCloseTo(1.2, 5);
  });

  it('gait classifier matches velocity-magnitude bands', () => {
    const e = createNullMotionMatchingEngine('biped_humanoid_v2');
    expect(e.infer({ targetVelocity: { x: 0, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 }).gait).toBe('idle');
    expect(e.infer({ targetVelocity: { x: 1.0, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 }).gait).toBe('walk');
    expect(e.infer({ targetVelocity: { x: 2.5, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 }).gait).toBe('trot');
    expect(e.infer({ targetVelocity: { x: 5.0, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 }).gait).toBe('run');
  });

  it('contact features alternate by phase half', () => {
    const e = createNullMotionMatchingEngine('biped_humanoid_v2');
    const earlyPhase = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0.1,
      delta: 0.0,
    });
    const latePhase = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0.7,
      delta: 0.0,
    });
    expect(earlyPhase.contactFeatures.leftFoot).toBe(true);
    expect(earlyPhase.contactFeatures.rightFoot).toBe(false);
    expect(latePhase.contactFeatures.leftFoot).toBe(false);
    expect(latePhase.contactFeatures.rightFoot).toBe(true);
  });

  it('dispose() flips loaded=false', async () => {
    const e = new NullMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    e.dispose();
    expect(e.loaded).toBe(false);
  });
});
