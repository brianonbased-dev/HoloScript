/**
 * ReactionDiffusionSolver — diffusion correctness (2-D no-op fix + implicit stiff path).
 *
 * Forward-premortem Step 1 (plan §0.7). Two findings this gates:
 *   1. stepDiffusion looped the 3-D INTERIOR (`for k=1;k<nz-1` …) → on a 2-D grid
 *      (nz=1) the loop was EMPTY: diffusion silently did NOTHING. This is why the
 *      live lotus seed-pod's *engine* bake stayed homogeneous (the working pattern
 *      comes from the CORE trait's own 2-D Schnakenberg, not this solver).
 *   2. The stiff (high-d) Turing regime forces explicit sub-cycling into a CFL cost
 *      wall (W.314); an implicit backward-Euler branch must stay correct at dt past
 *      the explicit limit.
 *
 * BITING FALSIFIER (premortem #1 failure = a gate that only tests the cheap regime):
 * a pure-diffusion cosine eigenmode on [0,L]² with no-flux BCs decays analytically as
 *   u(x,t) = U0 + A·cos(πx/L)·exp(−D(π/L)²·t).
 * cos(πx/L) has zero gradient at x=0,L so it satisfies no-flux exactly. We validate the
 * 2-D case (the no-op target) for the explicit path, and the implicit path at a dt well
 * PAST the explicit CFL limit — not "agrees with the explicit path in its comfy regime."
 */
import { describe, it, expect } from 'vitest';
import { ReactionDiffusionSolver, type ReactionDiffusionConfig } from '../ReactionDiffusionSolver';

const N = 33;
const L = 1.0;
const DX = L / (N - 1);
const U0 = 1.0;
const AMP = 0.4;

/** Pure-diffusion config (no reactions) for one species, 2-D grid (nz=1). */
function diffusionConfig(D: number, mode: 'explicit' | 'implicit'): ReactionDiffusionConfig {
  return {
    gridResolution: [N, N, 1],
    domainSize: [L, L, L],
    species: [{ name: 'u', diffusivity: D, initialConcentration: U0 }],
    reactions: [],
    diffusionMode: mode,
  };
}

/** Seed a cos(πx/L) eigenmode (flat in y), return its initial peak-to-mean amplitude. */
function seedCosineMode(solver: ReactionDiffusionSolver): void {
  const g = solver.getConcentrationGrid(0);
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const x = (i * DX) / L;
      g.set(i, j, 0, U0 + AMP * Math.cos(Math.PI * x));
    }
  }
}

/** Measured mode amplitude = (max − min)/2 over the field. */
function modeAmplitude(solver: ReactionDiffusionSolver): number {
  const u = solver.getConcentrationField(0);
  let mn = Infinity,
    mx = -Infinity;
  for (const v of u) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return (mx - mn) / 2;
}

/** Explicit-Euler 2-D CFL limit the solver sub-cycles to. */
function cflLimit(D: number): number {
  return 0.9 / (2 * D * (1 / (DX * DX) + 1 / (DX * DX)));
}

describe('ReactionDiffusionSolver diffusion — 2-D correctness + implicit stiff path', () => {
  it('EXPLICIT: 2-D cosine mode decays per analytical exp(−Dπ²t) (catches the nz=1 no-op)', () => {
    const D = 0.05;
    const dt = 0.01; // > CFL → solver sub-cycles explicitly (still stable)
    const steps = 200;
    const solver = new ReactionDiffusionSolver(diffusionConfig(D, 'explicit'));
    seedCosineMode(solver);
    const a0 = modeAmplitude(solver);
    for (let s = 0; s < steps; s += 1) solver.step(dt);
    const a1 = modeAmplitude(solver);

    const t = steps * dt;
    const analytical = Math.exp(-D * Math.PI * Math.PI * t); // factor on the amplitude
    const measured = a1 / a0;

    // Pre-fix this FAILS: the nz=1 loop was empty so a1≈a0 (factor≈1, no decay).
    expect(measured).toBeLessThan(0.6); // it actually decayed
    expect(measured).toBeCloseTo(analytical, 1); // within ~0.05 of analytical
    expect(Math.abs(measured - analytical) / analytical).toBeLessThan(0.15);
  });

  it('IMPLICIT: stable + accurate at dt PAST the explicit CFL limit (stiff regime)', () => {
    const D = 0.05;
    const cfl = cflLimit(D);
    const dt = 8 * cfl; // far past explicit stability — explicit alone would blow up
    const steps = Math.round(2.0 / dt);
    const solver = new ReactionDiffusionSolver(diffusionConfig(D, 'implicit'));
    seedCosineMode(solver);
    const a0 = modeAmplitude(solver);
    for (let s = 0; s < steps; s += 1) solver.step(dt);
    const a1 = modeAmplitude(solver);

    const t = steps * dt;
    const analytical = Math.exp(-D * Math.PI * Math.PI * t);
    const measured = a1 / a0;

    expect(Number.isFinite(a1)).toBe(true); // bounded — no blow-up
    expect(dt).toBeGreaterThan(cfl); // we really are past CFL
    expect(Math.abs(measured - analytical) / analytical).toBeLessThan(0.15);
  });

  it('mass is conserved under no-flux diffusion (no reactions)', () => {
    const D = 0.05;
    const solver = new ReactionDiffusionSolver(diffusionConfig(D, 'explicit'));
    seedCosineMode(solver);
    const total = (s: ReactionDiffusionSolver) => {
      const u = s.getConcentrationField(0);
      let acc = 0;
      for (const v of u) acc += v;
      return acc;
    };
    const before = total(solver);
    for (let s = 0; s < 100; s += 1) solver.step(0.01);
    const after = total(solver);
    expect(Math.abs(after - before) / before).toBeLessThan(1e-3);
  });
});
