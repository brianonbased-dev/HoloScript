/**
 * SpzCodec - Niantic SPZ v2/v3 Gaussian Splat Codec
 *
 * Production-quality codec implementing the Niantic SPZ compressed format
 * for 3D Gaussian splats. Achieves ~90% compression vs PLY with virtually
 * no perceptible quality loss.
 *
 * SPZ binary layout (after gzip decompression):
 *   [Header: 16 bytes]
 *   [Positions: N * 9 bytes (3 coords * 3 bytes, 24-bit signed fixed-point)]
 *   [Alphas: N * 1 byte (sigmoid-compressed opacity)]
 *   [Colors: N * 3 bytes (SH DC coefficients, uint8)]
 *   [Scales: N * 3 bytes (log-encoded, uint8)]
 *   [Rotations: N * 3 bytes (v2, first-three) or N * 4 bytes (v3, smallest-three)]
 *   [SH coefficients: N * shDim * 3 bytes (optional higher-order SH)]
 *
 * Supports:
 *   - SPZ v1, v2, v3 decoding
 *   - SPZ v2 encoding (with configurable quality)
 *   - Streaming decode via gzip DecompressionStream
 *   - Memory budget pre-check (G.030.06)
 *
 * References:
 *   - W.031: SPZ decompression with fixed-point dequantization
 *   - W.038: Dual standardization track codec abstraction
 *   - G.030.04: SPZ buffer validation
 *   - G.030.06: WebGPU memory ceiling on mobile VR
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

import {
  AbstractGaussianCodec,
  CodecDecodeError,
  CodecDecompressError,
  CodecEncodeError,
  CodecNotSupportedError,
} from './IGaussianCodec.js';
import type {
  GaussianSplatData,
  EncodedGaussianData,
  GaussianCodecCapabilities,
  GaussianEncodeOptions,
  GaussianDecodeOptions,
  GaussianStreamDecodeOptions,
  CodecResult,
  CodecMetadata,
} from './types.js';

// =============================================================================
// SPZ Constants
// =============================================================================

/** SPZ magic number: 0x5053474e ("NGSP" in little-endian) */
const SPZ_MAGIC = 0x5053474e;

/** SPZ header size in bytes */
const SPZ_HEADER_SIZE = 16;

/** Maximum points allowed to prevent memory exhaustion */
const SPZ_MAX_POINTS = 10_000_000;

/** Default memory budget in MB */
const DEFAULT_MAX_MEMORY_MB = 512;

/** SH coefficient color scale used by SPZ format */
const SPZ_COLOR_SCALE = 0.15;

/** SH band 0 coefficient: C0 = 1 / (2 * sqrt(pi)) = 0.2820948 */
const SH_C0 = 0.2820948;

/** sqrt(1/2) constant for quaternion smallest-three decoding */
const SQRT1_2 = Math.SQRT1_2;

/** Gzip magic bytes */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

// =============================================================================
// SPZ Header
// =============================================================================

interface SpzHeader {
  magic: number;
  version: number;         // 1, 2, or 3
  numPoints: number;
  shDegree: number;        // 0-3
  fractionalBits: number;  // typically 12
  flags: number;           // bit 0: antialiased
  reserved: number;
}

// =============================================================================
// SPZ Codec Implementation
// =============================================================================

export class SpzCodec extends AbstractGaussianCodec {
  private readonly codecId: string;

  constructor() {
    super();
    this.codecId = 'khr.spz.v2';
  }

  // ─── Capabilities ─────────────────────────────────────────────────────────

  getCapabilities(): GaussianCodecCapabilities {
    return {
      id: this.codecId,
      name: 'Niantic SPZ Gaussian Splat Codec',
      version: '1.0.0',
      fileExtensions: ['spz'],
      mimeTypes: ['application/x-spz', 'application/gzip'],
      canEncode: true,
      canDecode: true,
      canStream: true,
      canDecodeTemporal: false,
      maxSHDegree: 3,
      maxGaussianCount: SPZ_MAX_POINTS,
      requiresWasm: false,
      requiresWebGPU: false,
      standard: 'khronos',
      maturity: 'production',
    };
  }

  // ─── Probe ────────────────────────────────────────────────────────────────

  canDecode(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 2) return false;
    const bytes = new Uint8Array(buffer, 0, 2);
    // SPZ files are gzip-compressed; check for gzip magic
    return bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;
  }

  // ─── Decompress ───────────────────────────────────────────────────────────

  async decompress(compressed: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      return await decompressGzip(compressed);
    } catch (err) {
      throw new CodecDecompressError(
        this.codecId,
        'Gzip decompression failed. Ensure the data is a valid SPZ file.',
        err instanceof Error ? err : undefined,
      );
    }
  }

  // ─── Extract Metadata ─────────────────────────────────────────────────────

  async extractMetadata(buffer: ArrayBuffer): Promise<CodecMetadata> {
    const raw = await this.decompress(buffer);
    const header = parseSpzHeader(new DataView(raw));
    validateSpzHeader(header, this.codecId);

    const isV3 = header.version >= 3;
    const rotBytes = isV3 ? 4 : 3;
    const shDim = shDimForDegree(header.shDegree);

    const uncompressedSize =
      SPZ_HEADER_SIZE +
      header.numPoints * 9 +      // positions
      header.numPoints +           // alphas
      header.numPoints * 3 +      // colors
      header.numPoints * 3 +      // scales
      header.numPoints * rotBytes + // rotations
      header.numPoints * shDim * 3; // SH

    return {
      version: header.version,
      gaussianCount: header.numPoints,
      shDegree: header.shDegree,
      compressedSizeBytes: buffer.byteLength,
      uncompressedSizeBytes: uncompressedSize,
      compressionRatio: buffer.byteLength / uncompressedSize,
      antialiased: (header.flags & 1) !== 0,
    };
  }

  // ─── Decode ───────────────────────────────────────────────────────────────

  async decode(
    buffer: ArrayBuffer,
    options?: GaussianDecodeOptions,
  ): Promise<CodecResult<GaussianSplatData>> {
    const startTime = performance.now();
    const warnings: string[] = [];
    const maxGaussians = options?.maxGaussians ?? SPZ_MAX_POINTS;
    const maxMemoryMB = options?.maxMemoryMB ?? DEFAULT_MAX_MEMORY_MB;
    const decodeSH = options?.decodeSH ?? true;
    const alphaThreshold = options?.alphaThreshold ?? 0;

    // Step 1: Decompress gzip wrapper
    const raw = await this.decompress(buffer);
    const data = new Uint8Array(raw);
    const view = new DataView(raw);

    // Step 2: Parse and validate header
    const header = parseSpzHeader(view);
    validateSpzHeader(header, this.codecId);

    const N = Math.min(header.numPoints, maxGaussians);
    if (N < header.numPoints) {
      warnings.push(
        `Clamped Gaussian count from ${header.numPoints.toLocaleString()} to ${N.toLocaleString()} (maxGaussians limit)`,
      );
    }

    // Step 3: Memory pre-check (G.030.06)
    this.checkMemoryBudget(N, maxMemoryMB);

    // Step 4: Compute block offsets
    const isV3 = header.version >= 3;
    const rotBytes = isV3 ? 4 : 3;
    const shDim = decodeSH ? shDimForDegree(header.shDegree) : 0;
    const posScale = 1.0 / (1 << header.fractionalBits);

    const posStart = SPZ_HEADER_SIZE;
    const alphaStart = posStart + header.numPoints * 9;
    const colorStart = alphaStart + header.numPoints;
    const scaleStart = colorStart + header.numPoints * 3;
    const rotStart = scaleStart + header.numPoints * 3;
    const shStart = rotStart + header.numPoints * rotBytes;
    const expectedSize = shStart + header.numPoints * shDimForDegree(header.shDegree) * 3;

    if (data.length < expectedSize) {
      throw new CodecDecodeError(
        this.codecId,
        `SPZ buffer too short: ${data.length} bytes, expected at least ${expectedSize} bytes ` +
        `for ${header.numPoints} points with SH degree ${header.shDegree}`,
      );
    }

    // Step 5: Allocate output arrays
    const positions = new Float32Array(N * 3);
    const scales = new Float32Array(N * 3);
    const rotations = new Float32Array(N * 4);
    const colors = new Float32Array(N * 4);
    const opacities = new Float32Array(N);
    let shCoefficients: Float32Array | undefined;
    if (shDim > 0) {
      shCoefficients = new Float32Array(N * shDim * 3);
    }

    // Step 6: Decode positions (24-bit signed fixed-point per coordinate)
    for (let i = 0; i < N; i++) {
      const pOff = posStart + i * 9;
      for (let c = 0; c < 3; c++) {
        const byteOff = pOff + c * 3;
        let fixed32 = data[byteOff] | (data[byteOff + 1] << 8) | (data[byteOff + 2] << 16);
        // Sign extension from 24-bit to 32-bit
        if (fixed32 & 0x800000) fixed32 |= 0xff000000;
        fixed32 = fixed32 | 0; // Convert to signed int32
        positions[i * 3 + c] = fixed32 * posScale;
      }
    }

    // Step 7: Decode alphas (uint8 sigmoid-compressed)
    for (let i = 0; i < N; i++) {
      const rawAlpha = data[alphaStart + i] / 255;
      opacities[i] = rawAlpha;
      colors[i * 4 + 3] = rawAlpha;
    }

    // Step 8: Decode colors (uint8, offset + scale decode via SH DC)
    for (let i = 0; i < N; i++) {
      const cOff = colorStart + i * 3;
      for (let c = 0; c < 3; c++) {
        const normalized = data[cOff + c] / 255;
        const shCoeff = (normalized - 0.5) / SPZ_COLOR_SCALE;
        const rgb = 0.5 + SH_C0 * shCoeff;
        colors[i * 4 + c] = Math.max(0, Math.min(1, rgb));
      }
    }

    // Step 9: Decode scales (uint8 log-encoded)
    for (let i = 0; i < N; i++) {
      const sOff = scaleStart + i * 3;
      for (let c = 0; c < 3; c++) {
        const logScale = data[sOff + c] / 16.0 - 10.0;
        scales[i * 3 + c] = Math.exp(logScale);
      }
    }

    // Step 10: Decode rotations (v2: 3-byte first-three, v3: 4-byte smallest-three)
    for (let i = 0; i < N; i++) {
      const rOff = rotStart + i * rotBytes;
      let quat: [number, number, number, number];

      if (isV3) {
        quat = decodeQuaternionV3(data, rOff);
      } else {
        quat = decodeQuaternionV2(data, rOff);
      }

      rotations[i * 4] = quat[0];      // x
      rotations[i * 4 + 1] = quat[1];  // y
      rotations[i * 4 + 2] = quat[2];  // z
      rotations[i * 4 + 3] = quat[3];  // w
    }

    // Step 11: Decode SH coefficients (optional)
    if (shCoefficients && shDim > 0) {
      for (let i = 0; i < N; i++) {
        for (let s = 0; s < shDim; s++) {
          const off = shStart + (i * shDim + s) * 3;
          for (let c = 0; c < 3; c++) {
            // SH coefficients stored as int8, decoded with color scale
            const raw = data[off + c];
            const signed = raw > 127 ? raw - 256 : raw;
            shCoefficients[(i * shDim + s) * 3 + c] = (signed / 128) * SPZ_COLOR_SCALE;
          }
        }
      }
    }

    // Step 12: Optional alpha filtering
    let finalCount = N;
    if (alphaThreshold > 0) {
      let writeIdx = 0;
      for (let i = 0; i < N; i++) {
        if (opacities[i] >= alphaThreshold) {
          if (writeIdx !== i) {
            // Compact arrays
            positions[writeIdx * 3] = positions[i * 3];
            positions[writeIdx * 3 + 1] = positions[i * 3 + 1];
            positions[writeIdx * 3 + 2] = positions[i * 3 + 2];
            scales[writeIdx * 3] = scales[i * 3];
            scales[writeIdx * 3 + 1] = scales[i * 3 + 1];
            scales[writeIdx * 3 + 2] = scales[i * 3 + 2];
            rotations[writeIdx * 4] = rotations[i * 4];
            rotations[writeIdx * 4 + 1] = rotations[i * 4 + 1];
            rotations[writeIdx * 4 + 2] = rotations[i * 4 + 2];
            rotations[writeIdx * 4 + 3] = rotations[i * 4 + 3];
            colors[writeIdx * 4] = colors[i * 4];
            colors[writeIdx * 4 + 1] = colors[i * 4 + 1];
            colors[writeIdx * 4 + 2] = colors[i * 4 + 2];
            colors[writeIdx * 4 + 3] = colors[i * 4 + 3];
            opacities[writeIdx] = opacities[i];
          }
          writeIdx++;
        }
      }
      finalCount = writeIdx;
      if (finalCount < N) {
        warnings.push(
          `Filtered ${N - finalCount} Gaussians below alpha threshold ${alphaThreshold}`,
        );
      }
    }

    const result: GaussianSplatData = {
      positions: finalCount < N ? positions.slice(0, finalCount * 3) : positions,
      scales: finalCount < N ? scales.slice(0, finalCount * 3) : scales,
      rotations: finalCount < N ? rotations.slice(0, finalCount * 4) : rotations,
      colors: finalCount < N ? colors.slice(0, finalCount * 4) : colors,
      opacities: finalCount < N ? opacities.slice(0, finalCount) : opacities,
      shCoefficients: shCoefficients
        ? (finalCount < N ? shCoefficients.slice(0, finalCount * shDim * 3) : shCoefficients)
        : undefined,
      shDegree: decodeSH ? header.shDegree : 0,
      count: finalCount,
    };

    const durationMs = performance.now() - startTime;

    return {
      data: result,
      durationMs,
      warnings,
    };
  }

  // ─── Encode ───────────────────────────────────────────────────────────────

  async encode(
    data: GaussianSplatData,
    options?: GaussianEncodeOptions,
  ): Promise<CodecResult<EncodedGaussianData>> {
    const startTime = performance.now();
    const warnings: string[] = [];
    const shDegree = options?.shDegree ?? data.shDegree;
    const fractionalBits = options?.fractionalBits ?? 12;
    const antialiased = options?.antialiased ?? false;
    const N = data.count;

    if (N > SPZ_MAX_POINTS) {
      throw new CodecEncodeError(
        this.codecId,
        `Cannot encode ${N.toLocaleString()} Gaussians: exceeds maximum of ${SPZ_MAX_POINTS.toLocaleString()}`,
      );
    }

    const shDim = shDimForDegree(shDegree);
    const rotBytes = 3; // Encode as v2 (3-byte first-three)

    // Calculate buffer size
    const payloadSize =
      SPZ_HEADER_SIZE +
      N * 9 +            // positions
      N +                // alphas
      N * 3 +            // colors
      N * 3 +            // scales
      N * rotBytes +     // rotations
      N * shDim * 3;     // SH

    const buffer = new ArrayBuffer(payloadSize);
    const out = new Uint8Array(buffer);
    const outView = new DataView(buffer);

    // Write header
    outView.setUint32(0, SPZ_MAGIC, true);
    outView.setUint32(4, 2, true); // version 2
    outView.setUint32(8, N, true);
    out[12] = shDegree;
    out[13] = fractionalBits;
    out[14] = antialiased ? 1 : 0;
    out[15] = 0; // reserved

    const posScale = 1 << fractionalBits;

    // Encode positions (24-bit signed fixed-point)
    const posStart = SPZ_HEADER_SIZE;
    for (let i = 0; i < N; i++) {
      const pOff = posStart + i * 9;
      for (let c = 0; c < 3; c++) {
        const fixed = Math.round(data.positions[i * 3 + c] * posScale);
        const clamped = Math.max(-8388608, Math.min(8388607, fixed)); // 24-bit signed range
        const unsigned = clamped & 0xffffff;
        const byteOff = pOff + c * 3;
        out[byteOff] = unsigned & 0xff;
        out[byteOff + 1] = (unsigned >> 8) & 0xff;
        out[byteOff + 2] = (unsigned >> 16) & 0xff;
      }
    }

    // Encode alphas (uint8)
    const alphaStart = posStart + N * 9;
    for (let i = 0; i < N; i++) {
      out[alphaStart + i] = Math.round(Math.max(0, Math.min(1, data.opacities[i])) * 255);
    }

    // Encode colors (uint8 via SH DC inverse transform)
    const colorStart = alphaStart + N;
    for (let i = 0; i < N; i++) {
      const cOff = colorStart + i * 3;
      for (let c = 0; c < 3; c++) {
        const rgb = data.colors[i * 4 + c];
        const shCoeff = (rgb - 0.5) / SH_C0;
        const normalized = shCoeff * SPZ_COLOR_SCALE + 0.5;
        out[cOff + c] = Math.round(Math.max(0, Math.min(1, normalized)) * 255);
      }
    }

    // Encode scales (uint8 log-encoded)
    const scaleStart = colorStart + N * 3;
    for (let i = 0; i < N; i++) {
      const sOff = scaleStart + i * 3;
      for (let c = 0; c < 3; c++) {
        const scale = data.scales[i * 3 + c];
        const logScale = Math.log(Math.max(1e-10, scale));
        const encoded = Math.round((logScale + 10.0) * 16.0);
        out[sOff + c] = Math.max(0, Math.min(255, encoded));
      }
    }

    // Encode rotations (v2: 3-byte first-three)
    const rotStart = scaleStart + N * 3;
    for (let i = 0; i < N; i++) {
      const rOff = rotStart + i * 3;
      const x = data.rotations[i * 4];
      const y = data.rotations[i * 4 + 1];
      const z = data.rotations[i * 4 + 2];
      out[rOff] = Math.round(Math.max(0, Math.min(255, (x + 1) * 127.5)));
      out[rOff + 1] = Math.round(Math.max(0, Math.min(255, (y + 1) * 127.5)));
      out[rOff + 2] = Math.round(Math.max(0, Math.min(255, (z + 1) * 127.5)));
    }

    // Encode SH coefficients (optional)
    if (shDim > 0 && data.shCoefficients) {
      const shStartOffset = rotStart + N * rotBytes;
      for (let i = 0; i < N; i++) {
        for (let s = 0; s < shDim; s++) {
          const off = shStartOffset + (i * shDim + s) * 3;
          for (let c = 0; c < 3; c++) {
            const coeff = data.shCoefficients[(i * shDim + s) * 3 + c];
            const scaled = (coeff / SPZ_COLOR_SCALE) * 128;
            const clamped = Math.round(Math.max(-128, Math.min(127, scaled)));
            out[off + c] = clamped < 0 ? clamped + 256 : clamped;
          }
        }
      }
    }

    // Compress with gzip
    const compressed = await compressGzip(buffer);

    const metadata: CodecMetadata = {
      version: 2,
      gaussianCount: N,
      shDegree,
      compressedSizeBytes: compressed.byteLength,
      uncompressedSizeBytes: payloadSize,
      compressionRatio: compressed.byteLength / payloadSize,
      antialiased,
    };

    const encoded: EncodedGaussianData = {
      data: compressed,
      codecId: this.codecId,
      metadata,
    };

    return {
      data: encoded,
      durationMs: performance.now() - startTime,
      warnings,
    };
  }

  // ─── Stream Decode ────────────────────────────────────────────────────────

  async *stream(
    source: string | ReadableStream<Uint8Array>,
    options?: GaussianStreamDecodeOptions,
  ): AsyncIterable<CodecResult<GaussianSplatData>> {
    const signal = options?.signal;

    // Fetch the full buffer (SPZ format requires full file for header parsing)
    // Future optimization: implement true streaming with partial header parse
    let buffer: ArrayBuffer;

    if (typeof source === 'string') {
      // URL source: stream fetch with progress
      const response = await fetch(source, { signal });
      if (!response.ok) {
        throw new CodecDecodeError(this.codecId, `HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);

      if (!response.body) {
        buffer = await response.arrayBuffer();
        options?.onProgress?.({
          bytesLoaded: buffer.byteLength,
          bytesTotal: buffer.byteLength,
          gaussiansDecoded: 0,
          gaussiansTotal: -1,
          phase: 'downloading',
        });
      } else {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          if (signal?.aborted) {
            reader.cancel();
            return;
          }

          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;

          options?.onProgress?.({
            bytesLoaded: loaded,
            bytesTotal: contentLength || -1,
            gaussiansDecoded: 0,
            gaussiansTotal: -1,
            phase: 'downloading',
          });
        }

        const result = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        buffer = result.buffer;
      }
    } else {
      // ReadableStream source: read all chunks
      const reader = source.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
      }

      const result = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
      buffer = result.buffer;
    }

    options?.onProgress?.({
      bytesLoaded: buffer.byteLength,
      bytesTotal: buffer.byteLength,
      gaussiansDecoded: 0,
      gaussiansTotal: -1,
      phase: 'decompressing',
    });

    // Decode the full buffer
    const decoded = await this.decode(buffer, options);

    options?.onProgress?.({
      bytesLoaded: buffer.byteLength,
      bytesTotal: buffer.byteLength,
      gaussiansDecoded: decoded.data.count,
      gaussiansTotal: decoded.data.count,
      phase: 'complete',
    });

    yield decoded;
  }
}

// =============================================================================
// Helper Functions (module-private)
// =============================================================================

/**
 * Decompress a gzipped buffer using DecompressionStream API.
 */
async function decompressGzip(compressed: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    writer.write(new Uint8Array(compressed));
    writer.close();

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.byteLength;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  }

  // Fallback to pako if available
  if (typeof globalThis !== 'undefined' && (globalThis as any).pako) {
    const pako = (globalThis as any).pako;
    const decompressed: Uint8Array = pako.inflate(new Uint8Array(compressed));
    return decompressed.buffer as ArrayBuffer;
  }

  throw new Error(
    'SPZ decompression requires DecompressionStream API (modern browsers) or pako library.',
  );
}

/**
 * Compress a buffer with gzip using CompressionStream API.
 */
async function compressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    writer.write(new Uint8Array(data));
    writer.close();

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.byteLength;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  }

  throw new Error(
    'SPZ encoding requires CompressionStream API (modern browsers).',
  );
}

/**
 * Parse the 16-byte SPZ header.
 */
function parseSpzHeader(view: DataView): SpzHeader {
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    numPoints: view.getUint32(8, true),
    shDegree: view.getUint8(12),
    fractionalBits: view.getUint8(13),
    flags: view.getUint8(14),
    reserved: view.getUint8(15),
  };
}

/**
 * Validate SPZ header fields.
 */
function validateSpzHeader(header: SpzHeader, codecId: string): void {
  if (header.magic !== SPZ_MAGIC) {
    throw new CodecDecodeError(
      codecId,
      `Invalid SPZ magic: 0x${header.magic.toString(16).toUpperCase()}, ` +
      `expected 0x${SPZ_MAGIC.toString(16).toUpperCase()} ("NGSP")`,
    );
  }

  if (header.version < 1 || header.version > 3) {
    throw new CodecDecodeError(
      codecId,
      `Unsupported SPZ version: ${header.version} (supported: 1-3)`,
    );
  }

  if (header.numPoints > SPZ_MAX_POINTS) {
    throw new CodecDecodeError(
      codecId,
      `SPZ file contains ${header.numPoints.toLocaleString()} points, ` +
      `exceeding maximum of ${SPZ_MAX_POINTS.toLocaleString()}`,
    );
  }

  if (header.shDegree > 3) {
    throw new CodecDecodeError(
      codecId,
      `Invalid SPZ SH degree: ${header.shDegree} (max 3)`,
    );
  }
}

/**
 * Compute number of SH dimensions for a given degree.
 */
function shDimForDegree(degree: number): number {
  switch (degree) {
    case 0: return 0;
    case 1: return 3;
    case 2: return 8;
    case 3: return 15;
    default: return 0;
  }
}

/**
 * Decode v2 quaternion: 3 bytes, first-three encoding.
 */
function decodeQuaternionV2(
  data: Uint8Array,
  offset: number,
): [number, number, number, number] {
  const x = (data[offset] / 127.5) - 1;
  const y = (data[offset + 1] / 127.5) - 1;
  const z = (data[offset + 2] / 127.5) - 1;
  const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
  return [x, y, z, w];
}

/**
 * Decode v3 quaternion: 4 bytes, smallest-three-components encoding.
 */
function decodeQuaternionV3(
  data: Uint8Array,
  offset: number,
): [number, number, number, number] {
  const comp =
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24);
  const iLargest = (comp >>> 30) & 0x3;
  const MASK_9 = (1 << 9) - 1; // 511

  const quat: [number, number, number, number] = [0, 0, 0, 0];
  let sumSquares = 0;
  let bitPos = 0;

  for (let i = 0; i < 4; i++) {
    if (i === iLargest) continue;
    const mag = (comp >>> bitPos) & MASK_9;
    const negBit = (comp >>> (bitPos + 9)) & 0x1;
    bitPos += 10;

    let value = SQRT1_2 * mag / MASK_9;
    if (negBit === 1) value = -value;
    quat[i] = value;
    sumSquares += value * value;
  }

  quat[iLargest] = Math.sqrt(Math.max(0, 1 - sumSquares));
  return quat;
}
