/** @population_density Trait — Demographic density modeling. @trait population_density */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface PopulationDensityConfig { populationCount: number; areaKm2: number; growthRatePercent: number; ageDistribution: Record<string, number>; housingUnits: number; avgHouseholdSize: number; }
export interface PopulationDensityState { densityPerKm2: number; projectedPopulation: number; housingDeficit: number; }

const defaultConfig: PopulationDensityConfig = { populationCount: 0, areaKm2: 1, growthRatePercent: 1.5, ageDistribution: {}, housingUnits: 0, avgHouseholdSize: 2.5 };

export function createPopulationDensityHandler(): TraitHandler<PopulationDensityConfig> {
  return { name: 'population_density', defaultConfig,
    onAttach(n: HSPlusNode, c: PopulationDensityConfig, ctx: TraitContext) {
      const density = c.areaKm2 > 0 ? c.populationCount / c.areaKm2 : 0;
      const neededUnits = Math.ceil(c.populationCount / c.avgHouseholdSize);
      n.__popState = { densityPerKm2: density, projectedPopulation: c.populationCount, housingDeficit: Math.max(0, neededUnits - c.housingUnits) };
      ctx.emit?.('population:loaded', { density, deficit: Math.max(0, neededUnits - c.housingUnits) });
    },
    onDetach(n: HSPlusNode, _c: PopulationDensityConfig, ctx: TraitContext) { delete n.__popState; ctx.emit?.('population:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: PopulationDensityConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__popState as PopulationDensityState | undefined; if (!s) return;
      if (e.type === 'population:project') {
        const years = (e.payload?.years as number) ?? 10;
        s.projectedPopulation = c.populationCount * Math.pow(1 + c.growthRatePercent / 100, years);
        s.densityPerKm2 = c.areaKm2 > 0 ? s.projectedPopulation / c.areaKm2 : 0;
        ctx.emit?.('population:projected', { years, population: Math.round(s.projectedPopulation), density: Math.round(s.densityPerKm2) });
      }
    },
  };
}
