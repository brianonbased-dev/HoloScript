/**
 * Paper 18 Motion-SESL Trace Harness — Verification Test
 *
 * Validates:
 *   1. Deterministic generation (same seed = same trace)
 *   2. CAEL hash-chain integrity on every trace
 *   3. Tamper detection (mutated trace fails verification)
 *   4. Volume gate (>=10k traces possible)
 *   5. Plausibility contract coverage across all 5 categories
 *   6. Index manifest structure
 *
 * Run:
 *   node --test scripts/__tests__/paper-18-motion-trace-harness.test.mjs
 */

import { describe, it, expect } from 'vitest';
import {
  generateMotionClip,
  checkPlausibility,
  verifyCAELHashChain,
  buildMotionTrace,
  generateScenarios,
  MOTION_CATEGORIES,
} from '../paper-18-motion-trace-harness.mjs';

describe('Paper 18 Motion Trace Harness', () => {
  describe('generateMotionClip', () => {
    it('produces deterministic clips from the same seed', () => {
      const clip1 = generateMotionClip({ category: 'locomotion', seed: 42, numFrames: 20, dt: 0.05 });
      const clip2 = generateMotionClip({ category: 'locomotion', seed: 42, numFrames: 20, dt: 0.05 });
      expect(clip1.id).toBe(clip2.id);
      expect(clip1.frames).toHaveLength(clip2.frames.length);
      // Deep-compare first and last frame bone positions
      for (let fi = 0; fi < clip1.frames.length; fi++) {
        for (let bi = 0; bi < clip1.frames[fi].length; bi++) {
          expect(clip1.frames[fi][bi].position).toEqual(clip2.frames[fi][bi].position);
        }
      }
    });

    it('produces different clips from different seeds', () => {
      const clip1 = generateMotionClip({ category: 'locomotion', seed: 1, numFrames: 20, dt: 0.05 });
      const clip2 = generateMotionClip({ category: 'locomotion', seed: 2, numFrames: 20, dt: 0.05 });
      expect(clip1.id).not.toBe(clip2.id);
    });

    it('covers all 5 motion categories', () => {
      for (const category of MOTION_CATEGORIES) {
        const clip = generateMotionClip({ category, seed: 100, numFrames: 20, dt: 0.05 });
        expect(clip.category).toBe(category);
        expect(clip.frames).toHaveLength(20);
        expect(clip.frames[0]).toHaveLength(6); // 6 bones per frame
      }
    });

    it('respects custom numFrames and dt', () => {
      const clip = generateMotionClip({ category: 'gesture', seed: 55, numFrames: 10, dt: 0.033 });
      expect(clip.frames).toHaveLength(10);
      expect(clip.dt).toBeCloseTo(0.033);
    });
  });

  describe('checkPlausibility', () => {
    it('passes for well-behaved clips', () => {
      const clip = generateMotionClip({ category: 'locomotion', seed: 0, numFrames: 20, dt: 0.05 });
      const result = checkPlausibility(clip);
      expect(result.pass).toBe(true);
    });

    it('rejects clips with feet below floor', () => {
      const clip = generateMotionClip({ category: 'locomotion', seed: 0, numFrames: 20, dt: 0.05 });
      // Tamper: push foot below floor
      clip.frames[0][2].position = [0, -0.5, 0];
      const result = checkPlausibility(clip);
      expect(result.pass).toBe(false);
      expect(result.violatedConstraint).toBe('foot_below_floor');
    });

    it('covers all categories without crashing', () => {
      for (const category of MOTION_CATEGORIES) {
        const clip = generateMotionClip({ category, seed: 77, numFrames: 20, dt: 0.05 });
        const result = checkPlausibility(clip);
        expect(result).toBeDefined();
        expect(typeof result.pass).toBe('boolean');
      }
    });
  });

  describe('buildMotionTrace', () => {
    it('produces a valid CAEL hash chain', () => {
      const { trace, runId } = buildMotionTrace({
        traceIndex: 0,
        category: 'locomotion',
        seed: 42,
        numFrames: 20,
        dt: 0.05,
      });

      expect(trace.length).toBeGreaterThanOrEqual(4); // init + frames + interaction + final
      expect(trace[0].event).toBe('init');
      expect(trace[0].payload.hashMode).toBe('fnv1a');
      expect(trace[trace.length - 1].event).toBe('final');

      const verification = verifyCAELHashChain(trace);
      expect(verification.valid).toBe(true);
    });

    it('detects tampered traces (hash mismatch)', () => {
      const { trace } = buildMotionTrace({
        traceIndex: 1,
        category: 'gesture',
        seed: 99,
        numFrames: 15,
        dt: 0.05,
      });

      // Tamper: modify a payload field in a step event
      const stepEvent = trace.find(e => e.event === 'step');
      expect(stepEvent).toBeDefined();
      stepEvent.payload.bones[0].position[0] = 999;

      const verification = verifyCAELHashChain(trace);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('hash mismatch');
    });

    it('detects prevHash tampering', () => {
      const { trace } = buildMotionTrace({
        traceIndex: 2,
        category: 'interaction',
        seed: 123,
        numFrames: 10,
        dt: 0.05,
      });

      // Tamper: break prevHash chain
      if (trace.length > 2) {
        trace[2].prevHash = 'cael-tampered';
      }

      const verification = verifyCAELHashChain(trace);
      expect(verification.valid).toBe(false);
    });

    it('includes plausibility result in interaction event', () => {
      const { trace, plausibility } = buildMotionTrace({
        traceIndex: 3,
        category: 'acrobatics',
        seed: 200,
        numFrames: 20,
        dt: 0.05,
      });

      const interactionEvent = trace.find(e => e.event === 'interaction');
      expect(interactionEvent).toBeDefined();
      expect(interactionEvent.payload.type).toBe('plausibility_check');
      expect(typeof interactionEvent.payload.plausibility).toBe('string');
    });

    it('produces deterministic traces from the same scenario', () => {
      const scenario = { traceIndex: 10, category: 'locomotion', seed: 555, numFrames: 20, dt: 0.05 };
      const result1 = buildMotionTrace(scenario);
      const result2 = buildMotionTrace(scenario);

      expect(result1.runId).toBe(result2.runId);
      expect(result1.trace).toHaveLength(result2.trace.length);
      // Same hashes
      for (let i = 0; i < result1.trace.length; i++) {
        expect(result1.trace[i].hash).toBe(result2.trace[i].hash);
      }
    });
  });

  describe('generateScenarios', () => {
    it('generates exactly targetCount scenarios', () => {
      const scenarios = generateScenarios(100);
      expect(scenarios).toHaveLength(100);
    });

    it('covers all 5 categories', () => {
      const scenarios = generateScenarios(50);
      const categories = new Set(scenarios.map(s => s.category));
      expect(categories.size).toBe(5);
    });

    it('is deterministic', () => {
      const scenarios1 = generateScenarios(25);
      const scenarios2 = generateScenarios(25);
      for (let i = 0; i < scenarios1.length; i++) {
        expect(scenarios1[i].category).toBe(scenarios2[i].category);
        expect(scenarios1[i].seed).toBe(scenarios2[i].seed);
      }
    });

    it('can generate 10k scenarios', () => {
      const scenarios = generateScenarios(10_000);
      expect(scenarios).toHaveLength(10_000);
    });
  });

  describe('Volume gate integration', () => {
    it('generates and verifies 100 traces as a smoke test for the 10k gate', () => {
      const scenarios = generateScenarios(100);
      let verified = 0;
      let failed = 0;

      for (const scenario of scenarios) {
        const { trace } = buildMotionTrace(scenario);
        const result = verifyCAELHashChain(trace);
        if (result.valid) {
          verified++;
        } else {
          failed++;
        }
      }

      expect(verified).toBe(100);
      expect(failed).toBe(0);
    });
  });
});