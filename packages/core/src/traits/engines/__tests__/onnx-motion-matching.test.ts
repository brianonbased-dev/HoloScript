/**
 * OnnxMotionMatchingEngine — deterministic-seed Vitest tests.
 *
 * All tests use NoOpInferenceAdapter (zero-weight forward pass) so results
 * are fully deterministic and require no trained weights. The test surface
 * covers:
 *   1. Model descriptor validation (bundled catalog).
 *   2. Tensor encoding correctness (input layout from Holden 2017 §4).
 *   3. Tensor decoding correctness (output layout).
 *   4. Engine lifecycle (load / infer / dispose).
 *   5. Async inference path.
 *   6. 60 Hz budget: 60 inferences in ≤ 1000 ms (generous for CI).
 *   7. 100-agent batch: batchMs ≤ 5000 ms on a CPU stub.
 *   8. Unknown model ID → throws at construction.
 *   9. infer() before load() → throws.
 *  10. Quadruped model produces 4-contact features.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OnnxMotionMatchingEngine,
  batchInferAsync,
  createOnnxMotionMatchingEngine,
  encodeInputTensor,
  decodeOutputTensor,
  listBundledModels,
  BUNDLED_MODELS,
  INPUT_DIM,
  OUTPUT_DIM,
} from '../onnx-motion-matching';
import { createNoOpInferenceAdapter } from '../onnx-adapter';
import type { MotionInferenceInput } from '../motion-matching';

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Deterministic "random" via simple LCG seeded at a fixed value. */
function seededInput(seed: number): MotionInferenceInput {
  const lcg = (s: number) => (s * 1664525 + 1013904223) & 0xffffffff;
  let s = seed;
  const f = () => { s = lcg(s); return (s >>> 0) / 0xffffffff; };
  return {
    targetVelocity: { x: f() * 4 - 2, y: 0, z: f() * 4 - 2 },
    currentPhase: f(),
    delta: 0.016,
    terrainNormal: { x: 0, y: 1, z: 0 },
    energyEfficiency: 0.5 + f() * 0.5,
  };
}

// ── Bundled model catalog ─────────────────────────────────────────────────────

describe('bundled model catalog', () => {
  it('biped_humanoid_v2 is registered', () => {
    const models = listBundledModels();
    const ids = models.map(m => m.id);
    expect(ids).toContain('biped_humanoid_v2');
  });

  it('quadruped_dog_v2 is registered', () => {
    const models = listBundledModels();
    const ids = models.map(m => m.id);
    expect(ids).toContain('quadruped_dog_v2');
  });

  it('biped model has correct dims', () => {
    const m = BUNDLED_MODELS['biped_humanoid_v2'];
    expect(m).toBeDefined();
    expect(m!.inputDim).toBe(INPUT_DIM);
    expect(m!.outputDim).toBe(OUTPUT_DIM);
    expect(m!.skeletonType).toBe('biped');
  });

  it('quadruped model has correct dims', () => {
    const m = BUNDLED_MODELS['quadruped_dog_v2'];
    expect(m).toBeDefined();
    expect(m!.inputDim).toBe(INPUT_DIM);
    expect(m!.outputDim).toBe(OUTPUT_DIM);
    expect(m!.skeletonType).toBe('quadruped');
  });
});

// ── Tensor encoding ───────────────────────────────────────────────────────────

describe('encodeInputTensor', () => {
  it('returns correct shape [1, INPUT_DIM]', () => {
    const t = encodeInputTensor(seededInput(42));
    expect(t.shape).toEqual([1, INPUT_DIM]);
    expect(t.data.length).toBe(INPUT_DIM);
  });

  it('velocity written at offsets [0..2]', () => {
    const input: MotionInferenceInput = {
      targetVelocity: { x: 1.5, y: -0.5, z: 2.0 },
      currentPhase: 0,
      delta: 0.016,
    };
    const t = encodeInputTensor(input);
    expect(t.data[0]).toBeCloseTo(1.5, 5);
    expect(t.data[1]).toBeCloseTo(-0.5, 5);
    expect(t.data[2]).toBeCloseTo(2.0, 5);
  });

  it('default terrain normal (0,1,0) when absent', () => {
    const input: MotionInferenceInput = {
      targetVelocity: { x: 0, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
    };
    const t = encodeInputTensor(input);
    expect(t.data[3]).toBeCloseTo(0, 5); // x
    expect(t.data[4]).toBeCloseTo(1, 5); // y
    expect(t.data[5]).toBeCloseTo(0, 5); // z
  });

  it('custom terrain normal encoded correctly', () => {
    const input: MotionInferenceInput = {
      targetVelocity: { x: 0, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
      terrainNormal: { x: 0.1, y: 0.99, z: -0.05 },
    };
    const t = encodeInputTensor(input);
    expect(t.data[3]).toBeCloseTo(0.1, 5);
    expect(t.data[4]).toBeCloseTo(0.99, 5);
    expect(t.data[5]).toBeCloseTo(-0.05, 5);
  });

  it('energy efficiency at offset [6]', () => {
    const input: MotionInferenceInput = {
      targetVelocity: { x: 0, y: 0, z: 0 },
      currentPhase: 0,
      delta: 0.016,
      energyEfficiency: 0.75,
    };
    const t = encodeInputTensor(input);
    expect(t.data[6]).toBeCloseTo(0.75, 5);
  });

  it('phase channels are sin/cos of currentPhase*2π', () => {
    const phase = 0.25;
    const p = phase * 2 * Math.PI;
    const input: MotionInferenceInput = {
      targetVelocity: { x: 0, y: 0, z: 0 },
      currentPhase: phase,
      delta: 0.016,
    };
    const t = encodeInputTensor(input);
    // Phase channels start at offset 7 + 12*5 = 67
    const base = 67;
    expect(t.data[base]).toBeCloseTo(Math.sin(p), 4);
    expect(t.data[base + 1]).toBeCloseTo(Math.cos(p), 4);
    expect(t.data[base + 2]).toBeCloseTo(Math.sin(2 * p), 4);
    expect(t.data[base + 3]).toBeCloseTo(Math.cos(2 * p), 4);
  });

  it('deterministic: same input always produces same tensor', () => {
    const input = seededInput(7);
    const t1 = encodeInputTensor(input);
    const t2 = encodeInputTensor(input);
    expect(Array.from(t1.data)).toEqual(Array.from(t2.data));
  });
});

// ── Tensor decoding ───────────────────────────────────────────────────────────

describe('decodeOutputTensor', () => {
  it('zero-output tensor produces valid MotionInferenceResult shape', () => {
    const output = { data: new Float32Array(OUTPUT_DIM), shape: [1, OUTPUT_DIM] as const };
    const r = decodeOutputTensor(output, 'biped', 0);
    expect(Array.isArray(r.trajectory)).toBe(true);
    expect(r.trajectory.length).toBe(12);
    expect(typeof r.phase).toBe('number');
    expect(r.phase).toBeGreaterThanOrEqual(0);
    expect(r.phase).toBeLessThan(1);
    expect(typeof r.stability).toBe('number');
    expect(r.stability).toBeGreaterThanOrEqual(0);
    expect(r.stability).toBeLessThanOrEqual(1);
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
    expect(typeof r.contactFeatures.leftFoot).toBe('boolean');
    expect(typeof r.contactFeatures.rightFoot).toBe('boolean');
    expect(r.pose).toBeDefined();
    expect(typeof r.pose.joints).toBe('object');
  });

  it('biped pose has biped joint names', () => {
    const output = { data: new Float32Array(OUTPUT_DIM), shape: [1, OUTPUT_DIM] as const };
    const r = decodeOutputTensor(output, 'biped', 0);
    expect(Object.keys(r.pose.joints)).toContain('thigh_l');
    expect(Object.keys(r.pose.joints)).toContain('foot_r');
    expect(Object.keys(r.pose.joints)).not.toContain('rear_thigh_l');
  });

  it('quadruped pose has quadruped joint names', () => {
    const output = { data: new Float32Array(OUTPUT_DIM), shape: [1, OUTPUT_DIM] as const };
    const r = decodeOutputTensor(output, 'quadruped', 0);
    expect(Object.keys(r.pose.joints)).toContain('rear_thigh_l');
    expect(Object.keys(r.pose.joints)).toContain('front_foot_r');
  });

  it('quadruped contact features include leftHand / rightHand', () => {
    const output = { data: new Float32Array(OUTPUT_DIM), shape: [1, OUTPUT_DIM] as const };
    const r = decodeOutputTensor(output, 'quadruped', 0);
    expect(r.contactFeatures).toHaveProperty('leftHand');
    expect(r.contactFeatures).toHaveProperty('rightHand');
  });

  it('biped contact features do NOT include leftHand', () => {
    const output = { data: new Float32Array(OUTPUT_DIM), shape: [1, OUTPUT_DIM] as const };
    const r = decodeOutputTensor(output, 'biped', 0);
    expect(r.contactFeatures).not.toHaveProperty('leftHand');
  });

  it('high gait logit at run slot → gait=run', () => {
    const data = new Float32Array(OUTPUT_DIM);
    // gait logits at [45..49]: run is index 3
    data[48] = 10; // run logit dominates
    const output = { data, shape: [1, OUTPUT_DIM] as const };
    const r = decodeOutputTensor(output, 'biped', 0);
    expect(r.gait).toBe('run');
  });
});

// ── Engine lifecycle ──────────────────────────────────────────────────────────

describe('OnnxMotionMatchingEngine lifecycle', () => {
  it('starts unloaded', () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    expect(e.loaded).toBe(false);
  });

  it('load() sets loaded=true', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    await e.load();
    expect(e.loaded).toBe(true);
  });

  it('dispose() sets loaded=false', async () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    await e.load();
    e.dispose();
    expect(e.loaded).toBe(false);
  });

  it('infer() before load() throws', () => {
    const e = new OnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    expect(() => e.infer(seededInput(1))).toThrow('load()');
  });

  it('unknown modelId throws at construction', () => {
    expect(() => new OnnxMotionMatchingEngine('nonexistent_model')).toThrow('unknown modelId');
  });

  it('modelId property matches constructor arg', () => {
    const e = new OnnxMotionMatchingEngine('quadruped_dog_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    expect(e.modelId).toBe('quadruped_dog_v2');
  });
});

// ── Synchronous infer() ───────────────────────────────────────────────────────

describe('OnnxMotionMatchingEngine.infer() sync', () => {
  let engine: OnnxMotionMatchingEngine;

  beforeEach(async () => {
    engine = new OnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    await engine.load();
  });

  it('returns valid result shape', () => {
    const r = engine.infer(seededInput(101));
    expect(r.trajectory.length).toBe(12);
    expect(typeof r.phase).toBe('number');
    expect(r.stability).toBeGreaterThanOrEqual(0);
    expect(r.stability).toBeLessThanOrEqual(1);
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
  });

  it('is deterministic: same input → same output', () => {
    const input = seededInput(42);
    // Re-create engine so phase state is reset
    const e1 = new OnnxMotionMatchingEngine('biped_humanoid_v2', { adapter: createNoOpInferenceAdapter() });
    void e1.load();
    // load() is async but NoOp resolves synchronously in the microtask queue
    // We need the sync shim path — just infer after explicit load
    const e2 = new OnnxMotionMatchingEngine('biped_humanoid_v2', { adapter: createNoOpInferenceAdapter() });

    const doInfer = async (e: OnnxMotionMatchingEngine) => {
      await e.load();
      return e.infer(input);
    };

    // Both engines with same seed produce same result
    return Promise.all([doInfer(e1), doInfer(e2)]).then(([r1, r2]) => {
      expect(r1.gait).toBe(r2.gait);
      expect(r1.phase).toBeCloseTo(r2.phase, 6);
      expect(r1.stability).toBeCloseTo(r2.stability, 6);
    });
  });
});

// ── Async inferAsync() ────────────────────────────────────────────────────────

describe('OnnxMotionMatchingEngine.inferAsync()', () => {
  it('returns valid result from async path', async () => {
    const engine = await createOnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    const r = await engine.inferAsync(seededInput(99));
    expect(r.trajectory.length).toBe(12);
    expect(typeof r.phase).toBe('number');
    expect(['idle', 'walk', 'trot', 'run', 'crouch']).toContain(r.gait);
    engine.dispose();
  });

  it('quadruped engine async path returns 4-contact features', async () => {
    const engine = await createOnnxMotionMatchingEngine('quadruped_dog_v2', {
      adapter: createNoOpInferenceAdapter(),
    });
    const r = await engine.inferAsync(seededInput(55));
    expect(r.contactFeatures).toHaveProperty('leftHand');
    expect(r.contactFeatures).toHaveProperty('rightHand');
    engine.dispose();
  });
});

// ── 60 Hz budget test ─────────────────────────────────────────────────────────

describe('60 Hz inference budget', () => {
  it('60 sync inferences complete in ≤ 1000 ms (CI budget)', async () => {
    const engine = await createOnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });

    const start = performance.now();
    for (let i = 0; i < 60; i++) {
      engine.infer(seededInput(i));
    }
    const elapsed = performance.now() - start;

    engine.dispose();
    // CI is slow — 1000ms is generous vs the 16.67ms/frame real target
    expect(elapsed).toBeLessThan(1000);
  });

  it('single infer() completes in < 16.67 ms (60 Hz) on fast runs', async () => {
    const engine = await createOnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });

    const input = seededInput(1);
    const start = performance.now();
    engine.infer(input);
    const elapsed = performance.now() - start;

    engine.dispose();
    // Allow 50 ms for very slow CI environments (the real target is < 16.67 ms)
    expect(elapsed).toBeLessThan(50);
  });
});

// ── 100-agent batch budget ────────────────────────────────────────────────────

describe('100-agent batch inference', () => {
  it('batchInferAsync with 100 agents completes in ≤ 5000 ms (CI budget)', async () => {
    const engine = await createOnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });

    const agents = Array.from({ length: 100 }, (_, i) => seededInput(i));
    const result = await batchInferAsync(engine, { agents });

    engine.dispose();
    expect(result.agentCount).toBe(100);
    expect(result.results.length).toBe(100);
    // < 5000 ms for CI (real WebGPU FP16 target is < 5 ms/frame for 100 agents)
    expect(result.batchMs).toBeLessThan(5000);
  });

  it('all results in batch have valid trajectory length', async () => {
    const engine = await createOnnxMotionMatchingEngine('biped_humanoid_v2', {
      adapter: createNoOpInferenceAdapter(),
    });

    const agents = Array.from({ length: 10 }, (_, i) => seededInput(i * 13));
    const result = await batchInferAsync(engine, { agents });

    engine.dispose();
    for (const r of result.results) {
      expect(r.trajectory.length).toBe(12);
    }
  });
});

// ── listBundledModels() ───────────────────────────────────────────────────────

describe('listBundledModels()', () => {
  it('returns at least 2 models', () => {
    const models = listBundledModels();
    expect(models.length).toBeGreaterThanOrEqual(2);
  });

  it('all models have non-empty modelUrl', () => {
    for (const m of listBundledModels()) {
      expect(m.modelUrl.length).toBeGreaterThan(0);
    }
  });
});
