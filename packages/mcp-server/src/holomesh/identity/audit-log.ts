/**
 * Append-Only Audit Log for Tier 2 Custodial Key Access — Phase 5.
 *
 * Every private-key decryption and custodial signing operation MUST emit an
 * audit event. Events are append-only (never mutated or deleted) and are
 * persisted to an external sink via subscribers wired at server startup.
 *
 * Per ADR §"Server-side key management (Q2 approved)":
 *   - "Audit log of every private-key access — append-only, separate store,
 *     external retention"
 *   - "Logs never record decrypted keys (redaction at structured-log-middleware
 *     level; separate audit log for key-access events)"
 *
 * This module provides:
 *   1. Structured event types for key lifecycle events
 *   2. Redaction helpers that NEVER expose raw key material
 *   3. An in-memory buffer + subscriber system for real-time and persistent sinks
 *   4. A query API for compliance auditing (who accessed what key, when)
 *
 * Future DB backend: swap the in-memory buffer for a real append-only store
 * (PostgreSQL with a trigger-only table, DynamoDB Streams, or CloudWatch
 * Logs) by reimplementing `append` and `query`. The subscriber interface
 * stays the same.
 *
 * @module holomesh/identity/audit-log
 */

// ── Event types ───────────────────────────────────────────────────────────

/** Every category of auditable event in the custodial key lifecycle. */
export type AuditEventType =
  | 'key_generated'          // New keypair created for a user
  | 'key_accessed'           // Private key decrypted for signing
  | 'key_rotated'            // Old key retired, new key provisioned
  | 'signing_performed'      // Custodial signing on behalf of user
  | 'key_export_prepared'   // Self-custody export package created
  | 'key_export_finalized'  // Self-custody migration completed
  | 'key_access_denied';    // Attempted access by unauthorized caller

/** The severity level for audit events. Redacted logs use `info` for
 *  routine operations and `warn`/`error` for denied or anomalous access. */
export type AuditSeverity = 'info' | 'warn' | 'error';

/** Structured audit event. All fields are safe to persist — no raw key material. */
export interface AuditEvent {
  /** Monotonic event ID (unique within a server instance). */
  id: string;
  /** The event category. */
  type: AuditEventType;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The user whose key was involved. */
  userId: string;
  /** Public key hash (SHA-256, first 16 hex chars) — never the full public key. */
  publicKeyHash: string;
  /** Who initiated the access. For server-initiated operations this is
   *  `system:custodial-signing-service`; for user-initiated it's the
   *  authenticated agent/user ID. */
  accessedBy: string;
  /** The source IP of the request, when available. */
  sourceIp?: string;
  /** Structured metadata about the operation. Never contains key material. */
  metadata: Record<string, unknown>;
  /** Severity for log routing. */
  severity: AuditSeverity;
}

/** Subscriber callback — receives every committed event. */
export type AuditSubscriber = (event: AuditEvent) => void;

// ── Redaction helpers ─────────────────────────────────────────────────────

/**
 * Compute a truncated SHA-256 hash of a public key for audit references.
 * Returns the first 16 hex characters (64 bits of entropy), which is more
 * than enough for unique identification in audit logs without exposing the
 * full key.
 */
export function hashPublicKey(publicKey: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  return createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
}

/**
 * Redact a private key for logging. Returns a fixed-length placeholder
 * that indicates the key existed but never reveals any bits of it.
 *
 * Convention: `[REDACTED:8-chars-of-pubkey-hash]` so auditors can correlate
 * with the public key hash without seeing any private material.
 */
export function redactPrivateKey(privateKeyHint: string): string {
  return `[REDACTED:${hashPublicKey(privateKeyHint)}]`;
}

/**
 * Redact an entire object for structured logging. Recursively walks the
 * object and replaces any value whose key contains 'private', 'secret',
 * 'key' (as a standalone word), 'password', or 'token' with '[REDACTED]'.
 *
 * This is the structured-log-middleware redaction referenced in the ADR.
 * It's intentionally broad — false positives (redacting a 'keyboard' field)
 * are far less dangerous than false negatives (leaking a private key).
 */
export function redactForLogging(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  // Substring-match redaction — any key containing these words gets redacted.
  // This catches privateKey, secretKey, password, token, privkey, etc.
  const REDACTED_SUBSTRING = /private|secret|password|token|privkey|priv_key/i;
  // Exact-match — 'key' as a standalone key name (not publicKey, not apiKey, etc.)
  const EXACT_REDACTED = /^(key)$/i;

  if (Array.isArray(obj)) {
    return obj.map(redactForLogging);
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (EXACT_REDACTED.test(k) || REDACTED_SUBSTRING.test(k)) {
      result[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      result[k] = redactForLogging(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── Audit log store ────────────────────────────────────────────────────────

let _eventCounter = 0;
const _eventBuffer: AuditEvent[] = [];
const _subscribers: AuditSubscriber[] = [];

/** Generate a monotonic event ID within this server instance. */
function nextEventId(): string {
  _eventCounter += 1;
  return `audit-${Date.now()}-${_eventCounter}`;
}

/**
 * Append an audit event. The event is committed to the in-memory buffer
 * and all subscribers are notified synchronously. A subscriber that throws
 * will NOT roll back the append — the event is authoritative once appended.
 * Subscriber errors are logged to stderr but do not prevent other
 * subscribers from receiving the event.
 */
export function appendAuditEvent(event: Omit<AuditEvent, 'id'>): AuditEvent {
  const full: AuditEvent = {
    ...event,
    id: nextEventId(),
  };
  _eventBuffer.push(full);

  for (const sub of _subscribers) {
    try {
      sub(full);
    } catch (err) {
      console.error(
        '[audit-log] subscriber threw on event %s: %s',
        full.id,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return full;
}

/**
 * Subscribe to audit events. Returns an unsubscribe function.
 * Subscribers are called synchronously after each append.
 */
export function onAuditEvent(sub: AuditSubscriber): () => void {
  _subscribers.push(sub);
  return () => {
    const idx = _subscribers.indexOf(sub);
    if (idx >= 0) _subscribers.splice(idx, 1);
  };
}

/**
 * Query audit events by filter criteria. Returns events in chronological
 * order (oldest first). Useful for compliance auditing.
 */
export function queryAuditEvents(filter: {
  userId?: string;
  type?: AuditEventType;
  since?: string; // ISO 8601 timestamp
  limit?: number;
}): AuditEvent[] {
  let results = _eventBuffer;

  if (filter.userId) {
    results = results.filter((e) => e.userId === filter.userId);
  }
  if (filter.type) {
    results = results.filter((e) => e.type === filter.type);
  }
  if (filter.since) {
    const sinceMs = Date.parse(filter.since);
    if (!Number.isNaN(sinceMs)) {
      results = results.filter((e) => Date.parse(e.timestamp) >= sinceMs);
    }
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(-filter.limit);
  }

  return results;
}

/**
 * Convenience: emit a key_accessed event when a private key is decrypted
 * for a signing operation. This is the most common audit event and the one
 * the ADR specifically calls out.
 */
export function auditKeyAccess(params: {
  userId: string;
  publicKeyHash: string;
  accessedBy: string;
  sourceIp?: string;
  purpose: string;
}): AuditEvent {
  return appendAuditEvent({
    type: 'key_accessed',
    timestamp: new Date().toISOString(),
    userId: params.userId,
    publicKeyHash: params.publicKeyHash,
    accessedBy: params.accessedBy,
    sourceIp: params.sourceIp,
    metadata: { purpose: params.purpose },
    severity: 'info',
  });
}

/**
 * Convenience: emit a key_access_denied event when an unauthorized caller
 * attempts to access a private key.
 */
export function auditKeyAccessDenied(params: {
  userId: string;
  publicKeyHash: string;
  accessedBy: string;
  sourceIp?: string;
  reason: string;
}): AuditEvent {
  return appendAuditEvent({
    type: 'key_access_denied',
    timestamp: new Date().toISOString(),
    userId: params.userId,
    publicKeyHash: params.publicKeyHash,
    accessedBy: params.accessedBy,
    sourceIp: params.sourceIp,
    metadata: { reason: params.reason },
    severity: 'warn',
  });
}

/**
 * Convenience: emit a key_generated event when a new keypair is provisioned.
 */
export function auditKeyGenerated(params: {
  userId: string;
  publicKeyHash: string;
  provisionedBy: string;
  derivationPath?: string;
}): AuditEvent {
  return appendAuditEvent({
    type: 'key_generated',
    timestamp: new Date().toISOString(),
    userId: params.userId,
    publicKeyHash: params.publicKeyHash,
    accessedBy: params.provisionedBy,
    metadata: {
      derivationPath: params.derivationPath ?? 'platform-root',
    },
    severity: 'info',
  });
}

/**
 * Convenience: emit a key_rotated event when a user's keypair is rotated.
 */
export function auditKeyRotated(params: {
  userId: string;
  oldPublicKeyHash: string;
  newPublicKeyHash: string;
  rotatedBy: string;
}): AuditEvent {
  return appendAuditEvent({
    type: 'key_rotated',
    timestamp: new Date().toISOString(),
    userId: params.userId,
    publicKeyHash: params.newPublicKeyHash,
    accessedBy: params.rotatedBy,
    metadata: {
      oldPublicKeyHash: params.oldPublicKeyHash,
    },
    severity: 'info',
  });
}

/**
 * Convenience: emit a signing_performed event when the custodial service
 * signs on behalf of a user.
 */
export function auditSigningPerformed(params: {
  userId: string;
  publicKeyHash: string;
  signedBy: string;
  payloadType: string;
}): AuditEvent {
  return appendAuditEvent({
    type: 'signing_performed',
    timestamp: new Date().toISOString(),
    userId: params.userId,
    publicKeyHash: params.publicKeyHash,
    accessedBy: params.signedBy,
    metadata: {
      payloadType: params.payloadType,
    },
    severity: 'info',
  });
}

// ── Test helpers ───────────────────────────────────────────────────────────

/** Test-only: reset the in-memory buffer and counter. */
export function _resetAuditLogForTests(): void {
  _eventBuffer.length = 0;
  _subscribers.length = 0;
  _eventCounter = 0;
}

/** Test-only: read the in-memory buffer directly. */
export function _getEventBufferForTests(): readonly AuditEvent[] {
  return _eventBuffer.slice();
}