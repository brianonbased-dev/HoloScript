/**
 * QualityScore.ts
 *
 * Calculates a composite quality score for the HoloScript self-improvement
 * pipeline using a weighted multi-dimensional formula:
 *
 *   quality = test_pass_rate     * 0.30
 *           + coverage           * 0.25
 *           + type_check_pass    * 0.20
 *           + lint_score         * 0.10
 *           + circuit_breaker_health * 0.15
 *
 * Each dimension is normalised to [0, 1] before weighting.
 *
 * @module self-improvement
 */

// =============================================================================
// TYPES
// =============================================================================

/** Raw metric inputs collected from tool runners */
export interface QualityMetrics {
  /** Number of test cases that passed */
  testsPassed: number;
  /** Total number of test cases executed */
  testsTotal: number;
  /** Statement/line coverage percentage (0-100) */
  coveragePercent: number;
  /** Whether TypeScript type-checking passed without errors (true = clean) */
  typeCheckPassed: boolean;
  /** Number of lint warnings + errors */
  lintIssues: number;
  /** Total files linted (used to normalise lint score) */
  lintFilesTotal: number;
  /** Circuit breaker health score (0-100) from CircuitBreakerMetrics */
  circuitBreakerHealth: number;
}

/** Breakdown of each weighted dimension */
export interface QualityDimension {
  /** Normalised value before weighting (0-1) */
  raw: number;
  /** Weight applied to this dimension */
  weight: number;
  /** Weighted contribution to the final score */
  weighted: number;
}

/** Full quality score report */
export interface QualityReport {
  /** Composite score (0-1) */
  score: number;
  /** Composite score as percentage (0-100) */
  scorePercent: number;
  /** Per-dimension breakdown */
  dimensions: {
    testPassRate: QualityDimension;
    coverage: QualityDimension;
    typeCheckPass: QualityDimension;
    lintScore: QualityDimension;
    circuitBreakerHealth: QualityDimension;
  };
  /** ISO 8601 timestamp of calculation */
  timestamp: string;
  /** Human-readable status label */
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

// =============================================================================
// WEIGHTS (must sum to 1.0)
// =============================================================================

export const QUALITY_WEIGHTS = {
  testPassRate: 0.3,
  coverage: 0.25,
  typeCheckPass: 0.2,
  lintScore: 0.1,
  circuitBreakerHealth: 0.15,
} as const;

// Compile-time assertion that weights sum to 1.0
const _weightSum =
  QUALITY_WEIGHTS.testPassRate +
  QUALITY_WEIGHTS.coverage +
  QUALITY_WEIGHTS.typeCheckPass +
  QUALITY_WEIGHTS.lintScore +
  QUALITY_WEIGHTS.circuitBreakerHealth;

if (Math.abs(_weightSum - 1.0) > 1e-9) {
  throw new Error(`Quality weights must sum to 1.0 but got ${_weightSum}`);
}

// =============================================================================
// CALCULATOR
// =============================================================================

/**
 * Calculate a composite quality score from raw metrics.
 *
 * Each dimension is normalised to [0, 1]:
 * - testPassRate:          passed / total (0 if total === 0)
 * - coverage:              coveragePercent / 100
 * - typeCheckPass:         1 if clean, 0 otherwise
 * - lintScore:             1 - (issues / max(1, filesTotal * 10))
 *                          (assumes <= 10 issues per file is "full issues")
 * - circuitBreakerHealth:  circuitBreakerHealth / 100
 */
export function calculateQualityScore(metrics: QualityMetrics): QualityReport {
  // --- Normalise each dimension to [0, 1] ---

  const testPassRate = metrics.testsTotal > 0 ? metrics.testsPassed / metrics.testsTotal : 0;

  const coverage = clamp(metrics.coveragePercent / 100, 0, 1);

  const typeCheckPass = metrics.typeCheckPassed ? 1 : 0;

  // Lint: perfect = 0 issues. We assume a max of 10 issues/file as "fully bad".
  const maxLintIssues = Math.max(1, metrics.lintFilesTotal * 10);
  const lintScore = clamp(1 - metrics.lintIssues / maxLintIssues, 0, 1);

  const circuitBreakerHealth = clamp(metrics.circuitBreakerHealth / 100, 0, 1);

  // --- Weighted combination ---

  const dims = {
    testPassRate: makeDimension(testPassRate, QUALITY_WEIGHTS.testPassRate),
    coverage: makeDimension(coverage, QUALITY_WEIGHTS.coverage),
    typeCheckPass: makeDimension(typeCheckPass, QUALITY_WEIGHTS.typeCheckPass),
    lintScore: makeDimension(lintScore, QUALITY_WEIGHTS.lintScore),
    circuitBreakerHealth: makeDimension(circuitBreakerHealth, QUALITY_WEIGHTS.circuitBreakerHealth),
  };

  const score =
    dims.testPassRate.weighted +
    dims.coverage.weighted +
    dims.typeCheckPass.weighted +
    dims.lintScore.weighted +
    dims.circuitBreakerHealth.weighted;

  const scorePercent = Math.round(score * 10000) / 100; // two decimal places

  return {
    score: Math.round(score * 10000) / 10000,
    scorePercent,
    dimensions: dims,
    timestamp: new Date().toISOString(),
    status: statusFromScore(score),
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function makeDimension(raw: number, weight: number): QualityDimension {
  return {
    raw: Math.round(raw * 10000) / 10000,
    weight,
    weighted: Math.round(raw * weight * 10000) / 10000,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function statusFromScore(score: number): QualityReport['status'] {
  if (score >= 0.9) return 'excellent';
  if (score >= 0.75) return 'good';
  if (score >= 0.55) return 'fair';
  if (score >= 0.35) return 'poor';
  return 'critical';
}
