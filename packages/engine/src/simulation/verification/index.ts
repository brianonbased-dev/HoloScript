/**
 * Verification — Grid convergence analysis and V&V reporting utilities.
 */

export {
  errorL2,
  errorLinf,
  relativeErrorL2,
  computeObservedOrder,
  convergenceOrderTwoLevel,
  richardsonExtrapolation,
  gridConvergenceIndex,
  runConvergenceStudy,
  type ConvergenceStudyResult,
} from './ConvergenceAnalysis';

export {
  createVerificationReport,
  renderReportMarkdown,
  renderReportLatex,
  type BenchmarkResult,
  type VerificationReport,
} from './ReportGenerator';
