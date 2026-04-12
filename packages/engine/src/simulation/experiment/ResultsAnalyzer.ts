/**
 * ResultsAnalyzer — Post-process parameter sweep results.
 *
 * Computes summary statistics, sensitivity analysis, and Pareto fronts
 * from ExperimentOrchestrator output.
 */

import type { ExperimentResult, ExperimentRunResult } from './ExperimentOrchestrator';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SweepSummary {
  /** Total runs */
  totalRuns: number;
  /** Runs that converged */
  convergedRuns: number;
  /** Best (minimum) objective value and its parameters */
  bestRun: ExperimentRunResult | null;
  /** Worst (maximum) objective value */
  worstRun: ExperimentRunResult | null;
  /** Mean objective value */
  meanObjective: number;
  /** Standard deviation of objective values */
  stdObjective: number;
  /** Total experiment wall-clock time */
  totalTimeMs: number;
}

export interface SensitivityResult {
  /** Parameter path */
  parameter: string;
  /** Correlation coefficient between parameter value and objective (-1 to 1) */
  correlation: number;
  /** Absolute correlation (measure of influence regardless of direction) */
  influence: number;
}

export interface ParetoPoint {
  /** Run index */
  index: number;
  /** Objective values [obj1, obj2, ...] */
  objectives: number[];
  /** Parameter overrides */
  overrides: Map<string, number>;
}

// ── Analysis Functions ───────────────────────────────────────────────────────

/**
 * Compute summary statistics for a sweep experiment.
 */
export function summarize(result: ExperimentResult): SweepSummary {
  const runs = result.runs;
  const converged = runs.filter((r) => r.converged);
  const withObj = runs.filter((r) => r.objectiveValue !== undefined);

  let bestRun: ExperimentRunResult | null = null;
  let worstRun: ExperimentRunResult | null = null;
  let sum = 0;

  for (const run of withObj) {
    const v = run.objectiveValue!;
    sum += v;
    if (!bestRun || v < bestRun.objectiveValue!) bestRun = run;
    if (!worstRun || v > worstRun.objectiveValue!) worstRun = run;
  }

  const mean = withObj.length > 0 ? sum / withObj.length : 0;

  let variance = 0;
  for (const run of withObj) {
    variance += (run.objectiveValue! - mean) ** 2;
  }
  const std = withObj.length > 1 ? Math.sqrt(variance / (withObj.length - 1)) : 0;

  return {
    totalRuns: runs.length,
    convergedRuns: converged.length,
    bestRun,
    worstRun,
    meanObjective: mean,
    stdObjective: std,
    totalTimeMs: result.totalTimeMs,
  };
}

/**
 * Compute sensitivity of the objective to each swept parameter.
 * Uses Pearson correlation coefficient.
 */
export function sensitivity(result: ExperimentResult): SensitivityResult[] {
  const runs = result.runs.filter((r) => r.objectiveValue !== undefined);
  if (runs.length < 3) return [];

  // Collect all parameter paths
  const paramPaths = new Set<string>();
  for (const run of runs) {
    for (const path of run.sample.overrides.keys()) {
      paramPaths.add(path);
    }
  }

  const results: SensitivityResult[] = [];

  for (const param of paramPaths) {
    const pairs: [number, number][] = [];
    for (const run of runs) {
      const pv = run.sample.overrides.get(param);
      if (pv !== undefined && run.objectiveValue !== undefined) {
        pairs.push([pv, run.objectiveValue]);
      }
    }

    if (pairs.length < 3) continue;

    const corr = pearsonCorrelation(pairs);
    results.push({
      parameter: param,
      correlation: corr,
      influence: Math.abs(corr),
    });
  }

  // Sort by influence (most influential first)
  results.sort((a, b) => b.influence - a.influence);
  return results;
}

/**
 * Compute 2D Pareto front (non-dominated solutions).
 * Minimizes both objectives.
 */
export function paretoFront(
  result: ExperimentResult,
  objective1: string,
  objective2: string,
): ParetoPoint[] {
  const points: { index: number; o1: number; o2: number; overrides: Map<string, number> }[] = [];

  for (let i = 0; i < result.runs.length; i++) {
    const stats = result.runs[i].stats;
    const o1 = typeof stats[objective1] === 'number' ? stats[objective1] as number : undefined;
    const o2 = typeof stats[objective2] === 'number' ? stats[objective2] as number : undefined;
    if (o1 !== undefined && o2 !== undefined) {
      points.push({ index: i, o1, o2, overrides: result.runs[i].sample.overrides });
    }
  }

  // Sort by first objective
  points.sort((a, b) => a.o1 - b.o1);

  // Filter non-dominated points
  const front: ParetoPoint[] = [];
  let minO2 = Infinity;

  for (const p of points) {
    if (p.o2 <= minO2) {
      front.push({
        index: p.index,
        objectives: [p.o1, p.o2],
        overrides: p.overrides,
      });
      minO2 = p.o2;
    }
  }

  return front;
}

/**
 * Export sweep results as a CSV string.
 */
export function exportSweepCSV(result: ExperimentResult): string {
  if (result.runs.length === 0) return '';

  // Collect all parameter paths
  const paramPaths = new Set<string>();
  for (const run of result.runs) {
    for (const path of run.sample.overrides.keys()) paramPaths.add(path);
  }

  const params = Array.from(paramPaths).sort();
  const header = [...params, 'converged', 'objective', 'timeMs'].join(',');

  const rows = result.runs.map((run) => {
    const paramValues = params.map((p) => run.sample.overrides.get(p) ?? '');
    return [...paramValues, run.converged ? 1 : 0, run.objectiveValue ?? '', run.timeMs.toFixed(1)].join(',');
  });

  return [header, ...rows].join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pearsonCorrelation(pairs: [number, number][]): number {
  const n = pairs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den > 1e-20 ? num / den : 0;
}
