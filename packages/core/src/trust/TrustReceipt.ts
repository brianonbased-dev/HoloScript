/**
 * TrustReceipt — canonical cross-surface trust receipt.
 *
 * Derived from ADR-2026-05-14 (Trust Primitives Decision Record).
 * Every cross-surface trust receipt must extend this shape.
 *
 * @see HoloScript/docs/architecture/2026-05-14_trust-primitives-decision-record.md
 */

export type TrustReceiptStatus =
  | 'success'
  | 'failure'
  | 'denied'
  | 'staged'
  | 'witnessed';

export type TrustPermissionEnvelope =
  | 'read_only'
  | 'guarded_execute'
  | 'break_glass';

export type TrustSyncState =
  | 'local_only'
  | 'synced'
  | 'redacted_sync'
  | 'sync_failed';

export type TrustLayer1Strategy =
  | 'authority_weighted'
  | 'domain_override'
  | 'strict_error'
  | 'min_plus'
  | 'max_plus'
  | 'tropical'
  | string; // documented successors

export interface TrustActor {
  passportDid: string;
  bindings?: string[]; // lane id, wallet address, git key, shell actor id
}

export interface TrustAction {
  name: string;
  resource: string;
  outcome: TrustReceiptStatus;
}

export interface TrustEvidence {
  hashes: string[];
  nonce?: string;
  commandHash?: string;
  witnessRefs?: string[];
}

export interface TrustAlgebraicTrust {
  layer1Strategy: TrustLayer1Strategy;
  layer2HistoryRef?: string;
  layer3OracleRef?: string;
}

export interface TrustLinks {
  parentReceiptIds?: string[];
  taskId?: string;
  commit?: string;
}

export interface TrustStorage {
  localLedgerRef?: string;
  syncState: TrustSyncState;
}

export interface TrustReceipt {
  receiptId: string;
  schemaVersion: string;
  recordedAt: string; // ISO-8601
  actor: TrustActor;
  permissionEnvelope: TrustPermissionEnvelope;
  action: TrustAction;
  evidence: TrustEvidence;
  algebraicTrust: TrustAlgebraicTrust;
  links?: TrustLinks;
  storage: TrustStorage;
}

/**
 * Minimal validator: confirms required fields are present and non-empty.
 */
export function validateTrustReceipt(r: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!r || typeof r !== 'object') {
    errors.push('Receipt must be an object');
    return { valid: false, errors };
  }
  const rec = r as Record<string, unknown>;

  if (!rec.receiptId || typeof rec.receiptId !== 'string') errors.push('Missing receiptId');
  if (!rec.schemaVersion || typeof rec.schemaVersion !== 'string') errors.push('Missing schemaVersion');
  if (!rec.recordedAt || typeof rec.recordedAt !== 'string') errors.push('Missing recordedAt');

  if (!rec.actor || typeof rec.actor !== 'object') {
    errors.push('Missing actor');
  } else {
    const actor = rec.actor as Record<string, unknown>;
    if (!actor.passportDid || typeof actor.passportDid !== 'string') errors.push('Missing actor.passportDid');
  }

  if (!rec.permissionEnvelope || typeof rec.permissionEnvelope !== 'string') errors.push('Missing permissionEnvelope');

  if (!rec.action || typeof rec.action !== 'object') {
    errors.push('Missing action');
  } else {
    const action = rec.action as Record<string, unknown>;
    if (!action.name || typeof action.name !== 'string') errors.push('Missing action.name');
    if (!action.resource || typeof action.resource !== 'string') errors.push('Missing action.resource');
    if (!action.outcome || typeof action.outcome !== 'string') errors.push('Missing action.outcome');
  }

  if (!rec.evidence || typeof rec.evidence !== 'object') {
    errors.push('Missing evidence');
  } else {
    const evidence = rec.evidence as Record<string, unknown>;
    if (!Array.isArray(evidence.hashes)) errors.push('Missing evidence.hashes');
  }

  if (!rec.algebraicTrust || typeof rec.algebraicTrust !== 'object') {
    errors.push('Missing algebraicTrust');
  } else {
    const at = rec.algebraicTrust as Record<string, unknown>;
    if (!at.layer1Strategy || typeof at.layer1Strategy !== 'string') errors.push('Missing algebraicTrust.layer1Strategy');
  }

  if (!rec.storage || typeof rec.storage !== 'object') {
    errors.push('Missing storage');
  } else {
    const storage = rec.storage as Record<string, unknown>;
    if (!storage.syncState || typeof storage.syncState !== 'string') errors.push('Missing storage.syncState');
  }

  return { valid: errors.length === 0, errors };
}
