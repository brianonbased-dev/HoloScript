/**
 * QuantumProvenance tests — the discriminator's contract, enforced.
 */
import { describe, it, expect } from 'vitest';

import {
  QUANTUM_PROVENANCE_SPEC,
  validateQuantumProvenance,
  assertQuantumProvenance,
} from '../src/QuantumProvenance';

const qpu = {
  spec: QUANTUM_PROVENANCE_SPEC,
  class: 'qpu_measured',
  backend: 'ibm_pittsburgh',
  job_id: 'd894hagp0eas73do4vt0',
  shots: 256,
  quantum_seconds: 47.71,
  error_vs_classical_reference: { value_mHa: 2976.71, reference: 'FCI via n2_uccsd_receipt.json' },
};

describe('validateQuantumProvenance', () => {
  it('accepts a complete qpu_measured block (the real N2 IBM run)', () => {
    expect(validateQuantumProvenance(qpu, { qpuUsed: true })).toEqual({ ok: true, errors: [] });
  });

  it('rejects qpu_measured without backend or job_id — an unnamed QPU claim never validates', () => {
    const v1 = validateQuantumProvenance({ ...qpu, backend: '' });
    expect(v1.ok).toBe(false);
    expect(v1.errors.join()).toMatch(/backend/);
    const v2 = validateQuantumProvenance({ ...qpu, job_id: undefined });
    expect(v2.ok).toBe(false);
    expect(v2.errors.join()).toMatch(/job_id/);
  });

  it('accepts a failed hardware run: shots null with a note, error waived with a reason', () => {
    const failed = {
      ...qpu,
      backend: 'ibm_boston',
      job_id: 'd893980p0eas73do3khg',
      shots: null,
      shots_note: 'job killed by max-execution-time before producing a result',
      quantum_seconds: 32,
      error_vs_classical_reference: { not_applicable: 'no energy produced — NISQ-intractability is the datum' },
    };
    expect(validateQuantumProvenance(failed).ok).toBe(true);
  });

  it('rejects shots=null without a note, and a bare error object', () => {
    expect(validateQuantumProvenance({ ...qpu, shots: null }).ok).toBe(false);
    expect(validateQuantumProvenance({ ...qpu, error_vs_classical_reference: {} }).ok).toBe(false);
  });

  it('catches class↔qpu_used contradictions in both directions', () => {
    expect(validateQuantumProvenance(qpu, { qpuUsed: false }).errors.join()).toMatch(/contradicts/);
    const analytic = { spec: QUANTUM_PROVENANCE_SPEC, class: 'analytic_reference', method: 'Pauli grouping' };
    expect(validateQuantumProvenance(analytic, { qpuUsed: true }).errors.join()).toMatch(/contradicts/);
    expect(validateQuantumProvenance(analytic, { qpuUsed: false }).ok).toBe(true);
  });

  it('requires identity/method on the non-QPU classes', () => {
    expect(validateQuantumProvenance({ spec: QUANTUM_PROVENANCE_SPEC, class: 'simulator' }).ok).toBe(false);
    expect(
      validateQuantumProvenance({ spec: QUANTUM_PROVENANCE_SPEC, class: 'simulator', simulator: 'cuquantum-custatevec' }).ok
    ).toBe(true);
    expect(
      validateQuantumProvenance({ spec: QUANTUM_PROVENANCE_SPEC, class: 'quantum_inspired_classical' }).ok
    ).toBe(false);
  });

  it('rejects unknown classes, wrong specs, and non-objects', () => {
    expect(validateQuantumProvenance(null).ok).toBe(false);
    expect(validateQuantumProvenance({ spec: QUANTUM_PROVENANCE_SPEC, class: 'quantum_ish' }).ok).toBe(false);
    expect(validateQuantumProvenance({ spec: 'quantum-provenance/v0', class: 'simulator', simulator: 'x' }).ok).toBe(false);
  });

  it('assertQuantumProvenance throws so an invalid receipt never ships', () => {
    expect(() => assertQuantumProvenance({ spec: QUANTUM_PROVENANCE_SPEC, class: 'qpu_measured' })).toThrow(
      /invalid quantum_provenance/
    );
    expect(assertQuantumProvenance(qpu).class).toBe('qpu_measured');
  });
});
