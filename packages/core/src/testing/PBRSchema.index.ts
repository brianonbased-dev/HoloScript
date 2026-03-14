/**
 * Materials module barrel export.
 *
 * TARGET LOCATION: packages/core/src/materials/index.ts
 * Move this file alongside PBRSchema.ts into materials/ directory.
 *
 * @module materials
 */
export {
  // Color types
  type RGB,
  type RGBA,

  // Enums
  type BlendMode,
  type CullMode,
  type MaterialType,

  // Texture
  type TextureSlot,

  // Advanced PBR sub-structures
  type SubsurfaceConfig,
  type SheenConfig,
  type AnisotropyConfig,
  type ClearcoatConfig,
  type IridescenceConfig,
  type WeatheringConfig,

  // Core
  type PBRCoreProperties,
  type MaterialDef,
  type MaterialInstance,

  // Utilities
  hexToRGBA,
  rgbaToHex,
  createDefaultMaterialDef,
  PBR_DEFAULTS,
  parseColorToRGB,
  parseColorToRGBA,
} from './PBRSchema';
