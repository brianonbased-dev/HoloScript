/**
 * Energy grid solver tests — energy-grid-plugin
 *
 * Reference values verified against:
 *  - Glover J, Sarma M, Overbye T (2011) Power Systems Analysis and Design.
 *  - IEEE Std 1366-2012 (SAIDI/SAIFI definitions)
 *  - IPCC AR6 emission factors
 */

import { describe, it, expect } from 'vitest';
import {
  dcLoadFlow,
  renewableDispatch,
  batterySoC,
  gridReliability,
  carbonIntensity,
  buildEnergyReceipt,
} from '../energysolver';

// ─── DC Load Flow ─────────────────────────────────────────────────────────────

describe('dcLoadFlow', () => {
  const buses = [
    { id: 'S', powerMW: 0, isSlack: true },
    { id: 'G', powerMW: 100 },
    { id: 'L', powerMW: -80 },
  ];
  const branches = [
    { fromBusId: 'S', toBusId: 'G', reactancePu: 0.1 },
    { fromBusId: 'G', toBusId: 'L', reactancePu: 0.15 },
  ];

  it('returns angles for all buses', () => {
    const r = dcLoadFlow(buses, branches);
    expect(Object.keys(r.angles)).toHaveLength(buses.length);
  });

  it('slack bus angle = 0', () => {
    const r = dcLoadFlow(buses, branches);
    expect(r.angles['S']).toBe(0);
  });

  it('flow count = branch count', () => {
    const r = dcLoadFlow(buses, branches);
    expect(r.flows).toHaveLength(branches.length);
  });

  it('totalGenerationMW > 0', () => {
    const r = dcLoadFlow(buses, branches);
    expect(r.totalGenerationMW).toBeGreaterThan(0);
  });

  it('totalLoadMW > 0', () => {
    const r = dcLoadFlow(buses, branches);
    expect(r.totalLoadMW).toBeGreaterThan(0);
  });

  it('throws with no buses', () => {
    expect(() => dcLoadFlow([], branches)).toThrow();
  });

  it('throws with no slack bus', () => {
    const noSlack = [{ id: 'A', powerMW: 50 }];
    expect(() => dcLoadFlow(noSlack, [])).toThrow();
  });
});

// ─── Merit-Order Dispatch ─────────────────────────────────────────────────────

describe('renewableDispatch', () => {
  const generators = [
    { id: 'solar', type: 'solar' as const, marginalCostPerMWh: 0,   capacityMW: 200, co2IntensityGco2Kwh: 0  },
    { id: 'wind',  type: 'wind'  as const, marginalCostPerMWh: 5,   capacityMW: 150, co2IntensityGco2Kwh: 0  },
    { id: 'gas',   type: 'gas'   as const, marginalCostPerMWh: 60,  capacityMW: 300, co2IntensityGco2Kwh: 490 },
    { id: 'coal',  type: 'coal'  as const, marginalCostPerMWh: 40,  capacityMW: 200, co2IntensityGco2Kwh: 820 },
  ];

  it('cheapest generator dispatched first', () => {
    const r = renewableDispatch(generators, 100);
    expect(r.dispatched[0].id).toBe('solar');
  });

  it('total dispatched ≤ demand when sufficient capacity', () => {
    const r = renewableDispatch(generators, 300);
    const dispatched = r.dispatched.reduce((s, d) => s + d.dispatchedMW, 0);
    expect(dispatched).toBeCloseTo(300, 1);
    expect(r.unmetDemandMW).toBeCloseTo(0, 4);
  });

  it('unmetDemandMW > 0 when capacity insufficient', () => {
    const r = renewableDispatch(generators, 1000); // total cap = 850
    expect(r.unmetDemandMW).toBeGreaterThan(0);
  });

  it('total dispatched per generator ≤ its capacity', () => {
    const r = renewableDispatch(generators, 400);
    for (const d of r.dispatched) {
      const gen = generators.find(g => g.id === d.id)!;
      expect(d.dispatchedMW).toBeLessThanOrEqual(gen.capacityMW + 0.01);
    }
  });

  it('throws for empty generators', () => {
    expect(() => renewableDispatch([], 100)).toThrow();
  });

  it('throws for non-positive demand', () => {
    expect(() => renewableDispatch(generators, 0)).toThrow();
  });
});

// ─── Battery SoC ─────────────────────────────────────────────────────────────

describe('batterySoC', () => {
  it('SoC stays in [0, 1] throughout', () => {
    const netMWh = [50, 50, -80, -80, 30, -30, 20];
    const r = batterySoC(100, 0.5, netMWh);
    for (const soc of r.socTrace) {
      expect(soc).toBeGreaterThanOrEqual(0);
      expect(soc).toBeLessThanOrEqual(1);
    }
  });

  it('socTrace length = hourlyNetMWh.length + 1 (includes initial)', () => {
    const r = batterySoC(100, 0.5, [10, -10, 5]);
    expect(r.socTrace).toHaveLength(4);
  });

  it('charging from 0 increases SoC', () => {
    const r = batterySoC(100, 0, [50]);
    expect(r.finalSoC).toBeGreaterThan(0);
  });

  it('discharging from full decreases SoC', () => {
    const r = batterySoC(100, 1.0, [-50]);
    expect(r.finalSoC).toBeLessThan(1.0);
  });

  it('equivalent cycles = throughput / (2 × capacity)', () => {
    const r = batterySoC(100, 0.5, [50, -50]);
    expect(r.equivalentCycles).toBeCloseTo(r.energyThroughputMWh / 200, 4);
  });

  it('throws for non-positive capacity', () => {
    expect(() => batterySoC(0, 0.5, [10])).toThrow();
  });

  it('throws for SoC outside [0,1]', () => {
    expect(() => batterySoC(100, 1.5, [10])).toThrow();
  });
});

// ─── Grid Reliability ─────────────────────────────────────────────────────────

describe('gridReliability', () => {
  /**
   * 1000 customers, 2 outages: (200 customers × 4h) + (100 customers × 2h)
   * SAIDI = (800 + 200) / 1000 = 1.0 h
   * SAIFI = (200 + 100) / 1000 = 0.3
   * ASAI  = 1 - 1.0/8760 ≈ 0.99989
   */
  it('SAIDI = Σ(customers × duration) / total', () => {
    const events = [
      { customersAffected: 200, durationHours: 4 },
      { customersAffected: 100, durationHours: 2 },
    ];
    const r = gridReliability(events, 1000);
    expect(r.saidi).toBeCloseTo((200 * 4 + 100 * 2) / 1000, 4);
  });

  it('SAIFI = Σ(customers interrupted) / total', () => {
    const events = [
      { customersAffected: 200, durationHours: 4 },
      { customersAffected: 100, durationHours: 2 },
    ];
    const r = gridReliability(events, 1000);
    expect(r.saifi).toBeCloseTo(300 / 1000, 4);
  });

  it('ASAI = 1 − SAIDI/8760', () => {
    const events = [{ customersAffected: 500, durationHours: 2 }];
    const r = gridReliability(events, 1000);
    expect(r.asai).toBeCloseTo(1 - r.saidi / 8760, 6);
  });

  it('no outages → SAIDI=0, ASAI=1', () => {
    const r = gridReliability([], 1000);
    expect(r.saidi).toBe(0);
    expect(r.asai).toBe(1);
  });

  it('throws for zero customers', () => {
    expect(() => gridReliability([], 0)).toThrow();
  });
});

// ─── Carbon Intensity ─────────────────────────────────────────────────────────

describe('carbonIntensity', () => {
  const generators = [
    { id: 'solar', type: 'solar' as const, marginalCostPerMWh: 0, capacityMW: 100, co2IntensityGco2Kwh: 0 },
    { id: 'gas',   type: 'gas'   as const, marginalCostPerMWh: 60, capacityMW: 100, co2IntensityGco2Kwh: 490 },
  ];

  it('100% solar → zero carbon intensity', () => {
    const dispatch = renewableDispatch(generators, 80); // only solar dispatched
    const r = carbonIntensity(generators, dispatch);
    expect(r.intensityGco2Kwh).toBeCloseTo(0, 1);
  });

  it('mixed dispatch → intensity between 0 and max', () => {
    const dispatch = renewableDispatch(generators, 180); // both dispatched
    const r = carbonIntensity(generators, dispatch);
    expect(r.intensityGco2Kwh).toBeGreaterThan(0);
    expect(r.intensityGco2Kwh).toBeLessThan(490);
  });

  it('totalCo2Tonnes > 0 when gas is dispatched', () => {
    const dispatch = renewableDispatch(generators, 150);
    const r = carbonIntensity(generators, dispatch);
    expect(r.totalCo2Tonnes).toBeGreaterThan(0);
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildEnergyReceipt', () => {
  it('plugin=energy-grid and CAEL event correct', () => {
    const receipt = buildEnergyReceipt({ converged: true });
    expect(receipt.plugin).toBe('energy-grid');
    expect(receipt.cael.event).toBe('energy_grid.grid_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for balanced grid', () => {
    const generators = [
      { id: 'solar', type: 'solar' as const, marginalCostPerMWh: 0, capacityMW: 500, co2IntensityGco2Kwh: 0 },
    ];
    const dispatch = renewableDispatch(generators, 200);
    const receipt = buildEnergyReceipt({ dispatch, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for unmet demand', () => {
    const generators = [
      { id: 'solar', type: 'solar' as const, marginalCostPerMWh: 0, capacityMW: 50, co2IntensityGco2Kwh: 0 },
    ];
    const dispatch = renewableDispatch(generators, 200);
    expect(dispatch.unmetDemandMW).toBeGreaterThan(0);
    const receipt = buildEnergyReceipt({ dispatch, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for poor reliability (SAIDI > 2.5)', () => {
    const reliability = gridReliability(
      [{ customersAffected: 10000, durationHours: 5 }],
      1000,
    ); // SAIDI = 50 h
    const receipt = buildEnergyReceipt({ reliability, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildEnergyReceipt({ converged: true }, { runId: 'grid-run-42' });
    expect(receipt.runId).toBe('grid-run-42');
  });
});
