/**
 * @fileoverview SimulationLab Primitives - Runtime math and types for hypothesis testing
 * @module @holoscript/std/simulation
 *
 * Provides the mathematical building blocks for scientific hypothesis testing
 * in HoloScript simulations. Run N epochs with parameter sweeps, collect metrics,
 * and perform statistical analysis to prove or disprove hypotheses.
 *
 * The universe gets one sample. HoloScript gives you infinite.
 *
 * @version 1.0.0
 * @category simulation
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Direction of expected effect in a hypothesis.
 */
export type HypothesisDirection = 'greater' | 'less' | 'different' | 'equal';

/**
 * Status of a simulation run.
 */
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * A scientific hypothesis to test.
 */
export interface Hypothesis {
  /** Human-readable description */
  description: string;
  /** The null hypothesis (what we're trying to reject) */
  null_hypothesis: string;
  /** The alternative hypothesis (what we're testing for) */
  alternative_hypothesis: string;
  /** Expected direction of effect */
  direction: HypothesisDirection;
  /** Significance threshold (default: 0.05) */
  alpha: number;
}

/**
 * A range of parameter values to sweep.
 */
export interface ParameterRange {
  /** Parameter name */
  name: string;
  /** Start value */
  min: number;
  /** End value */
  max: number;
  /** Step size */
  step: number;
}

/**
 * A set of discrete parameter values to sweep.
 */
export interface ParameterSet {
  /** Parameter name */
  name: string;
  /** Discrete values to test */
  values: number[];
}

/**
 * Either a range or discrete set of parameter values.
 */
export type ParameterSweep = ParameterRange | ParameterSet;

/**
 * Metrics collected from a single simulation run.
 */
export interface SimulationMetrics {
  /** Named metric values */
  values: Record<string, number>;
  /** Seed used for this run */
  seed: number;
  /** Parameter values used */
  params: Record<string, number>;
  /** Wall-clock time in ms */
  durationMs: number;
}

/**
 * Result of a statistical test.
 */
export interface StatisticalResult {
  /** Test statistic value */
  statistic: number;
  /** p-value (probability of observing result under null hypothesis) */
  pValue: number;
  /** Whether the null hypothesis is rejected at the given alpha */
  significant: boolean;
  /** Confidence interval [lower, upper] */
  confidenceInterval: [number, number];
  /** Effect size (Cohen's d for t-test) */
  effectSize: number;
  /** Name of the test used */
  testName: string;
  /** Number of samples */
  sampleSize: number;
}

/**
 * Complete simulation experiment result.
 */
export interface ExperimentResult {
  /** The hypothesis tested */
  hypothesis: Hypothesis;
  /** Statistical results per metric */
  results: Record<string, StatisticalResult>;
  /** All collected metrics */
  metrics: SimulationMetrics[];
  /** Total epochs run */
  totalEpochs: number;
  /** Total wall-clock time */
  totalDurationMs: number;
  /** Status */
  status: SimulationStatus;
  /** Composition hash for reproducibility */
  compositionHash: string;
}

// =============================================================================
// PARAMETER SWEEP GENERATION
// =============================================================================

/**
 * Check if a parameter sweep is a range (vs discrete set).
 */
export function isParameterRange(sweep: ParameterSweep): sweep is ParameterRange {
  return 'min' in sweep && 'max' in sweep && 'step' in sweep;
}

/**
 * Generate all values from a parameter sweep.
 */
export function expandSweep(sweep: ParameterSweep): number[] {
  if (!isParameterRange(sweep)) {
    return (sweep as ParameterSet).values.slice();
  }

  const range = sweep as ParameterRange;
  if (range.step <= 0) return [range.min];
  if (range.min > range.max) return [];

  const values: number[] = [];
  for (let v = range.min; v <= range.max + range.step * 0.001; v += range.step) {
    values.push(Math.round(v * 1e10) / 1e10); // Avoid floating point drift
  }
  return values;
}

/**
 * Generate all parameter combinations from multiple sweeps.
 * Returns an array of parameter maps.
 */
export function generateSweepCombinations(
  sweeps: ParameterSweep[]
): Record<string, number>[] {
  if (sweeps.length === 0) return [{}];

  const expanded = sweeps.map(s => ({
    name: s.name,
    values: expandSweep(s),
  }));

  // Cartesian product
  let combinations: Record<string, number>[] = [{}];

  for (const { name, values } of expanded) {
    const newCombinations: Record<string, number>[] = [];
    for (const combo of combinations) {
      for (const val of values) {
        newCombinations.push({ ...combo, [name]: val });
      }
    }
    combinations = newCombinations;
  }

  return combinations;
}

// =============================================================================
// STATISTICAL FUNCTIONS
// =============================================================================

/**
 * Calculate the arithmetic mean of an array of numbers.
 */
export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, v) => sum + v, 0) / data.length;
}

/**
 * Calculate the sample variance (Bessel's correction).
 */
export function variance(data: number[]): number {
  if (data.length < 2) return 0;
  const m = mean(data);
  const squaredDiffs = data.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return squaredDiffs / (data.length - 1);
}

/**
 * Calculate the sample standard deviation.
 */
export function standardDeviation(data: number[]): number {
  return Math.sqrt(variance(data));
}

/**
 * Calculate the standard error of the mean.
 */
export function standardError(data: number[]): number {
  if (data.length === 0) return 0;
  return standardDeviation(data) / Math.sqrt(data.length);
}

/**
 * Calculate Cohen's d effect size between two groups.
 * d = (mean1 - mean2) / pooled_std
 */
export function cohensD(group1: number[], group2: number[]): number {
  if (group1.length < 2 || group2.length < 2) return 0;

  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);

  // Pooled standard deviation
  const n1 = group1.length;
  const n2 = group2.length;
  const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const pooledStd = Math.sqrt(pooledVar);

  if (pooledStd === 0) return 0;
  return (m1 - m2) / pooledStd;
}

/**
 * Two-sample independent t-test.
 *
 * Tests whether two groups have significantly different means.
 * Uses Welch's t-test (does not assume equal variances).
 */
export function tTest(
  group1: number[],
  group2: number[],
  alpha: number = 0.05,
  direction: HypothesisDirection = 'different'
): StatisticalResult {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) {
    return {
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceInterval: [0, 0],
      effectSize: 0,
      testName: 'welch_t_test',
      sampleSize: n1 + n2,
    };
  }

  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);
  const se = Math.sqrt(v1 / n1 + v2 / n2);

  if (se === 0) {
    return {
      statistic: 0,
      pValue: m1 === m2 ? 1 : 0,
      significant: m1 !== m2,
      confidenceInterval: [m1 - m2, m1 - m2],
      effectSize: 0,
      testName: 'welch_t_test',
      sampleSize: n1 + n2,
    };
  }

  const t = (m1 - m2) / se;

  // Welch–Satterthwaite degrees of freedom
  const num = (v1 / n1 + v2 / n2) ** 2;
  const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = num / den;

  // Approximate p-value using the t-distribution CDF approximation
  const pTwoTailed = tDistPValue(Math.abs(t), df);
  let pValue: number;

  switch (direction) {
    case 'greater':
      pValue = t > 0 ? pTwoTailed / 2 : 1 - pTwoTailed / 2;
      break;
    case 'less':
      pValue = t < 0 ? pTwoTailed / 2 : 1 - pTwoTailed / 2;
      break;
    case 'equal':
      pValue = 1 - pTwoTailed;
      break;
    default: // 'different'
      pValue = pTwoTailed;
  }

  // Confidence interval for the difference in means
  const tCrit = tDistCritical(alpha, df);
  const diff = m1 - m2;
  const ci: [number, number] = [diff - tCrit * se, diff + tCrit * se];

  return {
    statistic: t,
    pValue,
    significant: pValue < alpha,
    confidenceInterval: ci,
    effectSize: cohensD(group1, group2),
    testName: 'welch_t_test',
    sampleSize: n1 + n2,
  };
}

/**
 * One-sample t-test against a known value.
 */
export function oneSampleTTest(
  data: number[],
  populationMean: number,
  alpha: number = 0.05,
  direction: HypothesisDirection = 'different'
): StatisticalResult {
  const n = data.length;

  if (n < 2) {
    return {
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceInterval: [0, 0],
      effectSize: 0,
      testName: 'one_sample_t_test',
      sampleSize: n,
    };
  }

  const m = mean(data);
  const se = standardError(data);

  if (se === 0) {
    return {
      statistic: 0,
      pValue: m === populationMean ? 1 : 0,
      significant: m !== populationMean,
      confidenceInterval: [m, m],
      effectSize: 0,
      testName: 'one_sample_t_test',
      sampleSize: n,
    };
  }

  const t = (m - populationMean) / se;
  const df = n - 1;

  const pTwoTailed = tDistPValue(Math.abs(t), df);
  let pValue: number;

  switch (direction) {
    case 'greater':
      pValue = t > 0 ? pTwoTailed / 2 : 1 - pTwoTailed / 2;
      break;
    case 'less':
      pValue = t < 0 ? pTwoTailed / 2 : 1 - pTwoTailed / 2;
      break;
    default:
      pValue = pTwoTailed;
  }

  const tCrit = tDistCritical(alpha, df);
  const ci: [number, number] = [m - tCrit * se, m + tCrit * se];

  const sd = standardDeviation(data);
  const effectSize = sd > 0 ? (m - populationMean) / sd : 0;

  return {
    statistic: t,
    pValue,
    significant: pValue < alpha,
    confidenceInterval: ci,
    effectSize,
    testName: 'one_sample_t_test',
    sampleSize: n,
  };
}

/**
 * Mann-Whitney U test (non-parametric alternative to t-test).
 * Tests whether one group tends to have larger values than the other.
 */
export function mannWhitneyU(
  group1: number[],
  group2: number[],
  alpha: number = 0.05
): StatisticalResult {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 === 0 || n2 === 0) {
    return {
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceInterval: [0, 0],
      effectSize: 0,
      testName: 'mann_whitney_u',
      sampleSize: n1 + n2,
    };
  }

  // Count how many times group1 values exceed group2 values
  let u1 = 0;
  for (const a of group1) {
    for (const b of group2) {
      if (a > b) u1++;
      else if (a === b) u1 += 0.5;
    }
  }

  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  // Normal approximation for larger samples
  const meanU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  if (sigmaU === 0) {
    return {
      statistic: u,
      pValue: 1,
      significant: false,
      confidenceInterval: [0, 0],
      effectSize: 0,
      testName: 'mann_whitney_u',
      sampleSize: n1 + n2,
    };
  }

  const z = (u - meanU) / sigmaU;
  const pValue = 2 * normalCDF(-Math.abs(z)); // Two-tailed

  // Effect size: rank-biserial correlation r = 1 - 2U/(n1*n2)
  const effectSize = 1 - (2 * u) / (n1 * n2);

  return {
    statistic: u,
    pValue,
    significant: pValue < alpha,
    confidenceInterval: [0, 0], // CI not standard for U-test
    effectSize,
    testName: 'mann_whitney_u',
    sampleSize: n1 + n2,
  };
}

/**
 * Chi-squared goodness-of-fit test.
 * Tests whether observed frequencies match expected frequencies.
 */
export function chiSquaredTest(
  observed: number[],
  expected: number[],
  alpha: number = 0.05
): StatisticalResult {
  if (observed.length !== expected.length || observed.length === 0) {
    return {
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceInterval: [0, 0],
      effectSize: 0,
      testName: 'chi_squared',
      sampleSize: 0,
    };
  }

  let chiSq = 0;
  let totalObserved = 0;

  for (let i = 0; i < observed.length; i++) {
    if (expected[i] <= 0) continue;
    chiSq += (observed[i] - expected[i]) ** 2 / expected[i];
    totalObserved += observed[i];
  }

  const df = observed.length - 1;
  if (df <= 0) {
    return {
      statistic: chiSq,
      pValue: 1,
      significant: false,
      confidenceInterval: [0, 0],
      effectSize: 0,
      testName: 'chi_squared',
      sampleSize: totalObserved,
    };
  }

  // Approximate p-value using Wilson-Hilferty approximation
  const pValue = chiSquaredPValue(chiSq, df);

  // Cramér's V effect size
  const k = observed.length;
  const effectSize = totalObserved > 0
    ? Math.sqrt(chiSq / (totalObserved * (k - 1)))
    : 0;

  return {
    statistic: chiSq,
    pValue,
    significant: pValue < alpha,
    confidenceInterval: [0, 0],
    effectSize,
    testName: 'chi_squared',
    sampleSize: totalObserved,
  };
}

// =============================================================================
// METRIC AGGREGATION
// =============================================================================

/**
 * Extract a named metric from an array of simulation results.
 */
export function extractMetric(
  results: SimulationMetrics[],
  metricName: string
): number[] {
  return results
    .filter(r => metricName in r.values)
    .map(r => r.values[metricName]);
}

/**
 * Group simulation results by a parameter value.
 */
export function groupByParameter(
  results: SimulationMetrics[],
  paramName: string
): Map<number, SimulationMetrics[]> {
  const groups = new Map<number, SimulationMetrics[]>();
  for (const r of results) {
    const val = r.params[paramName];
    if (val === undefined) continue;
    if (!groups.has(val)) groups.set(val, []);
    groups.get(val)!.push(r);
  }
  return groups;
}

/**
 * Generate a summary of metrics across all runs.
 */
export function summarizeMetrics(
  results: SimulationMetrics[],
  metricName: string
): { mean: number; std: number; min: number; max: number; n: number } {
  const values = extractMetric(results, metricName);
  if (values.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, n: 0 };
  }
  return {
    mean: mean(values),
    std: standardDeviation(values),
    min: Math.min(...values),
    max: Math.max(...values),
    n: values.length,
  };
}

// =============================================================================
// INTERNAL MATH HELPERS
// =============================================================================

/**
 * Standard normal CDF approximation (Abramowitz and Stegun 26.2.17).
 * Accurate to ~1.5e-7.
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Approximate two-tailed p-value from t-distribution.
 * Uses the Inamdar-Griessammer approximation for large df.
 */
function tDistPValue(absT: number, df: number): number {
  if (df <= 0) return 1;
  // Convert t to approximately normal z for large df
  const z = absT * (1 - 1 / (4 * df)) / Math.sqrt(1 + absT * absT / (2 * df));
  return 2 * (1 - normalCDF(z));
}

/**
 * Approximate critical t-value for a given alpha and df.
 */
function tDistCritical(alpha: number, df: number): number {
  // Approximate using normal quantile adjusted for df
  const p = 1 - alpha / 2;
  // Rational approximation of the normal quantile (Beasley-Springer-Moro)
  const a = p - 0.5;
  const r = a * a;
  let z = a * (2.50662823884 + r * (-18.61500062529 + r * (41.39119773534 + r * -25.44106049637))) /
    (1 + r * (-8.47351093090 + r * (23.08336743743 + r * (-21.06224101826 + r * 3.13082909833))));

  // Cornish-Fisher expansion for t-distribution
  const g1 = (z ** 3 + z) / (4 * df);
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
  z = z + g1 + g2;

  return Math.abs(z);
}

/**
 * Approximate chi-squared p-value using Wilson-Hilferty.
 */
function chiSquaredPValue(chiSq: number, df: number): number {
  if (df <= 0) return 1;
  if (chiSq <= 0) return 1;
  // Wilson-Hilferty transformation to normal
  const z = Math.pow(chiSq / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  return 1 - normalCDF(z / denom);
}
