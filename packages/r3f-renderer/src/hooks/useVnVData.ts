/**
 * useVnVData — Transform VerificationReport into visualization-ready data.
 *
 * Bridges the engine's V&V data structures (ConvergenceStudyResult,
 * BenchmarkResult, VerificationReport) into props for the 3D visualization
 * components (ConvergencePlot3D, MeshRefinementCompare, UncertaintyCloud).
 *
 * Usage:
 *   const report = createVerificationReport(benchmarks, 'v6.1.0');
 *   const { convergenceSeries, uncertaintyData } = useVnVData(report);
 *
 * @see ConvergencePlot3D — consumes convergenceSeries
 * @see UncertaintyCloud — consumes uncertaintyData
 * @see MeshRefinementCompare — consumes meshLevels
 */

import { useMemo } from 'react';
import type { ConvergenceSeries, ConvergenceDataPoint } from '../components/ConvergencePlot3D';

// ── Input Types (from engine/simulation/verification) ────────────────────────

/** Mirrors engine's ConvergenceStudyResult */
export interface ConvergenceStudyResult {
  meshSizes: number[];
  errorsL2: number[];
  errorsLinf: number[];
  observedOrderL2: number;
  observedOrderLinf: number;
  richardsonEstimate?: number;
  gci?: number;
}

/** Mirrors engine's BenchmarkResult */
export interface BenchmarkResult {
  name: string;
  solver: string;
  analyticalSolution: string;
  passed: boolean;
  errorMetric: string;
  errorValue: number;
  tolerance: number;
  convergence?: ConvergenceStudyResult;
  reference?: string;
}

/** Mirrors engine's VerificationReport */
export interface VerificationReport {
  softwareVersion: string;
  timestamp: string;
  benchmarks: BenchmarkResult[];
  allPassed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    bySolver: Record<string, { total: number; passed: number; failed: number }>;
  };
}

// ── Output Types ─────────────────────────────────────────────────────────────

export interface VnVVisualizationData {
  /** Convergence plot series (one per benchmark with convergence data) */
  convergenceSeries: ConvergenceSeries[];
  /** Global observed order (average across all benchmarks) */
  globalObservedOrder: number | undefined;
  /** Best Richardson extrapolation estimate */
  richardsonEstimate: number | undefined;
  /** Average GCI across all benchmarks */
  averageGCI: number | undefined;
  /** Per-benchmark pass/fail summary for spatial display */
  benchmarkSummary: BenchmarkSummaryItem[];
  /** Overall pass rate (0..1) */
  passRate: number;
}

export interface BenchmarkSummaryItem {
  name: string;
  solver: string;
  passed: boolean;
  errorValue: number;
  tolerance: number;
  hasConvergence: boolean;
  observedOrder?: number;
  gci?: number;
}

// ── Solver Color Map ─────────────────────────────────────────────────────────

const SOLVER_COLORS: Record<string, number> = {
  thermal: 0xff4444,
  structural: 0x4488ff,
  hydraulic: 0x44aaff,
  acoustic: 0xaa44ff,
  fdtd: 0xff8844,
  cfd: 0x44ffaa,
  'molecular-dynamics': 0xff44aa,
};

function solverColor(solver: string): number {
  return SOLVER_COLORS[solver] ?? 0xcccccc;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Transform a VerificationReport into data ready for 3D visualization.
 */
export function useVnVData(report: VerificationReport | null): VnVVisualizationData {
  return useMemo(() => {
    if (!report) {
      return {
        convergenceSeries: [],
        globalObservedOrder: undefined,
        richardsonEstimate: undefined,
        averageGCI: undefined,
        benchmarkSummary: [],
        passRate: 0,
      };
    }

    // Build convergence series from benchmarks that have convergence data
    const convergenceSeries: ConvergenceSeries[] = [];
    const orders: number[] = [];
    const gcis: number[] = [];
    let bestRichardson: number | undefined;

    for (const b of report.benchmarks) {
      if (!b.convergence) continue;
      const c = b.convergence;

      const points: ConvergenceDataPoint[] = c.meshSizes.map((h, i) => ({
        meshSize: h,
        errorL2: c.errorsL2[i],
        errorLinf: c.errorsLinf[i],
        solver: b.solver,
      }));

      convergenceSeries.push({
        label: b.name,
        points,
        color: solverColor(b.solver),
        observedOrder: c.observedOrderL2,
      });

      orders.push(c.observedOrderL2);
      if (c.gci !== undefined) gcis.push(c.gci);
      if (c.richardsonEstimate !== undefined) {
        if (bestRichardson === undefined || c.richardsonEstimate < bestRichardson) {
          bestRichardson = c.richardsonEstimate;
        }
      }
    }

    const globalObservedOrder = orders.length > 0
      ? orders.reduce((s, v) => s + v, 0) / orders.length
      : undefined;

    const averageGCI = gcis.length > 0
      ? gcis.reduce((s, v) => s + v, 0) / gcis.length
      : undefined;

    // Build benchmark summary
    const benchmarkSummary: BenchmarkSummaryItem[] = report.benchmarks.map(b => ({
      name: b.name,
      solver: b.solver,
      passed: b.passed,
      errorValue: b.errorValue,
      tolerance: b.tolerance,
      hasConvergence: !!b.convergence,
      observedOrder: b.convergence?.observedOrderL2,
      gci: b.convergence?.gci,
    }));

    const passRate = report.summary.total > 0
      ? report.summary.passed / report.summary.total
      : 0;

    return {
      convergenceSeries,
      globalObservedOrder,
      richardsonEstimate: bestRichardson,
      averageGCI,
      benchmarkSummary,
      passRate,
    };
  }, [report]);
}

/**
 * Generate per-node uncertainty values from per-element GCI data.
 * Maps element-level uncertainty to nodes via averaging.
 */
export function useElementToNodeUncertainty(
  tetrahedra: Uint32Array | null,
  nodesPerElement: number,
  nodeCount: number,
  elementGCI: Float32Array | null,
): Float32Array {
  return useMemo(() => {
    if (!tetrahedra || !elementGCI || nodeCount === 0) {
      return new Float32Array(0);
    }

    const nodeSums = new Float64Array(nodeCount);
    const nodeCounts = new Uint32Array(nodeCount);
    const elementCount = tetrahedra.length / nodesPerElement;

    for (let e = 0; e < elementCount; e++) {
      const gci = elementGCI[e] ?? 0;
      for (let n = 0; n < nodesPerElement; n++) {
        const nodeIdx = tetrahedra[e * nodesPerElement + n];
        if (nodeIdx < nodeCount) {
          nodeSums[nodeIdx] += gci;
          nodeCounts[nodeIdx]++;
        }
      }
    }

    const result = new Float32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
      result[i] = nodeCounts[i] > 0 ? nodeSums[i] / nodeCounts[i] : 0;
    }
    return result;
  }, [tetrahedra, nodesPerElement, nodeCount, elementGCI]);
}
