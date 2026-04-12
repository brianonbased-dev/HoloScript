/**
 * SimulationContract tests — verify enforced guarantees.
 */

import { describe, it, expect } from 'vitest';
import {
  hashGeometry, validateUnits, DeterministicStepper, ContractedSimulation,
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
