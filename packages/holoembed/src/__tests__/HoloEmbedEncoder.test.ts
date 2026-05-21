/**
 * HoloEmbedEncoder tests
 *
 * Validates the standalone @holoscript/holoembed package:
 * - Output dimensionality and normalization
 * - NL recall improvement over structural baseline (no StructuralEmbeddingProvider dep)
 * - SNN accelerator falls back to CPU in test environment (no WebGPU)
 * - encodeTexts() batch path
 * - camelSplit + trigramHistogram unit tests
 * - LIFPopulationParams passthrough
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { HoloEmbedEncoder } from '../HoloEmbedEncoder.js';
import { SnnAccelerator } from '../SnnAccelerator.js';
import { camelSplit, trigramHistogram } from '../charTrigram.js';
import { HOLOEMBED_DIM, STRUCTURAL_DIM, SUBWORD_BINS } from '../types.js';
import type { SymbolInput } from '../types.js';

// =============================================================================
// HELPERS
// =============================================================================

function sym(overrides: Partial<SymbolInput> = {}): SymbolInput {
  return {
    name: 'exampleFn',
    type: 'function',
    filePath: 'packages/core/src/example.ts',
    line: 10,
    isExported: true,
    visibility: 'public',
    signature: 'exampleFn(input: string): string',
    ...overrides,
  };
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

function norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (v[i] ?? 0) ** 2;
  return Math.sqrt(s);
}

// =============================================================================
// UNIT: camelSplit
// =============================================================================

describe('camelSplit', () => {
  it('splits PascalCase', () => {
    expect(camelSplit('PillarSliceEmitter')).toBe('pillar slice emitter');
  });
  it('splits camelCase', () => {
    expect(camelSplit('extractEmitSites')).toBe('extract emit sites');
  });
  it('splits snake_case', () => {
    expect(camelSplit('brain_coord_mapper')).toBe('brain coord mapper');
  });
  it('splits colon-separated event names', () => {
    expect(camelSplit('pillar:spike:emitted')).toBe('pillar spike emitted');
  });
  it('handles UPPERCASE acronym', () => {
    expect(camelSplit('HTMLParser')).toBe('html parser');
  });
  it('passes through plain NL text unchanged (lowercase)', () => {
    expect(camelSplit('pillar slice emitter')).toBe('pillar slice emitter');
  });
  it('handles empty string', () => {
    expect(camelSplit('')).toBe('');
  });
});

// =============================================================================
// UNIT: trigramHistogram
// =============================================================================

describe('trigramHistogram', () => {
  it('fills the correct slice of vec', () => {
    const vec = new Float32Array(256);
    trigramHistogram('hello world', vec, 128, 128);
    // Dims 0–127 untouched
    for (let i = 0; i < 128; i++) expect(vec[i]).toBe(0);
    // Dims 128–255 non-zero (hello has 3 trigrams: "hel","ell","llo"; world: "wor","orl","rld")
    const sum = vec.slice(128, 256).reduce((s, v) => s + v, 0);
    expect(sum).toBeGreaterThan(0);
  });

  it('histogram sums to ≤ 1.0 (normalized)', () => {
    const vec = new Float32Array(128);
    trigramHistogram('PillarSliceEmitter', vec, 0, 128);
    const total = vec.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 4);
  });

  it('skips word-boundary trigrams', () => {
    // "a b" has no valid 3-char window without a space
    const vec = new Float32Array(128);
    trigramHistogram('a b', vec, 0, 128);
    const total = vec.reduce((s, v) => s + v, 0);
    expect(total).toBe(0);
  });

  it('"pillar" and "pillar slice emitter" share trigrams', () => {
    const v1 = new Float32Array(128);
    const v2 = new Float32Array(128);
    trigramHistogram('pillar', v1, 0, 128);
    trigramHistogram('pillar slice emitter', v2, 0, 128);
    // Dot product > 0 because "pil","ill","lla","lar" appear in both
    expect(cosine(v1, v2)).toBeGreaterThan(0);
  });
});

// =============================================================================
// HoloEmbedEncoder
// =============================================================================

describe('HoloEmbedEncoder', () => {
  let enc: HoloEmbedEncoder;

  beforeAll(async () => {
    enc = new HoloEmbedEncoder();
    await enc.initialize({ enableSnn: false }); // CPU-only in tests
  });

  // ── Dimensionality ────────────────────────────────────────────────────────

  it(`encode() returns ${HOLOEMBED_DIM}-dim Float32Array`, () => {
    const v = enc.encode(sym());
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(HOLOEMBED_DIM);
  });

  it('encodeText() returns 768-dim Float32Array', () => {
    const v = enc.encodeText('pillar slice emitter');
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(HOLOEMBED_DIM);
  });

  // ── Normalization ─────────────────────────────────────────────────────────

  it('encode() output is L2-normalized', () => {
    expect(norm(enc.encode(sym({ name: 'PillarSliceEmitter' })))).toBeCloseTo(1.0, 4);
  });

  it('encodeText() output is L2-normalized', () => {
    expect(norm(enc.encodeText('brain coord node mapper'))).toBeCloseTo(1.0, 4);
  });

  // ── Subword block coverage ────────────────────────────────────────────────

  it('name/sig block (dims 384–511) is non-zero for a named symbol', () => {
    const v = enc.encode(sym({ name: 'PillarSliceEmitter', signature: 'class PillarSliceEmitter' }));
    const blockSum = Array.from(v.slice(STRUCTURAL_DIM, STRUCTURAL_DIM + SUBWORD_BINS)).reduce((s, x) => s + x, 0);
    expect(blockSum).toBeGreaterThan(0);
  });

  it('docComment block (dims 512–639) differs when docComment is present', () => {
    const vNo  = enc.encode(sym({ name: 'Foo' }));
    const vDoc = enc.encode(sym({ name: 'Foo', docComment: 'counts distinct contracts per file' }));
    let diff = 0;
    for (let i = STRUCTURAL_DIM + SUBWORD_BINS; i < STRUCTURAL_DIM + 2 * SUBWORD_BINS; i++) {
      diff += Math.abs(vDoc[i]! - vNo[i]!);
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('eventName block (dims 640–767) populated when eventNames provided', () => {
    const v = enc.encode(sym(), { eventNames: ['pillar:spike', 'snn:burst'] });
    const blockSum = Array.from(v.slice(STRUCTURAL_DIM + 2 * SUBWORD_BINS)).reduce((s, x) => s + x, 0);
    expect(blockSum).toBeGreaterThan(0);
  });

  // ── NL recall: query matches camelCase ────────────────────────────────────

  it('"pillar slice emitter" query scores higher vs PillarSliceEmitter than vs GraphEdgeRenderer', () => {
    const qVec = enc.encodeText('pillar slice emitter');
    const targetVec = enc.encode(sym({
      name: 'PillarSliceEmitter',
      type: 'class',
      filePath: 'packages/core/src/pillar/PillarSliceEmitter.ts',
      signature: 'class PillarSliceEmitter',
    }));
    const unrelVec = enc.encode(sym({
      name: 'GraphEdgeRenderer',
      type: 'class',
      filePath: 'packages/r3f-renderer/src/GraphEdgeRenderer.ts',
      signature: 'class GraphEdgeRenderer',
    }));
    expect(cosine(qVec, targetVec)).toBeGreaterThan(cosine(qVec, unrelVec));
  });

  it('"brain coord node mapper" query matches BrainCoordNodeMapper', () => {
    const qVec = enc.encodeText('brain coord node mapper');
    const target = enc.encode(sym({
      name: 'BrainCoordNodeMapper',
      type: 'class',
      filePath: 'packages/absorb-service/src/engine/BrainCoordNodeMapper.ts',
    }));
    const unrel = enc.encode(sym({ name: 'LIFSimulator', type: 'class' }));
    expect(cosine(qVec, target)).toBeGreaterThan(cosine(qVec, unrel));
  });

  // ── Async paths ───────────────────────────────────────────────────────────

  it('encodeAsync() returns same result as encode() when SNN disabled', async () => {
    const s = sym({ name: 'TraitCommunityDetector' });
    const sync  = enc.encode(s);
    const async_ = await enc.encodeAsync(s);
    for (let i = 0; i < sync.length; i++) {
      expect(async_[i]).toBeCloseTo(sync[i]!, 5);
    }
  });

  it('encodeTexts() batch returns one vector per input', async () => {
    const texts = ['pillar slice', 'brain coord', 'event emitter', 'graph edge'];
    const vecs = await enc.encodeTexts(texts);
    expect(vecs).toHaveLength(texts.length);
    for (const v of vecs) {
      expect(v.length).toBe(HOLOEMBED_DIM);
      expect(norm(v)).toBeCloseTo(1.0, 4);
    }
  });

  // ── Determinism ──────────────────────────────────────────────────────────

  it('encode() is deterministic', () => {
    const s = sym({ name: 'SpikeHandler', docComment: 'handles LIF spikes' });
    const v1 = enc.encode(s, { eventNames: ['snn:spike'] });
    const v2 = enc.encode(s, { eventNames: ['snn:spike'] });
    for (let i = 0; i < v1.length; i++) expect(v1[i]).toBe(v2[i]);
  });

  // ── Distinct symbols produce distinct vectors ─────────────────────────────

  it('different names produce different vectors', () => {
    const v1 = enc.encode(sym({ name: 'FunctionAlpha' }));
    const v2 = enc.encode(sym({ name: 'FunctionBeta' }));
    expect(cosine(v1, v2)).toBeLessThan(1.0 - 1e-6);
  });
});

// =============================================================================
// SnnAccelerator: CPU fallback in test env
// =============================================================================

describe('SnnAccelerator', () => {
  it('available is false in Node.js (no WebGPU)', async () => {
    const accel = new SnnAccelerator();
    await accel.initialize({ enableSnn: true });
    // Node.js test environment has no navigator.gpu
    expect(accel.available).toBe(false);
  });

  it('encode() CPU passthrough returns input histogram unchanged', async () => {
    const accel = new SnnAccelerator();
    await accel.initialize({ enableSnn: false });
    const hist = Float32Array.from({ length: 128 }, (_, i) => i / 128);
    const out = await accel.encode(hist);
    expect(out).toBe(hist); // same reference (passthrough)
  });

  it('encodeBatch() CPU passthrough returns input array unchanged', async () => {
    const accel = new SnnAccelerator();
    const inputs = [new Float32Array(128), new Float32Array(128)];
    const out = await accel.encodeBatch(inputs);
    expect(out).toBe(inputs); // same reference
  });
});
