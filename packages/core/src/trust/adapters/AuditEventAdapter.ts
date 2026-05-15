/**
 * AuditEventAdapter — map HoloScript AuditEvent to canonical TrustReceipt.
 *
 * Phase 2 adapter per ADR-2026-05-14.
 * Bridges the HoloScript core audit/provenance system into the trust spine.
 */

import { AuditEvent } from '../../audit/AuditLogger';
import {
  TrustReceiptInput,
  TrustPermissionEnvelope,
  stableTrustStringify,
} from '../TrustReceipt';

export interface AuditEventAdapterOptions {
  /** Canonical Passport DID for the actor. Falls back to a synthetic DID. */
  passportDid?: string;
  /** Layer-3 oracle reference for simulation-related events. */
  layer3OracleRef?: string;
  /** Explicit permission envelope override. Defaults to read_only for audit events. */
  permissionEnvelope?: TrustPermissionEnvelope;
}

/**
 * Convert an AuditEvent into a TrustReceiptInput suitable for appending
 * to a TrustLedger.
 */
export function auditEventToReceiptInput(
  event: AuditEvent,
  options: AuditEventAdapterOptions = {},
): TrustReceiptInput {
  const permissionEnvelope: TrustPermissionEnvelope = options.permissionEnvelope ?? 'read_only';

  const outcome =
    event.outcome === 'success'
      ? 'success'
      : event.outcome === 'failure'
        ? 'failure'
        : 'denied';

  return {
    schemaVersion: '1.0.0',
    recordedAt: event.timestamp.toISOString(),
    actor: {
      passportDid: options.passportDid ?? `did:holoscript:actor:${event.actorId}`,
      bindings: event.actorId
        ? [{ value: event.actorId, type: event.actorType }]
        : undefined,
    },
    permissionEnvelope,
    action: {
      name: event.action,
      resource: event.resource,
      outcome,
    },
    evidence: {
      hashes:
        event.metadata && Object.keys(event.metadata).length > 0
          ? [stableTrustStringify(event.metadata)]
          : [],
      nonce: event.id,
    },
    algebraicTrust: {
      layer1Strategy: 'strict_error',
      layer2HistoryRef: `audit/${event.id}`,
      layer3OracleRef: options.layer3OracleRef,
    },
    storage: { syncState: 'local_only' },
  };
}
