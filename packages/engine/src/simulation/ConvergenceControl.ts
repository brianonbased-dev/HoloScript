/**
 * ConvergenceControl — Iterative linear solvers for PDE systems.
 *
 * Conjugate Gradient (matrix-free) for general SPD systems.
 * Jacobi iteration for grid-based Poisson/diffusion equations.
 */

import { RegularGrid3D } from './RegularGrid3D';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConvergenceResult {
  converged: boolean;
  iterations: number;
  residual: number;
  maxChange: number;
  residualHistory?: number[];
}

// ── Conjugate Gradient ────────────────────────────────────────────────────────

/**
 * Matrix-free Conjugate Gradient solver for Ax = b.
 *
 * @param applyA  Function that computes A*x into the output buffer
 * @param b       Right-hand side vector
 * @param x       Initial guess (modified in place with solution)
 * @param maxIter Maximum iterations
 * @param tol     Convergence tolerance. Threshold is max(tol * ||b||, tol * ||x_0||, abstol)
 * @param diagA   Optional diagonal of A for Jacobi preconditioning
 * @param abstol  Absolute tolerance flooring
 */
export function conjugateGradient(
  applyA: (x: Float32Array, out: Float32Array) => void,
  b: Float32Array,
  x: Float32Array,
  maxIter: number,
  tol: number,
  diagA?: Float32Array,
  abstol?: number
): ConvergenceResult {
  const actualAbstol = abstol ?? tol;
  const n = b.length;
  const r = new Float32Array(n);
  const z = new Float32Array(n);
  const p = new Float32Array(n);
  const Ap = new Float32Array(n);
  const residualHistory: number[] = [];

  // r = b - A*x
  applyA(x, Ap);
  for (let i = 0; i < n; i++) r[i] = b[i] - Ap[i];

  // z = M^-1 r  (Jacobi preconditioner)
  if (diagA) {
    for (let i = 0; i < n; i++) z[i] = Math.abs(diagA[i]) > 1e-20 ? r[i] / diagA[i] : r[i];
  } else {
    z.set(r);
  }

  // p = z
  p.set(z);

  let rDotZ = dot(r, z);
  const bNorm = Math.sqrt(dot(b, b));
  const xNorm = Math.sqrt(dot(x, x));
  const threshold = Math.max(tol * bNorm, tol * xNorm, actualAbstol);

  let maxChange = 0;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    const rNorm = Math.sqrt(dot(r, r));
    residualHistory.push(rNorm);

    if (rNorm < threshold) {
      return { converged: true, iterations: iter, residual: rNorm, maxChange, residualHistory };
    }

    applyA(p, Ap);
    const pAp = dot(p, Ap);
    if (Math.abs(pAp) < 1e-30) break; // degenerate

    const alpha = rDotZ / pAp;

    maxChange = 0;
    for (let i = 0; i < n; i++) {
      const dx = alpha * p[i];
      x[i] += dx;
      r[i] -= alpha * Ap[i];
      if (Math.abs(dx) > maxChange) maxChange = Math.abs(dx);
    }

    // z = M^-1 r
    if (diagA) {
      for (let i = 0; i < n; i++) z[i] = Math.abs(diagA[i]) > 1e-20 ? r[i] / diagA[i] : r[i];
    } else {
      z.set(r);
    }

    const rDotZNew = dot(r, z);
    const beta = rDotZNew / rDotZ;
    rDotZ = rDotZNew;

    for (let i = 0; i < n; i++) {
      p[i] = z[i] + beta * p[i];
    }
  }

  const finalRNorm = Math.sqrt(dot(r, r));
  residualHistory.push(finalRNorm);

  return {
    converged: false,
    iterations: iter,
    residual: finalRNorm,
    maxChange,
    residualHistory
  };
}

// ── Jacobi Iteration ──────────────────────────────────────────────────────────

/**
 * Jacobi iterative solver for grid-based Laplacian equations.
 * Solves ∇²u = rhs on a RegularGrid3D using weighted Jacobi.
 *
 * @param grid     Solution field (modified in place)
 * @param rhs      Right-hand side field
 * @param alpha    Coefficient (typically dx² for Poisson)
 * @param beta     Denominator coefficient (typically 6 for 3D Laplacian)
 * @param maxIter  Maximum iterations
 * @param tol      Convergence tolerance on max absolute change
 * @param omega    Relaxation factor (0.67 for damped Jacobi, 1.0 for standard)
 */
export function jacobiIteration(
  grid: RegularGrid3D,
  rhs: RegularGrid3D,
  alpha: number,
  beta: number,
  maxIter: number,
  tol: number,
  omega = 0.6667
): ConvergenceResult {
  const { nx, ny, nz } = grid;
  const temp = grid.clone();
  let maxChange = 0;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    maxChange = 0;

    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const neighbors =
            temp.get(i - 1, j, k) +
            temp.get(i + 1, j, k) +
            temp.get(i, j - 1, k) +
            temp.get(i, j + 1, k) +
            temp.get(i, j, k - 1) +
            temp.get(i, j, k + 1);

          const newVal = (alpha * rhs.get(i, j, k) + neighbors) / beta;
          const oldVal = temp.get(i, j, k);
          const relaxed = oldVal + omega * (newVal - oldVal);

          grid.set(i, j, k, relaxed);

          const change = Math.abs(relaxed - oldVal);
          if (change > maxChange) maxChange = change;
        }
      }
    }

    if (maxChange < tol) {
      return { converged: true, iterations: iter + 1, residual: maxChange, maxChange };
    }

    // Copy solution back to temp for next iteration
    temp.copy(grid);
  }

  return { converged: false, iterations: iter, residual: maxChange, maxChange };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
