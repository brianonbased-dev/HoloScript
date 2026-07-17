/**
 * decoderBlock.ts — one GPT-2-family (holo arch) transformer block on WebGPU.
 *
 * Composes the verified HoloTorch kernels into a pre-norm decoder block:
 *   a  = LayerNorm(x, ln1)
 *   qkv = a @ Wqkv + bqkv                 (fused QKV Linear)
 *   q,k,v = split(qkv); reshape [T, H*d] -> [H, T, d]
 *   attn = causal_MHA(q, k, v)            reshape [H, T, d] -> [T, H*d]
 *   o  = attn @ Wproj + bproj
 *   x  = x + o                            (residual)
 *   m  = LayerNorm(x, ln2)
 *   h  = GELU(m @ Wfc1 + bfc1)            (MLP 4x)
 *   x  = x + (h @ Wfc2 + bfc2)            (residual)
 *
 * Weight convention here is [in, out] (so gemm(x, W) computes x @ W directly).
 * The checkpoint adapter (separate) handles the PyTorch [out, in] transpose.
 * v0 is correctness-first: reshapes happen host-side between kernel dispatches.
 */
import { createGemmKernel, type GemmKernel } from '../gemmKernel';
import { createBiasAddKernel, type BiasAddKernel } from '../biasAddKernel';
import { createLayerNormKernel, type LayerNormKernel } from '../layerNormKernel';
import { createGeluKernel, type GeluKernel } from '../geluKernel';
import { createFusedMHAKernel, type FusedMHAKernel } from '../fusedMHAKernel';

export interface BlockWeights {
  ln1g: Float32Array; // [nEmbd]
  ln1b: Float32Array; // [nEmbd]
  wqkv: Float32Array; // [nEmbd, 3*nEmbd]
  bqkv: Float32Array; // [3*nEmbd]
  wproj: Float32Array; // [nEmbd, nEmbd]
  bproj: Float32Array; // [nEmbd]
  ln2g: Float32Array; // [nEmbd]
  ln2b: Float32Array; // [nEmbd]
  wfc1: Float32Array; // [nEmbd, 4*nEmbd]
  bfc1: Float32Array; // [4*nEmbd]
  wfc2: Float32Array; // [4*nEmbd, nEmbd]
  bfc2: Float32Array; // [nEmbd]
}

export interface BlockConfig {
  seqLen: number;
  nEmbd: number;
  nHead: number;
}

/** out[r, c] = m[r, startCol + c], slicing a column range. */
export function sliceColumns(m: Float32Array, rows: number, totalCols: number, startCol: number, width: number): Float32Array {
  const out = new Float32Array(rows * width);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < width; c++) out[r * width + c] = m[r * totalCols + startCol + c];
  }
  return out;
}

/** [T, H*d] (row-major, heads contiguous per token) -> [H, T, d]. */
export function toHeads(x: Float32Array, seqLen: number, nHead: number, dHead: number): Float32Array {
  const nEmbd = nHead * dHead;
  const out = new Float32Array(nHead * seqLen * dHead);
  for (let t = 0; t < seqLen; t++) {
    for (let h = 0; h < nHead; h++) {
      for (let di = 0; di < dHead; di++) out[h * seqLen * dHead + t * dHead + di] = x[t * nEmbd + h * dHead + di];
    }
  }
  return out;
}

/** [H, T, d] -> [T, H*d]. Inverse of toHeads. */
export function fromHeads(x: Float32Array, seqLen: number, nHead: number, dHead: number): Float32Array {
  const nEmbd = nHead * dHead;
  const out = new Float32Array(seqLen * nEmbd);
  for (let h = 0; h < nHead; h++) {
    for (let t = 0; t < seqLen; t++) {
      for (let di = 0; di < dHead; di++) out[t * nEmbd + h * dHead + di] = x[h * seqLen * dHead + t * dHead + di];
    }
  }
  return out;
}

function addInto(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

export interface HoloTorchBlock {
  run(x: Float32Array, w: BlockWeights, cfg: BlockConfig): Promise<Float32Array>;
}

export function createHoloTorchBlock(device: GPUDevice): HoloTorchBlock {
  const gemm: GemmKernel = createGemmKernel(device);
  const biasAdd: BiasAddKernel = createBiasAddKernel(device);
  const layerNorm: LayerNormKernel = createLayerNormKernel(device);
  const gelu: GeluKernel = createGeluKernel(device);
  const mha: FusedMHAKernel = createFusedMHAKernel(device);

  /** Linear: y = x @ W + b. x [rows, inDim], W [inDim, outDim], b [outDim]. */
  async function linear(x: Float32Array, W: Float32Array, b: Float32Array, rows: number, inDim: number, outDim: number): Promise<Float32Array> {
    const y = await gemm.run(x, W, rows, outDim, inDim);
    return biasAdd.run(y, b, rows, outDim);
  }

  return {
    async run(x: Float32Array, w: BlockWeights, cfg: BlockConfig): Promise<Float32Array> {
      const { seqLen: T, nEmbd, nHead } = cfg;
      const dHead = nEmbd / nHead;

      // ---- attention ----
      const a = await layerNorm.run(x, w.ln1g, w.ln1b);
      const qkv = await linear(a, w.wqkv, w.bqkv, T, nEmbd, 3 * nEmbd);
      const q = sliceColumns(qkv, T, 3 * nEmbd, 0, nEmbd);
      const k = sliceColumns(qkv, T, 3 * nEmbd, nEmbd, nEmbd);
      const v = sliceColumns(qkv, T, 3 * nEmbd, 2 * nEmbd, nEmbd);
      const attnH = await mha.run(toHeads(q, T, nHead, dHead), toHeads(k, T, nHead, dHead), toHeads(v, T, nHead, dHead), {
        numHeads: nHead,
        qLen: T,
        kLen: T,
        dHead,
        causal: true,
      });
      const attn = fromHeads(attnH, T, nHead, dHead);
      const o = await linear(attn, w.wproj, w.bproj, T, nEmbd, nEmbd);
      const x1 = addInto(x, o);

      // ---- mlp ----
      const m = await layerNorm.run(x1, w.ln2g, w.ln2b);
      const h1 = await linear(m, w.wfc1, w.bfc1, T, nEmbd, 4 * nEmbd);
      const hg = await gelu.run(h1);
      const h2 = await linear(hg, w.wfc2, w.bfc2, T, 4 * nEmbd, nEmbd);
      return addInto(x1, h2);
    },
  };
}
