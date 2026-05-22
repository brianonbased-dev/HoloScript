/**
 * Fashion design solver tests — fashion-plugin
 *
 * Reference values verified against:
 *  - Armstrong H (2010) Patternmaking for Fashion Design, 5th ed.
 *  - Itten J (1961) The Art of Color. Reinhold.
 *  - Wickett J, Grice A, Cassill N (1999) J. Textile Apparel Tech. Mgmt.
 */

import { describe, it, expect } from 'vitest';
import {
  patternGrading,
  fabricWasteEstimator,
  colorHarmonyScore,
  trendMomentum,
  costPerWear,
  buildFashionReceipt,
} from '../fashionsolver';

// ─── Pattern Grading ──────────────────────────────────────────────────────────

describe('patternGrading', () => {
  const rules = [
    { measurement: 'chest', baseValueCm: 88, incrementCm: 4 },
    { measurement: 'waist', baseValueCm: 68, incrementCm: 4 },
  ];
  const sizes = ['XS', 'S', 'M', 'L', 'XL'];
  const baseSizeIndex = 2; // M is the base

  it('base size measurements equal base values', () => {
    const r = patternGrading(rules, sizes, baseSizeIndex);
    const base = r.sizes.find(s => s.size === 'M')!;
    expect(base.measurements['chest']).toBe(88);
    expect(base.measurements['waist']).toBe(68);
  });

  it('next size up = base + increment', () => {
    const r = patternGrading(rules, sizes, baseSizeIndex);
    const large = r.sizes.find(s => s.size === 'L')!;
    expect(large.measurements['chest']).toBeCloseTo(88 + 4, 1);
  });

  it('next size down = base − increment', () => {
    const r = patternGrading(rules, sizes, baseSizeIndex);
    const small = r.sizes.find(s => s.size === 'S')!;
    expect(small.measurements['chest']).toBeCloseTo(88 - 4, 1);
  });

  it('totalSpread = increment × (sizes.length − 1)', () => {
    const r = patternGrading(rules, sizes, baseSizeIndex);
    expect(r.totalSpread['chest']).toBeCloseTo(4 * (sizes.length - 1), 1);
  });

  it('output has same number of sizes as input', () => {
    const r = patternGrading(rules, sizes, baseSizeIndex);
    expect(r.sizes).toHaveLength(sizes.length);
  });

  it('throws for empty rules', () => {
    expect(() => patternGrading([], sizes, baseSizeIndex)).toThrow();
  });

  it('throws for baseSizeIndex out of range', () => {
    expect(() => patternGrading(rules, sizes, 10)).toThrow();
  });
});

// ─── Fabric Waste ─────────────────────────────────────────────────────────────

describe('fabricWasteEstimator', () => {
  const pieces = [
    { name: 'front', widthCm: 60, heightCm: 80, quantity: 2 },
    { name: 'back',  widthCm: 55, heightCm: 80, quantity: 2 },
    { name: 'sleeve',widthCm: 40, heightCm: 60, quantity: 2 },
  ];

  it('nestingEfficiency matches input factor', () => {
    const r = fabricWasteEstimator(pieces, 150, 0.80);
    expect(r.nestingEfficiency).toBeCloseTo(0.80, 4);
  });

  it('wastePct = 1 − nestingEfficiency', () => {
    const r = fabricWasteEstimator(pieces, 150, 0.82);
    expect(r.wastePct).toBeCloseTo(1 - 0.82, 4);
  });

  it('fabricAreaCm2 = totalPieceAreaCm2 / efficiency', () => {
    const r = fabricWasteEstimator(pieces, 150, 0.80);
    expect(r.fabricAreaCm2).toBeCloseTo(r.totalPieceAreaCm2 / 0.80, 2);
  });

  it('totalPieceAreaCm2 = sum of width × height × qty', () => {
    const r = fabricWasteEstimator(pieces, 150);
    const expected = pieces.reduce((s, p) => s + p.widthCm * p.heightCm * p.quantity, 0);
    expect(r.totalPieceAreaCm2).toBeCloseTo(expected, 2);
  });

  it('throws for empty pieces', () => {
    expect(() => fabricWasteEstimator([], 150)).toThrow();
  });

  it('throws for zero fabric width', () => {
    expect(() => fabricWasteEstimator(pieces, 0)).toThrow();
  });
});

// ─── Color Harmony ────────────────────────────────────────────────────────────

describe('colorHarmonyScore', () => {
  it('≈180° hue difference → complementary', () => {
    const r = colorHarmonyScore(0, 180);
    expect(r.harmony).toBe('complementary');
  });

  it('≤30° hue difference → analogous', () => {
    const r = colorHarmonyScore(20, 30);
    expect(r.harmony).toBe('analogous');
  });

  it('≈120° hue difference → triadic', () => {
    const r = colorHarmonyScore(0, 120);
    expect(r.harmony).toBe('triadic');
  });

  it('harmonyScore in [0, 100]', () => {
    for (const diff of [0, 30, 60, 90, 120, 150, 180]) {
      const r = colorHarmonyScore(0, diff);
      expect(r.harmonyScore).toBeGreaterThanOrEqual(0);
      expect(r.harmonyScore).toBeLessThanOrEqual(100);
    }
  });

  it('suggestedAccentHue = (primary + 120) % 360', () => {
    const r = colorHarmonyScore(30, 180);
    expect(r.suggestedAccentHue).toBeCloseTo((30 + 120) % 360, 0);
  });
});

// ─── Trend Momentum ───────────────────────────────────────────────────────────

describe('trendMomentum', () => {
  it('growing sales → trend = up', () => {
    const periods = [
      { period: 'Jan', unitsSold: 100 },
      { period: 'Feb', unitsSold: 120 },
      { period: 'Mar', unitsSold: 150 },
      { period: 'Apr', unitsSold: 180 },
    ];
    const r = trendMomentum(periods);
    expect(r.trend).toBe('up');
  });

  it('declining sales → trend = down', () => {
    const periods = [
      { period: 'Jan', unitsSold: 200 },
      { period: 'Feb', unitsSold: 160 },
      { period: 'Mar', unitsSold: 120 },
      { period: 'Apr', unitsSold: 90 },
    ];
    const r = trendMomentum(periods);
    expect(r.trend).toBe('down');
  });

  it('stable sales → trend = flat', () => {
    const periods = Array.from({ length: 4 }, (_, i) => ({ period: `P${i}`, unitsSold: 100 }));
    const r = trendMomentum(periods);
    expect(r.trend).toBe('flat');
  });

  it('velocity > 0', () => {
    const periods = [{ period: 'A', unitsSold: 100 }, { period: 'B', unitsSold: 150 }];
    const r = trendMomentum(periods);
    expect(r.velocity).toBeGreaterThan(0);
  });

  it('projectedNextPeriod ≥ 0', () => {
    const periods = [{ period: 'A', unitsSold: 50 }, { period: 'B', unitsSold: 60 }];
    const r = trendMomentum(periods);
    expect(r.projectedNextPeriod).toBeGreaterThanOrEqual(0);
  });

  it('throws for single period', () => {
    expect(() => trendMomentum([{ period: 'A', unitsSold: 100 }])).toThrow();
  });
});

// ─── Cost Per Wear ────────────────────────────────────────────────────────────

describe('costPerWear', () => {
  it('costPerWear = totalCost / wears', () => {
    const r = costPerWear(200, 2, 50);
    expect(r.costPerWear).toBeCloseTo(r.totalCost / 50, 4);
  });

  it('totalCost = purchase + careCost × wears', () => {
    const r = costPerWear(200, 2, 50);
    expect(r.totalCost).toBeCloseTo(200 + 2 * 50, 4);
  });

  it('throws for non-positive estimatedWears', () => {
    expect(() => costPerWear(100, 1, 0)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildFashionReceipt', () => {
  it('plugin=fashion and CAEL event correct', () => {
    const receipt = buildFashionReceipt({ converged: true });
    expect(receipt.plugin).toBe('fashion');
    expect(receipt.cael.event).toBe('fashion.design_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for efficient nesting', () => {
    const fabricWaste = fabricWasteEstimator(
      [{ name: 'front', widthCm: 50, heightCm: 60, quantity: 2 }],
      150, 0.85, // 15% waste < 25%
    );
    const receipt = buildFashionReceipt({ fabricWaste, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for high fabric waste', () => {
    const fabricWaste = fabricWasteEstimator(
      [{ name: 'front', widthCm: 50, heightCm: 60, quantity: 2 }],
      150, 0.70, // 30% waste > 25%
    );
    expect(fabricWaste.wastePct).toBeGreaterThan(0.25);
    const receipt = buildFashionReceipt({ fabricWaste, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for declining trend', () => {
    const trend = trendMomentum([
      { period: 'A', unitsSold: 200 },
      { period: 'B', unitsSold: 100 },
      { period: 'C', unitsSold: 50  },
      { period: 'D', unitsSold: 20  },
    ]);
    expect(trend.trend).toBe('down');
    const receipt = buildFashionReceipt({ trend, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildFashionReceipt({ converged: true }, { runId: 'fash-run-1' });
    expect(receipt.runId).toBe('fash-run-1');
  });
});
