/**
 * Tests for UncertaintyQuantification — LHS ensemble analysis with
 * confidence intervals, percentiles, and field distributions.
 */

import { describe, it, expect } from 'vitest';
import {
  UncertaintyQuantification,
  computeScalarDistribution,
  computeFieldDistribution,
  type UQConfig,
  type UQSolverHandle,
} from '../UncertaintyQuantification';
import type { SimSolver } from '../SimSolver';

// ── Mock Solver Factory ─────────────────────────────────────────────────────

/**
 * Creates a deterministic mock solver whose output depends on config values.
 * This lets us verify that parameter variations propagate through to results.
 */
function mockSolverFactory(_type: string, config: Record<string, unknown>): UQSolverHandle {
  const stiffness = (config.stiffness as number) ?? 1.0;
  const load = (config.load as number) ?? 1.0;

  // Output is a simple function of inputs: displacement ≈ load / stiffness
  const displacement = load / stiffness;
  const maxStress = displacement * stiffness * 0.5;
  const fieldSize = 8;

  // Field values scale linearly with node index * displacement
  const displacementField = new Float64Array(fieldSize);
  const stressField = new Float64Array(fieldSize);
  for (let i = 0; i < fieldSize; i++) {
    displacementField[i] = displacement * (1 + i * 0.1);
    stressField[i] = maxStress * (1 - i * 0.05);
  }

  return {
    fieldNames: ['displacement', 'stress'] as const,
    solve: async () => { /* deterministic — nothing to solve */ },
    getField: (name: string) => {
      if (name === 'displacement') return displacementField;
      if (name === 'stress') return stressField;
      return null;
    },
    getStats: () => ({
      converged: true,
      maxDisplacement: displacement,
      maxStress,
      stiffness,
      load,
    }),
    dispose: () => {},
  };
}

// ── computeScalarDistribution ───────────────────────────────────────────────

describe('computeScalarDistribution', () => {
  it('computes correct mean and std for known data', () => {
    const values = [2, 4, 6, 8, 10];
    const dist = computeScalarDistribution(values, 0.95);

    expect(dist.n).toBe(5);
    expect(dist.mean).toBeCloseTo(6.0, 10);
    expect(dist.std).toBeCloseTo(Math.sqrt(10), 5); // sample std of [2,4,6,8,10]
    expect(dist.min).toBe(2);
    expect(dist.max).toBe(10);
  });

  it('computes correct percentiles', () => {
    // 100 values from 1 to 100
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const dist = computeScalarDistribution(values);

    // p50 should be near 50.5
    expect(dist.percentiles.p50).toBeCloseTo(50.5, 0);
    // p5 should be near 5.95
    expect(dist.percentiles.p5).toBeCloseTo(5.95, 0);
    // p95 should be near 95.05
    expect(dist.percentiles.p95).toBeCloseTo(95.05, 0);
  });

  it('computes confidence interval that contains the mean', () => {
    const values = [10, 12, 11, 13, 10, 12, 11, 14, 10, 12];
    const dist = computeScalarDistribution(values, 0.95);

    expect(dist.confidenceInterval.level).toBe(0.95);
    expect(dist.confidenceInterval.lower).toBeLessThan(dist.mean);
    expect(dist.confidenceInterval.upper).toBeGreaterThan(dist.mean);
  });

  it('handles constant values (zero variance)', () => {
    const values = [5, 5, 5, 5, 5];
    const dist = computeScalarDistribution(values);

    expect(dist.mean).toBe(5);
    expect(dist.std).toBe(0);
    expect(dist.variance).toBe(0);
    expect(dist.min).toBe(5);
    expect(dist.max).toBe(5);
  });

  it('computes coefficient of variation', () => {
    const values = [100, 102, 98, 101, 99];
    const dist = computeScalarDistribution(values);

    // CoV = std / |mean|, should be small for values clustered around 100
    expect(dist.cov).toBeLessThan(0.05);
    expect(dist.cov).toBeGreaterThan(0);
  });
});

// ── computeFieldDistribution ────────────────────────────────────────────────

describe('computeFieldDistribution', () => {
  it('computes per-node mean and std', () => {
    const samples = [
      new Float64Array([1, 2, 3]),
      new Float64Array([3, 4, 5]),
      new Float64Array([5, 6, 7]),
    ];

    const dist = computeFieldDistribution('test', samples, 0.95);

    expect(dist.name).toBe('test');
    expect(dist.n).toBe(3);
    expect(dist.mean.length).toBe(3);

    // Mean of [1,3,5]=3, [2,4,6]=4, [3,5,7]=5
    expect(dist.mean[0]).toBeCloseTo(3, 10);
    expect(dist.mean[1]).toBeCloseTo(4, 10);
    expect(dist.mean[2]).toBeCloseTo(5, 10);

    // Std of [1,3,5] = 2
    expect(dist.std[0]).toBeCloseTo(2, 5);
    expect(dist.std[1]).toBeCloseTo(2, 5);
    expect(dist.std[2]).toBeCloseTo(2, 5);
  });

  it('confidence intervals bracket the mean', () => {
    const samples = Array.from({ length: 20 }, (_, i) =>
      new Float64Array([i * 0.5, i * 1.0, i * 1.5]),
    );

    const dist = computeFieldDistribution('field', samples, 0.95);

    for (let j = 0; j < 3; j++) {
      expect(dist.ciLower[j]).toBeLessThan(dist.mean[j]);
      expect(dist.ciUpper[j]).toBeGreaterThan(dist.mean[j]);
    }

    expect(dist.ciLevel).toBe(0.95);
  });
});

// ── UncertaintyQuantification (full integration) ────────────────────────────

describe('UncertaintyQuantification', () => {
  it('implements SimSolver interface', () => {
    const config: UQConfig = {
      name: 'test-uq',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'stiffness', min: 190e9, max: 210e9 },
      ],
      sampleCount: 5,
    };

    const uq: SimSolver = new UncertaintyQuantification(config, mockSolverFactory);

    expect(uq.mode).toBe('steady-state');
    expect(typeof uq.step).toBe('function');
    expect(typeof uq.solve).toBe('function');
    expect(typeof uq.getField).toBe('function');
    expect(typeof uq.getStats).toBe('function');
    expect(typeof uq.dispose).toBe('function');
  });

  it('runs LHS ensemble and produces scalar distributions', async () => {
    const config: UQConfig = {
      name: 'scalar-test',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'stiffness', min: 190e9, max: 210e9 },
        { path: 'load', min: 900, max: 1100 },
      ],
      sampleCount: 20,
      confidenceLevel: 0.95,
      seed: 42,
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    await uq.solve();

    const result = uq.getResult();
    expect(result).not.toBeNull();
    expect(result!.ensembleSize).toBe(20);
    expect(result!.convergenceRate).toBe(1.0);

    // Should have scalar distributions for maxDisplacement, maxStress, etc.
    const maxDisp = uq.getScalarDistribution('maxDisplacement');
    expect(maxDisp).not.toBeNull();
    expect(maxDisp!.n).toBe(20);
    expect(maxDisp!.mean).toBeGreaterThan(0);
    expect(maxDisp!.std).toBeGreaterThan(0);
    expect(maxDisp!.confidenceInterval.level).toBe(0.95);
    expect(maxDisp!.confidenceInterval.lower).toBeLessThan(maxDisp!.mean);
    expect(maxDisp!.confidenceInterval.upper).toBeGreaterThan(maxDisp!.mean);
  });

  it('runs LHS ensemble and produces field distributions', async () => {
    const config: UQConfig = {
      name: 'field-test',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'stiffness', min: 190e9, max: 210e9 },
      ],
      sampleCount: 15,
      fieldNames: ['displacement', 'stress'],
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    await uq.solve();

    // Field distributions should exist
    const dispDist = uq.getFieldDistribution('displacement');
    expect(dispDist).not.toBeNull();
    expect(dispDist!.n).toBe(15);
    expect(dispDist!.mean.length).toBe(8); // mock field size
    expect(dispDist!.std.length).toBe(8);
    expect(dispDist!.ciLower.length).toBe(8);
    expect(dispDist!.ciUpper.length).toBe(8);

    // Mean field should be retrievable via SimSolver interface
    const meanField = uq.getField('displacement');
    expect(meanField).not.toBeNull();
    expect(meanField).toBeInstanceOf(Float64Array);
    expect((meanField as Float64Array).length).toBe(8);

    // CI should bracket mean at each node
    for (let i = 0; i < 8; i++) {
      expect(dispDist!.ciLower[i]).toBeLessThanOrEqual(dispDist!.mean[i]);
      expect(dispDist!.ciUpper[i]).toBeGreaterThanOrEqual(dispDist!.mean[i]);
    }
  });

  it('getStats() returns flattened distributional statistics', async () => {
    const config: UQConfig = {
      name: 'stats-test',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'stiffness', min: 190e9, max: 210e9 },
      ],
      sampleCount: 10,
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    await uq.solve();

    const stats = uq.getStats();
    expect(stats.solved).toBe(true);
    expect(stats.ensembleSize).toBe(10);
    expect(stats.convergenceRate).toBe(1.0);
    expect(typeof stats.totalTimeMs).toBe('number');

    // Flattened scalar distributions
    expect(typeof stats.maxDisplacement_mean).toBe('number');
    expect(typeof stats.maxDisplacement_std).toBe('number');
    expect(typeof stats.maxDisplacement_ci_lower).toBe('number');
    expect(typeof stats.maxDisplacement_ci_upper).toBe('number');
    expect(typeof stats.maxDisplacement_p50).toBe('number');
  });

  it('reports progress during ensemble', async () => {
    const progressCalls: [number, number][] = [];

    const config: UQConfig = {
      name: 'progress-test',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'stiffness', min: 190e9, max: 210e9 },
      ],
      sampleCount: 5,
      onProgress: (completed, total) => progressCalls.push([completed, total]),
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    await uq.solve();

    expect(progressCalls.length).toBeGreaterThan(0);
    // Last call should show all complete
    const last = progressCalls[progressCalls.length - 1];
    expect(last[0]).toBe(last[1]);
  });

  it('handles single uncertain parameter', async () => {
    const config: UQConfig = {
      name: 'single-param',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'load', min: 800, max: 1200 },
      ],
      sampleCount: 30,
      confidenceLevel: 0.90,
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    await uq.solve();

    const result = uq.getResult()!;
    expect(result.ensembleSize).toBe(30);

    // With higher sample count, CI should be narrower than with fewer samples
    const dist = result.scalarDistributions.get('maxDisplacement')!;
    const ciWidth = dist.confidenceInterval.upper - dist.confidenceInterval.lower;
    expect(ciWidth).toBeGreaterThan(0);
    expect(ciWidth).toBeLessThan(dist.max - dist.min);
  });

  it('dispose() clears results', async () => {
    const config: UQConfig = {
      name: 'dispose-test',
      baseConfig: { stiffness: 200e9, load: 1000 },
      solverType: 'structural',
      uncertainParameters: [
        { path: 'stiffness', min: 190e9, max: 210e9 },
      ],
      sampleCount: 5,
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    await uq.solve();
    expect(uq.getResult()).not.toBeNull();

    uq.dispose();
    expect(uq.getResult()).toBeNull();
    expect(uq.getField('displacement')).toBeNull();
    expect(uq.getStats().solved).toBe(false);
  });

  it('getStats() before solve() returns unsolved state', () => {
    const config: UQConfig = {
      name: 'presolved',
      baseConfig: {},
      solverType: 'test',
      uncertainParameters: [],
    };

    const uq = new UncertaintyQuantification(config, mockSolverFactory);
    const stats = uq.getStats();
    expect(stats.solved).toBe(false);
    expect(stats.ensembleSize).toBe(0);
  });
});
