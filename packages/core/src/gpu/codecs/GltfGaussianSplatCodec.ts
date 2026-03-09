/**
 * GltfGaussianSplatCodec - glTF Container Codec for Gaussian Splats
 *
 * Parses glTF 2.0 JSON and GLB binary containers carrying Gaussian splat data
 * via the KHR_gaussian_splatting extension family:
 *
 *   1. **Baseline (uncompressed)**: Reads KHR_gaussian_splatting attributes
 *      directly from glTF accessors/bufferViews (POSITION, _ROTATION, _SCALE,
 *      _OPACITY, SH_DEGREE_N_COEF_M).
 *
 *   2. **SPZ-compressed**: Detects KHR_gaussian_splatting_compression_spz
 *      extension, extracts the SPZ payload from the referenced bufferView,
 *      and delegates decompression to the existing SpzCodec.
 *
 * GLB Detection:
 *   Magic bytes: 0x46546C67 ("glTF" in ASCII, little-endian) at offset 0.
 *   GLB header: magic (4 bytes) + version (4 bytes) + length (4 bytes) = 12 bytes.
 *
 * Color Space Support:
 *   - srgb_rec709_display: BT.709 sRGB display-referred (default)
 *   - lin_rec709_display: BT.709 linear display-referred
 *
 * References:
 *   - KHR_gaussian_splatting (Khronos glTF extension, RC Q1 2026)
 *   - KHR_gaussian_splatting_compression_spz (SPZ compression extension)
 *   - W.038: Dual standardization track codec abstraction
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

import { AbstractGaussianCodec, CodecDecodeError } from './IGaussianCodec.js';
import type {
  GaussianSplatData,
  GaussianCodecCapabilities,
  GaussianDecodeOptions,
  CodecResult,
  CodecMetadata,
} from './types.js';
import { SpzCodec } from './SpzCodec.js';

// =============================================================================
// glTF Constants
// =============================================================================

/** GLB magic number: 0x46546C67 ("glTF" in ASCII, little-endian) */
const GLB_MAGIC = 0x46546c67;

/** GLB header size: magic (4) + version (4) + length (4) = 12 bytes */
const GLB_HEADER_SIZE = 12;

/** GLB chunk header size: chunkLength (4) + chunkType (4) = 8 bytes */
const GLB_CHUNK_HEADER_SIZE = 8;

/** GLB JSON chunk type: 0x4E4F534A ("JSON" in ASCII, little-endian) */
const GLB_CHUNK_TYPE_JSON = 0x4e4f534a;

/** GLB binary chunk type: 0x004E4942 ("BIN\0" in ASCII, little-endian) */
const GLB_CHUNK_TYPE_BIN = 0x004e4942;

/** Extension name for Gaussian splatting base */
const EXT_GAUSSIAN_SPLATTING = 'KHR_gaussian_splatting';

/** Extension name for SPZ compression */
const EXT_GAUSSIAN_SPLATTING_COMPRESSION_SPZ = 'KHR_gaussian_splatting_compression_spz';

/** Maximum Gaussian count for safety */
const MAX_GAUSSIAN_COUNT = 10_000_000;

/** Default memory budget in MB */
const DEFAULT_MAX_MEMORY_MB = 512;

/** SH band 0 coefficient: C0 = 1 / (2 * sqrt(pi)) = 0.2820948 */
const SH_C0 = 0.2820947917738781;

/** SH DC bias applied during training */
const SH_DC_BIAS = 0.5;

// =============================================================================
// glTF Types (subset needed for Gaussian splat parsing)
// =============================================================================

/** glTF accessor component types */
const enum GltfComponentType {
  BYTE = 5120,
  UNSIGNED_BYTE = 5121,
  SHORT = 5122,
  UNSIGNED_SHORT = 5123,
  UNSIGNED_INT = 5125,
  FLOAT = 5126,
}

/** glTF accessor type string to component count */
const GLTF_TYPE_SIZES: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/** Bytes per component type */
const GLTF_COMPONENT_SIZES: Record<number, number> = {
  [GltfComponentType.BYTE]: 1,
  [GltfComponentType.UNSIGNED_BYTE]: 1,
  [GltfComponentType.SHORT]: 2,
  [GltfComponentType.UNSIGNED_SHORT]: 2,
  [GltfComponentType.UNSIGNED_INT]: 4,
  [GltfComponentType.FLOAT]: 4,
};

/** Minimal glTF JSON structure (only fields we need) */
interface GltfJson {
  asset: { version: string; generator?: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  buffers?: GltfBuffer[];
  bufferViews?: GltfBufferView[];
  accessors?: GltfAccessor[];
  meshes?: GltfMesh[];
}

interface GltfBuffer {
  uri?: string;
  byteLength: number;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

interface GltfMesh {
  primitives: GltfPrimitive[];
  name?: string;
}

interface GltfPrimitive {
  attributes: Record<string, number>;
  mode?: number;
  extensions?: Record<string, unknown>;
}

/** KHR_gaussian_splatting extension properties on a primitive */
interface KhrGaussianSplattingPrimitive {
  kernel?: string;
  colorSpace?: string;
  sortingMethod?: string;
  projection?: string;
}

/** KHR_gaussian_splatting_compression_spz extension on a primitive */
interface KhrGaussianSplattingCompressionSpz {
  bufferView: number;
}

// =============================================================================
// Color Space Conversion
// =============================================================================

/**
 * Supported color spaces in KHR_gaussian_splatting.
 */
type GaussianColorSpace = 'srgb_rec709_display' | 'lin_rec709_display';

/**
 * Convert sRGB to linear RGB.
 * Standard sRGB transfer function inverse.
 */
function srgbToLinear(srgb: number): number {
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Convert linear RGB to sRGB.
 * Standard sRGB transfer function.
 */
function linearToSrgb(linear: number): number {
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1.0 / 2.4) - 0.055;
}

// =============================================================================
// GltfGaussianSplatCodec Implementation
// =============================================================================

export class GltfGaussianSplatCodec extends AbstractGaussianCodec {
  private readonly codecId: string;
  private readonly spzCodec: SpzCodec;

  constructor() {
    super();
    this.codecId = 'khr.gltf.gaussian';
    this.spzCodec = new SpzCodec();
  }

  // ─── Capabilities ─────────────────────────────────────────────────────────

  getCapabilities(): GaussianCodecCapabilities {
    return {
      id: this.codecId,
      name: 'glTF Gaussian Splat Codec (KHR_gaussian_splatting)',
      version: '1.0.0',
      fileExtensions: ['glb', 'gltf'],
      mimeTypes: ['model/gltf-binary', 'model/gltf+json'],
      canEncode: false,
      canDecode: true,
      canStream: false,
      canDecodeTemporal: false,
      maxSHDegree: 3,
      maxGaussianCount: MAX_GAUSSIAN_COUNT,
      requiresWasm: false,
      requiresWebGPU: false,
      standard: 'khronos',
      maturity: 'beta',
    };
  }

  // ─── Probe ────────────────────────────────────────────────────────────────

  /**
   * Check if a buffer contains a GLB file by inspecting the magic bytes,
   * or if it starts with a JSON object (potential .gltf).
   */
  canDecode(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 4) return false;

    // Check GLB magic: 0x46546C67 ("glTF" little-endian)
    const view = new DataView(buffer);
    if (view.getUint32(0, true) === GLB_MAGIC) {
      return true;
    }

    // Check for JSON-based glTF: starts with '{'
    const firstByte = new Uint8Array(buffer, 0, 1)[0];
    if (firstByte === 0x7b) {
      // '{'
      // Quick heuristic: look for "KHR_gaussian_splatting" in the first bytes
      try {
        const decoder = new TextDecoder('utf-8');
        const preview = decoder.decode(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
        return preview.includes(EXT_GAUSSIAN_SPLATTING);
      } catch {
        return false;
      }
    }

    return false;
  }

  // ─── Extract Metadata ─────────────────────────────────────────────────────

  async extractMetadata(buffer: ArrayBuffer): Promise<CodecMetadata> {
    const parsed = this.parseGltfContainer(buffer);
    const gltf = parsed.json;

    // Find the first mesh primitive with KHR_gaussian_splatting
    const { primitive, gaussianExt, spzExt } = this.findGaussianPrimitive(gltf);

    let gaussianCount = 0;
    let shDegree = 0;

    if (spzExt) {
      // SPZ-compressed: get count from SPZ header via delegate
      const spzData = this.extractBufferViewData(parsed, spzExt.bufferView);
      const spzMeta = await this.spzCodec.extractMetadata(spzData);
      gaussianCount = spzMeta.gaussianCount;
      shDegree = spzMeta.shDegree;
    } else {
      // Baseline: get count from POSITION accessor
      const posAccessorIndex = primitive.attributes['POSITION'];
      if (posAccessorIndex !== undefined && gltf.accessors) {
        gaussianCount = gltf.accessors[posAccessorIndex].count;
      }
      shDegree = this.detectShDegree(primitive);
    }

    return {
      version: 1,
      gaussianCount,
      shDegree,
      compressedSizeBytes: buffer.byteLength,
      uncompressedSizeBytes: gaussianCount * 60, // estimate
      compressionRatio: spzExt ? buffer.byteLength / (gaussianCount * 60) : 1.0,
      antialiased: false,
      extensions: {
        colorSpace: gaussianExt.colorSpace ?? 'srgb_rec709_display',
        hasSpzCompression: !!spzExt,
      },
    };
  }

  // ─── Decode ───────────────────────────────────────────────────────────────

  async decode(
    buffer: ArrayBuffer,
    options?: GaussianDecodeOptions
  ): Promise<CodecResult<GaussianSplatData>> {
    const startTime = performance.now();
    const warnings: string[] = [];
    const maxGaussians = options?.maxGaussians ?? MAX_GAUSSIAN_COUNT;
    const maxMemoryMB = options?.maxMemoryMB ?? DEFAULT_MAX_MEMORY_MB;
    const decodeSH = options?.decodeSH ?? true;

    // Step 1: Parse glTF container (JSON + binary chunks)
    const parsed = this.parseGltfContainer(buffer);
    const gltf = parsed.json;

    // Step 2: Find the Gaussian splatting primitive
    const { primitive, gaussianExt, spzExt } = this.findGaussianPrimitive(gltf);

    // Step 3: Determine decode path
    let result: CodecResult<GaussianSplatData>;

    if (spzExt) {
      // ── SPZ-Compressed Path ──────────────────────────────────────────────
      warnings.push('Decoding via SPZ compression extension delegation');

      const spzData = this.extractBufferViewData(parsed, spzExt.bufferView);
      result = await this.spzCodec.decode(spzData, options);

      // Apply color space conversion if needed
      const colorSpace = (gaussianExt.colorSpace ?? 'srgb_rec709_display') as GaussianColorSpace;
      if (colorSpace === 'lin_rec709_display') {
        this.convertColorsLinearToSrgb(result.data.colors, result.data.count);
        warnings.push('Converted linear RGB to sRGB for display');
      }
    } else {
      // ── Baseline (Uncompressed) Path ─────────────────────────────────────
      result = this.decodeBaseline(
        parsed,
        gltf,
        primitive,
        gaussianExt,
        maxGaussians,
        maxMemoryMB,
        decodeSH,
        warnings
      );
    }

    const durationMs = performance.now() - startTime;

    return {
      data: result.data,
      durationMs,
      warnings: [...warnings, ...result.warnings],
    };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await super.initialize();
    await this.spzCodec.initialize();
  }

  dispose(): void {
    this.spzCodec.dispose();
    super.dispose();
  }

  // ─── Private: glTF Container Parsing ────────────────────────────────────

  /**
   * Parse a glTF container, handling both GLB and JSON-only formats.
   *
   * @returns Parsed glTF JSON and optional binary buffer
   */
  private parseGltfContainer(buffer: ArrayBuffer): ParsedGltf {
    const view = new DataView(buffer);

    // Check for GLB
    if (buffer.byteLength >= GLB_HEADER_SIZE && view.getUint32(0, true) === GLB_MAGIC) {
      return this.parseGlb(buffer, view);
    }

    // JSON-only glTF
    return this.parseGltfJson(buffer);
  }

  /**
   * Parse a GLB binary container.
   *
   * GLB layout:
   *   [Header: 12 bytes] magic(4) + version(4) + length(4)
   *   [JSON chunk: 8 + N bytes] chunkLength(4) + chunkType(4) + jsonData(N)
   *   [BIN chunk: 8 + M bytes] chunkLength(4) + chunkType(4) + binData(M)
   */
  private parseGlb(buffer: ArrayBuffer, view: DataView): ParsedGltf {
    const version = view.getUint32(4, true);
    const totalLength = view.getUint32(8, true);

    if (version < 2) {
      throw new CodecDecodeError(
        this.codecId,
        `Unsupported GLB version: ${version} (expected >= 2)`
      );
    }

    if (totalLength > buffer.byteLength) {
      throw new CodecDecodeError(
        this.codecId,
        `GLB header declares ${totalLength} bytes but buffer is only ${buffer.byteLength} bytes`
      );
    }

    let jsonChunk: GltfJson | undefined;
    let binChunk: ArrayBuffer | undefined;

    let offset = GLB_HEADER_SIZE;

    while (offset < totalLength) {
      if (offset + GLB_CHUNK_HEADER_SIZE > totalLength) break;

      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunkDataStart = offset + GLB_CHUNK_HEADER_SIZE;
      const chunkDataEnd = chunkDataStart + chunkLength;

      if (chunkDataEnd > totalLength) {
        throw new CodecDecodeError(
          this.codecId,
          `GLB chunk at offset ${offset} extends beyond file (${chunkDataEnd} > ${totalLength})`
        );
      }

      if (chunkType === GLB_CHUNK_TYPE_JSON) {
        const jsonBytes = new Uint8Array(buffer, chunkDataStart, chunkLength);
        const decoder = new TextDecoder('utf-8');
        const jsonText = decoder.decode(jsonBytes);
        try {
          jsonChunk = JSON.parse(jsonText) as GltfJson;
        } catch (e) {
          throw new CodecDecodeError(
            this.codecId,
            'Failed to parse GLB JSON chunk',
            e instanceof Error ? e : undefined
          );
        }
      } else if (chunkType === GLB_CHUNK_TYPE_BIN) {
        binChunk = buffer.slice(chunkDataStart, chunkDataEnd);
      }

      // Advance to next chunk (chunks are 4-byte aligned in GLB)
      offset = chunkDataEnd;
      // GLB spec says chunks are padded to 4-byte alignment
      while (offset % 4 !== 0 && offset < totalLength) offset++;
    }

    if (!jsonChunk) {
      throw new CodecDecodeError(this.codecId, 'GLB file does not contain a JSON chunk');
    }

    return {
      json: jsonChunk,
      binaryChunks: binChunk ? [binChunk] : [],
    };
  }

  /**
   * Parse a JSON-only glTF file.
   */
  private parseGltfJson(buffer: ArrayBuffer): ParsedGltf {
    const decoder = new TextDecoder('utf-8');
    const jsonText = decoder.decode(buffer);
    let json: GltfJson;

    try {
      json = JSON.parse(jsonText) as GltfJson;
    } catch (e) {
      throw new CodecDecodeError(
        this.codecId,
        'Failed to parse glTF JSON',
        e instanceof Error ? e : undefined
      );
    }

    return {
      json,
      binaryChunks: [],
    };
  }

  // ─── Private: Gaussian Primitive Discovery ──────────────────────────────

  /**
   * Find the first mesh primitive that carries KHR_gaussian_splatting.
   *
   * @throws CodecDecodeError if no Gaussian splatting primitive is found
   */
  private findGaussianPrimitive(gltf: GltfJson): {
    primitive: GltfPrimitive;
    gaussianExt: KhrGaussianSplattingPrimitive;
    spzExt: KhrGaussianSplattingCompressionSpz | undefined;
  } {
    if (!gltf.meshes || gltf.meshes.length === 0) {
      throw new CodecDecodeError(this.codecId, 'glTF file contains no meshes');
    }

    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const gsExt = primitive.extensions?.[EXT_GAUSSIAN_SPLATTING] as
          | KhrGaussianSplattingPrimitive
          | undefined;

        if (gsExt) {
          const spzExt = primitive.extensions?.[EXT_GAUSSIAN_SPLATTING_COMPRESSION_SPZ] as
            | KhrGaussianSplattingCompressionSpz
            | undefined;

          return { primitive, gaussianExt: gsExt, spzExt };
        }
      }
    }

    throw new CodecDecodeError(
      this.codecId,
      `No mesh primitive with ${EXT_GAUSSIAN_SPLATTING} extension found in glTF file`
    );
  }

  // ─── Private: BufferView Data Extraction ────────────────────────────────

  /**
   * Extract raw bytes from a glTF bufferView.
   */
  private extractBufferViewData(parsed: ParsedGltf, bufferViewIndex: number): ArrayBuffer {
    const gltf = parsed.json;

    if (!gltf.bufferViews || bufferViewIndex >= gltf.bufferViews.length) {
      throw new CodecDecodeError(
        this.codecId,
        `BufferView index ${bufferViewIndex} is out of range (${gltf.bufferViews?.length ?? 0} bufferViews)`
      );
    }

    const bv = gltf.bufferViews[bufferViewIndex];
    const bufferIndex = bv.buffer;
    const byteOffset = bv.byteOffset ?? 0;
    const byteLength = bv.byteLength;

    // Resolve the buffer data
    const bufferData = this.resolveBuffer(parsed, bufferIndex);

    if (byteOffset + byteLength > bufferData.byteLength) {
      throw new CodecDecodeError(
        this.codecId,
        `BufferView [${bufferViewIndex}] range (${byteOffset}..${byteOffset + byteLength}) ` +
          `exceeds buffer [${bufferIndex}] size (${bufferData.byteLength})`
      );
    }

    return bufferData.slice(byteOffset, byteOffset + byteLength);
  }

  /**
   * Resolve a glTF buffer index to its ArrayBuffer data.
   *
   * For GLB: buffer 0 is the BIN chunk.
   * For external URIs: not supported (would require async fetch).
   */
  private resolveBuffer(parsed: ParsedGltf, bufferIndex: number): ArrayBuffer {
    if (bufferIndex === 0 && parsed.binaryChunks.length > 0) {
      return parsed.binaryChunks[0];
    }

    // Check for data URI in buffer definition
    const gltf = parsed.json;
    if (gltf.buffers && bufferIndex < gltf.buffers.length) {
      const buffer = gltf.buffers[bufferIndex];
      if (buffer.uri && buffer.uri.startsWith('data:')) {
        return this.decodeDataUri(buffer.uri);
      }
    }

    throw new CodecDecodeError(
      this.codecId,
      `Cannot resolve buffer [${bufferIndex}]: external URI buffers are not supported in synchronous decode. ` +
        `Use GLB format or data URIs for embedded data.`
    );
  }

  /**
   * Decode a data URI to an ArrayBuffer.
   */
  private decodeDataUri(uri: string): ArrayBuffer {
    const commaIndex = uri.indexOf(',');
    if (commaIndex === -1) {
      throw new CodecDecodeError(this.codecId, 'Invalid data URI format');
    }

    const header = uri.substring(0, commaIndex);
    const data = uri.substring(commaIndex + 1);

    if (header.includes(';base64')) {
      // Base64 decode
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer as ArrayBuffer;
    }

    // URL-encoded
    const decoded = decodeURIComponent(data);
    const encoder = new TextEncoder();
    return encoder.encode(decoded).buffer as ArrayBuffer;
  }

  // ─── Private: Accessor Data Reading ─────────────────────────────────────

  /**
   * Read accessor data as a Float32Array.
   *
   * Handles component type conversion and normalization for:
   *   - FLOAT: Direct read
   *   - BYTE/SHORT (normalized): Scale to [-1, 1]
   *   - UNSIGNED_BYTE/UNSIGNED_SHORT (normalized): Scale to [0, 1]
   *   - BYTE/SHORT/UNSIGNED_BYTE/UNSIGNED_SHORT (non-normalized): Direct int-to-float
   */
  private readAccessorFloat32(parsed: ParsedGltf, accessorIndex: number): Float32Array {
    const gltf = parsed.json;

    if (!gltf.accessors || accessorIndex >= gltf.accessors.length) {
      throw new CodecDecodeError(this.codecId, `Accessor index ${accessorIndex} is out of range`);
    }

    const accessor = gltf.accessors[accessorIndex];
    const componentCount = GLTF_TYPE_SIZES[accessor.type] ?? 1;
    const totalElements = accessor.count * componentCount;
    const result = new Float32Array(totalElements);

    if (accessor.bufferView === undefined) {
      // No bufferView: all zeros (sparse accessor with no base data)
      return result;
    }

    const bv = gltf.bufferViews![accessor.bufferView];
    const bufferData = this.resolveBuffer(parsed, bv.buffer);
    const byteOffset = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const componentSize = GLTF_COMPONENT_SIZES[accessor.componentType] ?? 4;
    const stride = bv.byteStride ?? componentCount * componentSize;

    const dataView = new DataView(bufferData);

    for (let i = 0; i < accessor.count; i++) {
      const elementOffset = byteOffset + i * stride;

      for (let c = 0; c < componentCount; c++) {
        const compOffset = elementOffset + c * componentSize;
        let value: number;

        switch (accessor.componentType) {
          case GltfComponentType.FLOAT:
            value = dataView.getFloat32(compOffset, true);
            break;
          case GltfComponentType.BYTE:
            value = dataView.getInt8(compOffset);
            if (accessor.normalized) value = Math.max(value / 127, -1.0);
            break;
          case GltfComponentType.UNSIGNED_BYTE:
            value = dataView.getUint8(compOffset);
            if (accessor.normalized) value = value / 255;
            break;
          case GltfComponentType.SHORT:
            value = dataView.getInt16(compOffset, true);
            if (accessor.normalized) value = Math.max(value / 32767, -1.0);
            break;
          case GltfComponentType.UNSIGNED_SHORT:
            value = dataView.getUint16(compOffset, true);
            if (accessor.normalized) value = value / 65535;
            break;
          case GltfComponentType.UNSIGNED_INT:
            value = dataView.getUint32(compOffset, true);
            break;
          default:
            value = 0;
        }

        result[i * componentCount + c] = value;
      }
    }

    return result;
  }

  // ─── Private: Baseline Decode ─────────────────────────────────────────────

  /**
   * Decode uncompressed KHR_gaussian_splatting attributes from glTF accessors.
   */
  private decodeBaseline(
    parsed: ParsedGltf,
    gltf: GltfJson,
    primitive: GltfPrimitive,
    gaussianExt: KhrGaussianSplattingPrimitive,
    maxGaussians: number,
    maxMemoryMB: number,
    decodeSH: boolean,
    warnings: string[]
  ): CodecResult<GaussianSplatData> {
    const attrs = primitive.attributes;

    // ── Read POSITION (required) ────────────────────────────────────────────
    const posIndex = attrs['POSITION'];
    if (posIndex === undefined) {
      throw new CodecDecodeError(
        this.codecId,
        'Missing required POSITION attribute in Gaussian splatting primitive'
      );
    }

    const posAccessor = gltf.accessors![posIndex];
    const totalCount = posAccessor.count;
    const N = Math.min(totalCount, maxGaussians);

    if (N < totalCount) {
      warnings.push(
        `Clamped Gaussian count from ${totalCount.toLocaleString()} to ${N.toLocaleString()} (maxGaussians limit)`
      );
    }

    // Memory pre-check
    this.checkMemoryBudget(N, maxMemoryMB);

    const rawPositions = this.readAccessorFloat32(parsed, posIndex);
    const positions = N < totalCount ? rawPositions.slice(0, N * 3) : rawPositions;

    // ── Read _ROTATION (required) ───────────────────────────────────────────
    // Support both prefixed and unprefixed attribute names
    const rotIndex = attrs['KHR_gaussian_splatting:ROTATION'] ?? attrs['_ROTATION'];
    let rotations: Float32Array;

    if (rotIndex !== undefined) {
      const rawRotations = this.readAccessorFloat32(parsed, rotIndex);
      rotations = N < totalCount ? rawRotations.slice(0, N * 4) : rawRotations;
    } else {
      warnings.push('Missing ROTATION attribute; using identity quaternions');
      rotations = new Float32Array(N * 4);
      for (let i = 0; i < N; i++) {
        rotations[i * 4 + 3] = 1; // w = 1 (identity)
      }
    }

    // ── Read _SCALE (required) ──────────────────────────────────────────────
    const scaleIndex = attrs['KHR_gaussian_splatting:SCALE'] ?? attrs['_SCALE'];
    let scales: Float32Array;

    if (scaleIndex !== undefined) {
      const rawScales = this.readAccessorFloat32(parsed, scaleIndex);
      // glTF KHR_gaussian_splatting stores scales in log-space
      // Convert: actual_scale = exp(log_scale)
      scales = new Float32Array(N * 3);
      const count = Math.min(rawScales.length, N * 3);
      for (let i = 0; i < count; i++) {
        scales[i] = Math.exp(rawScales[i]);
      }
    } else {
      warnings.push('Missing SCALE attribute; using uniform scale 0.01');
      scales = new Float32Array(N * 3);
      scales.fill(0.01);
    }

    // ── Read _OPACITY (required) ────────────────────────────────────────────
    const opacityIndex = attrs['KHR_gaussian_splatting:OPACITY'] ?? attrs['_OPACITY'];
    let opacities: Float32Array;

    if (opacityIndex !== undefined) {
      const rawOpacities = this.readAccessorFloat32(parsed, opacityIndex);
      opacities = N < totalCount ? rawOpacities.slice(0, N) : rawOpacities;
    } else {
      warnings.push('Missing OPACITY attribute; using full opacity (1.0)');
      opacities = new Float32Array(N);
      opacities.fill(1.0);
    }

    // ── Read Colors ─────────────────────────────────────────────────────────
    // Colors come from either:
    //   1. COLOR_0 attribute (VEC4, includes alpha)
    //   2. SH_DEGREE_0_COEF_0 (VEC3, convert from SH DC)
    const colors = new Float32Array(N * 4);
    const colorIndex = attrs['COLOR_0'];
    const shDc0Index =
      attrs['KHR_gaussian_splatting:SH_DEGREE_0_COEF_0'] ?? attrs['_SH_DEGREE_0_COEF_0'];

    if (colorIndex !== undefined) {
      const rawColors = this.readAccessorFloat32(parsed, colorIndex);
      const colorAccessor = gltf.accessors![colorIndex];
      const colorComponents = GLTF_TYPE_SIZES[colorAccessor.type] ?? 4;

      for (let i = 0; i < N; i++) {
        if (colorComponents >= 3) {
          colors[i * 4] = rawColors[i * colorComponents];
          colors[i * 4 + 1] = rawColors[i * colorComponents + 1];
          colors[i * 4 + 2] = rawColors[i * colorComponents + 2];
        }
        colors[i * 4 + 3] =
          colorComponents >= 4 ? rawColors[i * colorComponents + 3] : opacities[i];
      }
    } else if (shDc0Index !== undefined) {
      // Convert SH DC (degree 0) coefficients to RGB color
      const rawSh0 = this.readAccessorFloat32(parsed, shDc0Index);
      for (let i = 0; i < N; i++) {
        for (let c = 0; c < 3; c++) {
          const shCoeff = rawSh0[i * 3 + c];
          colors[i * 4 + c] = Math.max(0, Math.min(1, SH_C0 * shCoeff + SH_DC_BIAS));
        }
        colors[i * 4 + 3] = opacities[i];
      }
    } else {
      // Default to mid-gray
      warnings.push('No color or SH degree 0 data found; using mid-gray');
      for (let i = 0; i < N; i++) {
        colors[i * 4] = 0.5;
        colors[i * 4 + 1] = 0.5;
        colors[i * 4 + 2] = 0.5;
        colors[i * 4 + 3] = opacities[i];
      }
    }

    // ── Color Space Conversion ──────────────────────────────────────────────
    const colorSpace = (gaussianExt.colorSpace ?? 'srgb_rec709_display') as GaussianColorSpace;
    if (colorSpace === 'lin_rec709_display') {
      // Our internal representation expects sRGB; convert from linear
      this.convertColorsLinearToSrgb(colors, N);
      warnings.push('Converted linear RGB to sRGB for display');
    }

    // ── Read SH Coefficients (optional) ─────────────────────────────────────
    let shCoefficients: Float32Array | undefined;
    let shDegree = 0;

    if (decodeSH) {
      shDegree = this.detectShDegree(primitive);
      if (shDegree > 0) {
        const shDim = shDimForDegree(shDegree);
        shCoefficients = new Float32Array(N * shDim * 3);

        // Read SH coefficients degree by degree
        let shOffset = 0;
        for (let d = 1; d <= shDegree; d++) {
          const coeffsPerDegree = 2 * d + 1;
          for (let coef = 0; coef < coeffsPerDegree; coef++) {
            const attrName =
              attrs[`KHR_gaussian_splatting:SH_DEGREE_${d}_COEF_${coef}`] ??
              attrs[`_SH_DEGREE_${d}_COEF_${coef}`];

            if (attrName !== undefined) {
              const rawSh = this.readAccessorFloat32(parsed, attrName);
              for (let i = 0; i < N; i++) {
                for (let c = 0; c < 3; c++) {
                  shCoefficients[(i * shDim + shOffset) * 3 + c] = rawSh[i * 3 + c];
                }
              }
            }
            shOffset++;
          }
        }
      }
    }

    const data: GaussianSplatData = {
      positions,
      scales,
      rotations,
      colors,
      opacities,
      shCoefficients,
      shDegree,
      count: N,
    };

    return {
      data,
      durationMs: 0, // Will be overridden by caller
      warnings,
    };
  }

  // ─── Private: SH Degree Detection ─────────────────────────────────────────

  /**
   * Detect the highest SH degree present in a primitive's attributes.
   */
  private detectShDegree(primitive: GltfPrimitive): number {
    const attrs = primitive.attributes;
    let degree = 0;

    // Check for degree 3 (7 coefficients: 0-6)
    if (
      attrs['KHR_gaussian_splatting:SH_DEGREE_3_COEF_0'] !== undefined ||
      attrs['_SH_DEGREE_3_COEF_0'] !== undefined
    ) {
      degree = 3;
    }
    // Check for degree 2 (5 coefficients: 0-4)
    else if (
      attrs['KHR_gaussian_splatting:SH_DEGREE_2_COEF_0'] !== undefined ||
      attrs['_SH_DEGREE_2_COEF_0'] !== undefined
    ) {
      degree = 2;
    }
    // Check for degree 1 (3 coefficients: 0-2)
    else if (
      attrs['KHR_gaussian_splatting:SH_DEGREE_1_COEF_0'] !== undefined ||
      attrs['_SH_DEGREE_1_COEF_0'] !== undefined
    ) {
      degree = 1;
    }

    return degree;
  }

  // ─── Private: Color Space Conversion ──────────────────────────────────────

  /**
   * Convert color array from linear RGB to sRGB in-place.
   */
  private convertColorsLinearToSrgb(colors: Float32Array, count: number): void {
    for (let i = 0; i < count; i++) {
      colors[i * 4] = linearToSrgb(Math.max(0, Math.min(1, colors[i * 4])));
      colors[i * 4 + 1] = linearToSrgb(Math.max(0, Math.min(1, colors[i * 4 + 1])));
      colors[i * 4 + 2] = linearToSrgb(Math.max(0, Math.min(1, colors[i * 4 + 2])));
      // Alpha channel is not color-space converted
    }
  }
}

// =============================================================================
// Helper Types
// =============================================================================

/** Parsed glTF container (JSON + binary chunks) */
interface ParsedGltf {
  json: GltfJson;
  binaryChunks: ArrayBuffer[];
}

// =============================================================================
// Helper Functions (module-private)
// =============================================================================

/**
 * Compute number of SH dimensions for a given degree (excluding DC).
 * Degree 0: 0 (DC is separate)
 * Degree 1: 3 coefficients
 * Degree 2: 3 + 5 = 8 coefficients
 * Degree 3: 3 + 5 + 7 = 15 coefficients
 */
function shDimForDegree(degree: number): number {
  switch (degree) {
    case 0:
      return 0;
    case 1:
      return 3;
    case 2:
      return 8;
    case 3:
      return 15;
    default:
      return 0;
  }
}
