/**
 * Anisotropic Poisson regression (qpaq).
 *
 * The NavierStokes pressure projection previously solved the Poisson equation
 * with ISOTROPIC Jacobi coefficients (alpha=dx^2, beta=6), which is wrong when
 * dx != dy != dz. This test pins the fix: on a manufactured exact-discrete
 * Poisson problem over a strongly anisotropic grid,
 *   - jacobiIterationPoissonAnisotropic recovers the exact solution, and
 *   - the old isotropic jacobiIteration does NOT (large residual error).
 *
 * The manufactured rhs is the EXACT discrete anisotropic Laplacian of a known
 * field, so the anisotropic solver converges to that field with no truncation
 * noise — the only error source is iterative convergence.
 */

import { describe, it, expect } from 'vitest';
import { RegularGrid3D } from '../RegularGrid3D';
import { jacobiIteration, jacobiIterationPoissonAnisotropic } from '../ConvergenceControl';

describe('Anisotropic Poisson projection (qpaq)', () => {
  // Strongly anisotropic grid: dx=1/6≈0.167, dy=0.25/6≈0.0417, dz=0.5/6≈0.0833.
  // Axis-spacing ratios dx/dy = 4, dx/dz = 2 — the isotropic assumption is badly violated.
  const res: [number, number, number] = [7, 7, 7];
  const size: [number, number, number] = [1.0, 0.25, 0.5];

  const exact = new RegularGrid3D(res, size);
  const { nx, ny, nz, dx, dy, dz } = exact;
  const wx = 1 / (dx * dx);
  const wy = 1 / (dy * dy);
  const wz = 1 / (dz * dz);

  // Manufactured smooth field, zero on all boundaries (Dirichlet-0).
  const phi = (i: number, j: number, k: number) =>
    Math.sin((Math.PI * i) / (nx - 1)) *
    Math.sin((Math.PI * j) / (ny - 1)) *
    Math.sin((Math.PI * k) / (nz - 1));

  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) exact.set(i, j, k, phi(i, j, k));

  // rhs = -L_aniso(exact): the exact discrete anisotropic Laplacian (negated to
  // match the Jacobi update's sign convention, where diag*phi = rhs + w*neighbors).
  const rhs = new RegularGrid3D(res, size);
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const c = exact.get(i, j, k);
        const lap =
          wx * (exact.get(i - 1, j, k) + exact.get(i + 1, j, k) - 2 * c) +
          wy * (exact.get(i, j - 1, k) + exact.get(i, j + 1, k) - 2 * c) +
          wz * (exact.get(i, j, k - 1) + exact.get(i, j, k + 1) - 2 * c);
        rhs.set(i, j, k, -lap);
      }
    }
  }

  // Initial guess: exact on the boundary (Dirichlet), zero in the interior.
  const seedFrom = () => {
    const g = exact.clone();
    for (let k = 1; k < nz - 1; k++)
      for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) g.set(i, j, k, 0);
    return g;
  };

  const maxInteriorError = (g: RegularGrid3D) => {
    let e = 0;
    for (let k = 1; k < nz - 1; k++)
      for (let j = 1; j < ny - 1; j++)
        for (let i = 1; i < nx - 1; i++) {
          e = Math.max(e, Math.abs(g.get(i, j, k) - exact.get(i, j, k)));
        }
    return e;
  };

  const MAX_ITER = 40000;
  const TOL = 1e-9;

  it('jacobiIterationPoissonAnisotropic recovers the exact solution on a non-cubic grid', () => {
    const sol = seedFrom();
    jacobiIterationPoissonAnisotropic(sol, rhs, wx, wy, wz, MAX_ITER, TOL, 1.0);
    const err = maxInteriorError(sol);
    expect(err).toBeLessThan(1e-2);
  });

  it('the old isotropic coefficients (alpha=dx^2, beta=6) FAIL on the same problem', () => {
    // What the buggy projection did: solve the SAME rhs with isotropic h=dx.
    const solIso = seedFrom();
    jacobiIteration(solIso, rhs, dx * dx, 6, MAX_ITER, TOL, 1.0);
    const errIso = maxInteriorError(solIso);

    const solAniso = seedFrom();
    jacobiIterationPoissonAnisotropic(solAniso, rhs, wx, wy, wz, MAX_ITER, TOL, 1.0);
    const errAniso = maxInteriorError(solAniso);

    // The isotropic operator solves the wrong equation on an anisotropic grid:
    // its error must be both substantial in absolute terms and far worse than
    // the anisotropic solver's. This is the bug the fix prevents.
    expect(errIso).toBeGreaterThan(0.05);
    expect(errIso).toBeGreaterThan(errAniso * 5);
  });
});
