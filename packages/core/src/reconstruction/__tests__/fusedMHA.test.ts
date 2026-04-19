import { describe, expect, it } from 'vitest';
import { createFusedMHAKernel } from '../fusedMHAKernel';
import { isWebGpuEnvironmentPresent } from '../webgpuGate';

// ---------------------------------------------------------------------------
// CPU reference: single-query multi-head attention
// ---------------------------------------------------------------------------
function mhaCpu(
  Q: Float32Array,
  K: Float32Array,
  V: Float32Array,
  numHeads: number,
  qLen: number,
  kLen: number,
  dHead: number,
  vHead: number = dHead,
): Float32Array {
  const out = new Float32Array(numHeads * qLen * vHead);
  const scale = 1 / Math.sqrt(dHead);
  for (let h = 0; h < numHeads; h++) {
    for (let qi = 0; qi < qLen; qi++) {
      // Scores
      const scores = new Float32Array(kLen);
      const qBase = (h * qLen + qi) * dHead;
      for (let ki = 0; ki < kLen; ki++) {
        const kBase = (h * kLen + ki) * dHead;
        let dot = 0;
        for (let d = 0; d < dHead; d++) dot += Q[qBase + d] * K[kBase + d];
        scores[ki] = dot * scale;
      }
      // Stable softmax
      let maxS = scores[0];
      for (let ki = 1; ki < kLen; ki++) maxS = Math.max(maxS, scores[ki]);
      let sumExp = 0;
      for (let ki = 0; ki < kLen; ki++) { scores[ki] = Math.exp(scores[ki] - maxS); sumExp += scores[ki]; }
      for (let ki = 0; ki < kLen; ki++) scores[ki] /= sumExp;
      // Weighted V
      const oBase = (h * qLen + qi) * vHead;
      for (let vi = 0; vi < vHead; vi++) {
        let acc = 0;
        for (let ki = 0; ki < kLen; ki++) {
          acc += scores[ki] * V[(h * kLen + ki) * vHead + vi];
        }
        out[oBase + vi] = acc;
      }
    }
  }
  return out;
}

function allClose(a: Float32Array, b: Float32Array, atol = 1e-4): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > atol) return false;
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
// CPU tests
// ---------------------------------------------------------------------------
describe('FusedMHA — CPU reference', () => {
  it('single head, q=1, k=2, d=4: softmax weights sum to 1', () => {
    const rng = mulberry32(1);
    const Q = new Float32Array(4).map(() => rng());
    const K = new Float32Array(8).map(() => rng());
    const V = new Float32Array(8).map(() => rng());
    const out = mhaCpu(Q, K, V, 1, 1, 2, 4);
    // Output is weighted average of V rows — verify it's between min/max of V
    const v0 = Array.from(V.slice(0, 4));
    const v1 = Array.from(V.slice(4, 8));
    for (let i = 0; i < 4; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(Math.min(v0[i], v1[i]) - 1e-5);
      expect(out[i]).toBeLessThanOrEqual(Math.max(v0[i], v1[i]) + 1e-5);
    }
  });

  it('identity attention: uniform scores → average of V rows', () => {
    // Q · K^T all equal → uniform softmax → output = mean(V)
    const numHeads = 1, qLen = 1, kLen = 4, dHead = 2;
    // All K rows same → all scores equal
    const K = new Float32Array([1,0, 1,0, 1,0, 1,0]);
    const Q = new Float32Array([1,0]);
    const V = new Float32Array([1,2, 3,4, 5,6, 7,8]);
    const out = mhaCpu(Q, K, V, numHeads, qLen, kLen, dHead);
    // mean of each vHead dim: (1+3+5+7)/4=4, (2+4+6+8)/4=5
    expect(out[0]).toBeCloseTo(4, 4);
    expect(out[1]).toBeCloseTo(5, 4);
  });

  it('2 heads independence: each head operates on its own QKV', () => {
    const rng = mulberry32(7);
    const numHeads = 2, qLen = 2, kLen = 3, dHead = 4;
    const Q = new Float32Array(numHeads * qLen * dHead).map(() => rng());
    const K = new Float32Array(numHeads * kLen * dHead).map(() => rng());
    const V = new Float32Array(numHeads * kLen * dHead).map(() => rng());

    const combined = mhaCpu(Q, K, V, numHeads, qLen, kLen, dHead);
    // Compute each head separately
    const h0Q = Q.slice(0, qLen * dHead);
    const h0K = K.slice(0, kLen * dHead);
    const h0V = V.slice(0, kLen * dHead);
    const h1Q = Q.slice(qLen * dHead);
    const h1K = K.slice(kLen * dHead);
    const h1V = V.slice(kLen * dHead);
    const h0out = mhaCpu(h0Q, h0K, h0V, 1, qLen, kLen, dHead);
    const h1out = mhaCpu(h1Q, h1K, h1V, 1, qLen, kLen, dHead);

    expect(allClose(combined.slice(0, qLen * dHead), h0out)).toBe(true);
    expect(allClose(combined.slice(qLen * dHead), h1out)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WebGPU tests
// ---------------------------------------------------------------------------
describe('FusedMHA — WebGPU', () => {
  it('1 head, qLen=4, kLen=4, dHead=8: GPU matches CPU', async () => {
    if (!isWebGpuEnvironmentPresent()) {
      console.warn('WebGPU not available — skipping MHA GPU test');
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const rng = mulberry32(42);
    const numHeads = 1, qLen = 4, kLen = 4, dHead = 8;
    const Q = new Float32Array(numHeads * qLen * dHead).map(() => rng() - 0.5);
    const K = new Float32Array(numHeads * kLen * dHead).map(() => rng() - 0.5);
    const V = new Float32Array(numHeads * kLen * dHead).map(() => rng() - 0.5);

    const cpu = mhaCpu(Q, K, V, numHeads, qLen, kLen, dHead);
    const kernel = createFusedMHAKernel(device);
    const gpu = await kernel.run(Q, K, V, { numHeads, qLen, kLen, dHead });

    expect(allClose(gpu, cpu, 1e-4)).toBe(true);
    device.destroy();
  });

  it('2 heads, qLen=2, kLen=4, dHead=8: GPU matches CPU', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const rng = mulberry32(13);
    const numHeads = 2, qLen = 2, kLen = 4, dHead = 8;
    const Q = new Float32Array(numHeads * qLen * dHead).map(() => rng() - 0.5);
    const K = new Float32Array(numHeads * kLen * dHead).map(() => rng() - 0.5);
    const V = new Float32Array(numHeads * kLen * dHead).map(() => rng() - 0.5);

    const cpu = mhaCpu(Q, K, V, numHeads, qLen, kLen, dHead);
    const kernel = createFusedMHAKernel(device);
    const gpu = await kernel.run(Q, K, V, { numHeads, qLen, kLen, dHead });

    expect(allClose(gpu, cpu, 1e-4)).toBe(true);
    device.destroy();
  });

  it('kLen > 1024 throws', async () => {
    if (!isWebGpuEnvironmentPresent()) return;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();

    const kernel = createFusedMHAKernel(device);
    await expect(
      kernel.run(
        new Float32Array(4),
        new Float32Array(4 * 1025),
        new Float32Array(4 * 1025),
        { numHeads: 1, qLen: 1, kLen: 1025, dHead: 4 },
      ),
    ).rejects.toThrow('1024');
    device.destroy();
  });
});
