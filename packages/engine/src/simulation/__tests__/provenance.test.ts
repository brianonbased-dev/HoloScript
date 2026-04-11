/**
 * Provenance & Reproducibility Tests
 *
 * Validates:
 * - SimulationRun captures all config fields
 * - Run comparison detects config and result differences
 * - ProvenanceTracker records and retrieves runs
 * - Determinism verification (same input → same output)
 * - JSON export round-trips
 */

import { describe, it, expect } from 'vitest';
import {
  createSimulationRun,
  compareRuns,
  type SimulationRunConfig,
  type SimulationRunResult,
} from '../provenance/SimulationRun';
import { ProvenanceTracker } from '../provenance/ProvenanceTracker';

// ── Test Fixtures ────────────────────────────────────────────────────────────

const testConfig: SimulationRunConfig = {
  solverType: 'thermal',
  solverConfig: { gridResolution: [10, 10, 10], timeStep: 0.001 },
  mesh: { type: 'regular_grid', dimensions: { nx: 10, ny: 10, nz: 10 } },
  materials: [
    { name: 'steel_a36', properties: { conductivity: 50, density: 7850 }, source: 'ASM Handbook' },
  ],
  resultFieldName: 'Temperature',
};

const testResult: SimulationRunResult = {
  converged: true,
  iterations: 42,
  finalResidual: 1e-8,
  min: 20,
  max: 100,
  avg: 60,
  wallTimeMs: 15.3,
};

// ── SimulationRun ────────────────────────────────────────────────────────────

describe('SimulationRun', () => {
  it('creates run with all config fields captured', () => {
    const run = createSimulationRun(testConfig, testResult, '6.1.0', 'abc123');

    expect(run.metadata.schemaVersion).toBe('1.0.0');
    expect(run.metadata.runId).toMatch(/^sim_/);
    expect(run.metadata.timestamp).toBeTruthy();
    expect(run.metadata.software.name).toBe('HoloScript');
    expect(run.metadata.software.version).toBe('6.1.0');
    expect(run.metadata.software.commitHash).toBe('abc123');
    expect(run.metadata.solver.type).toBe('thermal');
    expect(run.metadata.mesh.type).toBe('regular_grid');
    expect(run.metadata.materials[0].name).toBe('steel_a36');
    expect(run.metadata.convergence?.converged).toBe(true);
    expect(run.metadata.convergence?.iterations).toBe(42);
    expect(run.metadata.resultSummary.min).toBe(20);
    expect(run.metadata.resultSummary.max).toBe(100);
    expect(run.metadata.deterministic).toBe(true);
  });

  it('run is frozen (immutable)', () => {
    const run = createSimulationRun(testConfig, testResult, '6.1.0');
    expect(Object.isFrozen(run)).toBe(true);
  });
});

// ── Run Comparison ───────────────────────────────────────────────────────────

describe('Run comparison', () => {
  it('identical runs report config and result match', () => {
    const run1 = createSimulationRun(testConfig, testResult, '6.1.0');
    const run2 = createSimulationRun(testConfig, testResult, '6.1.0');

    const cmp = compareRuns(run1, run2);
    expect(cmp.configMatch).toBe(true);
    expect(cmp.configDiffs).toEqual([]);
    expect(cmp.resultMatch).toBe(true);
    expect(cmp.resultDiffs).toEqual([]);
  });

  it('detects solver type difference', () => {
    const config2 = { ...testConfig, solverType: 'structural' as const };
    const run1 = createSimulationRun(testConfig, testResult, '6.1.0');
    const run2 = createSimulationRun(config2, testResult, '6.1.0');

    const cmp = compareRuns(run1, run2);
    expect(cmp.configMatch).toBe(false);
    expect(cmp.configDiffs).toContain('solver.type: thermal vs structural');
  });

  it('detects result differences beyond tolerance', () => {
    const result2 = { ...testResult, max: 105 }; // 5% different
    const run1 = createSimulationRun(testConfig, testResult, '6.1.0');
    const run2 = createSimulationRun(testConfig, result2, '6.1.0');

    const cmp = compareRuns(run1, run2, 0.01); // 1% tolerance
    expect(cmp.resultMatch).toBe(false);
    expect(cmp.resultDiffs.length).toBeGreaterThan(0);
    expect(cmp.resultDiffs[0].field).toBe('max');
  });

  it('tolerates small result differences within tolerance', () => {
    const result2 = { ...testResult, max: 100.00001 }; // tiny difference
    const run1 = createSimulationRun(testConfig, testResult, '6.1.0');
    const run2 = createSimulationRun(testConfig, result2, '6.1.0');

    const cmp = compareRuns(run1, run2, 1e-3); // 0.1% tolerance
    expect(cmp.resultMatch).toBe(true);
  });
});

// ── ProvenanceTracker ────────────────────────────────────────────────────────

describe('ProvenanceTracker', () => {
  it('tracks runs with timing', () => {
    const tracker = new ProvenanceTracker('6.1.0');
    const run = tracker.track(testConfig, () => testResult);

    expect(run.metadata.solver.type).toBe('thermal');
    expect(tracker.getRuns().length).toBe(1);
    expect(tracker.getLastRun()).toBe(run);
  });

  it('verifyDeterminism passes for pure functions', () => {
    const tracker = new ProvenanceTracker('6.1.0');

    // A pure solver function should produce identical results
    const { deterministic, comparison } = tracker.verifyDeterminism(
      testConfig,
      () => testResult
    );

    expect(deterministic).toBe(true);
    expect(comparison.configMatch).toBe(true);
    expect(comparison.resultMatch).toBe(true);
    expect(tracker.getRuns().length).toBe(2);
  });

  it('verifyDeterminism fails for non-deterministic results', () => {
    const tracker = new ProvenanceTracker('6.1.0');
    let callCount = 0;

    const { deterministic } = tracker.verifyDeterminism(
      testConfig,
      () => {
        callCount++;
        return { ...testResult, max: callCount === 1 ? 100 : 200 };
      }
    );

    expect(deterministic).toBe(false);
  });

  it('exports runs as JSON', () => {
    const tracker = new ProvenanceTracker('6.1.0', 'abc123');
    tracker.track(testConfig, () => testResult);

    const json = tracker.exportJSON();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].software.version).toBe('6.1.0');
  });

  it('clear removes all runs', () => {
    const tracker = new ProvenanceTracker('6.1.0');
    tracker.track(testConfig, () => testResult);
    tracker.track(testConfig, () => testResult);
    expect(tracker.getRuns().length).toBe(2);

    tracker.clear();
    expect(tracker.getRuns().length).toBe(0);
    expect(tracker.getLastRun()).toBeUndefined();
  });

  it('compareLast returns undefined with fewer than 2 runs', () => {
    const tracker = new ProvenanceTracker('6.1.0');
    expect(tracker.compareLast()).toBeUndefined();

    tracker.track(testConfig, () => testResult);
    expect(tracker.compareLast()).toBeUndefined();
  });
});
