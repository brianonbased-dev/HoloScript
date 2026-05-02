/**
 * Unit tests for identity/audit-log.ts — Phase 5 Tier 2 audit logging.
 *
 * @module holomesh/identity/__tests__/audit-log.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashPublicKey,
  redactPrivateKey,
  redactForLogging,
  appendAuditEvent,
  onAuditEvent,
  queryAuditEvents,
  auditKeyAccess,
  auditKeyAccessDenied,
  auditKeyGenerated,
  auditKeyRotated,
  auditSigningPerformed,
  _resetAuditLogForTests,
  _getEventBufferForTests,
} from '../audit-log';

beforeEach(() => {
  _resetAuditLogForTests();
});

describe('hashPublicKey', () => {
  it('returns a 16-char hex string', () => {
    const hash = hashPublicKey('ed25519:abc123');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces deterministic output for the same input', () => {
    const a = hashPublicKey('test-key');
    const b = hashPublicKey('test-key');
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    const a = hashPublicKey('key-a');
    const b = hashPublicKey('key-b');
    expect(a).not.toBe(b);
  });
});

describe('redactPrivateKey', () => {
  it('returns a REDACTED placeholder', () => {
    const result = redactPrivateKey('some-private-key-material');
    expect(result).toContain('[REDACTED:');
    expect(result).not.toContain('some-private-key-material');
  });
});

describe('redactForLogging', () => {
  it('redacts keys matching private/secret/key/password/token', () => {
    const obj = {
      userId: 'user-1',
      privateKey: 'secret-stuff',
      password: 'hunter2',
      token: 'bearer-xyz',
      publicKey: 'safe-to-show',
      metadata: { nested_secret: 'hidden', safe: 'visible' },
    };

    const result = redactForLogging(obj) as Record<string, unknown>;

    expect(result.userId).toBe('user-1');
    expect(result.privateKey).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.publicKey).toBe('safe-to-show');
  });

  it('handles arrays', () => {
    const obj = [{ key: 'secret', name: 'public' }];
    const result = redactForLogging(obj) as Array<Record<string, unknown>>;
    expect(result[0].key).toBe('[REDACTED]');
    expect(result[0].name).toBe('public');
  });

  it('handles null and primitives', () => {
    expect(redactForLogging(null)).toBe(null);
    expect(redactForLogging(42)).toBe(42);
    expect(redactForLogging('hello')).toBe('hello');
  });
});

describe('appendAuditEvent', () => {
  it('appends an event with a generated ID', () => {
    const event = appendAuditEvent({
      type: 'key_generated',
      timestamp: new Date().toISOString(),
      userId: 'user-1',
      publicKeyHash: 'abcd1234efgh5678',
      accessedBy: 'system',
      metadata: {},
      severity: 'info',
    });

    expect(event.id).toMatch(/^audit-/);
    expect(event.type).toBe('key_generated');
    expect(event.userId).toBe('user-1');
  });

  it('notifies subscribers', () => {
    const sub = vi.fn();
    onAuditEvent(sub);

    appendAuditEvent({
      type: 'key_accessed',
      timestamp: new Date().toISOString(),
      userId: 'user-2',
      publicKeyHash: 'abcd1234efgh5678',
      accessedBy: 'caller',
      metadata: {},
      severity: 'info',
    });

    expect(sub).toHaveBeenCalledTimes(1);
    expect(sub.mock.calls[0][0].type).toBe('key_accessed');
  });

  it('subscriber errors do not prevent other subscribers', () => {
    const badSub = vi.fn(() => { throw new Error('boom'); });
    const goodSub = vi.fn();
    onAuditEvent(badSub);
    onAuditEvent(goodSub);

    appendAuditEvent({
      type: 'key_accessed',
      timestamp: new Date().toISOString(),
      userId: 'user-3',
      publicKeyHash: 'abcd1234efgh5678',
      accessedBy: 'caller',
      metadata: {},
      severity: 'info',
    });

    expect(badSub).toHaveBeenCalledTimes(1);
    expect(goodSub).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe removes the subscriber', () => {
    const sub = vi.fn();
    const unsub = onAuditEvent(sub);
    unsub();

    appendAuditEvent({
      type: 'key_accessed',
      timestamp: new Date().toISOString(),
      userId: 'user-4',
      publicKeyHash: 'abcd1234efgh5678',
      accessedBy: 'caller',
      metadata: {},
      severity: 'info',
    });

    expect(sub).toHaveBeenCalledTimes(0);
  });
});

describe('queryAuditEvents', () => {
  it('filters by userId', () => {
    auditKeyGenerated({
      userId: 'user-a',
      publicKeyHash: 'aaa',
      provisionedBy: 'system',
    });
    auditKeyGenerated({
      userId: 'user-b',
      publicKeyHash: 'bbb',
      provisionedBy: 'system',
    });

    const results = queryAuditEvents({ userId: 'user-a' });
    expect(results).toHaveLength(1);
    expect(results[0].userId).toBe('user-a');
  });

  it('filters by type', () => {
    auditKeyGenerated({ userId: 'user-1', publicKeyHash: 'a', provisionedBy: 'sys' });
    auditKeyAccess({ userId: 'user-1', publicKeyHash: 'a', accessedBy: 'sys', purpose: 'sign' });

    const results = queryAuditEvents({ type: 'key_accessed' });
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('key_accessed');
  });

  it('limits results', () => {
    for (let i = 0; i < 10; i++) {
      auditKeyAccess({ userId: `user-${i}`, publicKeyHash: 'a', accessedBy: 'sys', purpose: 'sign' });
    }

    const results = queryAuditEvents({ limit: 3 });
    expect(results).toHaveLength(3);
  });
});

describe('convenience helpers', () => {
  it('auditKeyAccess creates a key_accessed event', () => {
    const event = auditKeyAccess({
      userId: 'user-1',
      publicKeyHash: 'abcd',
      accessedBy: 'signing-service',
      sourceIp: '1.2.3.4',
      purpose: 'custodial_signing',
    });

    expect(event.type).toBe('key_accessed');
    expect(event.severity).toBe('info');
    expect(event.metadata.purpose).toBe('custodial_signing');
  });

  it('auditKeyAccessDenied creates a key_access_denied event', () => {
    const event = auditKeyAccessDenied({
      userId: 'user-2',
      publicKeyHash: 'efgh',
      accessedBy: 'attacker',
      reason: 'not_authorized',
    });

    expect(event.type).toBe('key_access_denied');
    expect(event.severity).toBe('warn');
  });

  it('auditKeyGenerated creates a key_generated event', () => {
    const event = auditKeyGenerated({
      userId: 'user-3',
      publicKeyHash: 'ijkl',
      provisionedBy: 'system',
      derivationPath: "m/44'/60'/2'/0/1",
    });

    expect(event.type).toBe('key_generated');
    expect(event.metadata.derivationPath).toBe("m/44'/60'/2'/0/1");
  });

  it('auditKeyRotated creates a key_rotated event', () => {
    const event = auditKeyRotated({
      userId: 'user-4',
      oldPublicKeyHash: 'old',
      newPublicKeyHash: 'new',
      rotatedBy: 'system',
    });

    expect(event.type).toBe('key_rotated');
    expect(event.metadata.oldPublicKeyHash).toBe('old');
  });

  it('auditSigningPerformed creates a signing_performed event', () => {
    const event = auditSigningPerformed({
      userId: 'user-5',
      publicKeyHash: 'mnop',
      signedBy: 'signing-service',
      payloadType: 'request_body',
    });

    expect(event.type).toBe('signing_performed');
    expect(event.metadata.payloadType).toBe('request_body');
  });
});