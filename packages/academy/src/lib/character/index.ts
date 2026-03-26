export * from './presetModels';

export * from './mixamoIntegration';
export * from './aiCharacterGeneration';
// sketchfabIntegration has a `getLicenseSummary` name collision with vrmImport.
// Import directly from './sketchfabIntegration' for Sketchfab-specific exports.
export {
  type SketchfabModel,
  type SketchfabSearchParams,
  allowsCommercialUse,
  requiresAttribution,
  formatPolyCount,
  formatViewCount,
  isSketchfabAvailable,
  getCharacterCategories,
  getLicenseSummary as getSketchfabLicenseSummary,
} from './sketchfabIntegration';
export * from './ExpressionPresets';
export * from './poseLibrary';
