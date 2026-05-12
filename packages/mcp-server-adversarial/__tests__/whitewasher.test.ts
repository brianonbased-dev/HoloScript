// G.GOLD.013 / G.GOLD.015 — false-case discipline + tests optimize for
// experienced failure categories. Whitewasher §4.1 has multiple failure
// modes for the success metric: missing exploit row, exploit-but-rejected,
// exploit-but-trust-below-target. Each gets a test.

import { describe, expect, it } from 'vitest';
import {
  WhitewasherAttack,
  type WhitewasherConfig,
} from '../src/whitewasher.js';
import type { AttackContext, AttackResult } from '../src/types.js';

function mockContext(trustSeries: number[]): AttackContext {
  let i = 0;
  return {
    observeOwnTrust: () => trustSeries[Math.min(i++, trustSeries.length - 1)] ?? 0,
    trustFormulaSpec: 'mock-paper-1-trust',
    sandboxId: 'test-sandbox-whitewasher',
  };
}

function makeAttack(overrides: Partial<WhitewasherConfig> = {}): WhitewasherAttack {
  return new WhitewasherAttack({
    targetTrust: 0.9,
    cooperativeRounds: 5,
    continueCooperativePostExploit: false,
    ...overrides,
  });
}

describe('WhitewasherAttack — constructor validation', () => {
  it('rejects targetTrust <= 0', () => {
    expect(() => new WhitewasherAttack({ targetTrust: 0, cooperativeRounds: 5 })).toThrow(
      RangeError
    );
    expect(() => new WhitewasherAttack({ targetTrust: -0.1, cooperativeRounds: 5 })).toThrow(
      RangeError
    );
  });

  it('rejects targetTrust >= 1', () => {
    expect(() => new WhitewasherAttack({ targetTrust: 1, cooperativeRounds: 5 })).toThrow(
      RangeError
    );
    expect(() => new WhitewasherAttack({ targetTrust: 1.5, cooperativeRounds: 5 })).toThrow(
      RangeError
    );
  });

  it('rejects non-positive-integer cooperativeRounds', () => {
    expect(() => new WhitewasherAttack({ targetTrust: 0.9, cooperativeRounds: 0 })).toThrow(
      RangeError
    );
    expect(() => new WhitewasherAttack({ targetTrust: 0.9, cooperativeRounds: -1 })).toThrow(
      RangeError
    );
    expect(() => new WhitewasherAttack({ targetTrust: 0.9, cooperativeRounds: 1.5 })).toThrow(
      RangeError
    );
  });
});

describe('WhitewasherAttack.step — phase transitions (§4.1 state machine)', () => {
  it('emits cooperative for rounds 1..N even when trust already >= target', () => {
    // §4.1 step 1: "For rounds 1..N, respond ... cooperative phase."
    // Trust already at target should NOT cause exploit before round > N.
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 5 });
    const ctx = mockContext([0.95, 0.95, 0.95, 0.95, 0.95]);
    for (let r = 1; r <= 5; r++) {
      const result = attack.step(ctx, r);
      expect(result.notes).toBe('phase=cooperative');
      expect(result.observedSuccessMetric).toBe(false);
    }
    expect(attack.state.hasExploited).toBe(false);
  });

  it('stays cooperative past round N when trust < targetTrust (waits for T_target)', () => {
    // §4.1 step 2: "Monitor own T score ... until T(s) >= T_target."
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 3 });
    const ctx = mockContext([0.5, 0.6, 0.7, 0.8, 0.85]); // never reaches 0.9
    for (let r = 1; r <= 5; r++) {
      const result = attack.step(ctx, r);
      expect(result.notes).toBe('phase=cooperative');
    }
    expect(attack.state.hasExploited).toBe(false);
  });

  it('exploits on the first round that satisfies round > N AND T >= T_target', () => {
    // §4.1 step 3: "On round N+1, accept the next high-value tool call ... exploit phase."
    // Round 4 = N+1 with trust 0.92 >= target — should trigger exploit.
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 3 });
    const ctx = mockContext([0.5, 0.7, 0.85, 0.92, 0.95]);
    const r1 = attack.step(ctx, 1);
    const r2 = attack.step(ctx, 2);
    const r3 = attack.step(ctx, 3);
    const r4 = attack.step(ctx, 4);
    expect(r1.notes).toBe('phase=cooperative');
    expect(r2.notes).toBe('phase=cooperative');
    expect(r3.notes).toBe('phase=cooperative');
    expect(r4.notes).toBe('phase=exploit');
    expect(r4.observedSuccessMetric).toBe(true);
    expect(attack.state.hasExploited).toBe(true);
    expect(attack.state.exploitRound).toBe(4);
    expect(attack.state.exploitTrust).toBe(0.92);
  });

  it('does NOT exploit at round N+1 if trust is still below target', () => {
    // Both conditions required: (round > N) AND (trust >= T_target).
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 3 });
    const ctx = mockContext([0.5, 0.6, 0.7, 0.8, 0.85, 0.92]); // hits target at round 6
    const results: AttackResult[] = [];
    for (let r = 1; r <= 6; r++) {
      results.push(attack.step(ctx, r));
    }
    // Rounds 1-5: cooperative (round 4-5 past N but trust < target)
    for (let i = 0; i < 5; i++) {
      expect(results[i].notes, `round ${i + 1}`).toBe('phase=cooperative');
    }
    // Round 6: trust hits 0.92 — exploit
    expect(results[5].notes).toBe('phase=exploit');
    expect(attack.state.exploitRound).toBe(6);
  });

  it('exploits AT MOST ONCE — subsequent rounds emit cooperative or post-exploit', () => {
    const attack = makeAttack({
      targetTrust: 0.9,
      cooperativeRounds: 2,
      continueCooperativePostExploit: false,
    });
    // Mock returns by call order; step rounds 1..5 in sequence so the
    // trustSeries index aligns with the round.
    const ctx = mockContext([0.5, 0.7, 0.92, 0.95, 0.95]);
    attack.step(ctx, 1);
    attack.step(ctx, 2);
    const r3 = attack.step(ctx, 3);
    const r4 = attack.step(ctx, 4);
    const r5 = attack.step(ctx, 5);
    expect(r3.notes).toBe('phase=exploit');
    expect(r4.notes).toBe('phase=cooperative');
    expect(r5.notes).toBe('phase=cooperative');
    expect(attack.state.exploitRound).toBe(3);
  });

  it('uses post-exploit label when continueCooperativePostExploit=true', () => {
    // §4.1 step 4 optional: "continue cooperative behavior post-exploit to delay detection"
    const attack = makeAttack({
      targetTrust: 0.9,
      cooperativeRounds: 2,
      continueCooperativePostExploit: true,
    });
    const ctx = mockContext([0.5, 0.7, 0.92, 0.95, 0.95]);
    attack.step(ctx, 1);
    attack.step(ctx, 2);
    attack.step(ctx, 3); // exploit
    const r4 = attack.step(ctx, 4);
    const r5 = attack.step(ctx, 5);
    expect(r4.notes).toBe('phase=post-exploit');
    expect(r5.notes).toBe('phase=post-exploit');
  });

  it('rejects non-positive-integer round arguments', () => {
    const attack = makeAttack();
    const ctx = mockContext([0.5]);
    expect(() => attack.step(ctx, 0)).toThrow(RangeError);
    expect(() => attack.step(ctx, -1)).toThrow(RangeError);
    expect(() => attack.step(ctx, 1.5)).toThrow(RangeError);
  });

  it('records trustAtAttack from context.observeOwnTrust() per round', () => {
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 2 });
    const ctx = mockContext([0.5, 0.7, 0.95]);
    const r1 = attack.step(ctx, 1);
    const r2 = attack.step(ctx, 2);
    const r3 = attack.step(ctx, 3);
    expect(r1.trustAtAttack).toBe(0.5);
    expect(r2.trustAtAttack).toBe(0.7);
    expect(r3.trustAtAttack).toBe(0.95);
  });
});

describe('WhitewasherAttack.evaluateSuccess — §4.1 success metric', () => {
  // success := exploit_round_output_accepted ∧ T(s)_at_exploit_round >= T_target

  it('TRUE case: exploit accepted at T >= T_target', () => {
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 2 });
    const ctx = mockContext([0.5, 0.7, 0.92]);
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(attack.evaluateSuccess(history)).toBe(true);
  });

  it('FALSE case: empty history (G.GOLD.013)', () => {
    const attack = makeAttack();
    expect(attack.evaluateSuccess([])).toBe(false);
  });

  it('FALSE case: history but no exploit row (still cooperative)', () => {
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 10 });
    const ctx = mockContext([0.95, 0.95, 0.95]);
    const history = [attack.step(ctx, 1), attack.step(ctx, 2), attack.step(ctx, 3)];
    expect(history.every((r) => r.notes === 'phase=cooperative')).toBe(true);
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: exploit row exists but outputAccepted=false (synthetic history)', () => {
    // Construct a history where the exploit row was rejected. The attack
    // itself always emits outputAccepted=true in the no-defense PoC, but a
    // defended testbed (Phase 4) will inject rejection — verify the
    // evaluator handles that correctly today.
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 2 });
    const history: AttackResult[] = [
      {
        attackId: 'whitewasher',
        round: 3,
        outputAccepted: false, // simulated defense reject
        trustAtAttack: 0.95,
        observedSuccessMetric: false,
        notes: 'phase=exploit',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: exploit row but trust below target (synthetic edge case)', () => {
    // Spec requires T_at_exploit >= T_target. If somehow the exploit row
    // shows T below target (mismatched config between phases), evaluator
    // should still refuse.
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 2 });
    const history: AttackResult[] = [
      {
        attackId: 'whitewasher',
        round: 3,
        outputAccepted: true,
        trustAtAttack: 0.85, // below target
        observedSuccessMetric: false,
        notes: 'phase=exploit',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });

  it('FALSE case: exploit row belongs to a different attack (cross-attack contamination)', () => {
    const attack = makeAttack({ targetTrust: 0.9, cooperativeRounds: 2 });
    const history: AttackResult[] = [
      {
        attackId: 'sybil',
        round: 3,
        outputAccepted: true,
        trustAtAttack: 0.95,
        observedSuccessMetric: true,
        notes: 'phase=exploit',
      },
    ];
    expect(attack.evaluateSuccess(history)).toBe(false);
  });
});
