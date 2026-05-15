/**
 * TrustLedger — unified persistent queryable cross-surface receipt ledger.
 *
 * Local-first append-only storage with query, hash-chain integrity,
 * and optional NDJSON persistence.
 *
 * @see docs/architecture/2026-05-14_trust-primitives-decision-record.md
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  TrustReceipt,
  TrustReceiptInput,
  TrustPermissionEnvelope,
  TrustReceiptStatus,
  TrustSyncState,
  validateTrustReceipt,
  generateReceiptId,
  stableTrustStringify,
} from './TrustReceipt';

// ─── Query Filter ────────────────────────────────────────────────────────────

export interface TrustQueryFilter {
  receiptId?: string;
  passportDid?: string;
  permissionEnvelope?: TrustPermissionEnvelope;
  actionName?: string;
  outcome?: TrustReceiptStatus;
  resource?: string;
  since?: string; // ISO-8601
  until?: string; // ISO-8601
  taskId?: string;
  commit?: string;
  parentReceiptId?: string;
  syncState?: TrustSyncState;
  limit?: number;
  offset?: number;
}

// ─── Storage Backends ────────────────────────────────────────────────────────

export interface TrustLedgerStorage {
  append(receipt: TrustReceipt): void;
  getAll(): TrustReceipt[];
}

/** In-memory append-only storage (default). */
export class InMemoryTrustStorage implements TrustLedgerStorage {
  private events: TrustReceipt[] = [];

  append(receipt: TrustReceipt): void {
    this.events.push(Object.freeze({ ...receipt }));
  }

  getAll(): TrustReceipt[] {
    return [...this.events];
  }
}

/** NDJSON file-backed append-only storage (Node.js only). */
export class NdjsonTrustStorage implements TrustLedgerStorage {
  private events: TrustReceipt[] = [];
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    this.events = lines.map((l) => JSON.parse(l));
  }

  append(receipt: TrustReceipt): void {
    this.events.push(receipt);
    fs.appendFileSync(this.filePath, JSON.stringify(receipt) + '\n');
  }

  getAll(): TrustReceipt[] {
    return [...this.events];
  }
}

// ─── Hash Chain ──────────────────────────────────────────────────────────────

function toChainPayload(receipt: TrustReceipt): TrustReceipt {
  const { localLedgerRef: _localLedgerRef, ...storage } = receipt.storage;
  return {
    ...receipt,
    storage,
  };
}

function computeChainHash(receipt: TrustReceipt, prevHash: string): string {
  const payload = stableTrustStringify({ receipt: toChainPayload(receipt), prevHash });
  return createHash('sha256').update(payload).digest('hex');
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

export class TrustLedger {
  private storage: TrustLedgerStorage;
  private lastHash: string = 'genesis';

  constructor(storage?: TrustLedgerStorage) {
    this.storage = storage ?? new InMemoryTrustStorage();
    this.rebuildChain();
  }

  private rebuildChain(): void {
    const all = this.storage.getAll();
    let hash = 'genesis';
    for (const r of all) {
      hash = computeChainHash(r, hash);
    }
    this.lastHash = hash;
  }

  /**
   * Append a receipt to the ledger.
   * Generates a deterministic receipt ID and chain hash if not present.
   */
  append(input: TrustReceiptInput): TrustReceipt {
    const receiptId = input.receiptId ?? generateReceiptId(input);
    const baseReceipt: TrustReceipt = {
      ...input,
      receiptId,
      storage: {
        syncState: 'local_only',
        ...input.storage,
      },
    } as TrustReceipt;

    const chainHash = computeChainHash(baseReceipt, this.lastHash);
    const receipt: TrustReceipt = {
      ...baseReceipt,
      storage: {
        ...baseReceipt.storage,
        localLedgerRef: chainHash,
      },
    };

    const validation = validateTrustReceipt(receipt);
    if (!validation.valid) {
      throw new Error(`Invalid trust receipt: ${validation.errors.join('; ')}`);
    }

    this.storage.append(receipt);
    this.lastHash = chainHash;
    return receipt;
  }

  /**
   * Query receipts by filter criteria.
   */
  query(filter: TrustQueryFilter = {}): TrustReceipt[] {
    let results = this.storage.getAll();

    results = results.filter((r) => {
      if (filter.receiptId !== undefined && r.receiptId !== filter.receiptId) return false;
      if (filter.passportDid !== undefined && r.actor.passportDid !== filter.passportDid)
        return false;
      if (
        filter.permissionEnvelope !== undefined &&
        r.permissionEnvelope !== filter.permissionEnvelope
      )
        return false;
      if (filter.actionName !== undefined && r.action.name !== filter.actionName) return false;
      if (filter.outcome !== undefined && r.action.outcome !== filter.outcome) return false;
      if (filter.resource !== undefined && r.action.resource !== filter.resource) return false;
      if (filter.taskId !== undefined && r.links?.taskId !== filter.taskId) return false;
      if (filter.commit !== undefined && r.links?.commit !== filter.commit) return false;
      if (filter.parentReceiptId !== undefined) {
        const parents = r.links?.parentReceiptIds ?? [];
        if (!parents.includes(filter.parentReceiptId)) return false;
      }
      if (filter.syncState !== undefined && r.storage.syncState !== filter.syncState) return false;
      if (filter.since !== undefined && r.recordedAt < filter.since) return false;
      if (filter.until !== undefined && r.recordedAt > filter.until) return false;
      return true;
    });

    if (filter.offset !== undefined && filter.offset > 0) {
      results = results.slice(filter.offset);
    }

    if (filter.limit !== undefined && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Count receipts matching the optional filter.
   */
  getCount(filter?: TrustQueryFilter): number {
    if (!filter) {
      return this.storage.getAll().length;
    }
    return this.query(filter).length;
  }

  /**
   * Produce a redacted copy of a receipt suitable for sync.
   */
  redact(receipt: TrustReceipt, fields: string[]): TrustReceipt {
    const clone = JSON.parse(JSON.stringify(receipt)) as TrustReceipt;
    for (const field of fields) {
      const pathParts = field.split('.');
      let target: Record<string, unknown> = clone as unknown as Record<string, unknown>;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const key = pathParts[i];
        if (!target[key] || typeof target[key] !== 'object') {
          target = {};
          break;
        }
        target = target[key] as Record<string, unknown>;
      }
      const last = pathParts[pathParts.length - 1];
      if (last in target) {
        delete target[last];
      }
    }
    clone.storage = {
      ...clone.storage,
      syncState: 'redacted_sync',
      redactedFields: [...fields],
    };
    return clone;
  }

  /**
   * Verify hash-chain integrity from genesis to the last receipt.
   * Returns true if the chain is intact.
   */
  verifyChain(): { valid: boolean; brokenAtIndex?: number } {
    const all = this.storage.getAll();
    let hash = 'genesis';
    for (let i = 0; i < all.length; i++) {
      const expected = computeChainHash(all[i], hash);
      const actual = all[i].storage.localLedgerRef;
      if (actual !== expected) {
        return { valid: false, brokenAtIndex: i };
      }
      hash = expected;
    }
    return { valid: true };
  }
}
