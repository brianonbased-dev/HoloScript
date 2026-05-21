import { describe, expect, it } from 'vitest';
import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
  canonicalizeDomainReceiptPayload,
  stableDomainReceiptHash,
  verifyDomainSimulationReceipt,
} from '../DomainSimulationReceipt';

describe('DomainSimulationReceipt', () => {
  it('canonicalizes objects with stable key order', () => {
    const a = canonicalizeDomainReceiptPayload({ b: 2, a: { z: true, y: null } });
    const b = canonicalizeDomainReceiptPayload({ a: { y: null, z: true }, b: 2 });

    expect(a).toBe(b);
    expect(stableDomainReceiptHash({ value: 1, job_id: 'job-1' })).toBe(
      stableDomainReceiptHash({ job_id: 'job-1', value: 1 }),
    );
  });

  it('builds and verifies a CAEL-ready domain simulation receipt', () => {
    const receipt = buildDomainSimulationReceipt({
      plugin: 'energy-grid',
      pluginVersion: '0.1.0',
      runId: 'receipt-test',
      createdAt: '2026-05-21T00:00:00.000Z',
      modelId: 'grid-1',
      solverConfig: {
        solverType: 'dc-power-flow',
        scale: 'grid',
        baseMva: 100,
      },
      resultSummary: {
        converged: true,
        maxLineLoadingRatio: 0.7,
      },
      acceptance: { accepted: true, violations: [] },
    });

    expect(receipt.schema).toBe(DOMAIN_SIMULATION_RECEIPT_SCHEMA);
    expect(receipt.cael).toEqual({
      version: 'cael.v1',
      event: 'energy-grid.simulation_receipt',
      solverType: 'energy-grid.dc-power-flow',
    });
    expect(receipt.payloadHash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(verifyDomainSimulationReceipt(receipt)).toEqual({ valid: true, errors: [] });
  });

  it('detects stale payload hashes after tampering', () => {
    const receipt = buildDomainSimulationReceipt({
      plugin: 'fashion',
      pluginVersion: '1.0.0',
      runId: 'receipt-test',
      createdAt: '2026-05-21T00:00:00.000Z',
      solverConfig: {
        solverType: 'fabric-simulation',
        scale: 'object',
      },
      resultSummary: {
        converged: true,
      },
      acceptance: { accepted: true, violations: [] },
    });
    const tampered = {
      ...receipt,
      resultSummary: { converged: false },
    };

    const verification = verifyDomainSimulationReceipt(tampered);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join('\n')).toContain('payloadHash mismatch');
  });

  it('rejects non-finite receipt payload values', () => {
    expect(() => stableDomainReceiptHash({ value: Number.NaN })).toThrow('Non-finite');
    expect(() => stableDomainReceiptHash({ value: Number.POSITIVE_INFINITY })).toThrow('Non-finite');
  });
});
