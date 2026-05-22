import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationSolverFactory } from '@holoscript/core/traits/simulation-solver-factory';
import { initSimulationSolvers, resetSimulationRegistry } from '../simulation-registry';

describe('simulation-registry', () => {
  beforeEach(() => {
    // Clear both the factory registrations and the init guard
    SimulationSolverFactory.clear();
    resetSimulationRegistry();
  });

  it('registers all solver types on first call', () => {
    expect(SimulationSolverFactory.types()).toEqual([]);

    initSimulationSolvers();

    const types = SimulationSolverFactory.types();
    expect(types).toContain('thermal');
    expect(types).toContain('structural');
    expect(types).toContain('structural-tet10');
    expect(types).toContain('structural-gpu-cg');
    expect(types).toContain('structural-tet4-gpu-cg');
    expect(types).toContain('hydraulic');
    expect(types).toContain('acoustic');
    expect(types).toContain('fdtd');
    expect(types).toContain('navier-stokes');
    expect(types).toContain('multiphase');
    expect(types).toContain('molecular-dynamics');
    expect(types).toContain('mls-mpm-fluid');
    expect(types).toContain('reaction-diffusion');
    expect(types).toContain('affinity-ode');
  });

  it('is idempotent — second call is a no-op', () => {
    initSimulationSolvers();
    const typesAfterFirst = SimulationSolverFactory.types().length;

    initSimulationSolvers();
    const typesAfterSecond = SimulationSolverFactory.types().length;

    expect(typesAfterSecond).toBe(typesAfterFirst);
  });

  it('creates ThermalSolver for thermal type', () => {
    initSimulationSolvers();
    const solver = SimulationSolverFactory.create('thermal', {
      grid_resolution: [4, 4, 4],
      domain_size: [1, 1, 1],
      time_step: 0.01,
      default_material: 'air',
      initial_temperature: 20,
    });
    expect(solver).not.toBeNull();
    expect(typeof solver!.dispose).toBe('function');
    solver!.dispose();
  });

  it('creates HydraulicSolver for hydraulic type', () => {
    initSimulationSolvers();
    const solver = SimulationSolverFactory.create('hydraulic', {
      pipes: [],
      nodes: [],
      connections: [],
      valves: [],
    });
    expect(solver).not.toBeNull();
    expect(typeof solver!.dispose).toBe('function');
    solver!.dispose();
  });

  it('creates StructuralSolver for structural type', () => {
    initSimulationSolvers();
    const solver = SimulationSolverFactory.create('structural', {
      vertices: new Float32Array(0),
      tetrahedra: new Uint32Array(0),
      material: 'steel_a36',
    });
    expect(solver).not.toBeNull();
    expect(typeof solver!.dispose).toBe('function');
    solver!.dispose();
  });

  it('creates GPU-CG structural aliases with contract readback', async () => {
    initSimulationSolvers();
    const solver = SimulationSolverFactory.create('structural-gpu-cg', {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      tetrahedra: new Uint32Array([0, 1, 2, 3]),
      material: 'steel_a36',
      constraints: [{ id: 'fix', type: 'fixed', nodes: [0] }],
      loads: [],
    });

    expect(solver).not.toBeNull();
    expect(typeof (solver as { readbackOutput?: unknown }).readbackOutput).toBe('function');

    const output = await (solver as { readbackOutput(): Promise<Float32Array> }).readbackOutput();
    expect(output).toBeInstanceOf(Float32Array);
    expect(output.length).toBe(30);

    solver!.dispose();
  });

  it('returns null for unknown solver type even after init', () => {
    initSimulationSolvers();
    const solver = SimulationSolverFactory.create('nonexistent_solver_type', {});
    expect(solver).toBeNull();
  });

  it('creates AffinityODESolver for affinity-ode type', () => {
    initSimulationSolvers();
    const solver = SimulationSolverFactory.create('affinity-ode', {
      agents: [
        { id: 'R', dampingRate: -0.2, couplingToPartner: 0.5 },
        { id: 'J', dampingRate: -0.1, couplingToPartner: 0.8 },
      ],
      initialFeelings: [0.5, 0.3],
      timeStep: 0.01,
    });
    expect(solver).not.toBeNull();
    expect(typeof solver!.step).toBe('function');
    expect(typeof solver!.dispose).toBe('function');

    // Full step cycle — validates end-to-end runtime
    const stateBefore = (solver as unknown as { getState(): { R: number; J: number; stepCount: number } }).getState();
    expect(stateBefore.R).toBeCloseTo(0.5, 5);
    expect(stateBefore.J).toBeCloseTo(0.3, 5);
    expect(stateBefore.stepCount).toBe(0);

    solver!.step(0.1);
    solver!.step(0.1);
    const stateAfter = (solver as unknown as { getState(): { R: number; J: number; stepCount: number } }).getState();
    expect(stateAfter.stepCount).toBeGreaterThan(0);
    // Feelings should have evolved (not identical to initial)
    expect(stateAfter.R !== stateBefore.R || stateAfter.J !== stateBefore.J).toBe(true);

    solver!.dispose();
  });

  it('can re-init after reset + clear', () => {
    initSimulationSolvers();
    expect(SimulationSolverFactory.types().length).toBeGreaterThan(0);

    // Clear factory and reset guard — simulates test teardown
    SimulationSolverFactory.clear();
    resetSimulationRegistry();

    expect(SimulationSolverFactory.types()).toEqual([]);

    // Re-init should work
    initSimulationSolvers();
    expect(SimulationSolverFactory.types()).toContain('thermal');
  });
});
