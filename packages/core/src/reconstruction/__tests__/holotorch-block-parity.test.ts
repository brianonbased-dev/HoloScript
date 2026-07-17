/**
 * holotorch-block-parity.test.ts — HoloTorch decoder-block assembly parity.
 *
 * Proves the WIRING (residuals, op ordering, the [T,H*d]<->[H,T,d] reshapes) by
 * composing the verified kernels (decoderBlock.ts) and comparing against an f64
 * reference on real hardware, with RANDOM weights (real weights come via the
 * checkpoint adapter, a separate piece). The reference computes attention INLINE
 * on the [T, nEmbd] layout — it does NOT reuse toHeads/fromHeads — so a reshape
 * index bug in the block would surface as a mismatch rather than being masked.
 */
import { describe, it, expect } from 'vitest';
import { createHoloTorchBlock, toHeads, fromHeads, type BlockWeights } from '../holotorch/decoderBlock';
import { getWebGpuDevice, compareAllClose, writeParityReceipt, rng, getAdapterInfo } from './holotorchParityHarness';

function refLayerNorm(input: Float32Array, gamma: Float32Array, beta: Float32Array, rows: number, dModel: number, eps: number): Float64Array {
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

/** y[r,o] = sum_i x[r,i]*W[i,o] + b[o]. x [rows,inDim], W [inDim,outDim] (as f64 in). */
function refLinear(x: ArrayLike<number>, W: Float32Array, b: Float32Array, rows: number, inDim: number, outDim: number): Float64Array {
  const out = new Float64Array(rows * outDim);
  for (let r = 0; r < rows; r++) {
    for (let o = 0; o < outDim; o++) {
      let acc = 0;
      for (let i = 0; i < inDim; i++) acc += x[r * inDim + i] * W[i * outDim + o];
      out[r * outDim + o] = acc + b[o];
    }
  }
  return out;
}

function refGelu(x: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    out[i] = 0.5 * xi * (1 + Math.tanh(0.7978845608 * (xi + 0.044715 * xi * xi * xi)));
  }
  return out;
}

/** Full block reference. Attention computed INLINE per-head on [T, nEmbd] (no shared reshape). */
function refBlock(x: Float32Array, w: BlockWeights, T: number, nEmbd: number, nHead: number): Float64Array {
  const dHead = nEmbd / nHead;
  const eps = 1e-5;
  const a = refLayerNorm(x, w.ln1g, w.ln1b, T, nEmbd, eps);
  const qkv = refLinear(a, w.wqkv, w.bqkv, T, nEmbd, 3 * nEmbd); // [T, 3nEmbd]
  // split q/k/v as views into qkv columns [0,nEmbd),[nEmbd,2nEmbd),[2nEmbd,3nEmbd)
  const col = (row: number, base: number, di: number): number => qkv[row * 3 * nEmbd + base + di];
  const scale = 1 / Math.sqrt(dHead);
  const attn = new Float64Array(T * nEmbd);
  for (let h = 0; h < nHead; h++) {
    const off = h * dHead;
    for (let qi = 0; qi < T; qi++) {
      const scores = new Float64Array(T);
      let mx = -Infinity;
      for (let ki = 0; ki <= qi; ki++) {
        let dot = 0;
        for (let di = 0; di < dHead; di++) dot += col(qi, 0, off + di) * col(ki, nEmbd, off + di);
        scores[ki] = dot * scale;
        if (scores[ki] > mx) mx = scores[ki];
      }
      let s = 0;
      for (let ki = 0; ki <= qi; ki++) {
        const e = Math.exp(scores[ki] - mx);
        scores[ki] = e;
        s += e;
      }
      for (let di = 0; di < dHead; di++) {
        let acc = 0;
        for (let ki = 0; ki <= qi; ki++) acc += (scores[ki] / s) * col(ki, 2 * nEmbd, off + di);
        attn[qi * nEmbd + off + di] = acc;
      }
    }
  }
  const o = refLinear(attn, w.wproj, w.bproj, T, nEmbd, nEmbd);
  const x1 = new Float64Array(T * nEmbd);
  for (let i = 0; i < x1.length; i++) x1[i] = x[i] + o[i];
  const m = refLayerNorm(Float32Array.from(x1), w.ln2g, w.ln2b, T, nEmbd, eps);
  const h1 = refLinear(m, w.wfc1, w.bfc1, T, nEmbd, 4 * nEmbd);
  const hg = refGelu(h1, T * 4 * nEmbd);
  const h2 = refLinear(hg, w.wfc2, w.bfc2, T, 4 * nEmbd, nEmbd);
  const x2 = new Float64Array(T * nEmbd);
  for (let i = 0; i < x2.length; i++) x2[i] = x1[i] + h2[i];
  return x2;
}

function randArray(rand: () => number, n: number, scale = 1): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = rand() * scale;
  return a;
}

describe('HoloTorch decoder-block assembly parity (WGSL vs f64 reference, real GPU)', () => {
  it('reshape round-trip: fromHeads(toHeads(x)) === x', () => {
    const T = 5;
    const nHead = 3;
    const dHead = 4;
    const rand = rng(3);
    const x = randArray(rand, T * nHead * dHead);
    const back = fromHeads(toHeads(x, T, nHead, dHead), T, nHead, dHead);
    let maxErr = 0;
    for (let i = 0; i < x.length; i++) maxErr = Math.max(maxErr, Math.abs(back[i] - x[i]));
    expect(maxErr).toBe(0);
  });

  it('full block matches f64 reference (holo dims: nEmbd=384, nHead=6)', async () => {
    const device = await getWebGpuDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping block');
      return;
    }
    const block = createHoloTorchBlock(device);
    const rand = rng(31);
    const T = 8;
    const nEmbd = 384;
    const nHead = 6;

    const w: BlockWeights = {
      ln1g: randArray(rand, nEmbd, 0.2).map((z) => 1 + z) as Float32Array,
      ln1b: randArray(rand, nEmbd, 0.1),
      // Linear weights scaled ~1/sqrt(fan_in) so activations stay O(1) (realistic).
      wqkv: randArray(rand, nEmbd * 3 * nEmbd, 1 / Math.sqrt(nEmbd)),
      bqkv: randArray(rand, 3 * nEmbd, 0.1),
      wproj: randArray(rand, nEmbd * nEmbd, 1 / Math.sqrt(nEmbd)),
      bproj: randArray(rand, nEmbd, 0.1),
      ln2g: randArray(rand, nEmbd, 0.2).map((z) => 1 + z) as Float32Array,
      ln2b: randArray(rand, nEmbd, 0.1),
      wfc1: randArray(rand, nEmbd * 4 * nEmbd, 1 / Math.sqrt(nEmbd)),
      bfc1: randArray(rand, 4 * nEmbd, 0.1),
      wfc2: randArray(rand, 4 * nEmbd * nEmbd, 1 / Math.sqrt(4 * nEmbd)),
      bfc2: randArray(rand, nEmbd, 0.1),
    };
    const x = randArray(rand, T * nEmbd);

    const got = await block.run(x, w, { seqLen: T, nEmbd, nHead });
    const ref = refBlock(x, w, T, nEmbd, nHead);
    // Deep composition (7+ chained ops) → looser fp32 tolerance than a single op.
    const cmp = compareAllClose(got, ref, 1e-3, 5e-3);
    console.warn(
      `[holotorch-parity]   decoder-block [T${T} d${nEmbd} h${nHead}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} allClose=${cmp.allClose}`
    );
    writeParityReceipt('decoder-block', {
      dims: { seqLen: T, nEmbd, nHead },
      ...cmp,
      verdict: cmp.allClose ? 'pass' : 'fail',
      note: `adapter ${getAdapterInfo().device ?? '?'}; random weights (real weights via ckpt adapter, separate piece).`,
    });
    expect(got.length).toBe(T * nEmbd);
    expect(cmp.allClose).toBe(true);
  }, 120000);
});
