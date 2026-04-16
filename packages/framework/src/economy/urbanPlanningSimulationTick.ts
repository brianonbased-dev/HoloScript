import type { CreatorRevenueAggregator } from './CreatorRevenueAggregator';
import type { UrbanPlanningDensityClass } from './urbanPlanningEconomyBridge';
import { recordUrbanPlanningSimulationRevenue, type RecordUrbanPlanningSimulationInput } from './urbanPlanningEconomyBridge';

/**
 * Fixed creator/payer ids with a {@link CreatorRevenueAggregator}; call {@link tick}
 * once per zoning simulation step with parcel count and density from {@link ZoningConfig}.
 */
export class UrbanPlanningSimulationEconomyDriver {
  constructor(
    private readonly aggregator: CreatorRevenueAggregator,
    private readonly creatorId: string,
    private readonly payerId: string
  ) {}

  /**
   * One simulation tick: maps `densityClass` + `parcelsThisTick` into gross revenue.
   */
  tick(params: {
    parcelsThisTick: number;
    densityClass: UrbanPlanningDensityClass;
    ledgerEntryId?: string;
  }) {
    const input: RecordUrbanPlanningSimulationInput = {
      creatorId: this.creatorId,
      payerId: this.payerId,
      simulatedParcels: params.parcelsThisTick,
      densityClass: params.densityClass,
      ledgerEntryId: params.ledgerEntryId,
    };
    return recordUrbanPlanningSimulationRevenue(this.aggregator, input);
  }
}
