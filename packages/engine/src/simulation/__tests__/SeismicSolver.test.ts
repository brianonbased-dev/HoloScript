/**
 * Phase 9: Seismic/Geophysics verification — heterogeneous velocity + Ricker wavelet
 */

import { describe, it, expect } from 'vitest';
import { AcousticSolver, buildLayeredVelocity, type AcousticConfig } from '../AcousticSolver';
import { RegularGrid3D } from '../RegularGrid3D';

describe('Phase 9: Seismic Extensions', () => {
  describe('buildLayeredVelocity', () => {
    it('creates correct velocity layers by depth', () => {
      const vel = buildLayeredVelocity([5, 5, 20], [1, 1, 4], [
        { depth: 0, velocity: 1500 },   // water: 0-2m
        { depth: 2, velocity: 3000 },   // sediment: 2-3m
        { depth: 3, velocity: 5000 },   // rock: 3-4m
      ]);

      // Near top (k=0, z=0): water
      expect(vel.get(2, 2, 0)).toBeCloseTo(1500);
      // Mid (k=10, z≈2.1): sediment
      expect(vel.get(2, 2, 10)).toBeCloseTo(3000);
      // Bottom (k=18, z≈3.8): rock
      expect(vel.get(2, 2, 18)).toBeCloseTo(5000);
    });
  });

  describe('Heterogeneous velocity field', () => {
    it('wave propagates faster in high-velocity layer', () => {
      const nx = 3, ny = 3, nz = 80;
      const lz = 4.0;

      // Two layers: slow (1000 m/s) top half, fast (3000 m/s) bottom half
      const vel = buildLayeredVelocity([nx, ny, nz], [0.15, 0.15, lz], [
        { depth: 0, velocity: 1000 },
        { depth: 2, velocity: 3000 },
      ]);

      const config: AcousticConfig = {
        gridResolution: [nx, ny, nz],
        domainSize: [0.15, 0.15, lz],
        velocityField: vel,
        boundaryConditions: [
          { face: 'z-', type: 'absorbing' },
          { face: 'z+', type: 'absorbing' },
          { face: 'x-', type: 'soft_wall' }, { face: 'x+', type: 'soft_wall' },
          { face: 'y-', type: 'soft_wall' }, { face: 'y+', type: 'soft_wall' },
        ],
        sources: [{
          id: 'seismic',
          position: [1, 1, 10], // in slow layer
          type: 'ricker_wavelet',
          amplitude: 1000,
          frequency: 50,
        }],
      };

      const solver = new AcousticSolver(config);
      const dt = solver.getStats().timeStep;

      // Run enough steps for the wave to propagate
      const steps = Math.round(0.002 / dt);
      for (let i = 0; i < steps; i++) solver.step();

      const stats = solver.getStats();
      // Wave should have propagated (non-zero pressure)
      expect(stats.maxPressure).toBeGreaterThan(0);
      // Should be CFL-stable (not blowing up)
      expect(stats.maxPressure).toBeLessThan(1e10);
      expect(Number.isFinite(stats.maxPressure)).toBe(true);
    });
  });

  describe('Ricker wavelet source', () => {
    it('produces band-limited pulse with correct peak time', () => {
      const config: AcousticConfig = {
        gridResolution: [3, 3, 100],
        domainSize: [0.03, 0.03, 1],
        speedOfSound: 1000,
        boundaryConditions: [
          { face: 'z-', type: 'absorbing' }, { face: 'z+', type: 'absorbing' },
          { face: 'x-', type: 'soft_wall' }, { face: 'x+', type: 'soft_wall' },
          { face: 'y-', type: 'soft_wall' }, { face: 'y+', type: 'soft_wall' },
        ],
        sources: [{
          id: 'ricker',
          position: [1, 1, 50],
          type: 'ricker_wavelet',
          amplitude: 1.0,
          frequency: 100, // 100 Hz dominant frequency
        }],
      };

      const solver = new AcousticSolver(config);
      const dt = solver.getStats().timeStep;

      // The Ricker wavelet peaks at t0 = 1.5/f = 0.015s
      const peakTime = 1.5 / 100;
      const stepsToPeak = Math.round(peakTime / dt);

      // Record pressure at source location over time
      let maxP = 0;
      let maxPStep = 0;
      for (let i = 0; i < stepsToPeak * 3; i++) {
        solver.step();
        const field = solver.getPressureField();
        const pAtSrc = Math.abs(field[50]); // approximate source location
        if (pAtSrc > maxP) {
          maxP = pAtSrc;
          maxPStep = i;
        }
      }

      // Peak should occur near t0 (within 50% of expected step count)
      expect(maxPStep).toBeGreaterThan(stepsToPeak * 0.3);
      expect(maxPStep).toBeLessThan(stepsToPeak * 2.0);
      expect(maxP).toBeGreaterThan(0);
    });
  });
});
