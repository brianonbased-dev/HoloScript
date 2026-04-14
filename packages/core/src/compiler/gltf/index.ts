/**
 * glTF Export Utilities
 *
 * Helper modules for the HoloScript glTF/GLB export pipeline.
 *
 * @packageDocumentation
 */

// Material utilities
export {
  type PBRMaterialConfig,
  type GLTFMaterialOutput,
  NAMED_COLORS,
  MATERIAL_PRESETS,
  parseColor,
  parseHexColor,
  parseRGBString,
  parseHSLString,
  hslToRgb,
  sRGBToLinear,
  linearToSRGB,
  createMaterial,
  applyPreset,
} from './materials';

// Extension utilities
export {
  SUPPORTED_EXTENSIONS,
  type GLTFExtension,
  type KHRMaterialsUnlit,
  type KHRMaterialsEmissiveStrength,
  type KHRMaterialsClearcoat,
  type KHRMaterialsTransmission,
  type KHRMaterialsIOR,
  type KHRLightsPunctual,
  type KHRLightsPunctualLight,
  type GLTFLightType,
  type EXTMeshGPUInstancing,
  IOR_VALUES,
  createUnlitExtension,
  createEmissiveStrengthExtension,
  createClearcoatExtension,
  createTransmissionExtension,
  createIORExtension,
  createLight,
  createDirectionalLight,
  createPointLight,
  createSpotLight,
  createInstancedMeshExtension,
  collectUsedExtensions,
  isExtensionRequired,
  declareExtensions,
} from './extensions';
