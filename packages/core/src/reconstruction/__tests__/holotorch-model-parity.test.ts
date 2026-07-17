/**
 * holotorch-model-parity.test.ts — full holo forward-pass assembly parity.
 *
 * Composes embed → N decoder blocks → final LayerNorm → weight-tied LM head
 * (holoTorchModel.ts) and compares the [T, vocab] logits against an f64 reference
 * on the RTX 3060, with RANDOM weights. This proves the FULL forward-pass wiring
 * (multi-layer stacking, final LN, tied head transpose) end-to-end. Real weights
 * arrive via the checkpoint adapter (separate); this is the last wiring milestone
 * before cross-language torch parity. GPU-less → honest skip.
 */
import { describe, it, expect } from 'vitest';
import { createHoloTorchModel, type ModelWeights } from '../holotorch/holoTorchModel';
import type { BlockWeights } from '../holotorch/decoderBlock';
import { refBlock, refLayerNorm } from './holotorchReferences';
import { getWebGpuDevice, compareAllClose, writeParityReceipt, rng, getAdapterInfo } from './holotorchParityHarness';

function randArray(rand: () => number, n: number, scale = 1): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = rand() * scale;
  return a;
}

function randBlock(rand: () => number, nEmbd: number): BlockWeights {
  const g = (n: number): Float32Array => randArray(rand, n, 0.2).map((z) => 1 + z) as Float32Array;
  const b = (n: number): Float32Array => randArray(rand, n, 0.1);
  const inv = 1 / Math.sqrt(nEmbd);
  const inv4 = 1 / Math.sqrt(4 * nEmbd);
  return {
    ln1g: g(nEmbd),
    ln1b: b(nEmbd),
    wqkv: randArray(rand, nEmbd * 3 * nEmbd, inv),
    bqkv: b(3 * nEmbd),
    wproj: randArray(rand, nEmbd * nEmbd, inv),
    bproj: b(nEmbd),
    ln2g: g(nEmbd),
    ln2b: b(nEmbd),
    wfc1: randArray(rand, nEmbd * 4 * nEmbd, inv),
    bfc1: b(4 * nEmbd),
    wfc2: randArray(rand, 4 * nEmbd * nEmbd, inv4),
    bfc2: b(nEmbd),
  };
}

/** f64 reference for the full model: embed → blocks → final LN → tied head → [T, vocab] logits. */
function refModel(ids: Uint32Array, w: ModelWeights, T: number, nEmbd: number, nHead: number, vocab: number): Float64Array {
  let x = new Float64Array(T * nEmbd);
  for (let t = 0; t < T; t++) {
    for (let d = 0; d < nEmbd; d++) x[t * nEmbd + d] = w.wte[ids[t] * nEmbd + d] + w.wpe[t * nEmbd + d];
  }
  for (const bw of w.blocks) x = refBlock(Float32Array.from(x), bw, T, nEmbd, nHead);
  const xn = refLayerNorm(Float32Array.from(x), w.lnfg, w.lnfb, T, nEmbd);
  const logits = new Float64Array(T * vocab);
  for (let t = 0; t < T; t++) {
    for (let v = 0; v < vocab; v++) {
      let acc = 0;
      for (let d = 0; d < nEmbd; d++) acc += xn[t * nEmbd + d] * w.wte[v * nEmbd + d];
      logits[t * vocab + v] = acc;
    }
  }
  return logits;
}

describe('HoloTorch full-model assembly parity (WGSL vs f64 reference, real GPU)', () => {
  it('full forward pass logits match f64 reference (nLayer=2, holo dims)', async () => {
    const device = await getWebGpuDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping model');
      return;
    }
    const model = createHoloTorchModel(device);
    const rand = rng(41);
    const nLayer = 2;
    const nEmbd = 384;
    const nHead = 6;
    const vocab = 562;
    const T = 8;

    const w: ModelWeights = {
      wte: randArray(rand, vocab * nEmbd, 0.05),
      wpe: randArray(rand, T * nEmbd, 0.05),
      blocks: Array.from({ length: nLayer }, () => randBlock(rand, nEmbd)),
      lnfg: randArray(rand, nEmbd, 0.2).map((z) => 1 + z) as Float32Array,
      lnfb: randArray(rand, nEmbd, 0.1),
    };
    const ids = new Uint32Array(T);
    for (let t = 0; t < T; t++) ids[t] = Math.floor((rand() * 0.5 + 0.5) * vocab) % vocab;

    const got = await model.run(ids, w, { nEmbd, nHead, vocab });
    const ref = refModel(ids, w, T, nEmbd, nHead, vocab);
    // Deep composition (2 layers × 7 ops + head) → looser fp32 tolerance.
    const cmp = compareAllClose(got, ref, 2e-3, 5e-3);

    // Also check argmax agreement per position — the property that actually matters for sampling.
    let argmaxAgree = 0;
    for (let t = 0; t < T; t++) {
      let gi = 0;
      let ri = 0;
      let gm = -Infinity;
      let rm = -Infinity;
      for (let v = 0; v < vocab; v++) {
        if (got[t * vocab + v] > gm) {
          gm = got[t * vocab + v];
          gi = v;
        }
        if (ref[t * vocab + v] > rm) {
          rm = ref[t * vocab + v];
          ri = v;
        }
      }
      if (gi === ri) argmaxAgree++;
    }

    console.warn(
      `[holotorch-parity]   model [L${nLayer} T${T} d${nEmbd} v${vocab}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} argmaxAgree=${argmaxAgree}/${T} allClose=${cmp.allClose}`
    );
    writeParityReceipt('model', {
      dims: { nLayer, seqLen: T, nEmbd, nHead, vocab },
      ...cmp,
      argmaxAgree,
      argmaxTotal: T,
      verdict: cmp.allClose ? 'pass' : 'fail',
      note: `adapter ${getAdapterInfo().device ?? '?'}; random weights (real weights via ckpt adapter, separate piece).`,
    });
    expect(got.length).toBe(T * vocab);
    expect(cmp.allClose).toBe(true);
    expect(argmaxAgree).toBe(T);
  }, 180000);
});
