/**
 * holoMapMicroEncoder — deterministic one-patch vision encoder for HoloMapRuntime.step().
 *
 * Composes shipped WebGPU kernels: imagePatchEmbed → layerNorm → GEMM (Q/K/V)
 * → RoPE → fusedMHA → layerNorm → GELU → GEMM (xyz). Uses a single 14×14 patch
 * so attention length stays tiny while exercising the real operator chain.
 *
 * PagedKV append/lookup is for streaming kLen>1; this path uses fused MHA only.
 */

import { createImagePatchEmbedKernel } from './imagePatchEmbedKernel';
import { createLayerNormKernel } from './layerNormKernel';
import { createGemmKernel } from './gemmKernel';
import { createRopeKernel } from './ropeKernel';
import { createFusedMHAKernel } from './fusedMHAKernel';
import { createGeluKernel } from './geluKernel';

const MICRO = 14;
const EMBED_DIM = 32;
const NUM_HEADS = 4;
const HEAD_DIM = 8;
const PATCH_LEN = MICRO * MICRO * 3;

/** Structural subset of ReconstructionFrame (avoids circular import with HoloMapRuntime). */
export interface HoloMapMicroFrame {
  index: number;
  rgb: Uint8Array;
  width: number;
  height: number;
  stride: 3 | 4;
}

/** Fields read for deterministic micro-weights (mirrors HoloMapConfig). */
export interface HoloMapMicroConfig {
  seed: number;
  modelHash: string;
}

function hashConfigSeed(config: HoloMapMicroConfig): number {
  let h = config.seed >>> 0;
  const s = config.modelHash || '';
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x9e3779b9);
  }
  return h >>> 0;
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

function fillGaussian2D(out: Float32Array, rng: () => number, scale: number): void {
  for (let i = 0; i < out.length; i += 1) out[i] = (rng() * 2 - 1) * scale;
}

/** Nearest-neighbor RGB (0–255) → planar float [H,W,3] row-major in [0,1]. */
export function frameToMicroImage(frame: HoloMapMicroFrame): Float32Array {
  const out = new Float32Array(MICRO * MICRO * 3);
  for (let y = 0; y < MICRO; y += 1) {
    const sy = Math.min(frame.height - 1, Math.floor((y * frame.height) / MICRO));
    for (let x = 0; x < MICRO; x += 1) {
      const sx = Math.min(frame.width - 1, Math.floor((x * frame.width) / MICRO));
      const src = (sy * frame.width + sx) * frame.stride;
      const dst = (y * MICRO + x) * 3;
      out[dst] = frame.rgb[src] / 255;
      out[dst + 1] = frame.rgb[src + 1] / 255;
      out[dst + 2] = frame.rgb[src + 2] / 255;
    }
  }
  return out;
}

/** One patch 14×14×3 → [embedDim] (same math as imagePatchEmbed kernel). */
function patchEmbedCpu(image: Float32Array, proj: Float32Array, embedDim: number): Float32Array {
  const out = new Float32Array(embedDim);
  for (let d = 0; d < embedDim; d += 1) {
    let dot = 0;
    const row = d * PATCH_LEN;
    for (let i = 0; i < PATCH_LEN; i += 1) dot += image[i] * proj[row + i];
    out[d] = dot;
  }
  return out;
}

function gemmCpu(a: Float32Array, b: Float32Array, M: number, K: number, N: number): Float32Array {
  const c = new Float32Array(M * N);
  for (let m = 0; m < M; m += 1) {
    for (let n = 0; n < N; n += 1) {
      let acc = 0;
      for (let k = 0; k < K; k += 1) acc += a[m * K + k] * b[k * N + n];
      c[m * N + n] = acc;
    }
  }
  return c;
}

function layerNormCpu(x: Float32Array, gamma: Float32Array, beta: Float32Array, rows: number, d: number): Float32Array {
  const y = new Float32Array(x.length);
  const eps = 1e-5;
  for (let r = 0; r < rows; r += 1) {
    let sum = 0;
    for (let j = 0; j < d; j += 1) sum += x[r * d + j];
    const mean = sum / d;
    let sq = 0;
    for (let j = 0; j < d; j += 1) {
      const t = x[r * d + j] - mean;
      sq += t * t;
    }
    const inv = 1 / Math.sqrt(sq / d + eps);
    for (let j = 0; j < d; j += 1) {
      const norm = (x[r * d + j] - mean) * inv;
      y[r * d + j] = norm * gamma[j] + beta[j];
    }
  }
  return y;
}

function geluCpu(x: Float32Array): Float32Array {
  const y = new Float32Array(x.length);
  const k0 = 0.7978845608;
  const k1 = 0.044715;
  for (let i = 0; i < x.length; i += 1) {
    const v = x[i];
    const x3 = v * v * v;
    const inner = k0 * (v + k1 * x3);
    y[i] = 0.5 * v * (1 + Math.tanh(inner));
  }
  return y;
}

function mhaCpu(
  Q: Float32Array,
  K: Float32Array,
  V: Float32Array,
  numHeads: number,
  qLen: number,
  kLen: number,
  dHead: number,
  vHead: number,
): Float32Array {
  const out = new Float32Array(numHeads * qLen * vHead);
  const scale = 1 / Math.sqrt(Math.max(dHead, 1));
  for (let h = 0; h < numHeads; h += 1) {
    for (let qi = 0; qi < qLen; qi += 1) {
      const scores = new Float32Array(kLen);
      let maxS = -Infinity;
      const qBase = (h * qLen + qi) * dHead;
      for (let ki = 0; ki < kLen; ki += 1) {
        const kBase = (h * kLen + ki) * dHead;
        let dot = 0;
        for (let d = 0; d < dHead; d += 1) dot += Q[qBase + d] * K[kBase + d];
        const s = dot * scale;
        scores[ki] = s;
        maxS = Math.max(maxS, s);
      }
      let denom = 0;
      for (let ki = 0; ki < kLen; ki += 1) {
        scores[ki] = Math.exp(scores[ki] - maxS);
        denom += scores[ki];
      }
      const oBase = (h * qLen + qi) * vHead;
      for (let vi = 0; vi < vHead; vi += 1) {
        let acc = 0;
        for (let ki = 0; ki < kLen; ki += 1) {
          acc += (scores[ki] / Math.max(denom, 1e-9)) * V[(h * kLen + ki) * vHead + vi];
        }
        out[oBase + vi] = acc;
      }
    }
  }
  return out;
}

function ropeCpuSync(q: Float32Array, seqLen: number, numHeads: number, headDim: number, posOffset: number): Float32Array {
  const out = q.slice();
  const base = 10000;
  for (let t = 0; t < seqLen; t += 1) {
    const pos = t + posOffset;
    for (let h = 0; h < numHeads; h += 1) {
      for (let p = 0; p < headDim / 2; p += 1) {
        const exp = -2 * (p / headDim);
        const theta = pos * base ** exp;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        const i0 = (t * numHeads + h) * headDim + 2 * p;
        const i1 = i0 + 1;
        const x0 = q[i0];
        const x1 = q[i1];
        out[i0] = x0 * c - x1 * s;
        out[i1] = x0 * s + x1 * c;
      }
    }
  }
  return out;
}

export async function tryCreateHoloMapEncoderDevice(): Promise<GPUDevice | null> {
  try {
    const nav = globalThis.navigator as Navigator & { gpu?: GPU };
    if (!nav?.gpu) return null;
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}

export interface HoloMapMicroEncoder {
  /** Returns a 3-vector used as pose translation hint + point cloud seed. */
  run(frame: HoloMapMicroFrame, config: HoloMapMicroConfig): Promise<Float32Array>;
}

export function createHoloMapMicroEncoder(device: GPUDevice): HoloMapMicroEncoder {
  const patchEmbed = createImagePatchEmbedKernel(device);
  const layerNorm = createLayerNormKernel(device);
  const gemm = createGemmKernel(device);
  const rope = createRopeKernel(device);
  const fusedMha = createFusedMHAKernel(device);
  const gelu = createGeluKernel(device);

  const gamma1 = new Float32Array(EMBED_DIM).fill(1);
  const beta1 = new Float32Array(EMBED_DIM).fill(0);
  const gamma2 = new Float32Array(EMBED_DIM).fill(1);
  const beta2 = new Float32Array(EMBED_DIM).fill(0);

  return {
    async run(frame: HoloMapMicroFrame, config: HoloMapMicroConfig): Promise<Float32Array> {
      const rng = mulberry32(hashConfigSeed(config) ^ (0x9e3779b9 * (frame.index + 1)));
      const proj = new Float32Array(EMBED_DIM * PATCH_LEN);
      const Wq = new Float32Array(EMBED_DIM * EMBED_DIM);
      const Wk = new Float32Array(EMBED_DIM * EMBED_DIM);
      const Wv = new Float32Array(EMBED_DIM * EMBED_DIM);
      const Wxyz = new Float32Array(EMBED_DIM * 3);
      fillGaussian2D(proj, rng, 0.02);
      fillGaussian2D(Wq, rng, 0.02);
      fillGaussian2D(Wk, rng, 0.02);
      fillGaussian2D(Wv, rng, 0.02);
      fillGaussian2D(Wxyz, rng, 0.05);

      const image = frameToMicroImage(frame);
      let tokens = await patchEmbed.run(image, proj, {
        imgH: MICRO,
        imgW: MICRO,
        patchH: MICRO,
        patchW: MICRO,
        numChannels: 3,
        embedDim: EMBED_DIM,
      });
      tokens = await layerNorm.run(tokens, gamma1, beta1);

      const qFlat = await gemm.run(tokens, Wq, 1, EMBED_DIM, EMBED_DIM);
      const kFlat = await gemm.run(tokens, Wk, 1, EMBED_DIM, EMBED_DIM);
      const vFlat = await gemm.run(tokens, Wv, 1, EMBED_DIM, EMBED_DIM);

      const q3 = await rope.run(qFlat, { seqLen: 1, numHeads: NUM_HEADS, headDim: HEAD_DIM, posOffset: frame.index });
      const k3 = await rope.run(kFlat, { seqLen: 1, numHeads: NUM_HEADS, headDim: HEAD_DIM, posOffset: frame.index });

      let attn = await fusedMha.run(q3, k3, vFlat, {
        numHeads: NUM_HEADS,
        qLen: 1,
        kLen: 1,
        dHead: HEAD_DIM,
        vHead: HEAD_DIM,
      });
      attn = await layerNorm.run(attn, gamma2, beta2);
      attn = await gelu.run(attn);
      return gemm.run(attn, Wxyz, 1, EMBED_DIM, 3);
    },
  };
}

/** CPU fallback when WebGPU device is unavailable (matches micro-encoder layout). */
export async function runHoloMapMicroEncoderCpu(
  frame: HoloMapMicroFrame,
  config: HoloMapMicroConfig,
): Promise<Float32Array> {
  const rng = mulberry32(hashConfigSeed(config) ^ (0x9e3779b9 * (frame.index + 1)));
  const proj = new Float32Array(EMBED_DIM * PATCH_LEN);
  const Wq = new Float32Array(EMBED_DIM * EMBED_DIM);
  const Wk = new Float32Array(EMBED_DIM * EMBED_DIM);
  const Wv = new Float32Array(EMBED_DIM * EMBED_DIM);
  const Wxyz = new Float32Array(EMBED_DIM * 3);
  fillGaussian2D(proj, rng, 0.02);
  fillGaussian2D(Wq, rng, 0.02);
  fillGaussian2D(Wk, rng, 0.02);
  fillGaussian2D(Wv, rng, 0.02);
  fillGaussian2D(Wxyz, rng, 0.05);

  const image = frameToMicroImage(frame);
  let tokens = patchEmbedCpu(image, proj, EMBED_DIM);
  const gamma1 = new Float32Array(EMBED_DIM).fill(1);
  const beta1 = new Float32Array(EMBED_DIM).fill(0);
  const gamma2 = new Float32Array(EMBED_DIM).fill(1);
  const beta2 = new Float32Array(EMBED_DIM).fill(0);
  tokens = layerNormCpu(tokens, gamma1, beta1, 1, EMBED_DIM);

  const qFlat = gemmCpu(tokens, Wq, 1, EMBED_DIM, EMBED_DIM);
  const kFlat = gemmCpu(tokens, Wk, 1, EMBED_DIM, EMBED_DIM);
  const vFlat = gemmCpu(tokens, Wv, 1, EMBED_DIM, EMBED_DIM);

  const qR = ropeCpuSync(qFlat, 1, NUM_HEADS, HEAD_DIM, frame.index);
  const kR = ropeCpuSync(kFlat, 1, NUM_HEADS, HEAD_DIM, frame.index);

  let attn = mhaCpu(qR, kR, vFlat, NUM_HEADS, 1, 1, HEAD_DIM, HEAD_DIM);
  attn = layerNormCpu(attn, gamma2, beta2, 1, EMBED_DIM);
  attn = geluCpu(attn);
  return gemmCpu(attn, Wxyz, 1, EMBED_DIM, 3);
}
