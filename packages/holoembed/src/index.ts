/**
 * @holoscript/holoembed
 *
 * 768-dim NL→code embeddings: structural topology + char-trigram subword blocks.
 * Optional SNN-WebGPU population coding for GPU-accelerated batch encoding.
 *
 * ## Quick start
 *
 * ```ts
 * import { HoloEmbedEncoder } from '@holoscript/holoembed';
 *
 * const enc = new HoloEmbedEncoder();
 * await enc.initialize();           // no-op in CI, activates GPU when available
 *
 * // Encode a symbol (full fidelity):
 * const docVec = enc.encode(sym, { fanIn: 3, eventNames: ['pillar:spike'] });
 *
 * // Encode an NL query:
 * const queryVec = enc.encodeText('pillar slice emitter');
 *
 * // Cosine similarity (both vectors are L2-normalized):
 * const score = queryVec.reduce((s, v, i) => s + v * docVec[i], 0);
 * ```
 *
 * ## Dimensions
 *
 * | Dims     | Source                  | Description                           |
 * |----------|-------------------------|---------------------------------------|
 * | 0–383    | Structural (topology)   | File path, call-graph, event-chain    |
 * | 384–511  | Trigrams (name+sig)     | camelSplit → 128-bin FNV-1a histogram |
 * | 512–639  | Trigrams (docComment)   | Same algorithm on doc text            |
 * | 640–767  | Trigrams (eventNames)   | Same algorithm on event name tokens   |
 *
 * With SNN GPU active, each trigram block is transformed through 128 LIF neurons
 * (50ms simulated at dt=1ms) → spike-rate population code.
 *
 * ## Paper 26 claim
 *
 * HoloEmbed Phase 1 (CPU, no deps):  ~50–70% recall@10 for name-matched NL queries
 * HoloEmbed Phase 2 (SNN GPU active): ~65–80% recall@10 (sparser, threshold-coded)
 * StructuralEmbeddingProvider:          ~3–12% recall@10 (topology only, no names)
 * Xenova all-MiniLM-L6-v2:           ~60–80% recall@10 (full NL semantic training)
 *
 * @module
 */

export { HoloEmbedEncoder } from './HoloEmbedEncoder.js';
export { SnnAccelerator } from './SnnAccelerator.js';
export { camelSplit, trigramHistogram, hashString, spreadHash, l2Normalize } from './charTrigram.js';
export type { SymbolInput, GraphEnrichment, EncoderOptions } from './types.js';
export type { LIFPopulationParams } from './SnnAccelerator.js';
export {
  HOLOEMBED_DIM,
  STRUCTURAL_DIM,
  SUBWORD_BINS,
  SUBWORD_BLOCKS,
} from './types.js';
