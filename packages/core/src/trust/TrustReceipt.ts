/**
 * TrustReceipt — canonical cross-surface trust receipt.
 *
 * Derived from ADR-2026-05-14 (Trust Primitives Decision Record).
 * Every cross-surface trust receipt must extend this shape.
 *
 * @see HoloScript/docs/architecture/2026-05-14_trust-primitives-decision-record.md
 */

import { createHash } from 'crypto';

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

export interface TrustActorBinding {
  value: string;
  type: 'lane' | 'wallet' | 'git' | 'shell' | 'agent' | string;
  verifiedAt?: string; // ISO-8601
  verifier?: string;
}

export interface TrustActor {
  passportDid: string;
  bindings?: TrustActorBinding[];
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
  redactedFields?: string[]; // fields redacted before sync
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

export type TrustReceiptInput = Omit<TrustReceipt, 'receiptId' | 'storage'> & {
  receiptId?: string;
  storage?: Partial<TrustStorage>;
};

const VALID_ENVELOPES: TrustPermissionEnvelope[] = ['read_only', 'guarded_execute', 'break_glass'];

const SIMULATION_KEYWORDS = ['sim', 'simulation', 'dt', 'digital-twin', 'digitaltwin', 'replay'];

function looksLikeWallet(value: string): boolean {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isSimulationRelated(action: TrustAction): boolean {
  const haystack = `${action.name} ${action.resource}`.toLowerCase();
  return SIMULATION_KEYWORDS.some((k) => haystack.includes(k));
}

/**
 * Deterministic receipt ID derived from canonical content hash.
 */
export function generateReceiptId(input: TrustReceiptInput): string {
  const canonical = stableTrustStringify(input);
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  return `trust_${input.recordedAt.replace(/[:.]/g, '-')}_${hash}`;
}

/**
 * Canonical JSON for trust hashes. Sorts object keys recursively so equivalent
 * receipt payloads hash the same after persistence, cloning, or redaction.
 */
export function stableTrustStringify(value: unknown): string {
  return JSON.stringify(canonicalizeTrustValue(value)) ?? 'undefined';
}

function canonicalizeTrustValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeTrustValue(entry));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeTrustValue(entry);
      }
    }
    return sorted;
  }

  return value;
}

/**
 * Strict validator per ADR-2026-05-14 Phase 1.
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
    if (!actor.passportDid || typeof actor.passportDid !== 'string') {
      errors.push('Missing actor.passportDid');
    }
    if (actor.bindings !== undefined) {
      if (!Array.isArray(actor.bindings)) {
        errors.push('actor.bindings must be an array');
      } else {
        for (const b of actor.bindings) {
          if (!b || typeof b !== 'object' || typeof (b as Record<string, unknown>).value !== 'string') {
            errors.push('Each actor.binding must have a value string');
            break;
          }
        }
      }
    }
  }

  if (!rec.permissionEnvelope || typeof rec.permissionEnvelope !== 'string') {
    errors.push('Missing permissionEnvelope');
  } else if (!VALID_ENVELOPES.includes(rec.permissionEnvelope as TrustPermissionEnvelope)) {
    errors.push(`Non-canonical permissionEnvelope: ${rec.permissionEnvelope}`);
  }

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
    if (!at.layer2HistoryRef || typeof at.layer2HistoryRef !== 'string') errors.push('Missing algebraicTrust.layer2HistoryRef');
    const action = (rec.action as Record<string, unknown> | undefined) ?? {};
    if (isSimulationRelated(action as TrustAction) && (!at.layer3OracleRef || typeof at.layer3OracleRef !== 'string')) {
      errors.push('Missing algebraicTrust.layer3OracleRef for simulation/digital-twin receipts');
    }
  }

  if (!rec.storage || typeof rec.storage !== 'object') {
    errors.push('Missing storage');
  } else {
    const storage = rec.storage as Record<string, unknown>;
    if (!storage.syncState || typeof storage.syncState !== 'string') errors.push('Missing storage.syncState');
    const syncState = storage.syncState as TrustSyncState;
    if ((syncState === 'synced' || syncState === 'redacted_sync') && !Array.isArray(storage.redactedFields)) {
      errors.push('Missing storage.redactedFields for synced receipts');
    }
  }

  // secp256k1 wallet binding requires transaction evidence
  const actor = (rec.actor as Record<string, unknown> | undefined) ?? {};
  const bindings = Array.isArray(actor.bindings) ? actor.bindings : [];
  const hasWalletBinding = bindings.some((b: unknown) => {
    if (!b || typeof b !== 'object') return false;
    const binding = b as Record<string, unknown>;
    return binding.type === 'wallet' || looksLikeWallet(String(binding.value));
  });
  if (hasWalletBinding) {
    const evidence = (rec.evidence as Record<string, unknown> | undefined) ?? {};
    if (!evidence.commandHash || typeof evidence.commandHash !== 'string') {
      errors.push('Wallet binding requires evidence.commandHash (transaction evidence)');
    }
  }

  return { valid: errors.length === 0, errors };
}
