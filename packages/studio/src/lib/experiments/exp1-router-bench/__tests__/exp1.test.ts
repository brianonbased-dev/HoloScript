import { describe, it, expect } from 'vitest';

import { runBench, type BenchArms } from '../runner';
import {
  evaluateKillCriteria,
  mostEfficientArm,
  type KillThresholds,
} from '../metrics';
import { EXP1_FIRST_SLICE } from '../tasks';
import type { ArmAggregate, ArmModel, ArmModelResult, BenchReport } from '../types';

// ─── Synthetic-report helpers for the pure kill-criteria evaluator ────────────

function agg(arm: 'A' | 'B' | 'C', p: Partial<ArmAggregate>): ArmAggregate {
  return {
    arm,
    n: 10,
    passRate: 0,
    meanInputTokens: 0,
    meanOutputTokens: 50,
    provenanceCoverage: 1,
    ...p,
  };
}

function report(A: ArmAggregate, B: ArmAggregate, C: ArmAggregate): BenchReport {
  return { taskCount: 10, arms: { A, B, C }, outcomes: [] };
}

describe('EXP-1 kill criteria (pre-registered falsifiers)', () => {
  it('keeps the thesis alive when IR is efficient, offload retains capability, provenance holds', () => {
    const r = report(
      agg('A', { passRate: 0.7, meanInputTokens: 400, provenanceCoverage: 0.4 }),
      agg('B', { passRate: 0.8, meanInputTokens: 180, provenanceCoverage: 0.85 }),
      agg('C', { passRate: 0.68, meanInputTokens: 200, provenanceCoverage: 0.9 })
    );
    const v = evaluateKillCriteria(r, undefined, { armCParamsLower: true });
    expect(v.c1Dead).toBe(false);
    expect(v.c2Dead).toBe(false);
    expect(v.c3Dead).toBe(false);
    expect(v.thesisDead).toBe(false);
    expect(v.detail.tokenRatioBoverA).toBeCloseTo(0.45, 2);
  });

  it('C1 DEAD when IR uses >= tokens AND <= pass-rate vs NL', () => {
    const r = report(
      agg('A', { passRate: 0.7, meanInputTokens: 400 }),
      agg('B', { passRate: 0.6, meanInputTokens: 420 }),
      agg('C', { passRate: 0.65, meanInputTokens: 300, provenanceCoverage: 0.9 })
    );
    const v = evaluateKillCriteria(r, undefined, { armCParamsLower: true });
    expect(v.c1Dead).toBe(true);
    expect(v.thesisDead).toBe(true);
  });

  it('C2 DEAD when small+offload retention falls below the threshold', () => {
    const r = report(
      agg('A', { passRate: 0.7, meanInputTokens: 400 }),
      agg('B', { passRate: 0.75, meanInputTokens: 180, provenanceCoverage: 0.9 }),
      agg('C', { passRate: 0.5, meanInputTokens: 200, provenanceCoverage: 0.9 }) // .5/.7 = .71 < .9
    );
    const v = evaluateKillCriteria(r, undefined, { armCParamsLower: true });
    expect(v.c2Dead).toBe(true);
    expect(v.thesisDead).toBe(true);
  });

  it('C2 cannot be credited unless Arm C asserts strictly lower params', () => {
    const r = report(
      agg('A', { passRate: 0.7, meanInputTokens: 400 }),
      agg('B', { passRate: 0.75, meanInputTokens: 180, provenanceCoverage: 0.9 }),
      agg('C', { passRate: 0.69, meanInputTokens: 200, provenanceCoverage: 0.9 }) // great retention...
    );
    // ...but lower-params not asserted → C2 stays dead (no free capability claim).
    const v = evaluateKillCriteria(r, undefined, { armCParamsLower: false });
    expect(v.c2Dead).toBe(true);
  });

  it('C3 weak (does not by itself kill the thesis) when provenance coverage < floor', () => {
    const r = report(
      agg('A', { passRate: 0.7, meanInputTokens: 400 }),
      agg('B', { passRate: 0.8, meanInputTokens: 180, provenanceCoverage: 0.5 }),
      agg('C', { passRate: 0.68, meanInputTokens: 200, provenanceCoverage: 0.6 })
    );
    const thresholds: KillThresholds = { c2Retention: 0.9, c3CoverageFloor: 0.8 };
    const v = evaluateKillCriteria(r, thresholds, { armCParamsLower: true });
    expect(v.c3Dead).toBe(true);
    expect(v.thesisDead).toBe(false); // C1/C2 alive → thesis survives; C3 is a dependability bar
  });

  it('mostEfficientArm picks the highest pass-rate-per-token arm', () => {
    const r = report(
      agg('A', { passRate: 0.7, meanInputTokens: 400 }), // .00175
      agg('B', { passRate: 0.8, meanInputTokens: 180 }), // .00444  ← best
      agg('C', { passRate: 0.68, meanInputTokens: 200 }) // .0034
    );
    expect(mostEfficientArm(r)).toBe('B');
  });
});

// ─── Runner integration with mock arms + the REAL SimContractGate oracle ──────

const provFull = async () => ({ totalClaims: 2, tracedClaims: 2 });

/** A mock arm that emits an acceptable mutation (graded by the real oracle). */
function mockPassArm(inputTokens: number): ArmModel {
  return async (_prompt, { task }): Promise<ArmModelResult> => ({
    rawOutput: 'mock',
    mutation: { tool: task.acceptableTools[0], input: { object_name: 'freeOrb', trait_name: 'spin' } },
    inputTokens,
    outputTokens: 20,
  });
}

/** A mock arm that emits no mutation → always fails (passed=false). */
const mockNullArm: ArmModel = async (_p, _c) => ({
  rawOutput: '',
  mutation: null,
  inputTokens: 999,
  outputTokens: 0,
});

describe('EXP-1 runner integration (real oracle, mock arms, zero GPU)', () => {
  it('runs 3 arms × N tasks and aggregates pass-rate + mean tokens', async () => {
    // Use the unscoped task only → oracle passes any acceptable mutation deterministically.
    const unscoped = EXP1_FIRST_SLICE.filter((t) => t.contract === null);
    expect(unscoped.length).toBeGreaterThan(0);

    const arms: BenchArms = {
      A: mockPassArm(300),
      B: mockPassArm(120),
      C: mockNullArm,
    };
    const r = await runBench(unscoped, arms, provFull);

    expect(r.taskCount).toBe(unscoped.length);
    expect(r.outcomes).toHaveLength(unscoped.length * 3);

    // A and B emit acceptable mutations on an unscoped scene → pass; C emits none → fail.
    expect(r.arms.A.passRate).toBe(1);
    expect(r.arms.B.passRate).toBe(1);
    expect(r.arms.C.passRate).toBe(0);

    // Token metering flows through to the aggregate.
    expect(r.arms.A.meanInputTokens).toBe(300);
    expect(r.arms.B.meanInputTokens).toBe(120);

    // Provenance coverage from the checker.
    expect(r.arms.A.provenanceCoverage).toBe(1);

    // On this mock, B is the most token-efficient passing arm.
    expect(mostEfficientArm(r)).toBe('B');
  });

  it('grades a contract-violating mutation as a fail via the real oracle', async () => {
    // glow bounds 0..1; emit intensity 5.0 → oracle must fail it.
    const glowTask = EXP1_FIRST_SLICE.find((t) => t.id === 'bounds-glow-01')!;
    const violatingArm: ArmModel = async () => ({
      rawOutput: 'mock',
      mutation: {
        tool: 'set_trait_property',
        input: { object_name: 'lamp', trait_name: 'glow', property_key: 'intensity', property_value: 5.0 },
      },
      inputTokens: 100,
      outputTokens: 10,
    });
    const r = await runBench([glowTask], { A: violatingArm, B: violatingArm, C: violatingArm }, provFull);
    // Out-of-bounds mutation → oracle fails → task fail across all arms.
    expect(r.arms.A.passRate).toBe(0);
  });
});
