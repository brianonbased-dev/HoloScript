/**
 * SemanticNoveltyEncoder — the learned-local-semantic ADVISORY layer for the
 * conjecture novelty check (D.060 / scope 2026-05-23_holoembed-semantic-encoder).
 *
 * The shipped novelty check (`assessConjectureNovelty`) uses HoloEmbed char-trigram
 * histograms — a LEXICAL exact-restatement guard that catches near-verbatim restatements
 * only (a paraphrase of a known result returns `novel`, a false negative — the W.520 trap).
 * This module adds a genuinely SEMANTIC layer using a local learned model
 * (`Xenova/all-MiniLM-L6-v2`) via the already-present `@huggingface/transformers` — no new
 * heavy dependency, runs offline/CPU (sovereign, F.063), NOT an external API.
 *
 * LAYERING (the determinism resolution): the deterministic trigram guard stays
 * RECEIPT-BINDING; this learned layer is ADVISORY only — it does NOT feed any receipt
 * hash. Same-text determinism is verified (byte-identical vectors across runs on one
 * machine), but cross-fleet floating-point reproducibility is unproven, so it must not
 * enter a receipt until that determinism gate passes. It returns a review signal
 * ("resembles known result X at 0.82"), never a receipt-binding verdict.
 *
 * Empirically (probe 2026-05-23, this model, cached): Euler's-formula claim vs a paraphrase
 * = cos 0.73; vs an unrelated sentence = cos 0.08 — clean separation the trigram check (at
 * 0.995) misses entirely. Async (model inference); the trigram path stays sync.
 */

import type { ConjecturePriorArtEntry } from './ConjectureEngine';

/** Pinned model — local ONNX via transformers.js. 384-dim, mean-pooled, L2-normalized. */
export const SEMANTIC_NOVELTY_MODEL = 'Xenova/all-MiniLM-L6-v2' as const;

/**
 * Default advisory threshold. Calibrated from the 2026-05-23 probe (paraphrase 0.73,
 * unrelated 0.08); 0.6 catches paraphrases with margin while excluding unrelated text.
 * [verify] re-calibrate on a labeled paraphrase set (scope P2) before any promotion to
 * receipt-binding.
 */
export const SEMANTIC_NOVELTY_THRESHOLD = 0.6;

export type SemanticNoveltyStatus = 'near-duplicate' | 'novel';

export interface SemanticNoveltyMatch {
  priorArtId: string;
  source: string;
  title?: string;
  statement: string;
  similarity: number;
}

export interface SemanticNoveltyAssessment {
  /** ADVISORY — never receipt-binding (see module note). */
  binding: 'advisory';
  provider: 'transformers.js';
  modelId: typeof SEMANTIC_NOVELTY_MODEL;
  status: SemanticNoveltyStatus;
  threshold: number;
  corpusSize: number;
  query: string;
  nearest: SemanticNoveltyMatch | null;
}

// Lazy singleton — the model loads once, on first use, offline if cached.
let extractorPromise: Promise<(text: string) => Promise<number[]>> | null = null;

async function getExtractor(): Promise<(text: string) => Promise<number[]>> {
  extractorPromise ??= (async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const extractor = await pipeline('feature-extraction', SEMANTIC_NOVELTY_MODEL);
    return async (text: string) => {
      const out = await extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(out.data as Iterable<number>);
    };
  })();
  return extractorPromise;
}

/** Embed text into a mean-pooled, L2-normalized vector via the local learned model. */
export async function embedSemantic(text: string): Promise<number[]> {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('semantic-novelty: text must be a non-empty string');
  }
  const embed = await getExtractor();
  return embed(text);
}

/** Cosine similarity of two equal-length vectors (inputs are L2-normalized → dot product). */
export function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length) {
    throw new Error('semantic-novelty: vectors must have equal length');
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * ADVISORY semantic novelty assessment: embeds the query + each corpus statement with the
 * local learned model and flags `near-duplicate` if the nearest match is >= threshold.
 * Unlike the trigram guard, this catches PARAPHRASES of known results. NOT receipt-binding.
 */
export async function assessSemanticNovelty(
  query: string,
  corpus: ReadonlyArray<ConjecturePriorArtEntry>,
  threshold: number = SEMANTIC_NOVELTY_THRESHOLD,
): Promise<SemanticNoveltyAssessment> {
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('semantic-novelty: query must be a non-empty string');
  }
  const base = {
    binding: 'advisory' as const,
    provider: 'transformers.js' as const,
    modelId: SEMANTIC_NOVELTY_MODEL,
    threshold,
    corpusSize: corpus.length,
    query,
  };
  if (corpus.length === 0) {
    return { ...base, status: 'novel', nearest: null };
  }
  const queryVec = await embedSemantic(query);
  let nearest: SemanticNoveltyMatch | null = null;
  for (const entry of corpus) {
    const similarity = cosineSimilarity(queryVec, await embedSemantic(entry.statement));
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
  return {
    ...base,
    status: nearest && nearest.similarity >= threshold ? 'near-duplicate' : 'novel',
    nearest,
  };
}
