// G.GOLD.013 / G.GOLD.015 — false-case discipline. Eclipse §4.5 success is
// measured at the LAST round after `eclipseRounds` of compound eclipsing,
// strict < threshold. Tests verify the context-interface reinterpretation
// (observeOwnTrust returns the TARGET's trust, not the attacker's).

import { describe, expect, it } from 'vitest';
import {
  EclipseAttack,
  ECLIPSE_DEFAULT_TRUST_REDUCTION_THRESHOLD,
  type EclipseConfig,
} from '../src/eclipse.js';
import type { AttackContext, AttackResult } from '../src/types.js';

function mockTargetTrustContext(targetTrustSeries: number[]): AttackContext {
  let i = 0;
  return {
    // Reinterpreted per Eclipse: returns TARGET's trust, not attacker's own.
    observeOwnTrust: () =>
      targetTrustSeries[Math.min(i++, targetTrustSeries.length - 1)] ?? 0,
    trustFormulaSpec: 'mock-paper-1-trust',
    sandboxId: 'test-sandbox-eclipse',
  };
}

function makeAttack(overrides: Partial<EclipseConfig> = {}): EclipseAttack {
  return new EclipseAttack({
    K: 3,
    targetSandboxServerId: 'sandbox-target-001',
    eclipseRounds: 10,
    preEclipseTargetTrust: 0.8,
    ...overrides,
  });
}

describe('EclipseAttack — constructor validation', () => {
  it('rejects K < 2 (single intermediate is MITM, not eclipse)', () => {
    expect(() => makeAttack({ K: 1 })).toThrow(RangeError);
    expect(() => makeAttack({ K: 0 })).toThrow(RangeError);
  });

  it('rejects non-integer K', () => {
    expect(() => makeAttack({ K: 2.5 })).toThrow(RangeError);
  });

  it('rejects empty targetSandboxServerId', () => {
    expect(() => makeAttack({ targetSandboxServerId: '' })).toThrow(RangeError);
    expect(() => makeAttack({ targetSandboxServerId: '   ' })).toThrow(RangeError);
  });

  it('rejects non-positive-integer eclipseRounds', () => {
    expect(() => makeAttack({ eclipseRounds: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ eclipseRounds: -1 })).toThrow(RangeError);
    expect(() => makeAttack({ eclipseRounds: 1.5 })).toThrow(RangeError);
  });

  it('rejects preEclipseTargetTrust <= 0', () => {
    expect(() => makeAttack({ preEclipseTargetTrust: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ preEclipseTargetTrust: -0.1 })).toThrow(RangeError);
  });

  it('rejects trustReductionThreshold outside (0, 1) when provided', () => {
    expect(() => makeAttack({ trustReductionThreshold: 0 })).toThrow(RangeError);
    expect(() => makeAttack({ trustReductionThreshold: 1 })).toThrow(RangeError);
    expect(() => makeAttack({ trustReductionThreshold: -0.1 })).toThrow(RangeError);
    expect(() => makeAttack({ trustReductionThreshold: 1.5 })).toThrow(RangeError);
  });
});

describe('EclipseAttack — spec defaults', () => {
  it('exports default trustReductionThreshold = 0.3 per §4.5', () => {
    expect(ECLIPSE_DEFAULT_TRUST_REDUCTION_THRESHOLD).toBe(0.3);
  });
});

describe('EclipseAttack.step — eclipsing every round (§4.5)', () => {
  it('emits phase=eclipsing with target id and K in notes', () => {
    const attack = makeAttack({ K: 5, targetSandboxServerId: 'srv-A' });
    const ctx = mockTargetTrustContext([0.7]);
    const r = attack.step(ctx, 1);
    expect(r.notes).toBe('phase=eclipsing, target=srv-A, K=5');
    expect(r.attackId).toBe('eclipse');
    expect(r.outputAccepted).toBe(true);
  });

  it('records target trust (not attacker trust) in trustAtAttack', () => {
    // Per the CONTEXT INTERFACE NOTE in eclipse.ts: observeOwnTrust returns
    // the TARGET's trust, reinterpreted at the testbed wiring layer.
    const attack = makeAttack({ preEclipseTargetTrust: 0.8 });
    const ctx = mockTargetTrustContext([0.7, 0.5, 0.2]);
    expect(attack.step(ctx, 1).trustAtAttack).toBe(0.7);
    expect(attack.step(ctx, 2).trustAtAttack).toBe(0.5);
    expect(attack.step(ctx, 3).trustAtAttack).toBe(0.2);
  });

  it('observedSuccessMetric flips when target trust crosses below 0.3 * baseline', () => {
    // baseline 0.8, default factor 0.3 → ceiling = 0.24. Strict < per spec.
    const attack = makeAttack({ preEclipseTargetTrust: 0.8 });
    const ctx = mockTargetTrustContext([0.5, 0.24, 0.23]);
    expect(attack.step(ctx, 1).observedSuccessMetric).toBe(false); // 0.5 not < 0.24
    expect(attack.step(ctx, 2).observedSuccessMetric).toBe(false); // 0.24 not strictly < 0.24
    expect(attack.step(ctx, 3).observedSuccessMetric).toBe(true); // 0.23 < 0.24
  });

  it('honors custom trustReductionThreshold', () => {
    // factor 0.5, baseline 0.8 → ceiling 0.4
    const attack = makeAttack({
      preEclipseTargetTrust: 0.8,
      trustReductionThreshold: 0.5,
    });
    const ctx = mockTargetTrustContext([0.45, 0.4, 0.39]);
    expect(attack.step(ctx, 1).observedSuccessMetric).toBe(false);
    expect(attack.step(ctx, 2).observedSuccessMetric).toBe(false); // not strictly <
    expect(attack.step(ctx, 3).observedSuccessMetric).toBe(true);
  });

  it('rejects non-positive-integer round', () => {
    const attack = makeAttack();
    const ctx = mockTargetTrustContext([0.5]);
    expect(() => attack.step(ctx, 0)).toThrow(RangeError);
    expect(() => attack.step(ctx, -1)).toThrow(RangeError);
    expect(() => attack.step(ctx, 1.5)).toThrow(RangeError);
  });
});

describe('EclipseAttack.evaluateSuccess — §4.5 final-round metric', () => {
  // success := T(target) < 0.3 * T(target)_pre_eclipse  AT THE LAST ROUND
  //         (after eclipseRounds of compound eclipsing)

  it('TRUE case: last round trust < ceiling, eclipseRounds met', () => {
    // baseline 0.8, ceiling 0.24, eclipseRounds 5
    const attack = makeAttack({
      eclipseRounds: 5,
      preEclipseTargetTrust: 0.8,
    });
    const ctx = mockTargetTrustContext([0.6, 0.5, 0.4, 0.3, 0.2]);
    const history: AttackResult[] = [];
    for (let r = 1; r <= 5; r++) {
      history.push(attack.step(ctx, r));
    }
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: empty history (G.GOLD.013)', () => {
    expect(makeAttack().evaluateSuccess([])).toBe(false);
  });

  it('FALSE case: fewer rounds than eclipseRounds (premature)', () => {
    const attack = makeAttack({ eclipseRounds: 10, preEclipseTargetTrust: 0.8 });
    // Only 4 rounds — below eclipseRounds=10
    const ctx = mockTargetTrustContext([0.1, 0.1, 0.1, 0.1]); // already deep below
    const history: AttackResult[] = [
      attack.step(ctx, 1),
      attack.step(ctx, 2),
      attack.step(ctx, 3),
      attack.step(ctx, 4),
    ];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: eclipseRounds met but last round trust at ceiling (strict <)', () => {
    // baseline 0.8, ceiling exactly 0.24 — not strictly <
    const attack = makeAttack({
      eclipseRounds: 5,
      preEclipseTargetTrust: 0.8,
    });
    const ctx = mockTargetTrustContext([0.6, 0.5, 0.4, 0.3, 0.24]);
    const history: AttackResult[] = [];
    for (let r = 1; r <= 5; r++) {
      history.push(attack.step(ctx, r));
    }
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: trust dipped low mid-history but recovered (last round above ceiling)', () => {
    // §4.5 measures at the LAST round, not the minimum. A defense that
    // restored trust mid-attack flips success OFF.
    const attack = makeAttack({
      eclipseRounds: 5,
      preEclipseTargetTrust: 0.8,
    });
    const ctx = mockTargetTrustContext([0.5, 0.3, 0.2, 0.4, 0.6]); // recovers
    const history: AttackResult[] = [];
    for (let r = 1; r <= 5; r++) {
      history.push(attack.step(ctx, r));
    }
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: cross-attack contamination only', () => {
    const attack = makeAttack({ eclipseRounds: 5 });
    const history: AttackResult[] = Array(5)
      .fill(0)
      .map((_, i) => ({
        attackId: 'whitewasher' as const,
        round: i + 1,
        outputAccepted: true,
        trustAtAttack: 0.05, // trust very low — but wrong attack
        observedSuccessMetric: true,
        notes: 'phase=cooperative',
      }));
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('TRUE case: mixed history with our last row clearing the ceiling', () => {
    const attack = makeAttack({
      eclipseRounds: 3,
      preEclipseTargetTrust: 0.8, // ceiling 0.24
    });
    const history: AttackResult[] = [
      {
        attackId: 'sybil',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.95,
        observedSuccessMetric: true,
        notes: 'phase=cross-vouching, vouches=4',
      },
      {
        attackId: 'eclipse',
        round: 1,
        outputAccepted: true,
        trustAtAttack: 0.6,
        observedSuccessMetric: false,
        notes: 'phase=eclipsing, target=srv, K=3',
      },
      {
        attackId: 'eclipse',
        round: 2,
        outputAccepted: true,
        trustAtAttack: 0.4,
        observedSuccessMetric: false,
        notes: 'phase=eclipsing, target=srv, K=3',
      },
      {
        attackId: 'eclipse',
        round: 3,
        outputAccepted: true,
        trustAtAttack: 0.2, // < 0.24 ceiling
        observedSuccessMetric: true,
        notes: 'phase=eclipsing, target=srv, K=3',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: high preEclipseTargetTrust raises the ceiling above observed minimum', () => {
    // baseline 0.99, ceiling 0.297. Observed lowest 0.3 — NOT < 0.297.
    const attack = makeAttack({
      eclipseRounds: 5,
      preEclipseTargetTrust: 0.99,
    });
    const ctx = mockTargetTrustContext([0.6, 0.5, 0.4, 0.35, 0.3]);
    const history: AttackResult[] = [];
    for (let r = 1; r <= 5; r++) {
      history.push(attack.step(ctx, r));
    }
    expect(attack.evaluateSuccess(history)).toBe(false);
  });
});
