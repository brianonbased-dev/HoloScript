/**
 * Revenue management solvers — travel-hospitality-plugin
 *
 * Implements:
 *  - Hotel yield management (EMSR-b overbooking model)
 *  - Dynamic pricing (bid-price control)
 *  - RevPAR / ADR / Occupancy analytics
 *  - Demand forecasting (exponential smoothing with seasonality)
 *  - Overbooking optimization (walk cost vs denied revenue trade-off)
 *  - Displacement cost calculation for group bookings
 *
 * References:
 *  - Littlewood K (1972) 12th AGIFORS Symposium — original yield management
 *  - Belobaba PP (1987) MIT thesis — EMSR
 *  - Cross RG (1997) Revenue Management — practical implementation
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateClass {
  /** Rate class identifier */
  id: string;
  /** Average daily rate for this class ($) */
  adr: number;
  /** Expected demand (units) */
  expectedDemand: number;
  /** Demand standard deviation */
  demandStdDev: number;
}

export interface EMSRResult {
  /** Protection levels per class (units to hold for higher classes) */
  protectionLevels: number[];
  /** Booking limits per class (open capacity for each class) */
  bookingLimits: number[];
  /** Expected revenue at optimal allocation */
  expectedRevenue: number;
  /** Rate classes (sorted high→low ADR) */
  rateClasses: RateClass[];
}

export interface RevPARResult {
  /** Rooms available */
  availableRooms: number;
  /** Rooms occupied */
  occupiedRooms: number;
  /** Occupancy rate [0,1] */
  occupancyRate: number;
  /** Average Daily Rate ($) */
  adr: number;
  /** Revenue Per Available Room = ADR × occupancy */
  revpar: number;
  /** Total room revenue ($) */
  totalRevenue: number;
}

export interface OverbookingResult {
  /** Total capacity */
  capacity: number;
  /** Optimal overbooking level (rooms above capacity) */
  overbook: number;
  /** Authorized bookings to accept */
  authorizedBookings: number;
  /** Expected no-show rate */
  noShowRate: number;
  /** Expected walk cost per displaced guest ($) */
  walkCostPerGuest: number;
  /** Expected total walk cost */
  expectedWalkCost: number;
  /** Expected revenue gain from overbooking vs no overbooking */
  expectedRevenueGain: number;
}

export interface GroupDisplacementResult {
  /** Group ADR */
  groupAdr: number;
  /** Group room-nights */
  groupRoomNights: number;
  /** Estimated transient ADR displaced */
  transientAdr: number;
  /** Displacement cost = (transientAdr - groupAdr) × roomNights */
  displacementCost: number;
  /** Net value: group revenue − displacement cost */
  netValue: number;
  /** Whether group booking is profitable */
  profitable: boolean;
}

export interface HotelForecastResult {
  historical: number[];
  forecast: number[];
  /** Seasonal indices (7-day weekly pattern) */
  seasonalIndices: number[];
  rmse: number;
}

export interface RevenueReceiptOptions {
  runId?: string;
}

// ─── EMSR-b yield management ──────────────────────────────────────────────────

/** Normal CDF approximation (Abramowitz & Stegun) */
function normalCDF(x: number): number {
  if (x < -6) return 0;
  if (x > 6) return 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const poly = ((((a5 * t + a4) * t) + a3) * t + a2) * t + a1;
  const erfVal = 1 - poly * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erfVal);
}

/** Littlewood's rule: P(demand ≥ x) ≥ r_low/r_high → protect x seats for high class */
function littlewoodProtection(
  rLow: number,
  rHigh: number,
  mu: number,
  sigma: number,
): number {
  // Find x such that P(D_high ≥ x) = r_low / r_high
  const threshold = rLow / rHigh;
  // P(D ≥ x) = 1 - Φ((x - μ)/σ)
  // 1 - Φ(z) = threshold → z = Φ⁻¹(1 - threshold)
  // Approximate Φ⁻¹ via rational approximation
  const p = 1 - threshold;
  const z = normInvApprox(p);
  return Math.max(0, Math.round(mu + sigma * z));
}

/** Approximate normal quantile (Peter Acklam's approximation) */
function normInvApprox(p: number): number {
  if (p <= 0) return -6;
  if (p >= 1) return 6;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
              1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
              6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
              -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;

  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * EMSR-b (Expected Marginal Seat Revenue-b) multi-class yield management.
 * Rate classes must be provided in any order; sorted high→low ADR internally.
 * capacity: total rooms available.
 */
export function emsrYieldManagement(
  capacity: number,
  rateClasses: RateClass[],
): EMSRResult {
  if (capacity <= 0) throw new Error('capacity must be positive');
  if (rateClasses.length === 0) throw new Error('At least one rate class required');

  // Sort descending by ADR
  const sorted = [...rateClasses].sort((a, b) => b.adr - a.adr);

  const protectionLevels: number[] = [];
  const bookingLimits: number[] = [];

  // EMSR-b: aggregate demand from classes j+1..n and find protection for class j
  for (let j = 0; j < sorted.length - 1; j++) {
    const r_j   = sorted[j].adr;       // higher class fare
    const r_j1  = sorted[j + 1].adr;   // lower class fare

    // Aggregate demand for classes 0..j (high-value classes)
    let aggMu = 0, aggVar = 0;
    for (let k = 0; k <= j; k++) {
      aggMu  += sorted[k].expectedDemand;
      aggVar += sorted[k].demandStdDev ** 2;
    }
    const aggSigma = Math.sqrt(aggVar);

    const prot = littlewoodProtection(r_j1, r_j, aggMu, aggSigma);
    protectionLevels.push(prot);
  }
  protectionLevels.push(0); // lowest class has no protection

  // Booking limits: cumulative from lowest to highest
  let remaining = capacity;
  const bls: number[] = new Array(sorted.length).fill(0);
  for (let j = sorted.length - 1; j >= 0; j--) {
    const protect = j > 0 ? protectionLevels[j - 1] : 0;
    bls[j] = Math.max(0, remaining - protect);
    remaining = Math.max(0, remaining - sorted[j].expectedDemand);
  }

  // Expected revenue estimate
  let expectedRevenue = 0;
  for (let j = 0; j < sorted.length; j++) {
    const expectedSales = Math.min(sorted[j].expectedDemand, bls[j]);
    expectedRevenue += expectedSales * sorted[j].adr;
  }

  return { protectionLevels, bookingLimits: bls, expectedRevenue, rateClasses: sorted };
}

// ─── RevPAR / ADR / Occupancy ─────────────────────────────────────────────────

export function revparAnalysis(
  availableRooms: number,
  occupiedRooms: number,
  totalRevenue: number,
): RevPARResult {
  if (availableRooms <= 0) throw new Error('availableRooms must be positive');
  if (occupiedRooms < 0) throw new Error('occupiedRooms must be non-negative');
  if (occupiedRooms > availableRooms) throw new Error('occupiedRooms cannot exceed availableRooms');
  if (totalRevenue < 0) throw new Error('totalRevenue must be non-negative');

  const occupancyRate = occupiedRooms / availableRooms;
  const adr = occupiedRooms > 0 ? totalRevenue / occupiedRooms : 0;
  const revpar = adr * occupancyRate;

  return { availableRooms, occupiedRooms, occupancyRate, adr, revpar, totalRevenue };
}

// ─── Overbooking optimization ─────────────────────────────────────────────────

/**
 * Optimal overbooking level using newsvendor-style model.
 * Overbook = Q such that P(no-shows ≥ overbook) = walkCost / (revenue + walkCost)
 *
 * No-show count modeled as Binomial(n+overbook, noShowRate) ≈ Normal.
 */
export function overbookingOptimization(
  capacity: number,
  noShowRate: number,
  adr: number,
  walkCostPerGuest: number,
  expectedBookings: number,
): OverbookingResult {
  if (capacity <= 0) throw new Error('capacity must be positive');
  if (noShowRate < 0 || noShowRate > 1) throw new Error('noShowRate must be in [0, 1]');
  if (adr <= 0) throw new Error('adr must be positive');
  if (walkCostPerGuest < 0) throw new Error('walkCostPerGuest must be non-negative');

  // Critical ratio for overbooking newsvendor
  const criticalRatio = adr / (adr + walkCostPerGuest);

  // No-show distribution at bookings = capacity + overbook
  // Expected no-shows = noShowRate × bookings
  // For small overbook, find overbook* where P(no-shows ≥ overbook) = 1 - criticalRatio
  let optOverbook = 0;
  for (let ob = 0; ob <= Math.floor(capacity * 0.3); ob++) {
    const bookings = capacity + ob;
    const mu = noShowRate * bookings;
    const sigma = Math.sqrt(bookings * noShowRate * (1 - noShowRate));
    const pNoShowGe = 1 - normalCDF((ob - mu) / Math.max(sigma, 0.1));
    if (pNoShowGe < 1 - criticalRatio) {
      optOverbook = Math.max(0, ob - 1);
      break;
    }
    optOverbook = ob;
  }

  const authorizedBookings = capacity + optOverbook;
  const mu = noShowRate * authorizedBookings;
  const sigma = Math.sqrt(authorizedBookings * noShowRate * (1 - noShowRate));

  // Expected walks = E[max(0, shows - capacity)] where shows = bookings - noShows
  let expectedWalks = 0;
  for (let w = 1; w <= optOverbook + 5; w++) {
    const pWalk = 1 - normalCDF((w - 0.5 - (authorizedBookings - mu - capacity)) / Math.max(sigma, 0.1));
    expectedWalks += pWalk;
    if (pWalk < 1e-6) break;
  }
  expectedWalks = Math.max(0, expectedWalks);

  const expectedWalkCost = expectedWalks * walkCostPerGuest;
  // Revenue gain vs no-overbooking: each additional booking accepted at ADR, less expected walk cost
  const expectedRevenueGain = Math.max(0, optOverbook * adr * noShowRate - expectedWalkCost);

  return { capacity, overbook: optOverbook, authorizedBookings, noShowRate, walkCostPerGuest, expectedWalkCost, expectedRevenueGain };
}

// ─── Group displacement ───────────────────────────────────────────────────────

/**
 * Calculate whether accepting a group booking displaces more-valuable transient demand.
 */
export function groupDisplacementAnalysis(
  groupAdr: number,
  groupRoomNights: number,
  transientAdr: number,
  transientDemandProbability = 1.0,
): GroupDisplacementResult {
  if (groupAdr <= 0) throw new Error('groupAdr must be positive');
  if (groupRoomNights <= 0) throw new Error('groupRoomNights must be positive');
  if (transientAdr <= 0) throw new Error('transientAdr must be positive');

  const displacementCost = (transientAdr - groupAdr) * groupRoomNights * transientDemandProbability;
  const netValue = groupAdr * groupRoomNights - (transientAdr * groupRoomNights * transientDemandProbability);
  const profitable = netValue > 0;

  return { groupAdr, groupRoomNights, transientAdr, displacementCost, netValue, profitable };
}

// ─── Demand forecasting with weekly seasonality ───────────────────────────────

/**
 * Hotel room demand forecast using exponential smoothing + weekly seasonality indices.
 * Requires at least 14 days of history for seasonal estimation.
 */
export function hotelDemandForecast(
  historical: number[],
  forecastDays: number,
): HotelForecastResult {
  if (historical.length < 14) throw new Error('At least 14 days of history required for seasonal estimation');
  if (forecastDays < 1) throw new Error('forecastDays must be ≥ 1');

  // Estimate weekly seasonal indices (7 days)
  const seasonalIndices = Array(7).fill(0);
  const dayCounts = Array(7).fill(0);
  const overallMean = historical.reduce((a, b) => a + b, 0) / historical.length;

  historical.forEach((v, i) => {
    const dow = i % 7;
    seasonalIndices[dow] += v;
    dayCounts[dow]++;
  });
  seasonalIndices.forEach((s, i) => {
    seasonalIndices[i] = overallMean > 0 ? (s / dayCounts[i]) / overallMean : 1;
  });

  // Deseasonalise
  const deseason = historical.map((v, i) => {
    const idx = seasonalIndices[i % 7];
    return idx > 0 ? v / idx : v;
  });

  // Simple exponential smoothing on deseasonalised series (alpha=0.3)
  const alpha = 0.3;
  const s = [deseason[0]];
  for (let i = 1; i < deseason.length; i++) s.push(alpha * deseason[i] + (1 - alpha) * s[i - 1]);
  const lastLevel = s[s.length - 1];

  // RMSE on deseasonalised
  let errSum = 0;
  for (let i = 1; i < historical.length; i++) {
    errSum += (historical[i] - s[i - 1] * seasonalIndices[i % 7]) ** 2;
  }
  const rmse = Math.sqrt(errSum / (historical.length - 1));

  // Forecast
  const startDow = historical.length % 7;
  const forecast = Array.from({ length: forecastDays }, (_, i) => {
    return Math.max(0, Math.round(lastLevel * seasonalIndices[(startDow + i) % 7]));
  });

  return { historical, forecast, seasonalIndices, rmse };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface TravelAnalysisResult {
  emsr?: EMSRResult;
  revpar?: RevPARResult;
  overbooking?: OverbookingResult;
  groupDisplacement?: GroupDisplacementResult;
  forecast?: HotelForecastResult;
  converged: true;
}

export function buildTravelReceipt(
  result: TravelAnalysisResult,
  options?: RevenueReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.revpar && result.revpar.occupancyRate < 0.40) {
    violations.push({
      criterion: 'occupancy',
      message: `Occupancy ${(result.revpar.occupancyRate * 100).toFixed(1)}% is critically low (<40%)`,
    });
  }
  if (result.groupDisplacement && !result.groupDisplacement.profitable) {
    violations.push({
      criterion: 'group_displacement',
      message: `Group booking net value is negative ($${result.groupDisplacement.netValue.toFixed(0)}) — displaces more valuable transient demand`,
    });
  }

  return buildDomainSimulationReceipt({
    plugin: 'travel-hospitality',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `travel-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'revenue-management', scale: 'property' },
    resultSummary: {
      revpar: result.revpar?.revpar,
      occupancyRate: result.revpar?.occupancyRate,
      emsrExpectedRevenue: result.emsr?.expectedRevenue,
      overbookLevel: result.overbooking?.overbook,
    },
    cael: { version: 'cael.v1', event: 'travel_hospitality.revenue_management', solverType: 'travel-hospitality.emsr-b' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
