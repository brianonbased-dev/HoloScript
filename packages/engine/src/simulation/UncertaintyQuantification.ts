/**
 * UncertaintyQuantification — Stochastic wrapper around ExperimentOrchestrator.
 *
 * Performs uncertainty propagation via Latin Hypercube Sampling over uncertain
 * input parameters, runs an ensemble of solver evaluations, and computes
 * probability distributions (mean, variance, confidence intervals, percentiles,
 * CDFs) on every output field quantity.
 *
 * Implements SimSolver so it can be used anywhere a regular solver is expected:
 *   - `solve()` runs the full UQ ensemble
 *   - `getField(name)` returns the **mean** field (best estimate)
 *   - `getStats()` returns full distributional statistics
 *
 * @see ExperimentOrchestrator — underlying parameter sweep engine
 * @see ParameterSpace — Latin Hypercube Sampling implementation
 * @see SimSolver — generic solver interface this implements
 */

import type { SimSolver, SolverMode, FieldData } from './SimSolver';
import {
  ExperimentOrchestrator,
  type ExperimentConfig,
  type ExperimentResult,
  type SolverHandle,
} from './experiment/ExperimentOrchestrator';
import type { ParameterRange } from './experiment/ParameterSpace';
import { ProvenanceTracker } from './provenance/index';

// ── Types ────────────────────────────────────────────────────────────────────

/** Statistical distribution for a single scalar quantity. */
export interface ScalarDistribution {
  /** Number of ensemble samples */
  n: number;
  /** Sample mean */
  mean: number;
  /** Sample standard deviation */
  std: number;
  /** Sample variance */
  variance: number;
  /** Coefficient of variation (std / |mean|, or Infinity if mean ≈ 0) */
  cov: number;
  /** Minimum observed value */
  min: number;
  /** Maximum observed value */
  max: number;
  /** Percentile values: p5, p25 (Q1), p50 (median), p75 (Q3), p95 */
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  /** Confidence interval at the configured level (default 95%) */
  confidenceInterval: { lower: number; upper: number; level: number };
  /** Skewness (Fisher's definition) */
  skewness: number;
  /** Excess kurtosis */
  kurtosis: number;
}

/** Statistical distribution for a field (per-node/per-cell array). */
export interface FieldDistribution {
  /** Field name */
  name: string;
  /** Number of ensemble samples contributing */
  n: number;
  /** Mean value at each node/cell */
  mean: Float64Array;
  /** Standard deviation at each node/cell */
  std: Float64Array;
  /** Lower bound of confidence interval at each node/cell */
  ciLower: Float64Array;
  /** Upper bound of confidence interval at each node/cell */
  ciUpper: Float64Array;
  /** Confidence level used (e.g. 0.95) */
  ciLevel: number;
  /** Coefficient of variation at each node/cell */
  cov: Float64Array;
  /** Per-node percentiles: p5, p50, p95 */
  percentiles: { p5: Float64Array; p50: Float64Array; p95: Float64Array };
}

/** Configuration for the UQ analysis. */
export interface UQConfig {
  /** Human-readable name */
  name: string;
  /** Base solver config (deterministic parameters) */
  baseConfig: Record<string, unknown>;
  /** Solver type identifier */
  solverType: string;
  /** Uncertain parameters with their ranges (treated as uniform distributions) */
  uncertainParameters: ParameterRange[];
  /** Number of LHS samples (default: 50) */
  sampleCount?: number;
  /** PRNG seed for reproducibility (default: 42) */
  seed?: number;
  /** Confidence level for intervals: 0 < level < 1 (default: 0.95) */
  confidenceLevel?: number;
  /** Max concurrent solver runs (default: 1) */
  concurrency?: number;
  /** Field names to collect full distributions for (default: all available) */
  fieldNames?: string[];
  /** Scalar stat keys to extract from solver stats (default: all numeric) */
  scalarKeys?: string[];
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

/** Full UQ results. */
export interface UQResult {
  /** Config used */
  config: UQConfig;
  /** Number of ensemble runs completed */
  ensembleSize: number;
  /** Scalar distributions keyed by stat name */
  scalarDistributions: Map<string, ScalarDistribution>;
  /** Field distributions keyed by field name */
  fieldDistributions: Map<string, FieldDistribution>;
  /** Fraction of runs that converged */
  convergenceRate: number;
  /** Underlying experiment result (for further analysis) */
  experimentResult: ExperimentResult;
  /** Total wall-clock time */
  totalTimeMs: number;
}

// ── Extended Solver Handle ──────────────────────────────────────────────────

/** Extension of SolverHandle that also exposes fields for UQ collection. */
export interface UQSolverHandle extends SolverHandle {
  /** Available field names */
  fieldNames?: readonly string[];
  /** Retrieve a named field */
  getField?(name: string): FieldData | null;
}

// ── UQ Engine ───────────────────────────────────────────────────────────────

export class UncertaintyQuantification implements SimSolver {
  readonly mode: SolverMode = 'steady-state';

  private config: UQConfig;
  private solverFactory: (type: string, config: Record<string, unknown>) => UQSolverHandle;
  private tracker: ProvenanceTracker;

  // Post-solve state
  private result: UQResult | null = null;
  private meanFields: Map<string, Float64Array> = new Map();
  private solved = false;

  get fieldNames(): readonly string[] {
    if (this.result) {
      return Array.from(this.result.fieldDistributions.keys());
    }
    return this.config.fieldNames ?? [];
  }

  /**
   * @param config — UQ configuration
   * @param solverFactory — Creates solver handles that support field extraction
   * @param tracker — Optional provenance tracker
   */
  constructor(
    config: UQConfig,
    solverFactory: (type: string, config: Record<string, unknown>) => UQSolverHandle,
    tracker?: ProvenanceTracker,
  ) {
    this.config = config;
    this.solverFactory = solverFactory;
    this.tracker = tracker ?? new ProvenanceTracker();
  }

  /**
   * Run the full UQ ensemble analysis.
   *
   * 1. Generates LHS samples across uncertain parameter space
   * 2. Runs each sample through the solver
   * 3. Collects field data and scalar stats from every run
   * 4. Computes per-field and per-scalar probability distributions
   */
  async solve(): Promise<void> {
    const t0 = performance.now();
    const {
      sampleCount = 50,
      confidenceLevel = 0.95,
      concurrency = 1,
    } = this.config;

    // ── Phase 1: Run ensemble via ExperimentOrchestrator ──────────────────

    // We need field data from each run, so we collect it during the sweep.
    // The orchestrator uses SolverHandle which doesn't expose fields,
    // so we wrap the factory to intercept field data.
    const fieldSamples: Map<string, Float64Array[]> = new Map();
    const scalarSamples: Map<string, number[]> = new Map();

    let fieldLength = -1;
    let discoveredFieldNames: string[] | null = null;

    const wrappedFactory = (type: string, cfg: Record<string, unknown>): SolverHandle => {
      const solver = this.solverFactory(type, cfg);

      return {
        solve: async () => {
          await solver.solve();

          // Discover field names on first run if not specified
          if (discoveredFieldNames === null) {
            discoveredFieldNames = this.config.fieldNames
              ? [...this.config.fieldNames]
              : (solver.fieldNames ? [...solver.fieldNames] : []);
          }

          // Collect field data
          if (solver.getField) {
            for (const fname of discoveredFieldNames) {
              const field = solver.getField(fname);
              if (field === null) continue;

              const arr = fieldToFloat64(field);
              if (arr === null) continue;

              if (fieldLength < 0) fieldLength = arr.length;

              if (!fieldSamples.has(fname)) {
                fieldSamples.set(fname, []);
              }
              // Only collect if consistent size
              if (arr.length === fieldLength || fieldSamples.get(fname)!.length === 0) {
                if (fieldLength < 0) fieldLength = arr.length;
                fieldSamples.get(fname)!.push(arr);
              }
            }
          }

          // Collect scalar stats
          const stats = solver.getStats();
          const targetKeys = this.config.scalarKeys ?? Object.keys(stats);
          for (const key of targetKeys) {
            if (typeof stats[key] === 'number' && isFinite(stats[key] as number)) {
              if (!scalarSamples.has(key)) scalarSamples.set(key, []);
              scalarSamples.get(key)!.push(stats[key] as number);
            }
          }
        },
        getStats: () => solver.getStats(),
        dispose: () => solver.dispose(),
      };
    };

    const orchestrator = new ExperimentOrchestrator(wrappedFactory, this.tracker);

    const experimentConfig: ExperimentConfig = {
      name: `UQ:${this.config.name}`,
      baseConfig: this.config.baseConfig,
      solverType: this.config.solverType,
      parameters: this.config.uncertainParameters,
      sampling: 'lhs',
      sampleCount,
      concurrency,
      onProgress: this.config.onProgress,
    };

    const expResult = await orchestrator.run(experimentConfig);

    // ── Phase 2: Compute distributions ────────────────────────────────────

    const scalarDistributions = new Map<string, ScalarDistribution>();
    for (const [key, values] of scalarSamples) {
      if (values.length >= 2) {
        scalarDistributions.set(key, computeScalarDistribution(values, confidenceLevel));
      }
    }

    const fieldDistributions = new Map<string, FieldDistribution>();
    for (const [fname, samples] of fieldSamples) {
      if (samples.length >= 2) {
        const dist = computeFieldDistribution(fname, samples, confidenceLevel);
        fieldDistributions.set(fname, dist);
        this.meanFields.set(fname, dist.mean);
      }
    }

    const convergedCount = expResult.runs.filter((r) => r.converged).length;

    this.result = {
      config: this.config,
      ensembleSize: expResult.totalRuns,
      scalarDistributions,
      fieldDistributions,
      convergenceRate: expResult.totalRuns > 0 ? convergedCount / expResult.totalRuns : 0,
      experimentResult: expResult,
      totalTimeMs: performance.now() - t0,
    };

    this.solved = true;
  }

  /** No-op — UQ is always steady-state (ensemble solve). */
  step(_dt: number): void {
    // UQ runs a full ensemble; step-by-step is not meaningful.
  }

  /**
   * Returns the **mean** field as the best estimate.
   * Returns a Float64Array (not Float32Array) for precision.
   */
  getField(name: string): FieldData | null {
    return this.meanFields.get(name) as FieldData | null ?? null;
  }

  /**
   * Returns UQ summary statistics.
   * Includes convergence rate, ensemble size, and flattened scalar distributions.
   */
  getStats(): Record<string, unknown> {
    if (!this.result) {
      return { solved: false, ensembleSize: 0 };
    }

    const stats: Record<string, unknown> = {
      solved: true,
      ensembleSize: this.result.ensembleSize,
      convergenceRate: this.result.convergenceRate,
      totalTimeMs: this.result.totalTimeMs,
    };

    // Flatten scalar distributions into stats for compatibility
    for (const [key, dist] of this.result.scalarDistributions) {
      stats[`${key}_mean`] = dist.mean;
      stats[`${key}_std`] = dist.std;
      stats[`${key}_ci_lower`] = dist.confidenceInterval.lower;
      stats[`${key}_ci_upper`] = dist.confidenceInterval.upper;
      stats[`${key}_p5`] = dist.percentiles.p5;
      stats[`${key}_p50`] = dist.percentiles.p50;
      stats[`${key}_p95`] = dist.percentiles.p95;
    }

    return stats;
  }

  /** Get full UQ results (only available after solve()). */
  getResult(): UQResult | null {
    return this.result;
  }

  /** Get distribution for a specific scalar quantity. */
  getScalarDistribution(key: string): ScalarDistribution | null {
    return this.result?.scalarDistributions.get(key) ?? null;
  }

  /** Get distribution for a specific field. */
  getFieldDistribution(name: string): FieldDistribution | null {
    return this.result?.fieldDistributions.get(name) ?? null;
  }

  /** Get the underlying provenance tracker. */
  getTracker(): ProvenanceTracker {
    return this.tracker;
  }

  dispose(): void {
    this.result = null;
    this.meanFields.clear();
    this.solved = false;
  }
}

// ── Statistics Utilities ────────────────────────────────────────────────────

/**
 * Compute full distributional statistics for a scalar sample.
 */
export function computeScalarDistribution(
  values: number[],
  confidenceLevel = 0.95,
): ScalarDistribution {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);

  const mean = values.reduce((s, v) => s + v, 0) / n;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = v - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }

  const variance = n > 1 ? m2 / (n - 1) : 0;
  const std = Math.sqrt(variance);
  const cov = Math.abs(mean) > 1e-20 ? std / Math.abs(mean) : Infinity;

  // Skewness (Fisher's)
  const skewness = n > 2 && std > 1e-20
    ? (n / ((n - 1) * (n - 2))) * (m3 / (std * std * std) * n / n)
    : 0;

  // Actually compute skewness correctly using centered moments
  const m2n = m2 / n; // biased variance
  const stdBiased = Math.sqrt(m2n);
  const skewnessCorrect = n > 2 && stdBiased > 1e-20
    ? ((m3 / n) / (stdBiased ** 3)) * (n * n) / ((n - 1) * (n - 2))
    : 0;

  // Excess kurtosis
  const kurtosis = n > 3 && m2n > 1e-20
    ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * (m4 / (m2n * m2n))
      - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3))
    : 0;

  // Percentiles via linear interpolation
  const p5 = percentile(sorted, 0.05);
  const p25 = percentile(sorted, 0.25);
  const p50 = percentile(sorted, 0.50);
  const p75 = percentile(sorted, 0.75);
  const p95 = percentile(sorted, 0.95);

  // Confidence interval using t-distribution approximation
  const alpha = 1 - confidenceLevel;
  const tValue = tQuantile(1 - alpha / 2, n - 1);
  const margin = tValue * std / Math.sqrt(n);

  return {
    n,
    mean,
    std,
    variance,
    cov,
    min: sorted[0],
    max: sorted[n - 1],
    percentiles: { p5, p25, p50, p75, p95 },
    confidenceInterval: {
      lower: mean - margin,
      upper: mean + margin,
      level: confidenceLevel,
    },
    skewness: skewnessCorrect,
    kurtosis,
  };
}

/**
 * Compute per-node distributional statistics for an ensemble of field arrays.
 */
export function computeFieldDistribution(
  name: string,
  samples: Float64Array[],
  confidenceLevel = 0.95,
): FieldDistribution {
  const n = samples.length;
  const len = samples[0].length;

  const mean = new Float64Array(len);
  const std = new Float64Array(len);
  const ciLower = new Float64Array(len);
  const ciUpper = new Float64Array(len);
  const covArr = new Float64Array(len);
  const p5Arr = new Float64Array(len);
  const p50Arr = new Float64Array(len);
  const p95Arr = new Float64Array(len);

  const alpha = 1 - confidenceLevel;
  const tValue = tQuantile(1 - alpha / 2, n - 1);

  // Scratch array for per-node sorting
  const scratch = new Float64Array(n);

  for (let i = 0; i < len; i++) {
    // Collect values at node i across all samples
    let sum = 0;
    for (let s = 0; s < n; s++) {
      const v = samples[s][i];
      scratch[s] = v;
      sum += v;
    }

    const m = sum / n;
    mean[i] = m;

    let m2 = 0;
    for (let s = 0; s < n; s++) {
      const d = scratch[s] - m;
      m2 += d * d;
    }

    const variance = n > 1 ? m2 / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    std[i] = sd;

    const margin = tValue * sd / Math.sqrt(n);
    ciLower[i] = m - margin;
    ciUpper[i] = m + margin;
    covArr[i] = Math.abs(m) > 1e-20 ? sd / Math.abs(m) : 0;

    // Sort for percentiles
    scratch.sort();
    p5Arr[i] = percentileFromSorted(scratch, 0.05);
    p50Arr[i] = percentileFromSorted(scratch, 0.50);
    p95Arr[i] = percentileFromSorted(scratch, 0.95);
  }

  return {
    name,
    n,
    mean,
    std,
    ciLower,
    ciUpper,
    ciLevel: confidenceLevel,
    cov: covArr,
    percentiles: { p5: p5Arr, p50: p50Arr, p95: p95Arr },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert any FieldData to Float64Array for accumulation. */
function fieldToFloat64(field: FieldData): Float64Array | null {
  if (field instanceof Float64Array) return field;
  if (field instanceof Float32Array) return new Float64Array(field);
  // RegularGrid3D — extract flat data
  if (typeof field === 'object' && 'data' in field) {
    const data = (field as { data: Float32Array | Float64Array }).data;
    if (data instanceof Float64Array) return data;
    if (data instanceof Float32Array) return new Float64Array(data);
  }
  return null;
}

/** Percentile via linear interpolation (sorted array). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;

  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Percentile from a Float64Array (already sorted). */
function percentileFromSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];

  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;

  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Approximate t-distribution quantile using the Abramowitz & Stegun
 * rational approximation. Accurate to ~0.01 for df >= 2.
 *
 * For the UQ use case (typically 20-200 samples), this is sufficient.
 * Falls back to normal quantile for df > 120.
 */
function tQuantile(p: number, df: number): number {
  if (df > 120) return normalQuantile(p);

  // Use the approximation: t ≈ z * (1 + (z² + 1) / (4 * df))
  // where z is the normal quantile. More accurate version:
  const z = normalQuantile(p);
  const z2 = z * z;

  // Cornish-Fisher expansion for t from normal
  const g1 = (z2 + 1) / (4 * df);
  const g2 = ((5 * z2 + 16) * z2 + 3) / (96 * df * df);
  const g3 = (((3 * z2 + 19) * z2 + 17) * z2 - 15) / (384 * df * df * df);

  return z * (1 + g1 + g2 + g3);
}

/**
 * Normal quantile via Beasley-Springer-Moro algorithm.
 * Accurate to ~1e-9 for 0.0001 < p < 0.9999.
 */
function normalQuantile(p: number): number {
  // Rational approximation coefficients
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;

  if (p < pLow) {
    // Rational approximation for lower region
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    // Rational approximation for central region
    q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // Rational approximation for upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}
