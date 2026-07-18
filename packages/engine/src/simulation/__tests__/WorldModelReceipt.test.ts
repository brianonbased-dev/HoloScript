/**
 * WorldModelReceipt — bounded comparison-record pipeline test.
 *
 * Checks the implemented pipeline: StructuralSolverAdapter →
 * ContractedSimulation.solve() → generateWorldModelReceipt() →
 * receipt with a well-formed hash over the generator's compact projection.
 *
 * This test does not establish model quality, solver correctness, producer
 * authenticity, raw-field commitment, external anchoring, or novelty.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ContractedSimulation,
  type WorldModelReceipt,
  type LatentVector,
  type PhysicsState,
} from '../SimulationContract';
import { StructuralSolver, type StructuralConfig } from '../StructuralSolver';
import { StructuralSolverAdapter } from '../adapters/SolverAdapters';
import { RegularGrid3D } from '../RegularGrid3D';
import type { SimSolver, SolverMode, FieldData } from '../SimSolver';

function buildReceiptContract(useCryptographicHash = false): ContractedSimulation {
  const config: StructuralConfig = {
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    tetrahedra: new Uint32Array([0, 1, 2, 3]),
    material: {
      density: 1000,
      youngs_modulus: 1e6,
      poisson_ratio: 0.3,
      yield_strength: 1e8,
    },
    constraints: [{ id: 'fix', type: 'fixed', nodes: [0] }],
    loads: [{ id: 'load', type: 'point', nodeIndex: 3, force: [0, 0, 100] }],
  };
  const adapter = new StructuralSolverAdapter(new StructuralSolver(config));
  return new ContractedSimulation(adapter, config as unknown as Record<string, unknown>, {
    solverType: 'structural',
    useCryptographicHash,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorldModelReceipt — new types', () => {
  it('LatentVector, PhysicsState, Interval, WorldModelReceipt are exported from SimulationContract', async () => {
    // Import the types — if this compiles the types are exported correctly.
    const mod = await import('../SimulationContract');
    expect(mod.ContractedSimulation).toBeDefined();
    // Type-level check: WorldModelReceipt fields are present at runtime via a mock
    const mockReceipt: WorldModelReceipt = {
      jepa_prediction: { values: new Float32Array([1, 2]), dim: 2, encoderId: 'test', simTime: 0 },
      solver_ground_truth: {
        simTime: 0,
        fields: {},
        geometryHash: 'abc',
        contractId: 'cid',
        solverType: 'structural',
      },
      delta_error: 1.5,
      confidence_bound: {
        lo: 1.4,
        hi: 1.6,
        kind: 'uncalibrated-numerical-envelope',
      },
      predictionKind: 'caller-supplied',
      receiptId: 'wmr-test',
      issuedAt: new Date().toISOString(),
      receiptHash: 'wmr-abc',
      hashMode: 'fnv1a',
      contractId: 'cid',
    };
    expect(mockReceipt.delta_error).toBe(1.5);
    expect(mockReceipt.confidence_bound.lo).toBeLessThanOrEqual(mockReceipt.delta_error);
    expect(mockReceipt.confidence_bound.hi).toBeGreaterThanOrEqual(mockReceipt.delta_error);
  });
});

describe('WorldModelReceipt — ContractedSimulation.generateWorldModelReceipt()', () => {
  it('generates receipt with default predictor after steady-state solve()', async () => {
    const contracted = buildReceiptContract();

    await contracted.solve();
    const receipt = await contracted.generateWorldModelReceipt();

    // receiptId format
    expect(receipt.receiptId).toMatch(/^wmr-\d+-[a-z0-9]+$/);

    // delta_error is non-negative
    expect(receipt.delta_error).toBeGreaterThanOrEqual(0);

    // confidence_bound brackets delta_error
    expect(receipt.confidence_bound.lo).toBeLessThanOrEqual(receipt.delta_error);
    expect(receipt.confidence_bound.hi).toBeGreaterThanOrEqual(receipt.delta_error);
    expect(receipt.confidence_bound.kind).toBe('uncalibrated-numerical-envelope');
    expect(receipt.confidence_bound.coverage).toBeUndefined();

    // receipt is tied to the correct contract
    expect(receipt.contractId).toBe(contracted.getContractId());

    // receiptHash is present and prefixed
    expect(receipt.receiptHash).toMatch(/^wmr-/);

    // hashMode matches contract
    expect(receipt.hashMode).toBe('fnv1a');
    expect(receipt.predictionKind).toBe('zero-baseline');

    // solver_ground_truth is populated
    expect(receipt.solver_ground_truth.geometryHash).toBe(
      contracted.getContractId() !== '' ? receipt.contractId : ''
    );
    expect(receipt.solver_ground_truth.solverType).toBe('structural');
    expect(receipt.solver_ground_truth.simTime).toBeGreaterThanOrEqual(0);
  });

  it('labels a caller-supplied JEPAPredictor code path', async () => {
    // Exercise the exported JEPAPredictor implementation as a caller-supplied
    // callback. This is code-path coverage, not evidence of a trained model.
    // JEPAPredictor is re-exported from the @holoscript/core ./traits barrel
    // (traits/index.ts). The deep path ./traits/JEPAPredictor is NOT in core's
    // package.json exports field, so importing it directly throws a resolution
    // error that bricks the whole suite at transform time. Import from the
    // exported barrel instead. (W.673-class export-surface gap.)
    const { JEPAPredictor } = await import('@holoscript/core/traits');

    const contracted = buildReceiptContract();

    await contracted.solve();

    // Real JEPAPredictor instance (as would be used inside jepa_objective handler)
    const predictor = new JEPAPredictor({ latentDim: 4, condDim: 0 });

    // Custom predictor callback that exercises the real AI Lab predictor
    const customPredictor = (state: PhysicsState): LatentVector => {
      // Synthetic context embedding derived from solver state (in real use this comes from EmbeddingTrait / JEPAObjective)
      const ctx = new Float32Array(4);
      const firstField = Object.values(state.fields)[0];
      if (firstField) {
        for (let i = 0; i < Math.min(4, firstField.length); i++) ctx[i] = firstField[i] * 0.01;
      }
      const { predicted } = predictor.forward(ctx, null);
      return {
        values: predicted,
        dim: 4,
        encoderId: 'jepa-continuum-v1',
        simTime: state.simTime,
      };
    };

    // Custom encoder: project state to 4-dim by taking first 4 field values
    const customEncoder = (state: PhysicsState): Float32Array => {
      const out = new Float32Array(4);
      const firstField = Object.values(state.fields)[0];
      if (firstField) {
        for (let i = 0; i < Math.min(4, firstField.length); i++) {
          out[i] = firstField[i];
        }
      }
      return out;
    };

    const receipt = await contracted.generateWorldModelReceipt(customPredictor, customEncoder);

    expect(receipt.jepa_prediction.encoderId).toBe('jepa-continuum-v1');
    expect(receipt.jepa_prediction.dim).toBe(4);
    expect(receipt.predictionKind).toBe('caller-supplied');
    expect(receipt.delta_error).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(receipt.delta_error)).toBe(true);
  });

  it('rejects a caller-supplied predictor without an explicit state encoder', async () => {
    const contracted = buildReceiptContract();
    await contracted.solve();

    const predictor = (state: PhysicsState): LatentVector => ({
      values: new Float32Array([0, 0]),
      dim: 2,
      encoderId: 'caller-space',
      simTime: state.simTime,
    });

    await expect(contracted.generateWorldModelReceipt(predictor)).rejects.toThrow(
      'requires an explicit stateEncoder'
    );
  });

  it('rejects mismatched caller-declared latent dimensions', async () => {
    const contracted = buildReceiptContract();
    await contracted.solve();

    const predictor = (state: PhysicsState): LatentVector => ({
      values: new Float32Array([0, 0]),
      dim: 2,
      encoderId: 'caller-space',
      simTime: state.simTime,
    });
    const encoder = (): Float32Array => new Float32Array([0, 0, 0]);

    await expect(contracted.generateWorldModelReceipt(predictor, encoder)).rejects.toThrow(
      'latent dimension mismatch'
    );
  });

  it('rejects non-finite, unlabeled, or wrong-timestep predictions', async () => {
    const contracted = buildReceiptContract();
    await contracted.solve();
    const encoder = (): Float32Array => new Float32Array([0, 0]);
    const prediction = (
      state: PhysicsState,
      overrides: Partial<LatentVector> = {}
    ): LatentVector => ({
      values: new Float32Array([0, 0]),
      dim: 2,
      encoderId: 'caller-space',
      simTime: state.simTime,
      ...overrides,
    });

    await expect(
      contracted.generateWorldModelReceipt(
        (state) => prediction(state, { values: new Float32Array([Number.NaN, 0]) }),
        encoder
      )
    ).rejects.toThrow('values must all be finite');
    await expect(
      contracted.generateWorldModelReceipt((state) => prediction(state, { encoderId: '' }), encoder)
    ).rejects.toThrow('encoderId must be a non-empty string');
    await expect(
      contracted.generateWorldModelReceipt(
        (state) => prediction(state, { simTime: state.simTime + 1 }),
        encoder
      )
    ).rejects.toThrow('does not match reference simTime');
  });

  it('SHA-256 receipt has sha-prefixed hash', async () => {
    const contracted = buildReceiptContract(true);

    await contracted.solve();
    const receipt = await contracted.generateWorldModelReceipt();

    expect(receipt.hashMode).toBe('sha256');
    expect(receipt.receiptHash).toMatch(/^wmr-sha-/);
  });
});

// ── RegularGrid3D field-capture regression (task_1780461151627_cr7d) ──────────
//
// generateWorldModelReceipt() captures solver.getField() output. SimSolver's
// FieldData union includes RegularGrid3D, which is NOT a TypedArray and has no
// .slice(). Before the fix, the capture loop assumed every field was a typed
// array and called field.slice(), throwing "field.slice is not a function" for
// any grid-bearing solver (RD concentration_grid_*, thermal temperature_grid,
// acoustic/FDTD pressure_grid, etc.). This mock reproduces the exact crash
// scenario with the minimum surface: a SimSolver whose only field is a grid.

class GridFieldSolverMock implements SimSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames = ['concentration_grid_a', 'scalar_field'] as const;
  private readonly grid: RegularGrid3D;
  private readonly scalar: Float32Array;
  constructor() {
    this.grid = new RegularGrid3D([3, 3, 3], [1, 1, 1], 1);
    // Seed deterministic, finite values so the digest path is exercised.
    for (let i = 0; i < this.grid.data.length; i++) this.grid.data[i] = i * 0.5;
    this.scalar = new Float32Array([1, 2, 3, 4]);
  }
  step(): void {}
  solve(): void {}
  getField(name: string): FieldData | null {
    if (name === 'concentration_grid_a') return this.grid; // RegularGrid3D — the crash trigger
    if (name === 'scalar_field') return this.scalar;
    return null;
  }
  getStats(): Record<string, unknown> {
    return { converged: true };
  }
  dispose(): void {}
}

class EmptyFieldSolverMock implements SimSolver {
  readonly mode: SolverMode = 'steady';
  readonly fieldNames = ['empty'] as const;
  step(): void {}
  solve(): void {}
  getField(): FieldData | null {
    return new Float32Array();
  }
  getStats(): Record<string, unknown> {
    return { converged: true };
  }
  dispose(): void {}
}

describe('WorldModelReceipt — RegularGrid3D field capture (regression cr7d)', () => {
  it('fails closed when the solver exposes no non-empty reference field', async () => {
    const contracted = new ContractedSimulation(
      new EmptyFieldSolverMock(),
      {},
      { solverType: 'empty-reference', useCryptographicHash: false }
    );
    await contracted.solve();

    await expect(contracted.generateWorldModelReceipt()).rejects.toThrow(
      'requires at least one non-empty typed-array solver field'
    );
  });

  it('does NOT throw "field.slice is not a function" for a grid-bearing solver', async () => {
    const solver = new GridFieldSolverMock();
    const contracted = new ContractedSimulation(
      solver,
      {},
      { solverType: 'reaction-diffusion', useCryptographicHash: false }
    );

    await contracted.solve();

    // Before the fix this threw; assert it resolves to a valid receipt instead.
    const receipt = await contracted.generateWorldModelReceipt();
    expect(receipt.receiptId).toMatch(/^wmr-\d+-[a-z0-9]+$/);
    expect(receipt.delta_error).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(receipt.delta_error)).toBe(true);
  });

  it('captures the RegularGrid3D field as a flat typed array in ground truth', async () => {
    const solver = new GridFieldSolverMock();
    const contracted = new ContractedSimulation(
      solver,
      {},
      { solverType: 'reaction-diffusion', useCryptographicHash: true }
    );

    await contracted.solve();
    const receipt = await contracted.generateWorldModelReceipt();

    const fields = receipt.solver_ground_truth.fields;
    // Grid field is unwrapped to its flat .data buffer (3*3*3*1 = 27 cells).
    expect(fields.concentration_grid_a).toBeDefined();
    expect(fields.concentration_grid_a.length).toBe(27);
    // Plain typed-array field is still captured alongside the grid field.
    expect(fields.scalar_field).toBeDefined();
    expect(fields.scalar_field.length).toBe(4);
    // Capture is a copy, not a live reference into the solver's buffer.
    expect(fields.concentration_grid_a).not.toBe(solver.getField('concentration_grid_a'));
    // SHA-256 over the compact receipt projection is well-formed. Raw field
    // values are not committed by the current projection.
    expect(receipt.receiptHash).toMatch(/^wmr-sha-[0-9a-f]{64}$/);
  });
});

describe('WorldModelReceipt — isolated serialization boundary', () => {
  it('round-trips a scope-labeled receipt without mutating tracked fixtures', async () => {
    const contracted = buildReceiptContract(true);

    await contracted.solve();
    const receipt = await contracted.generateWorldModelReceipt();

    // Serialize receipt (fields only — no raw Float32Array; replace with summaries)
    const serializable = {
      receiptId: receipt.receiptId,
      issuedAt: receipt.issuedAt,
      receiptHash: receipt.receiptHash,
      hashMode: receipt.hashMode,
      predictionKind: receipt.predictionKind,
      contractId: receipt.contractId,
      delta_error: receipt.delta_error,
      confidence_bound: receipt.confidence_bound,
      jepa_prediction: {
        encoderId: receipt.jepa_prediction.encoderId,
        dim: receipt.jepa_prediction.dim,
        simTime: receipt.jepa_prediction.simTime,
        values_summary: {
          length: receipt.jepa_prediction.values.length,
          l2_norm: Math.sqrt(
            Array.from(receipt.jepa_prediction.values).reduce((s, v) => s + v * v, 0)
          ),
        },
      },
      solver_ground_truth: {
        simTime: receipt.solver_ground_truth.simTime,
        solverType: receipt.solver_ground_truth.solverType,
        geometryHash: receipt.solver_ground_truth.geometryHash,
        contractId: receipt.solver_ground_truth.contractId,
        fields: Object.fromEntries(
          Object.entries(receipt.solver_ground_truth.fields).map(([k, v]) => [
            k,
            { length: v.length, l2_norm: Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0)) },
          ])
        ),
      },
      paper26_candidate: {
        title: 'Verifiable World Models via Simulation Contracts',
        status: 'open_research_question',
        receipt_scope:
          'Hashed comparison metadata; raw solver values, authentication, anchoring, and novelty are not established.',
        tvcg_boundary:
          'Above current TVCG submission scope (Trust by Construction, external review 2026-05-17).',
        anchoring_status: 'not_performed_by_this_test',
      },
    };

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-model-receipt-'));
    try {
      const outPath = path.join(tempDir, 'world-model-receipt.json');
      fs.writeFileSync(outPath, JSON.stringify(serializable, null, 2), 'utf-8');

      const loaded = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
      expect(loaded.receiptHash).toBe(receipt.receiptHash);
      expect(loaded.delta_error).toBe(receipt.delta_error);
      expect(loaded.predictionKind).toBe('zero-baseline');
      expect(loaded.paper26_candidate.status).toBe('open_research_question');
      expect(loaded.paper26_candidate.anchoring_status).toBe('not_performed_by_this_test');

      // A well-formed SHA-256 checksum is not evidence that an external anchor
      // or producer-authentication step occurred.
      expect(loaded.receiptHash).toMatch(/^wmr-sha-[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
