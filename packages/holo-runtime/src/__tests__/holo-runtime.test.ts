import { describe, expect, it } from 'vitest';
import {
  HOLO_RUNTIME_MODEL_FLEET_NODE_KIND,
  HoloRuntimeDecoder,
  createSeededRng,
  geluErf,
  geluTanhApprox,
  loadHoloRunnerS0StateDict,
  loadHoloRunnerTokenizer,
  matmul,
  sampleFromLogits,
  softmaxArray,
  type HoloRunnerS0StateDictInput,
} from '../index.js';

const config = { vocab_size: 8, n_layer: 1, n_head: 2, n_embd: 4, block_size: 4 };

function seq(length: number, scale: number, offset: number): number[] {
  return Array.from({ length }, (_, index) => (((index * 37 + offset) % 23) - 11) * scale);
}

function tinyState(): HoloRunnerS0StateDictInput {
  const vocab = config.vocab_size;
  const width = config.n_embd;
  const block = config.block_size;
  const head = seq(vocab * width, 0.031, 3);
  return {
    config,
    state: {
      'tok.weight': { shape: [vocab, width], data: head },
      'pos.weight': { shape: [block, width], data: seq(block * width, 0.017, 5) },
      'blocks.0.ln1.weight': {
        shape: [width],
        data: seq(width, 0.007, 2).map((value) => 1 + value),
      },
      'blocks.0.ln1.bias': { shape: [width], data: seq(width, 0.011, 4) },
      'blocks.0.attn.in_proj_weight': {
        shape: [3 * width, width],
        data: seq(3 * width * width, 0.013, 7),
      },
      'blocks.0.attn.in_proj_bias': { shape: [3 * width], data: seq(3 * width, 0.019, 11) },
      'blocks.0.attn.out_proj.weight': {
        shape: [width, width],
        data: seq(width * width, 0.015, 13),
      },
      'blocks.0.attn.out_proj.bias': { shape: [width], data: seq(width, 0.021, 17) },
      'blocks.0.ln2.weight': {
        shape: [width],
        data: seq(width, 0.006, 3).map((value) => 1 + value),
      },
      'blocks.0.ln2.bias': { shape: [width], data: seq(width, 0.01, 5) },
      'blocks.0.mlp.0.weight': {
        shape: [4 * width, width],
        data: seq(4 * width * width, 0.009, 19),
      },
      'blocks.0.mlp.0.bias': { shape: [4 * width], data: seq(4 * width, 0.014, 23) },
      'blocks.0.mlp.2.weight': {
        shape: [width, 4 * width],
        data: seq(width * 4 * width, 0.008, 29),
      },
      'blocks.0.mlp.2.bias': { shape: [width], data: seq(width, 0.012, 31) },
      'lnf.weight': { shape: [width], data: seq(width, 0.005, 37).map((value) => 1 + value) },
      'lnf.bias': { shape: [width], data: seq(width, 0.009, 41) },
      'head.weight': { shape: [vocab, width], data: head },
    },
  };
}

function maxAbsDiff(left: Float32Array | readonly number[], right: readonly number[]): number {
  return right.reduce(
    (max, expected, index) => Math.max(max, Math.abs((left[index] ?? 0) - expected)),
    0
  );
}

describe('@holoscript/holo-runtime', () => {
  it('loads HoloRunner S0 state_dict keys and rejects missing tensors', () => {
    const loaded = loadHoloRunnerS0StateDict(tinyState());
    expect(loaded.config).toMatchObject({
      vocabSize: 8,
      nLayer: 1,
      nHead: 2,
      nEmbd: 4,
      blockSize: 4,
    });
    expect(loaded.sourceKeys).toContain('blocks.0.attn.in_proj_weight');

    const broken = tinyState();
    delete broken.state?.['blocks.0.mlp.2.bias'];
    expect(() => loadHoloRunnerS0StateDict(broken)).toThrow(/blocks\.0\.mlp\.2\.bias/);
  });

  it('matches the PyTorch CPU oracle logits for the M1 S0 fixture', () => {
    const decoder = new HoloRuntimeDecoder(loadHoloRunnerS0StateDict(tinyState()));
    const result = decoder.forward([1, 3, 2]);
    const expected = [
      -0.6376499533653259, 0.3817121088504791, -0.6409199237823486, 0.3784421682357788,
      -0.5552136898040771, 0.3806498050689697, 0.386072039604187, 0.377379834651947,
      -0.724768340587616, 0.5854339003562927, -0.7311644554138184, 0.5790378451347351,
      -0.4141300618648529, -0.05514592304825783, 0.5939620137214661, -0.061541974544525146,
      0.8667529225349426, -0.38662588596343994, 0.8748753666877747, -0.3785035014152527,
      -0.20547571778297424, 0.2020435482263565, -0.3974558115005493, 0.21016593277454376,
    ];

    expect(result.shape).toEqual([3, 8]);
    expect(maxAbsDiff(result.logits, expected)).toBeLessThan(0.0002);
  });

  it('keeps KV-cache decoding aligned with full causal attention for the last token', () => {
    const decoder = new HoloRuntimeDecoder(loadHoloRunnerS0StateDict(tinyState()));
    const full = decoder.logitsForLastToken([1, 3, 2]);
    const cached = decoder.prefill([1, 3, 2]).logits;

    expect(maxAbsDiff(cached, Array.from(full))).toBeLessThan(0.00001);
  });

  it('exposes CPU kernels and confirms PyTorch GELU is erf, not tanh approximation', () => {
    expect(
      Array.from(matmul(new Float32Array([1, 2, 3, 4]), 2, 2, new Float32Array([5, 6, 7, 8]), 2))
    ).toEqual([19, 22, 43, 50]);
    expect(softmaxArray([0, 0])).toEqual([0.5, 0.5]);

    const erfExpected = [
      -0.13206221163272858, -0.1542687714099884, 0, 0.5800294876098633, 1.3997890949249268,
    ];
    const values = [-1.25, -0.5, 0, 0.75, 1.5];
    const erfValues = values.map(geluErf);
    const tanhValues = values.map(geluTanhApprox);
    expect(maxAbsDiff(erfValues, erfExpected)).toBeLessThan(0.0005);
    expect(Math.abs(erfValues[0]! - tanhValues[0]!)).toBeGreaterThan(0.0001);
  });

  it('samples deterministically and advertises itself as a model_fleet node kind', () => {
    const sample = sampleFromLogits(new Float32Array([0.1, 0.9, 0.2]), {
      topK: 2,
      temperature: 1,
      rng: createSeededRng(1783305647),
    });

    expect(sample.candidates.map((candidate) => candidate.tokenId)).toEqual([1, 2]);
    expect(HOLO_RUNTIME_MODEL_FLEET_NODE_KIND).toMatchObject({
      kind: 'holo-runtime-m1-cpu-decoder',
      backend: 'pure-ts-cpu',
      package: '@holoscript/holo-runtime',
    });
  });

  it('imports holorunner-tokenizer-v0.mjs directly for encode/decode fidelity', async () => {
    const tokenizer = await loadHoloRunnerTokenizer();
    const merges: Array<[string, string, string]> = [['97', '98', '97+98']];
    const tokens = tokenizer.encode('ab ab', merges);

    expect(tokenizer.modulePath.replace(/\\/g, '/')).toContain(
      '/.ai-ecosystem/scripts/holorunner-tokenizer-v0.mjs'
    );
    expect(tokenizer.decode(tokens)).toBe('ab ab');
    expect(tokenizer.decodeIdsToText(tokenizer.encodeTextToIds('ab', merges), merges)).toBe('ab');
  });
});
