/**
 * ConjectureSemanticAdvisory — attaches the learned-semantic novelty signal to a finished
 * Conjecture Engine receipt, WITHOUT touching the receipt or its hash (scope 2026-05-23 P3).
 *
 * THE LAYERING (why this is a sibling, not a field): `runConjecture` (ConjectureEngine.ts) is
 * SYNC and its `evaluations[].novelty` (lexical char-trigram) is RECEIPT-BINDING — it feeds
 * both the status gate and `receiptSnapshot` → the receipt hash. The learned-semantic layer is
 * (a) ASYNC (model inference) and (b) MUST NOT enter that hash until the cross-fleet determinism
 * gate passes (P1 verdict today: divergent at p6 → advisory only). So we do NOT add a field to
 * `ConjectureReceipt`; we return a SEPARATE wrapper that carries the receipt unchanged plus the
 * advisory beside it. The receipt's `receiptKey` is byte-identical with or without this call.
 *
 * What a reviewer gets: "trigram says novel; semantic says resembles arXiv:2605.x @ 0.71 —
 * review." A second opinion the lexical guard structurally cannot give (it only catches
 * near-verbatim restatements; this catches paraphrases — the W.520 false-negative).
 */

import type { ConjectureReceipt, ConjectureStatus } from './ConjectureEngine';
import type { SemanticNoveltyAssessment } from './SemanticNoveltyEncoder';
import { assessSemanticNoveltyIndexed, type SemanticCorpusIndex } from './SemanticCorpusIndex';

/**
 * Statuses for which a semantic novelty second-opinion is meaningful: the claim was actually
 * evaluated and not refuted. `out-of-scope` was never examined; `falsified` is already wrong,
 * so "is it novel" is moot. Override via options.runWhen if a caller wants a different policy.
 */
const DEFAULT_ADVISORY_STATUSES: ReadonlyArray<ConjectureStatus> = ['survived', 'rediscovered', 'undecided'];

export interface ConjectureReceiptWithAdvisory {
  /** The unmodified receipt — its receiptKey is unaffected by this wrapper. */
  receipt: ConjectureReceipt;
  /**
   * ADVISORY learned-semantic novelty against the corpus index, or null when skipped (status
   * not in the advisory set, or empty index). NEVER part of receipt.receiptKey.
   */
  semanticAdvisory: SemanticNoveltyAssessment | null;
  /** Why the advisory is null, when it is — so a reviewer isn't left guessing. */
  advisorySkippedReason?: 'status-not-advisable' | 'empty-index';
}

export interface AttachSemanticAdvisoryOptions {
  /** Statuses for which the advisory runs. Default: survived / rediscovered / undecided. */
  runWhen?: ReadonlyArray<ConjectureStatus>;
  /** Advisory threshold override (defaults to the encoder's calibrated SEMANTIC_NOVELTY_THRESHOLD). */
  threshold?: number;
}

/**
 * Run the learned-semantic novelty check against the pre-embedded corpus index and return the
 * receipt UNCHANGED plus the advisory beside it. Async (model inference on the query only —
 * the corpus is already embedded). The receipt and its hash are never mutated.
 */
export async function attachSemanticAdvisory(
  receipt: ConjectureReceipt,
  index: SemanticCorpusIndex,
  options: AttachSemanticAdvisoryOptions = {},
): Promise<ConjectureReceiptWithAdvisory> {
  const runWhen = options.runWhen ?? DEFAULT_ADVISORY_STATUSES;
  if (!runWhen.includes(receipt.status)) {
    return { receipt, semanticAdvisory: null, advisorySkippedReason: 'status-not-advisable' };
  }
  if (index.entries.length === 0) {
    return { receipt, semanticAdvisory: null, advisorySkippedReason: 'empty-index' };
  }
  const semanticAdvisory = await assessSemanticNoveltyIndexed(
    receipt.claim.statement,
    index,
    options.threshold,
  );
  return { receipt, semanticAdvisory };
}
