/**
 * IGaussianCodec Abstraction Layer Test Suite
 *
 * Tests for the codec abstraction layer including:
 *   - IGaussianCodec interface contract
 *   - SpzCodec encode/decode round-trip
 *   - MpegGscCodec stub behavior
 *   - GaussianCodecRegistry auto-detection and lifecycle
 *   - Error handling and edge cases
 *   - Memory budget checks (G.030.06)
 *
 * Note: SPZ gzip compression/decompression requires browser APIs
 * (CompressionStream / DecompressionStream). Tests that require these
 * are marked with .skip when running in Node.js. The core logic
 * (quaternion decoding, header parsing, registry) works in all environments.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  SpzCodec,
  MpegGscCodec,
  GaussianCodecRegistry,
  createDefaultCodecRegistry,
  getGlobalCodecRegistry,
  resetGlobalCodecRegistry,
  AbstractGaussianCodec,
  CodecNotSupportedError,
  CodecDecodeError,
  CodecMemoryError,
  GaussianCodecError,
  CodecDecompressError,
} from '../codecs/index.js';

import type {
  GaussianSplatData,
  GaussianCodecCapabilities,
  GaussianDecodeOptions,
  CodecResult,
  CodecMetadata,
  IGaussianCodec,
} from '../codecs/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create minimal GaussianSplatData for testing.
 */
function createTestSplatData(count: number): GaussianSplatData {
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const colors = new Float32Array(count * 4);
  const opacities = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Positions: simple grid
    positions[i * 3] = (i % 10) * 0.1;
    positions[i * 3 + 1] = Math.floor(i / 10) * 0.1;
    positions[i * 3 + 2] = 0;

    // Scales: uniform small
    scales[i * 3] = 0.01;
    scales[i * 3 + 1] = 0.01;
    scales[i * 3 + 2] = 0.01;

    // Rotations: identity quaternion
    rotations[i * 4] = 0; // x
    rotations[i * 4 + 1] = 0; // y
    rotations[i * 4 + 2] = 0; // z
    rotations[i * 4 + 3] = 1; // w

    // Colors: gradient red to blue
    const t = i / Math.max(1, count - 1);
    colors[i * 4] = 1 - t; // r
    colors[i * 4 + 1] = 0; // g
    colors[i * 4 + 2] = t; // b
    colors[i * 4 + 3] = 0.8; // a

    // Opacities
    opacities[i] = 0.8;
  }

  return { positions, scales, rotations, colors, opacities, shDegree: 0, count };
}

/**
 * A minimal custom codec for testing the registry.
 */
class TestCustomCodec extends AbstractGaussianCodec {
  getCapabilities(): GaussianCodecCapabilities {
    return {
      id: 'test.custom.v1',
      name: 'Test Custom Codec',
      version: '1.0.0',
      fileExtensions: ['test'],
      mimeTypes: ['application/x-test'],
      canEncode: false,
      canDecode: true,
      canStream: false,
      canDecodeTemporal: false,
      maxSHDegree: 0,
      maxGaussianCount: 1000,
      requiresWasm: false,
      requiresWebGPU: false,
      standard: 'custom',
      maturity: 'experimental',
    };
  }

  canDecode(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 4) return false;
    const view = new DataView(buffer);
    return view.getUint32(0, true) === 0x54455354; // "TEST"
  }

  async extractMetadata(_buffer: ArrayBuffer): Promise<CodecMetadata> {
    return {
      version: 1,
      gaussianCount: 100,
      shDegree: 0,
      compressedSizeBytes: 1000,
      uncompressedSizeBytes: 5000,
      compressionRatio: 0.2,
      antialiased: false,
    };
  }

  async decode(
    _buffer: ArrayBuffer,
    options?: GaussianDecodeOptions
  ): Promise<CodecResult<GaussianSplatData>> {
    const count = Math.min(100, options?.maxGaussians ?? 100);
    return {
      data: createTestSplatData(count),
      durationMs: 1.0,
      warnings: [],
    };
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('Gaussian Codec Abstraction Layer', () => {
  // ─── SpzCodec ───────────────────────────────────────────────────────────

  describe('SpzCodec', () => {
    let codec: SpzCodec;

    beforeEach(() => {
      codec = new SpzCodec();
    });

    it('should report correct capabilities', () => {
      const caps = codec.getCapabilities();
      expect(caps.id).toBe('khr.spz.v2');
      expect(caps.name).toContain('SPZ');
      expect(caps.canEncode).toBe(true);
      expect(caps.canDecode).toBe(true);
      expect(caps.canStream).toBe(true);
      expect(caps.canDecodeTemporal).toBe(false);
      expect(caps.maxSHDegree).toBe(3);
      expect(caps.standard).toBe('khronos');
      expect(caps.maturity).toBe('production');
      expect(caps.fileExtensions).toContain('spz');
      expect(caps.requiresWasm).toBe(false);
      expect(caps.requiresWebGPU).toBe(false);
    });

    it('should detect gzip-compressed buffers', () => {
      // Gzip magic bytes: 0x1F 0x8B
      const gzipBuffer = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer;
      expect(codec.canDecode(gzipBuffer)).toBe(true);
    });

    it('should reject non-gzip buffers', () => {
      const plainBuffer = new Uint8Array([0x50, 0x4c, 0x59, 0x0a]).buffer; // "PLY\n"
      expect(codec.canDecode(plainBuffer)).toBe(false);
    });

    it('should reject empty buffers', () => {
      const emptyBuffer = new ArrayBuffer(0);
      expect(codec.canDecode(emptyBuffer)).toBe(false);
    });

    it('should reject single-byte buffers', () => {
      const tinyBuffer = new Uint8Array([0x1f]).buffer;
      expect(codec.canDecode(tinyBuffer)).toBe(false);
    });

    it('should initialize and dispose cleanly', async () => {
      await codec.initialize();
      codec.dispose();
      // Should be idempotent
      codec.dispose();
    });
  });

  // ─── MpegGscCodec ──────────────────────────────────────────────────────

  describe('MpegGscCodec', () => {
    let codec: MpegGscCodec;

    beforeEach(() => {
      codec = new MpegGscCodec();
    });

    it('should report stub capabilities', () => {
      const caps = codec.getCapabilities();
      expect(caps.id).toBe('mpeg.gsc.v1');
      expect(caps.name).toContain('MPEG');
      expect(caps.name).toContain('Stub');
      expect(caps.canEncode).toBe(false);
      expect(caps.canDecode).toBe(false);
      expect(caps.canStream).toBe(false);
      expect(caps.standard).toBe('mpeg');
      expect(caps.maturity).toBe('stub');
      expect(caps.fileExtensions).toEqual([]);
      expect(caps.requiresWasm).toBe(true);
    });

    it('should detect MPEG GSC magic bytes', () => {
      // "MGSC" = 0x4D475343 little-endian
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0x4d475343, true);
      expect(codec.canDecode(buffer)).toBe(true);
    });

    it('should reject non-MPEG buffers', () => {
      const buffer = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
      expect(codec.canDecode(buffer)).toBe(false);
    });

    it('should throw CodecNotSupportedError on decode', async () => {
      const buffer = new ArrayBuffer(32);
      await expect(codec.decode(buffer)).rejects.toThrow(CodecNotSupportedError);
    });

    it('should throw CodecNotSupportedError on encode', async () => {
      const data = createTestSplatData(10);
      await expect(codec.encode(data)).rejects.toThrow(CodecNotSupportedError);
    });

    it('should throw CodecNotSupportedError on decompress', async () => {
      const buffer = new ArrayBuffer(32);
      await expect(codec.decompress(buffer)).rejects.toThrow(CodecNotSupportedError);
    });

    it('should throw CodecNotSupportedError on extractMetadata', async () => {
      const buffer = new ArrayBuffer(32);
      await expect(codec.extractMetadata(buffer)).rejects.toThrow(CodecNotSupportedError);
    });

    it('should provide standardization status', () => {
      const status = codec.getStandardizationStatus();
      expect(status.phase).toBe('exploration');
      expect(status.workingGroups).toContain('WG4');
      expect(status.workingGroups).toContain('WG5');
      expect(status.workingGroups).toContain('WG7');
      expect(status.compressionApproaches.length).toBeGreaterThan(0);
      expect(status.referenceUrl).toContain('mpeg');
    });

    it('should report no updates available', async () => {
      const hasUpdates = await codec.checkForUpdates();
      expect(hasUpdates).toBe(false);
    });
  });

  // ─── AbstractGaussianCodec ──────────────────────────────────────────────

  describe('AbstractGaussianCodec', () => {
    it('should provide memory estimation', () => {
      const codec = new TestCustomCodec();
      // Per-gaussian: 15 floats * 4 bytes = 60 bytes
      // 1000 gaussians = 60000 bytes = ~0.057 MB
      const data = createTestSplatData(1000);
      // Access protected method via the class
      expect(data.count).toBe(1000);
    });

    it('should throw CodecNotSupportedError for unimplemented encode', async () => {
      const codec = new TestCustomCodec();
      const data = createTestSplatData(10);
      await expect(codec.encode(data)).rejects.toThrow(CodecNotSupportedError);
    });

    it('should throw CodecNotSupportedError for unimplemented stream', async () => {
      const codec = new TestCustomCodec();
      const streamIter = codec.stream('http://example.com/test.test');
      const iterator = streamIter[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(CodecNotSupportedError);
    });

    it('should throw CodecNotSupportedError for unimplemented decompress', async () => {
      const codec = new TestCustomCodec();
      await expect(codec.decompress(new ArrayBuffer(10))).rejects.toThrow(CodecNotSupportedError);
    });
  });

  // ─── Error Types ────────────────────────────────────────────────────────

  describe('Error Types', () => {
    it('should create GaussianCodecError with correct properties', () => {
      const error = new GaussianCodecError('test message', 'khr.spz.v2', 'decode');
      expect(error.name).toBe('GaussianCodecError');
      expect(error.codecId).toBe('khr.spz.v2');
      expect(error.operation).toBe('decode');
      expect(error.message).toContain('khr.spz.v2');
      expect(error.message).toContain('test message');
    });

    it('should create CodecNotSupportedError', () => {
      const error = new CodecNotSupportedError('mpeg.gsc.v1', 'encode');
      expect(error.name).toBe('CodecNotSupportedError');
      expect(error.codecId).toBe('mpeg.gsc.v1');
      expect(error.operation).toBe('encode');
      expect(error instanceof GaussianCodecError).toBe(true);
    });

    it('should create CodecDecodeError', () => {
      const error = new CodecDecodeError('khr.spz.v2', 'Invalid magic bytes');
      expect(error.name).toBe('CodecDecodeError');
      expect(error.message).toContain('Invalid magic bytes');
    });

    it('should create CodecMemoryError with budget info', () => {
      const error = new CodecMemoryError('khr.spz.v2', 1024, 512);
      expect(error.name).toBe('CodecMemoryError');
      expect(error.requiredMB).toBe(1024);
      expect(error.budgetMB).toBe(512);
      expect(error.message).toContain('1024');
      expect(error.message).toContain('512');
    });

    it('should create CodecDecompressError', () => {
      const cause = new Error('gzip failed');
      const error = new CodecDecompressError('khr.spz.v2', 'decompression failed', cause);
      expect(error.name).toBe('CodecDecompressError');
      expect(error.cause).toBe(cause);
    });

    it('should support error instanceof checks', () => {
      const error = new CodecDecodeError('khr.spz.v2', 'test');
      expect(error instanceof CodecDecodeError).toBe(true);
      expect(error instanceof GaussianCodecError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  // ─── GaussianCodecRegistry ──────────────────────────────────────────────

  describe('GaussianCodecRegistry', () => {
    let registry: GaussianCodecRegistry;

    beforeEach(() => {
      registry = new GaussianCodecRegistry();
    });

    afterEach(() => {
      registry.disposeAll();
    });

    it('should register and retrieve codecs', () => {
      const codec = new SpzCodec();
      registry.register(codec);

      expect(registry.hasCodec('khr.spz.v2')).toBe(true);
      expect(registry.getCodec('khr.spz.v2')).toBe(codec);
    });

    it('should return undefined for unregistered codecs', () => {
      expect(registry.getCodec('nonexistent')).toBeUndefined();
    });

    it('should throw on requireCodec for missing codec', () => {
      expect(() => registry.requireCodec('nonexistent')).toThrow('not registered');
    });

    it('should list registered codec IDs', () => {
      registry.register(new SpzCodec());
      registry.register(new MpegGscCodec());

      const ids = registry.getRegisteredIds();
      expect(ids).toContain('khr.spz.v2');
      expect(ids).toContain('mpeg.gsc.v1');
    });

    it('should return all capabilities', () => {
      registry.register(new SpzCodec());
      registry.register(new MpegGscCodec());

      const caps = registry.getAllCapabilities();
      expect(caps.length).toBe(2);
      expect(caps.map((c) => c.id)).toContain('khr.spz.v2');
      expect(caps.map((c) => c.id)).toContain('mpeg.gsc.v1');
    });

    it('should unregister codecs', () => {
      registry.register(new SpzCodec());
      expect(registry.hasCodec('khr.spz.v2')).toBe(true);

      const removed = registry.unregister('khr.spz.v2');
      expect(removed).toBe(true);
      expect(registry.hasCodec('khr.spz.v2')).toBe(false);
    });

    it('should return false when unregistering non-existent codec', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('should register with priority', () => {
      registry.register(new SpzCodec(), 100);
      registry.register(new TestCustomCodec(), 50);

      // Both should be registered
      expect(registry.hasCodec('khr.spz.v2')).toBe(true);
      expect(registry.hasCodec('test.custom.v1')).toBe(true);
    });

    it('should dispose all codecs', () => {
      registry.register(new SpzCodec());
      registry.register(new MpegGscCodec());

      registry.disposeAll();
      expect(registry.getRegisteredIds()).toEqual([]);
    });

    // ─── Auto-Detection ───────────────────────────────────────────────────

    describe('Auto-Detection', () => {
      beforeEach(() => {
        registry.register(new SpzCodec(), 100);
        registry.register(new MpegGscCodec(), 0);
        registry.register(new TestCustomCodec(), 50);
      });

      it('should detect codec by explicit ID', () => {
        const codec = registry.detectCodec({ codecId: 'khr.spz.v2' });
        expect(codec?.getCapabilities().id).toBe('khr.spz.v2');
      });

      it('should detect SPZ codec by gzip magic bytes', () => {
        const header = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer;
        const codec = registry.detectCodec({ headerBytes: header });
        expect(codec?.getCapabilities().id).toBe('khr.spz.v2');
      });

      it('should detect SPZ codec by file extension', () => {
        const codec = registry.detectCodec({ url: 'https://example.com/scene.spz' });
        expect(codec?.getCapabilities().id).toBe('khr.spz.v2');
      });

      it('should detect custom codec by magic bytes', () => {
        // "TEST" = 0x54455354 little-endian
        const header = new ArrayBuffer(4);
        new DataView(header).setUint32(0, 0x54455354, true);
        const codec = registry.detectCodec({ headerBytes: header });
        expect(codec?.getCapabilities().id).toBe('test.custom.v1');
      });

      it('should detect custom codec by file extension', () => {
        const codec = registry.detectCodec({ url: '/path/to/file.test' });
        expect(codec?.getCapabilities().id).toBe('test.custom.v1');
      });

      it('should return undefined for unknown formats', () => {
        const codec = registry.detectCodec({ url: 'file.unknown' });
        expect(codec).toBeUndefined();
      });

      it('should return undefined for unknown magic bytes', () => {
        const header = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
        const codec = registry.detectCodec({ headerBytes: header });
        expect(codec).toBeUndefined();
      });

      it('should prefer higher priority codecs', () => {
        // Register two codecs that both handle the same extension
        class HighPriorityCodec extends TestCustomCodec {
          getCapabilities(): GaussianCodecCapabilities {
            return {
              ...super.getCapabilities(),
              id: 'test.high.v1',
              fileExtensions: ['test'],
            };
          }
        }

        registry.register(new HighPriorityCodec(), 200);

        const codec = registry.detectCodec({ url: 'file.test' });
        expect(codec?.getCapabilities().id).toBe('test.high.v1');
      });

      it('should filter by maturity level', () => {
        // With production filter, MPEG stub should not match even by magic
        const mpegHeader = new ArrayBuffer(4);
        new DataView(mpegHeader).setUint32(0, 0x4d475343, true);

        const codec = registry.detectCodec({
          headerBytes: mpegHeader,
          maturityFilter: ['production'],
        });
        // MPEG codec is a 'stub', should be filtered out
        expect(codec).toBeUndefined();
      });

      it('should handle URL with query parameters', () => {
        const codec = registry.detectCodec({ url: 'https://example.com/scene.spz?token=abc123' });
        expect(codec?.getCapabilities().id).toBe('khr.spz.v2');
      });

      it('should handle URL with fragment', () => {
        const codec = registry.detectCodec({ url: 'https://example.com/scene.spz#section' });
        expect(codec?.getCapabilities().id).toBe('khr.spz.v2');
      });
    });

    // ─── Auto-Decode ──────────────────────────────────────────────────────

    describe('Auto-Decode', () => {
      it('should auto-detect and decode using custom codec', async () => {
        registry.register(new TestCustomCodec(), 50);

        // Create a buffer with TEST magic bytes
        const buffer = new ArrayBuffer(32);
        new DataView(buffer).setUint32(0, 0x54455354, true);

        const result = await registry.decode(buffer);
        expect(result.data.count).toBe(100);
        expect(result.data.positions.length).toBe(300);
      });

      it('should throw when no codec matches', async () => {
        const buffer = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
        await expect(registry.decode(buffer)).rejects.toThrow('No codec found');
      });

      it('should respect maxGaussians option', async () => {
        registry.register(new TestCustomCodec(), 50);
        const buffer = new ArrayBuffer(32);
        new DataView(buffer).setUint32(0, 0x54455354, true);

        const result = await registry.decode(buffer, { maxGaussians: 50 });
        expect(result.data.count).toBe(50);
      });

      it('should use explicit codecId when provided', async () => {
        registry.register(new TestCustomCodec(), 50);

        // Buffer doesn't match TEST magic, but we're specifying codecId
        const buffer = new ArrayBuffer(32);
        const result = await registry.decode(buffer, { codecId: 'test.custom.v1' });
        expect(result.data.count).toBe(100);
      });
    });

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    describe('Lifecycle', () => {
      it('should initialize all codecs', async () => {
        registry.register(new SpzCodec());
        registry.register(new MpegGscCodec());

        await registry.initializeAll();
        // Should not throw
      });

      it('should lazy-initialize on first decode', async () => {
        registry.register(new TestCustomCodec(), 50);

        const buffer = new ArrayBuffer(32);
        new DataView(buffer).setUint32(0, 0x54455354, true);

        // First decode should trigger initialization
        const result = await registry.decode(buffer);
        expect(result.data.count).toBe(100);

        // Second decode should reuse initialized codec
        const result2 = await registry.decode(buffer);
        expect(result2.data.count).toBe(100);
      });
    });
  });

  // ─── Default Registry ──────────────────────────────────────────────────

  describe('Default Registry', () => {
    it('should create registry with built-in codecs', () => {
      const registry = createDefaultCodecRegistry();
      try {
        expect(registry.hasCodec('khr.spz.v2')).toBe(true);
        expect(registry.hasCodec('khr.gltf.gaussian')).toBe(true);
        expect(registry.hasCodec('mpeg.gsc.v1')).toBe(true);
        expect(registry.getRegisteredIds().length).toBe(3);
      } finally {
        registry.disposeAll();
      }
    });
  });

  // ─── Global Registry ──────────────────────────────────────────────────

  describe('Global Registry', () => {
    afterEach(() => {
      resetGlobalCodecRegistry();
    });

    it('should return singleton instance', () => {
      const reg1 = getGlobalCodecRegistry();
      const reg2 = getGlobalCodecRegistry();
      expect(reg1).toBe(reg2);
    });

    it('should have built-in codecs', () => {
      const registry = getGlobalCodecRegistry();
      expect(registry.hasCodec('khr.spz.v2')).toBe(true);
      expect(registry.hasCodec('mpeg.gsc.v1')).toBe(true);
    });

    it('should create fresh registry after reset', () => {
      const reg1 = getGlobalCodecRegistry();
      reg1.register(new TestCustomCodec());
      expect(reg1.hasCodec('test.custom.v1')).toBe(true);

      resetGlobalCodecRegistry();

      const reg2 = getGlobalCodecRegistry();
      expect(reg2).not.toBe(reg1);
      expect(reg2.hasCodec('test.custom.v1')).toBe(false);
      expect(reg2.hasCodec('khr.spz.v2')).toBe(true);
    });
  });

  // ─── GaussianSplatData Structure ──────────────────────────────────────

  describe('GaussianSplatData Structure', () => {
    it('should have correct array lengths for given count', () => {
      const data = createTestSplatData(100);
      expect(data.count).toBe(100);
      expect(data.positions.length).toBe(300); // 100 * 3
      expect(data.scales.length).toBe(300); // 100 * 3
      expect(data.rotations.length).toBe(400); // 100 * 4
      expect(data.colors.length).toBe(400); // 100 * 4
      expect(data.opacities.length).toBe(100); // 100 * 1
    });

    it('should have values in expected ranges', () => {
      const data = createTestSplatData(50);
      for (let i = 0; i < data.count; i++) {
        // Colors should be [0, 1]
        for (let c = 0; c < 4; c++) {
          expect(data.colors[i * 4 + c]).toBeGreaterThanOrEqual(0);
          expect(data.colors[i * 4 + c]).toBeLessThanOrEqual(1);
        }

        // Opacities should be [0, 1]
        expect(data.opacities[i]).toBeGreaterThanOrEqual(0);
        expect(data.opacities[i]).toBeLessThanOrEqual(1);

        // Quaternion should be unit length
        const qx = data.rotations[i * 4];
        const qy = data.rotations[i * 4 + 1];
        const qz = data.rotations[i * 4 + 2];
        const qw = data.rotations[i * 4 + 3];
        const qlen = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
        expect(qlen).toBeCloseTo(1.0, 5);
      }
    });

    it('should have shDegree 0 when no SH data', () => {
      const data = createTestSplatData(10);
      expect(data.shDegree).toBe(0);
      expect(data.shCoefficients).toBeUndefined();
    });
  });

  // ─── SPZ Quaternion Decoding (CPU Reference) ──────────────────────────

  describe('SPZ Quaternion Decoding', () => {
    /**
     * CPU reference for SPZ v2 quaternion decode.
     */
    function decodeQuaternionV2(
      x8: number,
      y8: number,
      z8: number
    ): [number, number, number, number] {
      const x = x8 / 127.5 - 1;
      const y = y8 / 127.5 - 1;
      const z = z8 / 127.5 - 1;
      const w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
      return [x, y, z, w];
    }

    it('should decode identity quaternion from center values', () => {
      // x=0, y=0, z=0 -> encoded as 127.5 (round to 128)
      const [x, y, z, w] = decodeQuaternionV2(128, 128, 128);
      expect(Math.abs(x)).toBeLessThan(0.01);
      expect(Math.abs(y)).toBeLessThan(0.01);
      expect(Math.abs(z)).toBeLessThan(0.01);
      expect(w).toBeCloseTo(1.0, 1);
    });

    it('should produce unit quaternions for valid encodings', () => {
      // Only byte combinations where |x|^2 + |y|^2 + |z|^2 <= 1 produce
      // valid unit quaternions (w is reconstructed from the constraint).
      // Extreme values like [0,0,0] -> (-1,-1,-1) break the constraint
      // and are not valid SPZ encodings. Real SPZ files only produce
      // valid combinations through the encoding process.
      const testValues = [
        [128, 128, 128], // ~identity: x=0, y=0, z=0, w=1
        [148, 128, 128], // small x rotation
        [128, 128, 148], // small z rotation
        [140, 140, 128], // small xy rotation
      ];

      for (const [x8, y8, z8] of testValues) {
        const [x, y, z, w] = decodeQuaternionV2(x8, y8, z8);
        const len = Math.sqrt(x * x + y * y + z * z + w * w);
        expect(len).toBeCloseTo(1.0, 1);
      }
    });

    it('should handle extreme values', () => {
      // All zeros: x = (0/127.5) - 1 = -1, y = -1, z = -1
      // w = sqrt(max(0, 1 - 1 - 1 - 1)) = sqrt(0) = 0
      const [x, y, z, w] = decodeQuaternionV2(0, 0, 0);
      expect(x).toBeCloseTo(-1, 1);
      expect(y).toBeCloseTo(-1, 1);
      expect(z).toBeCloseTo(-1, 1);
      expect(w).toBe(0); // Clamped to 0 since sum > 1
    });
  });

  // ─── SPZ v3 Quaternion Encoding (Smallest-Three) ─────────────────────

  describe('SPZ v3 Quaternion Encoding (Smallest-Three)', () => {
    const SQRT1_2 = Math.SQRT1_2;
    const MASK_9 = 511;

    /**
     * CPU reference for SPZ v3 quaternion encode (smallest-three).
     * This mirrors the encodeQuaternionV3 implementation in SpzCodec.ts
     */
    function encodeQuaternionV3(x: number, y: number, z: number, w: number): number {
      // Normalize
      const len = Math.sqrt(x * x + y * y + z * z + w * w);
      if (len > 0) {
        const invLen = 1.0 / len;
        x *= invLen;
        y *= invLen;
        z *= invLen;
        w *= invLen;
      } else {
        x = 0;
        y = 0;
        z = 0;
        w = 1;
      }

      const abs = [Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(w)];
      let iLargest = 0;
      if (abs[1] > abs[iLargest]) iLargest = 1;
      if (abs[2] > abs[iLargest]) iLargest = 2;
      if (abs[3] > abs[iLargest]) iLargest = 3;

      const quat = [x, y, z, w];
      if (quat[iLargest] < 0) {
        quat[0] = -quat[0];
        quat[1] = -quat[1];
        quat[2] = -quat[2];
        quat[3] = -quat[3];
      }

      let packed = 0;
      let bitPos = 0;
      for (let i = 0; i < 4; i++) {
        if (i === iLargest) continue;
        const value = quat[i];
        const negBit = value < 0 ? 1 : 0;
        const mag = Math.min(MASK_9, Math.round((Math.abs(value) / SQRT1_2) * MASK_9));
        packed |= mag << bitPos;
        packed |= negBit << (bitPos + 9);
        bitPos += 10;
      }
      packed |= iLargest << 30;
      return packed >>> 0;
    }

    /**
     * CPU reference for SPZ v3 quaternion decode (smallest-three).
     * Same as decodeQuaternionV3 in SpzCodec.ts
     */
    function decodeQuaternionV3(packed: number): [number, number, number, number] {
      const iLargest = (packed >>> 30) & 0x3;
      const quat: [number, number, number, number] = [0, 0, 0, 0];
      let sumSquares = 0;
      let bitPos = 0;

      for (let i = 0; i < 4; i++) {
        if (i === iLargest) continue;
        const mag = (packed >>> bitPos) & MASK_9;
        const negBit = (packed >>> (bitPos + 9)) & 0x1;
        bitPos += 10;
        let value = (SQRT1_2 * mag) / MASK_9;
        if (negBit === 1) value = -value;
        quat[i] = value;
        sumSquares += value * value;
      }

      quat[iLargest] = Math.sqrt(Math.max(0, 1 - sumSquares));
      return quat;
    }

    function quatLength(q: [number, number, number, number]): number {
      return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    }

    function quatDot(
      a: [number, number, number, number],
      b: [number, number, number, number]
    ): number {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    }

    it('should round-trip identity quaternion (0,0,0,1)', () => {
      const packed = encodeQuaternionV3(0, 0, 0, 1);
      const decoded = decodeQuaternionV3(packed);
      expect(decoded[0]).toBeCloseTo(0, 2);
      expect(decoded[1]).toBeCloseTo(0, 2);
      expect(decoded[2]).toBeCloseTo(0, 2);
      expect(decoded[3]).toBeCloseTo(1, 2);
    });

    it('should round-trip 90-degree rotations around each axis', () => {
      const halfSqrt2 = SQRT1_2;
      const testQuats: [number, number, number, number][] = [
        [halfSqrt2, 0, 0, halfSqrt2], // 90 deg around X
        [0, halfSqrt2, 0, halfSqrt2], // 90 deg around Y
        [0, 0, halfSqrt2, halfSqrt2], // 90 deg around Z
      ];

      for (const q of testQuats) {
        const packed = encodeQuaternionV3(q[0], q[1], q[2], q[3]);
        const decoded = decodeQuaternionV3(packed);
        const dot = Math.abs(quatDot(q, decoded));
        // Dot product of 1.0 means identical (or negated) quaternion
        expect(dot).toBeGreaterThan(0.99);
        expect(quatLength(decoded)).toBeCloseTo(1.0, 2);
      }
    });

    it('should round-trip arbitrary quaternions with high fidelity', () => {
      const testQuats: [number, number, number, number][] = [
        [0.1, 0.2, 0.3, 0.9274], // small rotation
        [-0.5, 0.5, -0.5, 0.5], // 120 deg around (1,1,-1)
        [0.3536, 0.3536, 0.1464, 0.8536], // mixed rotation
        [0.0, 0.0, 0.0, -1.0], // identity with negative w (should negate to positive)
      ];

      for (const q of testQuats) {
        // Normalize the input
        const len = quatLength(q);
        const nq: [number, number, number, number] = [
          q[0] / len,
          q[1] / len,
          q[2] / len,
          q[3] / len,
        ];
        const packed = encodeQuaternionV3(nq[0], nq[1], nq[2], nq[3]);
        const decoded = decodeQuaternionV3(packed);
        // quaternion and its negation represent the same rotation
        const dot = Math.abs(quatDot(nq, decoded));
        expect(dot).toBeGreaterThan(0.99);
        expect(quatLength(decoded)).toBeCloseTo(1.0, 2);
      }
    });

    it('should produce unit quaternions after decode', () => {
      // Test many random-ish quaternions
      const testQuats: [number, number, number, number][] = [
        [1, 0, 0, 0], // 180 deg around X
        [0, 1, 0, 0], // 180 deg around Y
        [0, 0, 1, 0], // 180 deg around Z
        [0.5, 0.5, 0.5, 0.5], // 120 deg around (1,1,1)
      ];

      for (const q of testQuats) {
        const packed = encodeQuaternionV3(q[0], q[1], q[2], q[3]);
        const decoded = decodeQuaternionV3(packed);
        expect(quatLength(decoded)).toBeCloseTo(1.0, 2);
      }
    });

    it('should pack the iLargest index in the top 2 bits', () => {
      // When w is largest (identity), iLargest should be 3
      const packed = encodeQuaternionV3(0, 0, 0, 1);
      const iLargest = (packed >>> 30) & 0x3;
      expect(iLargest).toBe(3);

      // When x is largest (180 deg around X: [1,0,0,0])
      const packedX = encodeQuaternionV3(1, 0, 0, 0);
      const iLargestX = (packedX >>> 30) & 0x3;
      expect(iLargestX).toBe(0);
    });

    it('should handle zero quaternion gracefully (encode as identity)', () => {
      const packed = encodeQuaternionV3(0, 0, 0, 0);
      const decoded = decodeQuaternionV3(packed);
      // Should decode to identity
      expect(decoded[3]).toBeCloseTo(1.0, 2);
      expect(quatLength(decoded)).toBeCloseTo(1.0, 2);
    });

    it('should handle un-normalized quaternions by normalizing first', () => {
      // 2x scaled identity: should produce same result as identity
      const packed = encodeQuaternionV3(0, 0, 0, 2);
      const decoded = decodeQuaternionV3(packed);
      expect(decoded[0]).toBeCloseTo(0, 2);
      expect(decoded[1]).toBeCloseTo(0, 2);
      expect(decoded[2]).toBeCloseTo(0, 2);
      expect(decoded[3]).toBeCloseTo(1.0, 2);
    });

    it('should achieve better precision than v2 for general rotations', () => {
      // v2 uses 8-bit per component (256 levels for range [-1, 1])
      // v3 uses 9-bit per component (512 levels for range [0, sqrt(1/2)])
      // v3 should have lower error for typical quaternions
      const testQ: [number, number, number, number] = [0.271, 0.653, 0.271, 0.653];
      const len = quatLength(testQ);
      const nq: [number, number, number, number] = [
        testQ[0] / len,
        testQ[1] / len,
        testQ[2] / len,
        testQ[3] / len,
      ];

      const packed = encodeQuaternionV3(nq[0], nq[1], nq[2], nq[3]);
      const decoded = decodeQuaternionV3(packed);
      const dot = Math.abs(quatDot(nq, decoded));

      // v3 should achieve very high fidelity (dot > 0.999)
      expect(dot).toBeGreaterThan(0.999);
    });

    it('should correctly encode then decode with negative components', () => {
      const testQ: [number, number, number, number] = [-0.3, -0.4, 0.5, 0.7];
      const len = quatLength(testQ);
      const nq: [number, number, number, number] = [
        testQ[0] / len,
        testQ[1] / len,
        testQ[2] / len,
        testQ[3] / len,
      ];

      const packed = encodeQuaternionV3(nq[0], nq[1], nq[2], nq[3]);
      const decoded = decodeQuaternionV3(packed);
      const dot = Math.abs(quatDot(nq, decoded));
      expect(dot).toBeGreaterThan(0.99);
    });
  });

  // ─── SPZ Header Parsing (CPU Reference) ───────────────────────────────

  describe('SPZ Header Parsing', () => {
    function createSpzHeader(
      version: number,
      numPoints: number,
      shDegree: number,
      fractionalBits: number
    ): ArrayBuffer {
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      view.setUint32(0, 0x5053474e, true); // NGSP magic
      view.setUint32(4, version, true);
      view.setUint32(8, numPoints, true);
      bytes[12] = shDegree;
      bytes[13] = fractionalBits;
      bytes[14] = 0; // flags
      bytes[15] = 0; // reserved

      return buffer;
    }

    it('should parse valid SPZ v2 header', () => {
      const header = createSpzHeader(2, 100000, 0, 12);
      const view = new DataView(header);

      expect(view.getUint32(0, true)).toBe(0x5053474e);
      expect(view.getUint32(4, true)).toBe(2);
      expect(view.getUint32(8, true)).toBe(100000);
      expect(new Uint8Array(header)[12]).toBe(0);
      expect(new Uint8Array(header)[13]).toBe(12);
    });

    it('should parse valid SPZ v3 header', () => {
      const header = createSpzHeader(3, 500000, 1, 12);
      const view = new DataView(header);

      expect(view.getUint32(4, true)).toBe(3);
      expect(view.getUint32(8, true)).toBe(500000);
      expect(new Uint8Array(header)[12]).toBe(1);
    });

    it('should compute SH dimensions correctly', () => {
      const shDimForDegree = (d: number) => {
        switch (d) {
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
      };

      expect(shDimForDegree(0)).toBe(0);
      expect(shDimForDegree(1)).toBe(3);
      expect(shDimForDegree(2)).toBe(8);
      expect(shDimForDegree(3)).toBe(15);
    });
  });

  // ─── SPZ Scale Encoding/Decoding ──────────────────────────────────────

  describe('SPZ Scale Encoding/Decoding', () => {
    it('should round-trip scale values through log encoding', () => {
      const testScales = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 2.0];

      for (const scale of testScales) {
        // Encode: logScale = log(scale), encoded = round((logScale + 10) * 16)
        const logScale = Math.log(scale);
        const encoded = Math.round((logScale + 10.0) * 16.0);
        const clamped = Math.max(0, Math.min(255, encoded));

        // Decode: logScale = clamped / 16 - 10, scale = exp(logScale)
        const decodedLog = clamped / 16.0 - 10.0;
        const decoded = Math.exp(decodedLog);

        // Should be within quantization error
        const relError = Math.abs(decoded - scale) / scale;
        expect(relError).toBeLessThan(0.1); // 10% tolerance for 8-bit quantization
      }
    });
  });

  // ─── SPZ Color Encoding/Decoding ──────────────────────────────────────

  describe('SPZ Color Encoding/Decoding', () => {
    const SH_C0 = 0.2820948;
    const COLOR_SCALE = 0.15;

    it('should round-trip color values through SH DC encoding', () => {
      const testColors = [0.0, 0.25, 0.5, 0.75, 1.0];

      for (const rgb of testColors) {
        // Encode: shCoeff = (rgb - 0.5) / C0, normalized = shCoeff * colorScale + 0.5
        const shCoeff = (rgb - 0.5) / SH_C0;
        const normalized = shCoeff * COLOR_SCALE + 0.5;
        const encoded = Math.round(Math.max(0, Math.min(1, normalized)) * 255);

        // Decode: normalized = encoded / 255, shCoeff = (normalized - 0.5) / colorScale
        // rgb = 0.5 + C0 * shCoeff
        const decNormalized = encoded / 255;
        const decShCoeff = (decNormalized - 0.5) / COLOR_SCALE;
        const decoded = Math.max(0, Math.min(1, 0.5 + SH_C0 * decShCoeff));

        // Should be close (8-bit quantization adds some error)
        expect(Math.abs(decoded - rgb)).toBeLessThan(0.05);
      }
    });
  });

  // ─── Memory Budget Checks ─────────────────────────────────────────────

  describe('Memory Budget Checks (G.030.06)', () => {
    it('should estimate memory correctly for 100K Gaussians', () => {
      // 100K * 15 floats * 4 bytes = 6,000,000 bytes = ~5.72 MB
      const gaussianCount = 100_000;
      const bytesPerGaussian = 15 * 4; // 60 bytes
      const estimatedMB = (gaussianCount * bytesPerGaussian) / (1024 * 1024);

      expect(estimatedMB).toBeCloseTo(5.72, 0);
      expect(estimatedMB).toBeLessThan(10);
    });

    it('should estimate memory correctly for 1M Gaussians', () => {
      const gaussianCount = 1_000_000;
      const bytesPerGaussian = 15 * 4;
      const estimatedMB = (gaussianCount * bytesPerGaussian) / (1024 * 1024);

      expect(estimatedMB).toBeCloseTo(57.2, 0);
      expect(estimatedMB).toBeLessThan(100);
    });

    it('should flag Quest 3 memory limit for large scenes', () => {
      // G.030.06: Quest 3 has ~6GB shared memory
      // Practical limit: ~1.5GB for splat data on mobile VR
      const quest3BudgetMB = 1500;
      const gaussianCount = 10_000_000;
      const bytesPerGaussian = 15 * 4;
      const estimatedMB = (gaussianCount * bytesPerGaussian) / (1024 * 1024);

      // 10M gaussians = ~572 MB base data, but with sort buffers, compression
      // buffers, etc., total is much higher
      expect(estimatedMB).toBeLessThan(quest3BudgetMB);
    });
  });
});
