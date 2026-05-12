// G.GOLD.013 / G.GOLD.015 — false-case discipline. Score Manipulator §4.4
// has a TWO-PART success metric (high trust AND decoupled utility), so the
// false-case surface includes both "high trust but utility OK" and
// "decoupled utility but trust low" branches.

import { describe, expect, it } from 'vitest';
import {
  ScoreManipulatorAttack,
  SCORE_MANIP_DEFAULT_TARGET_TRUST,
  SCORE_MANIP_DEFAULT_UTILITY_DECOUPLING_THRESHOLD,
  type ScoreManipulatorConfig,
} from '../src/score-manipulator.js';
import type { AttackContext, AttackResult } from '../src/types.js';

function mockContext(trustSeries: number[]): AttackContext {
  let i = 0;
  return {
    observeOwnTrust: () => trustSeries[Math.min(i++, trustSeries.length - 1)] ?? 0,
    trustFormulaSpec: 'mock-paper-1-trust',
    sandboxId: 'test-sandbox-score-manip',
  };
}

function makeAttack(
  overrides: Partial<ScoreManipulatorConfig> = {}
): ScoreManipulatorAttack {
  return new ScoreManipulatorAttack({
    trustMaxOutputRef: 'v1-test-derivation',
    targetTrust: 0.95,
    outputUtilityRatio: 0.2, // 20% of legit utility — well decoupled
    baselineUtility: 1.0,
    ...overrides,
  });
}

describe('ScoreManipulatorAttack — constructor validation', () => {
  it('rejects targetTrust outside (0, 1)', () => {
    expect(() => makeAttack({ targetTrust: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ targetTrust: 1 })).toThrow(RangeError);
    expect(() => makeAttack({ targetTrust: -0.1 })).toThrow(RangeError);
    expect(() => makeAttack({ targetTrust: 1.5 })).toThrow(RangeError);
  });

  it('rejects empty trustMaxOutputRef', () => {
    expect(() => makeAttack({ trustMaxOutputRef: '' })).toThrow(RangeError);
    expect(() => makeAttack({ trustMaxOutputRef: '   ' })).toThrow(RangeError);
  });

  it('rejects negative or non-finite outputUtilityRatio', () => {
    expect(() => makeAttack({ outputUtilityRatio: -0.1 })).toThrow(RangeError);
    expect(() => makeAttack({ outputUtilityRatio: Number.NaN })).toThrow(RangeError);
    expect(() => makeAttack({ outputUtilityRatio: Number.POSITIVE_INFINITY })).toThrow(
      RangeError
    );
  });

  it('accepts outputUtilityRatio of 0 (zero utility — extreme Goodhart)', () => {
    expect(() => makeAttack({ outputUtilityRatio: 0 })).not.toThrow();
  });

  it('rejects baselineUtility <= 0', () => {
    expect(() => makeAttack({ baselineUtility: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ baselineUtility: -1 })).toThrow(RangeError);
  });

  it('rejects non-positive utilityDecouplingThreshold when provided', () => {
    expect(() => makeAttack({ utilityDecouplingThreshold: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ utilityDecouplingThreshold: -0.5 })).toThrow(RangeError);
  });
});

describe('ScoreManipulatorAttack — spec defaults', () => {
  it('exports default targetTrust = 0.95 per §4.4 spec', () => {
    expect(SCORE_MANIP_DEFAULT_TARGET_TRUST).toBe(0.95);
  });

  it('exports default utilityDecouplingThreshold = 0.5 per §4.4 spec', () => {
    expect(SCORE_MANIP_DEFAULT_UTILITY_DECOUPLING_THRESHOLD).toBe(0.5);
  });
});

describe('ScoreManipulatorAttack.step — phase=score-max every round (§4.4 step 2)', () => {
  it('emits phase=score-max with provenance ref + utility in notes', () => {
    const attack = makeAttack({
      trustMaxOutputRef: 'monte-carlo-N1000',
      outputUtilityRatio: 0.3,
      baselineUtility: 2.0,
    });
    const ctx = mockContext([0.95]);
    const r = attack.step(ctx, 1);
    expect(r.notes).toBe('phase=score-max, ref=monte-carlo-N1000, utility=0.6');
    expect(r.attackId).toBe('score-manipulator');
    expect(r.outputAccepted).toBe(true);
  });

  it('records trustAtAttack from context.observeOwnTrust() per round', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.5, 0.85, 0.96]);
    expect(attack.step(ctx, 1).trustAtAttack).toBe(0.5);
    expect(attack.step(ctx, 2).trustAtAttack).toBe(0.85);
    expect(attack.step(ctx, 3).trustAtAttack).toBe(0.96);
  });

  it('observedSuccessMetric requires BOTH trust >= target AND utility < threshold', () => {
    // Both conditions met
    const wellConfigured = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.2,
      baselineUtility: 1.0,
    });
    expect(wellConfigured.step(mockContext([0.96]), 1).observedSuccessMetric).toBe(
      true
    );

    // Trust met, utility NOT decoupled (utility ratio above threshold)
    const utilityFail = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.7, // > 0.5 default threshold
      baselineUtility: 1.0,
    });
    expect(utilityFail.step(mockContext([0.96]), 1).observedSuccessMetric).toBe(false);

    // Utility decoupled, trust NOT met
    const trustFail = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.2,
      baselineUtility: 1.0,
    });
    expect(trustFail.step(mockContext([0.5]), 1).observedSuccessMetric).toBe(false);

    // Neither met
    expect(utilityFail.step(mockContext([0.5]), 1).observedSuccessMetric).toBe(false);
  });

  it('strict-< on utility decoupling (equality is NOT decoupled)', () => {
    // utility = 0.5, threshold = 0.5 * baseline = 0.5 → NOT strictly <
    const attack = makeAttack({
      outputUtilityRatio: 0.5,
      baselineUtility: 1.0,
    });
    expect(attack.step(mockContext([0.96]), 1).observedSuccessMetric).toBe(false);
  });

  it('honors custom utilityDecouplingThreshold', () => {
    // Custom threshold 0.3 → utility must be < 0.3 * baseline = 0.3
    const tighter = makeAttack({
      outputUtilityRatio: 0.4,
      baselineUtility: 1.0,
      utilityDecouplingThreshold: 0.3,
    });
    // 0.4 NOT < 0.3 — fails
    expect(tighter.step(mockContext([0.96]), 1).observedSuccessMetric).toBe(false);

    const looser = makeAttack({
      outputUtilityRatio: 0.4,
      baselineUtility: 1.0,
      utilityDecouplingThreshold: 0.5,
    });
    // 0.4 < 0.5 — passes
    expect(looser.step(mockContext([0.96]), 1).observedSuccessMetric).toBe(true);
  });

  it('rejects non-positive-integer round', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.95]);
    expect(() => attack.step(ctx, 0)).toThrow(RangeError);
    expect(() => attack.step(ctx, -1)).toThrow(RangeError);
    expect(() => attack.step(ctx, 1.5)).toThrow(RangeError);
  });
});

describe('ScoreManipulatorAttack.evaluateSuccess — §4.4 two-part metric', () => {
  // success := T(s) >= 0.95 AND consumer_utility < 0.5 * baseline

  it('TRUE case: at least one round at target trust with utility decoupled', () => {
    const attack = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.2,
      baselineUtility: 1.0,
    });
    const ctx = mockContext([0.5, 0.85, 0.96]);
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: empty history (G.GOLD.013)', () => {
    expect(makeAttack().evaluateSuccess([])).toBe(false);
  });

  it('FALSE case: all rounds below target trust (utility OK)', () => {
    const attack = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.2,
    });
    const ctx = mockContext([0.5, 0.85, 0.94]); // never reaches 0.95
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: utility config fails decoupling — attack as configured cannot succeed', () => {
    // High trust, but configured utility doesn't beat the threshold.
    // The attack as-configured can NEVER succeed regardless of trust history.
    const attack = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.7, // > 0.5 default threshold
      baselineUtility: 1.0,
    });
    const ctx = mockContext([0.96, 0.97, 0.98]); // trust very high
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: cross-attack contamination only', () => {
    const attack = makeAttack();
    const history: AttackResult[] = [
      {
        attackId: 'whitewasher',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.99,
        observedSuccessMetric: true,
        notes: 'phase=exploit',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('TRUE case: mixed history with our row clearing both bars', () => {
    const attack = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0.2,
      baselineUtility: 1.0,
    });
    const history: AttackResult[] = [
      {
        attackId: 'sybil',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.99,
        observedSuccessMetric: true,
        notes: 'phase=cross-vouching, vouches=4',
      },
      {
        attackId: 'score-manipulator',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.96,
        observedSuccessMetric: true,
        notes: 'phase=score-max, ref=v1-test-derivation, utility=0.2',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: zero-utility extreme but trust below target', () => {
    // Edge case: outputUtilityRatio=0 (perfect utility decoupling), but
    // trust never reaches target → still failure.
    const attack = makeAttack({
      targetTrust: 0.95,
      outputUtilityRatio: 0,
      baselineUtility: 1.0,
    });
    const ctx = mockContext([0.5, 0.7, 0.9]);
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });
});
