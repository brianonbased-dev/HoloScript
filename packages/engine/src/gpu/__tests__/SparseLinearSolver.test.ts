/**
 * SparseLinearSolver Tests
 *
 * Unit tests for the WebGPU Conjugate Gradient sparse solver.
 * GPU-dependent tests gracefully skip when WebGPU is unavailable (CI/Node).
 */

import { describe, it, expect } from 'vitest';
import { SparseLinearSolver } from '../SparseLinearSolver.js';
import type { CSRMatrix, CGSolveResult, CGSolveOptions } from '../SparseLinearSolver.js';
import { WebGPUContext } from '../WebGPUContext.js';

// ── Helper: build a simple SPD tridiagonal CSR matrix ──────────────
// Returns the classic -1, 2, -1 Laplacian (always SPD for n >= 2)
function buildTridiagonalCSR(n: number): CSRMatrix {
  const nnz = 3 * n - 2; // tridiagonal: n diag + (n-1) upper + (n-1) lower
  const val = new Float32Array(nnz);
  const col_ind = new Uint32Array(nnz);
  const row_ptr = new Uint32Array(n + 1);

  let idx = 0;
  for (let i = 0; i < n; i++) {
    row_ptr[i] = idx;

    if (i > 0) {
      val[idx] = -1;
      col_ind[idx] = i - 1;
      idx++;
    }

    val[idx] = 2;
    col_ind[idx] = i;
    idx++;

    if (i < n - 1) {
      val[idx] = -1;
      col_ind[idx] = i + 1;
      idx++;
    }
  }
  row_ptr[n] = idx;

  return { val, col_ind, row_ptr, num_rows: n };
}

// ── Helper: CPU-side SpMV for verification ─────────────────────────
function cpuSpmv(A: CSRMatrix, x: Float32Array): Float32Array {
  const y = new Float32Array(A.num_rows);
  for (let i = 0; i < A.num_rows; i++) {
    let sum = 0;
    for (let j = A.row_ptr[i]; j < A.row_ptr[i + 1]; j++) {
      sum += A.val[j] * x[A.col_ind[j]];
    }
    y[i] = sum;
  }
  return y;
}

// ── Helper: CPU-side CG solver for ground truth comparison ─────────
function cpuCG(A: CSRMatrix, b: Float32Array, maxIter: number = 1000, tol: number = 1e-10): Float32Array {
  const n = A.num_rows;
  const x = new Float32Array(n); // zero initial guess
  let r = new Float32Array(b);   // r = b - A*0 = b
  let p = new Float32Array(r);
  let rDotR = r.reduce((acc, v) => acc + v * v, 0);

  for (let k = 0; k < maxIter; k++) {
    const Ap = cpuSpmv(A, p);
    const pAp = p.reduce((acc, v, i) => acc + v * Ap[i], 0);
    if (Math.abs(pAp) < 1e-30) break;

    const alpha = rDotR / pAp;

    for (let i = 0; i < n; i++) x[i] += alpha * p[i];
    const rNew = new Float32Array(n);
    for (let i = 0; i < n; i++) rNew[i] = r[i] - alpha * Ap[i];

    const rNewDotRNew = rNew.reduce((acc, v) => acc + v * v, 0);
    if (rNewDotRNew < tol) break;

    const beta = rNewDotRNew / rDotR;
    const pNew = new Float32Array(n);
    for (let i = 0; i < n; i++) pNew[i] = rNew[i] + beta * p[i];

    r = rNew;
    p = pNew;
    rDotR = rNewDotRNew;
  }

  return x;
}

// ═══════════════════════════════════════════════════════════════════
// Pure logic tests (no GPU required)
// ═══════════════════════════════════════════════════════════════════

describe('CSR Matrix Construction', () => {
  it('should build valid tridiagonal CSR for n=4', () => {
    const A = buildTridiagonalCSR(4);

    expect(A.num_rows).toBe(4);
    expect(A.row_ptr.length).toBe(5);
    // Row 0: [2, -1]       → 2 entries
    // Row 1: [-1, 2, -1]   → 3 entries
    // Row 2: [-1, 2, -1]   → 3 entries
    // Row 3: [-1, 2]       → 2 entries
    // Total: 10 entries
    expect(A.row_ptr[4]).toBe(10);
  });

  it('should produce correct SpMV result', () => {
    const A = buildTridiagonalCSR(4);
    const x = new Float32Array([1, 2, 3, 4]);
    const y = cpuSpmv(A, x);

    // Manual: A * [1,2,3,4]
    // Row 0: 2*1 + (-1)*2 = 0
    // Row 1: (-1)*1 + 2*2 + (-1)*3 = 0
    // Row 2: (-1)*2 + 2*3 + (-1)*4 = 0
    // Row 3: (-1)*3 + 2*4 = 5
    expect(y[0]).toBeCloseTo(0);
    expect(y[1]).toBeCloseTo(0);
    expect(y[2]).toBeCloseTo(0);
    expect(y[3]).toBeCloseTo(5);
  });

  it('should solve a small system with CPU CG', () => {
    const n = 10;
    const A = buildTridiagonalCSR(n);

    // Build RHS b = A * x_exact so we know the answer
    const xExact = new Float32Array(n);
    for (let i = 0; i < n; i++) xExact[i] = i + 1;

    const b = cpuSpmv(A, xExact);
    const xSolved = cpuCG(A, b);

    for (let i = 0; i < n; i++) {
      expect(xSolved[i]).toBeCloseTo(xExact[i], 3);
    }
  });
});

describe('CSRMatrix interface', () => {
  it('should have required fields', () => {
    const A = buildTridiagonalCSR(3);
    expect(A).toHaveProperty('val');
    expect(A).toHaveProperty('col_ind');
    expect(A).toHaveProperty('row_ptr');
    expect(A).toHaveProperty('num_rows');
    expect(A.val).toBeInstanceOf(Float32Array);
    expect(A.col_ind).toBeInstanceOf(Uint32Array);
    expect(A.row_ptr).toBeInstanceOf(Uint32Array);
  });
});

describe('SparseLinearSolver exports', () => {
  it('should export the class', () => {
    expect(SparseLinearSolver).toBeDefined();
    expect(typeof SparseLinearSolver).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════
// GPU integration tests (skip when WebGPU unavailable)
// ═══════════════════════════════════════════════════════════════════

describe('SparseLinearSolver GPU Integration', () => {
  let context: WebGPUContext;
  let gpuAvailable = false;

  it('should detect WebGPU availability', async () => {
    context = new WebGPUContext({ fallbackToCPU: true });
    await context.initialize();
    gpuAvailable = context.isSupported();

    if (!gpuAvailable) {
      console.log('WebGPU not available in test environment -- GPU tests will be skipped');
    }

    expect(context).toBeDefined();
  });

  it('should initialize solver when GPU is available', async () => {
    if (!gpuAvailable) return;

    const solver = new SparseLinearSolver(context);
    await solver.initialize();
    expect(solver).toBeDefined();
    solver.destroy();
  });

  it('should solve a 4x4 tridiagonal system on GPU', async () => {
    if (!gpuAvailable) return;

    const solver = new SparseLinearSolver(context);
    await solver.initialize();

    const n = 4;
    const A = buildTridiagonalCSR(n);
    const xExact = new Float32Array([1, 2, 3, 4]);
    const b = cpuSpmv(A, xExact);
    const xGuess = new Float32Array(n); // zero

    const result = await solver.solveCG(A, b, xGuess, {
      maxIterations: 100,
      toleranceSq: 1e-10,
    });

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThan(100);

    for (let i = 0; i < n; i++) {
      expect(result.x[i]).toBeCloseTo(xExact[i], 2);
    }

    solver.destroy();
  });

  it('should solve a 100-DOF system on GPU', async () => {
    if (!gpuAvailable) return;

    const solver = new SparseLinearSolver(context);
    await solver.initialize();

    const n = 100;
    const A = buildTridiagonalCSR(n);

    const xExact = new Float32Array(n);
    for (let i = 0; i < n; i++) xExact[i] = Math.sin(i * 0.1);

    const b = cpuSpmv(A, xExact);
    const xGuess = new Float32Array(n);

    const result = await solver.solveCG(A, b, xGuess, {
      maxIterations: 500,
      toleranceSq: 1e-8,
    });

    expect(result.converged).toBe(true);

    // Compare GPU solution against CPU CG ground truth
    const xCPU = cpuCG(A, b, 500, 1e-8);
    for (let i = 0; i < n; i++) {
      expect(result.x[i]).toBeCloseTo(xCPU[i], 2);
    }

    solver.destroy();
  });

  it('should converge immediately for a zero RHS', async () => {
    if (!gpuAvailable) return;

    const solver = new SparseLinearSolver(context);
    await solver.initialize();

    const n = 10;
    const A = buildTridiagonalCSR(n);
    const b = new Float32Array(n);       // b = 0
    const xGuess = new Float32Array(n);  // x = 0

    const result = await solver.solveCG(A, b, xGuess);

    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(0);

    solver.destroy();
  });

  it('should report progress via callback', async () => {
    if (!gpuAvailable) return;

    const solver = new SparseLinearSolver(context);
    await solver.initialize();

    const n = 50;
    const A = buildTridiagonalCSR(n);
    const xExact = new Float32Array(n);
    for (let i = 0; i < n; i++) xExact[i] = i + 1;
    const b = cpuSpmv(A, xExact);

    const progressCalls: Array<{ iter: number; residual: number }> = [];

    await solver.solveCG(A, b, new Float32Array(n), {
      maxIterations: 200,
      convergenceCheckInterval: 10,
      onProgress: (iter, residual) => {
        progressCalls.push({ iter, residual });
      },
    });

    // Should have received at least one progress call
    expect(progressCalls.length).toBeGreaterThan(0);

    // Residual should be decreasing
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i].residual).toBeLessThanOrEqual(progressCalls[i - 1].residual + 1e-6);
    }

    solver.destroy();
  });
});
