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
      bindings: [
        { value: 'lane_1', type: 'lane' },
        { value: '0xabc1234567890123456789012345678901234567', type: 'wallet', verifiedAt: '2026-05-14T09:00:00Z' },
      ],
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
      commandHash: '0xdeadbeef',
    },
    algebraicTrust: {
      layer1Strategy: 'authority_weighted',
      layer2HistoryRef: 'audit/001',
      layer3OracleRef: 'sim/001',
    },
    links: {
      parentReceiptIds: ['rec_parent'],
      taskId: 'task_123',
      commit: 'abc123',
    },
    storage: {
      syncState: 'synced',
      localLedgerRef: 'ledger/001',
      redactedFields: [],
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

  it('rejects non-canonical permissionEnvelope', () => {
    const r = { ...validReceipt, permissionEnvelope: 'admin' } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Non-canonical permissionEnvelope: admin');
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

  it('rejects missing algebraicTrust.layer2HistoryRef', () => {
    const r = { ...validReceipt, algebraicTrust: { layer1Strategy: 'authority_weighted' } } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing algebraicTrust.layer2HistoryRef');
  });

  it('rejects missing algebraicTrust.layer3OracleRef for simulation receipts', () => {
    const r = {
      ...validReceipt,
      action: { name: 'simulate', resource: 'physics', outcome: 'success' },
      algebraicTrust: { layer1Strategy: 'authority_weighted', layer2HistoryRef: 'audit/001' },
    } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing algebraicTrust.layer3OracleRef for simulation/digital-twin receipts');
  });

  it('rejects wallet binding without evidence.commandHash', () => {
    const r = {
      ...validReceipt,
      actor: {
        passportDid: 'did:holoscript:abc123',
        bindings: [{ value: '0xabc1234567890123456789012345678901234567', type: 'wallet' }],
      },
      evidence: { hashes: ['sha256:abc'] },
    } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Wallet binding requires evidence.commandHash (transaction evidence)');
  });

  it('rejects synced receipt without redactedFields', () => {
    const r = { ...validReceipt, storage: { syncState: 'synced' } } as unknown as TrustReceipt;
    const result = validateTrustReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing storage.redactedFields for synced receipts');
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
      algebraicTrust: { layer1Strategy: 'strict_error', layer2HistoryRef: 'audit/min' },
      storage: { syncState: 'local_only' },
    };
    const result = validateTrustReceipt(minimal);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
