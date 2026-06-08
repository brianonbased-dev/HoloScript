/**
 * HoloKey resolve receipts — tamper-evident provenance for the custody "log" step.
 *
 * The resolver emits a {@link SecretResolveAudit} for every key handout (allowed or denied).
 * This module seals each audit into a hash-chained RECEIPT — a SHA-256 over the audit content
 * plus the previous receipt's hash — so the resolve log becomes append-only and tamper-evident:
 * any edit, deletion, or reorder breaks the chain and {@link verifyResolveReceiptChain} pinpoints
 * where. This is HoloKey's contribution to HoloGate's audit-receipt-chain (cf. `verify_cael_trace`),
 * the `log` in `identify → authorize → scope → admit → log`.
 *
 * Receipts carry ZERO secret material — only owner, ref, outcome, reason, time, and hashes.
 * Additive + side-effect-free: the resolver is untouched; an audit sink seals + persists.
 *
 * @module secrets-broker/resolve-receipt
 */

import { createHash } from 'node:crypto';
import type { SecretResolveAudit } from './secret-resolver';

/** A sealed, hash-chained resolve receipt. Extends the audit with chain hashes. */
export interface SecretResolveReceipt extends SecretResolveAudit {
  /** Hash of the previous receipt in the chain, or null at genesis. */
  readonly prevHash: string | null;
  /** `sha256:<hex>` over this receipt's content + prevHash. */
  readonly receiptHash: string;
}

/** Canonical content hash (fixed field order; excludes receiptHash). */
function contentHash(r: SecretResolveAudit & { prevHash: string | null }): string {
  const canonical = JSON.stringify([
    r.event,
    r.ownerId,
    r.ref,
    r.purpose,
    r.outcome,
    r.reason,
    r.at,
    r.prevHash,
  ]);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * Seal a resolve audit into a chained receipt: stamps `prevHash` (the prior receipt's
 * `receiptHash`, or null for the first) and a content hash over the whole. Pure.
 */
export function sealResolveReceipt(
  audit: SecretResolveAudit,
  prevHash: string | null
): SecretResolveReceipt {
  return { ...audit, prevHash, receiptHash: contentHash({ ...audit, prevHash }) };
}

/**
 * Verify a receipt chain end-to-end. Returns `{ ok: true }` only when every receipt's
 * `receiptHash` matches its recomputed content hash AND its `prevHash` links to the prior
 * receipt's `receiptHash` (the first's `prevHash` must be null). On failure, `brokenAt` is
 * the index of the first receipt that fails — any tampered field, deletion, or reorder.
 */
export function verifyResolveReceiptChain(receipts: readonly SecretResolveReceipt[]): {
  ok: boolean;
  brokenAt: number | null;
} {
  let prev: string | null = null;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (r.prevHash !== prev) return { ok: false, brokenAt: i };
    const expected = contentHash({
      event: r.event,
      ownerId: r.ownerId,
      ref: r.ref,
      purpose: r.purpose,
      outcome: r.outcome,
      reason: r.reason,
      at: r.at,
      prevHash: r.prevHash,
    });
    if (expected !== r.receiptHash) return { ok: false, brokenAt: i };
    prev = r.receiptHash;
  }
  return { ok: true, brokenAt: null };
}
