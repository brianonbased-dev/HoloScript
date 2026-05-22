/**
 * Government & civic solver tests — government-civic-plugin
 *
 * Reference values verified against:
 *  - Polsby D, Popper R (1991) 9 Yale L. & Pol'y Rev. 301
 *  - Rice S (1928) Am. J. Sociology 33:688-708
 *  - GFOA Budget Variance Standards
 */

import { describe, it, expect } from 'vitest';
import {
  permitScoring,
  mcdaAnalysis,
  quorumCalculator,
  votingCohesion,
  polsbyPopper,
  budgetVariance,
  buildGovtReceipt,
} from '../civicsolver';

// ─── Permit Scoring ───────────────────────────────────────────────────────────

describe('permitScoring', () => {
  it('compositeScore = weighted sum of criterion scores', () => {
    const criteria = [
      { name: 'safety',    weight: 0.40, score: 80 },
      { name: 'zoning',    weight: 0.35, score: 90 },
      { name: 'env',       weight: 0.25, score: 70 },
    ];
    const r = permitScoring(criteria);
    const expected = 0.40 * 80 + 0.35 * 90 + 0.25 * 70;
    expect(r.compositeScore).toBeCloseTo(expected, 4);
  });

  it('approved=true when compositeScore ≥ threshold', () => {
    const criteria = [{ name: 'safety', weight: 1.0, score: 85 }];
    const r = permitScoring(criteria, 70);
    expect(r.approved).toBe(true);
  });

  it('approved=false when compositeScore < threshold', () => {
    const criteria = [{ name: 'safety', weight: 1.0, score: 60 }];
    const r = permitScoring(criteria, 70);
    expect(r.approved).toBe(false);
  });

  it('breakdown includes contribution = score × weight', () => {
    const criteria = [
      { name: 'env', weight: 0.60, score: 75 },
      { name: 'traffic', weight: 0.40, score: 50 },
    ];
    const r = permitScoring(criteria);
    expect(r.breakdown[0].contribution).toBeCloseTo(0.60 * 75, 4);
    expect(r.breakdown[1].contribution).toBeCloseTo(0.40 * 50, 4);
  });

  it('throws when weights do not sum to 1.0', () => {
    const criteria = [
      { name: 'a', weight: 0.5, score: 80 },
      { name: 'b', weight: 0.3, score: 70 },
    ]; // sum = 0.8
    expect(() => permitScoring(criteria)).toThrow();
  });

  it('throws for empty criteria', () => {
    expect(() => permitScoring([])).toThrow();
  });
});

// ─── MCDA Analysis ────────────────────────────────────────────────────────────

describe('mcdaAnalysis', () => {
  const candidates = [
    { id: 'project-A', scores: [90, 60, 40] },
    { id: 'project-B', scores: [70, 80, 90] },
    { id: 'project-C', scores: [50, 90, 70] },
  ];
  const criteria = [
    { name: 'cost-effectiveness', weight: 0.50, isBenefit: true },
    { name: 'community-impact',   weight: 0.30, isBenefit: true },
    { name: 'implementation-ease',weight: 0.20, isBenefit: true },
  ];

  it('winner is a valid candidate id', () => {
    const r = mcdaAnalysis(candidates, criteria);
    const ids = candidates.map(c => c.id);
    expect(ids).toContain(r.winner);
  });

  it('ranking has all candidates', () => {
    const r = mcdaAnalysis(candidates, criteria);
    expect(r.ranking).toHaveLength(candidates.length);
  });

  it('TOPSIS scores in [0, 1]', () => {
    const r = mcdaAnalysis(candidates, criteria);
    for (const item of r.ranking) {
      expect(item.topsisScore).toBeGreaterThanOrEqual(0);
      expect(item.topsisScore).toBeLessThanOrEqual(1);
    }
  });

  it('ranks are 1-indexed and sequential', () => {
    const r = mcdaAnalysis(candidates, criteria);
    const ranks = r.ranking.map(x => x.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3]);
  });

  it('dominant candidate wins when clearly superior', () => {
    // project-X dominates on all criteria vs project-Y
    const dom = [
      { id: 'project-X', scores: [100, 100, 100] },
      { id: 'project-Y', scores: [10, 10, 10] },
    ];
    const r = mcdaAnalysis(dom, criteria);
    expect(r.winner).toBe('project-X');
  });

  it('throws for empty candidates', () => {
    expect(() => mcdaAnalysis([], criteria)).toThrow();
  });

  it('throws when scores.length ≠ criteria.length', () => {
    const bad = [{ id: 'x', scores: [1, 2] }];
    expect(() => mcdaAnalysis(bad, criteria)).toThrow();
  });
});

// ─── Quorum Calculator ────────────────────────────────────────────────────────

describe('quorumCalculator', () => {
  /**
   * 15 member board, 10 present, 7 yes, 2 no, 1 abstain
   * Quorum required: 8 → 10 present → met
   * Simple majority of 7+2=9 votes → 7/9 = 77.8% > 50% → passes
   */
  it('quorumMet=true when present ≥ strict majority', () => {
    const r = quorumCalculator(15, 10, 7, 2, 1);
    expect(r.quorumMet).toBe(true);
  });

  it('motionPassed=true for simple majority with quorum', () => {
    const r = quorumCalculator(15, 10, 7, 2, 1, 'simple');
    expect(r.motionPassed).toBe(true);
  });

  it('quorumMet=false when present < strict majority', () => {
    const r = quorumCalculator(20, 9, 7, 2, 0);
    // Required: 11; present: 9 → not met
    expect(r.quorumMet).toBe(false);
  });

  it('motionPassed=false when quorum not met', () => {
    const r = quorumCalculator(20, 9, 7, 2, 0);
    expect(r.motionPassed).toBe(false);
  });

  it('supermajority requires > 2/3 yes', () => {
    // 6 yes, 4 no out of 10 → 60% < 66.7% → fails supermajority
    const r = quorumCalculator(10, 10, 6, 4, 0, 'supermajority');
    expect(r.motionPassed).toBe(false);
  });

  it('supermajority passes with 7/9 yes', () => {
    const r = quorumCalculator(10, 10, 7, 2, 1, 'supermajority');
    expect(r.motionPassed).toBe(true);
  });

  it('passThreshold=0.5 for simple, 2/3 for supermajority', () => {
    const simple = quorumCalculator(10, 8, 5, 3, 0, 'simple');
    const super_ = quorumCalculator(10, 8, 5, 3, 0, 'supermajority');
    expect(simple.passThreshold).toBeCloseTo(0.5, 4);
    expect(super_.passThreshold).toBeCloseTo(2 / 3, 4);
  });

  it('throws for presentMembers > totalMembers', () => {
    expect(() => quorumCalculator(10, 15, 5, 3, 0)).toThrow();
  });
});

// ─── Voting Cohesion ──────────────────────────────────────────────────────────

describe('votingCohesion', () => {
  /**
   * Party A: 3 yes, 0 no → Rice = |3-0|/3 = 1.0
   * Party B: 1 yes, 2 no → Rice = |1-2|/3 = 0.33
   */
  const votes = [
    { memberId: 'A1', partyId: 'A', vote: 'yes' as const },
    { memberId: 'A2', partyId: 'A', vote: 'yes' as const },
    { memberId: 'A3', partyId: 'A', vote: 'yes' as const },
    { memberId: 'B1', partyId: 'B', vote: 'yes' as const },
    { memberId: 'B2', partyId: 'B', vote: 'no'  as const },
    { memberId: 'B3', partyId: 'B', vote: 'no'  as const },
  ];

  it('unanimous party cohesion = 1.0', () => {
    const r = votingCohesion(votes);
    const partyA = r.partyCohesion.find(p => p.partyId === 'A');
    expect(partyA!.cohesion).toBeCloseTo(1.0, 4);
  });

  it('split party cohesion < 1', () => {
    const r = votingCohesion(votes);
    const partyB = r.partyCohesion.find(p => p.partyId === 'B');
    expect(partyB!.cohesion).toBeGreaterThanOrEqual(0);
    expect(partyB!.cohesion).toBeLessThan(1);
  });

  it('chamberCohesion in [0, 1]', () => {
    const r = votingCohesion(votes);
    expect(r.chamberCohesion).toBeGreaterThanOrEqual(0);
    expect(r.chamberCohesion).toBeLessThanOrEqual(1);
  });

  it('majority=yes when more yes than no', () => {
    const r = votingCohesion(votes); // 4 yes, 2 no
    expect(r.majority).toBe('yes');
  });

  it('majority=no when more no than yes', () => {
    const noMajority = votes.map(v => ({ ...v, vote: (v.partyId === 'A' ? 'no' : v.vote) as 'yes' | 'no' | 'abstain' }));
    const r = votingCohesion(noMajority); // 1 yes, 5 no
    expect(r.majority).toBe('no');
  });

  it('throws for empty votes', () => {
    expect(() => votingCohesion([])).toThrow();
  });
});

// ─── Polsby-Popper ────────────────────────────────────────────────────────────

describe('polsbyPopper', () => {
  /**
   * Perfect circle: PP = 4π×A / P² = 1.0
   * Circle with A=π, P=2π → PP = 4π×π / (2π)² = 4π²/4π² = 1.0
   */
  it('circle → compactnessScore ≈ 1.0', () => {
    const A = Math.PI; // π km²
    const P = 2 * Math.PI; // 2π km
    const r = polsbyPopper(A, P);
    expect(r.compactnessScore).toBeCloseTo(1.0, 4);
  });

  it('compact classification for score ≥ 0.50', () => {
    const r = polsbyPopper(Math.PI, 2 * Math.PI);
    expect(r.classification).toBe('compact');
  });

  it('gerrymandered classification for very elongated shape', () => {
    // Very elongated: narrow strip, A=1, P=100 → PP = 4π/10000 ≈ 0.00125
    const r = polsbyPopper(1, 100);
    expect(r.classification).toBe('gerrymandered');
    expect(r.compactnessScore).toBeLessThan(0.20);
  });

  it('moderate classification for 0.20 ≤ score < 0.50', () => {
    // Rectangle 2×1: A=2, P=6 → PP = 4π×2/36 ≈ 0.698... wait that's >0.5
    // Rectangle 4×1: A=4, P=10 → PP = 4π×4/100 = 0.503 still >0.5
    // Rectangle 10×1: A=10, P=22 → PP = 4π×10/484 ≈ 0.259 → moderate
    const r = polsbyPopper(10, 22);
    expect(r.classification).toBe('moderate');
  });

  it('compactnessScore = 4π × area / perimeter²', () => {
    const A = 5, P = 15;
    const r = polsbyPopper(A, P);
    expect(r.compactnessScore).toBeCloseTo((4 * Math.PI * A) / (P ** 2), 6);
  });

  it('throws for non-positive area', () => {
    expect(() => polsbyPopper(0, 10)).toThrow();
  });
});

// ─── Budget Variance ──────────────────────────────────────────────────────────

describe('budgetVariance', () => {
  const lines = [
    { category: 'Roads',       budgeted: 100_000, actual: 95_000  }, // under → favorable
    { category: 'Parks',       budgeted:  50_000, actual: 60_000  }, // over → unfavorable
    { category: 'Admin',       budgeted:  75_000, actual: 75_500  }, // near → on-target
  ];

  it('variance = actual - budgeted', () => {
    const r = budgetVariance(lines);
    expect(r.lines[0].variance).toBe(95_000 - 100_000);
    expect(r.lines[1].variance).toBe(60_000 - 50_000);
  });

  it('variancePct = variance / budgeted', () => {
    const r = budgetVariance(lines);
    expect(r.lines[0].variancePct).toBeCloseTo(-5_000 / 100_000, 4);
    expect(r.lines[1].variancePct).toBeCloseTo(10_000 / 50_000, 4);
  });

  it('under-budget is favorable', () => {
    const r = budgetVariance(lines);
    expect(r.lines[0].status).toBe('favorable');
  });

  it('over-budget is unfavorable', () => {
    const r = budgetVariance(lines);
    expect(r.lines[1].status).toBe('unfavorable');
  });

  it('flaggedLines contains categories with |variance%| > threshold', () => {
    const r = budgetVariance(lines, 0.10); // 10% threshold
    // Parks: 20% over → flagged. Roads: 5% under → not flagged (below 10%)
    expect(r.flaggedLines).toContain('Parks');
    expect(r.flaggedLines).not.toContain('Roads');
  });

  it('totalBudgeted and totalActual correct', () => {
    const r = budgetVariance(lines);
    expect(r.totalBudgeted).toBe(225_000);
    expect(r.totalActual).toBe(230_500);
  });

  it('throws for empty lines', () => {
    expect(() => budgetVariance([])).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildGovtReceipt', () => {
  it('plugin=government-civic and CAEL event correct', () => {
    const permit = permitScoring([{ name: 'safety', weight: 1.0, score: 85 }]);
    const receipt = buildGovtReceipt({ permit, converged: true });
    expect(receipt.plugin).toBe('government-civic');
    expect(receipt.cael.event).toBe('government_civic.civic_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for approved permit', () => {
    const permit = permitScoring([{ name: 'safety', weight: 1.0, score: 85 }]);
    const receipt = buildGovtReceipt({ permit, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for denied permit', () => {
    const permit = permitScoring([{ name: 'safety', weight: 1.0, score: 55 }]);
    const receipt = buildGovtReceipt({ permit, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for gerrymandered district', () => {
    const compactness = polsbyPopper(1, 200); // very elongated
    const receipt = buildGovtReceipt({ compactness, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildGovtReceipt({ converged: true }, { runId: 'gov-run-42' });
    expect(receipt.runId).toBe('gov-run-42');
  });
});
