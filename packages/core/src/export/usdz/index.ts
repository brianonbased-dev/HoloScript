/**
 * USDZ Export Module
 *
 * Exports for USDZ exporter and types
 */

export { USDZExporter } from './USDZExporter';
export type { IUSDZExportOptions, IUSDZExportResult, IUSDZExportStats } from './USDZExporter';

export type {
  IUSDStage,
  IUSDMetadata,
  IUSDPrim,
  IUSDMesh,
  IUSDMaterial,
  IUSDShader,
  IUSDAttribute,
  IUSDXformOp,
  IUSDPreviewSurfaceInputs,
  IARQuickLookMetadata,
  ISpatialAudioMetadata,
  IUSDZPackage,
  IUSDZFileEntry,
  USDPrimType,
  USDAttributeType,
  USDAttributeValue,
} from './USDTypes';

export {
  createEmptyUSDStage,
  createUSDXform,
  createUSDPreviewSurfaceMaterial,
  quaternionToEuler,
  sanitizeUSDName,
  isValidUSDPath,
} from './USDTypes';
