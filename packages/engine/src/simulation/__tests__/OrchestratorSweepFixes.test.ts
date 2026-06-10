/**
 * Regression tests for the 2026-06-10 physics/simsci sweep — orchestrator-applied
 * fixes that fell outside the per-subsystem agent file sets:
 *
 * 1. ThermalSolver.stepImplicit: anisotropic Jacobi weights (was cubic-only —
 *    used dx² for all three axes; the DEFAULT thermal grid is non-cubic).
 * 2. SpatialHash.update(): preserved entry radius (was recreated with radius 0).
 * 3. MolecularDynamicsSolver temperature: N_dof = 3(N−1) after CM-momentum
 *    removal (was 3N — a factor-2 temperature error for a dimer).
 * 4. simulation-registry: 'dem-granular' solver registration.
 */
import { describe, it, expect } from 'vitest';
import { ThermalSolver, type ThermalConfig } from '../ThermalSolver';
import { MolecularDynamicsSolver } from '../MolecularDynamicsSolver';
import { SpatialHash } from '../../physics/SpatialHash';
import {
  SimulationSolverFactory,
} from '@holoscript/core/traits/simulation-solver-factory';
import { initSimulationSolvers, resetSimulationRegistry } from '../simulation-registry';

describe('ThermalSolver implicit step — anisotropic grid correctness', () => {
  /**
   * Pure diffusion of a sine profile along the y axis with T=0 Dirichlet
   * boundaries decays as exp(-α·(π/Ly)²·t). With the old cubic-only Jacobi
   * coefficients (dx² used for every axis) and dy = 2·dx, the implicit decay
   * rate is wrong by ~4×. We compare the implicit solution against a
   * fine-substepped explicit reference on the same non-cubic grid.
   */
  it('implicit solution matches explicit reference on a non-cubic grid', () => {
    const N = 17;
    // Non-cubic: dy = 2·dx = 2·dz
    const domain: [number, number, number] = [1, 2, 1];
    const res: [number, number, number] = [N, N, N];

    const mkConfig = (timeStep: number): ThermalConfig => ({
      gridResolution: res,
      domainSize: domain,
      timeStep,
      materials: {},
      defaultMaterial: 'aluminum',
      boundaryConditions: [
        { type: 'dirichlet', faces: ['y-', 'y+'], value: 0 },
      ],
      sources: [],
      initialTemperature: 0,
      useGPU: false,
    });

    // Explicit reference: small dt (forced under CFL → stays explicit)
    const explicit = new ThermalSolver(mkConfig(1e-4));
    // Implicit: large dt (forced over CFL → flips to implicit path)
    const implicit = new ThermalSolver(mkConfig(0.05));

    // Same initial condition on both: T = 100·sin(π·y/Ly)
    const seed = (s: ThermalSolver): void => {
      const grid = s.getTemperatureGrid();
      const Ly = domain[1];
      for (let k = 0; k < grid.nz; k++) {
        for (let j = 0; j < grid.ny; j++) {
          for (let i = 0; i < grid.nx; i++) {
            grid.set(i, j, k, 100 * Math.sin((Math.PI * (j * grid.dy)) / Ly));
          }
        }
      }
    };
    seed(explicit);
    seed(implicit);

    const tEnd = 0.05;
    for (let n = 0; n < Math.round(tEnd / 1e-4); n++) explicit.step(1e-4);
    implicit.step(0.05);

    const ge = explicit.getTemperatureGrid();
    const gi = implicit.getTemperatureGrid();
    const mid = Math.floor(N / 2);
    const refCenter = ge.get(mid, mid, mid);
    const implCenter = gi.get(mid, mid, mid);

    expect(refCenter).toBeGreaterThan(0);
    // One large implicit step vs many explicit steps: agreement within 15%
    // (first-order-in-time scheme difference). The OLD cubic-coefficient bug
    // produced a ~4× decay-rate error on this grid, far outside this band.
    const relErr = Math.abs(implCenter - refCenter) / refCenter;
    expect(relErr).toBeLessThan(0.15);
  });
});

describe('SpatialHash.update — radius preserved', () => {
  it('keeps the entry radius across position updates', () => {
    const hash = new SpatialHash(1.0);
    hash.insert({ id: 'a', x: 0, y: 0, z: 0, radius: 2.5 });

    hash.update('a', 3, 0, 0);

    // A radius-2.5 entry at x=3 overlaps a radius-1 query at the origin
    // (gap = 3 − 2.5 = 0.5 < 1). With the old bug the radius became 0 and
    // this query missed the entry.
    const hits = hash.queryRadius(0, 0, 0, 1.0);
    expect(hits).toContain('a');
  });
});

describe('MolecularDynamicsSolver — temperature degrees of freedom', () => {
  it('dimer temperature uses 3(N−1) DoF, not 3N', () => {
    const md = new MolecularDynamicsSolver({
      particleCount: 2,
      boxSize: [20, 20, 20],
      temperature: 1.0,
      thermostatTau: 0, // NVE — no rescaling between checks
      initialConfig: 'fcc',
    });

    // Set velocities by hand: equal-and-opposite (CM momentum zero).
    const v = md.getVelocities();
    v.fill(0);
    v[0] = +1.0; // particle 0, x
    v[3] = -1.0; // particle 1, x
    // KE = 2 · ½·m·v² = 1.0 (m = 1). N_dof = 3(2−1) = 3 → T = 2·KE/3 = 2/3.
    const stats = md.getStats();
    expect(stats.temperature).toBeCloseTo(2 / 3, 10);
  });
});

describe('simulation-registry — dem-granular registered', () => {
  it('creates a DEM solver from the factory', () => {
    SimulationSolverFactory.clear();
    resetSimulationRegistry();
    initSimulationSolvers();

    const solver = SimulationSolverFactory.create('dem-granular', {
      particleCount: 8,
      gravity: [0, -1, 0], // non-Earth gravity is a first-class config (G.GOLD.485)
    });
    expect(solver).not.toBeNull();
    solver?.step(0.001);
    const stats = solver?.getStats() as Record<string, unknown>;
    expect(typeof stats.kineticEnergy).toBe('number');
    expect(Number.isFinite(stats.kineticEnergy as number)).toBe(true);
    solver?.dispose();
  });
});
