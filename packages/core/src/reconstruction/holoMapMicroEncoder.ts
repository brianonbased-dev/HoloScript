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
  /**
   * Optional trained-checkpoint bytes in the `HMW1` format
   * (see {@link serializeMicroWeights}). When present and valid, these weights
   * are used INSTEAD of the deterministic PRNG-synthesized weights. When absent
   * or malformed, the encoder falls back to PRNG weights (a malformed blob logs
   * a warning rather than being silently discarded — that silent discard was the
   * original loader↔encoder disconnect).
   */
  weightBytes?: Uint8Array | ArrayBuffer | null;
}

export interface HoloMapMicroWeights {
  proj: Float32Array;
  Wq: Float32Array;
  Wk: Float32Array;
  Wv: Float32Array;
  Wxyz: Float32Array;
  gamma1: Float32Array;
  beta1: Float32Array;
  gamma2: Float32Array;
  beta2: Float32Array;
}

const weightCache = new Map<string, HoloMapMicroWeights>();
const weightBlobKeyCache = new WeakMap<object, string>();

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

function microWeightKey(config: HoloMapMicroConfig): string {
  return `${config.seed}\0${config.modelHash || ''}`;
}

// ── Checkpoint (de)serialization — `HMW1` format ─────────────────────────────
// Header: 4-byte magic 'HMW1' + uint32 LE version, then the 9 weight tensors as
// float32 LE in fixed order: proj, Wq, Wk, Wv, Wxyz, gamma1, beta1, gamma2, beta2.
// A trainer/exporter writes this exact layout; the encoder reads it here.
const MICRO_WEIGHT_MAGIC = [0x48, 0x4d, 0x57, 0x31] as const; // 'HMW1'
const MICRO_WEIGHT_VERSION = 1;
const MICRO_WEIGHT_FLOATS =
  EMBED_DIM * PATCH_LEN + // proj
  3 * EMBED_DIM * EMBED_DIM + // Wq, Wk, Wv
  EMBED_DIM * 3 + // Wxyz
  4 * EMBED_DIM; // gamma1, beta1, gamma2, beta2
const MICRO_WEIGHT_BYTES = 8 + MICRO_WEIGHT_FLOATS * 4;

function toUint8(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/** FNV-1a hash of the blob — used only to key distinct checkpoints in the cache. */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function cachedWeightBlobKey(input: Uint8Array | ArrayBuffer): { bytes: Uint8Array; key: string } {
  const bytes = toUint8(input);
  const cached = weightBlobKeyCache.get(input);
  if (cached) return { bytes, key: cached };
  const key = `${bytes.byteLength}:${fnv1a(bytes)}`;
  weightBlobKeyCache.set(input, key);
  return { bytes, key };
}

/** Serialize micro-weights to the canonical `HMW1` checkpoint blob. */
export function serializeMicroWeights(w: HoloMapMicroWeights): Uint8Array {
  const bytes = new Uint8Array(MICRO_WEIGHT_BYTES);
  bytes.set(MICRO_WEIGHT_MAGIC, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, MICRO_WEIGHT_VERSION, true);
  let off = 8;
  const put = (arr: Float32Array): void => {
    for (let i = 0; i < arr.length; i += 1) {
      view.setFloat32(off, arr[i]!, true);
      off += 4;
    }
  };
  put(w.proj);
  put(w.Wq);
  put(w.Wk);
  put(w.Wv);
  put(w.Wxyz);
  put(w.gamma1);
  put(w.beta1);
  put(w.gamma2);
  put(w.beta2);
  return bytes;
}

/** Parse an `HMW1` checkpoint blob, or return null if it is not a valid one. */
export function deserializeMicroWeights(
  input: Uint8Array | ArrayBuffer
): HoloMapMicroWeights | null {
  const bytes = toUint8(input);
  if (bytes.byteLength !== MICRO_WEIGHT_BYTES) return null;
  for (let i = 0; i < 4; i += 1) {
    if (bytes[i] !== MICRO_WEIGHT_MAGIC[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== MICRO_WEIGHT_VERSION) return null;
  let off = 8;
  const take = (count: number): Float32Array => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      out[i] = view.getFloat32(off, true);
      off += 4;
    }
    return out;
  };
  return {
    proj: take(EMBED_DIM * PATCH_LEN),
    Wq: take(EMBED_DIM * EMBED_DIM),
    Wk: take(EMBED_DIM * EMBED_DIM),
    Wv: take(EMBED_DIM * EMBED_DIM),
    Wxyz: take(EMBED_DIM * 3),
    gamma1: take(EMBED_DIM),
    beta1: take(EMBED_DIM),
    gamma2: take(EMBED_DIM),
    beta2: take(EMBED_DIM),
  };
}

function getMicroWeights(config: HoloMapMicroConfig): HoloMapMicroWeights {
  // Trained-checkpoint path: if weight bytes are supplied, deserialize and USE
  // them (this is the loader↔encoder wiring that was previously missing — bytes
  // were loaded by HoloMapRuntime and then discarded). Fall back to PRNG only if
  // the blob is absent or malformed.
  if (config.weightBytes) {
    const { bytes: wb, key: blobKey } = cachedWeightBlobKey(config.weightBytes);
    const ckptKey = `${microWeightKey(config)}\0ckpt:${blobKey}`;
    const cachedReal = weightCache.get(ckptKey);
    if (cachedReal) return cachedReal;
    const real = deserializeMicroWeights(wb);
    if (real) {
      weightCache.set(ckptKey, real);
      return real;
    }
    // Loud, not silent: a checkpoint was provided but is not a valid HMW1 blob.
    // The original bug discarded this without a trace, so the model ran on noise
    // while reporting a loaded checkpoint.
    console.warn(
      `[holoMapMicroEncoder] weightBytes present (${wb.byteLength} B) but not a valid HMW1 checkpoint ` +
        `(expected ${MICRO_WEIGHT_BYTES} B + magic) — falling back to PRNG-synthesized weights.`
    );
  }

  const key = microWeightKey(config);
  const cached = weightCache.get(key);
  if (cached) return cached;

  const rng = mulberry32(hashConfigSeed(config));
  const weights: HoloMapMicroWeights = {
    proj: new Float32Array(EMBED_DIM * PATCH_LEN),
    Wq: new Float32Array(EMBED_DIM * EMBED_DIM),
    Wk: new Float32Array(EMBED_DIM * EMBED_DIM),
    Wv: new Float32Array(EMBED_DIM * EMBED_DIM),
    Wxyz: new Float32Array(EMBED_DIM * 3),
    gamma1: new Float32Array(EMBED_DIM).fill(1),
    beta1: new Float32Array(EMBED_DIM).fill(0),
    gamma2: new Float32Array(EMBED_DIM).fill(1),
    beta2: new Float32Array(EMBED_DIM).fill(0),
  };
  fillGaussian2D(weights.proj, rng, 0.02);
  fillGaussian2D(weights.Wq, rng, 0.02);
  fillGaussian2D(weights.Wk, rng, 0.02);
  fillGaussian2D(weights.Wv, rng, 0.02);
  fillGaussian2D(weights.Wxyz, rng, 0.05);
  weightCache.set(key, weights);
  return weights;
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

function layerNormCpu(
  x: Float32Array,
  gamma: Float32Array,
  beta: Float32Array,
  rows: number,
  d: number
): Float32Array {
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
  vHead: number
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

function ropeCpuSync(
  q: Float32Array,
  seqLen: number,
  numHeads: number,
  headDim: number,
  posOffset: number
): Float32Array {
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

  return {
    async run(frame: HoloMapMicroFrame, config: HoloMapMicroConfig): Promise<Float32Array> {
      const weights = getMicroWeights(config);
      const image = frameToMicroImage(frame);
      let tokens = await patchEmbed.run(image, weights.proj, {
        imgH: MICRO,
        imgW: MICRO,
        patchH: MICRO,
        patchW: MICRO,
        numChannels: 3,
        embedDim: EMBED_DIM,
      });
      tokens = await layerNorm.run(tokens, weights.gamma1, weights.beta1);

      const qFlat = await gemm.run(tokens, weights.Wq, 1, EMBED_DIM, EMBED_DIM);
      const kFlat = await gemm.run(tokens, weights.Wk, 1, EMBED_DIM, EMBED_DIM);
      const vFlat = await gemm.run(tokens, weights.Wv, 1, EMBED_DIM, EMBED_DIM);

      const q3 = await rope.run(qFlat, {
        seqLen: 1,
        numHeads: NUM_HEADS,
        headDim: HEAD_DIM,
        posOffset: frame.index,
      });
      const k3 = await rope.run(kFlat, {
        seqLen: 1,
        numHeads: NUM_HEADS,
        headDim: HEAD_DIM,
        posOffset: frame.index,
      });

      let attn = await fusedMha.run(q3, k3, vFlat, {
        numHeads: NUM_HEADS,
        qLen: 1,
        kLen: 1,
        dHead: HEAD_DIM,
        vHead: HEAD_DIM,
      });
      attn = await layerNorm.run(attn, weights.gamma2, weights.beta2);
      attn = await gelu.run(attn);
      return gemm.run(attn, weights.Wxyz, 1, 3, EMBED_DIM);
    },
  };
}

/** CPU fallback when WebGPU device is unavailable (matches micro-encoder layout). */
export async function runHoloMapMicroEncoderCpu(
  frame: HoloMapMicroFrame,
  config: HoloMapMicroConfig
): Promise<Float32Array> {
  const weights = getMicroWeights(config);
  const image = frameToMicroImage(frame);
  let tokens = patchEmbedCpu(image, weights.proj, EMBED_DIM);
  tokens = layerNormCpu(tokens, weights.gamma1, weights.beta1, 1, EMBED_DIM);

  const qFlat = gemmCpu(tokens, weights.Wq, 1, EMBED_DIM, EMBED_DIM);
  const kFlat = gemmCpu(tokens, weights.Wk, 1, EMBED_DIM, EMBED_DIM);
  const vFlat = gemmCpu(tokens, weights.Wv, 1, EMBED_DIM, EMBED_DIM);

  const qR = ropeCpuSync(qFlat, 1, NUM_HEADS, HEAD_DIM, frame.index);
  const kR = ropeCpuSync(kFlat, 1, NUM_HEADS, HEAD_DIM, frame.index);

  let attn = mhaCpu(qR, kR, vFlat, NUM_HEADS, 1, 1, HEAD_DIM, HEAD_DIM);
  attn = layerNormCpu(attn, weights.gamma2, weights.beta2, 1, EMBED_DIM);
  attn = geluCpu(attn);
  return gemmCpu(attn, weights.Wxyz, 1, EMBED_DIM, 3);
}
