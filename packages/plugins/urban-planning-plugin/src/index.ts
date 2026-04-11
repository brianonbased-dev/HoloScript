export { createZoningHandler, type ZoningConfig, type ZoneType, type DensityClass } from './traits/ZoningTrait';
export { createTrafficFlowHandler, type TrafficFlowConfig, type RoadType } from './traits/TrafficFlowTrait';
export { createPopulationDensityHandler, type PopulationDensityConfig } from './traits/PopulationDensityTrait';
export * from './traits/types';

import { createZoningHandler } from './traits/ZoningTrait';
import { createTrafficFlowHandler } from './traits/TrafficFlowTrait';
import { createPopulationDensityHandler } from './traits/PopulationDensityTrait';

export const pluginMeta = { name: '@holoscript/plugin-urban-planning', version: '1.0.0', traits: ['zoning', 'traffic_flow', 'population_density'] };
export const traitHandlers = [createZoningHandler(), createTrafficFlowHandler(), createPopulationDensityHandler()];
