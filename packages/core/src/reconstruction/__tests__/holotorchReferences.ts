/**
 * holotorchReferences.ts — f64 reference implementations of the holo forward pass,
 * shared by the HoloTorch parity tests. Not a test file (no *.test.ts suffix).
 *
 * Attention is computed INLINE per-head on the [T, nEmbd] layout (it does NOT use
 * the block's toHeads/fromHeads), so a reshape bug in the WGSL block surfaces as a
 * mismatch rather than being masked by a shared helper.
 */
import type { BlockWeights } from '../holotorch/decoderBlock';

const EPS = 1e-5;

export function refLayerNorm(
  input: ArrayLike<number>,
  gamma: Float32Array,
  beta: Float32Array,
  rows: number,
  dModel: number
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
    const inv = 1 / Math.sqrt(v + EPS);
    for (let c = 0; c < dModel; c++) out[r * dModel + c] = (input[r * dModel + c] - mean) * inv * gamma[c] + beta[c];
  }
  return out;
}

/** y[r,o] = Σ_i x[r,i]·W[i,o] + b[o]. x [rows,inDim], W [inDim,outDim]. */
export function refLinear(
  x: ArrayLike<number>,
  W: Float32Array,
  b: Float32Array,
  rows: number,
  inDim: number,
  outDim: number
): Float64Array {
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

export function refGelu(x: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    out[i] = 0.5 * xi * (1 + Math.tanh(0.7978845608 * (xi + 0.044715 * xi * xi * xi)));
  }
  return out;
}

/** One GPT-2 pre-norm block. x is f32 (matches the WGSL inter-op storage); returns f64. */
export function refBlock(x: Float32Array, w: BlockWeights, T: number, nEmbd: number, nHead: number): Float64Array {
  const dHead = nEmbd / nHead;
  const a = refLayerNorm(x, w.ln1g, w.ln1b, T, nEmbd);
  const qkv = refLinear(a, w.wqkv, w.bqkv, T, nEmbd, 3 * nEmbd);
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
  const m = refLayerNorm(Float32Array.from(x1), w.ln2g, w.ln2b, T, nEmbd);
  const h1 = refLinear(m, w.wfc1, w.bfc1, T, nEmbd, 4 * nEmbd);
  const hg = refGelu(h1, T * 4 * nEmbd);
  const h2 = refLinear(hg, w.wfc2, w.bfc2, T, 4 * nEmbd, nEmbd);
  const x2 = new Float64Array(T * nEmbd);
  for (let i = 0; i < x2.length; i++) x2[i] = x1[i] + h2[i];
  return x2;
}
