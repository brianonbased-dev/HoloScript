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
 * ## Evidence posture
 *
 * Do not claim SNN acceleration is faster on a machine until
 * `pnpm --filter @holoscript/holoembed run bench:snn` records CPU-reference
 * versus WebGPU latency and recall for that machine.
 *
 * @module
 */

export { HoloEmbedEncoder } from './HoloEmbedEncoder.js';
export { SnnAccelerator, encodeLifPopulationCpu } from './SnnAccelerator.js';
export { camelSplit, trigramHistogram, hashString, spreadHash, l2Normalize } from './charTrigram.js';
export type { SymbolInput, GraphEnrichment, EncoderOptions } from './types.js';
export type { LIFPopulationParams, LIFPopulationCpuOptions } from './SnnAccelerator.js';
export {
  HOLOEMBED_DIM,
  STRUCTURAL_DIM,
  SUBWORD_BINS,
  SUBWORD_BLOCKS,
} from './types.js';
