/**
 * Urban planning ↔ live economy (CreatorRevenueAggregator / x402 micropayment layer).
 *
 * Maps simulated parcel / density workloads into USDC base-unit gross amounts so
 * `recordRevenue` can attribute plugin earnings without the urban plugin depending
 * on framework types.
 */

import type { CreatorRevenueAggregator } from './CreatorRevenueAggregator';

/** Density band for parcel simulation (aligns with urban-planning trait semantics). */
export type UrbanPlanningDensityClass = 'low' | 'medium' | 'high' | 'very_high';

/** Keep aligned with `@holoscript/plugin-urban-planning` economyBridge export. */
export const URBAN_PLANNING_ECONOMY_PLUGIN_ID = '@holoscript/plugin-urban-planning' as const;

const DENSITY_UNIT_USDC_MICRO: Record<UrbanPlanningDensityClass, number> = {
  low: 50_000,
  medium: 120_000,
  high: 250_000,
  very_high: 400_000,
};

const MAX_GROSS_MICRO = 2_000_000;

/**
 * Gross USDC (6dp / micro units) for one simulation tick: per-parcel rate × count, capped.
 */
export function computeUrbanSimulationGrossMicroUsdc(
  simulatedParcels: number,
  densityClass: UrbanPlanningDensityClass
): number {
  const n = Math.max(0, Math.floor(simulatedParcels));
  const unit = DENSITY_UNIT_USDC_MICRO[densityClass] ?? DENSITY_UNIT_USDC_MICRO.medium;
  return Math.min(n * unit, MAX_GROSS_MICRO);
}

export interface RecordUrbanPlanningSimulationInput {
  creatorId: string;
  payerId: string;
  simulatedParcels: number;
  densityClass: UrbanPlanningDensityClass;
  ledgerEntryId?: string;
}

/**
 * Records one urban-planning monetized simulation step on the aggregator (x402 ledger path).
 */
export function recordUrbanPlanningSimulationRevenue(
  aggregator: CreatorRevenueAggregator,
  input: RecordUrbanPlanningSimulationInput
) {
  const gross = computeUrbanSimulationGrossMicroUsdc(input.simulatedParcels, input.densityClass);
  if (gross <= 0) {
    return null;
  }
  return aggregator.recordRevenue(
    input.creatorId,
    URBAN_PLANNING_ECONOMY_PLUGIN_ID,
    gross,
    input.payerId,
    input.ledgerEntryId
  );
}
