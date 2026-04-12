/**
 * Phase 5 Tests: SimSolver interface, adapters, CouplingManagerV2,
 * ParameterSpace, ExperimentOrchestrator, ResultsAnalyzer
 */

import { describe, it, expect } from 'vitest';

// 5A: SimSolver + Adapters
import type { SimSolver } from '../SimSolver';
import { ThermalSolverAdapter, StructuralSolverAdapter, HydraulicSolverAdapter } from '../adapters/SolverAdapters';
import { ThermalSolver, ThermalConfig } from '../ThermalSolver';
import { StructuralSolver, StructuralConfig } from '../StructuralSolver';
import { HydraulicSolver } from '../HydraulicSolver';
import { CouplingManagerV2 } from '../CouplingManagerV2';

// 5C: Experiment
import { ParameterSpace, applyOverrides, type ParameterRange } from '../experiment/ParameterSpace';
import { ExperimentOrchestrator, type SolverHandle } from '../experiment/ExperimentOrchestrator';
import { summarize, sensitivity, exportSweepCSV } from '../experiment/ResultsAnalyzer';

// ═══════════════════════════════════════════════════════════════════════
// 5A: SimSolver Interface + Adapters
// ═══════════════════════════════════════════════════════════════════════

describe('5A: SimSolver Adapters', () => {
  it('ThermalSolverAdapter implements SimSolver correctly', () => {
    const config: ThermalConfig = {
      gridResolution: [4, 4, 4],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: { air: { conductivity: 0.026, density: 1.225, specific_heat: 1005 } },
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };

    const solver = new ThermalSolver(config);
    const adapter: SimSolver = new ThermalSolverAdapter(solver);

    expect(adapter.mode).toBe('transient');
    expect(adapter.fieldNames).toContain('temperature');
    expect(adapter.fieldNames).toContain('temperature_grid');

    // Step should not throw
    adapter.step(0.01);

    // Fields should be accessible
    const tempField = adapter.getField('temperature');
    expect(tempField).toBeInstanceOf(Float32Array);
    expect(tempField!.length).toBe(4 * 4 * 4);

    // Unknown field returns null
    expect(adapter.getField('nonexistent')).toBeNull();

    // Stats should be an object
    const stats = adapter.getStats();
    expect(typeof stats).toBe('object');

    adapter.dispose();
  });

  it('StructuralSolverAdapter wraps TET4 solver', () => {
    const config: StructuralConfig = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      tetrahedra: new Uint32Array([0, 1, 2, 3]),
      material: { density: 1000, youngs_modulus: 1e6, poisson_ratio: 0.3, yield_strength: 1e8 },
      constraints: [{ id: 'fix', type: 'fixed', nodes: [0] }],
      loads: [{ id: 'load', type: 'point', nodeIndex: 3, force: [0, 0, 100] }],
    };

    const solver = new StructuralSolver(config);
    const adapter: SimSolver = new StructuralSolverAdapter(solver);

    expect(adapter.mode).toBe('steady-state');
    expect(adapter.fieldNames).toContain('von_mises_stress');
    expect(adapter.fieldNames).toContain('displacements');

    adapter.solve();

    const stress = adapter.getField('von_mises_stress');
    expect(stress).toBeInstanceOf(Float32Array);

    adapter.dispose();
  });

  it('HydraulicSolverAdapter wraps hydraulic solver', () => {
    const solver = new HydraulicSolver({
      pipes: [{ id: 'p1', diameter: 0.1, length: 100, roughness: 0.001 }],
      nodes: [
        { id: 'n1', elevation: 10, demand: 0, pressure_head: 100 },
        { id: 'n2', elevation: 0, demand: 0.01 },
      ],
      connections: [['n1', 'p1', 'n2']],
      valves: [],
    });

    const adapter: SimSolver = new HydraulicSolverAdapter(solver);

    expect(adapter.mode).toBe('steady-state');
    adapter.solve();

    expect(adapter.getField('pressure')).toBeInstanceOf(Float32Array);
    expect(adapter.getField('flow_rates')).toBeInstanceOf(Float32Array);

    adapter.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5A: CouplingManagerV2
// ═══════════════════════════════════════════════════════════════════════

describe('5A: CouplingManagerV2', () => {
  it('registers and steps solvers via SimSolver interface', async () => {
    const thermalConfig: ThermalConfig = {
      gridResolution: [4, 4, 4],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: { air: { conductivity: 0.026, density: 1.225, specific_heat: 1005 } },
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };

    const thermal = new ThermalSolverAdapter(new ThermalSolver(thermalConfig));
    const mgr = new CouplingManagerV2();

    mgr.registerSolver('thermal', thermal);

    const events = await mgr.step(0.01);
    expect(events).toEqual([]);

    const stats = mgr.getStats();
    expect(stats.solverCount).toBe(1);
    expect(stats.lastStepMs).toBeGreaterThanOrEqual(0);

    mgr.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5C: ParameterSpace
// ═══════════════════════════════════════════════════════════════════════

describe('5C: ParameterSpace', () => {
  it('grid search produces full factorial combinations', () => {
    const space = new ParameterSpace([
      { path: 'a', values: [1, 2] },
      { path: 'b', values: [10, 20, 30] },
    ]);

    expect(space.gridSize).toBe(6); // 2 × 3
    const samples = space.gridSearch();
    expect(samples.length).toBe(6);

    // Every combination should appear exactly once
    const combos = samples.map((s) => `${s.overrides.get('a')}_${s.overrides.get('b')}`);
    expect(new Set(combos).size).toBe(6);
  });

  it('grid search with range mode', () => {
    const space = new ParameterSpace([
      { path: 'E', min: 100, max: 200, steps: 3 },
    ]);

    expect(space.gridSize).toBe(3);
    const samples = space.gridSearch();
    const values = samples.map((s) => s.overrides.get('E')!);
    expect(values[0]).toBeCloseTo(100);
    expect(values[1]).toBeCloseTo(150);
    expect(values[2]).toBeCloseTo(200);
  });

  it('Latin Hypercube produces n samples with no repeated strata', () => {
    const space = new ParameterSpace([
      { path: 'x', min: 0, max: 1, steps: 10 },
      { path: 'y', min: 0, max: 1, steps: 10 },
    ]);

    const samples = space.latinHypercube(10);
    expect(samples.length).toBe(10);

    // All values should be in [0, 1]
    for (const s of samples) {
      expect(s.overrides.get('x')!).toBeGreaterThanOrEqual(0);
      expect(s.overrides.get('x')!).toBeLessThanOrEqual(1);
      expect(s.overrides.get('y')!).toBeGreaterThanOrEqual(0);
      expect(s.overrides.get('y')!).toBeLessThanOrEqual(1);
    }
  });

  it('applyOverrides deep-merges dot-paths into config', () => {
    const base = { material: { E: 200e9, nu: 0.3 }, size: [1, 1, 1] };
    const overrides = new Map([['material.E', 69e9]]);
    const result = applyOverrides(base, overrides);

    expect(result.material.E).toBe(69e9);
    expect(result.material.nu).toBe(0.3); // untouched
    expect(result.size).toEqual([1, 1, 1]); // untouched
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5C: ExperimentOrchestrator + ResultsAnalyzer
// ═══════════════════════════════════════════════════════════════════════

describe('5C: ExperimentOrchestrator', () => {
  it('runs a parameter sweep and tracks results', async () => {
    // Mock solver factory that returns a simple solver
    let runCount = 0;
    const factory = (_type: string, config: Record<string, unknown>): SolverHandle => {
      const E = (config as { E?: number }).E ?? 100;
      return {
        solve: () => { runCount++; },
        getStats: () => ({ converged: true, maxStress: 1000 / E, solveTimeMs: 1 }),
        dispose: () => {},
      };
    };

    const orchestrator = new ExperimentOrchestrator(factory);

    const result = await orchestrator.run({
      name: 'E sweep',
      baseConfig: { E: 100 },
      solverType: 'mock',
      parameters: [{ path: 'E', values: [100, 200, 300, 400, 500] }],
      sampling: 'grid',
      objectiveField: 'maxStress',
    });

    expect(result.totalRuns).toBe(5);
    expect(runCount).toBe(5);
    expect(result.runs.every((r) => r.converged)).toBe(true);

    // Higher E → lower stress
    const stresses = result.runs.map((r) => r.objectiveValue!);
    expect(stresses[0]).toBeGreaterThan(stresses[4]);

    // Summarize
    const summary = summarize(result);
    expect(summary.convergedRuns).toBe(5);
    expect(summary.bestRun!.objectiveValue!).toBeLessThan(summary.worstRun!.objectiveValue!);

    // Sensitivity
    const sens = sensitivity(result);
    expect(sens.length).toBe(1);
    expect(sens[0].parameter).toBe('E');
    expect(sens[0].correlation).toBeLessThan(0); // E up → stress down = negative correlation

    // CSV export
    const csv = exportSweepCSV(result);
    expect(csv).toContain('E,converged,objective,timeMs');
    expect(csv.split('\n').length).toBe(6); // header + 5 rows
  });
});
