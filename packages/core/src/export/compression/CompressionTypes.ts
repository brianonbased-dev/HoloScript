/**
 * Compression Type Definitions
 *
 * Types for advanced texture (KTX2) and mesh (Draco) compression
 */

// ============================================================================
// Compression Options
// ============================================================================

/**
 * GPU texture compression formats
 */
export type GPUTextureFormat = 'astc' | 'bc7' | 'etc2' | 'pvrtc';

/**
 * Texture compression format
 */
export type TextureCompressionFormat = 'ktx2' | 'webp' | 'auto';

/**
 * Quality presets for compression
 */
export type CompressionQualityPreset = 'fast' | 'balanced' | 'best';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Enable texture compression */
  compressTextures?: boolean;
  /** Texture compression format */
  textureFormat?: TextureCompressionFormat;
  /** Texture quality (0-100) */
  textureQuality?: number;
  /** Quality preset */
  qualityPreset?: CompressionQualityPreset;
  /** Enable mesh compression */
  compressMeshes?: boolean;
  /** Draco compression level (0-10) */
  dracoLevel?: number;
  /** Position quantization bits */
  positionBits?: number;
  /** Normal quantization bits */
  normalBits?: number;
  /** UV quantization bits */
  uvBits?: number;
  /** Color quantization bits */
  colorBits?: number;
  /** Generate mipmaps */
  generateMipmaps?: boolean;
  /** Target GPU format (auto-detected if not specified) */
  targetGPUFormat?: GPUTextureFormat;
}

// ============================================================================
// Compression Stats
// ============================================================================

/**
 * Compression statistics
 */
export interface CompressionStats {
  /** Original uncompressed size in bytes */
  originalSize: number;
  /** Compressed size in bytes */
  compressedSize: number;
  /** Compression ratio (0-1, where 0.2 = 80% reduction) */
  compressionRatio: number;
  /** Texture size reduction in bytes */
  textureReduction: number;
  /** Mesh size reduction in bytes */
  meshReduction: number;
  /** Compression time in milliseconds */
  compressionTime: number;
  /** Number of textures compressed */
  texturesCompressed: number;
  /** Number of meshes compressed */
  meshesCompressed: number;
}

// ============================================================================
// KTX2 Specific Types
// ============================================================================

/**
 * KTX2 supercompression schemes
 */
export enum KTX2SupercompressionScheme {
  NONE = 0,
  BASISLZ = 1,
  ZSTD = 2,
  ZLIB = 3,
}

/**
 * Basis Universal texture format
 */
export enum BasisTextureFormat {
  ETC1S = 0,
  UASTC = 1,
}

/**
 * KTX2 compression options
 */
export interface KTX2Options {
  /** Basis Universal format */
  format: BasisTextureFormat;
  /** Quality level (1-255) */
  quality: number;
  /** Supercompression scheme */
  supercompression: KTX2SupercompressionScheme;
  /** Generate mipmaps */
  mipmaps: boolean;
  /** Normal map mode */
  normalMap: boolean;
  /** UASTC quality (0-4) */
  uastcQuality?: number;
}

// ============================================================================
// Draco Specific Types
// ============================================================================

/**
 * Draco compression method
 */
export enum DracoCompressionMethod {
  EDGEBREAKER = 0,
  SEQUENTIAL = 1,
}

/**
 * Draco attribute quantization
 */
export interface DracoQuantization {
  /** Position quantization bits */
  POSITION: number;
  /** Normal quantization bits */
  NORMAL: number;
  /** Texture coordinate quantization bits */
  TEXCOORD: number;
  /** Color quantization bits */
  COLOR: number;
  /** Generic attribute quantization bits */
  GENERIC: number;
}

/**
 * Draco compression options
 */
export interface DracoOptions {
  /** Compression level (0-10) */
  compressionLevel: number;
  /** Quantization bits per attribute */
  quantization: DracoQuantization;
  /** Compression method */
  method: DracoCompressionMethod;
  /** Preserve vertex order */
  preserveOrder: boolean;
}

// ============================================================================
// Mipmap Generation
// ============================================================================

/**
 * Mipmap filter types
 */
export type MipmapFilter = 'box' | 'triangle' | 'lanczos' | 'kaiser';

/**
 * Mipmap generation options
 */
export interface MipmapOptions {
  /** Filter to use */
  filter: MipmapFilter;
  /** Generate all levels */
  generateAll: boolean;
  /** Maximum number of levels */
  maxLevels?: number;
  /** Premultiply alpha */
  premultiplyAlpha: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Image data for compression
 */
export interface ImageData {
  /** Raw pixel data */
  data: Uint8Array;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Number of channels (3 for RGB, 4 for RGBA) */
  channels: number;
  /** MIME type */
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

/**
 * Compressed texture result
 */
export interface CompressedTexture {
  /** Compressed data */
  data: Uint8Array;
  /** Compression format used */
  format: TextureCompressionFormat;
  /** GPU format (for KTX2) */
  gpuFormat?: GPUTextureFormat;
  /** Original size */
  originalSize: number;
  /** Compressed size */
  compressedSize: number;
  /** Has mipmaps */
  hasMipmaps: boolean;
  /** MIME type */
  mimeType: string;
}

/**
 * Compressed mesh result
 */
export interface CompressedMesh {
  /** Compressed data */
  data: Uint8Array;
  /** Original vertex count */
  originalVertexCount: number;
  /** Original size */
  originalSize: number;
  /** Compressed size */
  compressedSize: number;
  /** Draco extension data */
  extensionData: DracoExtensionData;
}

/**
 * Draco extension data for GLTF
 */
export interface DracoExtensionData {
  bufferView: number;
  attributes: Record<string, number>;
}

// ============================================================================
// Quality Preset Configurations
// ============================================================================

/**
 * Get compression options for quality preset
 */
export function getQualityPresetOptions(
  preset: CompressionQualityPreset
): Partial<CompressionOptions> {
  switch (preset) {
    case 'fast':
      return {
        textureQuality: 50,
        dracoLevel: 3,
        positionBits: 12,
        normalBits: 8,
        uvBits: 10,
        colorBits: 8,
        generateMipmaps: false,
      };
    case 'balanced':
      return {
        textureQuality: 75,
        dracoLevel: 7,
        positionBits: 14,
        normalBits: 10,
        uvBits: 12,
        colorBits: 10,
        generateMipmaps: true,
      };
    case 'best':
      return {
        textureQuality: 95,
        dracoLevel: 10,
        positionBits: 16,
        normalBits: 12,
        uvBits: 14,
        colorBits: 12,
        generateMipmaps: true,
      };
    default:
      return getQualityPresetOptions('balanced');
  }
}

/**
 * Calculate compression ratio
 */
export function calculateCompressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return compressedSize / originalSize;
}

/**
 * Calculate size reduction percentage
 */
export function calculateReductionPercentage(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return ((originalSize - compressedSize) / originalSize) * 100;
}
