/**
 * Semantic carry-over verifier — record-only (no solver run required).
 *
 * Covers the PROB-003 lineage primitive: a continuation reference is provably
 * tied to the prior run's verified terminal state. Test the false case for
 * every field (F.043) — forging any one of them must make verification fail.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyContinuation,
  type ReceiptContinuation,
  type SimulationProvenance,
} from '../SimulationContract';

function makePriorProvenance(overrides: Partial<SimulationProvenance> = {}): SimulationProvenance {
  return {
    runId: 'run-prior-001',
    geometryHash: 'geom-aaa',
    contractId: 'cid-prior-aaa',
    scale: 'continuum',
    // Minimal envelope shape is fine for this verifier — verifyContinuation
    // does not read scaleEnvelope.
    scaleEnvelope: { scale: 'continuum', tolerance: 1e-2 } as SimulationProvenance['scaleEnvelope'],
    solverType: 'test-solver',
    config: {},
    fixedDt: 1e-3,
    totalSteps: 100,
    totalSimTime: 0.1,
    wallTimeMs: 12,
    interactions: [],
    finalStats: {},
    verified: true,
    deterministic: true,
    platformVersion: '6.1.0',
    createdAt: '2026-05-27T00:00:00.000Z',
    terminalStateDigest: 'digest-final-zzz',
    ...overrides,
  };
}

function makeContinuation(overrides: Partial<ReceiptContinuation> = {}): ReceiptContinuation {
  return {
    priorReceiptHash: 'receipt-hash-xyz',
    priorContractId: 'cid-prior-aaa',
    priorRunId: 'run-prior-001',
    seedStateDigest: 'digest-final-zzz',
    ...overrides,
  };
}

describe('verifyContinuation (PROB-003 lineage primitive)', () => {
  const prior = { provenance: makePriorProvenance(), receiptHash: 'receipt-hash-xyz' };

  it('accepts a valid continuation that matches the prior verified terminal state', () => {
    const r = verifyContinuation(makeContinuation(), prior);
    expect(r.valid).toBe(true);
  });

  it('rejects when the prior run is not contract-verified', () => {
    const r = verifyContinuation(makeContinuation(), {
      provenance: makePriorProvenance({ verified: false }),
      receiptHash: 'receipt-hash-xyz',
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not contract-verified/);
  });

  it('rejects when the prior provenance has no terminalStateDigest', () => {
    const noDigest = makePriorProvenance();
    delete (noDigest as { terminalStateDigest?: string }).terminalStateDigest;
    const r = verifyContinuation(makeContinuation(), { provenance: noDigest, receiptHash: 'receipt-hash-xyz' });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/terminalStateDigest/);
  });

  it('rejects when priorReceiptHash is forged', () => {
    const r = verifyContinuation(makeContinuation({ priorReceiptHash: 'receipt-hash-FAKE' }), prior);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/priorReceiptHash/);
  });

  it('rejects when priorContractId is forged', () => {
    const r = verifyContinuation(makeContinuation({ priorContractId: 'cid-FAKE' }), prior);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/priorContractId/);
  });

  it('rejects when priorRunId is forged', () => {
    const r = verifyContinuation(makeContinuation({ priorRunId: 'run-FAKE' }), prior);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/priorRunId/);
  });

  it('rejects when seedStateDigest does not match the prior terminalStateDigest (the SEMANTIC check)', () => {
    const r = verifyContinuation(makeContinuation({ seedStateDigest: 'digest-FAKE' }), prior);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/seedStateDigest/);
  });
});
