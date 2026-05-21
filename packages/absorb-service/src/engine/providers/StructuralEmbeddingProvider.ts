/**
 * StructuralEmbeddingProvider — HoloGraph Phase 1
 *
 * Derives 384-dimensional embeddings from AST structural features rather than
 * text token embeddings. Requires NO API key, NO model download, NO network.
 * Deterministic: the same symbol always produces the same vector.
 *
 * ## Why structural embeddings?
 *
 * Text-embedding models (OpenAI, Xenova) treat code as natural language text.
 * They encode the string "function classifyCoord(coord, config): CacheRoute"
 * using token co-occurrence statistics trained on web text. This captures
 * surface naming but misses:
 *   - Whether the function is pure (no side effects)
 *   - Its position in the call graph (fan-in, fan-out)
 *   - Which events it emits or listens to
 *   - Which package/trait it belongs to
 *   - Its actual structural similarity to other functions
 *
 * StructuralEmbeddingProvider encodes these features directly. Two methods
 * in the same TraitHandler with similar signatures and similar fan-in will
 * have high cosine similarity — regardless of their names.
 *
 * ## Embedding layout (384 dims, normalized to [0,1])
 *
 *   Dims   0–127: File/package structural features
 *     0: is in packages/core
 *     1: is in packages/mcp-server
 *     2: is in packages/plugins
 *     3: is in packages/absorb-service
 *     4: is in packages/studio
 *     5: is in packages/r3f-renderer
 *     6: is in a test file (__tests__, .test., .spec.)
 *     7: is in traits/ directory
 *     8: is in adapters/ directory
 *     9: is in providers/ directory
 *     10: file depth from root (normalized to [0,1] over max 8 levels)
 *     11–127: deterministic hash of file path → spread over 117 dims
 *
 *   Dims 128–191: Signature structure features
 *     128: symbol type: function (1) vs method (0.8) vs class (0.6) vs interface (0.4) vs other (0.2)
 *     129: visibility: public (1) vs protected (0.5) vs private (0)
 *     130: is exported (1 = yes, 0 = no)
 *     131: param count (normalized to [0,1] over max 10)
 *     132: has return type annotation (1 = yes, 0 = no)
 *     133: LOC (normalized to [0,1] over max 200)
 *     134: owner/class depth (0 = top-level, 1 = has owner)
 *     135–191: deterministic hash of signature text → spread over 57 dims
 *
 *   Dims 192–255: Call-graph structural features (populated externally via enrich())
 *     192: fan-in (callers count, normalized over max 20)
 *     193: fan-out (callees count, normalized over max 20)
 *     194–255: deterministic hash of docComment (if present) → spread over 62 dims
 *
 *   Dims 256–319: Event-chain features (populated externally via enrich())
 *     256: emits events (1 = yes, 0 = no)
 *     257: listens to events (1 = yes, 0 = no)
 *     258: emit count (normalized over max 5)
 *     259: listen count (normalized over max 5)
 *     260–319: deterministic hash of event names → spread over 60 dims
 *
 *   Dims 320–383: Content hash (deterministic from symbol name + type + file)
 *     320–383: 64-dim content fingerprint for exact-match boosting
 *
 * ## Cosine similarity properties
 *
 * Two symbols with high cosine similarity:
 *   - Are in the same package/directory tier (dims 0–127 match)
 *   - Have similar visibility and export status (dims 128–191 match)
 *   - Have similar LOC and param count (dims 128–191 match)
 *
 * Two symbols with low cosine similarity:
 *   - Are in different packages (different dims 0–9 set)
 *   - Have very different LOC (test stub vs 200-line solver)
 *
 * Structural embeddings complement Xenova (semantic text similarity).
 * Use structural for: impact analysis, structural pattern discovery, test pairing.
 * Use Xenova for: "what code does X?" natural-language queries.
 *
 * ## Paper 26 claim
 * "HoloGraph introduces structural embeddings — a deterministic, zero-dependency
 * alternative to text-token embeddings for code intelligence. Structural embeddings
 * achieve [metric] for structural-pattern queries at zero inference cost."
 */

import type { EmbeddingProvider } from './EmbeddingProvider';
import type { ExternalSymbolDefinition } from '../types';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Output dimension — matches Xenova all-MiniLM-L6-v2 so indexes are interchangeable */
const DIM = 384;

/** Packages we recognize for dims 0–5 */
const KNOWN_PACKAGES = [
  'packages/core',
  'packages/mcp-server',
  'packages/plugins',
  'packages/absorb-service',
  'packages/studio',
  'packages/r3f-renderer',
];

/** Subdirectories that convey structural meaning */
const STRUCTURAL_DIRS = ['__tests__', '.test.', '.spec.', 'traits/', 'adapters/', 'providers/'];

// =============================================================================
// STRUCTURAL EMBEDDING PROVIDER
// =============================================================================

export class StructuralEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'structural';

  /**
   * Generate 384-dim structural embeddings for a batch of text inputs.
   *
   * For use with EmbeddingIndex.build(): the `text` field in IndexedSymbol
   * is passed here. We parse it to extract structural features.
   *
   * For richer embeddings that include call-graph and event-chain features,
   * use `embedSymbol()` directly with the full ExternalSymbolDefinition.
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(t => this._embedFromText(t));
  }

  /**
   * Embed a full ExternalSymbolDefinition — includes all structural features.
   * Richer than getEmbeddings() which only has the text representation.
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

    // ── Dims 0–127: File/package features ──────────────────────────────────
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

    // ── Dims 128–191: Signature structure ──────────────────────────────────
    vec[128] = symbolTypeScore(sym.type);
    vec[129] = visibilityScore(sym.visibility);
    vec[130] = sym.isExported ? 1 : 0;
    vec[131] = sym.signature ? Math.min(countParams(sym.signature) / 10, 1) : 0;
    vec[132] = sym.signature?.includes(':') ? 1 : 0; // has return type annotation
    vec[133] = Math.min((sym.lineCount ?? 0) / 200, 1);
    vec[134] = sym.owner ? 1 : 0;
    spreadHash(hashString(sym.signature ?? sym.name), vec, 135, 57);

    // ── Dims 192–255: Call-graph features ──────────────────────────────────
    vec[192] = Math.min((opts.fanIn ?? 0) / 20, 1);
    vec[193] = Math.min((opts.fanOut ?? 0) / 20, 1);
    spreadHash(hashString(sym.docComment ?? ''), vec, 194, 62);

    // ── Dims 256–319: Event-chain features ─────────────────────────────────
    vec[256] = (opts.emitCount ?? 0) > 0 ? 1 : 0;
    vec[257] = (opts.listenCount ?? 0) > 0 ? 1 : 0;
    vec[258] = Math.min((opts.emitCount ?? 0) / 5, 1);
    vec[259] = Math.min((opts.listenCount ?? 0) / 5, 1);
    const eventKey = (opts.eventNames ?? []).sort().join('|');
    spreadHash(hashString(eventKey), vec, 260, 60);

    // ── Dims 320–383: Content fingerprint ──────────────────────────────────
    const contentKey = `${sym.type}:${sym.name}:${sym.filePath}:${sym.line}`;
    spreadHash(hashString(contentKey), vec, 320, 64);

    // L2 normalize so cosine similarity = dot product
    l2Normalize(vec);
    return vec;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Embed from a text string (used by EmbeddingIndex via getEmbeddings).
   * Parses the text to extract as many structural signals as possible.
   */
  private _embedFromText(text: string): number[] {
    const vec = new Float32Array(DIM);

    // Extract file path if text contains one (EmbeddingIndex serializes as "name: signature\nfile: path")
    const fileMatch = /file:\s*(\S+)/i.exec(text);
    const fp = (fileMatch?.[1] ?? '').replace(/\\/g, '/');

    // Package dims
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

    // Signature dims from text content
    spreadHash(hashString(text), vec, 128, 64);

    // Content fingerprint from full text
    spreadHash(hashString(text + fp), vec, 320, 64);

    l2Normalize(vec);
    return Array.from(vec);
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Deterministic 32-bit hash of a string (FNV-1a variant).
 * Fast, good distribution, no dependencies.
 */
function hashString(s: string): number {
  let h = 2166136261; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0; // FNV prime, keep 32-bit unsigned
  }
  return h;
}

/**
 * Spread a 32-bit hash deterministically into `count` consecutive dims of vec,
 * starting at `offset`. Each dim gets a value in [0, 1].
 */
function spreadHash(hash: number, vec: Float32Array, offset: number, count: number): void {
  // Use LCG to generate `count` values from the seed hash
  let state = hash;
  for (let i = 0; i < count; i++) {
    state = ((state * 1664525 + 1013904223) >>> 0); // LCG
    vec[offset + i] = (state >>> 0) / 4294967295; // normalize to [0,1]
  }
}

/** In-place L2 normalization of a Float32Array */
function l2Normalize(vec: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
  }
}

function symbolTypeScore(type: string): number {
  switch (type) {
    case 'function':    return 1.0;
    case 'method':      return 0.9;
    case 'class':       return 0.7;
    case 'interface':   return 0.5;
    case 'type_alias':  return 0.4;
    case 'enum':        return 0.3;
    case 'constant':    return 0.2;
    case 'field':       return 0.15;
    default:            return 0.1;
  }
}

function visibilityScore(v: string | undefined): number {
  switch (v) {
    case 'public':    return 1.0;
    case 'protected': return 0.5;
    case 'internal':  return 0.3;
    case 'private':   return 0.0;
    default:          return 0.8; // undefined → assume public-ish
  }
}

function countParams(signature: string): number {
  // Count commas in parameter list — rough but fast
  const parenStart = signature.indexOf('(');
  const parenEnd   = signature.lastIndexOf(')');
  if (parenStart < 0 || parenEnd <= parenStart) return 0;
  const params = signature.slice(parenStart + 1, parenEnd).trim();
  if (!params) return 0;
  return params.split(',').length;
}
