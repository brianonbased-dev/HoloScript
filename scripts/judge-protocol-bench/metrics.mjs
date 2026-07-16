/**
 * Metrics for the judge-protocol transfer benchmark: rank recovery,
 * pairwise concordance, position-flip rate, effective reviewer count.
 *
 * All formulas are documented inline with their assumptions — several are
 * deliberately simple, honestly-labeled approximations appropriate for a
 * v0/tracer-bullet sample size, not publication-grade estimators.
 */

/** Tie-corrected rank vector: average ("mid-rank") for tied values, lower value = better/rank 1. */
export function toMidRanks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const midRank = (i + j) / 2 + 1; // average of the tied positions, 1-indexed
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = midRank;
    i = j + 1;
  }
  return ranks;
}

/** Pearson correlation of two equal-length numeric vectors (== tie-corrected Spearman when inputs are mid-ranks). n<2 -> null. */
export function pearson(a, b) {
  const n = a.length;
  if (n < 2) return null;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return denA === denB ? 1 : 0; // both constant (all tied) -> perfect agreement by convention
  return num / Math.sqrt(denA * denB);
}

/** Tie-corrected Spearman rho between a true-rank vector and an implied-score vector (lower true rank = better; higher implied score = better, so we negate). */
export function spearmanRho(trueRanks, impliedScoresHigherIsBetter) {
  const trueMid = toMidRanks(trueRanks);
  const impliedMid = toMidRanks(impliedScoresHigherIsBetter.map((s) => -s));
  return pearson(trueMid, impliedMid);
}

/**
 * Per-pair concordance score against ground truth, with partial credit for
 * ties on either side (a common Kendall-tau-b-style tie handling):
 *   - both strictly ordered the same direction -> 1
 *   - both agree it's a tie -> 1
 *   - one side is a tie, the other is a strict order -> 0.5
 *   - both strictly ordered, opposite directions -> 0
 * `trueDir`/`implDir` are each -1 (first is better), 0 (tie), or 1 (second is better).
 */
export function pairConcordance(trueDir, implDir) {
  if (trueDir === implDir) return 1;
  if (trueDir === 0 || implDir === 0) return 0.5;
  return 0; // -1 vs 1: strict reversal
}

export function rankToDir(rankA, rankB) {
  if (rankA === rankB) return 0;
  return rankA < rankB ? -1 : 1; // lower rank number = better = "first is better"
}

/**
 * Effective independent reviewer count from a two-judge agreement rate on
 * non-tie comparisons, inspired by (not a reproduction of) the internal
 * June planted-set formula referenced in the parent research doc (mean
 * reviewer-error correlation 0.375 -> ~2.09 effective reviewers for 6
 * same-model seats). Here: r = 2*agreementRate - 1 (agreementRate 0.5 =
 * chance/no-correlation -> r=0 -> 2 fully independent reviewers;
 * agreementRate 1 -> r=1 -> 1 effective reviewer for a 2-judge panel).
 * This is an ad hoc, clearly-labeled v0 approximation, not a validated
 * statistical estimator — reported as such in the receipt.
 */
export function effectiveReviewers(agreementRate, panelSize = 2) {
  if (agreementRate == null) return null;
  const r = Math.max(-1, Math.min(1, 2 * agreementRate - 1));
  return panelSize / (1 + r * (panelSize - 1));
}

export function mean(xs) {
  const vals = xs.filter((x) => x != null && Number.isFinite(x));
  if (vals.length === 0) return null;
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}
