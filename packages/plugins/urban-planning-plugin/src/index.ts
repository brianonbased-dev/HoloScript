export { URBAN_PLANNING_ECONOMY_PLUGIN_ID } from './economyBridge';
export { revenueTickInputFromZoning } from './zoningEconomyTick';
export { createZoningHandler, type ZoningConfig, type ZoneType, type DensityClass } from './traits/ZoningTrait';
export { createTrafficFlowHandler, type TrafficFlowConfig, type RoadType } from './traits/TrafficFlowTrait';
export { createPopulationDensityHandler, type PopulationDensityConfig } from './traits/PopulationDensityTrait';
export { createGeospatialClimateHandler, type GeospatialClimateConfig, type GeospatialClimateState } from './traits/GeospatialClimateTrait';
export * from './traits/types';

import { createZoningHandler } from './traits/ZoningTrait';
import { createTrafficFlowHandler } from './traits/TrafficFlowTrait';
import { createPopulationDensityHandler } from './traits/PopulationDensityTrait';
import { createGeospatialClimateHandler } from './traits/GeospatialClimateTrait';

export const pluginMeta = { name: '@holoscript/plugin-urban-planning', version: '1.0.0', traits: ['zoning', 'traffic_flow', 'population_density', 'geospatial_climate'] };
export const traitHandlers = [createZoningHandler(), createTrafficFlowHandler(), createPopulationDensityHandler(), createGeospatialClimateHandler()];
