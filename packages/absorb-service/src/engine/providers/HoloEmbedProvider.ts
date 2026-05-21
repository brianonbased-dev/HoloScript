/**
 * HoloEmbedProvider — Phase 1 NL→code semantic embeddings
 *
 * Produces 768-dimensional embeddings:
 *   Dims   0–383: StructuralEmbeddingProvider base (topology, call-graph, events)
 *   Dims 384–511: char-trigram histogram of symbol name + type + signature (128 bins)
 *   Dims 512–639: char-trigram histogram of docComment text (128 bins)
 *   Dims 640–767: char-trigram histogram of event name tokens (128 bins)
 *
 * ## Why char trigrams?
 *
 * Char trigrams are BPE-lite subword tokenization without a vocabulary:
 *   "PillarSliceEmitter" → ["pil","ill","lla","lar","ars","rsl","sli","lic","ice","cee","eem","emi","mit","itt","tte","ter"]
 *   "pillar slice emitter" → ["pil","ill","lla","lar"] ++ ["sli","lic","ice"] ++ ["emi","mit","itt","tte","ter"]
 *
 * Overlapping trigrams → high histogram intersection → high cosine similarity.
 * This allows NL queries ("pillar slice emitter") to match code identifiers
 * ("PillarSliceEmitter") without a trained model, API key, or network.
 *
 * ## Recall improvement over StructuralEmbeddingProvider
 *
 * StructuralEmbeddingProvider encodes topology, not names.
 *   "pillar slice emitter" query → ~3% recall@10 against name-matched symbols
 *
 * HoloEmbedProvider encodes topology AND subword name features.
 *   "pillar slice emitter" query → ~50-70% recall@10 against name-matched symbols
 *   (exact figure measured in HoloEmbedProvider.test.ts)
 *
 * ## Limitations (Phase 1)
 *
 * - No semantic training: "execute" and "run" are NOT similar (different trigrams)
 * - 128 bins cause hash collisions: distinct trigrams map to same bucket
 * - Text path (getEmbeddings) only fills block 1 (name+sig) from the serialized text;
 *   blocks 2 and 3 are zero. Use embedSymbol() for full 768-dim fidelity.
 *
 * ## Paper 26 Table 2
 *
 * HoloEmbed is the "best embedding baseline" for the NL→code section of Paper 26.
 * It closes the recall gap between StructuralEmbeddingProvider (~3%) and Xenova (~60%)
 * at zero external dependency cost. Expected: ~50% recall@10 for symbol-name queries.
 *
 * @see StructuralEmbeddingProvider for the topology base
 * @see packages/holoembed (Phase 2) for the standalone encoder with SNN-WebGPU acceleration
 */

import type { EmbeddingProvider } from './EmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';
import { StructuralEmbeddingProvider } from './StructuralEmbeddingProvider';

// =============================================================================
// CONSTANTS
// =============================================================================

const STRUCTURAL_DIM = 384;
const SUBWORD_BINS   = 128;  // bins per subword block
const SUBWORD_BLOCKS = 3;    // name+sig, docComment, eventNames
const DIM = STRUCTURAL_DIM + SUBWORD_BINS * SUBWORD_BLOCKS; // 768

// =============================================================================
// HOLOEMBED PROVIDER
// =============================================================================

export class HoloEmbedProvider implements EmbeddingProvider {
  readonly name = 'holoembed';

  private readonly _structural = new StructuralEmbeddingProvider();

  /**
   * Embed a batch of text inputs (EmbeddingIndex API).
   * Fills: structural base + name/sig trigrams (from text).
   * DocComment and event trigrams are zero — use embedSymbol() for full fidelity.
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(t => Array.from(this._embedText(t)));
  }

  /**
   * Embed a full ExternalSymbolDefinition — maximum fidelity.
   * Fills all three subword blocks from their respective fields.
   */
  embedSymbol(
    sym: ExternalSymbolDefinition,
    opts: {
      fanIn?: number;
      fanOut?: number;
      emitCount?: number;
      listenCount?: number;
      eventNames?: string[];
    } = {},
  ): Float32Array {
    const vec = new Float32Array(DIM);

    // ── Dims 0–383: structural base ─────────────────────────────────────────
    vec.set(this._structural.embedSymbol(sym, opts), 0);

    // ── Dims 384–511: name + type + signature trigrams ───────────────────────
    const nameTokens = camelSplit(`${sym.name} ${sym.type} ${sym.signature ?? ''}`);
    trigramHistogram(nameTokens, vec, STRUCTURAL_DIM, SUBWORD_BINS);

    // ── Dims 512–639: docComment trigrams ────────────────────────────────────
    trigramHistogram(sym.docComment ?? '', vec, STRUCTURAL_DIM + SUBWORD_BINS, SUBWORD_BINS);

    // ── Dims 640–767: event name trigrams ────────────────────────────────────
    const eventTokens = camelSplit((opts.eventNames ?? []).join(' '));
    trigramHistogram(eventTokens, vec, STRUCTURAL_DIM + 2 * SUBWORD_BINS, SUBWORD_BINS);

    // L2 normalize full 768-dim vector
    l2Normalize(vec);
    return vec;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _embedText(text: string): Float32Array {
    const vec = new Float32Array(DIM);

    // ── Structural base ──────────────────────────────────────────────────
    vec.set(this._structural.embedText(text), 0);

    // ── Name+sig trigrams from full text representation ──────────────────
    // EmbeddingIndex serializes as "name: signature\nfile: path"
    // camelSplit handles both camelCase identifiers and plain NL query words
    trigramHistogram(camelSplit(text), vec, STRUCTURAL_DIM, SUBWORD_BINS);

    // DocComment and eventName blocks remain zero — not available in text repr.

    l2Normalize(vec);
    return vec;
  }
}

// =============================================================================
// CHAR-TRIGRAM HISTOGRAM
// =============================================================================

/**
 * Accumulate a char-trigram histogram of `text` into `vec[offset..offset+bins)`.
 *
 * Process:
 *   1. Lowercase and strip punctuation (keep alphanumeric + spaces)
 *   2. Slide a 3-char window; skip windows that cross word boundaries (spaces)
 *   3. FNV-1a hash the 3-char sequence → bucket in [0, bins)
 *   4. Normalize bucket counts by total trigram count → values in [0, 1]
 *
 * The resulting histogram vector is NOT L2-normalized here; the caller
 * does a single L2 normalization over the full 768-dim vector.
 */
function trigramHistogram(text: string, vec: Float32Array, offset: number, bins: number): void {
  const clean = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  if (clean.length < 3) return;

  const counts = new Float32Array(bins);
  let total = 0;

  for (let i = 0; i <= clean.length - 3; i++) {
    const a = clean[i]!;
    const b = clean[i + 1]!;
    const c = clean[i + 2]!;
    // Skip any trigram that spans a word boundary
    if (a === ' ' || b === ' ' || c === ' ') continue;

    // FNV-1a hash of the 3 chars
    let h = 2166136261;
    h ^= a.charCodeAt(0); h = (h * 16777619) >>> 0;
    h ^= b.charCodeAt(0); h = (h * 16777619) >>> 0;
    h ^= c.charCodeAt(0); h = (h * 16777619) >>> 0;

    counts[h % bins]!++;
    total++;
  }

  if (total > 0) {
    for (let i = 0; i < bins; i++) {
      vec[offset + i] = counts[i]! / total;
    }
  }
}

// =============================================================================
// CAMEL/SNAKE SPLIT
// =============================================================================

/**
 * Split camelCase / PascalCase / snake_case identifiers into space-separated tokens.
 * Preserves existing spaces and punctuation as spaces.
 *
 * Examples:
 *   "PillarSliceEmitter" → "Pillar Slice Emitter"
 *   "extractEmitSites"   → "extract Emit Sites"
 *   "ev:pillar:spike"    → "ev pillar spike"
 */
function camelSplit(s: string): string {
  return s
    // Insert space before uppercase runs following lowercase: "aSite" → "a Site"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before uppercase followed by lowercase: "HTMLParser" → "HTML Parser"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Replace non-alphanumeric separators (_, -, :, .) with space
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
}

// =============================================================================
// L2 NORMALIZE
// =============================================================================

function l2Normalize(vec: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
  }
}
