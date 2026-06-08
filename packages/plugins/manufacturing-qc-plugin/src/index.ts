export * from './spc';
export { createProductionLineHandler, type ProductionLineConfig, type Station } from './traits/ProductionLineTrait';
export { createQualityGateHandler, type QualityGateConfig, type InspectionCriteria } from './traits/QualityGateTrait';
export { createDefectTrackingHandler, type DefectTrackingConfig, type Defect, type DefectSeverity } from './traits/DefectTrackingTrait';
export { createBOMHandler, type BOMConfig, type BOMItem } from './traits/BOMTrait';
export * from './traits/types';

import { createProductionLineHandler } from './traits/ProductionLineTrait';
import { createQualityGateHandler } from './traits/QualityGateTrait';
import { createDefectTrackingHandler } from './traits/DefectTrackingTrait';
import { createBOMHandler } from './traits/BOMTrait';

export * from './spc';

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic SPC capability solver into HoloScriptRuntime's dispatch. Closes
// the built-but-dead-wired gap for `spc`, mirroring government-civic's
// `civic_decision` reference integration.
export {
  MANUFACTURING_QC_PLUGIN_ID,
  spcHandler,
  registerManufacturingQcTraitHandlers,
  type SpcTraitConfig,
  type SpcSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';

export const pluginMeta = { name: '@holoscript/plugin-manufacturing-qc', version: '1.0.0', traits: ['production_line', 'quality_gate', 'defect_tracking', 'bom', 'spc'] };
export const traitHandlers = [createProductionLineHandler(), createQualityGateHandler(), createDefectTrackingHandler(), createBOMHandler()];
