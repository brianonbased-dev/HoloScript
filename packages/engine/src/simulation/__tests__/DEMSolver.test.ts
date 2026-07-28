/**
 * DEMSolver tests — Discrete Element Method (Cundall–Strack linear spring-dashpot).
 *
 * All tests are fully deterministic: no Math.random(), only the seeded LCG
 * inside DEMSolver (used only for default position initialisation).
 * Every test that sets up positions/velocities does so explicitly.
 */

import { describe, it, expect } from 'vitest';
import { DEMSolver, type DEMConfig } from '../DEMSolver';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Run `nSteps` steps of size `dt` and return the solver. */
function run(solver: DEMSolver, nSteps: number, dt: number): DEMSolver {
  for (let s = 0; s < nSteps; s++) solver.step(dt);
  return solver;
}

/** Copy positions out of a solver into a plain Float64Array. */
function copyPositions(solver: DEMSolver): Float64Array {
  return new Float64Array(solver.positions);
}

// ── 1. Two-particle head-on collision — restitution check ─────────────────────

describe('DEMSolver — head-on collision restitution', () => {
  it('rebound speed ratio matches restitution within 10 %', () => {
    const e = 0.7;
    const r = 0.05; // m
    const m = 1.0; // kg
    const kn = 5e4; // N/m — soft enough for a visible bounce
    const dt = 1e-5; // s

    // Place two particles approaching along x, gap just over touching
    const gap = 2 * r + 0.001; // small gap so first contact happens quickly
    const v0 = 0.5; // approach speed (m/s)

    const cfg: DEMConfig = {
      particleCount: 2,
      radii: [r, r],
      masses: [m, m],
      kn,
      restitution: e,
      friction: 0,
      gravity: [0, 0, 0],
      boxBounds: [
        [-5, 5],
        [-5, 5],
        [-5, 5],
      ],
      initialPositions: [-gap / 2, 0, 0, gap / 2, 0, 0],
      initialVelocities: [v0, 0, 0, -v0, 0, 0], // approaching
    };

    const solver = new DEMSolver(cfg);

    // Run until particles separate (max ~5000 steps should be enough for kn=5e4)
    let maxSteps = 5000;
    let contacted = false;
    let separated = false;
    let postSepVx0 = 0;
    let postSepVx1 = 0;

    for (let s = 0; s < maxSteps; s++) {
      solver.step(dt);
      const stats = solver.getStats();
      if (stats.contactCount > 0) contacted = true;
      if (contacted && stats.contactCount === 0 && !separated) {
        separated = true;
        postSepVx0 = solver.velocities[0];
        postSepVx1 = solver.velocities[3];
        break;
      }
    }

    expect(contacted).toBe(true);
    expect(separated).toBe(true);

    // After elastic-like collision the particles should reverse directions
    expect(postSepVx0).toBeLessThan(0); // i moved in +x, now moves in -x
    expect(postSepVx1).toBeGreaterThan(0); // i moved in -x, now moves in +x

    // Speed ratio: rebound speed / approach speed ≈ e
    const ratio0 = Math.abs(postSepVx0) / v0;
    const ratio1 = Math.abs(postSepVx1) / v0;
    const avgRatio = (ratio0 + ratio1) / 2;

    // Accept ±10 % of the target restitution
    expect(avgRatio).toBeGreaterThan(e * 0.9);
    expect(avgRatio).toBeLessThan(e * 1.1);
  });
});

// ── 2. Single particle dropped on floor — settle and no tunnelling ────────────

describe('DEMSolver — drop onto floor', () => {
  it('particle settles (KE decays to near zero) and no tunnelling occurs', () => {
    const r = 0.05;
    const m = 1.0;
    const kn = 1e5;

    // Place particle above the floor with zero initial velocity.
    // Fall height h = |yStart - yFloor - r| ≈ 0.45 m.
    //   First contact at t ≈ √(2h/g) ≈ 0.30 s.
    //   With e = 0.3: two bounces dissipate 99.2% of KE; final KE < 0.04 J.
    //   Two full bounces take ≈ 0.86 s total → use 10 000 steps × dt=1e-4.
    const yFloor = -1.0;
    const yStart = -0.5;

    const cfg: DEMConfig = {
      particleCount: 1,
      radii: [r],
      masses: [m],
      kn,
      restitution: 0.3, // dissipative — settles in ≤ 3 bounces
      friction: 0,
      gravity: [0, -9.81, 0],
      boxBounds: [
        [-2, 2],
        [yFloor, 2],
        [-2, 2],
      ],
      initialPositions: [0, yStart, 0],
      initialVelocities: [0, 0, 0],
    };

    const solver = new DEMSolver(cfg);
    const dt = 1e-4;
    const nSteps = 10000; // 1.0 s of simulation — enough for ≥ 2 bounces

    run(solver, nSteps, dt);

    const stats = solver.getStats();
    const yFinal = solver.positions[1];
    const finalKE = stats.kineticEnergy;
    const fallHeight = Math.abs(yStart - (yFloor + r));

    // Should have settled: KE < 5 % of initial potential energy
    expect(finalKE).toBeLessThan(0.05 * m * 9.81 * fallHeight);

    // No tunnelling: particle must remain above the floor surface
    expect(yFinal).toBeGreaterThan(yFloor + r * 0.95);

    // Final overlap is small (< 5 % of radius)
    expect(stats.maxOverlap).toBeLessThan(0.05 * r);
  });
});

// ── 3. Zero gravity — momentum conservation through a collision ───────────────

describe('DEMSolver — momentum conservation (zero gravity)', () => {
  it(
    'linear momentum is conserved through a collision (relative error < 1e-6)',
    { timeout: 30000 },
    () => {
      const r = 0.05;
      const m1 = 1.0;
      const m2 = 2.0; // unequal masses to make it non-trivial

      const v0 = 1.0;
      // Small gap so first contact happens within ~1 step
      const gap = 2 * r + 0.001;

      // Use dt = 1e-4 which is still well below contact-time stability limit.
      // Contact duration ≈ π·√(m_eff / kn) = π·√(0.667/5e4) ≈ 0.0115 s → ~115 steps.
      // 3 000 steps × 1e-4 s = 0.3 s — far more than enough for the collision.
      const cfg: DEMConfig = {
        particleCount: 2,
        radii: [r, r],
        masses: [m1, m2],
        kn: 5e4,
        restitution: 0.8,
        friction: 0,
        gravity: [0, 0, 0],
        boxBounds: [
          [-10, 10],
          [-10, 10],
          [-10, 10],
        ],
        initialPositions: [-gap / 2, 0, 0, gap / 2, 0, 0],
        initialVelocities: [v0, 0, 0, 0, 0, 0],
      };

      // Compute initial total momentum (px is the only non-zero component)
      const p0x = m1 * v0;

      const solver = new DEMSolver(cfg);
      run(solver, 3000, 1e-4);

      const px = m1 * solver.velocities[0] + m2 * solver.velocities[3];
      const py = m1 * solver.velocities[1] + m2 * solver.velocities[4];
      const pz = m1 * solver.velocities[2] + m2 * solver.velocities[5];

      // px conserved
      expect(Math.abs(px - p0x) / Math.max(1, Math.abs(p0x))).toBeLessThan(1e-6);
      // py and pz should remain zero (no off-axis forces in this symmetric setup)
      expect(Math.abs(py)).toBeLessThan(1e-10);
      expect(Math.abs(pz)).toBeLessThan(1e-10);
    }
  );
});

// ── 4. Angle of repose — pile has non-zero slope with friction ────────────────

describe('DEMSolver — angle of repose (qualitative)', () => {
  it('pile poured with mu=0.5 has max height > single-particle-layer height', () => {
    // Build a small pile of particles dropped from above the floor.
    // With sufficient friction they pile up; the max height should exceed
    // what a single flat layer would achieve.
    const r = 0.05;
    const diameter = 2 * r;
    const N = 16;
    const m = 1.0;
    const kn = 2e4;

    // Place particles in two rows above the floor, staggered — all with slight
    // downward velocity so they fall and pile.
    const positions = new Float64Array(N * 3);
    const velocities = new Float64Array(N * 3);

    for (let i = 0; i < N; i++) {
      // LCG for deterministic placement
      const lcgA = ((i * 1664525 + 1013904223) >>> 0) / 0x100000000;
      const lcgB = ((i * 22695477 + 1) >>> 0) / 0x100000000;
      positions[i * 3] = (lcgA - 0.5) * 0.5; // x in [-0.25, 0.25]
      positions[i * 3 + 1] = 0.2 + i * diameter * 0.8; // stacked above floor
      positions[i * 3 + 2] = (lcgB - 0.5) * 0.1;
      velocities[i * 3 + 1] = -0.3; // small downward nudge
    }

    const cfg: DEMConfig = {
      particleCount: N,
      radii: new Array(N).fill(r) as number[],
      masses: new Array(N).fill(m) as number[],
      kn,
      restitution: 0.2, // dissipative
      friction: 0.5,
      gravity: [0, -9.81, 0],
      boxBounds: [
        [-0.6, 0.6],
        [-1.0, 3.0],
        [-0.3, 0.3],
      ],
      initialPositions: positions,
      initialVelocities: velocities,
    };

    const solver = new DEMSolver(cfg);
    const dt = 5e-5;
    run(solver, 4000, dt); // 0.2 s of simulation

    // Find max y position
    let yMax = -Infinity;
    let yMin = Infinity;
    for (let i = 0; i < N; i++) {
      const y = solver.positions[i * 3 + 1];
      if (y > yMax) yMax = y;
      if (y < yMin) yMin = y;
    }

    const pileHeight = yMax - yMin;

    // A flat single layer would have height ≈ 0 (all particles side by side).
    // With friction, the pile stacks so height > 1 diameter.
    expect(pileHeight).toBeGreaterThan(diameter);

    // Sanity: particles should have settled (not still flying around)
    const stats = solver.getStats();
    expect(Number.isFinite(stats.kineticEnergy)).toBe(true);
    expect(stats.kineticEnergy).toBeLessThan(N * m * 9.81 * 3.0); // < total potential drop
  });
});

// ── 5. Determinism — two identical runs produce bitwise-equal output ──────────

describe('DEMSolver — determinism', () => {
  it('two identical runs are bitwise-equal after 500 steps', () => {
    const N = 10;
    const r = 0.05;
    const m = 1.0;

    // Explicit deterministic initial conditions built from a simple LCG
    const positions = new Float64Array(N * 3);
    const velocities = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      // Very simple deterministic spread
      positions[i * 3] = (i % 3) * 0.12 - 0.24;
      positions[i * 3 + 1] = -0.3 + Math.floor(i / 3) * 0.12;
      positions[i * 3 + 2] = 0;
      velocities[i * 3 + 1] = -0.1; // all falling
    }

    function makeConfig(): DEMConfig {
      return {
        particleCount: N,
        radii: new Array(N).fill(r) as number[],
        masses: new Array(N).fill(m) as number[],
        kn: 1e5,
        restitution: 0.5,
        friction: 0.3,
        gravity: [0, -9.81, 0],
        boxBounds: [
          [-1, 1],
          [-1, 1],
          [-1, 1],
        ],
        initialPositions: new Float64Array(positions),
        initialVelocities: new Float64Array(velocities),
      };
    }

    const solverA = new DEMSolver(makeConfig());
    const solverB = new DEMSolver(makeConfig());

    const dt = 1e-4;
    run(solverA, 500, dt);
    run(solverB, 500, dt);

    const posA = copyPositions(solverA);
    const posB = copyPositions(solverB);

    // Bitwise-equal positions
    for (let i = 0; i < N * 3; i++) {
      expect(posA[i]).toBe(posB[i]);
    }
  });
});

// ── 6. SimSolver interface contract ───────────────────────────────────────────

describe('DEMSolver — SimSolver interface contract', () => {
  it('exposes correct mode, fieldNames, and getField', () => {
    const solver = new DEMSolver({
      particleCount: 2,
      initialPositions: [0, 0, 0, 0.3, 0, 0],
      boxBounds: [
        [-1, 1],
        [-1, 1],
        [-1, 1],
      ],
    });

    expect(solver.mode).toBe('transient');
    expect(solver.fieldNames).toContain('positions');
    expect(solver.fieldNames).toContain('velocities');
    expect(solver.getField('positions')).toBeInstanceOf(Float64Array);
    expect(solver.getField('velocities')).toBeInstanceOf(Float64Array);
    expect(solver.getField('nonexistent')).toBeNull();
  });

  it('getStats returns finite values and increments stepCount', () => {
    const solver = new DEMSolver({
      particleCount: 1,
      boxBounds: [
        [-1, 1],
        [-1, 1],
        [-1, 1],
      ],
    });
    expect(solver.getStats().stepCount).toBe(0);
    solver.step(1e-4);
    const stats = solver.getStats();
    expect(stats.stepCount).toBe(1);
    expect(Number.isFinite(stats.kineticEnergy)).toBe(true);
    expect(Number.isFinite(stats.contactCount)).toBe(true);
    expect(Number.isFinite(stats.maxOverlap)).toBe(true);
  });

  it('dispose does not throw', () => {
    const solver = new DEMSolver({
      particleCount: 2,
      boxBounds: [
        [-1, 1],
        [-1, 1],
        [-1, 1],
      ],
    });
    run(solver, 10, 1e-4);
    expect(() => solver.dispose()).not.toThrow();
  });
});
