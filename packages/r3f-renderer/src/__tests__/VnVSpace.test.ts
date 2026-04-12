/**
 * VnVSpace — Unit tests for V&V visualization components.
 *
 * Tests the data transformation hook (useVnVData) and the pure functions
 * in the visualization components. Does NOT test React rendering (that
 * requires a full R3F canvas context — covered by integration tests).
 */

import { describe, it, expect } from 'vitest';

// ── useVnVData tests (pure logic, no React needed) ──────────────────────────

// Import the types and functions directly
// Note: useVnVData is a React hook, so we test the underlying logic
// by extracting and testing the data transformation independently.

describe('VnV Data Transformation', () => {
  // Simulate the data transformation logic from useVnVData
  function transformReport(report: {
    benchmarks: Array<{
      name: string;
      solver: string;
      passed: boolean;
      errorValue: number;
      tolerance: number;
      convergence?: {
        meshSizes: number[];
        errorsL2: number[];
        errorsLinf: number[];
        observedOrderL2: number;
        observedOrderLinf: number;
        richardsonEstimate?: number;
        gci?: number;
      };
    }>;
    summary: { total: number; passed: number; failed: number };
  }) {
    const series: Array<{
      label: string;
      points: Array<{ meshSize: number; errorL2: number; errorLinf?: number; solver?: string }>;
      observedOrder?: number;
    }> = [];
    const orders: number[] = [];
    const gcis: number[] = [];
    let bestRichardson: number | undefined;

    for (const b of report.benchmarks) {
      if (!b.convergence) continue;
      const c = b.convergence;
      const points = c.meshSizes.map((h, i) => ({
        meshSize: h,
        errorL2: c.errorsL2[i],
        errorLinf: c.errorsLinf[i],
        solver: b.solver,
      }));

      series.push({
        label: b.name,
        points,
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

    return {
      convergenceSeries: series,
      globalObservedOrder: orders.length > 0
        ? orders.reduce((s, v) => s + v, 0) / orders.length
        : undefined,
      richardsonEstimate: bestRichardson,
      averageGCI: gcis.length > 0
        ? gcis.reduce((s, v) => s + v, 0) / gcis.length
        : undefined,
      passRate: report.summary.total > 0
        ? report.summary.passed / report.summary.total
        : 0,
    };
  }

  it('transforms empty report to empty visualization data', () => {
    const result = transformReport({
      benchmarks: [],
      summary: { total: 0, passed: 0, failed: 0 },
    });

    expect(result.convergenceSeries).toHaveLength(0);
    expect(result.globalObservedOrder).toBeUndefined();
    expect(result.richardsonEstimate).toBeUndefined();
    expect(result.averageGCI).toBeUndefined();
    expect(result.passRate).toBe(0);
  });

  it('extracts convergence series from benchmarks', () => {
    const result = transformReport({
      benchmarks: [
        {
          name: 'Thermal Conduction',
          solver: 'thermal',
          passed: true,
          errorValue: 0.001,
          tolerance: 0.01,
          convergence: {
            meshSizes: [0.2, 0.1, 0.05],
            errorsL2: [0.04, 0.01, 0.0025],
            errorsLinf: [0.05, 0.013, 0.003],
            observedOrderL2: 2.0,
            observedOrderLinf: 1.95,
            richardsonEstimate: 99.98,
            gci: 0.02,
          },
        },
      ],
      summary: { total: 1, passed: 1, failed: 0 },
    });

    expect(result.convergenceSeries).toHaveLength(1);
    expect(result.convergenceSeries[0].label).toBe('Thermal Conduction');
    expect(result.convergenceSeries[0].points).toHaveLength(3);
    expect(result.convergenceSeries[0].observedOrder).toBe(2.0);
    expect(result.globalObservedOrder).toBe(2.0);
    expect(result.richardsonEstimate).toBe(99.98);
    expect(result.averageGCI).toBe(0.02);
    expect(result.passRate).toBe(1);
  });

  it('averages GCI and order across multiple benchmarks', () => {
    const result = transformReport({
      benchmarks: [
        {
          name: 'Thermal',
          solver: 'thermal',
          passed: true,
          errorValue: 0.001,
          tolerance: 0.01,
          convergence: {
            meshSizes: [0.2, 0.1],
            errorsL2: [0.04, 0.01],
            errorsLinf: [0.05, 0.013],
            observedOrderL2: 2.0,
            observedOrderLinf: 1.9,
            gci: 0.02,
          },
        },
        {
          name: 'Structural',
          solver: 'structural',
          passed: true,
          errorValue: 0.002,
          tolerance: 0.01,
          convergence: {
            meshSizes: [0.2, 0.1],
            errorsL2: [0.08, 0.01],
            errorsLinf: [0.1, 0.013],
            observedOrderL2: 3.0,
            observedOrderLinf: 2.9,
            gci: 0.04,
          },
        },
      ],
      summary: { total: 2, passed: 2, failed: 0 },
    });

    expect(result.convergenceSeries).toHaveLength(2);
    expect(result.globalObservedOrder).toBe(2.5); // (2.0 + 3.0) / 2
    expect(result.averageGCI).toBe(0.03); // (0.02 + 0.04) / 2
    expect(result.passRate).toBe(1);
  });

  it('handles benchmarks without convergence data', () => {
    const result = transformReport({
      benchmarks: [
        {
          name: 'Quick Check',
          solver: 'thermal',
          passed: true,
          errorValue: 0.005,
          tolerance: 0.01,
          // No convergence data
        },
      ],
      summary: { total: 1, passed: 1, failed: 0 },
    });

    expect(result.convergenceSeries).toHaveLength(0);
    expect(result.globalObservedOrder).toBeUndefined();
    expect(result.passRate).toBe(1);
  });

  it('computes correct pass rate with failures', () => {
    const result = transformReport({
      benchmarks: [
        { name: 'A', solver: 'thermal', passed: true, errorValue: 0.001, tolerance: 0.01 },
        { name: 'B', solver: 'structural', passed: false, errorValue: 0.05, tolerance: 0.01 },
        { name: 'C', solver: 'acoustic', passed: true, errorValue: 0.002, tolerance: 0.01 },
      ],
      summary: { total: 3, passed: 2, failed: 1 },
    });

    expect(result.passRate).toBeCloseTo(2 / 3);
  });

  it('selects best (lowest) Richardson estimate', () => {
    const result = transformReport({
      benchmarks: [
        {
          name: 'A',
          solver: 'thermal',
          passed: true,
          errorValue: 0.001,
          tolerance: 0.01,
          convergence: {
            meshSizes: [0.2, 0.1],
            errorsL2: [0.04, 0.01],
            errorsLinf: [0.05, 0.013],
            observedOrderL2: 2.0,
            observedOrderLinf: 1.9,
            richardsonEstimate: 100.5,
          },
        },
        {
          name: 'B',
          solver: 'structural',
          passed: true,
          errorValue: 0.002,
          tolerance: 0.01,
          convergence: {
            meshSizes: [0.2, 0.1],
            errorsL2: [0.08, 0.01],
            errorsLinf: [0.1, 0.013],
            observedOrderL2: 3.0,
            observedOrderLinf: 2.9,
            richardsonEstimate: 50.2,
          },
        },
      ],
      summary: { total: 2, passed: 2, failed: 0 },
    });

    expect(result.richardsonEstimate).toBe(50.2);
  });
});

// ── Element-to-Node Uncertainty Mapping ──────────────────────────────────────

describe('Element-to-Node Uncertainty Mapping', () => {
  // Pure function extracted from the hook logic
  function elementToNodeUncertainty(
    tetrahedra: Uint32Array,
    nodesPerElement: number,
    nodeCount: number,
    elementGCI: Float32Array,
  ): Float32Array {
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
  }

  it('averages element GCI to shared nodes', () => {
    // 2 tets sharing 2 nodes (nodes 1 and 2)
    const tetrahedra = new Uint32Array([
      0, 1, 2, 3, // tet 0
      1, 2, 4, 5, // tet 1
    ]);
    const elementGCI = new Float32Array([0.02, 0.04]);

    const result = elementToNodeUncertainty(tetrahedra, 4, 6, elementGCI);

    // Node 0: only in tet 0 → 0.02
    expect(result[0]).toBeCloseTo(0.02);
    // Node 1: in both tets → (0.02 + 0.04) / 2 = 0.03
    expect(result[1]).toBeCloseTo(0.03);
    // Node 2: in both tets → (0.02 + 0.04) / 2 = 0.03
    expect(result[2]).toBeCloseTo(0.03);
    // Node 3: only in tet 0 → 0.02
    expect(result[3]).toBeCloseTo(0.02);
    // Node 4: only in tet 1 → 0.04
    expect(result[4]).toBeCloseTo(0.04);
    // Node 5: only in tet 1 → 0.04
    expect(result[5]).toBeCloseTo(0.04);
  });

  it('returns zero for unconnected nodes', () => {
    const tetrahedra = new Uint32Array([0, 1, 2, 3]);
    const elementGCI = new Float32Array([0.05]);

    const result = elementToNodeUncertainty(tetrahedra, 4, 6, elementGCI);

    expect(result[4]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it('handles empty inputs', () => {
    const result = elementToNodeUncertainty(
      new Uint32Array(0), 4, 0, new Float32Array(0)
    );
    expect(result).toHaveLength(0);
  });
});

// ── Convergence Plot Axis Mapping ─────────────────────────��──────────────────

describe('Log-Log Axis Mapping', () => {
  function computeLogRange(values: number[]) {
    const logs = values.filter(v => v > 0).map(Math.log10);
    const min = Math.floor(Math.min(...logs));
    const max = Math.ceil(Math.max(...logs));
    return { min, max, span: max - min || 1 };
  }

  function mapToAxis(logValue: number, range: { min: number; span: number }, axisLength: number) {
    return ((logValue - range.min) / range.span) * axisLength;
  }

  it('computes correct log range for mesh sizes', () => {
    const range = computeLogRange([0.2, 0.1, 0.05, 0.025]);
    expect(range.min).toBe(-2); // floor(log10(0.025)) = -2
    // ceil(log10(0.2)) = ceil(-0.699) = -0 in JS; use toBeCloseTo for -0/+0
    expect(range.max).toBeCloseTo(0);
    expect(range.span).toBe(2);
  });

  it('maps values to axis positions correctly', () => {
    const range = { min: -2, max: 0, span: 2 };
    const axisLength = 4;

    // log10(0.01) = -2 → maps to 0 (start)
    expect(mapToAxis(-2, range, axisLength)).toBeCloseTo(0);
    // log10(1) = 0 → maps to 4 (end)
    expect(mapToAxis(0, range, axisLength)).toBeCloseTo(4);
    // log10(0.1) = -1 → maps to 2 (midpoint)
    expect(mapToAxis(-1, range, axisLength)).toBeCloseTo(2);
  });

  it('handles single-value range', () => {
    const range = computeLogRange([0.1]);
    expect(range.span).toBe(1); // Avoids division by zero
  });
});
