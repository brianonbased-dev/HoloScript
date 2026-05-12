// G.GOLD.013 / G.GOLD.015 — false-case discipline. Slow Poisoner §4.3
// has a TWO-PART aggregate success metric (aggregate bias > threshold AND
// trust retained vs round-0). Tests use a low evaluationRounds override
// (the spec default 1000 is excessive for unit tests) but verify the
// default export matches the §4.3 spec value.

import { describe, expect, it } from 'vitest';
import {
  SlowPoisonerAttack,
  SLOW_POISONER_DEFAULT_EVALUATION_ROUNDS,
  type SlowPoisonerConfig,
} from '../src/slow-poisoner.js';
import type { AttackContext, AttackResult } from '../src/types.js';

function mockContext(trustSeries: number[]): AttackContext {
  let i = 0;
  return {
    observeOwnTrust: () => trustSeries[Math.min(i++, trustSeries.length - 1)] ?? 0,
    trustFormulaSpec: 'mock-paper-1-trust',
    sandboxId: 'test-sandbox-slow-poisoner',
  };
}

function makeAttack(overrides: Partial<SlowPoisonerConfig> = {}): SlowPoisonerAttack {
  return new SlowPoisonerAttack({
    biasPerCall: 0.01,
    aggregateBiasThreshold: 0.2,
    evaluationRounds: 30, // low for unit tests; production uses default 1000
    ...overrides,
  });
}

// Helper: run N rounds against a context that returns the same trust each round.
function runRounds(
  attack: SlowPoisonerAttack,
  trustValue: number,
  rounds: number
): AttackResult[] {
  const ctx = mockContext(Array(rounds).fill(trustValue));
  const history: AttackResult[] = [];
  for (let r = 1; r <= rounds; r++) {
    history.push(attack.step(ctx, r));
  }
  return history;
}

describe('SlowPoisonerAttack — constructor validation', () => {
  it('rejects biasPerCall <= 0', () => {
    expect(() => makeAttack({ biasPerCall: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ biasPerCall: -0.01 })).toThrow(RangeError);
  });

  it('rejects non-finite biasPerCall', () => {
    expect(() => makeAttack({ biasPerCall: Number.NaN })).toThrow(RangeError);
    expect(() => makeAttack({ biasPerCall: Number.POSITIVE_INFINITY })).toThrow(
      RangeError
    );
  });

  it('rejects aggregateBiasThreshold <= 0', () => {
    expect(() => makeAttack({ aggregateBiasThreshold: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ aggregateBiasThreshold: -1 })).toThrow(RangeError);
  });

  it('rejects non-integer evaluationRounds', () => {
    expect(() => makeAttack({ evaluationRounds: 1.5 })).toThrow(RangeError);
    expect(() => makeAttack({ evaluationRounds: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ evaluationRounds: -10 })).toThrow(RangeError);
  });

  it('accepts undefined evaluationRounds (default applies)', () => {
    expect(
      () =>
        new SlowPoisonerAttack({
          biasPerCall: 0.01,
          aggregateBiasThreshold: 0.2,
        })
    ).not.toThrow();
  });
});

describe('SlowPoisonerAttack — spec defaults', () => {
  it('exports default evaluationRounds = 1000 per §4.3 measurement plan', () => {
    expect(SLOW_POISONER_DEFAULT_EVALUATION_ROUNDS).toBe(1000);
  });
});

describe('SlowPoisonerAttack.step — continuous poisoning every round (§4.3)', () => {
  it('emits phase=poisoning with constant bias in notes', () => {
    const attack = makeAttack({ biasPerCall: 0.005 });
    const ctx = mockContext([0.7, 0.7, 0.7]);
    const r1 = attack.step(ctx, 1);
    const r2 = attack.step(ctx, 2);
    expect(r1.notes).toBe('phase=poisoning, bias=0.005');
    expect(r2.notes).toBe('phase=poisoning, bias=0.005');
  });

  it('outputAccepted=true (bias subtle enough to pass per-call checks)', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.7]);
    expect(attack.step(ctx, 1).outputAccepted).toBe(true);
  });

  it('observedSuccessMetric=false PER ROUND (§4.3 success is aggregate)', () => {
    // Even with a high bias and high trust, single-round success metric
    // is meaningless for §4.3 — only the aggregate evaluator decides.
    const attack = makeAttack({ biasPerCall: 100 });
    const ctx = mockContext([0.99]);
    expect(attack.step(ctx, 1).observedSuccessMetric).toBe(false);
  });

  it('records trustAtAttack from context.observeOwnTrust() per round', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.7, 0.75, 0.8]);
    expect(attack.step(ctx, 1).trustAtAttack).toBe(0.7);
    expect(attack.step(ctx, 2).trustAtAttack).toBe(0.75);
    expect(attack.step(ctx, 3).trustAtAttack).toBe(0.8);
  });

  it('rejects non-positive-integer round', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.7]);
    expect(() => attack.step(ctx, 0)).toThrow(RangeError);
    expect(() => attack.step(ctx, -1)).toThrow(RangeError);
    expect(() => attack.step(ctx, 1.5)).toThrow(RangeError);
  });
});

describe('SlowPoisonerAttack.evaluateSuccess — §4.3 two-part aggregate metric', () => {
  // success := aggregate_bias_after_N_rounds > delta_acceptable
  //          AND T(s) >= T(s)_at_round_0

  it('TRUE case: aggregate beats threshold + trust retained', () => {
    // 30 rounds × 0.01 bias = 0.3 aggregate, threshold 0.2 → > threshold ✓
    // Trust constant at 0.7 → trust retained ✓
    const attack = makeAttack({
      biasPerCall: 0.01,
      aggregateBiasThreshold: 0.2,
      evaluationRounds: 30,
    });
    const history = runRounds(attack, 0.7, 30);
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: empty history (G.GOLD.013)', () => {
    expect(makeAttack().evaluateSuccess([])).toBe(false);
  });

  it('FALSE case: fewer than evaluationRounds samples (aggregate undefined)', () => {
    const attack = makeAttack({ evaluationRounds: 30 });
    const history = runRounds(attack, 0.7, 29); // one short
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: aggregate bias exactly at threshold (strict > per spec)', () => {
    // 30 × 0.01 = 0.3, threshold 0.3 → NOT > 0.3
    const attack = makeAttack({
      biasPerCall: 0.01,
      aggregateBiasThreshold: 0.3,
      evaluationRounds: 30,
    });
    const history = runRounds(attack, 0.7, 30);
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: aggregate beats threshold but trust DROPPED (defense detected)', () => {
    // 30 × 0.01 = 0.3 > 0.2 ✓ but trust dropped from 0.7 → 0.4 (canary defense
    // working — bias detected, trust penalized).
    const attack = makeAttack({
      biasPerCall: 0.01,
      aggregateBiasThreshold: 0.2,
      evaluationRounds: 5,
    });
    const trustSeries = [0.7, 0.65, 0.55, 0.5, 0.4]; // declining
    const ctx = mockContext(trustSeries);
    const history: AttackResult[] = [];
    for (let r = 1; r <= 5; r++) {
      history.push(attack.step(ctx, r));
    }
    expect(history[0].trustAtAttack).toBe(0.7);
    expect(history[4].trustAtAttack).toBe(0.4);
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('TRUE case: trust returns to exactly initial value (>= boundary, not strict >)', () => {
    // First 0.7, dips, returns to 0.7 by last round → 0.7 >= 0.7 (eligible)
    const attack = makeAttack({
      biasPerCall: 0.05,
      aggregateBiasThreshold: 0.1,
      evaluationRounds: 5,
    });
    const ctx = mockContext([0.7, 0.65, 0.65, 0.68, 0.7]);
    const history: AttackResult[] = [];
    for (let r = 1; r <= 5; r++) {
      history.push(attack.step(ctx, r));
    }
    // 5 × 0.05 = 0.25 > 0.1 ✓; lastTrust 0.7 >= firstTrust 0.7 ✓
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: cross-attack contamination — own rounds insufficient', () => {
    const attack = makeAttack({ evaluationRounds: 30 });
    const history: AttackResult[] = Array(30)
      .fill(0)
      .map((_, i) => ({
        attackId: 'whitewasher' as const,
        round: i + 1,
        outputAccepted: true,
        trustAtAttack: 0.99,
        observedSuccessMetric: true,
        notes: 'phase=cooperative',
      }));
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('TRUE case: mixed history with our 30 rounds qualifying alongside other attacks', () => {
    const attack = makeAttack({
      biasPerCall: 0.01,
      aggregateBiasThreshold: 0.2,
      evaluationRounds: 30,
    });
    const ourHistory = runRounds(attack, 0.7, 30);
    // Reset attack state — re-create for the mixed-history check (the
    // step() outputs above are what we're checking; evaluateSuccess
    // doesn't care about internal state, just the history rows).
    const mixedHistory: AttackResult[] = [
      {
        attackId: 'sybil',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.95,
        observedSuccessMetric: true,
        notes: 'phase=cross-vouching, vouches=4',
      },
      ...ourHistory,
      {
        attackId: 'eclipse',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.1,
        observedSuccessMetric: false,
        notes: 'phase=eclipse',
      },
    ];
    expect(attack.evaluateSuccess(mixedHistory)).toBe(true);
  });

  it('FALSE case: high biasPerCall but very low evaluation count via filter', () => {
    // Even with high bias, if our filtered ownRounds count is below
    // evaluationRounds the evaluator refuses (aggregate undefined per spec).
    const attack = makeAttack({
      biasPerCall: 1.0, // huge bias
      aggregateBiasThreshold: 0.5,
      evaluationRounds: 30,
    });
    const history = runRounds(attack, 0.7, 5); // only 5 rounds
    expect(attack.evaluateSuccess(history)).toBe(false);
  });
});
