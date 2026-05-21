/**
 * charTrigram — char-trigram histogram utilities
 *
 * Canonical implementation for HoloEmbed subword encoding.
 * Also used by HoloEmbedProvider in absorb-service (via copy-import pattern;
 * absorb-service does not take @holoscript/holoembed as a dep to avoid cycles).
 *
 * ## Algorithm
 *
 * 1. camelSplit: tokenize PascalCase/camelCase/snake_case/event:names into words
 * 2. Lowercase + strip non-alphanumeric → clean token sequence
 * 3. Slide 3-char window over each word; skip cross-word boundaries
 * 4. FNV-1a hash each 3-char sequence → bucket in [0, bins)
 * 5. Normalize bucket counts by total trigram count → [0, 1] histogram
 *
 * ## Why char trigrams?
 *
 * "PillarSliceEmitter" camel-split → "pillar slice emitter"
 *   trigrams include: "pil","ill","lla","lar" / "sli","lic","ice" / "emi","mit","itt","tte","ter"
 *
 * NL query "pillar slice emitter" produces IDENTICAL trigrams → perfect histogram overlap.
 * The 128-bin FNV hash means some trigrams collide, but the overlap signal dominates for
 * name-matched pairs.
 *
 * This is a BPE-lite approach: no vocabulary, no model, no training. Pure character algebra.
 */

// =============================================================================
// CAMEL / PASCAL / SNAKE SPLIT
// =============================================================================

/**
 * Tokenize a camelCase / PascalCase / snake_case / colon-separated identifier
 * into space-separated lowercase words suitable for trigram extraction.
 *
 * Examples:
 *   "PillarSliceEmitter"   → "pillar slice emitter"
 *   "extractEmitSites"     → "extract emit sites"
 *   "ev:pillar:spike"      → "ev pillar spike"
 *   "BRAIN_COORD_MAPPER"   → "brain coord mapper"
 *   "pillar slice emitter" → "pillar slice emitter"  (NL query passthrough)
 */
export function camelSplit(s: string): string {
  return s
    // Insert space before uppercase following lowercase: "aSite" → "a Site"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before uppercase run followed by lowercase: "HTMLParser" → "HTML Parser"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Replace non-alphanumeric separators (_, -, :, ., /) with space
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

// =============================================================================
// TRIGRAM HISTOGRAM
// =============================================================================

/**
 * Accumulate a char-trigram histogram of `text` into `vec[offset..offset+bins)`.
 *
 * - Applies camelSplit to the input text first.
 * - Extracts all 3-char windows that don't cross word boundaries.
 * - FNV-1a hashes each trigram into a bin.
 * - Normalizes by total trigram count → values in [0, 1].
 *
 * Note: this function does NOT L2-normalize the output; the caller does a
 * single L2 normalization over the full output vector after all blocks are filled.
 */
export function trigramHistogram(
  text: string,
  vec: Float32Array,
  offset: number,
  bins: number,
): void {
  const clean = camelSplit(text); // already lowercase
  if (clean.length < 3) return;

  const counts = new Float32Array(bins);
  let total = 0;

  for (let i = 0; i <= clean.length - 3; i++) {
    const a = clean[i]!;
    const b = clean[i + 1]!;
    const c = clean[i + 2]!;
    // Skip any trigram spanning a word boundary
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
// STRUCTURAL BASE (file-path / signature features)
// =============================================================================

/**
 * FNV-1a 32-bit hash of a string.
 * Used for deterministic structural feature spreading.
 */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

/**
 * Spread a 32-bit hash deterministically into `count` dims of `vec`
 * starting at `offset`. Each dim is in [0, 1] via LCG.
 */
export function spreadHash(hash: number, vec: Float32Array, offset: number, count: number): void {
  let state = hash;
  for (let i = 0; i < count; i++) {
    state = ((state * 1664525 + 1013904223) >>> 0);
    vec[offset + i] = (state >>> 0) / 4294967295;
  }
}

/** In-place L2 normalization. */
export function l2Normalize(vec: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
  }
}
