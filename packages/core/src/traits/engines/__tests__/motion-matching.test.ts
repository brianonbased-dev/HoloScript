import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  NullMotionMatchingEngine,
  OnnxMotionMatchingEngine,
  createNullMotionMatchingEngine,
  createOnnxMotionMatchingEngine,
  magnitude,
  classifyGait,
  projectLinearTrajectory,
  BUNDLED_MODELS,
  BIPED_HUMANOID_V2_PATH,
  QUADRUPED_DOG_V2_PATH,
  TRAJECTORY_HORIZON_FRAMES,
  TRAJECTORY_FRAME_DT,
  type MotionInferenceInput,
  type MotionMatchingEngine,
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

// =============================================================================
// Utility function tests
// =============================================================================

describe('magnitude()', () => {
  it('returns 0 for zero vector', () => {
    expect(magnitude({ x: 0, y: 0, z: 0 })).toBe(0);
  });

  it('returns 1 for unit x', () => {
    expect(magnitude({ x: 1, y: 0, z: 0 })).toBeCloseTo(1.0, 10);
  });

  it('returns correct length for 3-4-5 right triangle z=0', () => {
    expect(magnitude({ x: 3, y: 4, z: 0 })).toBeCloseTo(5.0, 10);
  });

  it('handles negative components', () => {
    expect(magnitude({ x: -1, y: -1, z: -1 })).toBeCloseTo(Math.sqrt(3), 10);
  });
});

describe('classifyGait()', () => {
  it('returns idle below speed 0.05', () => {
    expect(classifyGait(0.0, 1.0)).toBe('idle');
    expect(classifyGait(0.04, 1.0)).toBe('idle');
  });

  it('returns walk between 0.05 and 1.4', () => {
    expect(classifyGait(0.5, 1.0)).toBe('walk');
    expect(classifyGait(1.2, 1.0)).toBe('walk');
  });

  it('returns trot between 1.4 and 3.0', () => {
    expect(classifyGait(2.0, 1.0)).toBe('trot');
    expect(classifyGait(2.9, 1.0)).toBe('trot');
  });

  it('returns run above 3.0', () => {
    expect(classifyGait(3.1, 1.0)).toBe('run');
    expect(classifyGait(10.0, 1.0)).toBe('run');
  });

  it('efficiency penalty >1.0 shifts bands toward idle (adjusted = speed * 0.85)', () => {
    // speed 1.5 normally → trot; with efficiency 1.5 → adjusted=1.275 → walk
    expect(classifyGait(1.5, 1.5)).toBe('walk');
  });

  it('efficiency ≤1.0 uses raw speed', () => {
    expect(classifyGait(1.5, 1.0)).toBe('trot');
    expect(classifyGait(1.5, 0.5)).toBe('trot');
  });
});

describe('projectLinearTrajectory()', () => {
  it(`returns exactly ${TRAJECTORY_HORIZON_FRAMES} points`, () => {
    expect(projectLinearTrajectory({ x: 1, y: 0, z: 0 }).length).toBe(TRAJECTORY_HORIZON_FRAMES);
  });

  it('first point at t=TRAJECTORY_FRAME_DT from velocity', () => {
    const v = { x: 3, y: 0, z: 0 };
    const traj = projectLinearTrajectory(v);
    expect(traj[0][0]).toBeCloseTo(v.x * TRAJECTORY_FRAME_DT, 6);
    expect(traj[0][1]).toBeCloseTo(0, 6);
    expect(traj[0][2]).toBeCloseTo(0, 6);
  });

  it('last point at t=HORIZON*DT from velocity', () => {
    const v = { x: 2, y: 0, z: 1 };
    const traj = projectLinearTrajectory(v);
    const t = TRAJECTORY_HORIZON_FRAMES * TRAJECTORY_FRAME_DT;
    expect(traj[TRAJECTORY_HORIZON_FRAMES - 1][0]).toBeCloseTo(v.x * t, 5);
    expect(traj[TRAJECTORY_HORIZON_FRAMES - 1][2]).toBeCloseTo(v.z * t, 5);
  });

  it('returns all-zero trajectory for zero velocity', () => {
    const traj = projectLinearTrajectory({ x: 0, y: 0, z: 0 });
    for (const pt of traj) {
      expect(pt[0]).toBe(0);
      expect(pt[1]).toBe(0);
      expect(pt[2]).toBe(0);
    }
  });
});

// =============================================================================
// BUNDLED_MODELS descriptor tests
// =============================================================================

describe('BUNDLED_MODELS', () => {
  it('biped_humanoid_v2 has expected shape', () => {
    const d = BUNDLED_MODELS['biped_humanoid_v2'];
    expect(d).toBeDefined();
    expect(d.id).toBe('biped_humanoid_v2');
    expect(d.jointCount).toBe(20);
    expect(d.inputDim).toBeGreaterThan(0);
    expect(d.outputDim).toBeGreaterThan(0);
    expect(d.inputNames).toContain('input_features');
    expect(d.outputNames).toContain('joint_params');
  });

  it('quadruped_dog_v2 has expected shape', () => {
    const d = BUNDLED_MODELS['quadruped_dog_v2'];
    expect(d).toBeDefined();
    expect(d.id).toBe('quadruped_dog_v2');
    expect(d.jointCount).toBe(32);
    expect(d.inputDim).toBeGreaterThan(0);
    expect(d.outputDim).toBeGreaterThan(0);
  });

  it('quadruped has more joints than biped', () => {
    expect(BUNDLED_MODELS['quadruped_dog_v2'].jointCount).toBeGreaterThan(
      BUNDLED_MODELS['biped_humanoid_v2'].jointCount
    );
  });

  it('BIPED_HUMANOID_V2_PATH ends with .onnx', () => {
    expect(BIPED_HUMANOID_V2_PATH).toMatch(/\.onnx$/);
  });

  it('QUADRUPED_DOG_V2_PATH ends with .onnx', () => {
    expect(QUADRUPED_DOG_V2_PATH).toMatch(/\.onnx$/);
  });
});

// =============================================================================
// OnnxMotionMatchingEngine — procedural fallback path (no ONNX runtime)
// =============================================================================

describe('OnnxMotionMatchingEngine (procedural fallback)', () => {
  it('factory returns OnnxMotionMatchingEngine instance', () => {
    const e = createOnnxMotionMatchingEngine('biped_humanoid_v2');
    expect(e).toBeInstanceOf(OnnxMotionMatchingEngine);
  });

  it('starts unloaded', () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    expect(e.loaded).toBe(false);
  });

  it('load() succeeds without onnxruntime (procedural fallback)', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    expect(e.loaded).toBe(true);
    expect(e.backend).toBe('procedural');
  });

  it('infer() returns full result shape after load', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    const r = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    });
    expect(r.pose).toBeDefined();
    expect(typeof r.phase).toBe('number');
    expect(Array.isArray(r.trajectory)).toBe(true);
    expect(typeof r.stability).toBe('number');
    expect(r.stability).toBeGreaterThanOrEqual(0);
    expect(r.stability).toBeLessThanOrEqual(1);
    expect(r.contactFeatures).toBeDefined();
    expect(typeof r.contactFeatures.leftFoot).toBe('boolean');
    expect(typeof r.contactFeatures.rightFoot).toBe('boolean');
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
    expect(typeof r.kineticEnergyProxy).toBe('number');
  });

  it('inferAsync() also returns full result shape', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    const r = await e.inferAsync({
      targetVelocity: { x: 2, y: 0, z: 0 },
      currentPhase: 0.25,
      delta: 0.016,
    });
    expect(r.pose).toBeDefined();
    expect(r.trajectory.length).toBeLessThanOrEqual(TRAJECTORY_HORIZON_FRAMES);
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
  });

  it('terrain normal affects stability (rough terrain reduces it)', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    const flat = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
      terrainNormal: { x: 0, y: 1, z: 0 },
    });
    const slope = e.infer({
      targetVelocity: { x: 1, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
      terrainNormal: { x: 0.7, y: 0.7, z: 0 },
    });
    expect(slope.stability).toBeLessThanOrEqual(flat.stability);
  });

  it('dispose() resets to unloaded state', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    e.dispose();
    expect(e.loaded).toBe(false);
    expect(e.backend).toBe('procedural');
  });

  it('quadruped model loads without error', async () => {
    const e = new OnnxMotionMatchingEngine('quadruped_dog_v2');
    await e.load();
    expect(e.loaded).toBe(true);
  });

  it('unknown modelId falls back to biped descriptor', async () => {
    const e = new OnnxMotionMatchingEngine('nonexistent_model');
    await e.load();
    expect(e.loaded).toBe(true);
    const r = e.infer({ targetVelocity: { x: 0, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 });
    expect(r).toBeDefined();
  });

  it('kineticEnergyProxy scales with speed squared', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    const slow = e.infer({ targetVelocity: { x: 1, y: 0, z: 0 }, currentPhase: 0, delta: 0 });
    const fast = e.infer({ targetVelocity: { x: 2, y: 0, z: 0 }, currentPhase: 0, delta: 0 });
    // 4× speed² at 2m/s vs 1m/s
    expect(fast.kineticEnergyProxy).toBeCloseTo(slow.kineticEnergyProxy * 4, 5);
  });
});

// =============================================================================
// Interface contract: both engines satisfy MotionMatchingEngine
// =============================================================================

describe('MotionMatchingEngine interface contract', () => {
  const engines: Array<[string, () => MotionMatchingEngine]> = [
    ['NullMotionMatchingEngine', () => new NullMotionMatchingEngine('biped_humanoid_v2')],
    ['OnnxMotionMatchingEngine', () => new OnnxMotionMatchingEngine('biped_humanoid_v2')],
  ];

  const sampleInput: MotionInferenceInput = {
    targetVelocity: { x: 1.5, y: 0, z: 0 },
    currentPhase: 0.3,
    delta: 0.016,
  };

  for (const [name, factory] of engines) {
    it(`${name} — result fields are present and typed`, async () => {
      const e = factory();
      await e.load();
      const r = e.infer(sampleInput);
      expect(typeof r.phase).toBe('number');
      expect(r.phase).toBeGreaterThanOrEqual(0);
      expect(r.phase).toBeLessThan(1.0);
      expect(Array.isArray(r.trajectory)).toBe(true);
      expect(r.trajectory.every((pt) => pt.length === 3)).toBe(true);
      expect(typeof r.stability).toBe('number');
      expect(r.stability).toBeGreaterThanOrEqual(0);
      expect(r.stability).toBeLessThanOrEqual(1);
      expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
      expect(typeof r.kineticEnergyProxy).toBe('number');
      expect(r.kineticEnergyProxy).toBeGreaterThanOrEqual(0);
    });

    it(`${name} — idle velocity produces idle gait`, async () => {
      const e = factory();
      await e.load();
      const r = e.infer({ targetVelocity: { x: 0, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 });
      expect(r.gait).toBe('idle');
      expect(r.kineticEnergyProxy).toBe(0);
    });

    it(`${name} — high velocity produces run gait`, async () => {
      const e = factory();
      await e.load();
      const r = e.infer({ targetVelocity: { x: 5, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 });
      expect(r.gait).toBe('run');
    });

    it(`${name} — dispose() then load() is safe`, async () => {
      const e = factory();
      await e.load();
      e.dispose();
      expect(e.loaded).toBe(false);
      await e.load();
      expect(e.loaded).toBe(true);
    });
  }
});

// =============================================================================
// Deterministic seed tests — same input → same output
// =============================================================================

describe('deterministic inference', () => {
  const seedInput: MotionInferenceInput = {
    targetVelocity: { x: 1.23, y: 0, z: 0.45 },
    currentPhase: 0.17,
    delta: 0.033,
  };

  it('NullMotionMatchingEngine produces identical results on repeated calls', async () => {
    const e = new NullMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    const r1 = e.infer(seedInput);
    const r2 = e.infer(seedInput);
    expect(r1.phase).toBeCloseTo(r2.phase, 10);
    expect(r1.trajectory[0][0]).toBeCloseTo(r2.trajectory[0][0], 10);
    expect(r1.gait).toBe(r2.gait);
  });

  it('OnnxMotionMatchingEngine procedural fallback is deterministic', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await e.load();
    const r1 = e.infer(seedInput);
    const r2 = e.infer(seedInput);
    expect(r1.phase).toBeCloseTo(r2.phase, 10);
    expect(r1.gait).toBe(r2.gait);
    expect(r1.stability).toBeCloseTo(r2.stability, 10);
  });

  it('both engines agree on gait for same velocity', async () => {
    const inputs: MotionInferenceInput[] = [
      { targetVelocity: { x: 0, y: 0, z: 0 }, currentPhase: 0, delta: 0 },
      { targetVelocity: { x: 1, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 },
      { targetVelocity: { x: 4, y: 0, z: 0 }, currentPhase: 0, delta: 0.016 },
    ];
    const nullE = new NullMotionMatchingEngine('biped_humanoid_v2');
    const onnxE = new OnnxMotionMatchingEngine('biped_humanoid_v2');
    await nullE.load();
    await onnxE.load();
    for (const inp of inputs) {
      expect(onnxE.infer(inp).gait).toBe(nullE.infer(inp).gait);
    }
  });
});
