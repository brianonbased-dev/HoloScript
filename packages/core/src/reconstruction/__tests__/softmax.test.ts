import { describe, expect, it } from 'vitest';
import { createSoftmaxKernel } from '../softmaxKernel';
import { isWebGpuEnvironmentPresent } from '../webgpuGate';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomArray(len: number, rng: () => number, min: number, max: number): Float32Array {
  const out = new Float32Array(len);
  const span = max - min;
  for (let i = 0; i < len; i += 1) {
    out[i] = min + rng() * span;
  }
  return out;
}

function softmaxCpu(input: Float32Array, rows: number, cols: number): Float32Array {
  const out = new Float32Array(input.length);
  for (let r = 0; r < rows; r += 1) {
    const rowStart = r * cols;

    let rowMax = -Number.MAX_VALUE;
    for (let c = 0; c < cols; c += 1) {
      rowMax = Math.max(rowMax, input[rowStart + c]);
    }

    let sum = 0;
    for (let c = 0; c < cols; c += 1) {
      const ex = Math.exp(input[rowStart + c] - rowMax);
      out[rowStart + c] = ex;
      sum += ex;
    }

    const denom = Math.max(sum, 1e-30);
    for (let c = 0; c < cols; c += 1) {
      out[rowStart + c] /= denom;
    }
  }
  return out;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Length mismatch: ${a.length} vs ${b.length}`);
  }
  let m = 0;
  for (let i = 0; i < a.length; i += 1) {
    m = Math.max(m, Math.abs(a[i] - b[i]));
  }
  return m;
}

function assertFiniteArray(x: Float32Array): void {
  for (let i = 0; i < x.length; i += 1) {
    if (!Number.isFinite(x[i])) {
      throw new Error(`Non-finite value at index ${i}: ${x[i]}`);
    }
  }
}

async function requestDeviceOrNull(): Promise<GPUDevice | null> {
  const nav = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
  if (!nav?.gpu?.requestAdapter) return null;
  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) return null;
  return adapter.requestDevice();
}

const describeWebGpu = isWebGpuEnvironmentPresent() ? describe : describe.skip;

describeWebGpu('Softmax kernel', () => {
  async function runCase(rows: number, cols: number, seed: number, min: number, max: number): Promise<void> {
    const device = await requestDeviceOrNull();
    if (!device) {
      return;
    }

    const rng = mulberry32(seed);
    const input = randomArray(rows * cols, rng, min, max);

    const kernel = createSoftmaxKernel(device);
    const gpuOut = await kernel.run(input, rows, cols);
    const cpuOut = softmaxCpu(input, rows, cols);

    assertFiniteArray(gpuOut);
    assertFiniteArray(cpuOut);

    const diff = maxAbsDiff(gpuOut, cpuOut);
    expect(diff).toBeLessThan(1e-6);
  }

  it('matches CPU reference for random 4x32', async () => {
    await runCase(4, 32, 701, -1, 1);
  });

  it('matches CPU reference for random 16x128', async () => {
    await runCase(16, 128, 702, -1, 1);
  });

  it('handles extreme values in [-50, +50] without NaN/Inf', async () => {
    await runCase(8, 64, 703, -50, 50);
  });

  it('produces all-1s when cols=1', async () => {
    const rows = 9;
    const cols = 1;
    const device = await requestDeviceOrNull();
    if (!device) {
      return;
    }
    const rng = mulberry32(704);
    const input = randomArray(rows * cols, rng, -50, 50);
    const kernel = createSoftmaxKernel(device);
    const gpuOut = await kernel.run(input, rows, cols);
    assertFiniteArray(gpuOut);
    for (let i = 0; i < gpuOut.length; i += 1) {
      expect(Math.abs(gpuOut[i] - 1)).toBeLessThan(1e-6);
    }
  });
});