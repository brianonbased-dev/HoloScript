/**
 * ReportGenerator — Produce markdown V&V summary reports.
 *
 * Generates a human-readable report of all verification benchmark results,
 * convergence orders, and pass/fail status. Suitable for inclusion in
 * publications or regulatory submissions.
 */

import type { ConvergenceStudyResult } from './ConvergenceAnalysis';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  /** Benchmark name (e.g., "1D Steady-State Conduction") */
  name: string;
  /** Solver tested */
  solver: 'thermal' | 'structural' | 'hydraulic';
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
  };
}

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate a verification report from benchmark results.
 */
export function createVerificationReport(
  benchmarks: BenchmarkResult[],
  softwareVersion: string
): VerificationReport {
  const passed = benchmarks.filter(b => b.passed).length;
  return {
    softwareVersion,
    timestamp: new Date().toISOString(),
    benchmarks,
    allPassed: passed === benchmarks.length,
    summary: {
      total: benchmarks.length,
      passed,
      failed: benchmarks.length - passed,
    },
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
