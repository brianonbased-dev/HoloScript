/**
 * BM25 Embedding Provider
 *
 * @deprecated Use OpenAI embeddings instead (`--provider openai`). BM25 is keyword-only
 * and produces poor results for semantic queries. Kept for offline/zero-dep edge cases only.
 *
 * Zero-dependency pseudo-embedding using the Feature Hashing trick + TF weighting.
 *
 * How it works:
 *   1. Tokenise each text: camelCase split, snake_case split, lowercase, de-stop-word
 *   2. Compute term frequency for each token
 *   3. Project each token into a fixed-dimension bucket via FNV-1a hash
 *   4. Add TF weight to the bucket (log-scaled to reduce outlier influence)
 *   5. L2-normalise the resulting vector
 *
 * Vectors live in the same 1024-dimensional space for both documents and queries,
 * so cosine similarity works correctly without any corpus-fit step.
 *
 * Quality note: Not semantically aware (synonyms won't match), but excellent for
 * exact/keyword code searches and functional in all environments with zero deps.
 */

import type { EmbeddingProvider } from './EmbeddingProvider';

// Fixed dimension chosen as power-of-2 to minimise hash collisions while staying small.
const DIM = 1024;

// Common English + code stop-words — filtered out to reduce noise.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'this', 'that', 'these', 'those', 'it', 'its',
  // Code noise
  'null', 'undefined', 'void', 'true', 'false',
  'function', 'return', 'const', 'let', 'var', 'type', 'interface',
  'class', 'import', 'export', 'default', 'from',
]);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * FNV-1a 32-bit hash mapped to [0, DIM).
 * Deterministic, fast, no external deps.
 */
function fnv1a(s: string): number {
  let h = 2166136261; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0; // FNV prime, keep 32-bit
  }
  return h % DIM;
}

/**
 * Tokenise a mixed identifier/prose string into lowercase terms.
 *
 * Splits on:
 *   - camelCase boundaries  (fooBar → foo bar)
 *   - ACRONYM boundaries    (parseAST → parse AST → parse, ast)
 *   - Whitespace / punctuation
 *   - snake_case, kebab-case, path separators
 */
function tokenise(text: string): string[] {
  return text
    // camelCase: lowercase before uppercase  →  "fooBar" → "foo Bar"
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    // ACRONYM before trailing uppercase + lowercase  →  "parseAST" → "parse AST"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Split on non-alphanumeric characters
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

// =============================================================================
// PROVIDER
// =============================================================================

export class BM25EmbeddingProvider implements EmbeddingProvider {
  readonly name = 'bm25';

  /**
   * Produce 1024-dimensional feature-hash vectors for each input text.
   *
   * Uses FNV-1a hashing + log-scaled TF weighting, L2-normalised so the
   * resulting vectors are compatible with cosine-similarity arithmetic.
   *
   * @param texts - One or more strings to embed (empty string → zero vector).
   * @returns A `Promise` resolving to an array of `number[]` of length 1024,
   *          one per input text. Never rejects for empty input.
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const tokens = tokenise(text);
      if (tokens.length === 0) return new Array(DIM).fill(0);

      const vec = new Float64Array(DIM);

      // Compute TF
      const tf: Record<string, number> = {};
      for (const t of tokens) {
        tf[t] = (tf[t] ?? 0) + 1;
      }

      // Project into hash buckets with log-TF weight
      for (const [term, freq] of Object.entries(tf)) {
        const bucket = fnv1a(term);
        // log1p(freq) smooths out high-frequency terms (similar to TF in BM25)
        vec[bucket] += 1 + Math.log1p(freq);
      }

      // L2 normalise
      let norm = 0;
      for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm) || 1;

      const result = new Array<number>(DIM);
      for (let i = 0; i < DIM; i++) result[i] = vec[i] / norm;
      return result;
    });
  }
}
