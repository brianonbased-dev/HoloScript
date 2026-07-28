/**
 * @holoscript/meaning/uq — uncertainty quantification wrapped around the verifier of record.
 *
 * Split-conformal coverage (and its Mondrian per-family variant) whose nonconformity score is the
 * BINARY correctness verdict of `gradeByResolver` / V. This is the sovereign harvest of CP-for-LLMs:
 * HoloScript owns the ground-truth oracle that conformal prediction usually only approximates.
 *
 * Consumed downstream by the ai-ecosystem receipt emitters (they feed graded outcomes in; this module
 * only computes the distribution-free bound — it never grades).
 */
export type { GradedOutcome, ConformalCoverageBound, MondrianCoverageReport } from './conformal';
export { conformalCoverageBound, conformalCoverageByFamily } from './conformal';
