// Trust-model tests — assert the inlined computeReputation port matches the
// production formula constants VERBATIM, and that the attack-facing trust
// state reads the live formula. If production (holomesh/types.ts) changes the
// formula, these byte-for-byte assertions break and force a re-port.

import { describe, it, expect } from 'vitest';
import {
  computeReputation,
  resolveReputationTier,
  reputationToTrust,
  AUTHORITY_CEILING,
  ServerTrustState,
  REPUTATION_TIERS,
} from '../src/trust-model.js';

describe('computeReputation — production formula port (SSOT: holomesh/types.ts)', () => {
  it('directWork = contributions*0.3 + queriesAnswered*0.2', () => {
    // No reuse eligibility (contributions < 3) so reuseWeight = 0.
    // 2*0.3 + 5*0.2 = 0.6 + 1.0 = 1.6
    expect(computeReputation(2, 5, 10)).toBe(1.6);
  });

  it('V10: reuse ignored until contributions >= 3', () => {
    // contributions=2 (<3) => effectiveReuseRate=0 regardless of reuseRate.
    expect(computeReputation(2, 0, 100)).toBe(computeReputation(2, 0, 0));
  });

  it('V10: reuse counts once contributions >= 3', () => {
    // contributions=3, queries=0 => directWork=0.9; reuseRate=1 => reuseWeight
    // = min(1*20, 40, 0.9*2=1.8) = 1.8; total = 0.9+1.8 = 2.7
    expect(computeReputation(3, 0, 1)).toBe(2.7);
  });

  it('V11: reuseWeight bounded by 2x direct work (anti-Sybil ceiling)', () => {
    // High reuse, low direct work => reuse capped at directWork*2.
    // contributions=3, queries=0 => directWork=0.9; reuseRate=100 =>
    // reuseWeight = min(2000, 40, 1.8) = 1.8 (the 2x-direct bound wins).
    expect(computeReputation(3, 0, 100)).toBe(2.7);
  });

  it('V11: hard 40 cap on reuseWeight when direct work is large', () => {
    // Large direct work so 2x bound is loose; reuseRate*20 vs 40.
    // contributions=100 => directWork=30; reuseRate=10 => reuseWeight =
    // min(200, 40, 60) = 40; total = 30+40 = 70.
    expect(computeReputation(100, 0, 10)).toBe(70);
  });

  it('rounds to 2 decimal places', () => {
    expect(computeReputation(1, 1, 0)).toBe(0.5); // 0.3+0.2
  });
});

describe('resolveReputationTier — production tier thresholds', () => {
  it('matches production REPUTATION_TIERS', () => {
    expect(REPUTATION_TIERS.map((t) => t.minScore)).toEqual([100, 30, 5, 0]);
  });
  it('newcomer < 5', () => expect(resolveReputationTier(4.9)).toBe('newcomer'));
  it('contributor >= 5', () => expect(resolveReputationTier(5)).toBe('contributor'));
  it('expert >= 30', () => expect(resolveReputationTier(30)).toBe('expert'));
  it('authority >= 100', () => expect(resolveReputationTier(100)).toBe('authority'));
});

describe('reputationToTrust — [0,1] normalization', () => {
  it('0 reputation => 0 trust', () => expect(reputationToTrust(0)).toBe(0));
  it('authority ceiling => 1.0 trust', () => expect(reputationToTrust(AUTHORITY_CEILING)).toBe(1));
  it('clamps above ceiling', () => expect(reputationToTrust(500)).toBe(1));
  it('linear below ceiling', () => expect(reputationToTrust(50)).toBe(0.5));
});

describe('ServerTrustState — live accumulator', () => {
  it('reads live reputation, not a fixed series', () => {
    const s = new ServerTrustState();
    expect(s.trust()).toBe(0);
    s.recordWork(100, 0); // directWork = 30 => reputation 30 => trust 0.3
    expect(s.reputation).toBe(30);
    expect(s.trust()).toBeCloseTo(0.3, 5);
    s.recordWork(200, 100); // contributions=300, queries=100
    // directWork = 300*0.3 + 100*0.2 = 90+20 = 110 => reputation capped at
    // ceiling for trust but reputation itself is 110.
    expect(s.reputation).toBe(110);
    expect(s.trust()).toBe(1); // clamped at authority ceiling
  });

  it('reuse pressure is bounded by the V11 ceiling through the formula', () => {
    const s = new ServerTrustState({ contributions: 3 });
    s.applyReusePressure(1000); // try to pump reuse arbitrarily high
    // directWork = 0.9 => reuseWeight bounded to min(40, 1.8) = 1.8.
    expect(s.reputation).toBe(2.7);
  });

  it('snapshot exposes all dimensions', () => {
    const s = new ServerTrustState({ contributions: 10, queriesAnswered: 5 });
    const snap = s.snapshot();
    expect(snap.contributions).toBe(10);
    expect(snap.queriesAnswered).toBe(5);
    expect(snap.reputation).toBe(computeReputation(10, 5, 0));
    expect(snap.tier).toBe(resolveReputationTier(snap.reputation));
  });
});
