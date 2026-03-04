/**
 * GltfGaussianSplatCodec Test Suite
 *
 * Tests for the glTF Gaussian splatting codec including:
 *   - GLB magic byte detection (0x46546C67)
 *   - glTF JSON detection (KHR_gaussian_splatting heuristic)
 *   - GLB container parsing (header, JSON chunk, BIN chunk)
 *   - Baseline (uncompressed) decode from KHR_gaussian_splatting attributes
 *   - SPZ-compressed path delegation to SpzCodec
 *   - Color space handling (srgb_rec709_display, lin_rec709_display)
 *   - SH degree detection from attribute names
 *   - Registry integration with priority 50
 *   - Error handling for invalid data
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  GltfGaussianSplatCodec,
  GaussianCodecRegistry,
  createDefaultCodecRegistry,
  resetGlobalCodecRegistry,
  getGlobalCodecRegistry,
  CodecDecodeError,
} from '../codecs/index.js';

// =============================================================================
// Test Helpers: GLB Builder
// =============================================================================

/**
 * Build a minimal GLB binary from JSON and optional binary data.
 */
function buildGlb(json: object, binaryData?: ArrayBuffer): ArrayBuffer {
  const jsonStr = JSON.stringify(json);
  const jsonEncoder = new TextEncoder();
  const jsonBytes = jsonEncoder.encode(jsonStr);

  // Pad JSON to 4-byte alignment (with 0x20 = space as per GLB spec)
  const jsonPaddedLength = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonPadded = new Uint8Array(jsonPaddedLength);
  jsonPadded.set(jsonBytes);
  for (let i = jsonBytes.length; i < jsonPaddedLength; i++) {
    jsonPadded[i] = 0x20; // space padding
  }

  // Pad binary to 4-byte alignment (with 0x00 as per GLB spec)
  let binPaddedLength = 0;
  let binPadded: Uint8Array | undefined;
  if (binaryData && binaryData.byteLength > 0) {
    binPaddedLength = Math.ceil(binaryData.byteLength / 4) * 4;
    binPadded = new Uint8Array(binPaddedLength);
    binPadded.set(new Uint8Array(binaryData));
  }

  // Total size: header(12) + json chunk header(8) + json data + optional bin chunk header(8) + bin data
  const hasbin = binPadded !== undefined;
  const totalLength =
    12 +
    8 + jsonPaddedLength +
    (hasbin ? 8 + binPaddedLength : 0);

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // GLB header
  view.setUint32(0, 0x46546c67, true);  // magic: "glTF"
  view.setUint32(4, 2, true);            // version: 2
  view.setUint32(8, totalLength, true);   // total length

  // JSON chunk
  let offset = 12;
  view.setUint32(offset, jsonPaddedLength, true);  // chunk length
  view.setUint32(offset + 4, 0x4e4f534a, true);   // chunk type: "JSON"
  bytes.set(jsonPadded, offset + 8);
  offset += 8 + jsonPaddedLength;

  // BIN chunk (optional)
  if (hasbin) {
    view.setUint32(offset, binPaddedLength, true);    // chunk length
    view.setUint32(offset + 4, 0x004e4942, true);     // chunk type: "BIN\0"
    bytes.set(binPadded!, offset + 8);
  }

  return buffer;
}

/**
 * Create a minimal glTF JSON with KHR_gaussian_splatting for N Gaussians.
 * The binary layout is interleaved:
 *   - positions: N * 3 * float32 (12 bytes each)
 *   - rotations: N * 4 * float32 (16 bytes each)
 *   - scales: N * 3 * float32 (12 bytes each)
 *   - opacities: N * 1 * float32 (4 bytes each)
 *   - colors: N * 4 * float32 (16 bytes each)
 */
function createBaselineGltfData(
  count: number,
  options?: {
    colorSpace?: string;
    scaleInLogSpace?: boolean;
    includeShDegree1?: boolean;
  },
) {
  const scaleInLogSpace = options?.scaleInLogSpace ?? true;

  // Calculate buffer layout
  const posBytes = count * 3 * 4;      // VEC3 float
  const rotBytes = count * 4 * 4;      // VEC4 float
  const scaleBytes = count * 3 * 4;    // VEC3 float
  const opacityBytes = count * 1 * 4;  // SCALAR float
  const colorBytes = count * 4 * 4;    // VEC4 float
  const sh1Bytes = options?.includeShDegree1 ? count * 3 * 3 * 4 : 0; // 3 VEC3 floats

  const totalBytes = posBytes + rotBytes + scaleBytes + opacityBytes + colorBytes + sh1Bytes;
  const binaryData = new ArrayBuffer(totalBytes);
  const dataView = new DataView(binaryData);

  let offset = 0;

  // Write positions
  const posOffset = offset;
  for (let i = 0; i < count; i++) {
    dataView.setFloat32(offset, (i % 10) * 0.1, true); offset += 4;  // x
    dataView.setFloat32(offset, Math.floor(i / 10) * 0.1, true); offset += 4;  // y
    dataView.setFloat32(offset, 0.0, true); offset += 4;  // z
  }

  // Write rotations (identity quaternion: x=0, y=0, z=0, w=1)
  const rotOffset = offset;
  for (let i = 0; i < count; i++) {
    dataView.setFloat32(offset, 0.0, true); offset += 4;  // x
    dataView.setFloat32(offset, 0.0, true); offset += 4;  // y
    dataView.setFloat32(offset, 0.0, true); offset += 4;  // z
    dataView.setFloat32(offset, 1.0, true); offset += 4;  // w
  }

  // Write scales (in log-space or linear)
  const scaleOffset = offset;
  for (let i = 0; i < count; i++) {
    const scaleVal = scaleInLogSpace ? Math.log(0.01) : 0.01;
    dataView.setFloat32(offset, scaleVal, true); offset += 4;
    dataView.setFloat32(offset, scaleVal, true); offset += 4;
    dataView.setFloat32(offset, scaleVal, true); offset += 4;
  }

  // Write opacities
  const opacityOffset = offset;
  for (let i = 0; i < count; i++) {
    dataView.setFloat32(offset, 0.8, true); offset += 4;
  }

  // Write colors (gradient red to blue, RGBA)
  const colorOffset = offset;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    dataView.setFloat32(offset, 1 - t, true); offset += 4;  // r
    dataView.setFloat32(offset, 0.0, true); offset += 4;    // g
    dataView.setFloat32(offset, t, true); offset += 4;      // b
    dataView.setFloat32(offset, 0.8, true); offset += 4;    // a
  }

  // Write SH degree 1 coefficients (3 VEC3 attributes)
  const sh1Offset = offset;
  if (options?.includeShDegree1) {
    for (let coef = 0; coef < 3; coef++) {
      for (let i = 0; i < count; i++) {
        dataView.setFloat32(offset, 0.1 * (coef + 1), true); offset += 4; // r
        dataView.setFloat32(offset, 0.2 * (coef + 1), true); offset += 4; // g
        dataView.setFloat32(offset, 0.3 * (coef + 1), true); offset += 4; // b
      }
    }
  }

  // Build buffer views
  const bufferViews = [
    { buffer: 0, byteOffset: posOffset, byteLength: posBytes },
    { buffer: 0, byteOffset: rotOffset, byteLength: rotBytes },
    { buffer: 0, byteOffset: scaleOffset, byteLength: scaleBytes },
    { buffer: 0, byteOffset: opacityOffset, byteLength: opacityBytes },
    { buffer: 0, byteOffset: colorOffset, byteLength: colorBytes },
  ];

  // Build accessors
  const accessors = [
    { bufferView: 0, componentType: 5126, count, type: 'VEC3' },   // POSITION
    { bufferView: 1, componentType: 5126, count, type: 'VEC4' },   // ROTATION
    { bufferView: 2, componentType: 5126, count, type: 'VEC3' },   // SCALE
    { bufferView: 3, componentType: 5126, count, type: 'SCALAR' }, // OPACITY
    { bufferView: 4, componentType: 5126, count, type: 'VEC4' },   // COLOR_0
  ];

  // Build SH degree 1 buffer views and accessors
  const attributes: Record<string, number> = {
    'POSITION': 0,
    '_ROTATION': 1,
    '_SCALE': 2,
    '_OPACITY': 3,
    'COLOR_0': 4,
  };

  if (options?.includeShDegree1) {
    for (let coef = 0; coef < 3; coef++) {
      const bvIdx = bufferViews.length;
      const accIdx = accessors.length;
      const coefByteOffset = sh1Offset + coef * count * 3 * 4;

      bufferViews.push({
        buffer: 0,
        byteOffset: coefByteOffset,
        byteLength: count * 3 * 4,
      });
      accessors.push({
        bufferView: bvIdx,
        componentType: 5126,
        count,
        type: 'VEC3',
      });
      attributes[`_SH_DEGREE_1_COEF_${coef}`] = accIdx;
    }
  }

  // Build glTF JSON
  const gltfJson = {
    asset: { version: '2.0', generator: 'HoloScript Test' },
    extensionsUsed: ['KHR_gaussian_splatting'],
    buffers: [{ byteLength: totalBytes }],
    bufferViews,
    accessors,
    meshes: [
      {
        primitives: [
          {
            attributes,
            mode: 0, // POINTS
            extensions: {
              KHR_gaussian_splatting: {
                kernel: 'ellipse',
                colorSpace: options?.colorSpace ?? 'srgb_rec709_display',
                sortingMethod: 'cameraDistance',
                projection: 'perspective',
              },
            },
          },
        ],
      },
    ],
  };

  return { gltfJson, binaryData };
}

// =============================================================================
// Tests
// =============================================================================

describe('GltfGaussianSplatCodec', () => {
  let codec: GltfGaussianSplatCodec;

  beforeEach(() => {
    codec = new GltfGaussianSplatCodec();
  });

  // ─── Capabilities ─────────────────────────────────────────────────────────

  describe('Capabilities', () => {
    it('should report correct codec ID', () => {
      const caps = codec.getCapabilities();
      expect(caps.id).toBe('khr.gltf.gaussian');
    });

    it('should report correct name', () => {
      const caps = codec.getCapabilities();
      expect(caps.name).toContain('glTF');
      expect(caps.name).toContain('KHR_gaussian_splatting');
    });

    it('should support GLB and glTF extensions', () => {
      const caps = codec.getCapabilities();
      expect(caps.fileExtensions).toContain('glb');
      expect(caps.fileExtensions).toContain('gltf');
    });

    it('should support correct MIME types', () => {
      const caps = codec.getCapabilities();
      expect(caps.mimeTypes).toContain('model/gltf-binary');
      expect(caps.mimeTypes).toContain('model/gltf+json');
    });

    it('should be decode-only (no encode)', () => {
      const caps = codec.getCapabilities();
      expect(caps.canEncode).toBe(false);
      expect(caps.canDecode).toBe(true);
    });

    it('should report Khronos standard and beta maturity', () => {
      const caps = codec.getCapabilities();
      expect(caps.standard).toBe('khronos');
      expect(caps.maturity).toBe('beta');
    });

    it('should support SH degree up to 3', () => {
      const caps = codec.getCapabilities();
      expect(caps.maxSHDegree).toBe(3);
    });

    it('should not require WASM or WebGPU', () => {
      const caps = codec.getCapabilities();
      expect(caps.requiresWasm).toBe(false);
      expect(caps.requiresWebGPU).toBe(false);
    });
  });

  // ─── canDecode (Probe) ────────────────────────────────────────────────────

  describe('canDecode', () => {
    it('should detect GLB by magic bytes (0x46546C67)', () => {
      const glbHeader = new ArrayBuffer(12);
      const view = new DataView(glbHeader);
      view.setUint32(0, 0x46546c67, true); // "glTF" magic
      view.setUint32(4, 2, true);           // version 2
      view.setUint32(8, 12, true);          // length

      expect(codec.canDecode(glbHeader)).toBe(true);
    });

    it('should detect glTF JSON containing KHR_gaussian_splatting', () => {
      const json = JSON.stringify({
        asset: { version: '2.0' },
        extensionsUsed: ['KHR_gaussian_splatting'],
        meshes: [],
      });
      const encoder = new TextEncoder();
      const buffer = encoder.encode(json).buffer;

      expect(codec.canDecode(buffer as ArrayBuffer)).toBe(true);
    });

    it('should reject empty buffers', () => {
      expect(codec.canDecode(new ArrayBuffer(0))).toBe(false);
    });

    it('should reject small buffers', () => {
      expect(codec.canDecode(new ArrayBuffer(2))).toBe(false);
    });

    it('should reject non-glTF data', () => {
      const buffer = new Uint8Array([0x50, 0x4c, 0x59, 0x0a]).buffer; // "PLY\n"
      expect(codec.canDecode(buffer)).toBe(false);
    });

    it('should reject gzip data (SPZ files)', () => {
      const buffer = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer;
      expect(codec.canDecode(buffer)).toBe(false);
    });

    it('should reject JSON without KHR_gaussian_splatting', () => {
      const json = JSON.stringify({
        asset: { version: '2.0' },
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      });
      const encoder = new TextEncoder();
      const buffer = encoder.encode(json).buffer;

      expect(codec.canDecode(buffer as ArrayBuffer)).toBe(false);
    });
  });

  // ─── GLB Parsing ──────────────────────────────────────────────────────────

  describe('GLB Parsing', () => {
    it('should parse a valid GLB with JSON and BIN chunks', async () => {
      const { gltfJson, binaryData } = createBaselineGltfData(10);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.count).toBe(10);
      expect(result.data.positions.length).toBe(30);
    });

    it('should reject GLB with version < 2', async () => {
      const { gltfJson } = createBaselineGltfData(1);
      const glb = buildGlb(gltfJson, new ArrayBuffer(256));

      // Modify version to 1
      const view = new DataView(glb);
      view.setUint32(4, 1, true);

      await expect(codec.decode(glb)).rejects.toThrow('Unsupported GLB version');
    });

    it('should reject GLB with truncated header', async () => {
      const glb = new ArrayBuffer(8); // Too short for GLB header
      const view = new DataView(glb);
      view.setUint32(0, 0x46546c67, true);

      // canDecode will still detect the magic, but decode should handle it
      // Actually, canDecode checks 4 bytes, parseGlb checks 12
      await expect(codec.decode(glb)).rejects.toThrow();
    });
  });

  // ─── Baseline Decode ──────────────────────────────────────────────────────

  describe('Baseline Decode', () => {
    it('should decode positions correctly', async () => {
      const count = 5;
      const { gltfJson, binaryData } = createBaselineGltfData(count);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.count).toBe(count);
      expect(result.data.positions.length).toBe(count * 3);

      // Verify first position: (0, 0, 0)
      expect(result.data.positions[0]).toBeCloseTo(0.0);
      expect(result.data.positions[1]).toBeCloseTo(0.0);
      expect(result.data.positions[2]).toBeCloseTo(0.0);

      // Verify second position: (0.1, 0, 0)
      expect(result.data.positions[3]).toBeCloseTo(0.1);
      expect(result.data.positions[4]).toBeCloseTo(0.0);
    });

    it('should decode identity rotations', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.rotations.length).toBe(count * 4);

      for (let i = 0; i < count; i++) {
        expect(result.data.rotations[i * 4]).toBeCloseTo(0);     // x
        expect(result.data.rotations[i * 4 + 1]).toBeCloseTo(0); // y
        expect(result.data.rotations[i * 4 + 2]).toBeCloseTo(0); // z
        expect(result.data.rotations[i * 4 + 3]).toBeCloseTo(1); // w
      }
    });

    it('should decode scales from log-space', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count, {
        scaleInLogSpace: true,
      });
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.scales.length).toBe(count * 3);

      // log(0.01) => exp(log(0.01)) = 0.01
      for (let i = 0; i < count * 3; i++) {
        expect(result.data.scales[i]).toBeCloseTo(0.01, 4);
      }
    });

    it('should decode opacities', async () => {
      const count = 5;
      const { gltfJson, binaryData } = createBaselineGltfData(count);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.opacities.length).toBe(count);

      for (let i = 0; i < count; i++) {
        expect(result.data.opacities[i]).toBeCloseTo(0.8);
      }
    });

    it('should decode colors from COLOR_0 attribute', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.colors.length).toBe(count * 4);

      // First Gaussian: red (1, 0, 0, 0.8)
      expect(result.data.colors[0]).toBeCloseTo(1.0); // r
      expect(result.data.colors[1]).toBeCloseTo(0.0); // g
      expect(result.data.colors[2]).toBeCloseTo(0.0); // b
      expect(result.data.colors[3]).toBeCloseTo(0.8); // a

      // Last Gaussian: blue (0, 0, 1, 0.8)
      const lastIdx = (count - 1) * 4;
      expect(result.data.colors[lastIdx]).toBeCloseTo(0.0);     // r
      expect(result.data.colors[lastIdx + 1]).toBeCloseTo(0.0); // g
      expect(result.data.colors[lastIdx + 2]).toBeCloseTo(1.0); // b
      expect(result.data.colors[lastIdx + 3]).toBeCloseTo(0.8); // a
    });

    it('should respect maxGaussians option', async () => {
      const count = 100;
      const { gltfJson, binaryData } = createBaselineGltfData(count);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb, { maxGaussians: 25 });
      expect(result.data.count).toBe(25);
      expect(result.data.positions.length).toBe(75);    // 25 * 3
      expect(result.data.rotations.length).toBe(100);   // 25 * 4
    });

    it('should include timing information', async () => {
      const { gltfJson, binaryData } = createBaselineGltfData(10);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.warnings).toBeInstanceOf(Array);
    });
  });

  // ─── Color Space ──────────────────────────────────────────────────────────

  describe('Color Space Handling', () => {
    it('should pass through sRGB colors unchanged', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count, {
        colorSpace: 'srgb_rec709_display',
      });
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);

      // First Gaussian: red (1, 0, 0, 0.8) - should be unchanged
      expect(result.data.colors[0]).toBeCloseTo(1.0);
      expect(result.data.colors[1]).toBeCloseTo(0.0);
      expect(result.data.colors[2]).toBeCloseTo(0.0);
    });

    it('should convert linear RGB to sRGB when colorSpace is lin_rec709_display', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count, {
        colorSpace: 'lin_rec709_display',
      });
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);

      // Linear 1.0 converts to sRGB 1.0 (identity at boundaries)
      expect(result.data.colors[0]).toBeCloseTo(1.0, 1);

      // Linear 0.0 converts to sRGB 0.0 (identity at boundaries)
      expect(result.data.colors[1]).toBeCloseTo(0.0, 1);

      // Check that conversion warning was generated
      expect(result.warnings.some(w => w.includes('linear RGB to sRGB'))).toBe(true);
    });
  });

  // ─── SH Degree Detection ─────────────────────────────────────────────────

  describe('SH Degree Detection', () => {
    it('should detect SH degree 0 when no SH attributes present', async () => {
      const { gltfJson, binaryData } = createBaselineGltfData(5);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.shDegree).toBe(0);
      expect(result.data.shCoefficients).toBeUndefined();
    });

    it('should detect and decode SH degree 1 coefficients', async () => {
      const count = 5;
      const { gltfJson, binaryData } = createBaselineGltfData(count, {
        includeShDegree1: true,
      });
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb);
      expect(result.data.shDegree).toBe(1);
      expect(result.data.shCoefficients).toBeDefined();
      // Degree 1 = 3 SH coefficients (each VEC3) per Gaussian
      expect(result.data.shCoefficients!.length).toBe(count * 3 * 3);
    });

    it('should skip SH when decodeSH is false', async () => {
      const count = 5;
      const { gltfJson, binaryData } = createBaselineGltfData(count, {
        includeShDegree1: true,
      });
      const glb = buildGlb(gltfJson, binaryData);

      const result = await codec.decode(glb, { decodeSH: false });
      expect(result.data.shDegree).toBe(0);
      expect(result.data.shCoefficients).toBeUndefined();
    });
  });

  // ─── Metadata Extraction ──────────────────────────────────────────────────

  describe('Extract Metadata', () => {
    it('should extract Gaussian count from baseline glTF', async () => {
      const count = 42;
      const { gltfJson, binaryData } = createBaselineGltfData(count);
      const glb = buildGlb(gltfJson, binaryData);

      const meta = await codec.extractMetadata(glb);
      expect(meta.gaussianCount).toBe(count);
      expect(meta.version).toBe(1);
    });

    it('should detect colorSpace in metadata extensions', async () => {
      const { gltfJson, binaryData } = createBaselineGltfData(10, {
        colorSpace: 'lin_rec709_display',
      });
      const glb = buildGlb(gltfJson, binaryData);

      const meta = await codec.extractMetadata(glb);
      expect(meta.extensions?.colorSpace).toBe('lin_rec709_display');
      expect(meta.extensions?.hasSpzCompression).toBe(false);
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should throw on glTF with no meshes', async () => {
      const json = {
        asset: { version: '2.0' },
        extensionsUsed: ['KHR_gaussian_splatting'],
      };
      const glb = buildGlb(json);

      await expect(codec.decode(glb)).rejects.toThrow('no meshes');
    });

    it('should throw when no Gaussian splatting primitive found', async () => {
      const json = {
        asset: { version: '2.0' },
        meshes: [
          {
            primitives: [
              { attributes: { POSITION: 0 }, mode: 0 },
            ],
          },
        ],
      };
      const glb = buildGlb(json);

      await expect(codec.decode(glb)).rejects.toThrow('KHR_gaussian_splatting');
    });

    it('should throw on invalid JSON in glTF', async () => {
      const encoder = new TextEncoder();
      const invalidJson = encoder.encode('{ invalid json }');
      await expect(codec.decode(invalidJson.buffer as ArrayBuffer)).rejects.toThrow();
    });

    it('should throw when POSITION attribute is missing', async () => {
      const json = {
        asset: { version: '2.0' },
        extensionsUsed: ['KHR_gaussian_splatting'],
        meshes: [
          {
            primitives: [
              {
                attributes: { '_ROTATION': 0 },
                mode: 0,
                extensions: { KHR_gaussian_splatting: {} },
              },
            ],
          },
        ],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 10, type: 'VEC4' },
        ],
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 160 },
        ],
        buffers: [{ byteLength: 160 }],
      };
      const glb = buildGlb(json, new ArrayBuffer(160));

      await expect(codec.decode(glb)).rejects.toThrow('POSITION');
    });
  });

  // ─── Registry Integration ─────────────────────────────────────────────────

  describe('Registry Integration', () => {
    let registry: GaussianCodecRegistry;

    beforeEach(() => {
      registry = createDefaultCodecRegistry();
    });

    afterEach(() => {
      registry.disposeAll();
    });

    it('should be registered in default registry', () => {
      expect(registry.hasCodec('khr.gltf.gaussian')).toBe(true);
    });

    it('should detect GLB files by magic bytes', () => {
      const glbHeader = new ArrayBuffer(12);
      const view = new DataView(glbHeader);
      view.setUint32(0, 0x46546c67, true);
      view.setUint32(4, 2, true);
      view.setUint32(8, 12, true);

      const detected = registry.detectCodec({ headerBytes: glbHeader });
      expect(detected?.getCapabilities().id).toBe('khr.gltf.gaussian');
    });

    it('should detect by .glb extension', () => {
      const detected = registry.detectCodec({ url: 'scene.glb' });
      expect(detected?.getCapabilities().id).toBe('khr.gltf.gaussian');
    });

    it('should detect by .gltf extension', () => {
      const detected = registry.detectCodec({ url: 'scene.gltf' });
      expect(detected?.getCapabilities().id).toBe('khr.gltf.gaussian');
    });

    it('should prefer SPZ codec for gzip files over glTF codec', () => {
      const gzipHeader = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer;
      const detected = registry.detectCodec({ headerBytes: gzipHeader });
      // SPZ has priority 100, glTF has 50 - but SPZ detects gzip magic, glTF does not
      expect(detected?.getCapabilities().id).toBe('khr.spz.v2');
    });

    it('should auto-decode a baseline GLB', async () => {
      const { gltfJson, binaryData } = createBaselineGltfData(10);
      const glb = buildGlb(gltfJson, binaryData);

      const result = await registry.decode(glb);
      expect(result.data.count).toBe(10);
    });

    it('should coexist with SPZ and MPEG GSC codecs', () => {
      const ids = registry.getRegisteredIds();
      expect(ids).toContain('khr.spz.v2');
      expect(ids).toContain('khr.gltf.gaussian');
      expect(ids).toContain('mpeg.gsc.v1');
      expect(ids.length).toBe(3);
    });
  });

  // ─── Global Registry ──────────────────────────────────────────────────────

  describe('Global Registry', () => {
    afterEach(() => {
      resetGlobalCodecRegistry();
    });

    it('should include glTF codec in global registry', () => {
      const registry = getGlobalCodecRegistry();
      expect(registry.hasCodec('khr.gltf.gaussian')).toBe(true);
    });
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('should initialize and dispose cleanly', async () => {
      await codec.initialize();
      codec.dispose();
      // Should be idempotent
      codec.dispose();
    });
  });

  // ─── Missing Optional Attributes ──────────────────────────────────────────

  describe('Missing Optional Attributes', () => {
    it('should use identity quaternions when ROTATION is missing', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);

      // Remove rotation attribute
      delete (gltfJson.meshes![0].primitives[0].attributes as any)['_ROTATION'];

      const glb = buildGlb(gltfJson, binaryData);
      const result = await codec.decode(glb);

      // Should still decode with identity rotations
      for (let i = 0; i < count; i++) {
        expect(result.data.rotations[i * 4 + 3]).toBeCloseTo(1); // w = 1
      }
      expect(result.warnings.some(w => w.includes('ROTATION'))).toBe(true);
    });

    it('should use default scale when SCALE is missing', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);

      delete (gltfJson.meshes![0].primitives[0].attributes as any)['_SCALE'];

      const glb = buildGlb(gltfJson, binaryData);
      const result = await codec.decode(glb);

      expect(result.data.scales[0]).toBeCloseTo(0.01);
      expect(result.warnings.some(w => w.includes('SCALE'))).toBe(true);
    });

    it('should use full opacity when OPACITY is missing', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);

      delete (gltfJson.meshes![0].primitives[0].attributes as any)['_OPACITY'];

      const glb = buildGlb(gltfJson, binaryData);
      const result = await codec.decode(glb);

      expect(result.data.opacities[0]).toBeCloseTo(1.0);
      expect(result.warnings.some(w => w.includes('OPACITY'))).toBe(true);
    });

    it('should use mid-gray when no color data available', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);

      delete (gltfJson.meshes![0].primitives[0].attributes as any)['COLOR_0'];

      const glb = buildGlb(gltfJson, binaryData);
      const result = await codec.decode(glb);

      expect(result.data.colors[0]).toBeCloseTo(0.5); // r
      expect(result.data.colors[1]).toBeCloseTo(0.5); // g
      expect(result.data.colors[2]).toBeCloseTo(0.5); // b
      expect(result.warnings.some(w => w.includes('mid-gray'))).toBe(true);
    });
  });

  // ─── KHR-Prefixed Attributes ──────────────────────────────────────────────

  describe('KHR-Prefixed Attributes', () => {
    it('should support KHR_gaussian_splatting: prefixed attribute names', async () => {
      const count = 3;
      const { gltfJson, binaryData } = createBaselineGltfData(count);

      // Rename attributes to use KHR prefix
      const attrs = gltfJson.meshes![0].primitives[0].attributes as any;
      attrs['KHR_gaussian_splatting:ROTATION'] = attrs['_ROTATION'];
      delete attrs['_ROTATION'];
      attrs['KHR_gaussian_splatting:SCALE'] = attrs['_SCALE'];
      delete attrs['_SCALE'];
      attrs['KHR_gaussian_splatting:OPACITY'] = attrs['_OPACITY'];
      delete attrs['_OPACITY'];

      const glb = buildGlb(gltfJson, binaryData);
      const result = await codec.decode(glb);

      expect(result.data.count).toBe(count);
      // Rotations should still be decoded correctly
      expect(result.data.rotations[3]).toBeCloseTo(1); // w = 1 (identity)
    });
  });
});
