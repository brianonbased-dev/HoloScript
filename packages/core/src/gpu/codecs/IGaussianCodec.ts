/**
 * IGaussianCodec - Abstract Interface for Gaussian Splat Codecs
 *
 * Defines the contract that all Gaussian splat codec implementations must satisfy.
 * Supports four core operations:
 *   1. encode()       - Compress GaussianSplatData to binary
 *   2. decode()       - Decompress binary to GaussianSplatData
 *   3. stream()       - Progressive/chunked decode with backpressure
 *   4. decompress()   - Low-level byte decompression (gzip, etc.)
 *
 * Implementations:
 *   - SpzV2Codec: Niantic SPZ v2/v3 (production, KHR-track)
 *   - MpegGscCodec: MPEG Gaussian Splat Coding (stub, exploration track)
 *
 * Architecture decision (W.038):
 *   Two competing standardization tracks require an abstraction layer
 *   that decouples the rendering pipeline from any specific codec.
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

import type {
  GaussianSplatData,
  EncodedGaussianData,
  GaussianCodecCapabilities,
  GaussianEncodeOptions,
  GaussianDecodeOptions,
  GaussianStreamDecodeOptions,
  GaussianStreamChunk,
  CodecResult,
  CodecMetadata,
} from './types.js';

// =============================================================================
// IGaussianCodec Interface
// =============================================================================

/**
 * Abstract interface for Gaussian splat encoding/decoding.
 *
 * All codec implementations must implement at least `decode()` and `getCapabilities()`.
 * Optional operations (encode, stream, decompress) throw `CodecNotSupportedError`
 * if not implemented.
 *
 * @example
 * ```typescript
 * // Decode an SPZ file
 * const codec = registry.getCodec('khr.spz.v2');
 * const result = await codec.decode(spzBuffer, { maxGaussians: 500_000 });
 * console.log(`Decoded ${result.data.count} Gaussians in ${result.durationMs}ms`);
 *
 * // Stream decode for progressive loading
 * for await (const chunk of codec.stream(url, { onProgress: handleProgress })) {
 *   renderer.appendGaussians(chunk.data);
 * }
 * ```
 */
export interface IGaussianCodec {
  // ─── Core Operations ────────────────────────────────────────────────────────

  /**
   * Encode Gaussian splat data into the codec's binary format.
   *
   * @param data - Decoded Gaussian data to encode
   * @param options - Encoding options (quality, SH degree, etc.)
   * @returns Encoded binary data with metadata
   * @throws CodecNotSupportedError if encoding is not supported
   * @throws CodecEncodeError if encoding fails
   */
  encode(
    data: GaussianSplatData,
    options?: GaussianEncodeOptions,
  ): Promise<CodecResult<EncodedGaussianData>>;

  /**
   * Decode binary data into Gaussian splat data.
   *
   * This is the primary operation. All codecs MUST implement this.
   *
   * @param buffer - Raw binary data (may be compressed)
   * @param options - Decoding options (max Gaussians, memory budget, etc.)
   * @returns Decoded Gaussian data with timing info
   * @throws CodecDecodeError if the data is invalid or corrupted
   * @throws CodecMemoryError if memory budget would be exceeded
   */
  decode(
    buffer: ArrayBuffer,
    options?: GaussianDecodeOptions,
  ): Promise<CodecResult<GaussianSplatData>>;

  /**
   * Stream-decode Gaussian data progressively.
   *
   * Returns an async iterator that yields decoded chunks as they arrive.
   * Supports backpressure via the async iteration protocol.
   *
   * @param source - URL string or ReadableStream of encoded data
   * @param options - Streaming options (chunk size, progress callback, etc.)
   * @returns Async iterator of decoded Gaussian chunks
   * @throws CodecNotSupportedError if streaming is not supported
   */
  stream(
    source: string | ReadableStream<Uint8Array>,
    options?: GaussianStreamDecodeOptions,
  ): AsyncIterable<CodecResult<GaussianSplatData>>;

  /**
   * Low-level byte decompression.
   *
   * Handles the transport-level decompression (gzip, zstd, etc.)
   * without parsing the codec-specific format. Useful for pre-processing
   * pipelines or when decompression and decode need to be separated.
   *
   * @param compressed - Compressed byte buffer
   * @returns Decompressed byte buffer
   * @throws CodecDecompressError if decompression fails
   */
  decompress(compressed: ArrayBuffer): Promise<ArrayBuffer>;

  // ─── Introspection ──────────────────────────────────────────────────────────

  /**
   * Get the capabilities of this codec implementation.
   *
   * Used by the registry for codec selection and feature negotiation.
   */
  getCapabilities(): GaussianCodecCapabilities;

  /**
   * Probe a buffer to determine if this codec can decode it.
   *
   * Performs a lightweight check (magic bytes, header sniffing) without
   * fully parsing the data.
   *
   * @param buffer - First N bytes of the data (at least 16 bytes recommended)
   * @returns true if this codec can likely decode the data
   */
  canDecode(buffer: ArrayBuffer): boolean;

  /**
   * Extract metadata from encoded data without full decode.
   *
   * Parses the header to extract Gaussian count, SH degree, version, etc.
   * Much faster than a full decode when only metadata is needed.
   *
   * @param buffer - Raw binary data (may be compressed)
   * @returns Codec metadata
   * @throws CodecDecodeError if the header is invalid
   */
  extractMetadata(buffer: ArrayBuffer): Promise<CodecMetadata>;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Initialize the codec (load WASM modules, warm up GPU pipelines, etc.).
   *
   * Called by the registry on first use. Idempotent.
   */
  initialize(): Promise<void>;

  /**
   * Release any resources held by the codec.
   *
   * Called when the codec is unregistered or the application shuts down.
   */
  dispose(): void;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error class for codec operations.
 */
export class GaussianCodecError extends Error {
  constructor(
    message: string,
    public readonly codecId: string,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(`[${codecId}] ${operation}: ${message}`);
    this.name = 'GaussianCodecError';
  }
}

/**
 * Thrown when a codec operation is not supported by the implementation.
 */
export class CodecNotSupportedError extends GaussianCodecError {
  constructor(codecId: string, operation: string) {
    super(
      `Operation '${operation}' is not supported by this codec. ` +
      `Check capabilities before calling.`,
      codecId,
      operation,
    );
    this.name = 'CodecNotSupportedError';
  }
}

/**
 * Thrown when decoding fails due to invalid or corrupted data.
 */
export class CodecDecodeError extends GaussianCodecError {
  constructor(codecId: string, message: string, cause?: Error) {
    super(message, codecId, 'decode', cause);
    this.name = 'CodecDecodeError';
  }
}

/**
 * Thrown when encoding fails.
 */
export class CodecEncodeError extends GaussianCodecError {
  constructor(codecId: string, message: string, cause?: Error) {
    super(message, codecId, 'encode', cause);
    this.name = 'CodecEncodeError';
  }
}

/**
 * Thrown when a memory budget would be exceeded.
 */
export class CodecMemoryError extends GaussianCodecError {
  constructor(
    codecId: string,
    public readonly requiredMB: number,
    public readonly budgetMB: number,
  ) {
    super(
      `Memory budget exceeded: operation requires ~${requiredMB.toFixed(1)} MB ` +
      `but budget is ${budgetMB} MB`,
      codecId,
      'decode',
    );
    this.name = 'CodecMemoryError';
  }
}

/**
 * Thrown when byte-level decompression fails.
 */
export class CodecDecompressError extends GaussianCodecError {
  constructor(codecId: string, message: string, cause?: Error) {
    super(message, codecId, 'decompress', cause);
    this.name = 'CodecDecompressError';
  }
}

// =============================================================================
// Abstract Base Class
// =============================================================================

/**
 * Abstract base class providing default (unsupported) implementations
 * for optional operations. Concrete codecs extend this and override
 * the operations they support.
 *
 * @example
 * ```typescript
 * class MyCodec extends AbstractGaussianCodec {
 *   // MUST implement:
 *   async decode(buffer, options) { ... }
 *   getCapabilities() { ... }
 *   canDecode(buffer) { ... }
 *   async extractMetadata(buffer) { ... }
 *
 *   // Optionally override:
 *   async encode(data, options) { ... }
 *   async *stream(source, options) { ... }
 * }
 * ```
 */
export abstract class AbstractGaussianCodec implements IGaussianCodec {
  protected initialized = false;

  // Concrete codecs MUST implement these:
  abstract decode(
    buffer: ArrayBuffer,
    options?: GaussianDecodeOptions,
  ): Promise<CodecResult<GaussianSplatData>>;

  abstract getCapabilities(): GaussianCodecCapabilities;

  abstract canDecode(buffer: ArrayBuffer): boolean;

  abstract extractMetadata(buffer: ArrayBuffer): Promise<CodecMetadata>;

  // Default implementations for optional operations:

  async encode(
    _data: GaussianSplatData,
    _options?: GaussianEncodeOptions,
  ): Promise<CodecResult<EncodedGaussianData>> {
    throw new CodecNotSupportedError(this.getCapabilities().id, 'encode');
  }

  async *stream(
    _source: string | ReadableStream<Uint8Array>,
    _options?: GaussianStreamDecodeOptions,
  ): AsyncIterable<CodecResult<GaussianSplatData>> {
    throw new CodecNotSupportedError(this.getCapabilities().id, 'stream');
  }

  async decompress(_compressed: ArrayBuffer): Promise<ArrayBuffer> {
    throw new CodecNotSupportedError(this.getCapabilities().id, 'decompress');
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  dispose(): void {
    this.initialized = false;
  }

  /**
   * Estimate memory footprint in MB for a given Gaussian count.
   * Used by decode() to check memory budgets.
   */
  protected estimateMemoryMB(gaussianCount: number): number {
    // Per-Gaussian: positions (3) + scales (3) + rotations (4) + colors (4) + opacity (1)
    // = 15 floats * 4 bytes = 60 bytes
    const bytesPerGaussian = 15 * 4;
    return (gaussianCount * bytesPerGaussian) / (1024 * 1024);
  }

  /**
   * Check if a decode operation would exceed the memory budget.
   * @throws CodecMemoryError if budget would be exceeded
   */
  protected checkMemoryBudget(gaussianCount: number, maxMemoryMB: number): void {
    const requiredMB = this.estimateMemoryMB(gaussianCount);
    if (requiredMB > maxMemoryMB) {
      throw new CodecMemoryError(this.getCapabilities().id, requiredMB, maxMemoryMB);
    }
  }
}
