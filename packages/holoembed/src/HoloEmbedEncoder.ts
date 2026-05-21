/**
 * HoloEmbedEncoder — main 768-dim encoder
 *
 * Combines:
 *   Dims   0–383: structural base (file topology, call-graph, event-chain)
 *   Dims 384–511: char-trigram histogram of name + type + signature (128 bins)
 *   Dims 512–639: char-trigram histogram of docComment (128 bins)
 *   Dims 640–767: char-trigram histogram of event names (128 bins)
 *
 * Optional SNN-WebGPU population coding (Phase 2 acceleration):
 *   Each trigram block is passed through a 128-neuron LIF population.
 *   Output → spike-rate vector (sparse, threshold-coded) instead of raw histogram.
 *   Falls back to raw histogram when GPU is unavailable.
 *
 * ## Canonical use
 *
 * ```ts
 * import { HoloEmbedEncoder } from '@holoscript/holoembed';
 *
 * const encoder = new HoloEmbedEncoder();
 * await encoder.initialize({ enableSnn: true }); // no-op if GPU unavailable
 *
 * const vec = encoder.encode(sym, { fanIn: 3, eventNames: ['pillar:spike'] });
 * const textVec = encoder.encodeText('pillar slice emitter'); // for NL queries
 * ```
 *
 * ## EmbeddingProvider integration
 *
 * See `HoloEmbedProvider` in `@holoscript/absorb-service` — thin wrapper that
 * delegates to this encoder and satisfies the `EmbeddingProvider` interface.
 */

import {
  trigramHistogram,
  spreadHash,
  hashString,
  l2Normalize,
  camelSplit,
} from './charTrigram.js';
import { SnnAccelerator } from './SnnAccelerator.js';
import type { SymbolInput, GraphEnrichment, EncoderOptions } from './types.js';
import {
  STRUCTURAL_DIM,
  SUBWORD_BINS,
  HOLOEMBED_DIM,
} from './types.js';

// =============================================================================
// KNOWN PACKAGES / DIRS (structural base — mirrors StructuralEmbeddingProvider)
// =============================================================================

const KNOWN_PACKAGES = [
  'packages/core',
  'packages/mcp-server',
  'packages/plugins',
  'packages/absorb-service',
  'packages/studio',
  'packages/r3f-renderer',
];

// =============================================================================
// HOLOEMBED ENCODER
// =============================================================================

export class HoloEmbedEncoder {
  private _accel = new SnnAccelerator();
  private _snnEnabled = false;

  /**
   * Initialize the encoder.
   * Attempts SNN-WebGPU setup if `enableSnn` is true (default).
   * Falls back to CPU encoding if GPU is unavailable — always safe to await.
   */
  async initialize(opts: EncoderOptions = {}): Promise<void> {
    await this._accel.initialize(opts);
    this._snnEnabled = this._accel.available;
  }

  /** Whether the GPU SNN path is active. */
  get snnActive(): boolean { return this._snnEnabled; }

  /**
   * Encode a symbol to a 768-dim L2-normalized Float32Array.
   *
   * Synchronous when SNN is disabled (CPU-only).
   * Returns a Float32Array that can be passed to cosine-similarity search.
   */
  encode(sym: SymbolInput, graph: GraphEnrichment = {}): Float32Array {
    const vec = new Float32Array(HOLOEMBED_DIM);
    this._fillStructural(vec, sym, graph);
    this._fillSubword(vec, sym, graph);
    l2Normalize(vec);
    return vec;
  }

  /**
   * Async encode — uses SNN population coding for the trigram blocks when GPU is active.
   * Identical to `encode()` when GPU is unavailable.
   */
  async encodeAsync(sym: SymbolInput, graph: GraphEnrichment = {}): Promise<Float32Array> {
    const vec = new Float32Array(HOLOEMBED_DIM);
    this._fillStructural(vec, sym, graph);

    if (this._snnEnabled) {
      await this._fillSubwordSnn(vec, sym, graph);
    } else {
      this._fillSubword(vec, sym, graph);
    }

    l2Normalize(vec);
    return vec;
  }

  /**
   * Encode a plain text string to a 768-dim vector.
   * For use with NL queries — fills the structural + name/sig trigram blocks.
   */
  encodeText(text: string): Float32Array {
    const vec = new Float32Array(HOLOEMBED_DIM);
    this._fillStructuralFromText(vec, text);
    trigramHistogram(text, vec, STRUCTURAL_DIM, SUBWORD_BINS);
    // docComment and eventName blocks remain zero — not in text repr
    l2Normalize(vec);
    return vec;
  }

  /**
   * Batch-encode text strings. Amortizes SNN GPU round-trip when GPU is active.
   */
  async encodeTexts(texts: string[]): Promise<Float32Array[]> {
    if (!this._snnEnabled) {
      return texts.map(t => this.encodeText(t));
    }

    // GPU path: compute trigram histograms on CPU, run SNN batch on GPU
    const histograms = texts.map(t => {
      const hist = new Float32Array(SUBWORD_BINS);
      const tmp = new Float32Array(HOLOEMBED_DIM);
      trigramHistogram(t, tmp, STRUCTURAL_DIM, SUBWORD_BINS);
      hist.set(tmp.slice(STRUCTURAL_DIM, STRUCTURAL_DIM + SUBWORD_BINS));
      return hist;
    });

    const snnRates = await this._accel.encodeBatch(histograms);

    return texts.map((t, i) => {
      const vec = new Float32Array(HOLOEMBED_DIM);
      this._fillStructuralFromText(vec, t);
      vec.set(snnRates[i]!, STRUCTURAL_DIM);
      l2Normalize(vec);
      return vec;
    });
  }

  /** Release GPU resources. */
  dispose(): void {
    this._accel.dispose();
  }

  // ── Private: structural base ──────────────────────────────────────────────

  private _fillStructural(vec: Float32Array, sym: SymbolInput, graph: GraphEnrichment): void {
    const fp = sym.filePath.replace(/\\/g, '/');

    // Dims 0–5: known package membership
    for (let i = 0; i < KNOWN_PACKAGES.length; i++) {
      vec[i] = fp.includes(KNOWN_PACKAGES[i]!) ? 1 : 0;
    }
    // Dims 6–9: structural directory flags
    vec[6] = (fp.includes('__tests__') || fp.includes('.test.') || fp.includes('.spec.')) ? 1 : 0;
    vec[7] = fp.includes('/traits/') ? 1 : 0;
    vec[8] = fp.includes('/adapters/') ? 1 : 0;
    vec[9] = fp.includes('/providers/') ? 1 : 0;
    // Dim 10: directory depth
    const depth = (fp.match(/\//g) ?? []).length;
    vec[10] = Math.min(depth / 8, 1);
    // Dims 11–127: file path hash
    spreadHash(hashString(fp), vec, 11, 117);

    // Dims 128–191: signature structure
    vec[128] = symbolTypeScore(sym.type);
    vec[129] = visibilityScore(sym.visibility);
    vec[130] = sym.isExported ? 1 : 0;
    vec[131] = sym.signature ? Math.min(countParams(sym.signature) / 10, 1) : 0;
    vec[132] = sym.signature?.includes(':') ? 1 : 0;
    vec[133] = Math.min((sym.lineCount ?? 0) / 200, 1);
    vec[134] = sym.owner ? 1 : 0;
    spreadHash(hashString(sym.signature ?? sym.name), vec, 135, 57);

    // Dims 192–255: call-graph features
    vec[192] = Math.min((graph.fanIn ?? 0) / 20, 1);
    vec[193] = Math.min((graph.fanOut ?? 0) / 20, 1);
    spreadHash(hashString(sym.docComment ?? ''), vec, 194, 62);

    // Dims 256–319: event-chain features
    vec[256] = (graph.emitCount ?? 0) > 0 ? 1 : 0;
    vec[257] = (graph.listenCount ?? 0) > 0 ? 1 : 0;
    vec[258] = Math.min((graph.emitCount ?? 0) / 5, 1);
    vec[259] = Math.min((graph.listenCount ?? 0) / 5, 1);
    const eventKey = (graph.eventNames ?? []).sort().join('|');
    spreadHash(hashString(eventKey), vec, 260, 60);

    // Dims 320–383: content fingerprint
    const contentKey = `${sym.type}:${sym.name}:${sym.filePath}:${sym.line}`;
    spreadHash(hashString(contentKey), vec, 320, 64);
  }

  private _fillStructuralFromText(vec: Float32Array, text: string): void {
    // Parse "file: path" from EmbeddingIndex serialization
    const fileMatch = /file:\s*(\S+)/i.exec(text);
    const fp = (fileMatch?.[1] ?? '').replace(/\\/g, '/');

    for (let i = 0; i < KNOWN_PACKAGES.length; i++) {
      vec[i] = fp.includes(KNOWN_PACKAGES[i]!) ? 1 : 0;
    }
    vec[6] = (fp.includes('__tests__') || fp.includes('.test.') || fp.includes('.spec.')) ? 1 : 0;
    vec[7] = fp.includes('/traits/') ? 1 : 0;
    vec[8] = fp.includes('/adapters/') ? 1 : 0;
    vec[9] = fp.includes('/providers/') ? 1 : 0;
    const depth = (fp.match(/\//g) ?? []).length;
    vec[10] = Math.min(depth / 8, 1);
    spreadHash(hashString(fp), vec, 11, 117);
    spreadHash(hashString(text), vec, 128, 64);
    spreadHash(hashString(text + fp), vec, 320, 64);
  }

  // ── Private: subword blocks (CPU) ─────────────────────────────────────────

  private _fillSubword(vec: Float32Array, sym: SymbolInput, graph: GraphEnrichment): void {
    // Block 1 (384–511): name + type + signature
    trigramHistogram(
      `${sym.name} ${sym.type} ${sym.signature ?? ''}`,
      vec, STRUCTURAL_DIM, SUBWORD_BINS,
    );
    // Block 2 (512–639): docComment
    trigramHistogram(sym.docComment ?? '', vec, STRUCTURAL_DIM + SUBWORD_BINS, SUBWORD_BINS);
    // Block 3 (640–767): event names
    trigramHistogram(
      camelSplit((graph.eventNames ?? []).join(' ')),
      vec, STRUCTURAL_DIM + 2 * SUBWORD_BINS, SUBWORD_BINS,
    );
  }

  // ── Private: subword blocks (GPU SNN) ────────────────────────────────────

  private async _fillSubwordSnn(vec: Float32Array, sym: SymbolInput, graph: GraphEnrichment): Promise<void> {
    // Build CPU histograms first, then replace with SNN rates
    const h1 = new Float32Array(SUBWORD_BINS);
    const h2 = new Float32Array(SUBWORD_BINS);
    const h3 = new Float32Array(SUBWORD_BINS);
    const tmp = new Float32Array(SUBWORD_BINS * 3); // scratch

    trigramHistogram(`${sym.name} ${sym.type} ${sym.signature ?? ''}`, tmp, 0, SUBWORD_BINS);
    trigramHistogram(sym.docComment ?? '', tmp, SUBWORD_BINS, SUBWORD_BINS);
    trigramHistogram(
      camelSplit((graph.eventNames ?? []).join(' ')),
      tmp, 2 * SUBWORD_BINS, SUBWORD_BINS,
    );

    h1.set(tmp.slice(0, SUBWORD_BINS));
    h2.set(tmp.slice(SUBWORD_BINS, 2 * SUBWORD_BINS));
    h3.set(tmp.slice(2 * SUBWORD_BINS, 3 * SUBWORD_BINS));

    // SNN encode each block
    const [r1, r2, r3] = await this._accel.encodeBatch([h1, h2, h3]);

    vec.set(r1!, STRUCTURAL_DIM);
    vec.set(r2!, STRUCTURAL_DIM + SUBWORD_BINS);
    vec.set(r3!, STRUCTURAL_DIM + 2 * SUBWORD_BINS);
  }
}

// =============================================================================
// STRUCTURAL SCORING HELPERS
// =============================================================================

function symbolTypeScore(type: string): number {
  switch (type) {
    case 'function':   return 1.0;
    case 'method':     return 0.9;
    case 'class':      return 0.7;
    case 'interface':  return 0.5;
    case 'type_alias': return 0.4;
    case 'enum':       return 0.3;
    case 'constant':   return 0.2;
    case 'field':      return 0.15;
    default:           return 0.1;
  }
}

function visibilityScore(v: string | undefined): number {
  switch (v) {
    case 'public':    return 1.0;
    case 'protected': return 0.5;
    case 'internal':  return 0.3;
    case 'private':   return 0.0;
    default:          return 0.8;
  }
}

function countParams(signature: string): number {
  const s = signature.indexOf('(');
  const e = signature.lastIndexOf(')');
  if (s < 0 || e <= s) return 0;
  const inner = signature.slice(s + 1, e).trim();
  if (!inner) return 0;
  return inner.split(',').length;
}
