import type { ZoningConfig } from './traits/ZoningTrait';

/**
 * Input slice for {@link UrbanPlanningSimulationEconomyDriver.tick} / `recordUrbanPlanningSimulationRevenue`
 * using live {@link ZoningConfig.density}.
 */
export function revenueTickInputFromZoning(
  zoning: Pick<ZoningConfig, 'density'>,
  parcelsThisTick: number
): { simulatedParcels: number; densityClass: ZoningConfig['density'] } {
  return {
    simulatedParcels: Math.max(0, Math.floor(parcelsThisTick)),
    densityClass: zoning.density,
  };
}
