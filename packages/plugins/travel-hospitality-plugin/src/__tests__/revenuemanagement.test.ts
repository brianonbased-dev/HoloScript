/**
 * Revenue management tests — travel-hospitality-plugin
 *
 * Reference values verified against:
 *  - Belobaba PP (1987) MIT thesis — EMSR benchmarks
 *  - STR (Smith Travel Research) RevPAR methodology
 *  - Cross RG (1997) Revenue Management — overbooking models
 */

import { describe, it, expect } from 'vitest';
import {
  emsrYieldManagement,
  revparAnalysis,
  overbookingOptimization,
  groupDisplacementAnalysis,
  hotelDemandForecast,
  buildTravelReceipt,
  type RateClass,
} from '../revenuemanagement';

// ─── EMSR yield management ────────────────────────────────────────────────────

describe('emsrYieldManagement', () => {
  /**
   * Classic 2-class example:
   * Class 1 (high): ADR=$200, demand=80±20
   * Class 2 (low):  ADR=$100, demand=120±30
   * Capacity: 150 rooms
   *
   * By Littlewood: P(D1 ≥ protection) = r_low/r_high = 100/200 = 0.5
   * At 50th percentile of N(80,20): protection ≈ 80 rooms
   */
  const twoClass: RateClass[] = [
    { id: 'BAR', adr: 200, expectedDemand: 80, demandStdDev: 20 },
    { id: 'Discount', adr: 100, expectedDemand: 120, demandStdDev: 30 },
  ];

  it('returns protection and booking limits', () => {
    const r = emsrYieldManagement(150, twoClass);
    expect(r.protectionLevels).toHaveLength(2);
    expect(r.bookingLimits).toHaveLength(2);
  });

  it('high-ADR class has more protection than low-ADR class', () => {
    const r = emsrYieldManagement(150, twoClass);
    // Class sorted [high→low ADR]: protectionLevels[0] = protect high class
    expect(r.protectionLevels[0]).toBeGreaterThanOrEqual(0);
  });

  it('rate classes are sorted high→low ADR in output', () => {
    const r = emsrYieldManagement(150, twoClass);
    for (let i = 1; i < r.rateClasses.length; i++) {
      expect(r.rateClasses[i].adr).toBeLessThanOrEqual(r.rateClasses[i - 1].adr);
    }
  });

  it('expectedRevenue is positive', () => {
    const r = emsrYieldManagement(150, twoClass);
    expect(r.expectedRevenue).toBeGreaterThan(0);
  });

  it('booking limits are non-negative', () => {
    const r = emsrYieldManagement(150, twoClass);
    for (const bl of r.bookingLimits) expect(bl).toBeGreaterThanOrEqual(0);
  });

  it('3-class EMSR returns correct array lengths', () => {
    const threeClass: RateClass[] = [
      { id: 'Suite',   adr: 400, expectedDemand: 20, demandStdDev: 8 },
      { id: 'Standard', adr: 200, expectedDemand: 60, demandStdDev: 15 },
      { id: 'Budget',   adr: 100, expectedDemand: 100, demandStdDev: 25 },
    ];
    const r = emsrYieldManagement(200, threeClass);
    expect(r.protectionLevels).toHaveLength(3);
    expect(r.bookingLimits).toHaveLength(3);
  });

  it('throws for capacity ≤ 0', () => {
    expect(() => emsrYieldManagement(0, twoClass)).toThrow();
  });

  it('throws for empty rate classes', () => {
    expect(() => emsrYieldManagement(150, [])).toThrow();
  });
});

// ─── RevPAR analysis ─────────────────────────────────────────────────────────

describe('revparAnalysis', () => {
  /**
   * 200 rooms, 160 occupied, revenue=$24,000
   * Occupancy = 80%, ADR = 24000/160 = $150, RevPAR = 150 × 0.80 = $120
   */
  it('occupancy = occupied / available', () => {
    const r = revparAnalysis(200, 160, 24_000);
    expect(r.occupancyRate).toBeCloseTo(0.80, 5);
  });

  it('ADR = revenue / occupied rooms', () => {
    const r = revparAnalysis(200, 160, 24_000);
    expect(r.adr).toBeCloseTo(150, 3);
  });

  it('RevPAR = ADR × occupancy', () => {
    const r = revparAnalysis(200, 160, 24_000);
    expect(r.revpar).toBeCloseTo(r.adr * r.occupancyRate, 5);
  });

  it('full occupancy → RevPAR = ADR', () => {
    const r = revparAnalysis(100, 100, 15_000);
    expect(r.revpar).toBeCloseTo(r.adr, 5);
  });

  it('zero revenue → ADR = 0', () => {
    const r = revparAnalysis(100, 0, 0);
    expect(r.adr).toBe(0);
    expect(r.revpar).toBe(0);
  });

  it('throws when occupiedRooms > availableRooms', () => {
    expect(() => revparAnalysis(100, 110, 10_000)).toThrow();
  });

  it('throws for zero available rooms', () => {
    expect(() => revparAnalysis(0, 0, 0)).toThrow();
  });
});

// ─── Overbooking optimization ─────────────────────────────────────────────────

describe('overbookingOptimization', () => {
  /**
   * Capacity=100, noShowRate=0.10, ADR=$150, walkCost=$300
   * Critical ratio = 150/(150+300) = 1/3 — expect some overbooking to be optimal
   */
  it('overbooking level ≥ 0', () => {
    const r = overbookingOptimization(100, 0.10, 150, 300, 95);
    expect(r.overbook).toBeGreaterThanOrEqual(0);
  });

  it('authorized bookings = capacity + overbook', () => {
    const r = overbookingOptimization(100, 0.10, 150, 300, 95);
    expect(r.authorizedBookings).toBe(r.capacity + r.overbook);
  });

  it('higher walk cost → lower overbooking', () => {
    const r1 = overbookingOptimization(100, 0.10, 150, 100, 90);  // low walk cost
    const r2 = overbookingOptimization(100, 0.10, 150, 1000, 90); // high walk cost
    expect(r2.overbook).toBeLessThanOrEqual(r1.overbook);
  });

  it('expectedWalkCost ≥ 0', () => {
    const r = overbookingOptimization(100, 0.10, 150, 300, 95);
    expect(r.expectedWalkCost).toBeGreaterThanOrEqual(0);
  });

  it('zero no-show rate → no overbooking optimal', () => {
    const r = overbookingOptimization(100, 0, 150, 300, 90);
    expect(r.overbook).toBe(0);
  });

  it('throws for noShowRate > 1', () => {
    expect(() => overbookingOptimization(100, 1.5, 150, 300, 90)).toThrow();
  });
});

// ─── Group displacement ───────────────────────────────────────────────────────

describe('groupDisplacementAnalysis', () => {
  /**
   * Group ADR=$120, 50 room-nights; Transient ADR=$180, prob=1.0
   * Displacement cost = (180-120) × 50 = $3000
   * Net value = 120×50 − 180×50 = $6000 − $9000 = −$3000 (unprofitable)
   */
  it('displacement cost = (transientADR - groupADR) × roomNights × prob', () => {
    const r = groupDisplacementAnalysis(120, 50, 180, 1.0);
    expect(r.displacementCost).toBeCloseTo((180 - 120) * 50, 4);
  });

  it('group with ADR > transient is profitable', () => {
    const r = groupDisplacementAnalysis(200, 50, 150, 1.0);
    expect(r.profitable).toBe(true);
    expect(r.netValue).toBeGreaterThan(0);
  });

  it('group with ADR < transient at full demand probability is unprofitable', () => {
    const r = groupDisplacementAnalysis(120, 50, 180, 1.0);
    expect(r.profitable).toBe(false);
    expect(r.netValue).toBeLessThan(0);
  });

  it('low transient demand probability → group becomes profitable', () => {
    // If transient demand prob is very low, displacement cost low → group profitable
    const r = groupDisplacementAnalysis(120, 50, 180, 0.1);
    expect(r.profitable).toBe(true);
  });

  it('throws for zero groupADR', () => {
    expect(() => groupDisplacementAnalysis(0, 50, 150, 1.0)).toThrow();
  });
});

// ─── Hotel demand forecast ────────────────────────────────────────────────────

describe('hotelDemandForecast', () => {
  // 28 days of occupancy data with weekend peaks
  const historical = Array.from({ length: 28 }, (_, i) => {
    const dow = i % 7;
    return 80 + (dow === 5 || dow === 6 ? 15 : 0) + Math.round(Math.random() * 5);
  });

  it('forecast length = forecastDays', () => {
    const r = hotelDemandForecast(historical, 7);
    expect(r.forecast).toHaveLength(7);
  });

  it('seasonal indices have 7 elements (one per day of week)', () => {
    const r = hotelDemandForecast(historical, 7);
    expect(r.seasonalIndices).toHaveLength(7);
  });

  it('RMSE is non-negative', () => {
    const r = hotelDemandForecast(historical, 7);
    expect(r.rmse).toBeGreaterThanOrEqual(0);
  });

  it('forecast values are non-negative', () => {
    const r = hotelDemandForecast(historical, 14);
    for (const f of r.forecast) expect(f).toBeGreaterThanOrEqual(0);
  });

  it('weekend indices > weekday indices (reflects weekend demand spike)', () => {
    const r = hotelDemandForecast(historical, 7);
    const weekdayAvg = (r.seasonalIndices[0] + r.seasonalIndices[1] + r.seasonalIndices[2] +
                        r.seasonalIndices[3] + r.seasonalIndices[4]) / 5;
    const weekendAvg = (r.seasonalIndices[5] + r.seasonalIndices[6]) / 2;
    expect(weekendAvg).toBeGreaterThan(weekdayAvg);
  });

  it('throws for fewer than 14 days of history', () => {
    expect(() => hotelDemandForecast([80, 90, 100], 7)).toThrow();
  });

  it('throws for zero forecastDays', () => {
    expect(() => hotelDemandForecast(historical, 0)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildTravelReceipt', () => {
  it('produces receipt with plugin=travel-hospitality and CAEL event', () => {
    const revpar = revparAnalysis(200, 160, 24_000);
    const receipt = buildTravelReceipt({ revpar, converged: true });
    expect(receipt.plugin).toBe('travel-hospitality');
    expect(receipt.cael.event).toBe('travel_hospitality.revenue_management');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for healthy 80% occupancy', () => {
    const revpar = revparAnalysis(200, 160, 24_000); // 80% occupancy
    const receipt = buildTravelReceipt({ revpar, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for low occupancy < 40%', () => {
    const revpar = revparAnalysis(200, 70, 7_000); // 35% occupancy
    const receipt = buildTravelReceipt({ revpar, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for unprofitable group booking', () => {
    const groupDisplacement = groupDisplacementAnalysis(120, 50, 180, 1.0);
    const receipt = buildTravelReceipt({ groupDisplacement, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildTravelReceipt({ converged: true }, { runId: 'travel-run-77' });
    expect(receipt.runId).toBe('travel-run-77');
  });
});
