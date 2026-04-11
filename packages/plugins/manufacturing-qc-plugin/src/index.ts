export { createProductionLineHandler, type ProductionLineConfig, type Station } from './traits/ProductionLineTrait';
export { createQualityGateHandler, type QualityGateConfig, type InspectionCriteria } from './traits/QualityGateTrait';
export { createDefectTrackingHandler, type DefectTrackingConfig, type Defect, type DefectSeverity } from './traits/DefectTrackingTrait';
export { createBOMHandler, type BOMConfig, type BOMItem } from './traits/BOMTrait';
export * from './traits/types';

import { createProductionLineHandler } from './traits/ProductionLineTrait';
import { createQualityGateHandler } from './traits/QualityGateTrait';
import { createDefectTrackingHandler } from './traits/DefectTrackingTrait';
import { createBOMHandler } from './traits/BOMTrait';

export const pluginMeta = { name: '@holoscript/plugin-manufacturing-qc', version: '1.0.0', traits: ['production_line', 'quality_gate', 'defect_tracking', 'bom'] };
export const traitHandlers = [createProductionLineHandler(), createQualityGateHandler(), createDefectTrackingHandler(), createBOMHandler()];
