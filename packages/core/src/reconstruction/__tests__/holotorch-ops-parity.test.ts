/**
 * holotorch-ops-parity.test.ts — HoloTorch inference-parity, S2 op coverage.
 *
 * Extends the GEMM parity (holotorch-gemm-parity.test.ts) to the remaining
 * EXISTING forward-pass kernels of the HoloMap WebGPU substrate — LayerNorm,
 * softmax, GELU — proving each numerically correct against an f64 reference on
 * real hardware before the net-new decoder pieces (causal mask, embedding-gather,
 * bias epilogue) are added. Each op emits a holotorch-inference-parity.v0 receipt.
 *
 * Metric: numpy.allclose (|got-ref| <= atol + rtol*|ref|) — per-element relative
 * error is the wrong tool near zero (see the GEMM test). GPU-less env → honest skip.
 *
 * NOTE: harness bootstrap is duplicated from the GEMM test on purpose for now;
 * a shared holotorch/parityHarness.ts extraction is the follow-up cleanup once the
 * op set stabilizes (2 consumers now justify it).
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLayerNormKernel } from '../layerNormKernel';
import { createSoftmaxKernel } from '../softmaxKernel';
import { createGeluKernel } from '../geluKernel';
import { createFusedMHAKernel } from '../fusedMHAKernel';
import { createBiasAddKernel } from '../biasAddKernel';
import { createEmbeddingGatherKernel } from '../embeddingGatherKernel';

interface AdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

let capturedAdapterInfo: AdapterInfo = {};
let cachedDevice: GPUDevice | null | undefined;

/** Bootstrap node-webgpu once and cache the device (Dawn dislikes many devices). */
async function getDevice(): Promise<GPUDevice | null> {
  if (cachedDevice !== undefined) return cachedDevice;
  const g = globalThis as unknown as { navigator?: { gpu?: GPU } };
  if (!g.navigator?.gpu) {
    try {
      const mod = (await import('webgpu')) as unknown as {
        create?: (flags: string[]) => GPU;
        globals?: Record<string, unknown>;
        default?: { create?: (flags: string[]) => GPU; globals?: Record<string, unknown> };
      };
      const create = mod.create ?? mod.default?.create;
      const globals = mod.globals ?? mod.default?.globals ?? {};
      const gpu = typeof create === 'function' ? create([]) : undefined;
      if (!gpu || typeof (gpu as { requestAdapter?: unknown }).requestAdapter !== 'function') {
        cachedDevice = null;
        return null;
      }
      g.navigator ??= {} as { gpu?: GPU };
      g.navigator.gpu = gpu;
      const target = globalThis as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(globals)) {
        if (target[k] == null) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
      }
    } catch {
      cachedDevice = null;
      return null;
    }
  }
  const adapter = await g.navigator!.gpu!.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    cachedDevice = null;
    return null;
  }
  const info = (adapter as unknown as { info?: AdapterInfo }).info ?? {};
  capturedAdapterInfo = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description };
  cachedDevice = await adapter.requestDevice();
  return cachedDevice;
}

function compareAllClose(
  got: Float32Array,
  ref: Float64Array,
  atol: number,
  rtol: number
): { maxAbs: number; maxRefAbs: number; relToScale: number; allClose: boolean } {
  let maxAbs = 0;
  let maxRefAbs = 0;
  let allClose = true;
  for (let i = 0; i < got.length; i++) {
    const abs = Math.abs(got[i] - ref[i]);
    const r = Math.abs(ref[i]);
    if (abs > maxAbs) maxAbs = abs;
    if (r > maxRefAbs) maxRefAbs = r;
    if (abs > atol + rtol * r) allClose = false;
  }
  return { maxAbs, maxRefAbs, relToScale: maxAbs / Math.max(maxRefAbs, 1e-12), allClose };
}

function writeParityReceipt(op: string, payload: Record<string, unknown>): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, '..', 'holotorch', 'receipts');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${op}-parity.receipt.json`),
    `${JSON.stringify({ schema: 'holotorch-inference-parity.v0', op, adapter: capturedAdapterInfo, ...payload }, null, 2)}\n`
  );
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

function refLayerNorm(
  input: Float32Array,
  gamma: Float32Array,
  beta: Float32Array,
  rows: number,
  dModel: number,
  eps: number
): Float64Array {
  const out = new Float64Array(rows * dModel);
  for (let r = 0; r < rows; r++) {
    let mean = 0;
    for (let c = 0; c < dModel; c++) mean += input[r * dModel + c];
    mean /= dModel;
    let v = 0;
    for (let c = 0; c < dModel; c++) {
      const d = input[r * dModel + c] - mean;
      v += d * d;
    }
    v /= dModel;
    const inv = 1 / Math.sqrt(v + eps);
    for (let c = 0; c < dModel; c++) out[r * dModel + c] = (input[r * dModel + c] - mean) * inv * gamma[c] + beta[c];
  }
  return out;
}

function refSoftmax(input: Float32Array, rows: number, cols: number): Float64Array {
  const out = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    let m = -Infinity;
    for (let c = 0; c < cols; c++) m = Math.max(m, input[r * cols + c]);
    let s = 0;
    for (let c = 0; c < cols; c++) {
      const e = Math.exp(input[r * cols + c] - m);
      out[r * cols + c] = e;
      s += e;
    }
    for (let c = 0; c < cols; c++) out[r * cols + c] /= s;
  }
  return out;
}

function erfAS(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

function refGelu(input: Float32Array, form: 'tanh' | 'erf'): Float64Array {
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    out[i] =
      form === 'erf'
        ? 0.5 * x * (1 + erfAS(x * 0.70710678118654752))
        : 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
  }
  return out;
}

/** f64 reference multi-head attention: softmax(Q·Kᵀ/√dHead [+causal mask]) · V. */
function refMHA(
  Q: Float32Array,
  K: Float32Array,
  V: Float32Array,
  numHeads: number,
  qLen: number,
  kLen: number,
  dHead: number,
  vHead: number,
  causal: boolean
): Float64Array {
  const out = new Float64Array(numHeads * qLen * vHead);
  const scale = 1 / Math.sqrt(dHead);
  for (let h = 0; h < numHeads; h++) {
    for (let q = 0; q < qLen; q++) {
      const scores = new Float64Array(kLen);
      let mx = -Infinity;
      for (let ki = 0; ki < kLen; ki++) {
        if (causal && ki > q) {
          scores[ki] = -Infinity;
          continue;
        }
        let dot = 0;
        const qBase = (h * qLen + q) * dHead;
        const kBase = (h * kLen + ki) * dHead;
        for (let d = 0; d < dHead; d++) dot += Q[qBase + d] * K[kBase + d];
        scores[ki] = dot * scale;
        if (scores[ki] > mx) mx = scores[ki];
      }
      let s = 0;
      for (let ki = 0; ki < kLen; ki++) {
        const e = scores[ki] === -Infinity ? 0 : Math.exp(scores[ki] - mx);
        scores[ki] = e;
        s += e;
      }
      for (let ki = 0; ki < kLen; ki++) scores[ki] /= s;
      const oBase = (h * qLen + q) * vHead;
      for (let vi = 0; vi < vHead; vi++) {
        let acc = 0;
        for (let ki = 0; ki < kLen; ki++) acc += scores[ki] * V[(h * kLen + ki) * vHead + vi];
        out[oBase + vi] = acc;
      }
    }
  }
  return out;
}

describe('HoloTorch op parity (WGSL vs f64 reference, real GPU)', () => {
  it('layernorm matches f64 reference (holo n_embd=384)', async () => {
    const device = await getDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping layernorm');
      return;
    }
    const ln = createLayerNormKernel(device);
    const rand = rng(7);
    const rows = 8;
    const dModel = 384;
    const eps = 1e-5;
    const input = new Float32Array(rows * dModel);
    for (let i = 0; i < input.length; i++) input[i] = rand() * 3;
    const gamma = new Float32Array(dModel);
    for (let i = 0; i < dModel; i++) gamma[i] = 1 + 0.1 * rand();
    const beta = new Float32Array(dModel);
    for (let i = 0; i < dModel; i++) beta[i] = 0.1 * rand();

    const got = await ln.run(input, gamma, beta);
    const ref = refLayerNorm(input, gamma, beta, rows, dModel, eps);
    const cmp = compareAllClose(got, ref, 1e-3, 1e-2);
    console.warn(
      `[holotorch-parity]   layernorm [${rows}x${dModel}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} allClose=${cmp.allClose}`
    );
    writeParityReceipt('layernorm', { dims: { rows, dModel, eps }, ...cmp, verdict: cmp.allClose ? 'pass' : 'fail' });
    expect(cmp.allClose).toBe(true);
  }, 120000);

  it('softmax matches f64 reference and rows sum to 1 (attention + vocab widths)', async () => {
    const device = await getDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping softmax');
      return;
    }
    const sm = createSoftmaxKernel(device);
    const rand = rng(11);
    for (const { rows, cols, tag } of [
      { rows: 6, cols: 8, tag: 'attn' },
      { rows: 2, cols: 562, tag: 'vocab' },
    ]) {
      const input = new Float32Array(rows * cols);
      for (let i = 0; i < input.length; i++) input[i] = rand() * 5;
      const got = await sm.run(input, rows, cols);
      const ref = refSoftmax(input, rows, cols);
      const cmp = compareAllClose(got, ref, 1e-4, 1e-3);
      let maxSumErr = 0;
      for (let r = 0; r < rows; r++) {
        let s = 0;
        for (let c = 0; c < cols; c++) s += got[r * cols + c];
        maxSumErr = Math.max(maxSumErr, Math.abs(s - 1));
      }
      console.warn(
        `[holotorch-parity]   softmax-${tag} [${rows}x${cols}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} sumErr=${maxSumErr.toExponential(2)} allClose=${cmp.allClose}`
      );
      writeParityReceipt(`softmax-${tag}`, { dims: { rows, cols }, ...cmp, maxSumErr, verdict: cmp.allClose ? 'pass' : 'fail' });
      expect(cmp.allClose).toBe(true);
      expect(maxSumErr).toBeLessThan(1e-4);
    }
  }, 120000);

  it('gelu matches reference for both tanh and exact-erf forms', async () => {
    const device = await getDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping gelu');
      return;
    }
    const gelu = createGeluKernel(device);
    const rand = rng(13);
    const n = 4096;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) input[i] = rand() * 6; // range [-6, 6]

    for (const form of ['tanh', 'erf'] as const) {
      const got = await gelu.run(input, form);
      const ref = refGelu(input, form);
      const cmp = compareAllClose(got, ref, 1e-4, 1e-3);
      console.warn(
        `[holotorch-parity]   gelu-${form} [n=${n}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} allClose=${cmp.allClose}`
      );
      writeParityReceipt(`gelu-${form}`, { n, form, ...cmp, verdict: cmp.allClose ? 'pass' : 'fail' });
      expect(cmp.allClose).toBe(true);
    }
  }, 120000);

  it('fused-MHA causal + bidirectional parity, and the causal invariant (token 0 attends only to itself)', async () => {
    const device = await getDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping fused-mha');
      return;
    }
    const mha = createFusedMHAKernel(device);
    const rand = rng(17);
    // holo arch: n_head=6, dHead=n_embd/n_head=64. Self-attention: qLen==kLen==T.
    const numHeads = 6;
    const dHead = 64;
    const T = 8;
    const mk = (len: number): Float32Array => {
      const a = new Float32Array(numHeads * len * dHead);
      for (let i = 0; i < a.length; i++) a[i] = rand();
      return a;
    };
    const Q = mk(T);
    const K = mk(T);
    const V = mk(T);

    for (const causal of [true, false]) {
      const got = await mha.run(Q, K, V, { numHeads, qLen: T, kLen: T, dHead, causal });
      const ref = refMHA(Q, K, V, numHeads, T, T, dHead, dHead, causal);
      const cmp = compareAllClose(got, ref, 1e-3, 1e-2);
      console.warn(
        `[holotorch-parity]   fused-mha causal=${causal} [h${numHeads} T${T} d${dHead}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} allClose=${cmp.allClose}`
      );
      writeParityReceipt(`fused-mha-${causal ? 'causal' : 'bidir'}`, {
        dims: { numHeads, qLen: T, kLen: T, dHead, causal },
        ...cmp,
        verdict: cmp.allClose ? 'pass' : 'fail',
      });
      expect(cmp.allClose).toBe(true);

      // Structural causal invariant: query 0 attends only to key 0 (softmax of one score = 1),
      // so its output must equal V[head, 0, :] exactly (up to fp32).
      if (causal) {
        let maxT0Err = 0;
        for (let h = 0; h < numHeads; h++) {
          for (let vi = 0; vi < dHead; vi++) {
            const o = got[(h * T + 0) * dHead + vi];
            const v0 = V[(h * T + 0) * dHead + vi];
            maxT0Err = Math.max(maxT0Err, Math.abs(o - v0));
          }
        }
        console.warn(`[holotorch-parity]   fused-mha causal token-0 invariant maxErr=${maxT0Err.toExponential(2)}`);
        expect(maxT0Err).toBeLessThan(1e-5);
      }
    }
  }, 120000);

  it('bias-add (row-broadcast) matches reference to fp32-exact', async () => {
    const device = await getDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping bias-add');
      return;
    }
    const kernel = createBiasAddKernel(device);
    const rand = rng(23);
    const rows = 8;
    const cols = 384;
    const input = new Float32Array(rows * cols);
    for (let i = 0; i < input.length; i++) input[i] = rand() * 3;
    const bias = new Float32Array(cols);
    for (let i = 0; i < cols; i++) bias[i] = rand();

    const got = await kernel.run(input, bias, rows, cols);
    const ref = new Float64Array(rows * cols);
    for (let m = 0; m < rows; m++) for (let n = 0; n < cols; n++) ref[m * cols + n] = input[m * cols + n] + bias[n];
    const cmp = compareAllClose(got, ref, 1e-5, 1e-4);
    console.warn(
      `[holotorch-parity]   bias-add [${rows}x${cols}] maxAbs=${cmp.maxAbs.toExponential(2)} allClose=${cmp.allClose}`
    );
    writeParityReceipt('bias-add', { dims: { rows, cols }, ...cmp, verdict: cmp.allClose ? 'pass' : 'fail' });
    expect(cmp.allClose).toBe(true);
  }, 120000);

  it('embedding-gather (token + learned-positional) matches reference to fp32-exact', async () => {
    const device = await getDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping embed-gather');
      return;
    }
    const kernel = createEmbeddingGatherKernel(device);
    const rand = rng(29);
    const seqLen = 8;
    const dModel = 384;
    const vocab = 562; // holo arch vocab
    const wte = new Float32Array(vocab * dModel);
    for (let i = 0; i < wte.length; i++) wte[i] = rand();
    const wpe = new Float32Array(seqLen * dModel);
    for (let i = 0; i < wpe.length; i++) wpe[i] = rand();
    const ids = new Uint32Array(seqLen);
    for (let t = 0; t < seqLen; t++) ids[t] = Math.floor((rand() * 0.5 + 0.5) * vocab) % vocab;

    const got = await kernel.run(ids, wte, wpe, seqLen, dModel, vocab);
    const ref = new Float64Array(seqLen * dModel);
    for (let t = 0; t < seqLen; t++) {
      for (let d = 0; d < dModel; d++) ref[t * dModel + d] = wte[ids[t] * dModel + d] + wpe[t * dModel + d];
    }
    const cmp = compareAllClose(got, ref, 1e-5, 1e-4);
    console.warn(
      `[holotorch-parity]   embed-gather [T${seqLen} d${dModel} v${vocab}] maxAbs=${cmp.maxAbs.toExponential(2)} allClose=${cmp.allClose}`
    );
    writeParityReceipt('embed-gather', { dims: { seqLen, dModel, vocab }, ...cmp, verdict: cmp.allClose ? 'pass' : 'fail' });
    expect(cmp.allClose).toBe(true);
  }, 120000);
});
