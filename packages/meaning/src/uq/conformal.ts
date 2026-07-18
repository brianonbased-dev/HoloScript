/**
 * conformal.ts — split-conformal coverage wrapped around the verifier of record V.
 *
 * WHY THIS EXISTS (research/2026-07-17_probability-uncertainty-in-the-holoscript-program.md, harvest #1):
 *   Conformal prediction is the one distribution-free coverage guarantee the LLM-uncertainty world
 *   reaches for, but it is starved for a GROUND-TRUTH oracle — CP-for-LLMs approximates correctness
 *   with heuristics (self-consistency, logprob thresholds). HoloScript already OWNS that oracle:
 *   `gradeByResolver` (verifier.ts) runs the SAME shipped `resolve*` that labels the corpus, and its
 *   verdict is a hard BINARY correctness bit — resolved-and-correct, or not. Feeding that bit as the
 *   nonconformity score turns split conformal from an approximation into an exact, sovereign guarantee.
 *
 * WHAT THIS IS (and is NOT):
 *   This module does NOT grade anything. It consumes ALREADY-GRADED outcomes — `{family, correct}` —
 *   produced by `gradeByResolver`, and computes the split-conformal coverage bound over a held-out
 *   CALIBRATION split. Grading stays in verifier.ts (one labeler, verifier.ts §"verifier of record").
 *
 * THE MATH (split conformal, Vovk / Lei et al. 2018):
 *   Nonconformity score  s_i = 1 - correct_i   (0 if V passed, 1 if V failed → an incorrect committed
 *   answer is MAXIMALLY nonconforming). Given a target miscoverage α and n calibration scores, the
 *   conformal threshold is the k-th smallest score with the FINITE-SAMPLE-CORRECTED index
 *
 *        k = ceil( (n+1)(1-α) )                                    (the Vovk quantile index)
 *
 *   and the distribution-free marginal coverage of a fresh exchangeable point obeys
 *
 *        P(s_{n+1} ≤ q̂)  ≥  k / (n+1)  ≥  1 - α          (exact finite-sample lower bound)
 *
 *   We report `lowerBound = k/(n+1)` — the EXACT guaranteed coverage at this n, which is ≥ 1-α and
 *   tightens toward 1-α as n grows. When k > n (α too small for this n) no finite threshold achieves
 *   the level: the conformal set is trivially everything and NO non-trivial guarantee exists → we
 *   fail closed (valid=false, lowerBound=0, a warning) rather than oversell a vacuous "100% coverage".
 *
 * EXCHANGEABILITY CAVEAT (verified load-bearing):
 *   The marginal guarantee assumes the calibration and test points are EXCHANGEABLE. The 14 resolver
 *   families are NOT exchangeable with each other (occlusion vs. beneficiary vs. temporal have wildly
 *   different base pass-rates), so a single pooled bound silently under/over-covers any one family.
 *   `conformalCoverageByFamily` conditions the guarantee PER FAMILY (Mondrian conformal). Even within
 *   a family, distribution SHIFT between calibration and deployment breaks exchangeability; the
 *   documented follow-up for that is DS-CP / adaptive-CP reweighting (not implemented here).
 *
 * HONESTY (the real calibration split is TINY — ~12 unsolvable + 6 solvable):
 *   Every bound carries the finite-sample correction explicitly and emits a `warning` when n is too
 *   small for a VALID α (k>n) or too small for a TIGHT one (finite-sample slack 1/(n+1) is a large
 *   fraction of α). Do not read a tiny-n bound as a tight one.
 *
 * @module @holoscript/meaning/uq
 */

/**
 * One already-graded outcome from the verifier of record. `correct` is the BINARY verdict of
 * `gradeByResolver`/V on that item (resolved AND matching gold). `family` is required only for the
 * Mondrian (per-family) variant; the pooled bound ignores it.
 */
export interface GradedOutcome {
  /** The resolver family that produced the verdict (e.g. 'occlusion'). Optional for the pooled bound. */
  family?: string;
  /** V's binary correctness bit: true iff the committed answer was verified correct. */
  correct: boolean;
}

/** A split-conformal coverage bound over one (sub)population of graded outcomes. */
export interface ConformalCoverageBound {
  /** The target miscoverage level requested. */
  alpha: number;
  /** Size of the calibration split this bound was computed over. */
  nCalib: number;
  /** Realized coverage of the conformal set on the calibration split (fraction with score ≤ q̂). */
  empiricalCoverage: number;
  /**
   * EXACT distribution-free lower bound on the coverage of a fresh exchangeable point: k/(n+1) ≥ 1-α.
   * 0 when no non-trivial guarantee is achievable (fail-closed; see `valid`).
   */
  lowerBound: number;
  /** The conformal nonconformity threshold q̂ (0 or 1 for the binary V score; +Infinity if unachievable). */
  quantile: number;
  /** Raw verifier pass rate on the split (fraction of outcomes V marked correct). Reported for honesty. */
  accuracy: number;
  /** True iff a finite threshold achieves ≥ 1-α at this (n, α) — i.e. k = ceil((n+1)(1-α)) ≤ n. */
  valid: boolean;
  /** Present when nCalib is too small for a VALID α, too small for a TIGHT one, or the input was malformed. */
  warning?: string;
}

/** A per-family (Mondrian) conformal report: one conditioned bound per family plus the pooled bound. */
export interface MondrianCoverageReport {
  alpha: number;
  /** Conditioned coverage bound for each family present in the calibration split. */
  perFamily: Record<string, ConformalCoverageBound>;
  /** Families observed, in first-seen order. */
  families: string[];
  /** The single pooled bound over ALL outcomes — reported only as a NON-exchangeable baseline. */
  pooled: ConformalCoverageBound;
  /** Present when any family split is too small (the common case at current calibration sizes). */
  warning?: string;
}

/** Guard: a usable miscoverage level lies strictly in (0, 1). */
function isValidAlpha(alpha: number): boolean {
  return Number.isFinite(alpha) && alpha > 0 && alpha < 1;
}

/**
 * Count verified-correct outcomes, treating any MALFORMED entry as INCORRECT (score = 1, maximally
 * nonconforming). Fail-closed: an unverifiable verdict must never inflate the guarantee.
 */
function countCorrect(outcomes: readonly GradedOutcome[]): number {
  let correct = 0;
  for (const o of outcomes) {
    if (o != null && o.correct === true) correct += 1;
  }
  return correct;
}

/**
 * Split-conformal coverage bound over a calibration set of binary V verdicts.
 *
 * Nonconformity score s_i = 1 - correct_i. Returns the finite-sample-corrected conformal quantile and
 * the exact distribution-free coverage lower bound k/(n+1) ≥ 1-α. Never throws: on empty input or an
 * invalid α it fails closed (valid=false, lowerBound=0, warning), returning the lower-trust value.
 *
 * @param calibration held-out graded outcomes (order irrelevant; exchangeability assumed WITHIN this set)
 * @param alpha target miscoverage in (0, 1) — coverage target is 1-α
 */
export function conformalCoverageBound(
  calibration: readonly GradedOutcome[],
  alpha: number,
): ConformalCoverageBound {
  const n = Array.isArray(calibration) ? calibration.length : 0;

  // Fail closed on malformed / empty input: no data ⇒ no guarantee (lower-trust value).
  if (n === 0 || !isValidAlpha(alpha)) {
    return {
      alpha,
      nCalib: n,
      empiricalCoverage: 0,
      lowerBound: 0,
      quantile: Number.POSITIVE_INFINITY,
      accuracy: 0,
      valid: false,
      warning:
        n === 0
          ? 'empty calibration split — no coverage guarantee possible (fail-closed)'
          : `invalid alpha=${alpha} (must be strictly in (0,1)) — no guarantee (fail-closed)`,
    };
  }

  const correct = countCorrect(calibration);
  const accuracy = correct / n;

  // Vovk finite-sample quantile index. k > n ⇒ α too small for this n ⇒ no finite non-trivial threshold.
  const k = Math.ceil((n + 1) * (1 - alpha));
  const achievable = k <= n;

  if (!achievable) {
    // The conformal set would be ALL scores (q̂ = +∞); coverage is trivially 1 but the guarantee is
    // vacuous. Report it as such rather than overselling. Minimum n for validity is ceil(1/alpha) - 1.
    const minN = Math.ceil(1 / alpha) - 1;
    return {
      alpha,
      nCalib: n,
      empiricalCoverage: 1, // trivial set covers everything
      lowerBound: 0, // NO non-trivial distribution-free guarantee at this (n, α)
      quantile: Number.POSITIVE_INFINITY,
      accuracy,
      valid: false,
      warning: `nCalib=${n} too small for alpha=${alpha}: ceil((n+1)(1-alpha))=${k} > n. Need n >= ${minN} for a non-trivial conformal set; the guarantee here is vacuous (set = everything).`,
    };
  }

  // Binary scores sorted ascending are [0]*correct then [1]*(n-correct). The k-th smallest (1-indexed)
  // is 0 iff k ≤ correct, else 1. (Count-based; equivalent to sorting the binary score vector.)
  const quantile = k <= correct ? 0 : 1;
  const empiricalCoverage = quantile === 0 ? correct / n : 1;
  const lowerBound = k / (n + 1); // exact finite-sample distribution-free coverage lower bound (≥ 1-α)

  // Even when valid, warn if the finite-sample slack 1/(n+1) is a large fraction of the target α —
  // the guarantee is loose and DS-CP/adaptive-CP reweighting is the follow-up under domain shift.
  const slack = 1 / (n + 1);
  const warning =
    slack > alpha / 2
      ? `small calibration split (nCalib=${n}): coverage guarantee is finite-sample-loose (slack up to 1/(n+1)=${slack.toFixed(4)}, comparable to alpha=${alpha}). Treat as indicative, not tight; DS-CP/adaptive-CP reweighting is the follow-up for domain shift.`
      : undefined;

  return {
    alpha,
    nCalib: n,
    empiricalCoverage,
    lowerBound,
    quantile,
    accuracy,
    valid: true,
    ...(warning !== undefined ? { warning } : {}),
  };
}

/**
 * Mondrian (per-family) split conformal: condition the coverage guarantee on the resolver family, so
 * each of the non-exchangeable families gets its OWN bound. Outcomes without a `family` are bucketed
 * under '__unlabeled__'. Also returns the single pooled bound as a (deliberately non-exchangeable)
 * baseline. Never throws.
 *
 * @param calibration held-out graded outcomes, each ideally carrying a `family`
 * @param alpha target miscoverage in (0, 1)
 */
export function conformalCoverageByFamily(
  calibration: readonly GradedOutcome[],
  alpha: number,
): MondrianCoverageReport {
  const safe: readonly GradedOutcome[] = Array.isArray(calibration) ? calibration : [];

  const buckets = new Map<string, GradedOutcome[]>();
  const order: string[] = [];
  for (const o of safe) {
    const fam = o != null && typeof o.family === 'string' && o.family.length > 0 ? o.family : '__unlabeled__';
    let bucket = buckets.get(fam);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(fam, bucket);
      order.push(fam);
    }
    bucket.push(o);
  }

  const perFamily: Record<string, ConformalCoverageBound> = {};
  const looseFamilies: string[] = [];
  for (const fam of order) {
    const bound = conformalCoverageBound(buckets.get(fam) as GradedOutcome[], alpha);
    perFamily[fam] = bound;
    if (!bound.valid || bound.warning !== undefined) looseFamilies.push(fam);
  }

  const pooled = conformalCoverageBound(safe, alpha);

  const warning =
    looseFamilies.length > 0
      ? `per-family conformal split is small/invalid for: ${looseFamilies.join(', ')}. Per-family guarantees are the correct target (families are non-exchangeable) but need more calibration data to be tight.`
      : undefined;

  return {
    alpha,
    perFamily,
    families: order,
    pooled,
    ...(warning !== undefined ? { warning } : {}),
  };
}
