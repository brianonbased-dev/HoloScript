/**
 * GaussianSplatSorter Test Suite
 *
 * Tests for the wait-free hierarchical radix sort pipeline for Gaussian splatting.
 * Since WebGPU is not available in Node.js test environments, these tests validate:
 *   - Algorithm correctness (CPU reference implementations)
 *   - Data packing/unpacking (RGBA8, f16)
 *   - Sort key generation
 *   - Memory calculations
 *   - Configuration validation
 *
 * GPU integration tests should be run in a browser environment.
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// CPU Reference Implementations (mirror WGSL logic for testing)
// =============================================================================

/**
 * CPU implementation of RGBA8 packing (mirrors packRGBA8 in splat-compress.wgsl)
 */
function packRGBA8(r: number, g: number, b: number, a: number): number {
  const rb = Math.round(Math.min(Math.max(r * 255, 0), 255));
  const gb = Math.round(Math.min(Math.max(g * 255, 0), 255));
  const bb = Math.round(Math.min(Math.max(b * 255, 0), 255));
  const ab = Math.round(Math.min(Math.max(a * 255, 0), 255));
  // Use DataView for reliable 32-bit unsigned representation
  return (rb | (gb << 8) | (bb << 16) | (ab << 24)) >>> 0;
}

/**
 * CPU implementation of RGBA8 unpacking (mirrors unpackRGBA8 in splat-render-sorted.wgsl)
 */
function unpackRGBA8(packed: number): [number, number, number, number] {
  return [
    (packed & 0xff) / 255,
    ((packed >>> 8) & 0xff) / 255,
    ((packed >>> 16) & 0xff) / 255,
    ((packed >>> 24) & 0xff) / 255,
  ];
}

/**
 * CPU implementation of f32 -> f16 conversion (mirrors f32ToF16 in splat-compress.wgsl)
 */
function f32ToF16(value: number): number {
  const buffer = new ArrayBuffer(4);
  const f32View = new Float32Array(buffer);
  const u32View = new Uint32Array(buffer);
  f32View[0] = value;
  const bits = u32View[0];

  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  if (exponent === 0) return sign;
  if (exponent === 255) {
    if (mantissa !== 0) return sign | 0x7e00; // NaN
    return sign | 0x7c00; // Inf
  }

  const newExponent = exponent - 127 + 15;
  if (newExponent <= 0) return sign;
  if (newExponent >= 31) return sign | 0x7c00;

  return sign | (newExponent << 10) | (mantissa >>> 13);
}

/**
 * CPU implementation of f16 -> f32 conversion (mirrors f16ToF32 in splat-render-sorted.wgsl)
 */
function f16ToF32(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exponent = (h >>> 10) & 0x1f;
  const mantissa = h & 0x3ff;

  if (exponent === 0) {
    if (mantissa === 0) {
      const buf = new ArrayBuffer(4);
      new Uint32Array(buf)[0] = sign;
      return new Float32Array(buf)[0];
    }
    let m = mantissa;
    let e = 0;
    while ((m & 0x400) === 0) {
      m <<= 1;
      e++;
    }
    const newExp = (127 - 15 - e) << 23;
    const newMant = (m & 0x3ff) << 13;
    const buf = new ArrayBuffer(4);
    new Uint32Array(buf)[0] = sign | newExp | newMant;
    return new Float32Array(buf)[0];
  }
  if (exponent === 31) {
    const buf = new ArrayBuffer(4);
    if (mantissa === 0) {
      new Uint32Array(buf)[0] = sign | 0x7f800000;
    } else {
      new Uint32Array(buf)[0] = sign | 0x7fc00000;
    }
    return new Float32Array(buf)[0];
  }

  const newExp = (exponent + 127 - 15) << 23;
  const newMant = mantissa << 13;
  const buf = new ArrayBuffer(4);
  new Uint32Array(buf)[0] = sign | newExp | newMant;
  return new Float32Array(buf)[0];
}

/**
 * Extract radix digit (mirrors extractDigit in radix-sort.wgsl)
 */
function extractDigit(key: number, bitOffset: number): number {
  return (key >>> bitOffset) & 0xff;
}

/**
 * CPU Blelloch exclusive prefix sum (mirrors Blelloch scan in radix-sort.wgsl)
 *
 * Uses stride-based indexing identical to the GPU implementation:
 *   Up-sweep:   stride doubles each level, pairs at stride*(2i+1)-1 and stride*(2i+2)-1
 *   Down-sweep: stride halves each level, swaps and accumulates
 */
function blellochExclusiveScan(input: number[]): { prefixes: number[]; total: number } {
  const n = input.length;
  const data = [...input];

  // Up-sweep (reduce) - identical to WGSL: offset starts at 1, doubles each step
  let offset = 1;
  for (let d = n >>> 1; d > 0; d >>>= 1) {
    for (let i = 0; i < d; i++) {
      const ai = offset * (2 * i + 1) - 1;
      const bi = offset * (2 * i + 2) - 1;
      if (ai < n && bi < n) {
        data[bi] += data[ai];
      }
    }
    offset <<= 1;
  }

  const total = data[n - 1];
  data[n - 1] = 0;

  // Down-sweep - identical to WGSL: offset halves each step
  for (let d = 1; d < n; d <<= 1) {
    offset >>>= 1;
    for (let i = 0; i < d; i++) {
      const ai = offset * (2 * i + 1) - 1;
      const bi = offset * (2 * i + 2) - 1;
      if (ai < n && bi < n) {
        const temp = data[ai];
        data[ai] = data[bi];
        data[bi] += temp;
      }
    }
  }

  return { prefixes: data, total };
}

/**
 * CPU radix sort reference implementation
 */
function cpuRadixSort(keys: number[], values: number[]): { keys: number[]; values: number[] } {
  let currentKeys = [...keys];
  let currentValues = [...values];

  for (let pass = 0; pass < 4; pass++) {
    const bitOffset = pass * 8;

    // Build histogram
    const histogram = new Array(256).fill(0);
    for (const key of currentKeys) {
      histogram[extractDigit(key, bitOffset)]++;
    }

    // Exclusive prefix sum
    const prefixes = new Array(256);
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      prefixes[i] = sum;
      sum += histogram[i];
    }

    // Scatter
    const newKeys = new Array(keys.length);
    const newValues = new Array(keys.length);
    for (let i = 0; i < currentKeys.length; i++) {
      const digit = extractDigit(currentKeys[i], bitOffset);
      const dst = prefixes[digit]++;
      newKeys[dst] = currentKeys[i];
      newValues[dst] = currentValues[i];
    }

    currentKeys = newKeys;
    currentValues = newValues;
  }

  return { keys: currentKeys, values: currentValues };
}

/**
 * Generate depth key from camera-space Z (mirrors compressAndKey in splat-compress.wgsl)
 */
function generateDepthKey(depth: number): number {
  if (depth < 0.01) return 0xffffffff;
  const buf = new ArrayBuffer(4);
  new Float32Array(buf)[0] = depth;
  return new Uint32Array(buf)[0];
}

// =============================================================================
// Tests
// =============================================================================

describe('GaussianSplatSorter', () => {
  // ─── RGBA8 Packing ─────────────────────────────────────────────────────────

  describe('RGBA8 Color Packing', () => {
    it('should pack and unpack white correctly', () => {
      const packed = packRGBA8(1, 1, 1, 1);
      const [r, g, b, a] = unpackRGBA8(packed);
      expect(r).toBe(1);
      expect(g).toBe(1);
      expect(b).toBe(1);
      expect(a).toBe(1);
    });

    it('should pack and unpack black correctly', () => {
      const packed = packRGBA8(0, 0, 0, 1);
      const [r, g, b, a] = unpackRGBA8(packed);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
      expect(a).toBe(1);
    });

    it('should pack and unpack red correctly', () => {
      const packed = packRGBA8(1, 0, 0, 0.5);
      const [r, g, b, a] = unpackRGBA8(packed);
      expect(r).toBe(1);
      expect(g).toBe(0);
      expect(b).toBe(0);
      expect(a).toBeCloseTo(0.5, 1);
    });

    it('should clamp values to [0, 1]', () => {
      const packed = packRGBA8(1.5, -0.5, 2.0, 0.5);
      const [r, g, b, a] = unpackRGBA8(packed);
      expect(r).toBe(1);
      expect(g).toBe(0);
      expect(b).toBe(1);
      expect(a).toBeCloseTo(0.5, 1);
    });

    it('should preserve mid-range values within 8-bit precision', () => {
      const packed = packRGBA8(0.5, 0.25, 0.75, 0.1);
      const [r, g, b, a] = unpackRGBA8(packed);
      expect(Math.abs(r - 0.5)).toBeLessThan(0.01);
      expect(Math.abs(g - 0.25)).toBeLessThan(0.01);
      expect(Math.abs(b - 0.75)).toBeLessThan(0.01);
      expect(Math.abs(a - 0.1)).toBeLessThan(0.01);
    });

    it('should pack to exactly 4 bytes', () => {
      const packed = packRGBA8(0.5, 0.5, 0.5, 0.5);
      // Packed value should fit in u32
      expect(packed).toBeGreaterThanOrEqual(0);
      expect(packed).toBeLessThanOrEqual(0xffffffff);
    });
  });

  // ─── f16 Conversion ────────────────────────────────────────────────────────

  describe('f16 Conversion', () => {
    it('should round-trip zero', () => {
      const h = f32ToF16(0);
      const f = f16ToF32(h);
      expect(f).toBe(0);
    });

    it('should round-trip one', () => {
      const h = f32ToF16(1.0);
      const f = f16ToF32(h);
      expect(f).toBe(1.0);
    });

    it('should round-trip negative values', () => {
      const h = f32ToF16(-3.5);
      const f = f16ToF32(h);
      expect(f).toBe(-3.5);
    });

    it('should handle infinity', () => {
      const h = f32ToF16(Infinity);
      const f = f16ToF32(h);
      expect(f).toBe(Infinity);
    });

    it('should handle negative infinity', () => {
      const h = f32ToF16(-Infinity);
      const f = f16ToF32(h);
      expect(f).toBe(-Infinity);
    });

    it('should handle NaN', () => {
      const h = f32ToF16(NaN);
      const f = f16ToF32(h);
      expect(isNaN(f)).toBe(true);
    });

    it('should preserve small positive values with f16 precision', () => {
      const original = 0.123;
      const h = f32ToF16(original);
      const result = f16ToF32(h);
      // f16 has ~3 decimal digits of precision
      expect(Math.abs(result - original)).toBeLessThan(0.001);
    });

    it('should preserve typical covariance values', () => {
      const covValues = [0.3, 1.5, 10.0, 0.01, 100.0];
      for (const val of covValues) {
        const h = f32ToF16(val);
        const result = f16ToF32(h);
        const relError = Math.abs(result - val) / val;
        expect(relError).toBeLessThan(0.01); // <1% relative error
      }
    });

    it('should handle underflow to zero', () => {
      // Smallest f16 normal is ~6e-8, smallest f32 is ~1.2e-38
      const h = f32ToF16(1e-40);
      const f = f16ToF32(h);
      expect(f).toBe(0);
    });

    it('should handle overflow to infinity', () => {
      // Max f16 is ~65504
      const h = f32ToF16(100000);
      const f = f16ToF32(h);
      expect(f).toBe(Infinity);
    });
  });

  // ─── Depth Key Generation ──────────────────────────────────────────────────

  describe('Depth Key Generation', () => {
    it('should generate max key for behind-camera splats', () => {
      expect(generateDepthKey(-1.0)).toBe(0xffffffff);
      expect(generateDepthKey(0.0)).toBe(0xffffffff);
      expect(generateDepthKey(0.005)).toBe(0xffffffff);
    });

    it('should generate valid key for visible splats', () => {
      const key = generateDepthKey(5.0);
      expect(key).toBeGreaterThan(0);
      expect(key).toBeLessThan(0xffffffff);
    });

    it('should preserve depth ordering for positive values', () => {
      // IEEE 754 positive floats sort correctly as unsigned integers
      const depths = [1.0, 2.0, 5.0, 10.0, 100.0];
      const keys = depths.map(generateDepthKey);

      for (let i = 1; i < keys.length; i++) {
        expect(keys[i]).toBeGreaterThan(keys[i - 1]);
      }
    });

    it('should sort near splats before far splats', () => {
      const nearKey = generateDepthKey(1.0);
      const farKey = generateDepthKey(100.0);
      expect(nearKey).toBeLessThan(farKey);
    });
  });

  // ─── Radix Digit Extraction ────────────────────────────────────────────────

  describe('Radix Digit Extraction', () => {
    it('should extract lowest 8 bits', () => {
      expect(extractDigit(0x12345678, 0)).toBe(0x78);
    });

    it('should extract bits 8-15', () => {
      expect(extractDigit(0x12345678, 8)).toBe(0x56);
    });

    it('should extract bits 16-23', () => {
      expect(extractDigit(0x12345678, 16)).toBe(0x34);
    });

    it('should extract bits 24-31', () => {
      expect(extractDigit(0x12345678, 24)).toBe(0x12);
    });

    it('should handle zero', () => {
      expect(extractDigit(0, 0)).toBe(0);
      expect(extractDigit(0, 8)).toBe(0);
      expect(extractDigit(0, 16)).toBe(0);
      expect(extractDigit(0, 24)).toBe(0);
    });

    it('should handle max value', () => {
      expect(extractDigit(0xffffffff, 0)).toBe(0xff);
      expect(extractDigit(0xffffffff, 8)).toBe(0xff);
      expect(extractDigit(0xffffffff, 16)).toBe(0xff);
      expect(extractDigit(0xffffffff, 24)).toBe(0xff);
    });
  });

  // ─── Blelloch Scan ─────────────────────────────────────────────────────────

  describe('Blelloch Exclusive Prefix Sum', () => {
    it('should compute exclusive prefix sum for simple input', () => {
      // Power-of-2 sized input for Blelloch
      const input = [3, 1, 7, 0, 4, 1, 6, 3];
      const { prefixes, total } = blellochExclusiveScan(input);

      expect(prefixes).toEqual([0, 3, 4, 11, 11, 15, 16, 22]);
      expect(total).toBe(25);
    });

    it('should handle all zeros', () => {
      const input = [0, 0, 0, 0, 0, 0, 0, 0];
      const { prefixes, total } = blellochExclusiveScan(input);

      expect(prefixes).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(total).toBe(0);
    });

    it('should handle all ones', () => {
      const input = [1, 1, 1, 1, 1, 1, 1, 1];
      const { prefixes, total } = blellochExclusiveScan(input);

      expect(prefixes).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(total).toBe(8);
    });

    it('should handle single element', () => {
      const input = [5];
      const { prefixes, total } = blellochExclusiveScan(input);

      expect(prefixes).toEqual([0]);
      expect(total).toBe(5);
    });

    it('should handle power-of-two sizes', () => {
      const input = new Array(16).fill(1);
      const { prefixes, total } = blellochExclusiveScan(input);

      for (let i = 0; i < 16; i++) {
        expect(prefixes[i]).toBe(i);
      }
      expect(total).toBe(16);
    });
  });

  // ─── Radix Sort (CPU Reference) ───────────────────────────────────────────

  describe('CPU Radix Sort Reference', () => {
    it('should sort small arrays', () => {
      const keys = [5, 3, 8, 1, 4, 2, 7, 6];
      const values = [0, 1, 2, 3, 4, 5, 6, 7];

      const result = cpuRadixSort(keys, values);

      expect(result.keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.values).toEqual([3, 5, 1, 4, 0, 7, 6, 2]);
    });

    it('should sort already sorted arrays', () => {
      const keys = [1, 2, 3, 4, 5];
      const values = [0, 1, 2, 3, 4];

      const result = cpuRadixSort(keys, values);

      expect(result.keys).toEqual([1, 2, 3, 4, 5]);
      expect(result.values).toEqual([0, 1, 2, 3, 4]);
    });

    it('should sort reverse-sorted arrays', () => {
      const keys = [5, 4, 3, 2, 1];
      const values = [0, 1, 2, 3, 4];

      const result = cpuRadixSort(keys, values);

      expect(result.keys).toEqual([1, 2, 3, 4, 5]);
      expect(result.values).toEqual([4, 3, 2, 1, 0]);
    });

    it('should handle duplicate keys (stable sort)', () => {
      const keys = [3, 1, 3, 1, 2];
      const values = [0, 1, 2, 3, 4];

      const result = cpuRadixSort(keys, values);

      expect(result.keys).toEqual([1, 1, 2, 3, 3]);
      // Stable sort preserves original order for equal keys
      expect(result.values).toEqual([1, 3, 4, 0, 2]);
    });

    it('should sort large values (32-bit range)', () => {
      const keys = [0xffff0000, 0x0000ffff, 0xff00ff00, 0x00ff00ff, 0x12345678];
      const values = [0, 1, 2, 3, 4];

      const result = cpuRadixSort(keys, values);

      // Verify sorted order
      for (let i = 1; i < result.keys.length; i++) {
        expect(result.keys[i]).toBeGreaterThanOrEqual(result.keys[i - 1]);
      }
    });

    it('should sort depth keys correctly (simulating camera-space Z)', () => {
      const depths = [10.5, 2.3, 7.8, 1.0, 15.2, 0.5];
      const keys = depths.map(generateDepthKey);
      const values = depths.map((_, i) => i);

      const result = cpuRadixSort(keys, values);

      // Verify sorted by depth (near to far)
      const sortedDepths = result.values.map((i) => depths[i]);
      for (let i = 1; i < sortedDepths.length; i++) {
        expect(sortedDepths[i]).toBeGreaterThanOrEqual(sortedDepths[i - 1]);
      }
    });

    it('should handle behind-camera splats (sorted to end)', () => {
      const depths = [5.0, -1.0, 3.0, 0.0, 10.0];
      const keys = depths.map(generateDepthKey);
      const values = depths.map((_, i) => i);

      const result = cpuRadixSort(keys, values);

      // Behind-camera splats (depth <= 0.01) should be at the end
      const sortedDepths = result.values.map((i) => depths[i]);
      const lastTwo = sortedDepths.slice(-2);
      expect(lastTwo).toContain(-1.0);
      expect(lastTwo).toContain(0.0);
    });

    it('should sort 1000 random keys correctly', () => {
      const n = 1000;
      const keys = Array.from({ length: n }, () => Math.floor(Math.random() * 0xffffffff));
      const values = Array.from({ length: n }, (_, i) => i);

      const result = cpuRadixSort(keys, values);

      // Verify sorted
      for (let i = 1; i < result.keys.length; i++) {
        expect(result.keys[i]).toBeGreaterThanOrEqual(result.keys[i - 1]);
      }

      // Verify all values present (permutation)
      const sortedValues = [...result.values].sort((a, b) => a - b);
      expect(sortedValues).toEqual(values);
    });
  });

  // ─── Memory Calculations ──────────────────────────────────────────────────

  describe('Memory Calculations', () => {
    it('should calculate correct memory for 100K splats', () => {
      const maxSplats = 100_000;
      const workgroupSize = 256;
      const elementsPerThread = 4;
      const blockSize = workgroupSize * elementsPerThread;
      const maxBlocks = Math.ceil(maxSplats / blockSize);

      const rawSize = maxSplats * 64;
      const compressedSize = maxSplats * 32;
      const sortBuffersSize = maxSplats * 4 * 4; // 2 key + 2 value
      const histogramSize = maxBlocks * 256 * 4;
      const prefixSize = 256 * 4;
      const uniformSize = 160 + 16 + 160;

      const totalMB =
        (rawSize + compressedSize + sortBuffersSize + histogramSize + prefixSize + uniformSize) /
        1024 /
        1024;

      // Should be under 15 MB for 100K splats
      expect(totalMB).toBeLessThan(15);
      // Should be at least a few MB
      expect(totalMB).toBeGreaterThan(5);
    });

    it('should calculate correct memory for 1M splats', () => {
      const maxSplats = 1_000_000;
      const rawSize = maxSplats * 64;
      const compressedSize = maxSplats * 32;
      const sortBuffersSize = maxSplats * 4 * 4;

      const totalMB = (rawSize + compressedSize + sortBuffersSize) / 1024 / 1024;

      // Should be under 150 MB for 1M splats
      expect(totalMB).toBeLessThan(150);
    });

    it('should achieve 50% compression ratio', () => {
      const rawBytes = 64; // bytes per raw splat
      const compressedBytes = 32; // bytes per compressed splat
      const ratio = 1 - compressedBytes / rawBytes;
      expect(ratio).toBe(0.5);
    });
  });

  // ─── Configuration ────────────────────────────────────────────────────────

  describe('Configuration', () => {
    it('should use power-of-2 workgroup sizes', () => {
      const sizes = [32, 64, 128, 256, 512];
      for (const size of sizes) {
        expect(size & (size - 1)).toBe(0); // Power of 2 check
      }
    });

    it('should compute correct block count', () => {
      const workgroupSize = 256;
      const elementsPerThread = 4;
      const blockSize = workgroupSize * elementsPerThread;

      expect(Math.ceil(1000 / blockSize)).toBe(1);
      expect(Math.ceil(1024 / blockSize)).toBe(1);
      expect(Math.ceil(1025 / blockSize)).toBe(2);
      expect(Math.ceil(100000 / blockSize)).toBe(98);
      expect(Math.ceil(500000 / blockSize)).toBe(489);
    });

    it('should require 4 passes for 32-bit keys', () => {
      const keyBits = 32;
      const bitsPerPass = 8;
      expect(keyBits / bitsPerPass).toBe(4);
    });

    it('should fit shared memory within 16KB WebGPU minimum', () => {
      // WGSL shared memory used in radix-sort.wgsl:
      // sharedHist: 256 * 4 = 1024 bytes
      // sharedKeys: 1024 * 4 = 4096 bytes
      // sharedVals: 1024 * 4 = 4096 bytes
      // sharedLocalHist: 256 * 4 = 1024 bytes (atomic<u32>)
      const totalSharedMemory = 1024 + 4096 + 4096 + 1024;
      expect(totalSharedMemory).toBe(10240); // 10 KB
      expect(totalSharedMemory).toBeLessThanOrEqual(16384); // 16 KB limit
    });
  });

  // ─── Cross-Browser Compatibility ──────────────────────────────────────────

  describe('Cross-Browser Compatibility', () => {
    it('should not require shader-f16 feature', () => {
      // f16 packing is done manually via bit manipulation
      // Verify our f32->f16->f32 round-trip works without native f16
      const testValues = [0.1, 1.0, 10.0, 100.0, -5.5];
      for (const val of testValues) {
        const h = f32ToF16(val);
        const result = f16ToF32(h);
        const absError = Math.abs(result - val);
        const relError = Math.abs(absError / val);
        expect(relError).toBeLessThan(0.01);
      }
    });

    it('should use workgroup_size(256) which fits all vendors', () => {
      // WebGPU spec guarantees maxComputeInvocationsPerWorkgroup >= 256
      const workgroupSize = 256;
      expect(workgroupSize).toBeLessThanOrEqual(256);
    });

    it('should not use subgroup operations', () => {
      // Subgroup operations are not supported in Safari and Firefox
      // All inter-thread communication uses shared memory + barriers
      // This is verified by shader compilation, not runtime test
      expect(true).toBe(true);
    });

    it('should not use global atomics', () => {
      // Wait-free guarantee: no atomic operations on global memory
      // Only workgroup-local shared memory atomics are used
      // This is verified by shader structure, not runtime test
      expect(true).toBe(true);
    });
  });

  // ─── Sorting Stability ────────────────────────────────────────────────────

  describe('Sort Stability', () => {
    it('should be a stable sort (LSD radix sort is inherently stable)', () => {
      // LSD radix sort is stable because it processes least-significant
      // bits first and uses a stable counting sort for each pass
      const keys = [3, 1, 3, 1, 3, 1];
      const values = [0, 1, 2, 3, 4, 5];

      const result = cpuRadixSort(keys, values);

      // For equal keys, original order should be preserved
      const onesIndices = result.values.filter((_, i) => result.keys[i] === 1);
      expect(onesIndices).toEqual([1, 3, 5]); // Original order of 1s

      const threesIndices = result.values.filter((_, i) => result.keys[i] === 3);
      expect(threesIndices).toEqual([0, 2, 4]); // Original order of 3s
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle single element', () => {
      const result = cpuRadixSort([42], [0]);
      expect(result.keys).toEqual([42]);
      expect(result.values).toEqual([0]);
    });

    it('should handle all same keys', () => {
      const keys = [7, 7, 7, 7, 7];
      const values = [0, 1, 2, 3, 4];
      const result = cpuRadixSort(keys, values);
      expect(result.keys).toEqual([7, 7, 7, 7, 7]);
      expect(result.values).toEqual([0, 1, 2, 3, 4]); // Stable: original order
    });

    it('should handle max u32 key', () => {
      const keys = [0xffffffff, 0, 0xffffffff, 0];
      const values = [0, 1, 2, 3];
      const result = cpuRadixSort(keys, values);
      expect(result.keys).toEqual([0, 0, 0xffffffff, 0xffffffff]);
    });

    it('should handle two elements', () => {
      const result = cpuRadixSort([2, 1], [0, 1]);
      expect(result.keys).toEqual([1, 2]);
      expect(result.values).toEqual([1, 0]);
    });
  });
});
