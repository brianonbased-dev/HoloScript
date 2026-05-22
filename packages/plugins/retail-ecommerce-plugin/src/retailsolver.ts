/**
 * Retail & e-commerce solvers — retail-ecommerce-plugin
 *
 * Implements:
 *  - EOQ (Economic Order Quantity) inventory optimization
 *  - Demand elasticity and price optimization
 *  - Markdown optimization (progressive discounting)
 *  - Customer Lifetime Value (CLV) estimation
 *  - Conversion funnel analysis
 *  - ABC inventory classification
 *  - Days sales of inventory (DSI) and inventory turnover
 *
 * References:
 *  - Harris FW (1913) Operations and Cost — original EOQ paper
 *  - Philips RL (2005) Pricing and Revenue Optimization — demand elasticity
 *  - Fader PS et al. (2005) J.Marketing Res. — Pareto/NBD CLV model
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EOQResult {
  /** Annual demand units */
  annualDemand: number;
  /** Ordering cost per order ($) */
  orderingCost: number;
  /** Holding cost per unit per year ($) */
  holdingCostPerUnit: number;
  /** Optimal order quantity units */
  eoq: number;
  /** Number of orders per year */
  ordersPerYear: number;
  /** Total annual inventory cost ($) */
  totalAnnualCost: number;
  /** Reorder point given lead time demand */
  reorderPoint: number;
}

export interface PriceOptimizationResult {
  /** Current price */
  currentPrice: number;
  /** Price elasticity of demand (negative) */
  elasticity: number;
  /** Profit-maximizing price */
  optimalPrice: number;
  /** Revenue at current price */
  currentRevenue: number;
  /** Revenue at optimal price */
  optimalRevenue: number;
  /** Revenue uplift % */
  revenueUpliftPct: number;
  /** Price-demand curve points */
  priceDemandCurve: Array<{ price: number; demand: number; revenue: number }>;
}

export interface MarkdownResult {
  /** Original price */
  originalPrice: number;
  /** Remaining inventory units */
  inventory: number;
  /** Days until season end */
  daysRemaining: number;
  /** Optimal markdown schedule */
  schedule: Array<{ dayOfMarkdown: number; discountPct: number; price: number; expectedUnits: number }>;
  /** Expected total revenue */
  expectedRevenue: number;
  /** Expected unsold units */
  expectedUnsold: number;
}

export interface CLVResult {
  /** Average purchase value */
  avgOrderValue: number;
  /** Purchase frequency per year */
  purchaseFrequency: number;
  /** Customer lifespan years */
  lifespanYears: number;
  /** Discount rate */
  discountRate: number;
  /** Simple CLV = AOV × frequency × lifespan */
  simpleCLV: number;
  /** Discounted CLV (NPV of future purchases) */
  discountedCLV: number;
  /** CLV-to-CAC ratio (if CAC provided) */
  clvToCac: number | null;
}

export interface FunnelAnalysisResult {
  stages: string[];
  counts: number[];
  /** Conversion rate stage-to-stage */
  stepConversions: number[];
  /** Overall funnel conversion rate */
  overallConversion: number;
  /** Revenue impact of improving each step by 10pp */
  sensitivityRevenue: number[];
}

export interface ABCClassification {
  items: Array<{
    id: string;
    annualValue: number;
    cumulativePct: number;
    class: 'A' | 'B' | 'C';
  }>;
  /** Count of A, B, C items */
  classCounts: { A: number; B: number; C: number };
  /** % of total value in each class */
  classValuePct: { A: number; B: number; C: number };
}

export interface RetailReceiptOptions {
  runId?: string;
}

// ─── EOQ ─────────────────────────────────────────────────────────────────────

/**
 * Classic Economic Order Quantity (Harris-Wilson formula).
 * EOQ = √(2 × D × S / H)
 * where D = annual demand, S = ordering cost, H = holding cost per unit/year.
 */
export function economicOrderQuantity(
  annualDemand: number,
  orderingCost: number,
  holdingCostPerUnit: number,
  leadTimeDays = 0,
  workingDaysPerYear = 250,
): EOQResult {
  if (annualDemand <= 0) throw new Error('annualDemand must be positive');
  if (orderingCost <= 0) throw new Error('orderingCost must be positive');
  if (holdingCostPerUnit <= 0) throw new Error('holdingCostPerUnit must be positive');

  const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit);
  const ordersPerYear = annualDemand / eoq;
  const totalAnnualCost = (annualDemand / eoq) * orderingCost + (eoq / 2) * holdingCostPerUnit;
  const dailyDemand = annualDemand / workingDaysPerYear;
  const reorderPoint = dailyDemand * leadTimeDays;

  return { annualDemand, orderingCost, holdingCostPerUnit, eoq, ordersPerYear, totalAnnualCost, reorderPoint };
}

// ─── Price optimization via demand elasticity ─────────────────────────────────

/**
 * Optimize price using constant-elasticity demand model.
 * Q(P) = Q₀ × (P/P₀)^ε   where ε < 0 (price elasticity)
 *
 * Revenue R(P) = P × Q(P)
 * Optimal (revenue-maximizing) price: P* = P₀ / (1 + 1/ε)  [markup formula]
 * For elastic demand (ε < -1): P* < P₀ (lower price increases revenue)
 * For inelastic demand (-1 < ε < 0): P* > P₀
 *
 * Variable cost per unit optional for profit maximization.
 */
export function priceOptimization(
  currentPrice: number,
  currentDemand: number,
  elasticity: number,
  variableCost = 0,
  priceRange?: [number, number],
): PriceOptimizationResult {
  if (currentPrice <= 0) throw new Error('currentPrice must be positive');
  if (currentDemand <= 0) throw new Error('currentDemand must be positive');
  if (elasticity >= 0) throw new Error('elasticity must be negative (price-demand law)');

  const demandAt = (p: number) => currentDemand * Math.pow(p / currentPrice, elasticity);
  const revenueAt = (p: number) => p * demandAt(p);
  const profitAt  = (p: number) => (p - variableCost) * demandAt(p);

  // Profit-maximizing price via ternary search
  const pLo = priceRange ? priceRange[0] : variableCost * 1.01;
  const pHi = priceRange ? priceRange[1] : currentPrice * 3;

  let lo = Math.max(pLo, variableCost + 0.01), hi = pHi;
  for (let i = 0; i < 100; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (profitAt(m1) < profitAt(m2)) lo = m1; else hi = m2;
  }
  const optimalPrice = (lo + hi) / 2;

  const currentRevenue  = revenueAt(currentPrice);
  const optimalRevenue  = revenueAt(optimalPrice);
  const revenueUpliftPct = ((optimalRevenue - currentRevenue) / currentRevenue) * 100;

  // Price-demand curve: 20 points from 50% to 200% of current price
  const priceDemandCurve = Array.from({ length: 21 }, (_, i) => {
    const p = currentPrice * (0.5 + i * 0.075);
    return { price: p, demand: demandAt(p), revenue: revenueAt(p) };
  });

  return { currentPrice, elasticity, optimalPrice, currentRevenue, optimalRevenue, revenueUpliftPct, priceDemandCurve };
}

// ─── Markdown optimization ────────────────────────────────────────────────────

/**
 * Progressive markdown optimization using a greedy sell-through target approach.
 * Demand increases with discount depth per price elasticity.
 */
export function markdownOptimization(
  originalPrice: number,
  inventory: number,
  daysRemaining: number,
  baseDailySalesRate: number,
  elasticity: number,
  markdownSteps: number[] = [10, 20, 30, 50],
): MarkdownResult {
  if (originalPrice <= 0) throw new Error('originalPrice must be positive');
  if (inventory <= 0) throw new Error('inventory must be positive');
  if (daysRemaining < 1) throw new Error('daysRemaining must be ≥ 1');
  if (elasticity >= 0) throw new Error('elasticity must be negative');

  // Simple greedy: evenly space markdowns across remaining days
  const stepSize = Math.floor(daysRemaining / (markdownSteps.length + 1));
  let remaining = inventory;
  let totalRevenue = 0;

  const schedule: MarkdownResult['schedule'] = [];
  let currentPrice = originalPrice;
  let currentRate = baseDailySalesRate;
  let prevDay = 0;

  for (let si = 0; si < markdownSteps.length; si++) {
    const dayOfMarkdown = (si + 1) * stepSize;
    const discountPct = markdownSteps[si];
    const newPrice = originalPrice * (1 - discountPct / 100);
    // Demand boost from discount via elasticity
    const newRate = baseDailySalesRate * Math.pow(1 - discountPct / 100, elasticity);

    // Sell from prevDay to dayOfMarkdown at currentRate/price
    const daysAtCurrentPrice = dayOfMarkdown - prevDay;
    const unitsSold = Math.min(remaining, Math.round(currentRate * daysAtCurrentPrice));
    totalRevenue += unitsSold * currentPrice;
    remaining = Math.max(0, remaining - unitsSold);

    schedule.push({ dayOfMarkdown, discountPct, price: newPrice, expectedUnits: Math.round(newRate * stepSize) });

    currentPrice = newPrice;
    currentRate = newRate;
    prevDay = dayOfMarkdown;
  }

  // Final period after last markdown
  const finalDays = daysRemaining - prevDay;
  const finalUnits = Math.min(remaining, Math.round(currentRate * finalDays));
  totalRevenue += finalUnits * currentPrice;
  remaining = Math.max(0, remaining - finalUnits);

  return { originalPrice, inventory, daysRemaining, schedule, expectedRevenue: totalRevenue, expectedUnsold: remaining };
}

// ─── Customer Lifetime Value ──────────────────────────────────────────────────

/**
 * Compute CLV using simple and discounted (NPV) formulas.
 * Simple: CLV = AOV × frequency × lifespan
 * Discounted: CLV = Σ_{t=1}^{L} AOV × freq / (1+r)^t
 */
export function customerLifetimeValue(
  avgOrderValue: number,
  purchaseFrequency: number,
  lifespanYears: number,
  discountRate: number,
  cac?: number,
): CLVResult {
  if (avgOrderValue <= 0) throw new Error('avgOrderValue must be positive');
  if (purchaseFrequency <= 0) throw new Error('purchaseFrequency must be positive');
  if (lifespanYears <= 0) throw new Error('lifespanYears must be positive');
  if (discountRate < 0) throw new Error('discountRate must be non-negative');

  const simpleCLV = avgOrderValue * purchaseFrequency * lifespanYears;

  // Discounted: annual revenue / (1+r)^year, summed
  let discountedCLV = 0;
  const annualRevenue = avgOrderValue * purchaseFrequency;
  for (let y = 1; y <= Math.ceil(lifespanYears); y++) {
    const weight = Math.min(1, lifespanYears - (y - 1)); // partial last year
    discountedCLV += (weight * annualRevenue) / Math.pow(1 + discountRate, y);
  }

  const clvToCac = cac != null && cac > 0 ? discountedCLV / cac : null;

  return { avgOrderValue, purchaseFrequency, lifespanYears, discountRate, simpleCLV, discountedCLV, clvToCac };
}

// ─── Conversion funnel analysis ───────────────────────────────────────────────

/**
 * Analyze a conversion funnel and compute revenue sensitivity.
 */
export function conversionFunnelAnalysis(
  stages: string[],
  counts: number[],
  avgOrderValue: number,
): FunnelAnalysisResult {
  if (stages.length !== counts.length) throw new Error('stages and counts must have same length');
  if (stages.length < 2) throw new Error('Funnel needs at least 2 stages');
  if (counts.some(c => c < 0)) throw new Error('counts must be non-negative');
  if (avgOrderValue <= 0) throw new Error('avgOrderValue must be positive');

  const stepConversions = counts.slice(1).map((c, i) => counts[i] > 0 ? c / counts[i] : 0);
  const overallConversion = counts[0] > 0 ? counts[counts.length - 1] / counts[0] : 0;
  const currentRevenue = counts[counts.length - 1] * avgOrderValue;

  // Sensitivity: if step i conversion improves by 10pp, how much extra revenue?
  const sensitivityRevenue = stepConversions.map((conv, i) => {
    const newConv = Math.min(1, conv + 0.10);
    const upliftFactor = newConv / (conv || 1e-9);
    // Downstream: all subsequent stages are multiplied by this factor
    let newFinal = counts[i + 1] * upliftFactor;
    for (let j = i + 2; j < counts.length; j++) {
      newFinal *= (counts[j - 1] > 0 ? counts[j] / counts[j - 1] : 1);
    }
    return (newFinal - counts[counts.length - 1]) * avgOrderValue;
  });

  return { stages, counts, stepConversions, overallConversion, sensitivityRevenue };
}

// ─── ABC inventory classification ─────────────────────────────────────────────

/**
 * Classify inventory items into A/B/C tiers by annual value contribution.
 * A: top 80% of value (~20% of items)
 * B: next 15% of value
 * C: remaining 5% of value
 */
export function abcClassification(
  items: Array<{ id: string; annualVolume: number; unitCost: number }>,
): ABCClassification {
  if (items.length === 0) throw new Error('No items provided');

  const withValues = items.map(item => ({
    id: item.id,
    annualValue: item.annualVolume * item.unitCost,
  })).sort((a, b) => b.annualValue - a.annualValue);

  const totalValue = withValues.reduce((a, b) => a + b.annualValue, 0);
  let cumulative = 0;
  const classCounts = { A: 0, B: 0, C: 0 };
  const classValue  = { A: 0, B: 0, C: 0 };

  const classified = withValues.map(item => {
    cumulative += item.annualValue;
    const cumulativePct = (cumulative / totalValue) * 100;
    const cls: 'A' | 'B' | 'C' = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';
    classCounts[cls]++;
    classValue[cls] += item.annualValue;
    return { ...item, cumulativePct, class: cls };
  });

  const classValuePct = {
    A: (classValue.A / totalValue) * 100,
    B: (classValue.B / totalValue) * 100,
    C: (classValue.C / totalValue) * 100,
  };

  return { items: classified, classCounts, classValuePct };
}

// ─── Inventory turnover & DSI ─────────────────────────────────────────────────

export interface InventoryMetrics {
  /** Cost of goods sold */
  cogs: number;
  /** Average inventory value */
  avgInventory: number;
  /** Inventory turnover ratio = COGS / avg inventory */
  inventoryTurnover: number;
  /** Days sales of inventory = 365 / turnover */
  dsi: number;
  /** Target DSI (if provided) */
  targetDsi?: number;
  /** Whether current DSI is within target */
  withinTarget?: boolean;
}

export function inventoryMetrics(
  cogs: number,
  avgInventory: number,
  targetDsi?: number,
): InventoryMetrics {
  if (cogs <= 0) throw new Error('COGS must be positive');
  if (avgInventory <= 0) throw new Error('avgInventory must be positive');

  const inventoryTurnover = cogs / avgInventory;
  const dsi = 365 / inventoryTurnover;

  return {
    cogs, avgInventory, inventoryTurnover, dsi,
    targetDsi,
    withinTarget: targetDsi != null ? dsi <= targetDsi : undefined,
  };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface RetailAnalysisResult {
  eoq?: EOQResult;
  priceOpt?: PriceOptimizationResult;
  markdown?: MarkdownResult;
  clv?: CLVResult;
  funnel?: FunnelAnalysisResult;
  abc?: ABCClassification;
  inventory?: InventoryMetrics;
  converged: true;
}

export function buildRetailReceipt(
  result: RetailAnalysisResult,
  options?: RetailReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.inventory?.withinTarget === false) {
    violations.push({
      criterion: 'dsi',
      message: `DSI ${result.inventory.dsi.toFixed(1)} days exceeds target ${result.inventory.targetDsi} days`,
    });
  }
  if (result.clv?.clvToCac != null && result.clv.clvToCac < 3) {
    violations.push({
      criterion: 'clv_to_cac',
      message: `CLV:CAC ratio ${result.clv.clvToCac.toFixed(2)} is below recommended minimum of 3`,
    });
  }

  return buildDomainSimulationReceipt({
    plugin: 'retail-ecommerce',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `retail-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'retail-analytics', scale: 'store' },
    resultSummary: {
      eoq: result.eoq?.eoq ?? null,
      optimalPrice: result.priceOpt?.optimalPrice ?? null,
      revenueUpliftPct: result.priceOpt?.revenueUpliftPct ?? null,
      clv: result.clv?.discountedCLV ?? null,
      overallConversion: result.funnel?.overallConversion ?? null,
    },
    cael: { version: 'cael.v1', event: 'retail_ecommerce.retail_analysis', solverType: 'retail-ecommerce.analytics' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
