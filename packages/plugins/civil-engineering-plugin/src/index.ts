export { createStructuralAnalysisHandler, type StructuralAnalysisConfig, type StructureType, type MaterialType } from './traits/StructuralAnalysisTrait';
export { createLoadBearingHandler, type LoadBearingConfig, type LoadCase, type LoadType } from './traits/LoadBearingTrait';
export { createMaterialFatigueHandler, type MaterialFatigueConfig } from './traits/MaterialFatigueTrait';
export * from './traits/types';

import { createStructuralAnalysisHandler } from './traits/StructuralAnalysisTrait';
import { createLoadBearingHandler } from './traits/LoadBearingTrait';
import { createMaterialFatigueHandler } from './traits/MaterialFatigueTrait';

export const pluginMeta = { name: '@holoscript/plugin-civil-engineering', version: '1.0.0', traits: ['structural_analysis', 'load_bearing', 'material_fatigue'] };
export const traitHandlers = [createStructuralAnalysisHandler(), createLoadBearingHandler(), createMaterialFatigueHandler()];
