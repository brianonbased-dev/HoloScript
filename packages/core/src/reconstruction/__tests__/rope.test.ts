import { describe, expect, it } from 'vitest';
import { createRopeKernel } from '../ropeKernel';
import { isWebGpuEnvironmentPresent } from '../webgpuGate';

// ---------------------------------------------------------------------------
// CPU reference implementation
// ---------------------------------------------------------------------------

function ropeCpu(
  input: Float32Array,
  seqLen: number,
  numHeads: number,
  headDim: number,
  base = 10000,
  posOffset = 0,
): Float32Array {
  const out = new Float32Array(input);
  const pairs = headDim / 2;

  for (let t = 0; t < seqLen; t++) {
    const pos = t + posOffset;
    for (let h = 0; h < numHeads; h++) {
      for (let d = 0; d < pairs; d++) {
        const theta = pos * Math.pow(base, (-2 * d) / headDim);
        const c = Math.cos(theta);
        const s = Math.sin(theta);

        const i0 = t * numHeads * headDim + h * headDim + 2 * d;
        const i1 = i0 + 1;

        const x0 = input[i0];
        const x1 = input[i1];

        out[i0] = x0 * c - x1 * s;
        out[i1] = x0 * s + x1 * c;
      }
    }
  }
  return out;
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

function randomArray(len: number, rng: () => number, min: number, max: number): Float32Array {
  const out = new Float32Array(len);
  const span = max - min;
  for (let i = 0; i < len; i++) {
    out[i] = min + rng() * span;
  }
  return out;
}

function allClose(a: Float32Array, b: Float32Array, atol = 1e-4): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > atol) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('RoPE kernel — CPU reference', () => {
  it('identity at position 0: cos(0)=1, sin(0)=0', () => {
    const input = new Float32Array([1, 2, 3, 4]);
    const out = ropeCpu(input, 1, 1, 4, 10000, 0);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it('matches manual calculation for 2-token, 1-head, headDim=4', () => {
    const seqLen = 2, numHeads = 1, headDim = 4, base = 10000;
    const input = new Float32Array([1, 0, 0, 1,   0, 1, 1, 0]);
    const out = ropeCpu(input, seqLen, numHeads, headDim, base, 0);

    for (let t = 0; t < seqLen; t++) {
      for (let d = 0; d < headDim / 2; d++) {
        const theta = t * Math.pow(base, -2 * d / headDim);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const i0 = t * headDim + 2 * d;
        expect(out[i0]).toBeCloseTo(input[i0] * c - input[i0 + 1] * s, 5);
        expect(out[i0 + 1]).toBeCloseTo(input[i0] * s + input[i0 + 1] * c, 5);
      }
    }
  });

  it('posOffset shifts positions correctly', () => {
    const seqLen = 3, numHeads = 1, headDim = 4;
    const rng = mulberry32(7);
    const input = randomArray(seqLen * numHeads * headDim, rng, -1, 1);

    const outNoOffset   = ropeCpu(input, seqLen, numHeads, headDim, 10000, 0);
    const outWithOffset = ropeCpu(input, seqLen, numHeads, headDim, 10000, 10);
    expect(Array.from(outNoOffset)).not.toEqual(Array.from(outWithOffset));

    const inputToken0 = input.slice(0, numHeads * headDim);
    const ropeToken0atPos10 = ropeCpu(
      new Float32Array(inputToken0),
      1, numHeads, headDim, 10000, 10,
    );
    const fromFull = outWithOffset.slice(0, numHeads * headDim);
    expect(allClose(ropeToken0atPos10, new Float32Array(fromFull), 1e-6)).toBe(true);
  });

  it('multihead: each head gets same rotation at same position', () => {
    const seqLen = 1, numHeads = 3, headDim = 4;
    const rng = mulberry32(13);
    const data = randomArray(seqLen * numHeads * headDim, rng, -1, 1);
    // Set all heads to same values
    for (let h = 1; h < numHeads; h++) {
      for (let d = 0; d < headDim; d++) {
        data[h * headDim + d] = data[d]; // copy head 0 into head h
      }
    }
    const out = ropeCpu(data, seqLen, numHeads, headDim, 10000, 0);
    // All heads at pos=0: cos(0)=1, sin(0)=0 → no rotation
    for (let h = 0; h < numHeads; h++) {
      for (let d = 0; d < headDim; d++) {
        expect(out[h * headDim + d]).toBeCloseTo(data[h * headDim + d], 5);
      }
    }
  });
});

describe('RoPE kernel — WebGPU', () => {
  it('matches CPU reference (seqLen=4, numHeads=2, headDim=8)', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping GPU RoPE test');
      return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const seqLen = 4, numHeads = 2, headDim = 8, base = 10000;
    const rng = mulberry32(42);
    const input = randomArray(seqLen * numHeads * headDim, rng, -2, 2);

    const cpuOut = ropeCpu(input, seqLen, numHeads, headDim, base, 0);
    const kernel = createRopeKernel(device);
    const gpuOut = await kernel.run(input, { seqLen, numHeads, headDim, base, posOffset: 0 });

    expect(allClose(gpuOut, cpuOut, 1e-4)).toBe(true);

    device.destroy();
  });

  it('GPU matches CPU with posOffset=7', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping GPU RoPE posOffset test');
      return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const seqLen = 2, numHeads = 1, headDim = 16, base = 500, posOffset = 7;
    const rng = mulberry32(99);
    const input = randomArray(seqLen * numHeads * headDim, rng, -1, 1);

    const cpuOut = ropeCpu(input, seqLen, numHeads, headDim, base, posOffset);
    const kernel = createRopeKernel(device);
    const gpuOut = await kernel.run(input, { seqLen, numHeads, headDim, base, posOffset });

    expect(allClose(gpuOut, cpuOut, 1e-4)).toBe(true);

    device.destroy();
  });

  it('throws on odd headDim', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const kernel = createRopeKernel(device);
    await expect(
      kernel.run(new Float32Array(3), { seqLen: 1, numHeads: 1, headDim: 3 }),
    ).rejects.toThrow('headDim must be even');

    device.destroy();
  });

  it('throws on input size mismatch', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const kernel = createRopeKernel(device);
    await expect(
      kernel.run(new Float32Array(4), { seqLen: 2, numHeads: 1, headDim: 4 }),
    ).rejects.toThrow('input length');

    device.destroy();
  });
});
