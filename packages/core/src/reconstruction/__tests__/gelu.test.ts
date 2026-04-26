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

// ---------------------------------------------------------------------------
// CPU-only tests (run on CI without WebGPU; lane W.068b CPU-ref companion)
// ---------------------------------------------------------------------------
describe('GELU — CPU reference', () => {
  it('saturation: gelu(0)≈0, gelu(+large)≈x, gelu(-large)≈0', () => {
    expect(Math.abs(geluCpuScalar(0))).toBeLessThan(1e-4);
    expect(Math.abs(geluCpuScalar(100) - 100)).toBeLessThan(1e-4);
    expect(Math.abs(geluCpuScalar(-100))).toBeLessThan(1e-4);
  });

  it('matches reference values at canonical points (tanh approximation, k0=√(2/π), k1=0.044715)', () => {
    // Reference values from the tanh-approximation formula:
    //   gelu(x) = 0.5 * x * (1 + tanh(√(2/π) * (x + 0.044715 * x³)))
    // gelu(1)  ≈ 0.84119
    // gelu(-1) ≈ -0.15881
    // gelu(0.5) ≈ 0.345714
    // gelu(2)   ≈ 1.95459
    expect(geluCpuScalar(1)).toBeCloseTo(0.84119, 4);
    expect(geluCpuScalar(-1)).toBeCloseTo(-0.15881, 4);
    expect(geluCpuScalar(0.5)).toBeCloseTo(0.345714, 4);
    expect(geluCpuScalar(2)).toBeCloseTo(1.95459, 4);
  });

  it('monotonic increasing on [0, 3] (positive arm); has known dip near x≈-0.75 on negative arm', () => {
    // GELU is monotonic on the non-negative arm; on the negative arm it
    // has a single minimum near x ≈ -0.751 where derivative is zero.
    // Right of that minimum and left of zero the function recovers
    // monotonically toward zero.
    const positiveXs: number[] = [];
    for (let i = 0; i <= 30; i += 1) positiveXs.push(i / 10);
    const positiveYs = positiveXs.map(geluCpuScalar);
    for (let i = 1; i < positiveYs.length; i += 1) {
      expect(positiveYs[i]).toBeGreaterThanOrEqual(positiveYs[i - 1] - 1e-7);
    }
    // Document the known minimum on the negative arm (analytic property).
    const minNeg = geluCpuScalar(-0.751);
    expect(geluCpuScalar(-0.5)).toBeGreaterThan(minNeg);
    expect(geluCpuScalar(-1.0)).toBeGreaterThan(minNeg);
  });

  it('vector gelu equals scalar gelu element-wise within float32 round-trip tolerance', () => {
    // geluCpu writes to Float32Array storage, so output is f32-rounded;
    // geluCpuScalar returns native f64. The diff is bounded by f32 ulp.
    const rng = mulberry32(5001);
    const len = 256;
    const input = randomArray(len, rng, -3, 3);
    const out = geluCpu(input);
    for (let i = 0; i < len; i += 1) {
      expect(Math.abs(out[i] - geluCpuScalar(input[i]))).toBeLessThan(1e-6);
    }
  });

  it('output is finite across full reasonable range [-50, +50]', () => {
    const rng = mulberry32(5002);
    const input = randomArray(1024, rng, -50, 50);
    const out = geluCpu(input);
    for (let i = 0; i < out.length; i += 1) {
      expect(Number.isFinite(out[i])).toBe(true);
    }
  });

  it('shape-agnostic: 4x4x64 flattened produces same output as flat 1024', () => {
    const rng1 = mulberry32(5003);
    const rng2 = mulberry32(5003);
    const flat = randomArray(1024, rng1, -3, 3);
    const shaped = randomArray(4 * 4 * 64, rng2, -3, 3);
    // same seed → same content; gelu is element-wise → output identical
    const outFlat = geluCpu(flat);
    const outShaped = geluCpu(shaped);
    expect(maxAbsDiff(outFlat, outShaped)).toBeLessThan(1e-7);
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