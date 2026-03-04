/**
 * Gaussian Splat Codec Abstraction Layer
 *
 * Provides a codec-agnostic interface for encoding, decoding, streaming,
 * and decompressing Gaussian splat data. Supports multiple codec backends:
 *
 *   - KHR/SPZ (Niantic): Production-ready, ~90% compression, KHR standardization track
 *   - MPEG GSC: Stub for future MPEG standard (exploration phase)
 *   - Extensible: Register custom codecs via the registry
 *
 * Quick start:
 *   ```typescript
 *   import { getGlobalCodecRegistry } from './gpu/codecs';
 *
 *   const registry = getGlobalCodecRegistry();
 *   const result = await registry.decode(spzBuffer);
 *   console.log(`Decoded ${result.data.count} Gaussians`);
 *   ```
 *
 * Architecture decision (W.038):
 *   Two competing standardization tracks (Khronos KHR + MPEG GSC)
 *   require an abstraction layer. This module provides that abstraction.
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type {
  GaussianSplatData,
  EncodedGaussianData,
  CodecMetadata,
  GaussianCodecId,
  GaussianFileExtension,
  GaussianStreamChunk,
  StreamProgress,
  StreamProgressCallback,
  GaussianEncodeOptions,
  GaussianDecodeOptions,
  GaussianStreamDecodeOptions,
  GaussianCodecCapabilities,
  CodecResult,
} from './types.js';

// ─── Interface & Base Class ─────────────────────────────────────────────────

export type { IGaussianCodec } from './IGaussianCodec.js';

export {
  AbstractGaussianCodec,
  GaussianCodecError,
  CodecNotSupportedError,
  CodecDecodeError,
  CodecEncodeError,
  CodecMemoryError,
  CodecDecompressError,
} from './IGaussianCodec.js';

// ─── Codec Implementations ─────────────────────────────────────────────────

export { SpzCodec } from './SpzCodec.js';
export { GltfGaussianSplatCodec } from './GltfGaussianSplatCodec.js';
export { MpegGscCodec } from './MpegGscCodec.js';
export type { MpegGscStatus } from './MpegGscCodec.js';

// ─── Registry ───────────────────────────────────────────────────────────────

export {
  GaussianCodecRegistry,
  createDefaultCodecRegistry,
  getGlobalCodecRegistry,
  resetGlobalCodecRegistry,
} from './GaussianCodecRegistry.js';

export type {
  CodecDetectOptions,
  RegisteredCodec,
} from './GaussianCodecRegistry.js';
