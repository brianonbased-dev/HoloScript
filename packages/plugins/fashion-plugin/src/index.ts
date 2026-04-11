export { createGarmentHandler, type GarmentConfig, type GarmentCategory } from './traits/GarmentTrait';
export { createFabricSimulationHandler, type FabricSimulationConfig, type FabricType } from './traits/FabricSimulationTrait';
export { createRunwayChoreographyHandler, type RunwayChoreographyConfig, type RunwaySegment } from './traits/RunwayChoreographyTrait';
export * from './traits/types';

import { createGarmentHandler } from './traits/GarmentTrait';
import { createFabricSimulationHandler } from './traits/FabricSimulationTrait';
import { createRunwayChoreographyHandler } from './traits/RunwayChoreographyTrait';

export const pluginMeta = { name: '@holoscript/plugin-fashion', version: '1.0.0', traits: ['garment', 'fabric_simulation', 'runway_choreography'] };
export const traitHandlers = [createGarmentHandler(), createFabricSimulationHandler(), createRunwayChoreographyHandler()];
