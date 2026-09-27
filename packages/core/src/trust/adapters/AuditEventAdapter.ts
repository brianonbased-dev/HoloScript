/**
 * AuditEventAdapter — map HoloScript AuditEvent to canonical TrustReceipt.
 *
 * Phase 2 adapter per ADR-2026-05-14.
 * Bridges the HoloScript core audit/provenance system into the trust spine.
 */

import { AuditEvent } from '../../audit/AuditLogger';
import { TrustReceiptInput, TrustPermissionEnvelope, stableTrustHash } from '../TrustReceipt';

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
  options: AuditEventAdapterOptions = {}
): TrustReceiptInput {
  const permissionEnvelope: TrustPermissionEnvelope = options.permissionEnvelope ?? 'read_only';

  const outcome =
    event.outcome === 'success' ? 'success' : event.outcome === 'failure' ? 'failure' : 'denied';

  return {
    schemaVersion: '1.0.0',
    recordedAt: event.timestamp.toISOString(),
    actor: {
      passportDid: options.passportDid ?? `did:holoscript:actor:${event.actorId}`,
      bindings: event.actorId ? [{ value: event.actorId, type: event.actorType }] : undefined,
    },
    permissionEnvelope,
    action: {
      name: event.action,
      resource: event.resource,
      outcome,
    },
    evidence: {
      // Digested, never verbatim. Until 2026-09-21 this stored
      // stableTrustStringify(event.metadata) — the canonical JSON itself — in a
      // field named `hashes`, so every consumer treating the array as opaque
      // digests was handed the metadata in cleartext. Run against the published
      // 8.7.0 build with medical metadata it returned a national ID number and a
      // diagnosis in plain text.
      //
      // Note what this fix does NOT do: a digest of low-entropy personal data is
      // guessable by enumeration, so this is pseudonymisation, not anonymisation.
      // Do not read it as permission to put personal data in event.metadata.
      hashes:
        event.metadata && Object.keys(event.metadata).length > 0
          ? [stableTrustHash(event.metadata)]
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
