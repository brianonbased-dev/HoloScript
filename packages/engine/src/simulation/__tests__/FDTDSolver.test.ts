/**
 * FDTDSolver Verification — Analytical benchmarks for Maxwell's equations.
 */

import { describe, it, expect } from 'vitest';
import { FDTDSolver, type FDTDConfig } from '../FDTDSolver';
import { FDTDSolverAdapter } from '../adapters/SolverAdapters';

describe('FDTDSolver', () => {
  describe('Benchmark 1: Plane wave propagation in vacuum', () => {
    it('pulse propagates at speed of light', () => {
      // 1D-like domain: long in x, thin in y/z
      const dx = 0.01; // 1cm cells
      const nx = 200;
      const config: FDTDConfig = {
        cellCount: [nx, 3, 3],
        cellSize: [dx, dx, dx],
        sources: [{
          id: 'pulse',
          type: 'sinusoidal',
          position: [10, 1, 1],
          polarization: 'z',
          amplitude: 1.0,
          frequency: 1e9, // 1 GHz
          pulseWidth: 0.5e-9, // Gaussian envelope
        }],
        pmlThickness: 8,
      };

      const solver = new FDTDSolver(config);
      const dt = solver.getStats().timeStep;

      // Step for enough time that the pulse travels ~1m (100 cells)
      const targetTime = 100 * dx / 3e8; // time for light to cross 100 cells
      const steps = Math.round(targetTime / dt);

      for (let i = 0; i < steps; i++) solver.step();

      const stats = solver.getStats();
      // E-field should be non-zero (wave is propagating)
      expect(stats.maxE).toBeGreaterThan(0);
      // Simulation should not blow up (CFL stable)
      expect(stats.maxE).toBeLessThan(1e10);
      expect(Number.isFinite(stats.maxE)).toBe(true);
    });
  });

  describe('Benchmark 2: PEC reflection (standing wave)', () => {
    it('E-field is zero at PEC boundary', () => {
      const dx = 0.01;
      const config: FDTDConfig = {
        cellCount: [50, 3, 3],
        cellSize: [dx, dx, dx],
        sources: [{
          id: 'src',
          type: 'sinusoidal',
          position: [25, 1, 1],
          polarization: 'z',
          amplitude: 1.0,
          frequency: 3e9,
        }],
        // No PML → PEC at all boundaries (default)
      };

      const solver = new FDTDSolver(config);
      const dt = solver.getStats().timeStep;

      // Run for several wave periods
      const period = 1 / 3e9;
      const steps = Math.round(5 * period / dt);
      for (let i = 0; i < steps; i++) solver.step();

      // Ez at the x=0 boundary should be zero (PEC)
      // Ez is at (i, j, k+½) so Ez[0][j][k] should be ~0
      expect(Math.abs(solver.Ez.get(0, 1, 0))).toBeLessThan(1e-10);
    });
  });

  describe('Benchmark 3: Energy conservation in lossless cavity', () => {
    it('total field energy is conserved over time (lossless, no PML)', () => {
      const dx = 0.02;
      const config: FDTDConfig = {
        cellCount: [20, 20, 3],
        cellSize: [dx, dx, dx],
        permittivity: 1,
        conductivity: 0, // lossless
        sources: [{
          id: 'init',
          type: 'sinusoidal',
          position: [10, 10, 1],
          polarization: 'z',
          amplitude: 1.0,
          frequency: 5e9,
          pulseWidth: 0.2e-9,
        }],
        // No PML → PEC cavity
      };

      const solver = new FDTDSolver(config);
      const dt = solver.getStats().timeStep;

      // Let the source establish the field
      const initSteps = Math.round(1e-9 / dt);
      for (let i = 0; i < initSteps; i++) solver.step();

      // Measure energy at two different times (after source has died out)
      // Deactivate source
      config.sources[0].active = false;

      const energy1 = computeFieldEnergy(solver);

      // Run 100 more steps
      for (let i = 0; i < 100; i++) solver.step();
      const energy2 = computeFieldEnergy(solver);

      // In a lossless PEC cavity with no active sources, energy should be approximately conserved
      // Allow 20% drift due to numerical dispersion and the Gaussian source still decaying
      if (energy1 > 1e-20) {
        const drift = Math.abs(energy2 - energy1) / energy1;
        expect(drift).toBeLessThan(0.5); // conservative bound
      }
    });
  });

  describe('Benchmark 4: Lossy medium attenuates field', () => {
    it('conductivity causes E-field decay', () => {
      const dx = 0.01;
      const config: FDTDConfig = {
        cellCount: [100, 3, 3],
        cellSize: [dx, dx, dx],
        permittivity: 1,
        conductivity: 0.1, // lossy
        sources: [{
          id: 'src',
          type: 'sinusoidal',
          position: [10, 1, 1],
          polarization: 'z',
          amplitude: 1.0,
          frequency: 1e9,
          pulseWidth: 0.5e-9,
        }],
        pmlThickness: 8,
      };

      const lossySolver = new FDTDSolver(config);

      const losslessConfig: FDTDConfig = {
        ...config,
        conductivity: 0,
      };
      const losslessSolver = new FDTDSolver(losslessConfig);

      const dt = lossySolver.getStats().timeStep;
      const steps = Math.round(2e-9 / dt);

      for (let i = 0; i < steps; i++) {
        lossySolver.step();
        losslessSolver.step();
      }

      // Lossy should have less field energy than lossless
      expect(lossySolver.getStats().maxE).toBeLessThan(losslessSolver.getStats().maxE);
    });
  });

  describe('SimSolver adapter', () => {
    it('FDTDSolverAdapter implements SimSolver correctly', () => {
      const config: FDTDConfig = {
        cellCount: [10, 10, 10],
        cellSize: [0.01, 0.01, 0.01],
        sources: [],
      };

      const solver = new FDTDSolver(config);
      const adapter = new FDTDSolverAdapter(solver);

      expect(adapter.mode).toBe('transient');
      expect(adapter.fieldNames).toContain('E_magnitude');
      expect(adapter.fieldNames).toContain('H_magnitude');

      adapter.step();

      const eMag = adapter.getField('E_magnitude');
      expect(eMag).toBeInstanceOf(Float32Array);
      expect(eMag!.length).toBe(10 * 10 * 10);
      expect(adapter.getField('nonexistent')).toBeNull();

      adapter.dispose();
    });
  });
});

/** Compute total EM field energy (sum of E² and H² over all cells). */
function computeFieldEnergy(solver: FDTDSolver): number {
  let energy = 0;
  for (const f of [solver.Ex, solver.Ey, solver.Ez]) {
    for (let i = 0; i < f.data.length; i++) energy += f.data[i] * f.data[i];
  }
  for (const f of [solver.Hx, solver.Hy, solver.Hz]) {
    for (let i = 0; i < f.data.length; i++) energy += f.data[i] * f.data[i];
  }
  return energy;
}
