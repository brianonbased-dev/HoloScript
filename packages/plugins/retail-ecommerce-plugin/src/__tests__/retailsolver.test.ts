/**
 * Retail & e-commerce solver tests — retail-ecommerce-plugin
 *
 * Reference values verified against:
 *  - Harris FW (1913) Operations and Cost — EOQ formula
 *  - Philips RL (2005) Pricing and Revenue Optimization — elasticity
 *  - CLV standard industry formulas (AGSM)
 */

import { describe, it, expect } from 'vitest';
import {
  economicOrderQuantity,
  priceOptimization,
  markdownOptimization,
  customerLifetimeValue,
  conversionFunnelAnalysis,
  abcClassification,
  inventoryMetrics,
  buildRetailReceipt,
} from '../retailsolver';

// ─── EOQ ─────────────────────────────────────────────────────────────────────

describe('economicOrderQuantity', () => {
  /**
   * Classic EOQ example: D=1000, S=$10, H=$2.50/unit/yr
   * EOQ = √(2×1000×10/2.5) = √8000 ≈ 89.44
   * Orders/year = 1000/89.44 ≈ 11.18
   * TAC = (1000/89.44)×10 + (89.44/2)×2.5 ≈ $223.61
   */
  it('EOQ = √(2DS/H)', () => {
    const r = economicOrderQuantity(1000, 10, 2.5);
    expect(r.eoq).toBeCloseTo(Math.sqrt(2 * 1000 * 10 / 2.5), 1);
  });

  it('ordersPerYear = demand / EOQ', () => {
    const r = economicOrderQuantity(1000, 10, 2.5);
    expect(r.ordersPerYear).toBeCloseTo(1000 / r.eoq, 4);
  });

  it('TAC = (D/EOQ)×S + (EOQ/2)×H', () => {
    const r = economicOrderQuantity(1000, 10, 2.5);
    const expected = (1000 / r.eoq) * 10 + (r.eoq / 2) * 2.5;
    expect(r.totalAnnualCost).toBeCloseTo(expected, 1);
  });

  it('reorder point = daily demand × lead time', () => {
    const r = economicOrderQuantity(2500, 50, 5, 5, 250);
    // Daily demand = 2500/250 = 10, leadTime = 5 → ROP = 50
    expect(r.reorderPoint).toBeCloseTo(50, 4);
  });

  it('higher ordering cost → higher EOQ', () => {
    const r1 = economicOrderQuantity(1000, 10, 2.5);
    const r2 = economicOrderQuantity(1000, 50, 2.5);
    expect(r2.eoq).toBeGreaterThan(r1.eoq);
  });

  it('throws for zero annual demand', () => {
    expect(() => economicOrderQuantity(0, 10, 2.5)).toThrow();
  });

  it('throws for zero holding cost', () => {
    expect(() => economicOrderQuantity(1000, 10, 0)).toThrow();
  });
});

// ─── Price optimization ───────────────────────────────────────────────────────

describe('priceOptimization', () => {
  /**
   * Elastic demand: ε = -2 (elastic)
   * Profit-maximizing price should be found via ternary search.
   * With variable cost = 0: dπ/dP = Q(1 + 1/ε) = 0 → P* = P₀/(1+1/ε) ... but with variable cost = 0 and elasticity=-2, revenue is maximized at a price where MR=0.
   */
  it('elastic demand (ε=-2): revenue maximized by lower price', () => {
    // With ε=-2, revenue decreasing above current price → optimal < current
    const r = priceOptimization(100, 1000, -2);
    // Optimal price should give higher revenue than current in elastic region
    expect(r.optimalRevenue).toBeGreaterThanOrEqual(r.currentRevenue - 0.01);
  });

  it('optimalRevenue is positive and finite', () => {
    // Solver maximizes PROFIT (not revenue); with variableCost=20, inelastic ε=-1.5
    // raises price above $50 → higher margin but lower revenue. Revenue need not be ≥ current.
    const r = priceOptimization(50, 500, -1.5, 20);
    expect(r.optimalRevenue).toBeGreaterThan(0);
    expect(Number.isFinite(r.optimalRevenue)).toBe(true);
    expect(r.optimalPrice).toBeGreaterThan(0);
  });

  it('priceDemandCurve has 21 points', () => {
    const r = priceOptimization(100, 500, -1.5);
    expect(r.priceDemandCurve).toHaveLength(21);
  });

  it('demand decreases as price increases (law of demand)', () => {
    const r = priceOptimization(100, 500, -1.5);
    const curve = r.priceDemandCurve;
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].demand).toBeLessThanOrEqual(curve[i - 1].demand + 0.01);
    }
  });

  it('throws for non-negative elasticity', () => {
    expect(() => priceOptimization(100, 500, 0)).toThrow();
  });

  it('throws for zero current demand', () => {
    expect(() => priceOptimization(100, 0, -1.5)).toThrow();
  });
});

// ─── Markdown optimization ────────────────────────────────────────────────────

describe('markdownOptimization', () => {
  it('schedule has same number of entries as markdownSteps', () => {
    const r = markdownOptimization(100, 500, 90, 5, -2.0);
    expect(r.schedule).toHaveLength(4); // default 4 steps
  });

  it('prices decrease with each markdown step', () => {
    const r = markdownOptimization(100, 500, 90, 5, -2.0);
    for (let i = 1; i < r.schedule.length; i++) {
      expect(r.schedule[i].price).toBeLessThanOrEqual(r.schedule[i - 1].price);
    }
  });

  it('expectedRevenue ≥ 0', () => {
    const r = markdownOptimization(100, 500, 90, 5, -2.0);
    expect(r.expectedRevenue).toBeGreaterThanOrEqual(0);
  });

  it('expectedUnsold ≥ 0', () => {
    const r = markdownOptimization(100, 50, 30, 2, -3.0, [10]);
    expect(r.expectedUnsold).toBeGreaterThanOrEqual(0);
  });

  it('throws for non-positive inventory', () => {
    expect(() => markdownOptimization(100, 0, 90, 5, -2)).toThrow();
  });
});

// ─── Customer Lifetime Value ──────────────────────────────────────────────────

describe('customerLifetimeValue', () => {
  /**
   * AOV=$100, freq=4/yr, lifespan=5yr, r=0.10
   * Simple CLV = 100 × 4 × 5 = $2000
   * Discounted CLV = Σ_{t=1}^{5} 400 / 1.1^t ≈ 400 × 3.791 ≈ $1516
   */
  it('simpleCLV = AOV × frequency × lifespan', () => {
    const r = customerLifetimeValue(100, 4, 5, 0.10);
    expect(r.simpleCLV).toBeCloseTo(2000, 4);
  });

  it('discountedCLV < simpleCLV for positive discount rate', () => {
    const r = customerLifetimeValue(100, 4, 5, 0.10);
    expect(r.discountedCLV).toBeLessThan(r.simpleCLV);
  });

  it('discountedCLV ≈ simpleCLV when rate = 0', () => {
    const r = customerLifetimeValue(100, 4, 5, 0);
    expect(r.discountedCLV).toBeCloseTo(r.simpleCLV, 0);
  });

  it('CLV:CAC ratio computed when CAC provided', () => {
    const r = customerLifetimeValue(100, 4, 5, 0.10, 200);
    expect(r.clvToCac).not.toBeNull();
    expect(r.clvToCac!).toBeCloseTo(r.discountedCLV / 200, 4);
  });

  it('CLV:CAC null when CAC not provided', () => {
    const r = customerLifetimeValue(100, 4, 5, 0.10);
    expect(r.clvToCac).toBeNull();
  });

  it('throws for zero AOV', () => {
    expect(() => customerLifetimeValue(0, 4, 5, 0.10)).toThrow();
  });
});

// ─── Conversion funnel ────────────────────────────────────────────────────────

describe('conversionFunnelAnalysis', () => {
  /**
   * Funnel: Visit → Cart → Checkout → Purchase
   * 10000 → 2000 → 500 → 250
   * Step conversions: 20%, 25%, 50%
   * Overall: 250/10000 = 2.5%
   */
  const stages = ['Visit', 'Cart', 'Checkout', 'Purchase'];
  const counts = [10000, 2000, 500, 250];

  it('step conversions correct', () => {
    const r = conversionFunnelAnalysis(stages, counts, 75);
    expect(r.stepConversions[0]).toBeCloseTo(0.20, 4);
    expect(r.stepConversions[1]).toBeCloseTo(0.25, 4);
    expect(r.stepConversions[2]).toBeCloseTo(0.50, 4);
  });

  it('overall conversion = final / first', () => {
    const r = conversionFunnelAnalysis(stages, counts, 75);
    expect(r.overallConversion).toBeCloseTo(0.025, 4);
  });

  it('sensitivity revenue is positive for each step', () => {
    const r = conversionFunnelAnalysis(stages, counts, 75);
    for (const s of r.sensitivityRevenue) expect(s).toBeGreaterThanOrEqual(0);
  });

  it('throws when stages.length ≠ counts.length', () => {
    expect(() => conversionFunnelAnalysis(['A', 'B'], [100], 50)).toThrow();
  });

  it('throws for fewer than 2 stages', () => {
    expect(() => conversionFunnelAnalysis(['A'], [100], 50)).toThrow();
  });
});

// ─── ABC classification ───────────────────────────────────────────────────────

describe('abcClassification', () => {
  const items = [
    { id: 'SKU-1', annualVolume: 100, unitCost: 500 },  // $50k — A
    { id: 'SKU-2', annualVolume: 500, unitCost: 20  },  // $10k — A/B
    { id: 'SKU-3', annualVolume: 1000, unitCost: 5  },  // $5k  — B
    { id: 'SKU-4', annualVolume: 5000, unitCost: 0.5 }, // $2.5k — C
    { id: 'SKU-5', annualVolume: 2000, unitCost: 0.2 }, // $400  — C
  ];

  it('class A item has highest annual value', () => {
    const r = abcClassification(items);
    expect(r.items[0].class).toBe('A');
    expect(r.items[0].id).toBe('SKU-1');
  });

  it('all items are classified', () => {
    const r = abcClassification(items);
    expect(r.items).toHaveLength(items.length);
  });

  it('class A holds the largest share of total value (Pareto principle)', () => {
    // With discrete items, class A may not hit exactly 80% — it holds up to 80% threshold
    // SKU-1 ($50k) = 73.6% of total $67.9k — class A boundary stops adding items at 80%
    const r = abcClassification(items);
    expect(r.classValuePct.A).toBeGreaterThan(50);
    expect(r.classValuePct.A + r.classValuePct.B + r.classValuePct.C).toBeCloseTo(100, 4);
  });

  it('cumulative % is monotonically increasing', () => {
    const r = abcClassification(items);
    for (let i = 1; i < r.items.length; i++) {
      expect(r.items[i].cumulativePct).toBeGreaterThanOrEqual(r.items[i - 1].cumulativePct);
    }
  });

  it('throws for empty items', () => {
    expect(() => abcClassification([])).toThrow();
  });
});

// ─── Inventory metrics ────────────────────────────────────────────────────────

describe('inventoryMetrics', () => {
  /**
   * COGS=$500k, avg inventory=$100k → turnover=5, DSI=73 days
   */
  it('inventory turnover = COGS / avgInventory', () => {
    const r = inventoryMetrics(500_000, 100_000);
    expect(r.inventoryTurnover).toBeCloseTo(5, 5);
  });

  it('DSI = 365 / turnover', () => {
    const r = inventoryMetrics(500_000, 100_000);
    expect(r.dsi).toBeCloseTo(365 / 5, 4);
  });

  it('withinTarget=true when DSI ≤ targetDsi', () => {
    const r = inventoryMetrics(500_000, 100_000, 90);
    expect(r.withinTarget).toBe(true);
  });

  it('withinTarget=false when DSI > targetDsi', () => {
    const r = inventoryMetrics(100_000, 100_000, 30); // DSI=365 > 30
    expect(r.withinTarget).toBe(false);
  });

  it('throws for zero COGS', () => {
    expect(() => inventoryMetrics(0, 100_000)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildRetailReceipt', () => {
  it('produces receipt with plugin=retail-ecommerce and CAEL event', () => {
    const eoq = economicOrderQuantity(1000, 10, 2.5);
    const receipt = buildRetailReceipt({ eoq, converged: true });
    expect(receipt.plugin).toBe('retail-ecommerce');
    expect(receipt.cael.event).toBe('retail_ecommerce.retail_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for healthy metrics', () => {
    const clv = customerLifetimeValue(200, 5, 3, 0.10, 150); // CLV:CAC ≈ 3+
    const receipt = buildRetailReceipt({ clv, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when CLV:CAC < 3', () => {
    const clv = customerLifetimeValue(50, 1, 1, 0.10, 500); // poor CLV:CAC
    const receipt = buildRetailReceipt({ clv, converged: true });
    if (clv.clvToCac! < 3) {
      expect(receipt.acceptance.accepted).toBe(false);
      expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
    }
  });

  it('uses provided runId', () => {
    const receipt = buildRetailReceipt({ converged: true }, { runId: 'retail-run-42' });
    expect(receipt.runId).toBe('retail-run-42');
  });
});
