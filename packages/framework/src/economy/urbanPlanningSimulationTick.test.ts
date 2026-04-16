import { describe, it, expect } from 'vitest';

import { CreatorRevenueAggregator } from './CreatorRevenueAggregator';
import { UrbanPlanningSimulationEconomyDriver } from './urbanPlanningSimulationTick';

describe('UrbanPlanningSimulationEconomyDriver', () => {
  it('records revenue using density from a zoning-like tick', () => {
    const agg = new CreatorRevenueAggregator({ platformFeeRate: 0.1 });
    const driver = new UrbanPlanningSimulationEconomyDriver(agg, 'creator-1', 'payer-1');
    const ev = driver.tick({ parcelsThisTick: 2, densityClass: 'high' });
    expect(ev).not.toBeNull();
    expect(ev!.grossAmount).toBe(500_000);
  });
});
