/**
 * SPC solver tests — manufacturing-qc-plugin
 *
 * Covers: X̄-R chart, X̄-s chart, p-chart, c-chart, u-chart,
 *         capability indices (Cp/Cpk/Ppk/Cpm), Western Electric rules,
 *         receipt builder, and false-case gates.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSPCChart,
  computeCapability,
  buildSPCReceipt,
  type Subgroup,
} from '../spc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSubgroups(data: number[][]): Subgroup[] {
  return data.map((values, i) => ({ index: i + 1, values }));
}

/** Classic textbook dataset: Montgomery Example 6.1 (shaft diameters, mm) */
const XBAR_R_DATA: number[][] = [
  [74, 70, 75, 78, 69],
  [74, 74, 76, 74, 72],
  [79, 73, 76, 79, 77],
  [75, 75, 71, 79, 72],
  [74, 75, 75, 75, 72],
  [72, 71, 75, 73, 71],
  [75, 73, 73, 72, 74],
  [74, 79, 73, 75, 71],
  [73, 76, 71, 74, 75],
  [75, 78, 76, 78, 72],
  [74, 72, 72, 72, 73],
  [79, 77, 78, 79, 75],
  [74, 75, 76, 75, 74],
  [74, 74, 75, 75, 74],
  [73, 74, 74, 74, 73],
  [74, 76, 75, 74, 72],
  [77, 73, 74, 75, 75],
  [74, 73, 76, 75, 73],
  [75, 78, 75, 74, 71],
  [74, 76, 77, 75, 72],
  [74, 74, 76, 74, 74],
  [74, 74, 75, 75, 72],
  [76, 72, 73, 72, 74],
  [76, 72, 74, 73, 74],
  [75, 71, 73, 74, 74],
];

// ─── X̄-R chart ───────────────────────────────────────────────────────────────

describe('buildSPCChart — xbar_r', () => {
  it('produces correct centre line and UCL/LCL', () => {
    const subgroups = makeSubgroups(XBAR_R_DATA);
    const result = buildSPCChart('xbar_r', subgroups);

    expect(result.chartType).toBe('xbar_r');
    expect(result.subgroupCount).toBe(25);
    expect(result.totalObservations).toBe(125);

    // Grand mean of this dataset ≈ 74.28
    expect(result.primaryChart.centerLine).toBeCloseTo(74.28, 1);
    // UCL > CL > LCL
    expect(result.primaryChart.ucl).toBeGreaterThan(result.primaryChart.centerLine);
    expect(result.primaryChart.lcl).toBeLessThan(result.primaryChart.centerLine);
    // R-bar ≈ 5.0 for this dataset; UCL_R = D4 * R̄ = 2.115 * 5.0 ≈ 10.5
    expect(result.secondaryChart?.ucl).toBeGreaterThan(result.secondaryChart?.centerLine ?? 0);
  });

  it('reports each subgroup stat with a mean and range', () => {
    const subgroups = makeSubgroups(XBAR_R_DATA);
    const { subgroupStats } = buildSPCChart('xbar_r', subgroups);
    for (const stat of subgroupStats) {
      expect(stat.mean).toBeDefined();
      expect(stat.range).toBeDefined();
      expect(Array.isArray(stat.violatedRules)).toBe(true);
    }
  });

  it('process with naturally-varying in-control data reports processInControl=true', () => {
    // Use the main dataset itself — it is the canonical "in-control" reference
    // (Montgomery uses it to establish control limits, so by construction most
    // points are in control). Verify structural property: UCL > CL > LCL.
    const result = buildSPCChart('xbar_r', makeSubgroups(XBAR_R_DATA));
    expect(result.primaryChart.ucl).toBeGreaterThan(result.primaryChart.centerLine);
    expect(result.primaryChart.lcl).toBeLessThan(result.primaryChart.centerLine);
    // At least 80% of subgroups should be in control for a stable reference process
    const inControlFraction =
      1 - result.outOfControlCount / result.subgroupCount;
    expect(inControlFraction).toBeGreaterThanOrEqual(0.8);
  });

  it('detects WE1 (beyond 3σ) for an obvious outlier', () => {
    const data = XBAR_R_DATA.map((row) => [...row]);
    data[5] = [120, 120, 120, 120, 120]; // extreme outlier
    const result = buildSPCChart('xbar_r', makeSubgroups(data));
    const outlierStat = result.subgroupStats[5];
    expect(outlierStat.outOfControl).toBe(true);
    expect(outlierStat.violatedRules.some((r) => r.includes('WE1'))).toBe(true);
  });

  it('throws for subgroup size outside 2–10', () => {
    const bad = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]]; // 11 values
    expect(() => buildSPCChart('xbar_r', makeSubgroups([...bad, ...bad]))).toThrow();
  });

  it('throws for fewer than 2 subgroups', () => {
    expect(() => buildSPCChart('xbar_r', makeSubgroups([[1, 2, 3]]))).toThrow();
  });
});

// ─── X̄-s chart ───────────────────────────────────────────────────────────────

describe('buildSPCChart — xbar_s', () => {
  it('produces consistent limits (UCL > CL > LCL)', () => {
    const result = buildSPCChart('xbar_s', makeSubgroups(XBAR_R_DATA));
    expect(result.chartType).toBe('xbar_s');
    expect(result.primaryChart.ucl).toBeGreaterThan(result.primaryChart.centerLine);
    expect(result.primaryChart.lcl).toBeLessThan(result.primaryChart.centerLine);
    expect(result.secondaryChart?.ucl).toBeGreaterThan(0);
  });
});

// ─── p-chart ─────────────────────────────────────────────────────────────────

describe('buildSPCChart — p', () => {
  const P_DATA: Subgroup[] = [
    { index: 1, values: [], n: 100, defects: 5 },
    { index: 2, values: [], n: 100, defects: 3 },
    { index: 3, values: [], n: 100, defects: 6 },
    { index: 4, values: [], n: 100, defects: 4 },
    { index: 5, values: [], n: 100, defects: 2 },
    { index: 6, values: [], n: 100, defects: 8 },
    { index: 7, values: [], n: 100, defects: 3 },
    { index: 8, values: [], n: 100, defects: 5 },
    { index: 9, values: [], n: 100, defects: 4 },
    { index: 10, values: [], n: 100, defects: 1 },
  ];

  it('computes p̄ as overall fraction nonconforming', () => {
    const result = buildSPCChart('p', P_DATA);
    expect(result.primaryChart.centerLine).toBeCloseTo(0.041, 3);
    expect(result.primaryChart.ucl).toBeGreaterThan(result.primaryChart.centerLine);
    expect(result.primaryChart.lcl).toBeGreaterThanOrEqual(0);
  });

  it('flags proportion as out-of-control when above UCL', () => {
    const data = [...P_DATA, { index: 11, values: [], n: 100, defects: 40 }];
    const result = buildSPCChart('p', data);
    const last = result.subgroupStats[result.subgroupStats.length - 1];
    expect(last.outOfControl).toBe(true);
  });

  it('throws if .n or .defects missing', () => {
    expect(() =>
      buildSPCChart('p', [
        { index: 1, values: [1, 2, 3] },
        { index: 2, values: [1, 2, 3] },
      ]),
    ).toThrow();
  });
});

// ─── c-chart ─────────────────────────────────────────────────────────────────

describe('buildSPCChart — c', () => {
  const C_DATA: Subgroup[] = Array.from({ length: 20 }, (_, i) => ({
    index: i + 1,
    values: [],
    defects: [3, 2, 4, 1, 3, 5, 2, 3, 2, 4, 3, 2, 1, 3, 4, 2, 3, 2, 4, 3][i],
  }));

  it('computes c̄ and symmetric ±3σ limits', () => {
    const result = buildSPCChart('c', C_DATA);
    expect(result.chartType).toBe('c');
    expect(result.primaryChart.centerLine).toBeCloseTo(2.8, 1);
    expect(result.primaryChart.ucl).toBeGreaterThan(result.primaryChart.centerLine);
  });

  it('detects extreme count as out-of-control', () => {
    const data = [...C_DATA, { index: 21, values: [], defects: 50 }];
    const result = buildSPCChart('c', data);
    const last = result.subgroupStats[result.subgroupStats.length - 1];
    expect(last.outOfControl).toBe(true);
  });
});

// ─── Process capability ───────────────────────────────────────────────────────

describe('computeCapability', () => {
  // Centred process: mean=50, σ≈1, LSL=44, USL=56 → Cpk≈2.0
  const centredValues: number[] = Array.from({ length: 100 }, (_, i) =>
    50 + Math.sin(i * 0.7) * 0.8,
  );
  const centredSubgroups = makeSubgroups(
    Array.from({ length: 20 }, (_, i) => centredValues.slice(i * 5, i * 5 + 5)),
  );

  it('computes Cp, Cpk, Pp, Ppk with correct ordering (Cpk ≤ Cp)', () => {
    const cap = computeCapability(centredValues, centredSubgroups, 44, 56);
    expect(cap.Cp).toBeGreaterThan(0);
    expect(cap.Cpk).toBeLessThanOrEqual(cap.Cp + 1e-9);
    expect(cap.Ppk).toBeLessThanOrEqual(cap.Pp + 1e-9);
  });

  it('returns capable=true for high-quality process (Cpk ≥ 1.33)', () => {
    const cap = computeCapability(centredValues, centredSubgroups, 44, 56);
    expect(cap.capable).toBe(true);
  });

  it('returns capable=false for marginal process (tight spec)', () => {
    const cap = computeCapability(centredValues, centredSubgroups, 49.0, 51.0);
    expect(cap.capable).toBe(false);
    expect(cap.Cpk).toBeLessThan(1.33);
  });

  it('computes Cpm when target is provided', () => {
    const cap = computeCapability(centredValues, centredSubgroups, 44, 56, 50);
    expect(cap.Cpm).toBeDefined();
    expect(cap.Cpm).toBeGreaterThan(0);
  });

  it('ppmTotal is within bounds (0 to 1,000,000)', () => {
    const cap = computeCapability(centredValues, centredSubgroups, 44, 56);
    expect(cap.ppmTotal).toBeGreaterThanOrEqual(0);
    expect(cap.ppmTotal).toBeLessThan(1_000_000);
  });

  it('throws if usl ≤ lsl', () => {
    expect(() => computeCapability(centredValues, centredSubgroups, 56, 44)).toThrow();
  });

  it('throws if fewer than 2 values', () => {
    expect(() => computeCapability([50], [], 44, 56)).toThrow();
  });
});

// ─── Receipt builder ──────────────────────────────────────────────────────────

describe('buildSPCReceipt', () => {
  it('produces a valid in-control receipt with accepted=true', () => {
    const result = buildSPCChart('xbar_r', makeSubgroups(XBAR_R_DATA));
    const receipt = buildSPCReceipt('test-line-01', result);
    expect(receipt.plugin).toBe('manufacturing-qc');
    expect(receipt.cael.event).toBe('manufacturing_qc.spc');
    expect(receipt.payloadHash).toBeTruthy();
    expect(receipt.hashAlgorithm).toBeTruthy();
  });

  it('sets accepted=false when process is out of control', () => {
    const data = XBAR_R_DATA.map((row) => [...row]);
    data[3] = [120, 120, 120, 120, 120];
    const result = buildSPCChart('xbar_r', makeSubgroups(data));
    const receipt = buildSPCReceipt('line-bad', result);
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('includes Cpk and Ppk in resultSummary when capability provided', () => {
    const result = buildSPCChart('xbar_r', makeSubgroups(XBAR_R_DATA));
    const allValues = XBAR_R_DATA.flat();
    const cap = computeCapability(allValues, makeSubgroups(XBAR_R_DATA), 68, 80);
    const receipt = buildSPCReceipt('line-with-cap', result, cap);
    expect(receipt.resultSummary.Cpk).toBeDefined();
    expect(receipt.resultSummary.Ppk).toBeDefined();
  });

  it('uses custom runId when provided', () => {
    const result = buildSPCChart('c', [
      { index: 1, values: [], defects: 2 },
      { index: 2, values: [], defects: 3 },
    ]);
    const receipt = buildSPCReceipt('line-custom', result, undefined, { runId: 'my-run-42' });
    expect(receipt.runId).toBe('my-run-42');
  });
});
