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
 * Default advisory threshold, CALIBRATED (scope P2, 2026-05-23) on the labeled eval set
 * below: same-result paraphrases scored 0.65–0.72, different/unrelated scored 0.02–0.32
 * (cleanly separable, gap 0.34, midpoint ≈0.49). 0.5 sits centered in the gap — 0.18
 * above every no-match and 0.15 below every match — so it is robust to harder paraphrases
 * and recall-favoring (right for an ADVISORY flag, where a missed rediscovery is worse
 * than a flagged-for-review false positive). Still advisory-only; re-run calibration if
 * the model changes.
 */
export const SEMANTIC_NOVELTY_THRESHOLD = 0.5;

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

export interface LabeledNoveltyPair {
  query: string;
  reference: string;
  /** true = query is the SAME result as reference (a paraphrase); false = different/unrelated. */
  isMatch: boolean;
}

/**
 * Labeled eval set for threshold calibration (scope P2) — paraphrases of known results
 * across the engine's live domains (should match) vs different/unrelated claims (should not).
 * Durable artifact: reused by the determinism gate (P1) and corpus work (P3).
 */
export const LABELED_NOVELTY_EVAL_SET: ReadonlyArray<LabeledNoveltyPair> = [
  { query: 'Any convex solid: corners minus edges plus faces is two.', reference: 'For every convex polyhedron, vertices minus edges plus faces equals two.', isMatch: true },
  { query: 'The long side squared equals the sum of the squares of the two legs.', reference: 'In a right triangle the hypotenuse squared equals the sum of the squares of the other two sides.', isMatch: true },
  { query: '4/n splits into three unit fractions for all n at least 2.', reference: 'For every integer n>=2, 4/n equals 1/x + 1/y + 1/z.', isMatch: true },
  { query: 'Two curves of degree d and e cross in d times e points.', reference: 'Two generic plane curves of degrees d1 and d2 intersect in d1*d2 points.', isMatch: true },
  { query: 'Every even number above two is a sum of two primes.', reference: 'For every integer n>=2, 4/n equals 1/x + 1/y + 1/z.', isMatch: false },
  { query: 'A graph is planar iff it has no K5 or K3,3 minor.', reference: 'Two generic plane curves of degrees d1 and d2 intersect in d1*d2 points.', isMatch: false },
  { query: 'In a right triangle the hypotenuse squared equals the sum of the squares of the other two sides.', reference: 'For every convex polyhedron, vertices minus edges plus faces equals two.', isMatch: false },
  { query: 'The cat sat on the warm windowsill in the afternoon sun.', reference: 'For every convex polyhedron, vertices minus edges plus faces equals two.', isMatch: false },
];

export interface ThresholdCalibration {
  threshold: number;
  separable: boolean;
  minMatchSim: number;
  maxNoMatchSim: number;
  gap: number;
}

/**
 * Pure calibration: given scored (similarity, isMatch) pairs, return the midpoint
 * threshold between the lowest match and the highest no-match, plus whether the classes
 * are separable and the margin. Deterministic; no model required.
 */
export function calibrateNoveltyThreshold(
  scored: ReadonlyArray<{ similarity: number; isMatch: boolean }>,
): ThresholdCalibration {
  const match = scored.filter((s) => s.isMatch).map((s) => s.similarity);
  const noMatch = scored.filter((s) => !s.isMatch).map((s) => s.similarity);
  if (match.length === 0 || noMatch.length === 0) {
    throw new Error('semantic-novelty: calibration needs at least one match and one no-match');
  }
  const minMatchSim = Math.min(...match);
  const maxNoMatchSim = Math.max(...noMatch);
  return {
    threshold: Math.round(((minMatchSim + maxNoMatchSim) / 2) * 1000) / 1000,
    separable: minMatchSim > maxNoMatchSim,
    minMatchSim,
    maxNoMatchSim,
    gap: Math.round((minMatchSim - maxNoMatchSim) * 1000) / 1000,
  };
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
