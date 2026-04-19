import { describe, expect, it } from 'vitest';
import { createGemmKernel } from '../gemmKernel';
import { isWebGpuEnvironmentPresent } from '../webgpuGate';

// ---------------------------------------------------------------------------
// CPU reference
// ---------------------------------------------------------------------------
function gemmCpu(A: Float32Array, B: Float32Array, M: number, N: number, K: number): Float32Array {
  const C = new Float32Array(M * N);
  for (let m = 0; m < M; m++) {
    for (let n = 0; n < N; n++) {
      let sum = 0;
      for (let k = 0; k < K; k++) sum += A[m * K + k] * B[k * N + n];
      C[m * N + n] = sum;
    }
  }
  return C;
}

function allClose(a: Float32Array, b: Float32Array, atol = 1e-4): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > atol) return false;
  }
  return true;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// CPU-only tests
// ---------------------------------------------------------------------------
describe('GEMM — CPU reference', () => {
  it('1x1 @ 1x1 = trivial product', () => {
    const A = new Float32Array([3]);
    const B = new Float32Array([4]);
    const C = gemmCpu(A, B, 1, 1, 1);
    expect(C[0]).toBeCloseTo(12);
  });

  it('2x3 @ 3x2 = identity-ish', () => {
    const A = new Float32Array([1,0,0, 0,1,0]);
    const B = new Float32Array([1,2, 3,4, 5,6]);
    const C = gemmCpu(A, B, 2, 2, 3);
    expect(C[0]).toBeCloseTo(1);
    expect(C[1]).toBeCloseTo(2);
    expect(C[2]).toBeCloseTo(3);
    expect(C[3]).toBeCloseTo(4);
  });

  it('random 4x4 @ 4x4 matches naive product', () => {
    const rng = mulberry32(42);
    const M = 4, N = 4, K = 4;
    const A = new Float32Array(M * K).map(() => rng() * 2 - 1);
    const B = new Float32Array(K * N).map(() => rng() * 2 - 1);
    const C = gemmCpu(A, B, M, N, K);
    // Re-verify with direct indexing
    for (let m = 0; m < M; m++) {
      for (let n = 0; n < N; n++) {
        let s = 0;
        for (let k = 0; k < K; k++) s += A[m * K + k] * B[k * N + n];
        expect(C[m * N + n]).toBeCloseTo(s, 4);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// WebGPU tests
// ---------------------------------------------------------------------------
describe('GEMM — WebGPU', () => {
  it('8x8 @ 8x8 matches CPU (tile-aligned)', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping GEMM GPU test');
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const rng = mulberry32(11);
    const M = 8, N = 8, K = 8;
    const A = new Float32Array(M * K).map(() => rng() * 2 - 1);
    const B = new Float32Array(K * N).map(() => rng() * 2 - 1);

    const cpu = gemmCpu(A, B, M, N, K);
    const kernel = createGemmKernel(device);
    const gpu = await kernel.run(A, B, M, N, K);

    expect(allClose(gpu, cpu)).toBe(true);
    device.destroy();
  });

  it('non-tile-aligned dims (M=5, N=7, K=6)', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const rng = mulberry32(99);
    const M = 5, N = 7, K = 6;
    const A = new Float32Array(M * K).map(() => rng() * 2 - 1);
    const B = new Float32Array(K * N).map(() => rng() * 2 - 1);

    const cpu = gemmCpu(A, B, M, N, K);
    const kernel = createGemmKernel(device);
    const gpu = await kernel.run(A, B, M, N, K);

    expect(allClose(gpu, cpu, 1e-3)).toBe(true);
    device.destroy();
  });

  it('larger random (M=16, N=32, K=24)', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const rng = mulberry32(55);
    const M = 16, N = 32, K = 24;
    const A = new Float32Array(M * K).map(() => rng() - 0.5);
    const B = new Float32Array(K * N).map(() => rng() - 0.5);

    const cpu = gemmCpu(A, B, M, N, K);
    const kernel = createGemmKernel(device);
    const gpu = await kernel.run(A, B, M, N, K);

    expect(allClose(gpu, cpu, 1e-3)).toBe(true);
    device.destroy();
  });

  it('throws on size mismatch', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const kernel = createGemmKernel(device);
    await expect(
      kernel.run(new Float32Array(6), new Float32Array(6), 3, 3, 2),
    ).rejects.toThrow('GEMM');
    device.destroy();
  });
});
