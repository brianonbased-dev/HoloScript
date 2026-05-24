/**
 * FDTDSolver CPML — Absorbing-Boundary Verifier (deep-ratchet E2)
 *
 * Adversarial, failing-if-broken assertions that the PML is a REAL convolutional
 * PML, not the old `field *= (1 - sigma)` damping stub (which multiplied the
 * total field by a cubic profile post-step — energy-dissipating but NOT
 * impedance-matched, so it reflected at the interface, and whose `PMLFields`
 * carried no convolution memory at all).
 *
 * The decisive physical test (`reflection`): an outgoing wave packet must be
 * ABSORBED by a CPML wall (interior falls quiet) yet REFLECTED by a PEC wall
 * (interior stays energized). A broken/absent absorber fails the absolute quiet
 * bound; a wall that doesn't reflect fails the PEC sanity bound — so neither a
 * no-op nor a global-damp hack can pass both.
 *
 * Method per /deep-ratchet (F.075/F.076): the verifier proves the capability,
 * not merely that a test runs.
 */
import { describe, it, expect } from 'vitest';
import { FDTDSolver, type FDTDConfig, type EMSource } from '../FDTDSolver';
import { computeAxisProfile, updatePsi } from '../cpml';

// ── pure-numeric coefficient checks ──────────────────────────────────────────

describe('cpml profile numerics', () => {
  it('thickness 0 ⇒ pass-through everywhere (b=1, a=0, 1/κ=1, inactive)', () => {
    const p = computeAxisProfile(20, 0, 19, 0, 0.01, 1e-12);
    expect(p.active).toBe(false);
    for (let i = 0; i < 20; i++) {
      expect(p.b[i]).toBe(1);
      expect(p.a[i]).toBe(0);
      expect(p.invKappa[i]).toBe(1);
    }
  });

  it('interior cells are loss-free; only the PML slabs carry decay', () => {
    const n = 40;
    const t = 8;
    // Integer (E-aligned) profile as the solver builds it: length n+1.
    const p = computeAxisProfile(n + 1, 0, n, t, 0.01, 1e-12);
    expect(p.active).toBe(true);
    // A cell deep in the interior (index 20) must be a pure pass-through.
    expect(p.b[20]).toBe(1);
    expect(p.a[20]).toBe(0);
    // The very edge cells (in the PML slab) must carry real loss: b < 1.
    expect(p.b[0]).toBeLessThan(1);
    expect(p.b[n]).toBeLessThan(1); // high-side slab too (index n valid, len n+1)
    // Loss grades up toward the wall: outer cell decays more than inner-slab cell.
    expect(p.b[0]).toBeLessThan(p.b[t - 1]);
  });

  it('updatePsi performs the recursive convolution ψ ← b·ψ + a·d', () => {
    // With b = 0.5, a = 2, ψ0 = 1, d = 3  ⇒  0.5*1 + 2*3 = 6.5
    expect(updatePsi(1, 0.5, 2, 3)).toBeCloseTo(6.5, 12);
    // A pass-through cell (b=1,a=0) never accumulates.
    expect(updatePsi(7, 1, 0, 999)).toBe(7);
  });
});

// ── physical absorption check ─────────────────────────────────────────────────

/**
 * Total EM field energy ∝ Σ(E² + H²) over the whole domain. In a lossless PEC
 * cavity this is conserved (energy cannot leave); with absorbing CPML walls it
 * decays as the wave exits — the defining difference between a reflecting and an
 * absorbing boundary.
 */
function totalEnergy(solver: FDTDSolver): number {
  let e = 0;
  for (const f of [solver.Ex, solver.Ey, solver.Ez, solver.Hx, solver.Hy, solver.Hz]) {
    for (let i = 0; i < f.data.length; i++) e += f.data[i] * f.data[i];
  }
  return e;
}

const N = 40;

function makeConfig(pmlThickness: number): FDTDConfig {
  const dx = 0.005;
  const src: EMSource = {
    id: 'pulse',
    type: 'sinusoidal',
    position: [20, 20, 20],
    polarization: 'z',
    amplitude: 1.0,
    frequency: 6e9, // 10 cells/λ at dx=5mm — well resolved
    // Wide envelope ⇒ the carrier completes several cycles, so the injected
    // current is zero-mean (no residual electrostatic near-field for the PML to
    // be unfairly blamed for — CFS-PML with α=0 absorbs radiation, not DC).
    pulseWidth: 1.6e-10,
  };
  return {
    cellCount: [N, N, N],
    cellSize: [dx, dx, dx],
    sources: [src],
    pmlThickness,
  };
}

describe('FDTDSolver — CPML absorbs, PEC reflects (the absorbing-layer claim)', () => {
  it('total field energy drains through CPML walls but is conserved by a PEC cavity', () => {
    const cpmlSolver = new FDTDSolver(makeConfig(6)); // CPML walls
    const pecSolver = new FDTDSolver(makeConfig(0)); // PEC walls (no PML), lossless

    // Launch a finite packet, then cut the source and capture the STORED energy
    // (baselined after the injection transient, while the wave is still in the
    // interior and hasn't yet reached either wall). CPML then drains it; the
    // lossless PEC cavity must conserve it.
    const launchSteps = 140; // wide pulse centred at ~step 74, done by ~130
    const baselineStep = 146; // just after source-off; wave still interior
    const totalSteps = 380;

    let storedCpml = 0;
    let storedPec = 0;
    for (let s = 0; s < totalSteps; s++) {
      if (s === launchSteps) {
        cpmlSolver['config'].sources[0].active = false;
        pecSolver['config'].sources[0].active = false;
      }
      cpmlSolver.step();
      pecSolver.step();
      if (s === baselineStep) {
        storedCpml = totalEnergy(cpmlSolver);
        storedPec = totalEnergy(pecSolver);
      }
    }

    const residualCpml = totalEnergy(cpmlSolver);
    const residualPec = totalEnergy(pecSolver);

    // Numerical stability: CPML must not blow up (a wrong-sign ψ would).
    expect(Number.isFinite(residualCpml)).toBe(true);
    expect(storedCpml).toBeGreaterThan(0);

    // PEC sanity: a lossless reflecting cavity conserves energy — the wave just
    // bounces, so most of the stored energy is still present at the end. (Proves
    // there genuinely IS energy that an absorber would have to remove — the Yee
    // leapfrog is symplectic, so a closed PEC box conserves to high accuracy.)
    expect(residualPec / storedPec).toBeGreaterThan(0.5);

    // CPML claim: the absorbing walls have drained the domain — almost all the
    // energy has left. A no-op/absent absorber fails this; so does the old
    // global-damp stub (which reflected at the interface, trapping energy).
    expect(residualCpml / storedCpml).toBeLessThan(0.02);

    // And CPML must be dramatically emptier than the conserving PEC cavity.
    expect(residualCpml).toBeLessThan(residualPec * 0.05);
  });
});
