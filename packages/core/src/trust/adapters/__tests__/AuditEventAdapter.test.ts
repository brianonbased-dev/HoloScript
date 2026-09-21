import { describe, it, expect } from 'vitest';
import { auditEventToReceiptInput } from '../AuditEventAdapter';
import { AuditEvent } from '../../../audit/AuditLogger';

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'audit_001',
    timestamp: new Date('2026-05-14T10:00:00Z'),
    tenantId: 't1',
    actorId: 'actor_42',
    actorType: 'agent',
    action: 'deploy',
    resource: 'simulation.world',
    outcome: 'success',
    metadata: { version: '1.0.0' },
    ...overrides,
  } as AuditEvent;
}

describe('AuditEventAdapter', () => {
  it('maps a success event to a TrustReceiptInput', () => {
    const input = auditEventToReceiptInput(makeEvent());
    expect(input.schemaVersion).toBe('1.0.0');
    expect(input.recordedAt).toBe('2026-05-14T10:00:00.000Z');
    expect(input.actor.passportDid).toBe('did:holoscript:actor:actor_42');
    expect(input.actor.bindings).toEqual([{ value: 'actor_42', type: 'agent' }]);
    expect(input.permissionEnvelope).toBe('read_only');
    expect(input.action).toEqual({
      name: 'deploy',
      resource: 'simulation.world',
      outcome: 'success',
    });
    expect(input.evidence.hashes.length).toBe(1);
    expect(input.evidence.nonce).toBe('audit_001');
    expect(input.algebraicTrust.layer1Strategy).toBe('strict_error');
    expect(input.algebraicTrust.layer2HistoryRef).toBe('audit/audit_001');
    expect(input.storage?.syncState).toBe('local_only');
  });

  it('maps failure outcome', () => {
    const input = auditEventToReceiptInput(makeEvent({ outcome: 'failure' }));
    expect(input.action.outcome).toBe('failure');
  });

  it('maps denied outcome', () => {
    const input = auditEventToReceiptInput(makeEvent({ outcome: 'denied' }));
    expect(input.action.outcome).toBe('denied');
  });

  it('uses provided passportDid', () => {
    const input = auditEventToReceiptInput(makeEvent(), {
      passportDid: 'did:custom:abc',
    });
    expect(input.actor.passportDid).toBe('did:custom:abc');
  });

  it('uses provided layer3OracleRef', () => {
    const input = auditEventToReceiptInput(makeEvent(), {
      layer3OracleRef: 'oracle/sim/7',
    });
    expect(input.algebraicTrust.layer3OracleRef).toBe('oracle/sim/7');
  });

  it('uses provided permissionEnvelope override', () => {
    const input = auditEventToReceiptInput(makeEvent(), {
      permissionEnvelope: 'guarded_execute',
    });
    expect(input.permissionEnvelope).toBe('guarded_execute');
  });

  it('handles empty metadata', () => {
    const input = auditEventToReceiptInput(makeEvent({ metadata: {} }));
    expect(input.evidence.hashes).toEqual([]);
  });

  // Regression for the 2026-09-21 defect: evidence.hashes carried the canonical
  // JSON of metadata in cleartext. Reproduced against the published 8.7.0 build.
  // This asserts the leak itself, not just the shape, so it goes red if anyone
  // puts a readable value back in the field.
  it('digests metadata instead of storing it in cleartext', () => {
    const secret = {
      nationalId: '078-05-1120',
      diagnosis: 'stage II adenocarcinoma',
      note: 'patient declined treatment',
    };
    const input = auditEventToReceiptInput(makeEvent({ metadata: secret }));

    expect(input.evidence.hashes).toHaveLength(1);
    expect(input.evidence.hashes[0]).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Nothing recoverable anywhere in the receipt, not only in the hashes field.
    const serialized = JSON.stringify(input);
    for (const value of Object.values(secret)) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).not.toContain('nationalId');
    expect(serialized).not.toContain('diagnosis');
  });

  it('gives the same digest for the same metadata and a different one otherwise', () => {
    const a = auditEventToReceiptInput(makeEvent({ metadata: { k: 'v' } }));
    const b = auditEventToReceiptInput(makeEvent({ metadata: { k: 'v' } }));
    const c = auditEventToReceiptInput(makeEvent({ metadata: { k: 'w' } }));
    expect(a.evidence.hashes[0]).toBe(b.evidence.hashes[0]);
    expect(a.evidence.hashes[0]).not.toBe(c.evidence.hashes[0]);
  });

  it('falls back to synthetic DID when no actorId', () => {
    const input = auditEventToReceiptInput(makeEvent({ actorId: '' }));
    expect(input.actor.passportDid).toBe('did:holoscript:actor:');
    expect(input.actor.bindings).toBeUndefined();
  });
});
