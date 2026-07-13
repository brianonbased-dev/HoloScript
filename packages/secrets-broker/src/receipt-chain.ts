/**
 * Receipt chain — the shared SHA-256 hash-chain primitive for tamper-evident receipt logs.
 *
 * A receipt chain seals an ordered sequence of records: each record carries a `prevHash`
 * (the prior record's hash, or null at genesis) and a `receiptHash` = SHA-256 over the
 * record's canonical bytes + prevHash. Any edit, deletion, reorder, or forged append breaks
 * the chain, and {@link verifyReceiptChain} pinpoints the first broken index.
 *
 * This is the ONE place the seal/verify mechanics live. Concrete receipt families (HoloKey
 * resolve receipts in {@link ./resolve-receipt}, QEC decode receipts in {@link ./decode-receipt})
 * supply only their own canonical field order + accessors and keep their own public types /
 * naming (camelCase vs snake_case) — so a new receipt family reuses this instead of copying
 * the hash-chain a third time. NOTE: uaal/vm.ts is deliberately NOT a consumer — its
 * bytecode-sha256 + replay-comparator is a different mechanism (no prevHash chain), not a
 * receipt chain.
 *
 * @module secrets-broker/receipt-chain
 */

import { createHash } from 'node:crypto';

/** `sha256:<hex>` over the given canonical bytes — one chain link. */
export function sealHash(canonicalBytes: string): string {
  return `sha256:${createHash('sha256').update(canonicalBytes).digest('hex')}`;
}

/** How a receipt family exposes its canonical serialization + its chain fields. */
export interface ChainAccessors<R> {
  /** Canonical bytes hashed for one record + its prevHash (fixed field order; excludes hashes). */
  canonical: (record: R, prevHash: string | null) => string;
  /** Read the stored prevHash off a sealed record (null at genesis). */
  prevHashOf: (record: R) => string | null;
  /** Read the stored receiptHash off a sealed record. */
  receiptHashOf: (record: R) => string;
}

/** Reasons a chain fails to verify. */
export type ChainBreakReason = 'prev_hash linkage broken' | 'payload hash mismatch (field tampered)';

/**
 * Verify a prevHash-linked SHA-256 receipt chain end-to-end by RECOMPUTING every hash from
 * the record's own canonical fields + its stored prevHash, and checking prevHash links to the
 * prior receiptHash (the first must be null). Returns `{ ok: true }` only when nothing was
 * tampered; on failure `brokenAt` is the first bad index and `reason` says why.
 */
export function verifyReceiptChain<R>(
  records: readonly R[],
  acc: ChainAccessors<R>
): { ok: boolean; brokenAt: number | null; reason?: ChainBreakReason } {
  let prev: string | null = null;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const prevHash = acc.prevHashOf(r) ?? null;
    if (prevHash !== prev) return { ok: false, brokenAt: i, reason: 'prev_hash linkage broken' };
    if (sealHash(acc.canonical(r, prevHash)) !== acc.receiptHashOf(r)) {
      return { ok: false, brokenAt: i, reason: 'payload hash mismatch (field tampered)' };
    }
    prev = acc.receiptHashOf(r);
  }
  return { ok: true, brokenAt: null };
}
