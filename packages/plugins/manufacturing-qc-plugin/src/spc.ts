/**
 * Statistical Process Control (SPC) solver for @holoscript/plugin-manufacturing-qc
 *
 * Provides:
 *  - Shewhart control charts: X̄-R, X̄-s, p-chart, np-chart, c-chart, u-chart
 *  - Process capability indices: Cp, Cpk, Pp, Ppk, Cpm (taguchi)
 *  - Western Electric / Nelson rules for out-of-control detection
 *  - CAEL-ready receipt builder
 *
 * All calculations are deterministic and dependency-free.
 * Reference: Montgomery, "Introduction to Statistical Quality Control", 8th ed.
 *
 * @version 1.0.0
 */

import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
  type DomainSimulationReceipt,
} from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChartType = 'xbar_r' | 'xbar_s' | 'p' | 'np' | 'c' | 'u';

export interface Subgroup {
  /** Subgroup index (1-based) */
  index: number;
  /** Raw measurements within the subgroup */
  values: number[];
  /** Sample size (for attribute charts, total inspected) */
  n?: number;
  /** Number of nonconforming units or defects (attribute charts only) */
  defects?: number;
}

export interface ControlLimits {
  centerLine: number;
  ucl: number;
  lcl: number;
  /** Lower bound is clipped to 0 for attribute charts where negative is impossible */
  lclFloor?: number;
}

export interface SubgroupStat {
  index: number;
  n: number;
  mean?: number;
  range?: number;
  stdDev?: number;
  proportion?: number;
  rate?: number;
  outOfControl: boolean;
  violatedRules: string[];
}

export interface SPCChartResult {
  chartType: ChartType;
  subgroupCount: number;
  totalObservations: number;
  primaryChart: ControlLimits;      // X̄ or p or c/u
  secondaryChart?: ControlLimits;   // R or s (only for variables charts)
  subgroupStats: SubgroupStat[];
  outOfControlCount: number;
  processInControl: boolean;
}

export interface ProcessCapability {
  /** Spec limits */
  lsl: number;
  usl: number;
  target?: number;
  /** Process parameters (estimated from data) */
  processMean: number;
  processStdDev: number;
  /** Potential capability (short-term, uses σ̂ from within-subgroup) */
  Cp: number;
  /** Actual capability (uses σ̂ from within-subgroup, accounts for centering) */
  Cpk: number;
  CpkLower: number;
  CpkUpper: number;
  /** Performance indices (long-term, uses overall σ) */
  Pp: number;
  Ppk: number;
  /** Taguchi index (penalises deviation from target) */
  Cpm?: number;
  /** Estimated fraction nonconforming (normal approximation) */
  ppmAboveLSL: number;
  ppmBelowUSL: number;
  ppmTotal: number;
  /** Pass if Cpk >= 1.33 (four-sigma quality level) */
  capable: boolean;
}

export interface SPCReceiptOptions {
  runId?: string;
  createdAt?: string;
}

export interface SPCReceipt {
  schema: DomainSimulationReceipt['schema'];
  plugin: DomainSimulationReceipt['plugin'];
  pluginVersion: DomainSimulationReceipt['pluginVersion'];
  runId: DomainSimulationReceipt['runId'];
  createdAt: DomainSimulationReceipt['createdAt'];
  modelId: NonNullable<DomainSimulationReceipt['modelId']>;
  solverConfig: {
    solverType: 'spc';
    chartType: ChartType;
    subgroupCount: number;
    totalObservations: number;
  };
  resultSummary: {
    processInControl: boolean;
    outOfControlCount: number;
    capable?: boolean;
    Cpk?: number;
    Ppk?: number;
  };
  cael: {
    version: 'cael.v1';
    event: 'manufacturing_qc.spc';
    solverType: 'manufacturing-qc.spc';
  };
  acceptance: DomainSimulationReceipt['acceptance'];
  payloadHash: DomainSimulationReceipt['payloadHash'];
  hashAlgorithm: DomainSimulationReceipt['hashAlgorithm'];
}

// ─── Control chart constants (ASTM / Montgomery Table VI) ─────────────────────

/** d2 unbiasing constants for range → σ̂ */
const D2: Record<number, number> = {
  2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326,
  6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078,
};

/** d3 for range chart LCL */
const D3: Record<number, number> = {
  2: 0,     3: 0,     4: 0,     5: 0,
  6: 0,     7: 0.076, 8: 0.136, 9: 0.184, 10: 0.223,
};

/** d4 for range chart UCL */
const D4: Record<number, number> = {
  2: 3.267, 3: 2.575, 4: 2.282, 5: 2.115,
  6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777,
};

/** c4 unbiasing constants for s → σ̂ */
const C4: Record<number, number> = {
  2: 0.7979, 3: 0.8862, 4: 0.9213, 5: 0.9400,
  6: 0.9515, 7: 0.9594, 8: 0.9650, 9: 0.9693, 10: 0.9727,
};

/** A2 constants for X̄-R chart (3σ limits via R̄) */
const A2: Record<number, number> = {
  2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577,
  6: 0.483, 7: 0.419, 8: 0.373, 9: 0.337, 10: 0.308,
};

/** A3 constants for X̄-s chart (3σ limits via s̄) */
const A3: Record<number, number> = {
  2: 2.659, 3: 1.954, 4: 1.628, 5: 1.427,
  6: 1.287, 7: 1.182, 8: 1.099, 9: 1.032, 10: 0.975,
};

/** B3 / B4 for s-chart limits */
const B3: Record<number, number> = {
  2: 0,     3: 0,     4: 0,     5: 0,
  6: 0.030, 7: 0.118, 8: 0.185, 9: 0.239, 10: 0.284,
};
const B4: Record<number, number> = {
  2: 3.267, 3: 2.568, 4: 2.266, 5: 2.089,
  6: 1.970, 7: 1.882, 8: 1.815, 9: 1.761, 10: 1.716,
};

// ─── Statistics helpers ───────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

/** Standard normal CDF (Abramowitz & Stegun approximation, error < 7.5e-8) */
function normalCDF(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (0.254829592 * t -
      0.284496736 * t ** 2 +
      1.421413741 * t ** 3 -
      1.453152027 * t ** 4 +
      1.061405429 * t ** 5) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function ppm(z: number): number {
  return (1 - normalCDF(z)) * 1_000_000;
}

// ─── Western Electric / Nelson rules ─────────────────────────────────────────

/**
 * Applies the eight Western Electric rules to a series of standardised
 * (z-score) values. Returns a list of violated rule names per point.
 *
 * Rules:
 *  1: 1 point outside ±3σ
 *  2: 2 of 3 consecutive points outside ±2σ (same side)
 *  3: 4 of 5 consecutive points outside ±1σ (same side)
 *  4: 8 consecutive points on same side of center line
 *  5: 6 consecutive points steadily increasing or decreasing (trend)
 *  6: 15 consecutive points within ±1σ (stratification)
 *  7: 14 consecutive points alternating up/down
 *  8: 8 consecutive points outside ±1σ (mixture)
 */
function westernElectricViolations(zScores: number[]): string[][] {
  const n = zScores.length;
  const violations: string[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const z = zScores[i];
    // Rule 1
    if (Math.abs(z) > 3) violations[i].push('WE1:beyond3sigma');

    // Rule 2: 2 of 3 on same side beyond 2σ
    if (i >= 2) {
      const window = zScores.slice(i - 2, i + 1);
      if (window.filter((v) => v > 2).length >= 2 || window.filter((v) => v < -2).length >= 2) {
        violations[i].push('WE2:2of3beyond2sigma');
      }
    }

    // Rule 3: 4 of 5 on same side beyond 1σ
    if (i >= 4) {
      const window = zScores.slice(i - 4, i + 1);
      if (window.filter((v) => v > 1).length >= 4 || window.filter((v) => v < -1).length >= 4) {
        violations[i].push('WE3:4of5beyond1sigma');
      }
    }

    // Rule 4: 8 consecutive on same side
    if (i >= 7) {
      const window = zScores.slice(i - 7, i + 1);
      if (window.every((v) => v > 0) || window.every((v) => v < 0)) {
        violations[i].push('WE4:8onSameSide');
      }
    }

    // Rule 5: 6 consecutive monotone
    if (i >= 5) {
      const window = zScores.slice(i - 5, i + 1);
      let inc = true; let dec = true;
      for (let j = 1; j < window.length; j++) {
        if (window[j] <= window[j - 1]) inc = false;
        if (window[j] >= window[j - 1]) dec = false;
      }
      if (inc || dec) violations[i].push('WE5:trend6');
    }

    // Rule 6: 15 consecutive within 1σ (stratification)
    if (i >= 14) {
      const window = zScores.slice(i - 14, i + 1);
      if (window.every((v) => Math.abs(v) < 1)) violations[i].push('WE6:stratification15');
    }

    // Rule 7: 14 consecutive alternating
    if (i >= 13) {
      const window = zScores.slice(i - 13, i + 1);
      let alternating = true;
      for (let j = 1; j < window.length; j++) {
        const prev = window[j - 1];
        const curr = window[j];
        if ((curr > prev) === (window[j - 1] > (j >= 2 ? window[j - 2] : prev - 1))) {
          alternating = false; break;
        }
      }
      if (alternating) violations[i].push('WE7:alternating14');
    }

    // Rule 8: 8 consecutive outside ±1σ (mixture)
    if (i >= 7) {
      const window = zScores.slice(i - 7, i + 1);
      if (window.every((v) => Math.abs(v) > 1)) violations[i].push('WE8:mixture8');
    }
  }

  return violations;
}

// ─── X̄-R chart ───────────────────────────────────────────────────────────────

function buildXbarRChart(subgroups: Subgroup[]): SPCChartResult {
  if (subgroups.length < 2) throw new Error('[spc] X̄-R chart requires ≥ 2 subgroups');
  const n = subgroups[0].values.length;
  if (n < 2 || n > 10) throw new Error('[spc] X̄-R chart subgroup size must be 2–10');

  const a2 = A2[n] ?? 0.577;
  const d3 = D3[n] ?? 0;
  const d4 = D4[n] ?? 2.115;

  const means = subgroups.map((sg) => mean(sg.values));
  const ranges = subgroups.map((sg) => range(sg.values));

  const xbarBar = mean(means);
  const rBar = mean(ranges);

  const primaryLimits: ControlLimits = {
    centerLine: xbarBar,
    ucl: xbarBar + a2 * rBar,
    lcl: xbarBar - a2 * rBar,
  };
  const secondaryLimits: ControlLimits = {
    centerLine: rBar,
    ucl: d4 * rBar,
    lcl: Math.max(0, d3 * rBar),
    lclFloor: 0,
  };

  const sigma = rBar / (D2[n] ?? 2.326);
  const primaryZ = means.map((m) => (sigma > 0 ? (m - xbarBar) / sigma : 0));
  const primaryViolations = westernElectricViolations(primaryZ);

  const subgroupStats: SubgroupStat[] = subgroups.map((sg, i) => {
    const ruleViolations = primaryViolations[i];
    const rangeOOC = ranges[i] > secondaryLimits.ucl || ranges[i] < secondaryLimits.lcl;
    const violations = [...ruleViolations];
    if (rangeOOC) violations.push('R:outOfControl');
    return {
      index: sg.index,
      n,
      mean: means[i],
      range: ranges[i],
      outOfControl: violations.length > 0,
      violatedRules: violations,
    };
  });

  const oocCount = subgroupStats.filter((s) => s.outOfControl).length;
  return {
    chartType: 'xbar_r',
    subgroupCount: subgroups.length,
    totalObservations: subgroups.length * n,
    primaryChart: primaryLimits,
    secondaryChart: secondaryLimits,
    subgroupStats,
    outOfControlCount: oocCount,
    processInControl: oocCount === 0,
  };
}

// ─── X̄-s chart ───────────────────────────────────────────────────────────────

function buildXbarSChart(subgroups: Subgroup[]): SPCChartResult {
  if (subgroups.length < 2) throw new Error('[spc] X̄-s chart requires ≥ 2 subgroups');
  const n = subgroups[0].values.length;
  if (n < 2 || n > 10) throw new Error('[spc] X̄-s chart subgroup size must be 2–10');

  const a3 = A3[n] ?? 1.427;
  const b3 = B3[n] ?? 0;
  const b4 = B4[n] ?? 2.089;

  const means = subgroups.map((sg) => mean(sg.values));
  const stds = subgroups.map((sg) => sampleStdDev(sg.values));

  const xbarBar = mean(means);
  const sBar = mean(stds);

  const primaryLimits: ControlLimits = {
    centerLine: xbarBar,
    ucl: xbarBar + a3 * sBar,
    lcl: xbarBar - a3 * sBar,
  };
  const secondaryLimits: ControlLimits = {
    centerLine: sBar,
    ucl: b4 * sBar,
    lcl: b3 * sBar,
    lclFloor: 0,
  };

  const c4val = C4[n] ?? 0.9400;
  const sigma = sBar / c4val;
  const primaryZ = means.map((m) => (sigma > 0 ? (m - xbarBar) / sigma : 0));
  const primaryViolations = westernElectricViolations(primaryZ);

  const subgroupStats: SubgroupStat[] = subgroups.map((sg, i) => {
    const violations = [...primaryViolations[i]];
    if (stds[i] > secondaryLimits.ucl || stds[i] < secondaryLimits.lcl) violations.push('s:outOfControl');
    return {
      index: sg.index,
      n,
      mean: means[i],
      stdDev: stds[i],
      outOfControl: violations.length > 0,
      violatedRules: violations,
    };
  });

  const oocCount = subgroupStats.filter((s) => s.outOfControl).length;
  return {
    chartType: 'xbar_s',
    subgroupCount: subgroups.length,
    totalObservations: subgroups.reduce((s, sg) => s + sg.values.length, 0),
    primaryChart: primaryLimits,
    secondaryChart: secondaryLimits,
    subgroupStats,
    outOfControlCount: oocCount,
    processInControl: oocCount === 0,
  };
}

// ─── p-chart (fraction nonconforming) ────────────────────────────────────────

function buildPChart(subgroups: Subgroup[]): SPCChartResult {
  if (subgroups.length < 2) throw new Error('[spc] p-chart requires ≥ 2 subgroups');
  for (const sg of subgroups) {
    if (sg.n === undefined || sg.defects === undefined) {
      throw new Error('[spc] p-chart requires .n and .defects on every subgroup');
    }
  }

  const totInspected = subgroups.reduce((s, sg) => s + (sg.n ?? 0), 0);
  const totDefects = subgroups.reduce((s, sg) => s + (sg.defects ?? 0), 0);
  const pBar = totInspected > 0 ? totDefects / totInspected : 0;

  const subgroupStats: SubgroupStat[] = subgroups.map((sg) => {
    const n = sg.n ?? 1;
    const d = sg.defects ?? 0;
    const p = n > 0 ? d / n : 0;
    const sigma = Math.sqrt((pBar * (1 - pBar)) / n);
    const ucl = Math.min(1, pBar + 3 * sigma);
    const lcl = Math.max(0, pBar - 3 * sigma);
    const ooc = p > ucl || p < lcl;
    return {
      index: sg.index,
      n,
      proportion: p,
      outOfControl: ooc,
      violatedRules: ooc ? ['p:outOfControl'] : [],
    };
  });

  // Use average n for overall limits
  const nBar = totInspected / subgroups.length;
  const sigmaBar = Math.sqrt((pBar * (1 - pBar)) / nBar);
  const primaryLimits: ControlLimits = {
    centerLine: pBar,
    ucl: Math.min(1, pBar + 3 * sigmaBar),
    lcl: Math.max(0, pBar - 3 * sigmaBar),
    lclFloor: 0,
  };

  const oocCount = subgroupStats.filter((s) => s.outOfControl).length;
  return {
    chartType: 'p',
    subgroupCount: subgroups.length,
    totalObservations: totInspected,
    primaryChart: primaryLimits,
    subgroupStats,
    outOfControlCount: oocCount,
    processInControl: oocCount === 0,
  };
}

// ─── c-chart (count of defects, constant n) ───────────────────────────────────

function buildCChart(subgroups: Subgroup[]): SPCChartResult {
  if (subgroups.length < 2) throw new Error('[spc] c-chart requires ≥ 2 subgroups');
  for (const sg of subgroups) {
    if (sg.defects === undefined) throw new Error('[spc] c-chart requires .defects on every subgroup');
  }

  const counts = subgroups.map((sg) => sg.defects ?? 0);
  const cBar = mean(counts);
  const sigma = Math.sqrt(cBar);

  const primaryLimits: ControlLimits = {
    centerLine: cBar,
    ucl: cBar + 3 * sigma,
    lcl: Math.max(0, cBar - 3 * sigma),
    lclFloor: 0,
  };

  const zScores = counts.map((c) => (sigma > 0 ? (c - cBar) / sigma : 0));
  const violations = westernElectricViolations(zScores);

  const subgroupStats: SubgroupStat[] = subgroups.map((sg, i) => ({
    index: sg.index,
    n: sg.n ?? 1,
    rate: counts[i],
    outOfControl: violations[i].length > 0,
    violatedRules: violations[i],
  }));

  const oocCount = subgroupStats.filter((s) => s.outOfControl).length;
  return {
    chartType: 'c',
    subgroupCount: subgroups.length,
    totalObservations: subgroups.reduce((s, sg) => s + (sg.n ?? 1), 0),
    primaryChart: primaryLimits,
    subgroupStats,
    outOfControlCount: oocCount,
    processInControl: oocCount === 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a Shewhart control chart from subgroup data.
 *
 * Chart type selection:
 *  - 'xbar_r'  : variables data, subgroup size 2–10 (preferred for n ≤ 7)
 *  - 'xbar_s'  : variables data, subgroup size 2–10 (preferred for n ≥ 8)
 *  - 'p'       : fraction nonconforming (variable n), needs .n + .defects
 *  - 'np'      : count nonconforming (fixed n), needs .n + .defects
 *  - 'c'       : defect count per unit (fixed opportunity), needs .defects
 *  - 'u'       : defect rate (variable opportunity), needs .n + .defects
 */
export function buildSPCChart(type: ChartType, subgroups: Subgroup[]): SPCChartResult {
  switch (type) {
    case 'xbar_r':  return buildXbarRChart(subgroups);
    case 'xbar_s':  return buildXbarSChart(subgroups);
    case 'p':       return buildPChart(subgroups);
    case 'np': {
      // np-chart: same as p-chart but plot count instead of proportion
      const result = buildPChart(subgroups);
      const n = subgroups[0].n ?? 1;
      return {
        ...result,
        chartType: 'np',
        primaryChart: {
          centerLine: result.primaryChart.centerLine * n,
          ucl: result.primaryChart.ucl * n,
          lcl: result.primaryChart.lcl * n,
          lclFloor: 0,
        },
      };
    }
    case 'c':       return buildCChart(subgroups);
    case 'u': {
      // u-chart: defects per unit (c-chart normalised by n)
      for (const sg of subgroups) {
        if (sg.n === undefined || sg.defects === undefined) {
          throw new Error('[spc] u-chart requires .n and .defects on every subgroup');
        }
      }
      const rates = subgroups.map((sg) => (sg.defects ?? 0) / (sg.n ?? 1));
      const uBar = mean(rates);
      const nBar = mean(subgroups.map((sg) => sg.n ?? 1));
      const sigma = Math.sqrt(uBar / nBar);
      const primaryLimits: ControlLimits = {
        centerLine: uBar,
        ucl: uBar + 3 * sigma,
        lcl: Math.max(0, uBar - 3 * sigma),
        lclFloor: 0,
      };
      const zScores = rates.map((u) => (sigma > 0 ? (u - uBar) / sigma : 0));
      const violations = westernElectricViolations(zScores);
      const subgroupStats: SubgroupStat[] = subgroups.map((sg, i) => ({
        index: sg.index,
        n: sg.n ?? 1,
        rate: rates[i],
        outOfControl: violations[i].length > 0,
        violatedRules: violations[i],
      }));
      const oocCount = subgroupStats.filter((s) => s.outOfControl).length;
      return {
        chartType: 'u',
        subgroupCount: subgroups.length,
        totalObservations: subgroups.reduce((s, sg) => s + (sg.n ?? 1), 0),
        primaryChart: primaryLimits,
        subgroupStats,
        outOfControlCount: oocCount,
        processInControl: oocCount === 0,
      };
    }
    default:
      throw new Error(`[spc] unknown chart type: ${String(type)}`);
  }
}

/**
 * Compute process capability indices from variables data.
 *
 * @param allValues  All individual measurements (flattened across subgroups)
 * @param subgroups  Original subgroups (used for within-subgroup σ̂ via R̄/d₂)
 * @param lsl        Lower specification limit
 * @param usl        Upper specification limit
 * @param target     Nominal target (optional; used for Cpm)
 */
export function computeCapability(
  allValues: number[],
  subgroups: Subgroup[],
  lsl: number,
  usl: number,
  target?: number,
): ProcessCapability {
  if (usl <= lsl) throw new Error('[spc] usl must be > lsl');
  if (allValues.length < 2) throw new Error('[spc] need ≥ 2 values for capability');

  const processMean = mean(allValues);
  // Overall (long-term) σ
  const overallSigma = sampleStdDev(allValues);

  // Within-subgroup (short-term) σ̂ via R̄/d₂ if all subgroups same size
  let withinSigma = overallSigma;
  const n = subgroups[0]?.values.length ?? 0;
  const sameSize = subgroups.every((sg) => sg.values.length === n);
  if (sameSize && n >= 2 && n <= 10) {
    const d2val = D2[n] ?? 2.326;
    const rBar = mean(subgroups.map((sg) => range(sg.values)));
    withinSigma = rBar / d2val;
    if (withinSigma === 0) withinSigma = overallSigma;
  }

  const specWidth = usl - lsl;
  const Cp  = withinSigma  > 0 ? specWidth / (6 * withinSigma)  : Infinity;
  const Pp  = overallSigma > 0 ? specWidth / (6 * overallSigma) : Infinity;

  const CpkUpper = withinSigma  > 0 ? (usl - processMean) / (3 * withinSigma)  : Infinity;
  const CpkLower = withinSigma  > 0 ? (processMean - lsl) / (3 * withinSigma)  : Infinity;
  const Cpk = Math.min(CpkUpper, CpkLower);

  const PpkUpper = overallSigma > 0 ? (usl - processMean) / (3 * overallSigma) : Infinity;
  const PpkLower = overallSigma > 0 ? (processMean - lsl) / (3 * overallSigma) : Infinity;
  const Ppk = Math.min(PpkUpper, PpkLower);

  let Cpm: number | undefined;
  if (target !== undefined && withinSigma > 0) {
    const tauSq = withinSigma ** 2 + (processMean - target) ** 2;
    Cpm = specWidth / (6 * Math.sqrt(tauSq));
  }

  const zAboveUSL = overallSigma > 0 ? (usl - processMean) / overallSigma : Infinity;
  const zBelowLSL = overallSigma > 0 ? (processMean - lsl) / overallSigma : Infinity;
  const ppmAboveLSL = ppm(zAboveUSL);
  const ppmBelowUSL = ppm(zBelowLSL);

  return {
    lsl, usl, target,
    processMean,
    processStdDev: overallSigma,
    Cp, Cpk, CpkLower, CpkUpper,
    Pp, Ppk,
    Cpm,
    ppmAboveLSL,
    ppmBelowUSL,
    ppmTotal: ppmAboveLSL + ppmBelowUSL,
    capable: Cpk >= 1.33,
  };
}

/**
 * Build a CAEL-ready SPC receipt.
 */
export function buildSPCReceipt(
  modelId: string,
  chartResult: SPCChartResult,
  capability?: ProcessCapability,
  options: SPCReceiptOptions = {},
): SPCReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (!chartResult.processInControl) {
    violations.push({
      criterion: 'process_control',
      message: `${chartResult.outOfControlCount} out-of-control subgroup(s) detected`,
    });
  }
  if (capability && !capability.capable) {
    violations.push({
      criterion: 'capability',
      message: `Cpk=${capability.Cpk.toFixed(3)} < 1.33 (process not capable)`,
    });
  }

  const receipt = buildDomainSimulationReceipt({
    plugin: 'manufacturing-qc' as const,
    pluginVersion: '1.0.0',
    runId: options.runId ?? `spc-${Date.now().toString(36)}`,
    createdAt: options.createdAt,
    modelId,
    solverConfig: {
      solverType: 'spc',
      chartType: chartResult.chartType,
      subgroupCount: chartResult.subgroupCount,
      totalObservations: chartResult.totalObservations,
    },
    resultSummary: {
      processInControl: chartResult.processInControl,
      outOfControlCount: chartResult.outOfControlCount,
      capable: capability?.capable,
      Cpk: capability?.Cpk,
      Ppk: capability?.Ppk,
    },
    cael: {
      version: 'cael.v1',
      event: 'manufacturing_qc.spc',
      solverType: 'manufacturing-qc.spc',
    },
    acceptance: { accepted: violations.length === 0, violations },
  });

  return receipt as SPCReceipt;
}

export const SPC_PLUGIN_VERSION = '1.0.0';
export const DOMAIN_SIMULATION_RECEIPT_SCHEMA_REF = DOMAIN_SIMULATION_RECEIPT_SCHEMA;
