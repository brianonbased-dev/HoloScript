/**
 * QEC decode receipts — tamper-evident provenance for the error-correction "decode" step.
 *
 * A quantum-error-correction decoder turns a measured SYNDROME into a CORRECTION. This
 * module seals each decode round into a hash-chained RECEIPT — a SHA-256 over the
 * qec-decode-receipt/v0 payload plus the previous receipt's hash — so a decode log becomes
 * append-only and tamper-evident: any edit, reorder, or forged append breaks the chain and
 * {@link verifyDecodeReceiptChain} pinpoints where. This is the error-correction extension
 * of Paper 37 (Quantum Receipt Chain): the audited step is a QEC decode, and it is the
 * `.ts` sealer behind the native `@decode_receipt` trait (decode_receipt.hsplus), exactly
 * as {@link ./resolve-receipt} is the sealer behind `@resolve_receipt`.
 *
 * The correction and `logical_error` are DERIVED by the decoder (replayed from the sealed
 * syndrome), never author-asserted (F.123 proven-label discipline). Receipts carry ZERO
 * physical-qubit state — only syndromes, corrections, the derived logical flag, and hashes.
 *
 * Wire-compatible with research/qec-decoder-probe/decode-receipt-chain.mjs (same canonical
 * field order + snake_case qec-decode-receipt/v0 schema), so receipts sealed by either side
 * verify against the other.
 *
 * @module secrets-broker/decode-receipt
 */

import { createHash } from 'node:crypto';

/** The qec-decode-receipt/v0 payload a decoder produces for one decode round. */
export interface QecDecodePayload {
  /** Schema tag; always `qec-decode-receipt/v0`. */
  readonly schema: 'qec-decode-receipt/v0';
  /** Code identifier, e.g. `[[9,1,3]] rotated surface`. */
  readonly code: string;
  /** X-error syndrome bits (e.g. `0110`). */
  readonly x_syndrome: string;
  /** Z-error syndrome bits. */
  readonly z_syndrome: string;
  /** Correction applied to X errors (per-qubit bits). */
  readonly x_correction: string;
  /** Correction applied to Z errors. */
  readonly z_correction: string;
  /** Whether a logical error remains after correction — DERIVED by replay, never asserted. */
  readonly logical_error: boolean;
  /** Optional human note naming the deterministic replay predicate. */
  readonly replay_note?: string;
}

/** A sealed, hash-chained QEC decode receipt. */
export interface QecDecodeReceipt extends QecDecodePayload {
  /** Hash of the previous receipt in the chain, or null at genesis. */
  readonly prev_hash: string | null;
  /** `sha256:<hex>` over the canonical payload + prev_hash. */
  readonly receipt_hash: string;
}

/** Canonical payload fields, in the fixed order that is hashed (excludes hashes themselves). */
export const PAYLOAD_FIELDS = [
  'schema',
  'code',
  'x_syndrome',
  'z_syndrome',
  'x_correction',
  'z_correction',
  'logical_error',
] as const;

/** Canonical bytes hashed for a receipt: payload fields (fixed order) + prev_hash. */
function canonicalPayload(payload: QecDecodePayload, prevHash: string | null): string {
  return JSON.stringify([...PAYLOAD_FIELDS.map((f) => payload[f]), prevHash ?? null]);
}

/** `receipt_hash = sha256:<hex>` over the canonical payload — the Paper-37 chain link. */
function receiptHash(payload: QecDecodePayload, prevHash: string | null): string {
  return `sha256:${createHash('sha256').update(canonicalPayload(payload, prevHash)).digest('hex')}`;
}

/**
 * Seal one decode payload into a chained receipt: stamps `prev_hash` (the prior receipt's
 * `receipt_hash`, or null for the first) and a content hash over the whole. Pure.
 */
export function sealDecodeReceipt(
  payload: QecDecodePayload,
  prevHash: string | null = null
): QecDecodeReceipt {
  return { ...payload, prev_hash: prevHash ?? null, receipt_hash: receiptHash(payload, prevHash) };
}

/** Seal an ordered run of decode payloads into a hash chain (genesis `prev_hash` = null). */
export function sealDecodeReceiptChain(payloads: readonly QecDecodePayload[]): QecDecodeReceipt[] {
  const out: QecDecodeReceipt[] = [];
  let prev: string | null = null;
  for (const p of payloads) {
    const sealed = sealDecodeReceipt(p, prev);
    out.push(sealed);
    prev = sealed.receipt_hash;
  }
  return out;
}

/**
 * Verify a decode-receipt chain end-to-end by RECOMPUTING every hash from the receipt's own
 * fields + its stored `prev_hash`, and checking `prev_hash` links to the prior `receipt_hash`
 * (the first must be null). Returns `{ ok: true }` only when nothing was tampered; on failure
 * `brokenAt` is the first bad index and `reason` says why (linkage vs field tamper).
 */
export function verifyDecodeReceiptChain(receipts: readonly QecDecodeReceipt[]): {
  ok: boolean;
  brokenAt: number | null;
  reason?: string;
} {
  let prev: string | null = null;
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if ((r.prev_hash ?? null) !== prev) return { ok: false, brokenAt: i, reason: 'prev_hash linkage broken' };
    if (receiptHash(r, r.prev_hash) !== r.receipt_hash) {
      return { ok: false, brokenAt: i, reason: 'payload hash mismatch (field tampered)' };
    }
    prev = r.receipt_hash;
  }
  return { ok: true, brokenAt: null };
}
