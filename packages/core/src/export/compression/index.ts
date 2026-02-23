/**
 * Compression Module
 *
 * Advanced texture and mesh compression for GLTF export
 */

export { AdvancedCompression } from './AdvancedCompression';
export type {
  CompressionOptions,
  CompressionStats,
  CompressedTexture,
  CompressedMesh,
  GPUTextureFormat,
  TextureCompressionFormat,
  CompressionQualityPreset,
  ImageData,
  KTX2Options,
  DracoOptions,
  MipmapOptions,
  DracoQuantization,
  DracoExtensionData,
  MipmapFilter,
} from './CompressionTypes';
export {
  BasisTextureFormat,
  KTX2SupercompressionScheme,
  DracoCompressionMethod,
  getQualityPresetOptions,
  calculateCompressionRatio,
  calculateReductionPercentage,
} from './CompressionTypes';
