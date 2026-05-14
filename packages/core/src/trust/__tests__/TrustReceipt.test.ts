import { describe, it, expect } from 'vitest';
import {
  validateTrustReceipt,
  TrustReceipt,
} from '../TrustReceipt';

describe('TrustReceipt', () => {
  const validReceipt: TrustReceipt = {
    receiptId: 'rec_001',
    schemaVersion: '1.0.0',
    recordedAt: '2026-05-14T09:00:00Z',
    actor: {
      passportDid: 'did:holoscript:abc123',
      bindings: ['lane_1', '0xabc'],
    },
    permissionEnvelope: 'guarded_execute',
    action: {
      name: 'deploy',
      resource: 'packages/core/src/trust',
      outcome: 'success',
    },
    evidence: {
      hashes: ['sha256:abc'],
      nonce: 'n1',
    },
    algebraicTrust: {
      layer1Strategy: 'authority_weighted',
      layer2HistoryRef: 'audit/001',
      layer3OracleRef: 'sim/001',
    },
    storage: {
      syncState: 'synced',
      localLedgerRef: 'ledger/001',
    },
  };

  it('validates a complete receipt', () => {
    const result = validateTrustReceipt(validReceipt);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-object', () => {
    const result = validateTrustReceipt(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('object');
  });

  it('rejects missing receiptId', () => {
    const r = { ...validReceipt, receiptId: undefined } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing receiptId');
  });

  it('rejects missing actor.passportDid', () => {
    const r = { ...validReceipt, actor: { bindings: [] } } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing actor.passportDid');
  });

  it('rejects missing permissionEnvelope', () => {
    const r = { ...validReceipt, permissionEnvelope: undefined } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing permissionEnvelope');
  });

  it('rejects missing action.name', () => {
    const r = { ...validReceipt, action: { resource: 'x', outcome: 'success' } } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing action.name');
  });

  it('rejects missing action.resource', () => {
    const r = { ...validReceipt, action: { name: 'x', outcome: 'success' } } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing action.resource');
  });

  it('rejects missing action.outcome', () => {
    const r = { ...validReceipt, action: { name: 'x', resource: 'y' } } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing action.outcome');
  });

  it('rejects missing evidence.hashes', () => {
    const r = { ...validReceipt, evidence: {} } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing evidence.hashes');
  });

  it('rejects missing algebraicTrust.layer1Strategy', () => {
    const r = { ...validReceipt, algebraicTrust: {} } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing algebraicTrust.layer1Strategy');
  });

  it('rejects missing storage.syncState', () => {
    const r = { ...validReceipt, storage: {} } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing storage.syncState');
  });

  it('accepts minimal optional-less receipt', () => {
    const minimal: TrustReceipt = {
      receiptId: 'rec_min',
      schemaVersion: '1.0.0',
      recordedAt: '2026-05-14T09:00:00Z',
      actor: { passportDid: 'did:holoscript:min' },
      permissionEnvelope: 'read_only',
      action: { name: 'inspect', resource: 'trust', outcome: 'success' },
      evidence: { hashes: [] },
      algebraicTrust: { layer1Strategy: 'strict_error' },
      storage: { syncState: 'local_only' },
    };
    const result = validateTrustReceipt(minimal);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
