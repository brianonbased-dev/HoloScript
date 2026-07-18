import { describe, expect, it } from 'vitest';
import {
  conformalCoverageBound,
  conformalCoverageByFamily,
  type GradedOutcome,
} from '../conformal';

// Split-conformal wrapped around the verifier of record V. The nonconformity score is V's BINARY
// correctness bit (1 - correct), so these tests use synthetic {family, correct} verdicts — exactly
// the shape gradeByResolver emits — and never re-grade anything.

/** Deterministic PRNG (mulberry32) so the Monte-Carlo coverage check is reproducible, never flaky. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bernoulliOutcomes(n: number, p: number, rand: () => number, family = 'occlusion'): GradedOutcome[] {
  const out: GradedOutcome[] = [];
  for (let i = 0; i < n; i++) out.push({ family, correct: rand() < p });
  return out;
}

describe('conformalCoverageBound — split conformal over binary V verdicts', () => {
  it('perfect calibration → quantile 0, full coverage, lowerBound ≥ 1-α', () => {
    const calib: GradedOutcome[] = Array.from({ length: 100 }, () => ({ correct: true }));
    const b = conformalCoverageBound(calib, 0.1);
    expect(b.valid).toBe(true);
    expect(b.quantile).toBe(0);
    expect(b.accuracy).toBe(1);
    expect(b.empiricalCoverage).toBe(1);
    expect(b.lowerBound).toBeGreaterThanOrEqual(1 - 0.1);
  });

  it('lowerBound equals the exact Vovk finite-sample value k/(n+1) and is ≥ 1-α', () => {
    const n = 99;
    const calib: GradedOutcome[] = Array.from({ length: n }, () => ({ correct: true }));
    for (const alpha of [0.05, 0.1, 0.2]) {
      const b = conformalCoverageBound(calib, alpha);
      const k = Math.ceil((n + 1) * (1 - alpha));
      expect(b.lowerBound).toBeCloseTo(k / (n + 1), 10);
      expect(b.lowerBound).toBeGreaterThanOrEqual(1 - alpha);
    }
  });

  it('threshold flips to 1 (trivial set) when incorrect rate exceeds α on the calibration split', () => {
    // 20% incorrect, α=0.1: k=ceil(101*0.9)=91 > 80 correct ⇒ q̂ = 1, empiricalCoverage = 1.
    const calib: GradedOutcome[] = [
      ...Array.from({ length: 80 }, () => ({ correct: true })),
      ...Array.from({ length: 20 }, () => ({ correct: false })),
    ];
    const b = conformalCoverageBound(calib, 0.1);
    expect(b.valid).toBe(true);
    expect(b.quantile).toBe(1);
    expect(b.accuracy).toBeCloseTo(0.8, 10);
    expect(b.empiricalCoverage).toBe(1);
  });

  it('Monte-Carlo: held-out empirical coverage ≥ 1-α across trials (the marginal guarantee)', () => {
    const rand = mulberry32(0xc0ffee);
    for (const alpha of [0.1, 0.2]) {
      const p = 1 - alpha + 0.05; // true accuracy comfortably above the target
      const n = 200;
      const m = 200;
      const trials = 300;
      let coverageSum = 0;
      for (let t = 0; t < trials; t++) {
        const calib = bernoulliOutcomes(n, p, rand);
        const b = conformalCoverageBound(calib, alpha);
        const q = b.quantile;
        const test = bernoulliOutcomes(m, p, rand);
        let covered = 0;
        for (const o of test) {
          const score = o.correct ? 0 : 1;
          if (score <= q) covered += 1;
        }
        coverageSum += covered / m;
      }
      const avgCoverage = coverageSum / trials;
      expect(avgCoverage).toBeGreaterThanOrEqual(1 - alpha);
    }
  });
});

describe('conformalCoverageBound — honest finite-sample behavior (tiny real split)', () => {
  it('tiny-but-valid n emits a looseness warning (n=12, α=0.1)', () => {
    // The real solvable/unsolvable split is ~12–18 items.
    const calib: GradedOutcome[] = Array.from({ length: 12 }, () => ({ correct: true }));
    const b = conformalCoverageBound(calib, 0.1);
    expect(b.valid).toBe(true); // k=ceil(13*0.9)=12 ≤ 12
    expect(b.lowerBound).toBeCloseTo(12 / 13, 10);
    expect(b.warning).toBeDefined();
    expect(b.warning).toMatch(/loose/i);
  });

  it('n too small for the requested α fails closed with a vacuous-guarantee warning (n=12, α=0.05)', () => {
    const calib: GradedOutcome[] = Array.from({ length: 12 }, () => ({ correct: true }));
    const b = conformalCoverageBound(calib, 0.05);
    expect(b.valid).toBe(false); // k=ceil(13*0.95)=13 > 12
    expect(b.lowerBound).toBe(0); // no non-trivial distribution-free guarantee
    expect(b.quantile).toBe(Number.POSITIVE_INFINITY);
    expect(b.warning).toMatch(/too small/i);
  });

  it('empty calibration fails closed (no guarantee, lower-trust value)', () => {
    const b = conformalCoverageBound([], 0.1);
    expect(b.valid).toBe(false);
    expect(b.lowerBound).toBe(0);
    expect(b.nCalib).toBe(0);
    expect(b.warning).toMatch(/empty/i);
  });

  it('invalid alpha fails closed rather than throwing into the reward path', () => {
    const calib: GradedOutcome[] = [{ correct: true }, { correct: true }];
    for (const bad of [0, 1, -0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const b = conformalCoverageBound(calib, bad);
      expect(b.valid).toBe(false);
      expect(b.lowerBound).toBe(0);
      expect(b.warning).toMatch(/invalid alpha/i);
    }
  });

  it('malformed verdicts are counted as INCORRECT (fail-closed, never inflate accuracy)', () => {
    const calib = [
      ...Array.from({ length: 9 }, () => ({ correct: true })),
      { family: 'x' } as unknown as GradedOutcome, // missing `correct` → treated as incorrect
    ];
    const b = conformalCoverageBound(calib, 0.5);
    expect(b.accuracy).toBeCloseTo(0.9, 10);
  });
});

describe('conformalCoverageByFamily — Mondrian per-family conditioning', () => {
  it('conditions the bound per family and reports the pooled baseline', () => {
    const calib: GradedOutcome[] = [
      ...Array.from({ length: 30 }, () => ({ family: 'occlusion', correct: true })),
      ...Array.from({ length: 30 }, () => ({ family: 'beneficiary', correct: false })),
      ...Array.from({ length: 30 }, () => ({ family: 'temporal', correct: true })),
    ];
    const report = conformalCoverageByFamily(calib, 0.2);
    expect(report.families).toEqual(['occlusion', 'beneficiary', 'temporal']);
    expect(Object.keys(report.perFamily)).toHaveLength(3);
    // occlusion is all-correct ⇒ q̂=0; beneficiary is all-incorrect ⇒ q̂=1 (families are non-exchangeable).
    expect(report.perFamily.occlusion.quantile).toBe(0);
    expect(report.perFamily.beneficiary.quantile).toBe(1);
    expect(report.perFamily.beneficiary.accuracy).toBe(0);
    expect(report.pooled.nCalib).toBe(90);
    expect(report.pooled.valid).toBe(true);
  });

  it('buckets outcomes without a family under __unlabeled__', () => {
    const calib: GradedOutcome[] = [
      { correct: true },
      { correct: false },
      { family: 'temporal', correct: true },
    ];
    const report = conformalCoverageByFamily(calib, 0.3);
    expect(report.families).toContain('__unlabeled__');
    expect(report.perFamily.__unlabeled__.nCalib).toBe(2);
  });

  it('warns when a per-family split is too small/invalid to be tight', () => {
    const calib: GradedOutcome[] = [
      ...Array.from({ length: 6 }, () => ({ family: 'occlusion', correct: true })),
      ...Array.from({ length: 6 }, () => ({ family: 'beneficiary', correct: true })),
    ];
    const report = conformalCoverageByFamily(calib, 0.1);
    expect(report.warning).toBeDefined();
    expect(report.warning).toMatch(/non-exchangeable/i);
  });
});
