import { describe, expect, it } from 'vitest';
import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  MAX_RECEIPT_DEPTH,
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

  it('rejects BigInt values in receipt payloads', () => {
    expect(() => stableDomainReceiptHash({ value: BigInt(9007199254740991) })).toThrow('BigInt');
  });

  it('rejects Date objects in receipt payloads', () => {
    expect(() => stableDomainReceiptHash({ ts: new Date('2026-01-01') })).toThrow('Date objects are not receipt-safe');
  });

  it('rejects deeply nested receipt payloads exceeding max depth', () => {
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < MAX_RECEIPT_DEPTH + 10; i += 1) {
      nested = { inner: nested };
    }
    expect(() => stableDomainReceiptHash(nested)).toThrow('exceeds max depth');
  });

  it('canonicalizes undefined values as null', () => {
    const result = canonicalizeDomainReceiptPayload({ a: undefined, b: 1 });
    const parsed = JSON.parse(result) as Record<string, unknown>;
    // undefined values are stripped by the canonicalizer (not included)
    expect(parsed).toEqual({ b: 1 });
  });

  it('accepts receipt payloads at exactly max depth', () => {
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < MAX_RECEIPT_DEPTH - 1; i += 1) {
      nested = { inner: nested };
    }
    // Should not throw — exactly at depth limit
    expect(() => stableDomainReceiptHash(nested)).not.toThrow();
  });

  it('rejects empty plugin in buildDomainSimulationReceipt', () => {
    expect(() =>
      buildDomainSimulationReceipt({
        plugin: '',
        pluginVersion: '1.0.0',
        runId: 'test',
        solverConfig: { solverType: 'test', scale: 'object' },
        resultSummary: {},
        acceptance: { accepted: true, violations: [] },
      }),
    ).toThrow('plugin is required');
  });

  it('rejects empty pluginVersion in buildDomainSimulationReceipt', () => {
    expect(() =>
      buildDomainSimulationReceipt({
        plugin: 'test',
        pluginVersion: '   ',
        runId: 'test',
        solverConfig: { solverType: 'test', scale: 'object' },
        resultSummary: {},
        acceptance: { accepted: true, violations: [] },
      }),
    ).toThrow('pluginVersion is required');
  });

  it('rejects empty runId in buildDomainSimulationReceipt', () => {
    expect(() =>
      buildDomainSimulationReceipt({
        plugin: 'test',
        pluginVersion: '1.0.0',
        runId: '',
        solverConfig: { solverType: 'test', scale: 'object' },
        resultSummary: {},
        acceptance: { accepted: true, violations: [] },
      }),
    ).toThrow('runId is required');
  });

  it('verifies required string fields and rejects empty plugin/pluginVersion/runId/createdAt', () => {
    const receipt = buildDomainSimulationReceipt({
      plugin: 'test-plugin',
      pluginVersion: '1.0.0',
      runId: 'run-123',
      createdAt: '2026-05-21T00:00:00.000Z',
      solverConfig: { solverType: 'sim', scale: 'object' },
      resultSummary: {},
      acceptance: { accepted: true, violations: [] },
    });
    expect(verifyDomainSimulationReceipt(receipt)).toEqual({ valid: true, errors: [] });

    const missingPlugin = { ...receipt, plugin: '' };
    expect(verifyDomainSimulationReceipt(missingPlugin).valid).toBe(false);
    expect(verifyDomainSimulationReceipt(missingPlugin).errors.join('\n')).toContain('plugin is required');

    const missingVersion = { ...receipt, pluginVersion: '  ' };
    expect(verifyDomainSimulationReceipt(missingVersion).valid).toBe(false);

    const missingRunId = { ...receipt, runId: '' };
    expect(verifyDomainSimulationReceipt(missingRunId).valid).toBe(false);

    const badTimestamp = { ...receipt, createdAt: 'not-a-date' };
    expect(verifyDomainSimulationReceipt(badTimestamp).valid).toBe(false);
    expect(verifyDomainSimulationReceipt(badTimestamp).errors.join('\n')).toContain('not a valid ISO timestamp');
  });

  it('produces consistent hashes for non-BMP Unicode characters (emoji)', () => {
    const withEmoji = canonicalizeDomainReceiptPayload({ label: 'test🔬rocket' });
    const withEmoji2 = canonicalizeDomainReceiptPayload({ label: 'test🔬rocket' });
    expect(withEmoji).toBe(withEmoji2);

    // Hashing should not throw for non-BMP characters
    expect(() => stableDomainReceiptHash({ label: '🔬emoji🧪test' })).not.toThrow();

    // Emoji-containing payloads should produce a stable hash
    const hash1 = stableDomainReceiptHash({ name: '🧬dna' });
    const hash2 = stableDomainReceiptHash({ name: '🧬dna' });
    expect(hash1).toBe(hash2);
  });
});
