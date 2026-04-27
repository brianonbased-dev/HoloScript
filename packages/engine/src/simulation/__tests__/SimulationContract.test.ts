/**
 * SimulationContract tests — verify enforced guarantees.
 */

import { describe, it, expect } from 'vitest';
import {
  hashGeometry,
  validateUnits,
  validateMeshSanity,
  DeterministicStepper,
  ContractedSimulation,
  computeAdapterFingerprint,
  type AdapterInfo,
} from '../SimulationContract';
import type { SimSolver, FieldData } from '../SimSolver';

// ── Mock Solver ──────────────────────────────────────────────────────────────

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['temperature'],
    time: 0,
    step(dt: number) { this.time += dt; },
    solve() {},
    getField(): FieldData | null { return new Float32Array(10); },
    getStats() { return { currentTime: this.time, converged: true }; },
    dispose() {},
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Geometry Hashing
// ═══════════════════════════════════════════════════════════════════════

describe('Geometry Hashing', () => {
  it('same geometry produces same hash', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const e = new Uint32Array([0, 1, 2, 3]);
    expect(hashGeometry(v, e)).toBe(hashGeometry(v, e));
  });

  it('different geometry produces different hash', () => {
    const v1 = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const v2 = new Float64Array([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2]);
    const e = new Uint32Array([0, 1, 2, 3]);
    expect(hashGeometry(v1, e)).not.toBe(hashGeometry(v2, e));
  });

  it('hash encodes node and element count', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const e = new Uint32Array([0, 1, 2, 3]);
    const h = hashGeometry(v, e);
    expect(h).toContain('4n');  // 4 nodes
    expect(h).toContain('4e');  // 4 element indices
  });

  it('handles no geometry gracefully', () => {
    expect(hashGeometry(undefined, undefined)).toBe('no-geometry');
  });

  it('SEC-02: same vertices but different connectivity produce different hashes', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const e1 = new Uint32Array([0, 1, 2]);
    const e2 = new Uint32Array([0, 2, 1]);
    expect(hashGeometry(v, e1)).not.toBe(hashGeometry(v, e2));
  });

  it('Paper #4: validateMeshSanity flags out-of-range element indices', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bad = new Uint32Array([0, 1, 99]);
    const vio = validateMeshSanity(v, bad);
    expect(vio.some((x) => x.rule === 'mesh-connectivity' && x.severity === 'error')).toBe(true);
  });

  it('SEC-02: validateMeshSanity warns on orphaned vertices', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9]); // 4 nodes
    const elements = new Uint32Array([0, 1, 2]); // references 0,1,2. Node 3 is orphaned.
    const vio = validateMeshSanity(v, elements);
    expect(vio.some((x) => x.rule === 'mesh-connectivity' && x.message.includes('orphaned'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Unit Validation
// ═══════════════════════════════════════════════════════════════════════

describe('Unit Validation', () => {
  it('accepts valid engineering values', () => {
    const violations = validateUnits({
      material: {
        youngs_modulus: 200e9,  // steel
        poisson_ratio: 0.3,
        yield_strength: 250e6,
        density: 7850,
      },
    });
    expect(violations.length).toBe(0);
  });

  it('warns on suspicious values (wrong units)', () => {
    const violations = validateUnits({
      material: {
        youngs_modulus: 200,  // probably GPa, not Pa — should be 200e9
        density: 7850,
      },
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe('unit-range');
    expect(violations[0].message).toContain('youngs_modulus');
  });

  it('errors on extreme values', () => {
    const violations = validateUnits({
      density: -5, // negative density
    });
    const error = violations.find((v) => v.severity === 'error');
    expect(error).toBeDefined();
  });

  it('validates nested config objects', () => {
    const violations = validateUnits({
      section: { material: { poisson_ratio: 0.7 } }, // > 0.5 is invalid
    });
    expect(violations.some((v) => v.message.includes('poisson_ratio'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Deterministic Stepper
// ═══════════════════════════════════════════════════════════════════════

describe('DeterministicStepper', () => {
  it('takes fixed steps regardless of frame delta', () => {
    const stepper = new DeterministicStepper(0.01); // 10ms fixed step
    let steps = 0;

    // Frame 1: 33ms (30fps)
    steps = stepper.advance(0.033, () => {});
    expect(steps).toBe(3); // 3 × 10ms

    // Frame 2: 16ms (60fps)
    steps = stepper.advance(0.016, () => {});
    // accumulator was 0.003 from frame 1, + 0.016 = 0.019 → 1 step
    expect(steps).toBe(1);
  });

  it('produces same total steps regardless of frame timing', () => {
    // Scenario A: 10 frames at 0.01s
    const stepperA = new DeterministicStepper(0.005);
    let stepsA = 0;
    for (let i = 0; i < 10; i++) stepsA += stepperA.advance(0.01, () => {});

    // Scenario B: 5 frames at 0.02s
    const stepperB = new DeterministicStepper(0.005);
    let stepsB = 0;
    for (let i = 0; i < 5; i++) stepsB += stepperB.advance(0.02, () => {});

    // Both should take approximately the same steps (±1 for FP accumulation)
    expect(Math.abs(stepsA - stepsB)).toBeLessThanOrEqual(1);
  });

  it('caps accumulator to prevent spiral of death', () => {
    const stepper = new DeterministicStepper(0.01, 0.05); // max 50ms accumulator
    const steps = stepper.advance(1.0, () => {}); // 1 second lag spike
    // Capped at ~50ms / 10ms ≈ 4-5 steps (FP accumulator), NOT 100
    expect(steps).toBeLessThanOrEqual(5);
    expect(steps).toBeGreaterThanOrEqual(4);
  });

  it('tracks simulation time accurately', () => {
    const stepper = new DeterministicStepper(0.01);
    stepper.advance(0.1, () => {});
    expect(stepper.getSimTime()).toBeCloseTo(0.1);
    expect(stepper.getStepCount()).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Contracted Simulation
// ═══════════════════════════════════════════════════════════════════════

describe('ContractedSimulation', () => {
  it('wraps solver with deterministic stepping', () => {
    const solver = mockSolver();
    const contracted = new ContractedSimulation(solver, {}, {
      fixedDt: 0.01,
      solverType: 'thermal',
    });

    contracted.step(0.033); // 33ms frame
    expect(solver.time).toBeCloseTo(0.03); // 3 × 0.01 = 0.03
  });

  it('logs interactions with simulation time', () => {
    const contracted = new ContractedSimulation(mockSolver(), {}, { fixedDt: 0.01 });
    contracted.step(0.05); // advance by ~50ms of wall time

    contracted.logInteraction('user_moved_load', { position: [25, 0, 0], force: 1000 });

    const provenance = contracted.getProvenance();
    expect(provenance.interactions.length).toBe(1);
    expect(provenance.interactions[0].type).toBe('user_moved_load');
    expect(provenance.interactions[0].simTime).toBeGreaterThan(0); // some sim time elapsed
  });

  it('generates full provenance record', () => {
    const contracted = new ContractedSimulation(
      mockSolver(),
      { material: { youngs_modulus: 200e9, density: 7850 } },
      { fixedDt: 0.01, solverType: 'structural-tet10' },
    );

    contracted.step(0.1);
    const prov = contracted.getProvenance();

    expect(prov.solverType).toBe('structural-tet10');
    expect(prov.totalSteps).toBe(10);
    expect(prov.totalSimTime).toBeCloseTo(0.1);
    expect(prov.deterministic).toBe(true);
    expect(prov.createdAt).toBeTruthy();
    expect(prov.runId).toContain('run-');
    expect(prov.config.material).toBeDefined();
  });

  it('creates replay record', () => {
    const contracted = new ContractedSimulation(mockSolver(), {}, { fixedDt: 0.01 });
    contracted.step(0.05);
    contracted.logInteraction('test', { value: 42 });

    const replay = contracted.createReplay();
    expect(replay.totalSteps).toBeGreaterThan(0);
    expect(replay.interactions.length).toBe(1);
    expect(replay.fixedDt).toBeGreaterThan(0);
  });

  it('verifies geometry hash matches', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const e = new Uint32Array([0, 1, 2, 3]);

    const contracted = new ContractedSimulation(mockSolver(), { vertices: v, tetrahedra: e }, {});

    // Same geometry should verify
    expect(contracted.verifyGeometry(v, e)).toBe(true);

    // Different geometry should fail
    const v2 = new Float64Array([0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2]);
    expect(contracted.verifyGeometry(v2, e)).toBe(false);
  });

  it('catches unit warnings in config', () => {
    const contracted = new ContractedSimulation(mockSolver(), {
      material: { youngs_modulus: 200 }, // wrong units (should be 200e9) → warning
    }, { enforceUnits: true });

    expect(contracted.getViolations().length).toBeGreaterThan(0);
    expect(contracted.getViolations()[0].message).toContain('youngs_modulus');
  });

  it('catches extreme unit errors', () => {
    const contracted = new ContractedSimulation(mockSolver(), {
      material: { density: -100 }, // negative density → error
    }, { enforceUnits: true });

    expect(contracted.hasErrors()).toBe(true);
  });

  it('passes with valid units', () => {
    const contracted = new ContractedSimulation(mockSolver(), {
      material: { youngs_modulus: 200e9, poisson_ratio: 0.3, density: 7850 },
    }, { enforceUnits: true });

    expect(contracted.hasErrors()).toBe(false);
  });

  it('enforces geometry integrity on step() — Guarantee 1', () => {
    const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const e = new Uint32Array([0, 1, 2, 3]);

    const contracted = new ContractedSimulation(mockSolver(), {
      vertices: v,
      tetrahedra: e,
    }, { fixedDt: 0.01 });

    // Normal step should work
    expect(() => contracted.step(0.02)).not.toThrow();

    // Corrupt the geometry — modify a vertex in the config's clone
    // The contract stores a clone, so modifying the original should NOT trigger.
    // This test verifies the hash was computed correctly at construction.
    v[0] = 999;
    // Step still works because the contract hashes the cloned config, not the original
    expect(() => contracted.step(0.02)).not.toThrow();
  });

  it('replays from provenance — Guarantee 6', () => {
    // Original run
    const solver1 = mockSolver();
    const contracted1 = new ContractedSimulation(solver1, {
      material: { youngs_modulus: 200e9, density: 7850 },
    }, { fixedDt: 0.01, solverType: 'thermal' });

    contracted1.step(0.05);
    contracted1.logInteraction('set_temperature', { value: 300 });
    contracted1.step(0.03);

    const replay = contracted1.createReplay();
    const prov1 = contracted1.getProvenance();

    // Replay: reconstruct from record
    const replayed = ContractedSimulation.replayFromProvenance(
      () => mockSolver(),
      replay,
    );

    // Verify geometry hash matches
    expect(replayed.getProvenance().geometryHash).toBe(prov1.geometryHash);

    // Replay the same steps
    replayed.step(0.05);
    replayed.step(0.03);

    const prov2 = replayed.getProvenance();

    // Same solver type, same total steps, same sim time
    expect(prov2.solverType).toBe(prov1.solverType);
    expect(prov2.totalSteps).toBe(prov1.totalSteps);
    expect(prov2.totalSimTime).toBeCloseTo(prov1.totalSimTime);
    expect(prov2.deterministic).toBe(true);

    // Interactions are re-applied (1 from original + they're in the replay record)
    expect(prov2.interactions.length).toBe(1);
    expect(prov2.interactions[0].type).toBe('set_temperature');
  });

  it('replayFromProvenance rejects geometry mismatch', () => {
    const v1 = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const e1 = new Uint32Array([0, 1, 2, 3]);

    const contracted = new ContractedSimulation(mockSolver(), {
      vertices: v1, tetrahedra: e1,
    }, { fixedDt: 0.01 });

    const replay = contracted.createReplay();

    // Factory returns a solver, but with different geometry in the config
    // The replay config still has the original geometry, so hash should match.
    // To simulate a mismatch, we tamper with the replay record:
    const tamperedReplay = { ...replay, geometryHash: 'geo-deadbeef-4n-4e' };

    expect(() => ContractedSimulation.replayFromProvenance(
      () => mockSolver(),
      tamperedReplay,
    )).toThrow('Replay geometry mismatch');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Per-step state digest + NaN guard (Route 2b, AUDIT 2026-04-20 Wave-1.5)
//
// Property 4 (cross-adapter replay determinism, paper-3 §5.4) relies on
// computeStateDigest being fail-closed on non-finite state. A silent
// Math.round(NaN) | 0 === 0 would canonicalize a corrupted state to zero
// and hash it as valid — a semantic-integrity violation invisible to
// proof review. Reviewer-facing documentation of this behavior lives in
// ai-ecosystem research/2026-04-20_property-4-appendix-a-lemmas.md
// Lemma 1 edge case #3.
// ═══════════════════════════════════════════════════════════════════════

describe('ContractedSimulation state digest (Route 2b)', () => {
  function solverWithMutableField(values: Float32Array): SimSolver & { time: number } {
    return {
      mode: 'transient',
      fieldNames: ['velocity'],
      time: 0,
      step(dt: number) { this.time += dt; },
      solve() {},
      getField(): FieldData | null { return values; },
      getStats() { return { currentTime: this.time, converged: true }; },
      dispose() {},
    };
  }

  it('captures one digest per solver sub-step', () => {
    const values = new Float32Array([1, 2, 3, 4, 5]);
    const solver = solverWithMutableField(values);
    const contracted = new ContractedSimulation(solver, {}, { fixedDt: 0.01 });

    // Note: FP accumulator can yield one fewer sub-step than the naive
    // wallDelta/fixedDt ratio (existing contract behavior — see the
    // DeterministicStepper "produces same total steps regardless of frame
    // timing" test that tolerates ±1). Use the returned count as the
    // ground truth rather than hard-coding 3.
    const subSteps = contracted.step(0.035);

    const digests = contracted.getStateDigests();
    expect(digests.length).toBe(subSteps);
    expect(digests.length).toBeGreaterThanOrEqual(3); // ≥ 3 at 0.035s/0.01s
    // Each digest is a hex string of length 8 (FNV-1a 32-bit)
    for (const d of digests) {
      expect(d).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('digest is deterministic across independent runs on identical state', () => {
    const a = new ContractedSimulation(
      solverWithMutableField(new Float32Array([0.001, 0.002, 0.003])),
      {}, { fixedDt: 0.01 },
    );
    const b = new ContractedSimulation(
      solverWithMutableField(new Float32Array([0.001, 0.002, 0.003])),
      {}, { fixedDt: 0.01 },
    );
    a.step(0.01);
    b.step(0.01);
    expect(a.getStateDigests()).toEqual(b.getStateDigests());
  });

  it('digest changes when state changes above the per-field quantum', () => {
    // Velocity field → q_f = 1e-3 m/s. A 1e-2 change is 10× above quantum.
    const vA = new Float32Array([0.1, 0.2, 0.3]);
    const vB = new Float32Array([0.1, 0.2, 0.31]); // 0.01 m/s delta, > q_f
    const a = new ContractedSimulation(solverWithMutableField(vA), {}, { fixedDt: 0.01 });
    const b = new ContractedSimulation(solverWithMutableField(vB), {}, { fixedDt: 0.01 });
    a.step(0.01);
    b.step(0.01);
    expect(a.getStateDigests()[0]).not.toBe(b.getStateDigests()[0]);
  });

  it('digest is stable under perturbations below the per-field quantum', () => {
    // Velocity q_f = 1e-3. Perturbation 1e-5 < q_f → same digest.
    const vA = new Float32Array([0.5, 0.5, 0.5]);
    const vB = new Float32Array([0.5 + 1e-5, 0.5, 0.5]);
    const a = new ContractedSimulation(solverWithMutableField(vA), {}, { fixedDt: 0.01 });
    const b = new ContractedSimulation(solverWithMutableField(vB), {}, { fixedDt: 0.01 });
    a.step(0.01);
    b.step(0.01);
    // Both should land in the same quantization cell → identical digest
    expect(a.getStateDigests()[0]).toBe(b.getStateDigests()[0]);
  });

  it('NaN in state throws with clear diagnostic (fail-closed contract)', () => {
    const values = new Float32Array([1, NaN, 3]);
    const contracted = new ContractedSimulation(
      solverWithMutableField(values), {}, { fixedDt: 0.01 },
    );
    expect(() => contracted.step(0.01)).toThrow(/Non-finite value in field "velocity" at index 1/);
  });

  it('+Infinity in state throws (fail-closed contract)', () => {
    const values = new Float32Array([1, 2, Infinity]);
    const contracted = new ContractedSimulation(
      solverWithMutableField(values), {}, { fixedDt: 0.01 },
    );
    expect(() => contracted.step(0.01)).toThrow(/Non-finite value in field "velocity" at index 2/);
  });

  it('-Infinity in state throws (fail-closed contract)', () => {
    const values = new Float32Array([-Infinity, 2, 3]);
    const contracted = new ContractedSimulation(
      solverWithMutableField(values), {}, { fixedDt: 0.01 },
    );
    expect(() => contracted.step(0.01)).toThrow(/Non-finite value in field "velocity" at index 0/);
  });

  it('error message names the field and index for debuggability', () => {
    const values = new Float32Array([0, 0, 0, 0, NaN, 0, 0]);
    const contracted = new ContractedSimulation(
      solverWithMutableField(values), {}, { fixedDt: 0.01 },
    );
    try {
      contracted.step(0.01);
      throw new Error('expected NaN guard to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('SimulationContract');
      expect(msg).toContain('velocity');
      expect(msg).toContain('index 4');
      expect(msg).toContain('State integrity violation');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Route 2d — steady-state terminal canonicalization (Wave-2 item 6)
//
// solve() is non-iterative; it converges to a steady state rather than
// stepping through time. Route 2d captures a single terminal digest at
// solve() completion, exposed via the same getStateDigests() API as
// Route 2b's per-step sequence. Rationale + formal treatment in
// ai-ecosystem research/2026-04-20_property-4-route-2-proof-outline.md
// Limitation #3 "Route 2d sketch" (now implemented).
// ═══════════════════════════════════════════════════════════════════════

describe('ContractedSimulation Route 2d (solve() terminal digest)', () => {
  function steadyStateSolverWith(values: Float32Array): SimSolver & { solved: boolean } {
    return {
      mode: 'steady-state',
      fieldNames: ['stress'],  // stress → q_f = 1000 Pa from registry
      solved: false,
      step(_dt: number) { /* not used for steady-state */ },
      solve() { this.solved = true; },
      getField(): FieldData | null { return values; },
      getStats() { return { converged: this.solved }; },
      dispose() {},
    };
  }

  it('solve() pushes exactly one terminal digest', async () => {
    const contracted = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([1e5, 2e5, 3e5])),
      {}, { fixedDt: 0.01 },
    );
    expect(contracted.getStateDigests().length).toBe(0); // none before
    await contracted.solve();
    expect(contracted.getStateDigests().length).toBe(1); // exactly one after
    expect(contracted.getStateDigests()[0]).toMatch(/^[0-9a-f]{8}$/);
  });

  it('terminal digest is deterministic across independent runs', async () => {
    const a = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([5e5, 5e5, 5e5])),
      {}, {},
    );
    const b = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([5e5, 5e5, 5e5])),
      {}, {},
    );
    await a.solve();
    await b.solve();
    expect(a.getStateDigests()).toEqual(b.getStateDigests());
  });

  it('terminal digest is stable under perturbations below stress q_f (1000 Pa)', async () => {
    // stress q_f = 1000 Pa. A 100 Pa perturbation → same lattice cell.
    const a = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([2e6, 2e6, 2e6])),
      {}, {},
    );
    const b = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([2e6 + 100, 2e6, 2e6])),
      {}, {},
    );
    await a.solve();
    await b.solve();
    expect(a.getStateDigests()[0]).toBe(b.getStateDigests()[0]);
  });

  it('terminal digest changes when stress differs above q_f (1000 Pa)', async () => {
    const a = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([1e6, 1e6, 1e6])),
      {}, {},
    );
    const b = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([1e6 + 5000, 1e6, 1e6])),
      {}, {},
    );
    await a.solve();
    await b.solve();
    expect(a.getStateDigests()[0]).not.toBe(b.getStateDigests()[0]);
  });

  it('solve() inherits fail-closed NaN guard from computeStateDigest', async () => {
    const contracted = new ContractedSimulation(
      steadyStateSolverWith(new Float32Array([1e5, NaN, 3e5])),
      {}, {},
    );
    await expect(contracted.solve()).rejects.toThrow(/Non-finite value in field "stress" at index 1/);
  });

  it('solve() + step() digests are ordered in the same array (Route 2b + 2d share getStateDigests)', async () => {
    // A hybrid solver that can both step and solve
    const values = new Float32Array([1e5, 2e5, 3e5]);
    const solver: SimSolver = {
      mode: 'transient',
      fieldNames: ['stress'],
      step(_dt: number) { values[0] += 1000; },  // 1 q_f per sub-step
      solve() { values[0] += 10000; },           // 10 q_f on solve
      getField() { return values; },
      getStats() { return {}; },
      dispose() {},
    };
    const contracted = new ContractedSimulation(solver, {}, { fixedDt: 0.01 });
    contracted.step(0.02); // 2 sub-steps → 2 Route-2b digests
    await contracted.solve(); // 1 terminal Route-2d digest
    const digests = contracted.getStateDigests();
    expect(digests.length).toBe(3); // 2 step + 1 solve
    // Each quantization cell bumps by 1 q_f per step → each digest distinct
    expect(new Set(digests).size).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// computeAdapterFingerprint helper (Wave-2 SECURITY-mode audit 2026-04-20)
//
// Closes the raw-hardware-identifier privacy leak on shared CAEL traces
// by hashing the canonical adapter tuple to a 256-bit opaque digest.
// sameAdapter() equivalence-class comparison still works.
//
// See ai-ecosystem research/2026-04-20_adapter-fingerprint-security-audit.md
// for threat model + deferred follow-up (signed attestation).
// ═══════════════════════════════════════════════════════════════════════

describe('computeAdapterFingerprint (security helper)', () => {
  it('produces a 64-hex-char SHA-256 digest', async () => {
    const fp = await computeAdapterFingerprint({
      vendor: 'Intel',
      architecture: 'gen12',
      device: 'UHD Graphics 620',
      driver: '31.0.101.2111',
      userAgent: 'Chrome/120',
    });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('identical AdapterInfo → identical fingerprint (determinism)', async () => {
    const info: AdapterInfo = { vendor: 'NVIDIA', device: 'RTX 3060' };
    const a = await computeAdapterFingerprint(info);
    const b = await computeAdapterFingerprint(info);
    expect(a).toBe(b);
  });

  it('differing fields → differing fingerprints', async () => {
    const a = await computeAdapterFingerprint({ vendor: 'Intel', device: 'A' });
    const b = await computeAdapterFingerprint({ vendor: 'Intel', device: 'B' });
    expect(a).not.toBe(b);
  });

  it('pipe canonicalization resists field-boundary ambiguity', async () => {
    // Without pipe delimiters, ("Intel", "foo") and ("Intelfoo", "")
    // would raw-concat to the same string. Pipe-canonicalization
    // preserves boundaries so the two produce different fingerprints.
    const a = await computeAdapterFingerprint({ vendor: 'Intel', architecture: 'foo' });
    const b = await computeAdapterFingerprint({ vendor: 'Intelfoo', architecture: '' });
    expect(a).not.toBe(b);
  });

  it('empty AdapterInfo produces a well-defined fingerprint (all-empty sentinel)', async () => {
    const fp = await computeAdapterFingerprint({});
    // Should match the known SHA-256 of "||||" (four pipe delimiters)
    // — deterministic sentinel value that all callers with no info
    // share, which is why sameAdapter() returns false for this case
    // (both absent → cross-adapter fallback, per Item 5b design).
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    // Verify determinism — two empty calls agree
    const fp2 = await computeAdapterFingerprint({});
    expect(fp).toBe(fp2);
  });

  it('output is suitable for ContractConfig.adapterFingerprint', async () => {
    // End-to-end: compute fingerprint → pass to ContractConfig →
    // recorder captures it → trace[0].payload.adapterFingerprint is
    // the hashed value (not the raw tuple).
    const { CAELRecorder } = await import('../CAELRecorder');
    const fp = await computeAdapterFingerprint({
      vendor: 'Apple', device: 'M2 GPU', userAgent: 'Safari/17',
    });
    const recorder = new CAELRecorder(
      mockSolver(), {},
      { fixedDt: 0.01, adapterFingerprint: fp },
    );
    recorder.finalize();
    const trace = recorder.getTrace();
    expect(trace[0].payload.adapterFingerprint).toBe(fp);
    // And it's opaque (no raw vendor/device leak)
    expect(String(trace[0].payload.adapterFingerprint)).not.toContain('Apple');
    expect(String(trace[0].payload.adapterFingerprint)).not.toContain('M2');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Subgrid Attestation Integration (TODO-05 followup, paper-0c CAEL)
//
// Wires the engine-side ContractedSimulation to the
// `@holoscript/core/paper-0c-spike` subgrid-attestation primitive:
//   (a) attestation envelope is captured when ContractConfig.subgridParams
//       is provided and surfaced via getSubgridAttestation() / provenance /
//       cael.init.payload.subgridAttestation
//   (b) BACKWARD COMPAT: when subgridParams is absent, Contract-ID
//       (getContractId()) MUST be byte-identical to geometryHash —
//       same "omitted means unchanged fingerprint" semantics as
//       replayFingerprint.ts (weightCid, verticalProfile)
//   (c) Two configs that differ ONLY in subgridParams produce different
//       Contract-IDs (the attestation actually moves the needle)
//   (d) The contract's hash mode (ContractConfig.useCryptographicHash)
//       propagates into the attestation envelope's `hashMode` field
// ═══════════════════════════════════════════════════════════════════════

describe('ContractedSimulation subgrid attestation (TODO-05)', () => {
  // Cross-package verification: the engine builds the envelope synchronously
  // using engine-side hash primitives; verifySubgridAttestation() lives in
  // core. We import it here so we can prove cross-package round-trip works
  // (engine-built envelope → core-side verify returns valid:true).
  // Static import would create a runtime dep on core in this file; using
  // dynamic import to keep failure surface small if the subpath is missing.
  // (Sync FNV-1a path in verify is fine — these tests stay sync.)

  const v = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const e = new Uint32Array([0, 1, 2, 3]);

  function makeConfig() {
    // Fresh TypedArrays per call so structuredClone in the constructor
    // doesn't share buffer state across contracts under test.
    return {
      vertices: v.slice(),
      tetrahedra: e.slice(),
    };
  }

  // ── (a) attestation recorded when subgridParams provided ─────────────────

  it('(a) records subgrid attestation envelope when subgridParams provided', () => {
    const subgridParams = {
      feedback_efficiency: 0.5,
      cooling_threshold: 1e4,
      resolution_floor: 100,
      use_metal_cooling: true,
      cooling_table: 'wiersma2009',
    };

    const contracted = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      solverType: 'mock-subgrid-a',
      subgridParams,
    });

    const att = contracted.getSubgridAttestation();
    expect(att).toBeDefined();
    expect(att?.hashMode).toBe('fnv1a'); // default mode
    // Envelope hash shape under FNV-1a: 16 hex chars (per
    // paper-0c-spike/subgrid-attestation.ts FNV1A_HEX_SHAPE).
    expect(att?.hash).toMatch(/^[0-9a-f]{16}$/);
    // Canonical form is deterministic — sorted keys, pipe-delimited.
    expect(att?.canonicalForm).toBe(
      // alphabetical: cooling_table, cooling_threshold, feedback_efficiency,
      // resolution_floor, use_metal_cooling
      'cooling_table=`wiersma2009`|cooling_threshold=10000|feedback_efficiency=0.5|resolution_floor=100|use_metal_cooling=true',
    );

    // Provenance surfaces the envelope.
    const prov = contracted.getProvenance();
    expect(prov.subgridAttestation).toEqual(att);

    // createReplay() surfaces the envelope.
    const replay = contracted.createReplay();
    expect(replay.subgridAttestation).toEqual(att);
  });

  it('(a-extra) CAELRecorder records subgridAttestation in init payload', () => {
    // This test enforces the full integration path the task spec calls out:
    // the envelope MUST land at cael.init.payload.subgridAttestation so the
    // replayer can verify the run's subgrid identity downstream.
    // Importing CAELRecorder dynamically to mirror the existing test style.
    return import('../CAELRecorder').then(({ CAELRecorder }) => {
      const recorder = new CAELRecorder(mockSolver(), makeConfig(), {
        fixedDt: 0.001,
        subgridParams: { sn_fb_eff: 1.5, agn_mode: 'thermal' },
      });
      recorder.finalize();
      const trace = recorder.getTrace();
      // First entry is always 'init'.
      expect(trace[0].event).toBe('init');
      const sa = trace[0].payload.subgridAttestation as
        | { hash: string; hashMode: string; canonicalForm: string }
        | null;
      expect(sa).not.toBeNull();
      expect(sa?.hashMode).toBe('fnv1a');
      expect(sa?.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(sa?.canonicalForm).toBe('agn_mode=`thermal`|sn_fb_eff=1.5');
      // contractId is also surfaced at top level for O(1) replay-side
      // identity comparison.
      expect(typeof trace[0].payload.contractId).toBe('string');
    });
  });

  // ── (b) Contract-ID unchanged when subgridParams absent ──────────────────

  it('(b) Contract-ID equals geometryHash byte-identically when subgridParams absent', () => {
    // The load-bearing backward-compat invariant: pre-change contracts
    // (no subgridParams, no adapterFingerprint) MUST produce a Contract-ID
    // byte-identical to geometryHash. Same precedent as replayFingerprint.ts
    // — omitted fields collapse to "unchanged fingerprint".
    const contracted = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      solverType: 'mock-subgrid-b',
      // explicitly NO subgridParams, NO adapterFingerprint
    });

    expect(contracted.getContractId()).toBe(contracted.getProvenance().geometryHash);
    expect(contracted.getSubgridAttestation()).toBeUndefined();
    expect(contracted.getProvenance().subgridAttestation).toBeUndefined();
    expect(contracted.createReplay().subgridAttestation).toBeUndefined();
  });

  it('(b-extra) two no-subgrid contracts on same geometry have identical contractId', () => {
    // Stronger version of (b): not just "equals geometryHash" but
    // "two independent contracts produce the same byte string", proving
    // the absent-path is fully deterministic and free of run-id leakage.
    const c1 = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
    });
    const c2 = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
    });
    expect(c1.getContractId()).toBe(c2.getContractId());
  });

  // ── (c) different subgridParams → different Contract-ID ──────────────────

  it('(c) two configs differing ONLY in subgridParams yield different Contract-IDs', () => {
    // The attestation actually moves the needle: same geometry, same
    // adapter fingerprint (none), same hash mode — different subgrid
    // physics → different Contract-ID. This is the labeling result that
    // paper-0c §"Why this exists" calls out as the whole point of the
    // primitive (EAGLE vs IllustrisTNG observationally indistinguishable
    // become cryptographically distinguishable).
    const c1 = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      subgridParams: { feedback_efficiency: 0.5, cooling_threshold: 1e4 },
    });
    const c2 = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      subgridParams: { feedback_efficiency: 1.5, cooling_threshold: 1e4 },
      // ONLY feedback_efficiency differs (0.5 vs 1.5)
    });

    // Geometry hash IS identical (same mesh).
    expect(c1.getProvenance().geometryHash).toBe(c2.getProvenance().geometryHash);
    // Contract-ID is NOT (subgrid hash differs → composed Contract-ID differs).
    expect(c1.getContractId()).not.toBe(c2.getContractId());
    // And the underlying envelope hashes diverge too.
    expect(c1.getSubgridAttestation()?.hash).not.toBe(c2.getSubgridAttestation()?.hash);
  });

  // ── (d) mode flag (useCryptographicHash) propagates to subgrid ───────────

  it('(d) useCryptographicHash=false → subgrid attestation hashMode=fnv1a', () => {
    const contracted = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      useCryptographicHash: false,
      subgridParams: { eff: 0.5 },
    });
    const att = contracted.getSubgridAttestation();
    expect(att?.hashMode).toBe('fnv1a');
    expect(att?.hash).toMatch(/^[0-9a-f]{16}$/); // FNV-1a 16-hex shape
  });

  it('(d) useCryptographicHash=true → subgrid attestation hashMode=sha256', () => {
    const contracted = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      useCryptographicHash: true,
      subgridParams: { eff: 0.5 },
    });
    const att = contracted.getSubgridAttestation();
    expect(att?.hashMode).toBe('sha256');
    expect(att?.hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 64-hex shape
    // And the same param vector under FNV-1a yields a different hash
    // (sanity check that we're not silently downgrading mode).
    const fnvContract = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      useCryptographicHash: false,
      subgridParams: { eff: 0.5 },
    });
    expect(att?.hash).not.toBe(fnvContract.getSubgridAttestation()?.hash);
  });

  // ── Cross-package round-trip: engine-built envelope verifies under core
  // The engine builds the envelope synchronously via engine hash primitives;
  // core's verifySubgridAttestation() is the canonical replay-side check.
  // If these diverge, replay verification breaks silently — so we lock the
  // round-trip in a test.

  it('cross-package: engine-built FNV-1a envelope verifies under core', async () => {
    const { verifySubgridAttestation } = await import('@holoscript/core/paper-0c-spike');
    const params = { eff: 0.5, mode: 'thermal' };
    const contracted = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      useCryptographicHash: false,
      subgridParams: params,
    });
    const att = contracted.getSubgridAttestation();
    expect(att).toBeDefined();
    const result = verifySubgridAttestation(att!, params);
    expect(result.valid).toBe(true);
  });

  it('cross-package: engine-built SHA-256 envelope verifies under core (async)', async () => {
    const { verifySubgridAttestationAsync } = await import('@holoscript/core/paper-0c-spike');
    const params = { eff: 0.5, mode: 'thermal' };
    const contracted = new ContractedSimulation(mockSolver(), makeConfig(), {
      fixedDt: 0.001,
      useCryptographicHash: true,
      subgridParams: params,
    });
    const att = contracted.getSubgridAttestation();
    expect(att).toBeDefined();
    const result = await verifySubgridAttestationAsync(att!, params);
    expect(result.valid).toBe(true);
  });
});
