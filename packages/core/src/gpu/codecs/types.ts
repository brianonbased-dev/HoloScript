/**
 * IGaussianCodec Abstraction Layer - Type Definitions
 *
 * Codec-agnostic types for Gaussian splat encoding, decoding, streaming,
 * and decompression. Designed to support:
 *   - KHR_gaussian_splatting / Niantic SPZ (current, production)
 *   - MPEG Gaussian Splat Coding (future, exploration phase)
 *   - Any future codec standard
 *
 * Architecture decision (W.038): Two competing standardization tracks exist:
 *   1. Khronos KHR_gaussian_splatting (glTF/SPZ, Q2 2026 ratification)
 *   2. MPEG Explorations (formal coding standard, timeline TBD)
 *   -> Abstract codec layer to support both without coupling to either.
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

// =============================================================================
// Gaussian Splat Data Structures
// =============================================================================

/**
 * Decoded Gaussian splat data in a format-agnostic representation.
 *
 * This is the universal interchange format between codecs and the rendering
 * pipeline. All codecs decode TO this format; all renderers consume FROM it.
 *
 * Memory layout is SoA (Structure of Arrays) for GPU-friendly access patterns.
 */
export interface GaussianSplatData {
  /** XYZ positions per splat (N * 3 floats) */
  positions: Float32Array;

  /** Scale factors per splat (N * 3 floats: sx, sy, sz) */
  scales: Float32Array;

  /** Quaternion rotations per splat (N * 4 floats: x, y, z, w) */
  rotations: Float32Array;

  /** RGBA colors per splat (N * 4 floats, [0..1] range) */
  colors: Float32Array;

  /** Opacity values per splat (N * 1 float, [0..1] range) */
  opacities: Float32Array;

  /** Spherical harmonics coefficients per splat (N * shDim * 3 floats), optional */
  shCoefficients?: Float32Array;

  /** SH degree (0-3). 0 means no SH data. */
  shDegree: number;

  /** Number of Gaussians in this dataset */
  count: number;
}

/**
 * Encoded (compressed) Gaussian splat data as raw bytes.
 *
 * This is the format that codecs produce when encoding and consume when decoding.
 * The internal structure is codec-specific and opaque to the rest of the system.
 */
export interface EncodedGaussianData {
  /** Raw encoded bytes */
  data: ArrayBuffer;

  /** Codec that produced this encoding */
  codecId: GaussianCodecId;

  /** Codec-specific metadata (e.g., SPZ header info, MPEG NAL parameters) */
  metadata: CodecMetadata;
}

/**
 * Codec-specific metadata attached to encoded data.
 */
export interface CodecMetadata {
  /** Format version (e.g., 2 for SPZ v2, 3 for SPZ v3) */
  version: number;

  /** Number of Gaussians in the encoded stream */
  gaussianCount: number;

  /** SH degree used in encoding (0-3) */
  shDegree: number;

  /** Compressed size in bytes */
  compressedSizeBytes: number;

  /** Estimated uncompressed size in bytes */
  uncompressedSizeBytes: number;

  /** Compression ratio (compressed / uncompressed) */
  compressionRatio: number;

  /** Whether the data includes antialiasing parameters */
  antialiased: boolean;

  /** Codec-specific extension data (future-proof) */
  extensions?: Record<string, unknown>;
}

// =============================================================================
// Codec Identification
// =============================================================================

/**
 * Well-known codec identifiers.
 *
 * Uses a hierarchical naming convention:
 *   - `khr.*`  : Khronos standard codecs
 *   - `mpeg.*` : MPEG standard codecs
 *   - `vendor.*` : Vendor-specific codecs
 */
export type GaussianCodecId =
  | 'khr.spz.v2' // Niantic SPZ v2 (3-byte quaternion, first-three encoding)
  | 'khr.spz.v3' // Niantic SPZ v3 (4-byte quaternion, smallest-three encoding)
  | 'khr.gltf.baseline' // KHR_gaussian_splatting baseline (uncompressed glTF)
  | 'mpeg.gsc.v1' // MPEG Gaussian Splat Coding v1 (future)
  | string; // Extensible for custom/vendor codecs

/**
 * File extensions associated with Gaussian splat codecs.
 */
export type GaussianFileExtension = 'spz' | 'ply' | 'splat' | 'ksplat' | 'gltf' | 'glb' | string;

// =============================================================================
// Streaming Types
// =============================================================================

/**
 * A chunk of streaming Gaussian data.
 *
 * Supports progressive loading where Gaussians arrive in chunks
 * (spatial tiles, LOD levels, or network packets).
 */
export interface GaussianStreamChunk {
  /** Chunk index in the stream sequence */
  index: number;

  /** Total expected chunks (-1 if unknown/infinite) */
  totalChunks: number;

  /** Encoded chunk data */
  data: ArrayBuffer;

  /** Byte offset in the full stream */
  byteOffset: number;

  /** Whether this is a keyframe (I-frame) or delta (P-frame) */
  frameType: 'keyframe' | 'delta';

  /** Timestamp for temporal streams (seconds from start) */
  timestamp?: number;

  /** Spatial region this chunk covers (for tiled streaming) */
  spatialRegion?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * Progress callback for streaming operations.
 */
export type StreamProgressCallback = (progress: StreamProgress) => void;

/**
 * Streaming progress information.
 */
export interface StreamProgress {
  /** Bytes loaded so far */
  bytesLoaded: number;

  /** Total bytes expected (-1 if unknown) */
  bytesTotal: number;

  /** Gaussians decoded so far */
  gaussiansDecoded: number;

  /** Total Gaussians expected (-1 if unknown) */
  gaussiansTotal: number;

  /** Current phase of the streaming pipeline */
  phase: 'connecting' | 'downloading' | 'decompressing' | 'decoding' | 'complete' | 'error';

  /** Error information if phase is 'error' */
  error?: Error;
}

// =============================================================================
// Encode/Decode Options
// =============================================================================

/**
 * Options for encoding Gaussian splat data.
 */
export interface GaussianEncodeOptions {
  /** Target SH degree for encoding (may downsample from source). Default: source shDegree */
  shDegree?: number;

  /** Quality preset affecting quantization precision */
  quality?: 'low' | 'medium' | 'high' | 'lossless';

  /** Target compressed size in bytes (codec may not honor exactly) */
  targetSizeBytes?: number;

  /** Whether to include antialiasing parameters */
  antialiased?: boolean;

  /** Number of fractional bits for fixed-point encoding (SPZ-specific) */
  fractionalBits?: number;

  /**
   * SPZ encoding version for quaternion rotation packing.
   *   - 2: first-three encoding (3 bytes per quaternion, legacy)
   *   - 3: smallest-three encoding (4 bytes per quaternion, higher precision)
   * Default: 3
   */
  encodingVersion?: 2 | 3;

  /** Codec-specific extension options */
  extensions?: Record<string, unknown>;
}

/**
 * Options for decoding Gaussian splat data.
 */
export interface GaussianDecodeOptions {
  /** Maximum number of Gaussians to decode (for partial loads). Default: all */
  maxGaussians?: number;

  /** Maximum memory budget in MB. Throws if exceeded. Default: 512 */
  maxMemoryMB?: number;

  /** Whether to decode SH coefficients. Default: true */
  decodeSH?: boolean;

  /** Opacity threshold for filtering invisible splats. Default: 0 (no filter) */
  alphaThreshold?: number;
}

/**
 * Options for streaming decode operations.
 */
export interface GaussianStreamDecodeOptions extends GaussianDecodeOptions {
  /** Chunk size hint for the codec (bytes). Default: codec-specific */
  chunkSizeHint?: number;

  /** Whether to enable temporal delta decoding (for video streams) */
  temporalDelta?: boolean;

  /** Progress callback */
  onProgress?: StreamProgressCallback;

  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Codec Capabilities
// =============================================================================

/**
 * Describes what a codec implementation can do.
 *
 * Used by the codec registry to match codecs to operations.
 */
export interface GaussianCodecCapabilities {
  /** Codec identifier */
  id: GaussianCodecId;

  /** Human-readable name */
  name: string;

  /** Codec version string */
  version: string;

  /** File extensions this codec can handle */
  fileExtensions: GaussianFileExtension[];

  /** MIME types this codec can handle */
  mimeTypes: string[];

  /** Whether encode() is implemented */
  canEncode: boolean;

  /** Whether decode() is implemented */
  canDecode: boolean;

  /** Whether streaming decode is supported */
  canStream: boolean;

  /** Whether temporal delta decoding is supported (for volumetric video) */
  canDecodeTemporal: boolean;

  /** Maximum SH degree supported */
  maxSHDegree: number;

  /** Maximum Gaussian count supported (-1 for unlimited) */
  maxGaussianCount: number;

  /** Whether the codec requires WASM (vs pure JS) */
  requiresWasm: boolean;

  /** Whether the codec requires WebGPU (for GPU-accelerated decode) */
  requiresWebGPU: boolean;

  /** Standardization body (informational) */
  standard: 'khronos' | 'mpeg' | 'vendor' | 'custom';

  /** Maturity level */
  maturity: 'production' | 'beta' | 'experimental' | 'stub';
}

// =============================================================================
// Codec Result Types
// =============================================================================

/**
 * Result of a codec operation, with timing and diagnostic information.
 */
export interface CodecResult<T> {
  /** The decoded/encoded data */
  data: T;

  /** Time taken for the operation in milliseconds */
  durationMs: number;

  /** Peak memory usage during the operation in bytes */
  peakMemoryBytes?: number;

  /** Warnings generated during the operation */
  warnings: string[];
}
