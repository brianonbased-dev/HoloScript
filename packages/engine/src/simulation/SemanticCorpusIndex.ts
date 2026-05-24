/**
 * SemanticCorpusIndex — the scalable corpus path for the semantic novelty advisory
 * (scope 2026-05-23_holoembed-semantic-encoder, P3).
 *
 * THE PROBLEM IT SOLVES: `assessSemanticNovelty` (SemanticNoveltyEncoder.ts) embeds EVERY
 * corpus entry on EVERY query — O(N) model calls per assessment. Fine for the 12-entry seed,
 * hopeless for the 10^3+ real-abstract corpus P3 ingests. This module PRE-EMBEDS the corpus
 * once into a vector index, so each query embeds ONCE and does an O(N) cosine scan (cheap
 * arithmetic, no model). That is the difference between a usable hub and a toy (D.060).
 *
 * DETERMINISM NOTE (resolved by the P1 finding): the cached vectors are built on one machine
 * and the model is not byte-reproducible cross-fleet — but the divergence is ~1e-7 (float32
 * ULP), which moves a cosine similarity by ~1e-7, utterly negligible against the 0.5 advisory
 * threshold. So a one-machine cache is valid fleet-wide FOR ADVISORY COSINE QUERIES. Still
 * ADVISORY only — never receipt-binding (same constraint as the rest of the semantic layer).
 *
 * The nearest-neighbour search is PURE (no model), so it is fully testable offline.
 */

import type { ConjecturePriorArtEntry } from './ConjectureEngine';
import {
  SEMANTIC_NOVELTY_MODEL,
  SEMANTIC_NOVELTY_THRESHOLD,
  cosineSimilarity,
  embedSemantic,
  type SemanticNoveltyAssessment,
  type SemanticNoveltyMatch,
} from './SemanticNoveltyEncoder';

export const SEMANTIC_CORPUS_INDEX_VERSION = 1 as const;

export interface EmbeddedCorpusEntry extends ConjecturePriorArtEntry {
  /** L2-normalized embedding of `statement`, from the advisory model. */
  vector: ReadonlyArray<number>;
}

export interface SemanticCorpusIndex {
  indexVersion: typeof SEMANTIC_CORPUS_INDEX_VERSION;
  modelId: typeof SEMANTIC_NOVELTY_MODEL;
  dim: number;
  entries: ReadonlyArray<EmbeddedCorpusEntry>;
}

export interface BuildIndexOptions {
  /** Called after each entry is embedded — for progress on a large corpus. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Embed every corpus entry's `statement` once into a queryable index. Async (runs the model
 * N times, once per entry). Do this ONCE, then serve many queries via assessSemanticNoveltyIndexed.
 */
export async function buildSemanticCorpusIndex(
  corpus: ReadonlyArray<ConjecturePriorArtEntry>,
  options: BuildIndexOptions = {},
): Promise<SemanticCorpusIndex> {
  if (corpus.length === 0) {
    throw new Error('semantic-corpus-index: cannot build an index from an empty corpus');
  }
  const entries: EmbeddedCorpusEntry[] = [];
  let dim = 0;
  for (let i = 0; i < corpus.length; i++) {
    const entry = corpus[i];
    if (typeof entry.statement !== 'string' || entry.statement.length === 0) {
      throw new Error(`semantic-corpus-index: entry ${entry.id} has an empty statement`);
    }
    const vector = await embedSemantic(entry.statement);
    dim = vector.length;
    entries.push({ ...entry, vector });
    options.onProgress?.(i + 1, corpus.length);
  }
  return { indexVersion: SEMANTIC_CORPUS_INDEX_VERSION, modelId: SEMANTIC_NOVELTY_MODEL, dim, entries };
}

/**
 * PURE nearest-neighbour by cosine over a pre-embedded index. Deterministic tie-break by
 * ascending id (matches assessSemanticNovelty). No model required → fully testable offline.
 */
export function nearestByCosine(
  queryVector: ReadonlyArray<number>,
  index: SemanticCorpusIndex,
): SemanticNoveltyMatch | null {
  let nearest: SemanticNoveltyMatch | null = null;
  for (const entry of index.entries) {
    const similarity = cosineSimilarity(queryVector, entry.vector);
    if (
      nearest === null ||
      similarity > nearest.similarity ||
      (similarity === nearest.similarity && entry.id < nearest.priorArtId)
    ) {
      nearest = {
        priorArtId: entry.id,
        source: entry.source,
        ...(entry.title ? { title: entry.title } : {}),
        statement: entry.statement,
        similarity,
      };
    }
  }
  return nearest;
}

/**
 * ADVISORY semantic novelty assessment against a PRE-EMBEDDED index. Embeds the query once,
 * scans the cached vectors, flags `near-duplicate` if the nearest is >= threshold. Same return
 * shape and semantics as assessSemanticNovelty, but scales to a large corpus. NOT receipt-binding.
 */
export async function assessSemanticNoveltyIndexed(
  query: string,
  index: SemanticCorpusIndex,
  threshold: number = SEMANTIC_NOVELTY_THRESHOLD,
): Promise<SemanticNoveltyAssessment> {
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('semantic-corpus-index: query must be a non-empty string');
  }
  const base = {
    binding: 'advisory' as const,
    provider: 'transformers.js' as const,
    modelId: SEMANTIC_NOVELTY_MODEL,
    threshold,
    corpusSize: index.entries.length,
    query,
  };
  if (index.entries.length === 0) {
    return { ...base, status: 'novel', nearest: null };
  }
  const queryVec = await embedSemantic(query);
  const nearest = nearestByCosine(queryVec, index);
  return {
    ...base,
    status: nearest && nearest.similarity >= threshold ? 'near-duplicate' : 'novel',
    nearest,
  };
}

/** Serialize the index to a JSON-safe object (for an on-disk runtime cache). */
export function serializeIndex(index: SemanticCorpusIndex): string {
  return JSON.stringify(index);
}

/** Parse + validate a serialized index. Throws on shape/version/model mismatch. */
export function deserializeIndex(json: string): SemanticCorpusIndex {
  const parsed = JSON.parse(json) as SemanticCorpusIndex;
  if (parsed.indexVersion !== SEMANTIC_CORPUS_INDEX_VERSION) {
    throw new Error(`semantic-corpus-index: unsupported index version ${parsed.indexVersion}`);
  }
  if (parsed.modelId !== SEMANTIC_NOVELTY_MODEL) {
    throw new Error(`semantic-corpus-index: index model ${parsed.modelId} != ${SEMANTIC_NOVELTY_MODEL}`);
  }
  if (!Array.isArray(parsed.entries) || parsed.entries.some((e) => !Array.isArray(e.vector))) {
    throw new Error('semantic-corpus-index: malformed entries (missing vectors)');
  }
  return parsed;
}
