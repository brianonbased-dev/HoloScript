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

  it('falls back to synthetic DID when no actorId', () => {
    const input = auditEventToReceiptInput(makeEvent({ actorId: '' }));
    expect(input.actor.passportDid).toBe('did:holoscript:actor:');
    expect(input.actor.bindings).toBeUndefined();
  });
});
