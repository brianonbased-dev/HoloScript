import { describe, it, expect } from 'vitest';

import { CreatorRevenueAggregator } from './CreatorRevenueAggregator';
import {
  computeUrbanSimulationGrossMicroUsdc,
  recordUrbanPlanningSimulationRevenue,
  URBAN_PLANNING_ECONOMY_PLUGIN_ID,
} from './urbanPlanningEconomyBridge';

describe('urbanPlanningEconomyBridge', () => {
  it('computes gross from parcel count and density', () => {
    expect(computeUrbanSimulationGrossMicroUsdc(2, 'low')).toBe(100_000);
    expect(computeUrbanSimulationGrossMicroUsdc(1, 'medium')).toBe(120_000);
  });

  it('caps gross at MAX_GROSS_MICRO', () => {
    expect(computeUrbanSimulationGrossMicroUsdc(100_000, 'high')).toBe(2_000_000);
  });

  it('returns null and does not record when parcel count yields zero gross', () => {
    const agg = new CreatorRevenueAggregator();
    const ev = recordUrbanPlanningSimulationRevenue(agg, {
      creatorId: 'c1',
      payerId: 'p1',
      simulatedParcels: 0,
      densityClass: 'high',
    });
    expect(ev).toBeNull();
  });

  it('records revenue with stable plugin id', () => {
    const agg = new CreatorRevenueAggregator({ platformFeeRate: 0.1 });
    const ev = recordUrbanPlanningSimulationRevenue(agg, {
      creatorId: 'c1',
      payerId: 'p1',
      simulatedParcels: 1,
      densityClass: 'medium',
    });
    expect(ev).not.toBeNull();
    expect(ev!.pluginId).toBe(URBAN_PLANNING_ECONOMY_PLUGIN_ID);
    expect(ev!.grossAmount).toBe(120_000);
    expect(ev!.platformFee).toBe(12_000);
  });
});
