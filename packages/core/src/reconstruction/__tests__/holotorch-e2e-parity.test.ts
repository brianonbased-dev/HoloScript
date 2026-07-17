/**
 * holotorch-e2e-parity.test.ts — HoloTorch END-TO-END logit parity vs torch.
 *
 * The forcing function (D.128/D.129, founder-promoted 2026-07-17): torch-at-
 * inference is retired per model only when an op-by-op / end-to-end logit-parity
 * receipt proves the sovereign WGSL runtime matches torch on a real checkpoint.
 *
 * This is that end-to-end receipt: it loads a torch fixture (real HoloRunner-S0
 * weights mapped to the [in,out] convention + torch's reference logits, produced by
 * ai-ecosystem/scripts/holotorch-export-parity-fixture.py), runs the WGSL HoloTorch
 * model on the SAME weights, and asserts the logits match and argmax agrees at every
 * position (the property that governs greedy decoding).
 *
 * Skips honestly if the fixture is absent (it lives in gitignored .scratch — regen
 * with the exporter) or there is no GPU. The receipt is the durable artifact.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHoloTorchModel, type ModelWeights } from '../holotorch/holoTorchModel';
import type { BlockWeights } from '../holotorch/decoderBlock';
import { getWebGpuDevice, compareAllClose, writeParityReceipt, getAdapterInfo } from './holotorchParityHarness';

interface FixtureManifest {
  config: { nLayer: number; nHead: number; nEmbd: number; vocab: number; seqLen: number };
  ids: number[];
  tensors: { name: string; shape: number[]; offset: number; length: number }[];
  logits: number[];
  source_ckpt: string;
}

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '.scratch', 'holotorch-fixtures', 'holorunner-s0-smoke');

describe('HoloTorch end-to-end logit parity (WGSL vs torch, real checkpoint)', () => {
  it('WGSL forward pass matches torch logits and argmax on a real holo checkpoint', async () => {
    if (!existsSync(join(FIXTURE_DIR, 'fixture.json'))) {
      console.warn(`[holotorch-parity] fixture absent (${FIXTURE_DIR}) — skipping e2e (regen with holotorch-export-parity-fixture.py)`);
      return;
    }
    const device = await getWebGpuDevice();
    if (!device) {
      console.warn('[holotorch-parity] no WebGPU adapter — skipping e2e');
      return;
    }

    const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'fixture.json'), 'utf-8')) as FixtureManifest;
    const bin = readFileSync(join(FIXTURE_DIR, 'fixture.bin'));
    // Aligned copy: Node Buffer's byteOffset into its pool may not be 4-aligned.
    const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
    const f32 = new Float32Array(ab);
    const get = (name: string): Float32Array => {
      const tsr = manifest.tensors.find((x) => x.name === name);
      if (!tsr) throw new Error(`fixture missing tensor ${name}`);
      const start = tsr.offset / 4; // manifest offset is in bytes, length in elements
      return f32.slice(start, start + tsr.length);
    };

    const { nLayer, nHead, nEmbd, vocab, seqLen: T } = manifest.config;
    const blocks: BlockWeights[] = Array.from({ length: nLayer }, (_, b) => ({
      ln1g: get(`block${b}.ln1g`),
      ln1b: get(`block${b}.ln1b`),
      wqkv: get(`block${b}.wqkv`),
      bqkv: get(`block${b}.bqkv`),
      wproj: get(`block${b}.wproj`),
      bproj: get(`block${b}.bproj`),
      ln2g: get(`block${b}.ln2g`),
      ln2b: get(`block${b}.ln2b`),
      wfc1: get(`block${b}.wfc1`),
      bfc1: get(`block${b}.bfc1`),
      wfc2: get(`block${b}.wfc2`),
      bfc2: get(`block${b}.bfc2`),
    }));
    const w: ModelWeights = { wte: get('wte'), wpe: get('wpe'), blocks, lnfg: get('lnfg'), lnfb: get('lnfb') };
    const ids = Uint32Array.from(manifest.ids);
    const refLogits = Float64Array.from(manifest.logits); // [T * vocab]

    const model = createHoloTorchModel(device);
    const got = await model.run(ids, w, { nEmbd, nHead, vocab });
    expect(got.length).toBe(T * vocab);

    // erf A&S (~1.5e-7) + fp32 accumulation through nLayer layers vs torch fp32 → loose logit tolerance;
    // the load-bearing property is argmax agreement (greedy decode).
    const cmp = compareAllClose(got, refLogits, 5e-3, 1e-2);
    let argmaxAgree = 0;
    for (let ti = 0; ti < T; ti++) {
      let gi = 0;
      let ri = 0;
      let gm = -Infinity;
      let rm = -Infinity;
      for (let vv = 0; vv < vocab; vv++) {
        if (got[ti * vocab + vv] > gm) {
          gm = got[ti * vocab + vv];
          gi = vv;
        }
        if (refLogits[ti * vocab + vv] > rm) {
          rm = refLogits[ti * vocab + vv];
          ri = vv;
        }
      }
      if (gi === ri) argmaxAgree++;
    }

    console.warn(
      `[holotorch-parity]   e2e [L${nLayer} T${T} d${nEmbd} v${vocab}] relToScale=${cmp.relToScale.toExponential(2)} maxAbs=${cmp.maxAbs.toExponential(2)} argmaxAgree=${argmaxAgree}/${T} allClose=${cmp.allClose}`
    );
    const verdict = argmaxAgree === T && cmp.maxAbs < 5e-2 ? 'pass' : 'fail';
    writeParityReceipt('model-e2e', {
      sourceCkpt: manifest.source_ckpt,
      config: manifest.config,
      ...cmp,
      argmaxAgree,
      argmaxTotal: T,
      verdict,
      note: `adapter ${getAdapterInfo().device ?? '?'}; REAL checkpoint weights vs torch GPT.forward reference logits — the D.128/D.129 forcing-function receipt.`,
    });

    expect(argmaxAgree).toBe(T);
    expect(verdict).toBe('pass');
  }, 180000);
});
