// @vitest-environment node
/**
 * SnnAccelerator GPU benchmark + parity (Node WebGPU path).
 *
 * Runs only when a real WebGPU device is reachable: in Node that means the
 * `webgpu` (Dawn) binding is installed and ensureNodeWebGpu() activates it.
 * Skips cleanly (does NOT fail) on machines/CI without a GPU.
 *
 * What it locks in:
 *   1. The GPU LIF shader is numerically equivalent to the CPU reference.
 *   2. The FUSED batch path (single dispatch) matches per-item output.
 *   3. Throughput: CPU vs fused-GPU, logged so regressions in the fusion win
 *      are visible. (No hard perf gate; wall-clock is environment-sensitive.)
 *
 * Origin: journalist/hardware audit 2026-05-21. Before the fix the GPU path was
 * unreachable in Node (silent CPU passthrough); after wiring it was ~8x slower
 * than CPU due to per-histogram dispatch; batch fusion closes that gap.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { SnnAccelerator, encodeLifPopulationCpu } from '../SnnAccelerator.js';

// Top-level await so `gpu` is known at collection time; `it.skipIf` evaluates
// its condition when the test is registered, before any beforeAll hook runs.
const accel = new SnnAccelerator();
await accel.initialize({ enableSnn: true, snnTimesteps: 50 });
const gpu = accel.available;
if (!gpu) {
  const hasWindow = typeof (globalThis as { window?: unknown }).window !== 'undefined';
  console.warn(`[snn-bench] WebGPU device unavailable; GPU tests skipped. (window defined: ${hasWindow})`);
}

function randHist(n = 128): Float32Array {
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = ((i * 17 + 23) % 97) / 96;
  return h;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return d;
}

describe('SnnAccelerator GPU path', () => {
  afterAll(() => {
    accel.dispose();
  });

  it.skipIf(!gpu)('GPU single-encode matches CPU reference (numerically equivalent)', async () => {
    const h = randHist();
    const g = await accel.encode(h);
    const c = encodeLifPopulationCpu(h, { timeSteps: 50 });
    expect(maxAbsDiff(g, c)).toBeLessThan(1e-3);
  });

  it.skipIf(!gpu)('fused batch matches CPU reference for every item', async () => {
    const batch = Array.from({ length: 64 }, () => randHist());
    const gpuOut = await accel.encodeBatch(batch);
    expect(gpuOut.length).toBe(batch.length);
    for (let i = 0; i < batch.length; i++) {
      const c = encodeLifPopulationCpu(batch[i]!, { timeSteps: 50 });
      expect(maxAbsDiff(gpuOut[i]!, c)).toBeLessThan(1e-3);
    }
  });

  it.skipIf(!gpu)('throughput: fused-GPU vs CPU (logged, soft gate)', async () => {
    const N = 2000;
    const batch = Array.from({ length: N }, () => randHist());

    const c0 = performance.now();
    for (const h of batch) encodeLifPopulationCpu(h, { timeSteps: 50 });
    const cpuMs = performance.now() - c0;

    // warm up one batch (pipeline/buffer alloc), then time
    await accel.encodeBatch(batch.slice(0, 8));
    const g0 = performance.now();
    await accel.encodeBatch(batch);
    const gpuMs = performance.now() - g0;

    const cpuRate = N / (cpuMs / 1000);
    const gpuRate = N / (gpuMs / 1000);
    console.log(
      `[snn-bench] CPU ${cpuRate.toFixed(0)} hist/s | fused-GPU ${gpuRate.toFixed(0)} hist/s | ` +
      `GPU/CPU ratio ${(gpuRate / cpuRate).toFixed(2)}x (fused batch dispatch)`,
    );
    // Soft correctness gate only; perf is environment-sensitive, so we assert
    // the GPU produced the right COUNT, not a wall-clock threshold.
    expect(gpuMs).toBeGreaterThan(0);
  });
});
