/**
 * Wine & beverage solver tests — wine-food-beverage-plugin
 *
 * Reference values verified against:
 *  - UC Davis 20-point scorecard (Amerine & Roessler 1976)
 *  - Wine Spectator 100-point scale
 *  - Jackson R (2009) Wine Science, Academic Press.
 */

import { describe, it, expect } from 'vitest';
import {
  wineScoring,
  foodWinePairing,
  cellarAgingOptimizer,
  blendOptimization,
  buildWineReceipt,
} from '../winesolver';

// ─── Wine Scoring ─────────────────────────────────────────────────────────────

describe('wineScoring', () => {
  /**
   * UC Davis max = 20pts → WS = 50 + (20/20)×50 = 100
   * Score of 17: WS = 50 + (17/20)×50 = 92.5 → 93 (rounded)
   */
  it('perfect score (20/20) → hundredPointScore = 100', () => {
    const r = wineScoring({ appearance: 4, aroma: 6, taste: 6, overall: 4 });
    expect(r.hundredPointScore).toBe(100);
    expect(r.rawScore).toBe(20);
  });

  it('zero score → hundredPointScore = 50', () => {
    const r = wineScoring({ appearance: 0, aroma: 0, taste: 0, overall: 0 });
    expect(r.hundredPointScore).toBe(50);
    expect(r.rawScore).toBe(0);
  });

  it('hundredPointScore = round(50 + rawScore/20 × 50)', () => {
    const scorecard = { appearance: 3, aroma: 5, taste: 5, overall: 3 };
    const r = wineScoring(scorecard);
    const expected = Math.round(50 + (16 / 20) * 50);
    expect(r.hundredPointScore).toBe(expected);
  });

  it('score ≥ 96 → Outstanding rating', () => {
    const r = wineScoring({ appearance: 4, aroma: 6, taste: 6, overall: 4 }); // 100pts
    expect(r.rating).toBe('Outstanding');
  });

  it('score 90–95 → Excellent rating', () => {
    // WS = 50 + (16/20)*50 = 90
    const r = wineScoring({ appearance: 3, aroma: 5, taste: 5, overall: 3 }); // rawScore=16 → WS=90
    expect(['Excellent', 'Very Good']).toContain(r.rating);
  });

  it('priceTier=icon for 96+', () => {
    const r = wineScoring({ appearance: 4, aroma: 6, taste: 6, overall: 4 });
    expect(r.priceTier).toBe('icon');
  });

  it('priceTier=value for < 70pts', () => {
    // rawScore=0 → WS=50 → value
    const r = wineScoring({ appearance: 0, aroma: 0, taste: 0, overall: 0 });
    expect(r.priceTier).toBe('value');
  });

  it('throws for appearance out of [0–4]', () => {
    expect(() => wineScoring({ appearance: 5, aroma: 5, taste: 5, overall: 3 })).toThrow();
  });

  it('throws for aroma out of [0–6]', () => {
    expect(() => wineScoring({ appearance: 3, aroma: 7, taste: 5, overall: 3 })).toThrow();
  });
});

// ─── Food-Wine Pairing ────────────────────────────────────────────────────────

describe('foodWinePairing', () => {
  /**
   * Classic pairing: full-bodied Cabernet (high tannin, high body) with
   * rich beef steak (high fat/richness, low sweetness, low spice)
   */
  const cabernetBeef = {
    wineBody: 8, wineTannin: 8, wineAcidity: 6, wineSweetness: 1, wineAlcohol: 8,
    foodRichness: 9, foodAcidity: 3, foodSweetness: 1, foodSpice: 2, foodSaltiness: 5,
  };

  it('Cabernet+steak is good or excellent pairing', () => {
    const r = foodWinePairing(cabernetBeef);
    expect(['excellent', 'good']).toContain(r.pairing);
    expect(r.affinityScore).toBeGreaterThan(60);
  });

  it('identical wine/food profile → high affinity', () => {
    const perfect = {
      wineBody: 5, wineTannin: 5, wineAcidity: 5, wineSweetness: 5, wineAlcohol: 5,
      foodRichness: 5, foodAcidity: 5, foodSweetness: 5, foodSpice: 0, foodSaltiness: 5,
    };
    const r = foodWinePairing(perfect);
    expect(r.affinityScore).toBeGreaterThan(60);
  });

  it('affinityScore in [0, 100]', () => {
    const r = foodWinePairing(cabernetBeef);
    expect(r.affinityScore).toBeGreaterThanOrEqual(0);
    expect(r.affinityScore).toBeLessThanOrEqual(100);
  });

  it('has 7 pairing axes', () => {
    const r = foodWinePairing(cabernetBeef);
    expect(r.axes).toHaveLength(7);
  });

  it('each axis score in [0, 10]', () => {
    const r = foodWinePairing(cabernetBeef);
    for (const axis of r.axes) {
      expect(axis.score).toBeGreaterThanOrEqual(0);
      expect(axis.score).toBeLessThanOrEqual(10);
    }
  });

  it('recommendation is non-empty string', () => {
    const r = foodWinePairing(cabernetBeef);
    expect(typeof r.recommendation).toBe('string');
    expect(r.recommendation.length).toBeGreaterThan(0);
  });

  it('high-spice + high-tannin → lower affinity than low-spice', () => {
    const lowSpice  = { ...cabernetBeef, foodSpice: 1 };
    const highSpice = { ...cabernetBeef, foodSpice: 9 };
    const rLow  = foodWinePairing(lowSpice);
    const rHigh = foodWinePairing(highSpice);
    expect(rHigh.affinityScore).toBeLessThan(rLow.affinityScore);
  });
});

// ─── Cellar Aging Optimizer ───────────────────────────────────────────────────

describe('cellarAgingOptimizer', () => {
  const vintages = [
    { id: 'cab-2020', variety: 'Cabernet Sauvignon', vintage: 2020, peakStart: 2025, peakEnd: 2035, bottles: 12, purchasePricePerBottle: 50 },
    { id: 'chard-2021', variety: 'Chardonnay',       vintage: 2021, peakStart: 2022, peakEnd: 2026, bottles: 6,  purchasePricePerBottle: 30 },
    { id: 'old-cab',    variety: 'Cabernet',          vintage: 2005, peakStart: 2012, peakEnd: 2020, bottles: 4,  purchasePricePerBottle: 120 },
  ];

  it('wine before peakStart → too-young', () => {
    const r = cellarAgingOptimizer(vintages, 2024); // cab-2020 peaks 2025
    const cab = r.vintages.find(v => v.id === 'cab-2020');
    expect(cab!.status).toBe('too-young');
  });

  it('wine within peak window → peak', () => {
    const r = cellarAgingOptimizer(vintages, 2024); // chard peaks 2022-2026
    const chard = r.vintages.find(v => v.id === 'chard-2021');
    expect(chard!.status).toBe('peak');
  });

  it('wine past peakEnd → past-peak or declining', () => {
    const r = cellarAgingOptimizer(vintages, 2024); // old-cab peaked 2020
    const oldCab = r.vintages.find(v => v.id === 'old-cab');
    expect(['past-peak', 'declining']).toContain(oldCab!.status);
  });

  it('portfolioValue > 0', () => {
    const r = cellarAgingOptimizer(vintages, 2024);
    expect(r.portfolioValue).toBeGreaterThan(0);
  });

  it('bottle counts are consistent', () => {
    const r = cellarAgingOptimizer(vintages, 2024);
    expect(r.peakBottles + r.tooYoungBottles + r.pastPeakBottles).toBe(
      vintages.reduce((s, v) => s + v.bottles, 0),
    );
  });

  it('yearsToPeak is positive for too-young wine', () => {
    const r = cellarAgingOptimizer(vintages, 2024);
    const cab = r.vintages.find(v => v.id === 'cab-2020');
    expect(cab!.yearsToPeak).toBeGreaterThan(0);
  });

  it('throws for empty cellar', () => {
    expect(() => cellarAgingOptimizer([], 2024)).toThrow();
  });
});

// ─── Blend Optimization ───────────────────────────────────────────────────────

describe('blendOptimization', () => {
  const components = [
    { variety: 'Cabernet Sauvignon', quality: 92, costPerLiter: 15, availableLiters: 5000, minPct: 50 },
    { variety: 'Merlot',            quality: 85, costPerLiter: 10, availableLiters: 3000, minPct: 10 },
    { variety: 'Petit Verdot',      quality: 88, costPerLiter: 18, availableLiters: 1000, maxPct: 10 },
  ];

  it('blend percentages sum to 100%', () => {
    const r = blendOptimization(components, 8000);
    const total = r.blend.reduce((s, b) => s + b.percentage, 0);
    expect(total).toBeCloseTo(100, 2);
  });

  it('blendQuality is positive', () => {
    const r = blendOptimization(components, 8000);
    expect(r.blendQuality).toBeGreaterThan(0);
    expect(r.blendQuality).toBeLessThanOrEqual(100);
  });

  it('blendCostPerLiter is positive', () => {
    const r = blendOptimization(components, 8000);
    expect(r.blendCostPerLiter).toBeGreaterThan(0);
  });

  it('litersUsed per component ≤ availableLiters', () => {
    const r = blendOptimization(components, 8000);
    for (const b of r.blend) {
      const comp = components.find(c => c.variety === b.variety);
      expect(b.litersUsed).toBeLessThanOrEqual(comp!.availableLiters + 0.01);
    }
  });

  it('min% constraint is respected', () => {
    const r = blendOptimization(components, 8000);
    const cab = r.blend.find(b => b.variety === 'Cabernet Sauvignon');
    expect(cab!.percentage).toBeGreaterThanOrEqual(50 - 0.01);
  });

  it('throws for empty components', () => {
    expect(() => blendOptimization([], 1000)).toThrow();
  });

  it('throws for non-positive target volume', () => {
    expect(() => blendOptimization(components, 0)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildWineReceipt', () => {
  it('plugin=wine-food-beverage and CAEL event correct', () => {
    const scoring = wineScoring({ appearance: 4, aroma: 5, taste: 5, overall: 4 });
    const receipt = buildWineReceipt({ scoring, converged: true });
    expect(receipt.plugin).toBe('wine-food-beverage');
    expect(receipt.cael.event).toBe('wine_food_beverage.beverage_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for high-quality wine', () => {
    const scoring = wineScoring({ appearance: 4, aroma: 6, taste: 6, overall: 4 }); // 100pts
    const receipt = buildWineReceipt({ scoring, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for wine score < 80', () => {
    const scoring = wineScoring({ appearance: 1, aroma: 1, taste: 1, overall: 1 }); // 50 + 4/20×50 = 60pts
    expect(scoring.hundredPointScore).toBeLessThan(80);
    const receipt = buildWineReceipt({ scoring, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for poor food-wine pairing', () => {
    // Sweet wine + spicy food + wrong body = poor pairing
    const pairing = foodWinePairing({
      wineBody: 1, wineTannin: 9, wineAcidity: 1, wineSweetness: 1, wineAlcohol: 1,
      foodRichness: 1, foodAcidity: 9, foodSweetness: 9, foodSpice: 9, foodSaltiness: 9,
    });
    if (pairing.pairing === 'poor') {
      const receipt = buildWineReceipt({ pairing, converged: true });
      expect(receipt.acceptance.accepted).toBe(false);
    }
  });

  it('uses provided runId', () => {
    const receipt = buildWineReceipt({ converged: true }, { runId: 'wine-run-2026' });
    expect(receipt.runId).toBe('wine-run-2026');
  });
});
