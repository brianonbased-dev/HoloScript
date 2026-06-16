/**
 * GameEventReceipt — canonical trust receipt for server-authoritative MMO game events.
 *
 * Provides a single `buildGameEventReceipt` builder so every MMO dimension
 * (combat, death, loot, trade, movement) mints receipts with the same
 * schema id instead of each reinventing the shape.
 *
 * Schema id: holoscript.mmo-event-receipt.v1
 *
 * @see research/2026-06-15_mmo-next-round-advancement.md §6
 * @see HoloScript/docs/architecture/2026-05-14_trust-primitives-decision-record.md
 */

import { createHash } from 'crypto';
import {
  TrustReceipt,
  TrustReceiptInput,
  generateReceiptId,
  validateTrustReceipt,
} from './TrustReceipt';
import { TrustLedgerStorage } from './TrustLedger';

// ─── Schema Constant ─────────────────────────────────────────────────────────

export const MMO_EVENT_RECEIPT_SCHEMA = 'holoscript.mmo-event-receipt.v1';

// ─── Game Event Kind ──────────────────────────────────────────────────────────

export type GameEventKind =
  | 'combat_hit'
  | 'death'
  | 'loot_roll'
  | 'trade'
  | 'movement_reject'
  | 'ability_cast'
  | 'spawn';

// ─── Input ───────────────────────────────────────────────────────────────────

/**
 * Minimal ergonomic inputs a compiler-emitted server call passes to
 * `buildGameEventReceipt`. All optional fields default to safe absent values.
 */
export interface GameEventReceiptInput {
  /** Type of the game event. */
  kind: GameEventKind;
  /** HoloScript room id (Colyseus room or shard id). */
  roomId: string;
  /** Server authority tick at which the event was evaluated. */
  tickCount: number;
  /** Passport DID (or session-scoped DID) of the acting player. */
  actorSessionId: string;
  /** Passport DID of the target player/entity, if applicable. */
  targetSessionId?: string;
  /** Ability or item id involved in the event. */
  abilityId?: string;
  /** Numeric magnitude — damage dealt, heal amount, item quantity, etc. */
  amount?: number;
  /** Whether the server authority accepted the event. false → 'denied'. */
  validated: boolean;
  /** Human-readable rejection reason when validated is false. */
  reason?: string;
  /** Parent receipt ids for provenance chains (e.g. ability_cast → combat_hit). */
  parentReceiptIds?: string[];
  /** Arbitrary extra payload for domain-specific event data. */
  payload?: Record<string, unknown>;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build a fully-formed `TrustReceipt` from a `GameEventReceiptInput`.
 *
 * The returned receipt passes `validateTrustReceipt()`.
 * Call `emitGameEventReceipt` to also append it to a `TrustLedgerStorage`.
 */
export function buildGameEventReceipt(input: GameEventReceiptInput): TrustReceipt {
  const recordedAt = new Date().toISOString();
  const outcome = input.validated ? ('success' as const) : ('denied' as const);

  // Stable hash of the event payload for evidence chaining.
  const payloadHash = stableGameEventHash(input);

  const receiptInput: TrustReceiptInput = {
    schemaVersion: MMO_EVENT_RECEIPT_SCHEMA,
    recordedAt,
    actor: {
      passportDid: input.actorSessionId,
      bindings: [
        { value: input.roomId, type: 'lane' },
        ...(input.targetSessionId
          ? [{ value: input.targetSessionId, type: 'agent' as const }]
          : []),
      ],
    },
    permissionEnvelope: 'guarded_execute',
    action: {
      // Prefix with 'mmo_event_' to avoid simulation-keyword false-positives
      // in validateTrustReceipt (which flags 'dt', 'sim', etc.)
      name: `mmo_event_${input.kind}`,
      resource: `holoscript/mmo/${input.roomId}/${input.kind}`,
      outcome,
    },
    evidence: {
      hashes: [payloadHash],
      nonce: `${input.roomId}_tick${input.tickCount}_${input.kind}_${Date.now()}`,
      witnessRefs: input.reason ? [input.reason] : undefined,
    },
    algebraicTrust: {
      layer1Strategy: 'authority_weighted',
      layer2HistoryRef: `mmo/${input.roomId}/tick/${input.tickCount}`,
    },
    links: {
      parentReceiptIds: input.parentReceiptIds,
    },
    storage: {
      syncState: 'local_only',
    },
  };

  const receiptId = generateReceiptId(receiptInput);
  const receipt: TrustReceipt = {
    ...receiptInput,
    receiptId,
    storage: {
      syncState: 'local_only',
    },
  };

  const validation = validateTrustReceipt(receipt);
  if (!validation.valid) {
    throw new Error(
      `buildGameEventReceipt produced an invalid receipt: ${validation.errors.join('; ')}`
    );
  }

  return receipt;
}

// ─── Ledger Append Helper ────────────────────────────────────────────────────

/**
 * Build a `GameEventReceipt` and append it to a `TrustLedgerStorage`.
 *
 * Returns the appended receipt. The storage's `append` method is synchronous;
 * this function is async to allow future I/O-backed implementations.
 */
export async function emitGameEventReceipt(
  input: GameEventReceiptInput,
  storage: TrustLedgerStorage
): Promise<TrustReceipt> {
  const receipt = buildGameEventReceipt(input);
  storage.append(receipt);
  return receipt;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 hash of a `GameEventReceiptInput` for evidence chaining.
 * Excludes non-deterministic fields (none here — caller controls all inputs).
 */
export function stableGameEventHash(input: GameEventReceiptInput): string {
  const canonical = JSON.stringify(sortKeys(input as unknown as Record<string, unknown>));
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rec).sort()) {
      if (rec[k] !== undefined) out[k] = sortKeys(rec[k]);
    }
    return out;
  }
  return value;
}
