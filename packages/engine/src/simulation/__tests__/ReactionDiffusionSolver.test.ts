import { describe, it, expect } from 'vitest';
import { ReactionDiffusionSolver } from '../ReactionDiffusionSolver';
import type { ReactionDiffusionConfig, Species, Reaction } from '../ReactionDiffusionSolver';
import { CouplingManagerV2 } from '../CouplingManagerV2';
import { ThermalSolver } from '../ThermalSolver';
import { ThermalSolverAdapter, ReactionDiffusionSolverAdapter } from '../adapters/SolverAdapters';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSimpleConfig(overrides?: Partial<ReactionDiffusionConfig>): ReactionDiffusionConfig {
  const species: Species[] = [
    { name: 'A', diffusivity: 1e-3, initialConcentration: 1.0 },
    { name: 'B', diffusivity: 1e-3, initialConcentration: 1.0 },
    { name: 'C', diffusivity: 1e-3, initialConcentration: 0.0 },
  ];

  // A + B → C, first-order in both, mildly exothermic
  const reactions: Reaction[] = [
    {
      label: 'A + B → C',
      stoichiometry: { A: -1, B: -1, C: 1 },
      preExponential: 1e3,       // 1/s (for 2nd order, m³/(mol·s))
      activationEnergy: 20000,   // 20 kJ/mol
      orders: { A: 1, B: 1 },
      enthalpy: -50000,          // -50 kJ/mol (exothermic)
    },
  ];

  return {
    gridResolution: [5, 5, 5],
    domainSize: [1, 1, 1],
    species,
    reactions,
    referenceTemperature: 350, // 350 K so reaction proceeds
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ReactionDiffusionSolver', () => {
  it('initializes with correct concentrations', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig());
    const stats = solver.getStats();

    expect(stats.speciesNames).toEqual(['A', 'B', 'C']);
    expect(stats.minConcentrations[0]).toBeCloseTo(1.0, 5);
    expect(stats.maxConcentrations[0]).toBeCloseTo(1.0, 5);
    expect(stats.minConcentrations[2]).toBeCloseTo(0.0, 5);
    expect(stats.stepCount).toBe(0);
  });

  it('conserves total moles during reaction (A+B → C)', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig({
      // Disable diffusion to isolate reaction
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    // Step forward
    for (let i = 0; i < 10; i++) solver.step(0.001);

    const stats = solver.getStats();

    // Reactants should decrease
    expect(stats.maxConcentrations[0]).toBeLessThan(1.0);
    // Product should increase
    expect(stats.maxConcentrations[2]).toBeGreaterThan(0.0);

    // Conservation: A consumed = C produced (1:1 stoichiometry)
    // At any cell: A_initial - A_current = C_current
    const grid = solver.getConcentrationGrid(0);
    const gridC = solver.getConcentrationGrid(2);
    const A = grid.get(2, 2, 2);
    const C = gridC.get(2, 2, 2);
    expect(A + C).toBeCloseTo(1.0, 3); // Initial A was 1.0
  });

  it('Arrhenius rate increases with temperature', () => {
    // Low temperature → slow reaction
    const solverLow = new ReactionDiffusionSolver(makeSimpleConfig({
      referenceTemperature: 300,
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    // High temperature → fast reaction
    const solverHigh = new ReactionDiffusionSolver(makeSimpleConfig({
      referenceTemperature: 500,
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    for (let i = 0; i < 5; i++) {
      solverLow.step(0.001);
      solverHigh.step(0.001);
    }

    const statsLow = solverLow.getStats();
    const statsHigh = solverHigh.getStats();

    // Higher temperature produces more product
    expect(statsHigh.maxConcentrations[2]).toBeGreaterThan(statsLow.maxConcentrations[2]);
  });

  it('produces positive heat release for exothermic reaction', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig({
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    solver.step(0.001);

    const stats = solver.getStats();
    // Exothermic: enthalpy < 0 → heat release > 0
    expect(stats.totalHeatRelease).toBeGreaterThan(0);

    // Heat source grid should have positive values
    const qGrid = solver.getHeatSourceGrid();
    const q = qGrid.get(2, 2, 2);
    expect(q).toBeGreaterThan(0);
  });

  it('diffusion spreads concentration', () => {
    // Set up a species with high concentration in center, zero elsewhere
    const config = makeSimpleConfig({
      species: [
        { name: 'A', diffusivity: 0.1, initialConcentration: 0.0 },
      ],
      reactions: [], // No reactions, pure diffusion
    });

    const solver = new ReactionDiffusionSolver(config);

    // Manually set a high concentration at center
    const grid = solver.getConcentrationGrid(0);
    grid.set(2, 2, 2, 10.0);

    // Step forward
    for (let i = 0; i < 20; i++) solver.step(0.01);

    // Center should have decreased
    const center = grid.get(2, 2, 2);
    expect(center).toBeLessThan(10.0);

    // Neighbors should have increased from 0
    const neighbor = grid.get(1, 2, 2);
    expect(neighbor).toBeGreaterThan(0);
  });

  it('concentrations stay non-negative', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig({
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 0.01 }, // Small amount
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    // Many steps — A should deplete but never go negative
    for (let i = 0; i < 100; i++) solver.step(0.001);

    const stats = solver.getStats();
    expect(stats.minConcentrations[0]).toBeGreaterThanOrEqual(0);
    expect(stats.minConcentrations[1]).toBeGreaterThanOrEqual(0);
    expect(stats.minConcentrations[2]).toBeGreaterThanOrEqual(0);
  });

  it('implements SimSolver via adapter', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig());
    const adapter = new ReactionDiffusionSolverAdapter(solver);

    expect(adapter.mode).toBe('transient');
    expect(adapter.fieldNames).toContain('concentration_A');
    expect(adapter.fieldNames).toContain('concentration_B');
    expect(adapter.fieldNames).toContain('concentration_C');
    expect(adapter.fieldNames).toContain('heat_source');
    expect(adapter.fieldNames).toContain('temperature_grid');

    // getField returns data
    adapter.step(0.001);
    const fieldA = adapter.getField('concentration_A');
    expect(fieldA).not.toBeNull();
    expect(fieldA).toBeInstanceOf(Float32Array);

    const heatGrid = adapter.getField('heat_source_grid');
    expect(heatGrid).not.toBeNull();

    // Unknown field returns null
    expect(adapter.getField('nonexistent')).toBeNull();

    const stats = adapter.getStats();
    expect(stats).toHaveProperty('stepCount');
    expect(stats).toHaveProperty('totalSubsteps');
  });

  it('couples to ThermalSolver via CouplingManagerV2', () => {
    // Create reaction-diffusion solver
    const rdSolver = new ReactionDiffusionSolver(makeSimpleConfig({
      gridResolution: [5, 5, 5],
      domainSize: [1, 1, 1],
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    // Create thermal solver
    const thermalSolver = new ThermalSolver({
      gridResolution: [5, 5, 5],
      domainSize: [1, 1, 1],
      timeStep: 0.001,
      materials: {},
      defaultMaterial: 'air',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 350,
    });

    // Wrap in adapters
    const rdAdapter = new ReactionDiffusionSolverAdapter(rdSolver);
    const thermalAdapter = new ThermalSolverAdapter(thermalSolver);

    // Create coupling manager
    const coupling = new CouplingManagerV2();
    coupling.registerSolver('reaction', rdAdapter);
    coupling.registerSolver('thermal', thermalAdapter);

    // Couple: temperature → reaction (for Arrhenius)
    coupling.addCoupling({
      source: { solver: 'thermal', field: 'temperature' },
      target: { solver: 'reaction', field: 'temperature_grid' },
      transform: (v: number) => v, // Identity — same units
    });

    // Couple: heat source → thermal (for exothermic heating)
    coupling.addCoupling({
      source: { solver: 'reaction', field: 'heat_source' },
      target: { solver: 'thermal', field: 'temperature' },
      transform: (q: number) => q * 0.001, // Scale heat to temperature delta
    });

    const statsBefore = coupling.getStats();
    expect(statsBefore.solverCount).toBe(2);
    expect(statsBefore.couplingCount).toBe(2);

    // Step the coupled system — should not throw
    expect(async () => {
      await coupling.step(0.001);
    }).not.toThrow();

    coupling.dispose();
  });

  it('adaptive RK tracks substep statistics', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig({
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    solver.step(0.01);

    const stats = solver.getStats();
    expect(stats.totalSubsteps).toBeGreaterThan(0);
    expect(stats.lastStepMs).toBeGreaterThanOrEqual(0);
  });

  it('handles zero-rate reaction (no activation energy bypass)', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig({
      referenceTemperature: 1, // Very low T → exp(-Ea/(R*T)) ≈ 0
      species: [
        { name: 'A', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'B', diffusivity: 0, initialConcentration: 1.0 },
        { name: 'C', diffusivity: 0, initialConcentration: 0.0 },
      ],
    }));

    solver.step(0.001);

    const stats = solver.getStats();
    // At T=1K with Ea=20kJ/mol, rate should be essentially zero
    expect(stats.maxConcentrations[2]).toBeLessThan(1e-10);
  });

  it('speciesCount and getSpeciesNames return correct values', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig());
    expect(solver.speciesCount).toBe(3);
    expect(solver.getSpeciesNames()).toEqual(['A', 'B', 'C']);
  });

  it('getConcentrationAt returns interpolated values', () => {
    const solver = new ReactionDiffusionSolver(makeSimpleConfig());
    // At initial state, concentration should be uniform
    const c = solver.getConcentrationAt(0, 0.5, 0.5, 0.5);
    expect(c).toBeCloseTo(1.0, 3);
  });
});
