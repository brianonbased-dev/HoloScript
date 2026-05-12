// G.GOLD.013 / G.GOLD.015 — false-case discipline. Sybil §4.2 has fewer
// state transitions than Whitewasher (cross-vouching is continuous), so
// the test surface centers on constructor validation, the §4.2 success
// threshold (1.5 * baseline), and false-case coverage for evaluateSuccess.

import { describe, expect, it } from 'vitest';
import {
  SybilAttack,
  SYBIL_DEFAULT_INFLATION_FACTOR,
  type SybilConfig,
} from '../src/sybil.js';
import type { AttackContext, AttackResult } from '../src/types.js';

function mockContext(trustSeries: number[]): AttackContext {
  let i = 0;
  return {
    observeOwnTrust: () => trustSeries[Math.min(i++, trustSeries.length - 1)] ?? 0,
    trustFormulaSpec: 'mock-paper-1-trust',
    sandboxId: 'test-sandbox-sybil',
  };
}

function makeAttack(overrides: Partial<SybilConfig> = {}): SybilAttack {
  return new SybilAttack({
    K: 5,
    compoundRounds: 10,
    baselineTrust: 0.2,
    ...overrides,
  });
}

describe('SybilAttack — constructor validation', () => {
  it('rejects K < 2 (single-identity is not Sybil)', () => {
    expect(
      () => new SybilAttack({ K: 1, compoundRounds: 10, baselineTrust: 0.2 })
    ).toThrow(RangeError);
    expect(
      () => new SybilAttack({ K: 0, compoundRounds: 10, baselineTrust: 0.2 })
    ).toThrow(RangeError);
    expect(
      () => new SybilAttack({ K: -1, compoundRounds: 10, baselineTrust: 0.2 })
    ).toThrow(RangeError);
  });

  it('accepts spec-defined K values {2, 5, 10}', () => {
    for (const K of [2, 5, 10] as const) {
      expect(
        () => new SybilAttack({ K, compoundRounds: 10, baselineTrust: 0.2 })
      ).not.toThrow();
    }
  });

  it('rejects non-integer K', () => {
    expect(
      () => new SybilAttack({ K: 2.5, compoundRounds: 10, baselineTrust: 0.2 })
    ).toThrow(RangeError);
  });

  it('rejects non-positive-integer compoundRounds', () => {
    expect(
      () => new SybilAttack({ K: 2, compoundRounds: 0, baselineTrust: 0.2 })
    ).toThrow(RangeError);
    expect(
      () => new SybilAttack({ K: 2, compoundRounds: 1.5, baselineTrust: 0.2 })
    ).toThrow(RangeError);
  });

  it('rejects baselineTrust <= 0 (success threshold would degenerate)', () => {
    expect(
      () => new SybilAttack({ K: 2, compoundRounds: 10, baselineTrust: 0 })
    ).toThrow(RangeError);
    expect(
      () => new SybilAttack({ K: 2, compoundRounds: 10, baselineTrust: -0.1 })
    ).toThrow(RangeError);
  });

  it('rejects non-positive successInflationFactor when provided', () => {
    expect(
      () =>
        new SybilAttack({
          K: 2,
          compoundRounds: 10,
          baselineTrust: 0.2,
          successInflationFactor: 0,
        })
    ).toThrow(RangeError);
    expect(
      () =>
        new SybilAttack({
          K: 2,
          compoundRounds: 10,
          baselineTrust: 0.2,
          successInflationFactor: -1,
        })
    ).toThrow(RangeError);
  });
});

describe('SybilAttack — default inflation factor matches §4.2 spec', () => {
  it('exports default = 1.5 per spec', () => {
    expect(SYBIL_DEFAULT_INFLATION_FACTOR).toBe(1.5);
  });
});

describe('SybilAttack.step — cross-vouching every round (§4.2 step 2)', () => {
  it('emits phase=cross-vouching and records (K-1) vouches per round', () => {
    const attack = makeAttack({ K: 5 });
    const ctx = mockContext([0.2, 0.3, 0.4]);
    const r1 = attack.step(ctx, 1);
    expect(r1.notes).toBe('phase=cross-vouching, vouches=4');
    expect(r1.attackId).toBe('sybil');
    expect(r1.outputAccepted).toBe(true);
  });

  it('records trustAtAttack from context.observeOwnTrust() per round', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.2, 0.4, 0.6]);
    expect(attack.step(ctx, 1).trustAtAttack).toBe(0.2);
    expect(attack.step(ctx, 2).trustAtAttack).toBe(0.4);
    expect(attack.step(ctx, 3).trustAtAttack).toBe(0.6);
  });

  it('observedSuccessMetric flips when trust crosses 1.5 * baseline threshold', () => {
    // baselineTrust=0.2, default factor 1.5 → threshold = 0.3
    const attack = makeAttack({ K: 2, baselineTrust: 0.2 });
    const ctx = mockContext([0.25, 0.3, 0.31]); // below, at, above
    const r1 = attack.step(ctx, 1);
    const r2 = attack.step(ctx, 2);
    const r3 = attack.step(ctx, 3);
    // strict > threshold per spec ("> 1.5 * baseline" — exact equality is not success)
    expect(r1.observedSuccessMetric).toBe(false); // 0.25 <= 0.3
    expect(r2.observedSuccessMetric).toBe(false); // 0.3 not strictly > 0.3
    expect(r3.observedSuccessMetric).toBe(true); // 0.31 > 0.3
  });

  it('honors custom successInflationFactor', () => {
    // factor=2.0, baseline=0.2 → threshold = 0.4
    const attack = makeAttack({ K: 2, baselineTrust: 0.2, successInflationFactor: 2.0 });
    const ctx = mockContext([0.35, 0.45]);
    expect(attack.step(ctx, 1).observedSuccessMetric).toBe(false); // 0.35 < 0.4
    expect(attack.step(ctx, 2).observedSuccessMetric).toBe(true); // 0.45 > 0.4
  });

  it('K=2 emits 1 vouch (the other server); K=10 emits 9 vouches', () => {
    const attackK2 = new SybilAttack({ K: 2, compoundRounds: 10, baselineTrust: 0.2 });
    const attackK10 = new SybilAttack({ K: 10, compoundRounds: 10, baselineTrust: 0.2 });
    const ctx = mockContext([0.2]);
    expect(attackK2.step(ctx, 1).notes).toBe('phase=cross-vouching, vouches=1');
    expect(attackK10.step(mockContext([0.2]), 1).notes).toBe(
      'phase=cross-vouching, vouches=9'
    );
  });

  it('rejects non-positive-integer round', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.2]);
    expect(() => attack.step(ctx, 0)).toThrow(RangeError);
    expect(() => attack.step(ctx, -1)).toThrow(RangeError);
    expect(() => attack.step(ctx, 1.5)).toThrow(RangeError);
  });
});

describe('SybilAttack.evaluateSuccess — §4.2 success metric', () => {
  // success := T(s_i) > 1.5 * baseline

  it('TRUE case: at least one round above threshold', () => {
    const attack = makeAttack({ K: 5, baselineTrust: 0.2 }); // threshold 0.3
    const ctx = mockContext([0.2, 0.25, 0.35, 0.32]); // round 3 crosses
    const history = [
      attack.step(ctx, 1),
      attack.step(ctx, 2),
      attack.step(ctx, 3),
      attack.step(ctx, 4),
    ];
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: empty history (G.GOLD.013)', () => {
    expect(makeAttack().evaluateSuccess([])).toBe(false);
  });

  it('FALSE case: all rounds at-or-below threshold', () => {
    const attack = makeAttack({ K: 2, baselineTrust: 0.2 }); // threshold 0.3
    const ctx = mockContext([0.2, 0.25, 0.3]); // exactly at threshold — NOT strictly >
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: history contains only other attacks (cross-attack contamination)', () => {
    const attack = makeAttack({ K: 2, baselineTrust: 0.2 });
    const history: AttackResult[] = [
      {
        attackId: 'whitewasher',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.95, // would clear the threshold if it were ours
        observedSuccessMetric: true,
        notes: 'phase=exploit',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('TRUE case: history mixes Sybil + other attacks, our row clears threshold', () => {
    const attack = makeAttack({ K: 5, baselineTrust: 0.2 }); // threshold 0.3
    const history: AttackResult[] = [
      {
        attackId: 'whitewasher',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.99,
        observedSuccessMetric: true,
        notes: 'phase=exploit',
      },
      {
        attackId: 'sybil',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.35,
        observedSuccessMetric: true,
        notes: 'phase=cross-vouching, vouches=4',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: custom inflation factor raises the bar above observed max', () => {
    const attack = makeAttack({
      K: 2,
      baselineTrust: 0.2,
      successInflationFactor: 3.0, // threshold 0.6
    });
    const ctx = mockContext([0.4, 0.5, 0.55]); // never reaches 0.6
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });
});
