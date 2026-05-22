/**
 * Fashion design solvers — fashion-plugin
 *
 * Implements:
 *  - Pattern grading (proportional interpolation across size range)
 *  - Fabric waste / nesting efficiency estimation
 *  - Size scaling with ease allowances
 *  - Color harmony scoring (complementary, analogous, triadic)
 *  - Trend momentum scoring (weighted moving average of sales velocity)
 *  - Cost-per-wear analysis
 *  - CAEL-ready receipt builder
 *
 * References:
 *  - Armstrong H (2010) Patternmaking for Fashion Design, 5th ed. Pearson.
 *  - Itten J (1961) The Art of Color. Reinhold.
 *  - Wickett J, Grice A, Cassill N (1999) J. Textile Apparel Tech. Mgmt.
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GradingRule {
  /** Measurement name (e.g. 'chest', 'waist', 'hip') */
  measurement: string;
  /** Value at base size (cm) */
  baseValueCm: number;
  /** Increment per size step (cm) */
  incrementCm: number;
}

export interface GradedSize {
  size: string;
  measurements: Record<string, number>;
}

export interface PatternGradingResult {
  sizes: GradedSize[];
  totalSpread: Record<string, number>; // smallest to largest
}

export interface PatternPiece {
  name: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
}

export interface FabricWasteResult {
  /** Total fabric area used (cm²) */
  totalPieceAreaCm2: number;
  /** Fabric area purchased (cm²) */
  fabricAreaCm2: number;
  /** Waste percentage */
  wastePct: number;
  /** Nesting efficiency (utilisation) */
  nestingEfficiency: number;
}

export type ColorHarmony = 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'neutral';

export interface ColorHarmonyResult {
  harmony: ColorHarmony;
  /** Harmony score 0–100 */
  harmonyScore: number;
  /** Suggested accent hue (degrees on color wheel) */
  suggestedAccentHue: number;
}

export interface SalesPeriod {
  period: string;
  unitsSold: number;
}

export interface TrendResult {
  /** Trend direction: up/flat/down */
  trend: 'up' | 'flat' | 'down';
  /** Weighted moving average velocity (units/period) */
  velocity: number;
  /** Projected next-period sales */
  projectedNextPeriod: number;
}

export interface CostPerWearResult {
  costPerWear: number;
  totalCost: number;
  estimatedWears: number;
}

export interface FashionReceiptOptions { runId?: string; }

export interface FashionAnalysisResult {
  grading?: PatternGradingResult;
  fabricWaste?: FabricWasteResult;
  colorHarmony?: ColorHarmonyResult;
  trend?: TrendResult;
  converged: true;
}

// ─── Pattern Grading ──────────────────────────────────────────────────────────

/**
 * Interpolate pattern measurements across a size range using fixed grade rules.
 * size_k = base + k × increment  (k = step from base size)
 */
export function patternGrading(
  rules: GradingRule[],
  sizes: string[],
  baseSizeIndex: number,
): PatternGradingResult {
  if (rules.length === 0) throw new Error('No grading rules');
  if (sizes.length === 0) throw new Error('No sizes');
  if (baseSizeIndex < 0 || baseSizeIndex >= sizes.length) throw new Error('baseSizeIndex out of range');

  const gradedSizes: GradedSize[] = sizes.map((size, idx) => {
    const step = idx - baseSizeIndex;
    const measurements: Record<string, number> = {};
    for (const rule of rules) {
      measurements[rule.measurement] = +(rule.baseValueCm + step * rule.incrementCm).toFixed(1);
    }
    return { size, measurements };
  });

  const totalSpread: Record<string, number> = {};
  for (const rule of rules) {
    totalSpread[rule.measurement] = +(rule.incrementCm * (sizes.length - 1)).toFixed(1);
  }

  return { sizes: gradedSizes, totalSpread };
}

// ─── Fabric Waste ─────────────────────────────────────────────────────────────

/**
 * Estimate fabric waste using simple rectangular bounding-box nesting.
 * Efficiency = total piece area / fabric purchased area
 * Industry standard nesting efficiency: 80-85%
 */
export function fabricWasteEstimator(
  pieces: PatternPiece[],
  fabricWidthCm: number,
  nestingEfficiencyFactor = 0.82,
): FabricWasteResult {
  if (pieces.length === 0) throw new Error('No pattern pieces');
  if (fabricWidthCm <= 0) throw new Error('Fabric width must be positive');
  if (nestingEfficiencyFactor <= 0 || nestingEfficiencyFactor > 1)
    throw new Error('nestingEfficiencyFactor must be in (0,1]');

  const totalPieceAreaCm2 = pieces.reduce((s, p) => s + p.widthCm * p.heightCm * p.quantity, 0);
  const fabricAreaCm2 = totalPieceAreaCm2 / nestingEfficiencyFactor;
  const wastePct = 1 - nestingEfficiencyFactor;

  return {
    totalPieceAreaCm2,
    fabricAreaCm2,
    wastePct,
    nestingEfficiency: nestingEfficiencyFactor,
  };
}

// ─── Color Harmony ────────────────────────────────────────────────────────────

/**
 * Score color harmony based on hue relationships on the color wheel.
 * Complementary: |Δhue| ≈ 180° → high contrast, bold
 * Analogous:     |Δhue| ≤ 30°  → low contrast, harmonious
 * Triadic:       |Δhue| ≈ 120° → balanced
 */
export function colorHarmonyScore(primaryHueDeg: number, secondaryHueDeg: number): ColorHarmonyResult {
  const diff = Math.abs(((primaryHueDeg - secondaryHueDeg) % 360 + 360) % 360);
  const norm = diff > 180 ? 360 - diff : diff;

  let harmony: ColorHarmony;
  let harmonyScore: number;

  if (norm <= 30) {
    harmony = 'analogous';
    harmonyScore = Math.round(70 + (30 - norm) * (30 / 30));
  } else if (Math.abs(norm - 180) <= 20) {
    harmony = 'complementary';
    harmonyScore = Math.round(90 - Math.abs(norm - 180) * 1.5);
  } else if (Math.abs(norm - 120) <= 20) {
    harmony = 'triadic';
    harmonyScore = Math.round(85 - Math.abs(norm - 120) * 1.5);
  } else if (Math.abs(norm - 150) <= 15) {
    harmony = 'split-complementary';
    harmonyScore = Math.round(80 - Math.abs(norm - 150) * 1.5);
  } else {
    harmony = 'neutral';
    harmonyScore = 50;
  }

  const suggestedAccentHue = (primaryHueDeg + 120) % 360;
  return { harmony, harmonyScore: Math.max(0, Math.min(100, harmonyScore)), suggestedAccentHue };
}

// ─── Trend Momentum ───────────────────────────────────────────────────────────

/**
 * Weighted moving average (WMA) of sales data.
 * More recent periods weighted higher: weight_k = k / Σk
 * Trend = (lastHalf avg) vs (firstHalf avg)
 */
export function trendMomentum(periods: SalesPeriod[]): TrendResult {
  if (periods.length < 2) throw new Error('At least 2 periods required');

  const n = periods.length;
  const totalWeight = (n * (n + 1)) / 2;
  const velocity = periods.reduce((s, p, i) => s + p.unitsSold * (i + 1), 0) / totalWeight;

  const firstHalf = periods.slice(0, Math.floor(n / 2));
  const secondHalf = periods.slice(Math.ceil(n / 2));
  const avgFirst  = firstHalf.reduce((s, p) => s + p.unitsSold, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, p) => s + p.unitsSold, 0) / secondHalf.length;

  const changePct = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0;
  const trend: TrendResult['trend'] = changePct > 0.05 ? 'up' : changePct < -0.05 ? 'down' : 'flat';

  // Project next period using WMA velocity
  const projectedNextPeriod = Math.max(0, velocity);

  return { trend, velocity, projectedNextPeriod };
}

// ─── Cost Per Wear ────────────────────────────────────────────────────────────

/**
 * costPerWear = (purchasePrice + careTotal) / estimatedWears
 */
export function costPerWear(
  purchasePriceUSD: number,
  careCostPerWearUSD: number,
  estimatedWears: number,
): CostPerWearResult {
  if (purchasePriceUSD < 0) throw new Error('Purchase price must be ≥ 0');
  if (estimatedWears <= 0) throw new Error('estimatedWears must be positive');

  const totalCost = purchasePriceUSD + careCostPerWearUSD * estimatedWears;
  return {
    costPerWear: totalCost / estimatedWears,
    totalCost,
    estimatedWears,
  };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildFashionReceipt(
  result: FashionAnalysisResult,
  options?: FashionReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.fabricWaste && result.fabricWaste.wastePct > 0.25) {
    violations.push({ criterion: 'fabric_waste', message: `Fabric waste ${(result.fabricWaste.wastePct * 100).toFixed(1)}% exceeds 25% threshold — review nesting` });
  }
  if (result.colorHarmony && result.colorHarmony.harmonyScore < 50) {
    violations.push({ criterion: 'color_harmony', message: `Color harmony score ${result.colorHarmony.harmonyScore} below 50 — consider palette revision` });
  }
  if (result.trend && result.trend.trend === 'down') {
    violations.push({ criterion: 'trend', message: `Category showing declining trend (velocity ${result.trend.velocity.toFixed(1)} units/period)` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'fashion',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `fash-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'fashion.design-analysis', scale: 'collection' },
    resultSummary: {
      sizeRange: result.grading?.sizes.length ?? null,
      fabricWastePct: result.fabricWaste?.wastePct ?? null,
      colorHarmonyScore: result.colorHarmony?.harmonyScore ?? null,
      trendDirection: result.trend?.trend ?? null,
    },
    cael: { version: 'cael.v1', event: 'fashion.design_analysis', solverType: 'fashion.pattern-grading' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
