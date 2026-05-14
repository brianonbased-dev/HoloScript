import { describe, it, expect } from 'vitest';
import {
  TrustLedger,
  InMemoryTrustStorage,
  NdjsonTrustStorage,
  TrustQueryFilter,
} from '../TrustLedger';
import { TrustReceipt, TrustReceiptInput } from '../TrustReceipt';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeInput(overrides: Partial<TrustReceiptInput> = {}): TrustReceiptInput {
  return {
    schemaVersion: '1.0.0',
    recordedAt: '2026-05-14T09:00:00Z',
    actor: { passportDid: 'did:holoscript:abc123' },
    permissionEnvelope: 'read_only',
    action: { name: 'inspect', resource: 'trust', outcome: 'success' },
    evidence: { hashes: ['sha256:abc'] },
    algebraicTrust: { layer1Strategy: 'strict_error', layer2HistoryRef: 'audit/001' },
    storage: { syncState: 'local_only' },
    ...overrides,
  };
}

describe('TrustLedger', () => {
  it('appends and queries a receipt', () => {
    const ledger = new TrustLedger();
    const receipt = ledger.append(makeInput());
    expect(receipt.receiptId).toMatch(/^trust_/);
    expect(receipt.storage.localLedgerRef).toBeDefined();
    expect(receipt.storage.syncState).toBe('local_only');

    const results = ledger.query({ passportDid: 'did:holoscript:abc123' });
    expect(results).toHaveLength(1);
    expect(results[0].receiptId).toBe(receipt.receiptId);
  });

  it('rejects invalid receipts', () => {
    const ledger = new TrustLedger();
    expect(() => ledger.append(makeInput({ permissionEnvelope: 'invalid' as any }))).toThrow(
      'Invalid trust receipt'
    );
  });

  it('queries by action name and outcome', () => {
    const ledger = new TrustLedger();
    ledger.append(makeInput({ action: { name: 'deploy', resource: 'x', outcome: 'success' } }));
    ledger.append(makeInput({ action: { name: 'deploy', resource: 'y', outcome: 'failure' } }));
    ledger.append(makeInput({ action: { name: 'inspect', resource: 'z', outcome: 'success' } }));

    expect(ledger.query({ actionName: 'deploy' })).toHaveLength(2);
    expect(ledger.query({ outcome: 'failure' })).toHaveLength(1);
  });

  it('queries by time range', () => {
    const ledger = new TrustLedger();
    ledger.append(makeInput({ recordedAt: '2026-01-01T00:00:00Z' }));
    ledger.append(makeInput({ recordedAt: '2026-06-01T00:00:00Z' }));
    expect(ledger.query({ since: '2026-05-01T00:00:00Z' })).toHaveLength(1);
    expect(ledger.query({ until: '2026-05-01T00:00:00Z' })).toHaveLength(1);
  });

  it('queries by parent receipt id', () => {
    const ledger = new TrustLedger();
    const parent = ledger.append(makeInput());
    ledger.append(makeInput({ links: { parentReceiptIds: [parent.receiptId] } }));
    expect(ledger.query({ parentReceiptId: parent.receiptId })).toHaveLength(1);
  });

  it('supports pagination', () => {
    const ledger = new TrustLedger();
    for (let i = 0; i < 5; i++) {
      ledger.append(makeInput({ action: { name: `a${i}`, resource: 'r', outcome: 'success' } }));
    }
    expect(ledger.query({ limit: 2 })).toHaveLength(2);
    expect(ledger.query({ offset: 3 })).toHaveLength(2);
  });

  it('verifies hash chain integrity', () => {
    const ledger = new TrustLedger();
    ledger.append(makeInput());
    ledger.append(makeInput());
    expect(ledger.verifyChain().valid).toBe(true);
  });

  it('uses canonical chain hashes across equivalent key orders', () => {
    const ledger = new TrustLedger();
    const base = makeInput();
    const reordered: TrustReceiptInput = {
      storage: { syncState: 'local_only' },
      algebraicTrust: {
        layer2HistoryRef: base.algebraicTrust.layer2HistoryRef,
        layer1Strategy: base.algebraicTrust.layer1Strategy,
      },
      evidence: { hashes: [...base.evidence.hashes] },
      action: {
        outcome: base.action.outcome,
        resource: base.action.resource,
        name: base.action.name,
      },
      permissionEnvelope: base.permissionEnvelope,
      actor: { passportDid: base.actor.passportDid },
      recordedAt: base.recordedAt,
      schemaVersion: base.schemaVersion,
    };

    const first = ledger.append(base);
    const second = ledger.append(reordered);

    expect(second.receiptId).toBe(first.receiptId);
    expect(ledger.verifyChain().valid).toBe(true);
  });

  it('detects broken chain', () => {
    const storage = new InMemoryTrustStorage();
    const ledger = new TrustLedger(storage);
    ledger.append(makeInput());
    const bad = {
      ...storage.getAll()[0],
      storage: { ...storage.getAll()[0].storage, localLedgerRef: 'tampered' },
    } as TrustReceipt;
    storage.append(bad);
    const result = ledger.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });

  it('redacts receipts for sync', () => {
    const ledger = new TrustLedger();
    const receipt = ledger.append(makeInput({ evidence: { hashes: ['h1'], nonce: 'n1' } }));
    const redacted = ledger.redact(receipt, ['evidence.nonce']);
    expect(redacted.evidence.nonce).toBeUndefined();
    expect(redacted.storage.syncState).toBe('redacted_sync');
    expect(redacted.storage.redactedFields).toEqual(['evidence.nonce']);
  });

  it('persists to NDJSON and reloads', () => {
    const tmpFile = path.join(os.tmpdir(), `trust-ledger-test-${Date.now()}.ndjson`);
    try {
      const ledger = new TrustLedger(new NdjsonTrustStorage(tmpFile));
      ledger.append(makeInput());
      ledger.append(makeInput());

      const ledger2 = new TrustLedger(new NdjsonTrustStorage(tmpFile));
      expect(ledger2.query()).toHaveLength(2);
      expect(ledger2.verifyChain().valid).toBe(true);
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
  });
});
