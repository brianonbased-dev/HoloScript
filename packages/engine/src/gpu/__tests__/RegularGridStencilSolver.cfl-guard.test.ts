/**
 * RegularGridStencilSolver — CFL guard tests.
 *
 * Two explicit GPU stencils are CFL-constrained:
 *
 *   Thermal explicit:
 *     dt ≤ dx² / (2·α·d)  where d=3 for 3D
 *     equivalently: dt · α · (1/dx² + 1/dy² + 1/dz²) ≤ 0.5
 *
 *   Acoustic leapfrog:
 *     c·dt / min(dx,dy,dz) ≤ 1/√3  (3D Courant)
 *
 * The RegularGridStencilSolver.dispatch() TypeScript layer must validate these
 * before submitting to the GPU and throw a descriptive RangeError when violated.
 * Silently dispatching with a violating dt causes the GPU stencil to produce
 * diverging/NaN output.
 *
 * These tests exercise the TypeScript-layer guard only — no actual WebGPU
 * device is required.  We call the public dispatch-entry methods
 * (stepThermalExplicit / stepAcousticLeapfrog) with params that violate CFL
 * and expect a thrown RangeError before any GPU work begins.
 */

import { describe, it, expect } from 'vitest';
import { RegularGridStencilSolver } from '../RegularGridStencilSolver';

// The solver falls back to CPU when WebGPU is unavailable (test environment).
// The CFL guard must fire BEFORE attempting WebGPU dispatch, so the guard is
// reachable in any environment.

describe('RegularGridStencilSolver — CFL guards', () => {
  describe('Thermal explicit stencil', () => {
    it('throws RangeError when dt > dx²/(2·α·3) (3D diffusion CFL violated)', async () => {
      const solver = new RegularGridStencilSolver();
      const nx = 8,
        ny = 8,
        nz = 8;
      const n = nx * ny * nz;
      const dx = 0.1,
        dy = 0.1,
        dz = 0.1;
      const alpha = 1.0; // very high diffusivity to make the CFL condition strict
      // CFL limit: dx²/(2·α·3) = 0.01/(6) ≈ 0.00167
      // Use dt = 0.01 — well above the limit
      const dt = 0.01;

      await expect(
        solver.stepThermalExplicit(new Float32Array(n), new Float32Array(n), {
          nx,
          ny,
          nz,
          dx,
          dy,
          dz,
          dt,
          alpha,
          rhoCp: 1,
        })
      ).rejects.toThrow(RangeError);
    });

    it('does NOT throw when dt is within thermal CFL', async () => {
      const solver = new RegularGridStencilSolver();
      const nx = 4,
        ny = 4,
        nz = 4;
      const n = nx * ny * nz;
      const dx = 0.1,
        dy = 0.1,
        dz = 0.1;
      const alpha = 1e-6; // realistic thermal diffusivity (steel ~12e-6 m²/s)
      // CFL limit ≈ 0.01/(2*1e-6*3) ≈ 1667 s — far above any realistic dt
      const dt = 1.0;

      // Should not throw; may return null if WebGPU is unavailable (fallback path)
      await expect(
        solver.stepThermalExplicit(new Float32Array(n), new Float32Array(n), {
          nx,
          ny,
          nz,
          dx,
          dy,
          dz,
          dt,
          alpha,
          rhoCp: 1000,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Acoustic leapfrog stencil', () => {
    it('throws RangeError when c·dt/dx > 1/√3 (3D acoustic CFL violated)', async () => {
      const solver = new RegularGridStencilSolver();
      const nx = 8,
        ny = 8,
        nz = 8;
      const n = nx * ny * nz;
      const dx = 0.01,
        dy = 0.01,
        dz = 0.01;
      const c = 343; // m/s (air)
      // CFL limit: dt ≤ dx/(c·√3) = 0.01/(343·1.732) ≈ 1.68e-5 s
      // Use dt = 1e-4 — 6× above the limit
      const dt = 1e-4;

      await expect(
        solver.stepAcousticLeapfrog(new Float32Array(n), new Float32Array(n), null, {
          nx,
          ny,
          nz,
          dx,
          dy,
          dz,
          dt,
          cUniform: c,
          hasVelocity: false,
        })
      ).rejects.toThrow(RangeError);
    });

    it('does NOT throw when dt is within acoustic CFL', async () => {
      const solver = new RegularGridStencilSolver();
      const nx = 4,
        ny = 4,
        nz = 4;
      const n = nx * ny * nz;
      const dx = 0.01,
        dy = 0.01,
        dz = 0.01;
      const c = 343;
      // Safe dt: 0.9 × dx/(c·√3) ≈ 1.51e-5
      const dt = 1.5e-5;

      await expect(
        solver.stepAcousticLeapfrog(new Float32Array(n), new Float32Array(n), null, {
          nx,
          ny,
          nz,
          dx,
          dy,
          dz,
          dt,
          cUniform: c,
          hasVelocity: false,
        })
      ).resolves.not.toThrow();
    });
  });
});
