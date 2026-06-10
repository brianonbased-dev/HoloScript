/**
 * Tests for AdjointHeatSolver — differentiable thermal diffusion.
 *
 * Key invariant: the discrete adjoint gradient must match central finite
 * differences to near-machine-precision because the forward operator is
 * linear in both S and T0.  We use eps chosen to stay in the double-precision
 * range while avoiding round-off saturation.
 */

import { describe, it, expect } from 'vitest';
import { AdjointHeatSolver } from '../AdjointHeatSolver';

// ── deterministic seeded pseudo-random (LCG) ─────────────────────────────────

function lcg(seed: number): () => number {
  // Park-Miller LCG, period 2^31-2
  let s = (seed >>> 0) || 1;
  return () => {
    s = Math.imul(s, 48271) % 2147483647;
    return s / 2147483647; // (0, 1)
  };
}

// ── small grid fixture ────────────────────────────────────────────────────────

/**
 * Build an 8x8x8 solver with a seeded-random source field and a small but
 * non-trivial alpha.  Uses a stable explicit dt (no sub-stepping needed for
 * this alpha/dx combination).
 */
function makeFixture(seed = 42) {
  const nx = 8, ny = 8, nz = 8;
  const N = nx * ny * nz;
  const rand = lcg(seed);

  const source = new Float64Array(N);
  const initialT = new Float64Array(N);
  const weights = new Float64Array(N);

  for (let n = 0; n < N; n++) {
    source[n] = (rand() - 0.5) * 2;   // [-1, 1]
    initialT[n] = rand() * 10;        // [0, 10]
    weights[n] = rand();              // [0, 1]
  }

  // alpha = 0.01 m²/s, dx = 1/(8-1) ≈ 0.143 m
  // dt_stable = 0.9 * (0.143)^2 / (2*0.01*3) ≈ 0.305 s; use dt = 0.1 (well inside)
  const solver = new AdjointHeatSolver({
    resolution: [nx, ny, nz],
    domainSize: [1, 1, 1],
    alpha: 0.01,
    dt: 0.1,
    source,
    initialT,
    boundaryValue: 0,
  });

  return { solver, source, initialT, weights, nx, ny, nz, N };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. dJ/dS verified against central finite differences
// ─────────────────────────────────────────────────────────────────────────────

describe('AdjointHeatSolver — dJ/dS gradient vs finite differences', () => {
  it('adjoint dJ/dS matches FD to < 1e-8 relative error at 5 interior source cells', () => {
    const { weights, source, initialT, nx, ny, nz, N } = makeFixture(42);
    const STEPS = 4;
    const EPS = 1e-5;

    // Fixed known-interior cells for 8x8x8 grid (indices 1..6 in each axis)
    const testCells: number[] = [
      (1 * ny + 1) * nx + 1,
      (2 * ny + 3) * nx + 2,
      (3 * ny + 2) * nx + 5,
      (4 * ny + 5) * nx + 3,
      (6 * ny + 4) * nx + 4,
    ];

    // Run adjoint once
    const adjSolver = new AdjointHeatSolver({
      resolution: [nx, ny, nz],
      domainSize: [1, 1, 1],
      alpha: 0.01,
      dt: 0.1,
      source: new Float64Array(source),
      initialT: new Float64Array(initialT),
      boundaryValue: 0,
    });
    adjSolver.forward(STEPS);
    const { dJdS } = adjSolver.gradient(weights);

    for (const cellIdx of testCells) {
      // FD: perturb source[cellIdx] ± eps
      const sPlus = new Float64Array(source);
      sPlus[cellIdx] += EPS;
      const sMinus = new Float64Array(source);
      sMinus[cellIdx] -= EPS;

      const solverPlus = new AdjointHeatSolver({
        resolution: [nx, ny, nz],
        domainSize: [1, 1, 1],
        alpha: 0.01,
        dt: 0.1,
        source: sPlus,
        initialT: new Float64Array(initialT),
        boundaryValue: 0,
      });
      const solverMinus = new AdjointHeatSolver({
        resolution: [nx, ny, nz],
        domainSize: [1, 1, 1],
        alpha: 0.01,
        dt: 0.1,
        source: sMinus,
        initialT: new Float64Array(initialT),
        boundaryValue: 0,
      });

      const TPlus = solverPlus.forward(STEPS);
      const TMinus = solverMinus.forward(STEPS);

      let jPlus = 0, jMinus = 0;
      for (let n = 0; n < N; n++) {
        jPlus += weights[n] * TPlus[n];
        jMinus += weights[n] * TMinus[n];
      }
      const fdGrad = (jPlus - jMinus) / (2 * EPS);
      const adjGrad = dJdS[cellIdx];
      const denom = Math.abs(fdGrad) + 1e-12;
      const relErr = Math.abs(adjGrad - fdGrad) / denom;

      expect(relErr).toBeLessThan(1e-8);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. dJ/dT0 verified against central finite differences
// ─────────────────────────────────────────────────────────────────────────────

describe('AdjointHeatSolver — dJ/dT0 gradient vs finite differences', () => {
  it('adjoint dJ/dT0 matches FD to < 1e-8 relative error at 5 interior T0 cells', () => {
    const { weights, source, initialT, nx, ny, nz, N } = makeFixture(99);
    const STEPS = 4;
    const EPS = 1e-5;

    // Use fixed known-interior cells (well away from the nx=8 boundary)
    const testCells: number[] = [
      (2 * ny + 2) * nx + 2,
      (2 * ny + 3) * nx + 3,
      (3 * ny + 2) * nx + 4,
      (4 * ny + 4) * nx + 2,
      (5 * ny + 3) * nx + 3,
    ];

    const adjSolver = new AdjointHeatSolver({
      resolution: [nx, ny, nz],
      domainSize: [1, 1, 1],
      alpha: 0.01,
      dt: 0.1,
      source: new Float64Array(source),
      initialT: new Float64Array(initialT),
      boundaryValue: 0,
    });
    adjSolver.forward(STEPS);
    const { dJdT0 } = adjSolver.gradient(weights);

    for (const cellIdx of testCells) {
      const t0Plus = new Float64Array(initialT);
      t0Plus[cellIdx] += EPS;
      const t0Minus = new Float64Array(initialT);
      t0Minus[cellIdx] -= EPS;

      const solverPlus = new AdjointHeatSolver({
        resolution: [nx, ny, nz],
        domainSize: [1, 1, 1],
        alpha: 0.01,
        dt: 0.1,
        source: new Float64Array(source),
        initialT: t0Plus,
        boundaryValue: 0,
      });
      const solverMinus = new AdjointHeatSolver({
        resolution: [nx, ny, nz],
        domainSize: [1, 1, 1],
        alpha: 0.01,
        dt: 0.1,
        source: new Float64Array(source),
        initialT: t0Minus,
        boundaryValue: 0,
      });

      const TPlus = solverPlus.forward(STEPS);
      const TMinus = solverMinus.forward(STEPS);

      let jPlus = 0, jMinus = 0;
      for (let n = 0; n < N; n++) {
        jPlus += weights[n] * TPlus[n];
        jMinus += weights[n] * TMinus[n];
      }
      const fdGrad = (jPlus - jMinus) / (2 * EPS);
      const adjGrad = dJdT0[cellIdx];
      const denom = Math.abs(fdGrad) + 1e-12;
      const relErr = Math.abs(adjGrad - fdGrad) / denom;

      expect(relErr).toBeLessThan(1e-8);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Linearity sanity: doubling S doubles (J - J_homogeneous)
// ─────────────────────────────────────────────────────────────────────────────

describe('AdjointHeatSolver — linearity in source field', () => {
  it('doubling S doubles J relative to the zero-source baseline', () => {
    const { weights, source, initialT, nx, ny, nz, N } = makeFixture(13);
    const STEPS = 4;

    const makeJ = (s: Float64Array) => {
      const solver = new AdjointHeatSolver({
        resolution: [nx, ny, nz],
        domainSize: [1, 1, 1],
        alpha: 0.01,
        dt: 0.1,
        source: s,
        initialT: new Float64Array(initialT),
        boundaryValue: 0,
      });
      const TN = solver.forward(STEPS);
      let j = 0;
      for (let n = 0; n < N; n++) j += weights[n] * TN[n];
      return j;
    };

    const zeroSource = new Float64Array(N);
    const doubleSource = new Float64Array(N);
    for (let n = 0; n < N; n++) doubleSource[n] = 2 * source[n];

    const j0 = makeJ(zeroSource);
    const j1 = makeJ(source);
    const j2 = makeJ(doubleSource);

    // J(2S) - J(0) = 2 * (J(S) - J(0))
    const delta1 = j1 - j0;
    const delta2 = j2 - j0;
    const relErr = Math.abs(delta2 - 2 * delta1) / (Math.abs(delta1) + 1e-12);
    expect(relErr).toBeLessThan(1e-8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CFL sub-stepping: unstable dt still produces stable, FD-consistent gradients
// ─────────────────────────────────────────────────────────────────────────────

describe('AdjointHeatSolver — CFL sub-stepping', () => {
  it('an unstable-if-explicit dt is silently sub-stepped and gradients remain FD-consistent', () => {
    // alpha = 0.01, dx = 1/7 ≈ 0.143
    // dt_stable ≈ 0.9 * 0.143^2 / (2*0.01*3) ≈ 0.305 s
    // We request dt = 2.0 s — well beyond stability limit, requiring ceil(2.0/0.305) = 7 sub-steps
    const nx = 8, ny = 8, nz = 8;
    const N = nx * ny * nz;
    const rand = lcg(777);

    const source = new Float64Array(N);
    const initialT = new Float64Array(N);
    const weights = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      source[n] = (rand() - 0.5) * 0.5;
      initialT[n] = rand() * 5;
      weights[n] = rand();
    }

    const STEPS = 2;
    const LARGE_DT = 2.0;
    const EPS = 1e-5;

    const adjSolver = new AdjointHeatSolver({
      resolution: [nx, ny, nz],
      domainSize: [1, 1, 1],
      alpha: 0.01,
      dt: LARGE_DT,
      source: new Float64Array(source),
      initialT: new Float64Array(initialT),
      boundaryValue: 0,
    });

    // Verify that subStepCount > 1 (actually sub-stepping happened)
    expect(adjSolver.subStepCount).toBeGreaterThan(1);

    adjSolver.forward(STEPS);
    const { dJdS } = adjSolver.gradient(weights);

    // FD check on a single interior cell
    const cellIdx = (3 * ny + 3) * nx + 3; // interior (3,3,3)

    const sPlus = new Float64Array(source);
    sPlus[cellIdx] += EPS;
    const sMinus = new Float64Array(source);
    sMinus[cellIdx] -= EPS;

    const makeSolver = (s: Float64Array) =>
      new AdjointHeatSolver({
        resolution: [nx, ny, nz],
        domainSize: [1, 1, 1],
        alpha: 0.01,
        dt: LARGE_DT,
        source: s,
        initialT: new Float64Array(initialT),
        boundaryValue: 0,
      });

    const TPlus = makeSolver(sPlus).forward(STEPS);
    const TMinus = makeSolver(sMinus).forward(STEPS);

    let jPlus = 0, jMinus = 0;
    for (let n = 0; n < N; n++) {
      jPlus += weights[n] * TPlus[n];
      jMinus += weights[n] * TMinus[n];
    }
    const fdGrad = (jPlus - jMinus) / (2 * EPS);
    const relErr = Math.abs(dJdS[cellIdx] - fdGrad) / (Math.abs(fdGrad) + 1e-12);

    expect(relErr).toBeLessThan(1e-8);
  });
});
