import { describe, expect, it } from 'vitest';
import { createLayerNormKernel } from '../layerNormKernel';
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

function layerNormCpu(
  input: Float32Array,
  gamma: Float32Array,
  beta: Float32Array,
  rows: number,
  dModel: number,
  eps = 1e-5,
): Float32Array {
  const out = new Float32Array(input.length);

  for (let r = 0; r < rows; r += 1) {
    const rowStart = r * dModel;

    let sum = 0;
    for (let c = 0; c < dModel; c += 1) {
      sum += input[rowStart + c];
    }
    const mean = sum / dModel;

    let sq = 0;
    for (let c = 0; c < dModel; c += 1) {
      const d = input[rowStart + c] - mean;
      sq += d * d;
    }
    const variance = sq / dModel;
    const invStd = 1 / Math.sqrt(variance + eps);

    for (let c = 0; c < dModel; c += 1) {
      const idx = rowStart + c;
      const normalized = (input[idx] - mean) * invStd;
      out[idx] = normalized * gamma[c] + beta[c];
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

async function requestDeviceOrNull(): Promise<GPUDevice | null> {
  const nav = globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined;
  if (!nav?.gpu?.requestAdapter) return null;
  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) return null;
  return adapter.requestDevice();
}

const describeWebGpu = isWebGpuEnvironmentPresent() ? describe : describe.skip;

describeWebGpu('LayerNorm kernel', () => {
  async function runCase(rows: number, dModel: number, seed: number): Promise<void> {
    const device = await requestDeviceOrNull();
    if (!device) {
      return;
    }

    const rng = mulberry32(seed);
    const input = randomArray(rows * dModel, rng, -1, 1);
    const gamma = randomArray(dModel, rng, 0.5, 1.5);
    const beta = randomArray(dModel, rng, -0.25, 0.25);

    const kernel = createLayerNormKernel(device);
    const gpuOut = await kernel.run(input, gamma, beta);
    const cpuOut = layerNormCpu(input, gamma, beta, rows, dModel);

    const diff = maxAbsDiff(gpuOut, cpuOut);
    expect(diff).toBeLessThan(1e-5);
  }

  it('matches CPU reference for random 4x8', async () => {
    await runCase(4, 8, 101);
  });

  it('matches CPU reference for random 16x64', async () => {
    await runCase(16, 64, 202);
  });

  it('matches CPU reference for edge case 1x128', async () => {
    await runCase(1, 128, 303);
  });
});