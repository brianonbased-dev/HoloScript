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

// ── Sink: the emit → seal → persist wire on top of a receipt chain ─────────────
//
// A chain is only tamper-evident if something actually seals each record onto the head
// as events arrive. The sink is that live accumulator: hand it raw records (audits, decode
// results) and it maintains the growing chain — the missing link between an emitter (e.g. the
// HoloKey resolver's audit callback) and the seal/verify mechanics above. It is generic over
// any receipt family via its `seal` + `ChainAccessors`, so a new family reuses this instead of
// re-implementing head-tracking + fire-and-forget persistence a fourth time.

/** A live, growing tamper-evident receipt chain fed one raw record at a time. */
export interface ReceiptChainSink<Rec, Sealed> {
  /** Seal `record` onto the current head, append it, fire off persistence, return the sealed receipt. */
  append(record: Rec): Sealed;
  /** A snapshot copy of every sealed receipt, in order. */
  chain(): readonly Sealed[];
  /** The current head hash (last `receiptHash`), or null when the chain is empty. */
  head(): string | null;
  /** Number of sealed receipts on the chain. */
  size(): number;
  /** Verify the whole in-memory chain end-to-end (delegates to {@link verifyReceiptChain}). */
  verify(): { ok: boolean; brokenAt: number | null; reason?: ChainBreakReason };
}

export interface ReceiptChainSinkDeps<Rec, Sealed> {
  /** Seal one raw record onto a prevHash → a sealed receipt (e.g. `sealResolveReceipt`). */
  seal: (record: Rec, prevHash: string | null) => Sealed;
  /** How to read a sealed receipt's chain fields — used to advance the head and to verify. */
  accessors: ChainAccessors<Sealed>;
  /**
   * Optional durable, append-only persistence for each sealed receipt. Fire-and-forget: a
   * returned promise's rejection is routed to {@link ReceiptChainSinkDeps.onPersistError} and
   * NEVER breaks the in-memory chain or the caller. DEFAULT: none — the chain is in-memory only
   * (an honest in-memory claim, no durability asserted without a real backend).
   */
  persist?: (sealed: Sealed) => void | Promise<void>;
  /** Called when a `persist` throws/rejects. Default: `console.error` (surface it, never swallow). */
  onPersistError?: (err: unknown, sealed: Sealed) => void;
}

function reportPersistError<Rec, Sealed>(
  deps: ReceiptChainSinkDeps<Rec, Sealed>,
  err: unknown,
  sealed: Sealed
): void {
  if (deps.onPersistError) {
    deps.onPersistError(err, sealed);
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[receipt-chain] durable persist failed (in-memory chain intact):', err);
}

/**
 * Create a live {@link ReceiptChainSink}. `append` is synchronous and pure up to the seal —
 * safe to call from a fire-and-forget audit callback — and the in-memory chain is always the
 * authoritative, verifiable record; durable `persist` is best-effort and never blocks, throws,
 * or advances/rolls-back the chain based on its outcome.
 */
export function createReceiptChainSink<Rec, Sealed>(
  deps: ReceiptChainSinkDeps<Rec, Sealed>
): ReceiptChainSink<Rec, Sealed> {
  const records: Sealed[] = [];
  let head: string | null = null;

  return {
    append(record: Rec): Sealed {
      const sealed = deps.seal(record, head);
      records.push(sealed);
      head = deps.accessors.receiptHashOf(sealed);
      if (deps.persist) {
        try {
          const result = deps.persist(sealed);
          if (result && typeof (result as Promise<void>).then === 'function') {
            (result as Promise<void>).catch((err) => reportPersistError(deps, err, sealed));
          }
        } catch (err) {
          reportPersistError(deps, err, sealed);
        }
      }
      return sealed;
    },
    chain: () => records.slice(),
    head: () => head,
    size: () => records.length,
    verify: () => verifyReceiptChain(records, deps.accessors),
  };
}
