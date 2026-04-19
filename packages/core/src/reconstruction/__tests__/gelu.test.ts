import { describe, expect, it } from 'vitest';
import { createGeluKernel } from '../geluKernel';
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

function geluCpuScalar(x: number): number {
  const k0 = 0.7978845608; // sqrt(2/pi)
  const k1 = 0.044715;
  return 0.5 * x * (1 + Math.tanh(k0 * (x + k1 * x * x * x)));
}

function geluCpu(input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = geluCpuScalar(input[i]);
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

describe('GELU CPU saturation sanity', () => {
  it('matches expected saturation behavior', () => {
    expect(Math.abs(geluCpuScalar(0))).toBeLessThan(1e-4);
    expect(Math.abs(geluCpuScalar(100) - 100)).toBeLessThan(1e-4);
    expect(Math.abs(geluCpuScalar(-100))).toBeLessThan(1e-4);
  });
});

const describeWebGpu = isWebGpuEnvironmentPresent() ? describe : describe.skip;

describeWebGpu('GELU kernel', () => {
  async function runCase(input: Float32Array): Promise<void> {
    const device = await requestDeviceOrNull();
    if (!device) return;

    const kernel = createGeluKernel(device);
    const gpuOut = await kernel.run(input);
    const cpuOut = geluCpu(input);

    const diff = maxAbsDiff(gpuOut, cpuOut);
    expect(diff).toBeLessThan(1e-5);
  }

  it('matches CPU reference for random 1024-vector', async () => {
    const rng = mulberry32(801);
    await runCase(randomArray(1024, rng, -3, 3));
  });

  it('matches CPU reference for shape (16, 64)', async () => {
    const rng = mulberry32(802);
    await runCase(randomArray(16 * 64, rng, -3, 3));
  });

  it('matches CPU reference for shape (1, 1024)', async () => {
    const rng = mulberry32(803);
    await runCase(randomArray(1 * 1024, rng, -3, 3));
  });

  it('matches CPU reference for shape (4, 4, 64) flattened', async () => {
    const rng = mulberry32(804);
    await runCase(randomArray(4 * 4 * 64, rng, -3, 3));
  });
});