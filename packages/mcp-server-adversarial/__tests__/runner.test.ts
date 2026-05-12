// Runner tests — validate output schema, trial execution, and baseline aggregation.
// G.GOLD.013/015: test false cases explicitly.

import { describe, it, expect } from 'vitest';
import {
  runTrial,
  runBaseline,
  DEFAULT_TRIALS,
  type RunnableAttack,
} from '../src/runner/run-attack.js';
import {
  validateAttackOutput,
  wilsonCI,
} from '../src/runner/output-schema.js';

describe('validateAttackOutput', () => {
  it('accepts a valid AttackOutput', () => {
    const obj = {
      attack: 'whitewasher',
      trial_id: 'uuid-1',
      success: true,
      metrics: { rounds: 5 },
      duration_ms: 10,
      testbed_version: 'abc123',
    };
    expect(validateAttackOutput(obj)).toBe(true);
  });

  it('rejects missing attack field', () => {
    const obj = {
      trial_id: 'uuid-1',
      success: true,
      metrics: {},
      duration_ms: 10,
      testbed_version: 'abc123',
    };
    expect(validateAttackOutput(obj)).toBe(false);
  });

  it('rejects non-number metric value', () => {
    const obj = {
      attack: 'sybil',
      trial_id: 'uuid-2',
      success: false,
      metrics: { rounds: 'five' as unknown as number },
      duration_ms: 10,
      testbed_version: 'abc123',
    };
    expect(validateAttackOutput(obj)).toBe(false);
  });

  it('rejects null', () => {
    expect(validateAttackOutput(null)).toBe(false);
  });
});

describe('wilsonCI', () => {
  it('returns zero-width interval for N=0', () => {
    const ci = wilsonCI(0, 0);
    expect(ci.low).toBe(0);
    expect(ci.high).toBe(0);
  });

  it('bounds are within [0,1]', () => {
    const ci = wilsonCI(1, 1);
    expect(ci.low).toBeGreaterThanOrEqual(0);
    expect(ci.high).toBeLessThanOrEqual(1);
  });

  it('narrows as N grows', () => {
    const ciSmall = wilsonCI(5, 10);
    const ciLarge = wilsonCI(50, 100);
    expect(ciLarge.high - ciLarge.low).toBeLessThan(
      ciSmall.high - ciSmall.low
    );
  });
});

describe('runTrial', () => {
  const trustSeries = Array.from({ length: 200 }, (_, i) =>
    Math.min(0.99, 0.1 + i * 0.01)
  );

  const baseOpts = {
    sandboxId: 'test-sandbox',
    trustSeries,
    testbedVersion: 'test-version',
  };

  it('produces valid AttackOutput for whitewasher', () => {
    const spec: RunnableAttack = {
      id: 'whitewasher',
      config: { targetTrust: 0.9, cooperativeRounds: 5 },
    };
    const out = runTrial(spec, baseOpts);
    expect(validateAttackOutput(out)).toBe(true);
    expect(out.attack).toBe('whitewasher');
    expect(out.testbed_version).toBe('test-version');
    expect(typeof out.success).toBe('boolean');
    expect(out.metrics.rounds).toBeGreaterThan(0);
  });

  it('produces valid AttackOutput for sybil', () => {
    const spec: RunnableAttack = {
      id: 'sybil',
      config: { K: 5, compoundRounds: 10, baselineTrust: 0.5 },
    };
    const out = runTrial(spec, baseOpts);
    expect(validateAttackOutput(out)).toBe(true);
    expect(out.attack).toBe('sybil');
    expect(out.metrics.inflation).toBeGreaterThan(0);
  });

  it('produces valid AttackOutput for score-manipulator', () => {
    const spec: RunnableAttack = {
      id: 'score-manipulator',
      config: {
        targetTrust: 0.95,
        trustMaxOutputRef: 'v1-analytic-derivation',
        outputUtilityRatio: 0.2,
        baselineUtility: 0.8,
      },
    };
    const out = runTrial(spec, baseOpts);
    expect(validateAttackOutput(out)).toBe(true);
    expect(out.attack).toBe('score-manipulator');
  });

  it('produces valid AttackOutput for slow-poisoner', () => {
    const spec: RunnableAttack = {
      id: 'slow-poisoner',
      config: {
        biasPerCall: 0.01,
        aggregateBiasThreshold: 10,
      },
    };
    const out = runTrial(spec, baseOpts);
    expect(validateAttackOutput(out)).toBe(true);
    expect(out.attack).toBe('slow-poisoner');
  });

  it('produces valid AttackOutput for eclipse', () => {
    const spec: RunnableAttack = {
      id: 'eclipse',
      config: {
        K: 5,
        targetSandboxServerId: 'victim-01',
        eclipseRounds: 10,
        preEclipseTargetTrust: 0.8,
        trustReductionThreshold: 0.3,
      },
    };
    const out = runTrial(spec, baseOpts);
    expect(validateAttackOutput(out)).toBe(true);
    expect(out.attack).toBe('eclipse');
    expect(out.metrics.trustReduction).toBeGreaterThan(0);
  });

  it('respected maxRounds', () => {
    const spec: RunnableAttack = {
      id: 'whitewasher',
      config: { targetTrust: 0.9, cooperativeRounds: 5 },
    };
    const out = runTrial(spec, { ...baseOpts, maxRounds: 3 });
    expect(out.metrics.rounds).toBeLessThanOrEqual(3);
  });
});

describe('runBaseline', () => {
  const trustSeries = Array.from({ length: 200 }, (_, i) =>
    Math.min(0.99, 0.1 + i * 0.01)
  );

  it('produces N trials and a summary', () => {
    const spec: RunnableAttack = {
      id: 'whitewasher',
      config: { targetTrust: 0.9, cooperativeRounds: 5 },
    };
    const { trials, summary } = runBaseline(spec, {
      sandboxId: 'test',
      trustSeries,
      trials: 10,
      testbedVersion: 'v1',
    });
    expect(trials.length).toBe(10);
    expect(summary.N).toBe(10);
    expect(summary.attack).toBe('whitewasher');
    expect(summary.success_rate).toBeGreaterThanOrEqual(0);
    expect(summary.success_rate).toBeLessThanOrEqual(1);
    expect(summary.ci_low).toBeLessThanOrEqual(summary.ci_high);
    expect(summary.per_trial_durations.length).toBe(10);
    // All trials must be valid outputs.
    for (const t of trials) {
      expect(validateAttackOutput(t)).toBe(true);
    }
  });

  it('defaults to DEFAULT_TRIALS when trials omitted', () => {
    const spec: RunnableAttack = {
      id: 'sybil',
      config: { K: 5, compoundRounds: 10, baselineTrust: 0.5 },
    };
    const { trials } = runBaseline(spec, {
      sandboxId: 'test',
      trustSeries,
      testbedVersion: 'v1',
    });
    expect(trials.length).toBe(DEFAULT_TRIALS);
  });
});
