/**
 * ReportGenerator — Produce markdown V&V summary reports.
 *
 * Generates a human-readable report of all verification benchmark results,
 * convergence orders, and pass/fail status. Suitable for inclusion in
 * publications or regulatory submissions.
 */

import type { ConvergenceStudyResult } from './ConvergenceAnalysis';

// ── Types ────────────────────────────────────────────────────────────────────

/** All solver types that can produce benchmark results */
export type SolverType =
  | 'thermal'
  | 'structural'
  | 'hydraulic'
  | 'acoustic'
  | 'fdtd'
  | 'cfd'
  | 'molecular-dynamics';

/** A single data point in a convergence plot (log-log scale) */
export interface ConvergencePlotPoint {
  /** Characteristic mesh size h */
  meshSize: number;
  /** log10(h) for direct plotting */
  logMeshSize: number;
  /** L2 error at this mesh size */
  errorL2: number;
  /** log10(L2 error) for direct plotting */
  logErrorL2: number;
  /** L-infinity error at this mesh size */
  errorLinf: number;
  /** log10(L-infinity error) for direct plotting */
  logErrorLinf: number;
}

/** Convergence plot data suitable for rendering charts */
export interface ConvergencePlotData {
  /** Benchmark name this plot belongs to */
  benchmarkName: string;
  /** Solver type */
  solver: SolverType;
  /** Data points ordered by decreasing mesh size (coarse → fine) */
  points: ConvergencePlotPoint[];
  /** Observed L2 convergence order (slope of log-log fit) */
  observedOrderL2: number;
  /** Observed L-inf convergence order */
  observedOrderLinf: number;
  /** Theoretical order for reference line (if known) */
  theoreticalOrder?: number;
}

export interface BenchmarkResult {
  /** Benchmark name (e.g., "1D Steady-State Conduction") */
  name: string;
  /** Solver tested */
  solver: SolverType;
  /** Description of the analytical solution */
  analyticalSolution: string;
  /** Whether the benchmark passed */
  passed: boolean;
  /** Error metric used */
  errorMetric: string;
  /** Measured error value */
  errorValue: number;
  /** Tolerance for passing */
  tolerance: number;
  /** Optional convergence study results */
  convergence?: ConvergenceStudyResult;
  /** Reference citation */
  reference?: string;
}

export interface VerificationReport {
  /** Software version */
  softwareVersion: string;
  /** Report generation timestamp */
  timestamp: string;
  /** Individual benchmark results */
  benchmarks: BenchmarkResult[];
  /** Overall pass/fail */
  allPassed: boolean;
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    bySolver: Record<SolverType, { total: number; passed: number; failed: number }>;
  };
  /** Convergence plot data for benchmarks that have convergence studies */
  convergencePlots: ConvergencePlotData[];
}

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Build convergence plot data from a benchmark with convergence results.
 */
function buildConvergencePlot(b: BenchmarkResult): ConvergencePlotData | undefined {
  if (!b.convergence) return undefined;
  const c = b.convergence;
  const points: ConvergencePlotPoint[] = c.meshSizes.map((h, i) => ({
    meshSize: h,
    logMeshSize: Math.log10(h),
    errorL2: c.errorsL2[i],
    logErrorL2: Math.log10(c.errorsL2[i]),
    errorLinf: c.errorsLinf[i],
    logErrorLinf: Math.log10(c.errorsLinf[i]),
  }));
  return {
    benchmarkName: b.name,
    solver: b.solver,
    points,
    observedOrderL2: c.observedOrderL2,
    observedOrderLinf: c.observedOrderLinf,
  };
}

/**
 * Generate a verification report from benchmark results.
 */
export function createVerificationReport(
  benchmarks: BenchmarkResult[],
  softwareVersion: string
): VerificationReport {
  const passed = benchmarks.filter(b => b.passed).length;

  // Per-solver breakdown
  const bySolver = {} as Record<SolverType, { total: number; passed: number; failed: number }>;
  for (const b of benchmarks) {
    if (!bySolver[b.solver]) {
      bySolver[b.solver] = { total: 0, passed: 0, failed: 0 };
    }
    bySolver[b.solver].total++;
    if (b.passed) bySolver[b.solver].passed++;
    else bySolver[b.solver].failed++;
  }

  // Convergence plots for benchmarks that have convergence data
  const convergencePlots: ConvergencePlotData[] = [];
  for (const b of benchmarks) {
    const plot = buildConvergencePlot(b);
    if (plot) convergencePlots.push(plot);
  }

  return {
    softwareVersion,
    timestamp: new Date().toISOString(),
    benchmarks,
    allPassed: passed === benchmarks.length,
    summary: {
      total: benchmarks.length,
      passed,
      failed: benchmarks.length - passed,
      bySolver,
    },
    convergencePlots,
  };
}

/**
 * Render a verification report as markdown.
 */
export function renderReportMarkdown(report: VerificationReport): string {
  const lines: string[] = [];

  lines.push('# HoloScript Simulation V&V Report');
  lines.push('');
  lines.push(`**Software**: HoloScript v${report.softwareVersion}`);
  lines.push(`**Generated**: ${report.timestamp}`);
  lines.push(`**Status**: ${report.allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total benchmarks | ${report.summary.total} |`);
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push('');

  // Per-solver breakdown
  const solverEntries = Object.entries(report.summary.bySolver) as [SolverType, { total: number; passed: number; failed: number }][];
  if (solverEntries.length > 0) {
    lines.push('### Results by Solver');
    lines.push('');
    lines.push('| Solver | Total | Passed | Failed |');
    lines.push('|--------|-------|--------|--------|');
    for (const [solver, stats] of solverEntries) {
      lines.push(`| ${solver} | ${stats.total} | ${stats.passed} | ${stats.failed} |`);
    }
    lines.push('');
  }

  // Benchmark details
  lines.push('## Benchmark Results');
  lines.push('');
  lines.push('| Benchmark | Solver | Error Metric | Error | Tolerance | Status |');
  lines.push('|-----------|--------|-------------|-------|-----------|--------|');

  for (const b of report.benchmarks) {
    const status = b.passed ? 'PASS' : '**FAIL**';
    lines.push(
      `| ${b.name} | ${b.solver} | ${b.errorMetric} | ${b.errorValue.toExponential(3)} | ${b.tolerance.toExponential(3)} | ${status} |`
    );
  }
  lines.push('');

  // Convergence studies
  const withConvergence = report.benchmarks.filter(b => b.convergence);
  if (withConvergence.length > 0) {
    lines.push('## Convergence Studies');
    lines.push('');
    for (const b of withConvergence) {
      const c = b.convergence!;
      lines.push(`### ${b.name}`);
      lines.push('');
      lines.push(`| Mesh Size | L2 Error | L-inf Error |`);
      lines.push(`|-----------|----------|-------------|`);
      for (let i = 0; i < c.meshSizes.length; i++) {
        lines.push(
          `| ${c.meshSizes[i].toFixed(4)} | ${c.errorsL2[i].toExponential(3)} | ${c.errorsLinf[i].toExponential(3)} |`
        );
      }
      lines.push('');
      lines.push(`**Observed order (L2)**: ${c.observedOrderL2.toFixed(2)}`);
      lines.push(`**Observed order (L-inf)**: ${c.observedOrderLinf.toFixed(2)}`);
      if (c.richardsonEstimate !== undefined) {
        lines.push(`**Richardson extrapolation**: ${c.richardsonEstimate.toExponential(6)}`);
      }
      if (c.gci !== undefined) {
        lines.push(`**Grid Convergence Index**: ${(c.gci * 100).toFixed(2)}%`);
      }
      lines.push('');
    }
  }

  // Convergence plot data (machine-readable for charting)
  if (report.convergencePlots.length > 0) {
    lines.push('## Convergence Plot Data');
    lines.push('');
    for (const plot of report.convergencePlots) {
      lines.push(`### ${plot.benchmarkName} (${plot.solver})`);
      lines.push('');
      lines.push('| log10(h) | log10(L2 Error) | log10(L-inf Error) |');
      lines.push('|----------|-----------------|---------------------|');
      for (const pt of plot.points) {
        lines.push(`| ${pt.logMeshSize.toFixed(4)} | ${pt.logErrorL2.toFixed(4)} | ${pt.logErrorLinf.toFixed(4)} |`);
      }
      lines.push('');
      lines.push(`**Observed order (L2)**: ${plot.observedOrderL2.toFixed(2)}`);
      lines.push(`**Observed order (L-inf)**: ${plot.observedOrderLinf.toFixed(2)}`);
      if (plot.theoreticalOrder !== undefined) {
        lines.push(`**Theoretical order**: ${plot.theoreticalOrder}`);
      }
      lines.push('');
    }
  }

  // Detailed descriptions
  lines.push('## Benchmark Descriptions');
  lines.push('');
  for (const b of report.benchmarks) {
    lines.push(`### ${b.name}`);
    lines.push('');
    lines.push(`**Solver**: ${b.solver}`);
    lines.push(`**Analytical solution**: ${b.analyticalSolution}`);
    if (b.reference) lines.push(`**Reference**: ${b.reference}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render a verification report as a LaTeX-compatible table.
 */
export function renderReportLatex(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push('\\begin{table}[h]');
  lines.push('\\centering');
  lines.push('\\caption{HoloScript V\\&V Benchmark Results}');
  lines.push('\\begin{tabular}{llllll}');
  lines.push('\\hline');
  lines.push('Benchmark & Solver & Metric & Error & Tolerance & Status \\\\');
  lines.push('\\hline');

  for (const b of report.benchmarks) {
    const status = b.passed ? 'PASS' : 'FAIL';
    lines.push(
      `${b.name} & ${b.solver} & ${b.errorMetric} & ${b.errorValue.toExponential(3)} & ${b.tolerance.toExponential(3)} & ${status} \\\\`
    );
  }

  lines.push('\\hline');
  lines.push('\\end{tabular}');
  lines.push('\\end{table}');

  return lines.join('\n');
}
