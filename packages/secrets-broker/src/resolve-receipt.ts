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

import type { SecretResolveAudit } from './secret-resolver';
import {
  sealHash,
  verifyReceiptChain,
  createReceiptChainSink,
  type ChainAccessors,
  type ReceiptChainSink,
} from './receipt-chain';

/** A sealed, hash-chained resolve receipt. Extends the audit with chain hashes. */
export interface SecretResolveReceipt extends SecretResolveAudit {
  /** Hash of the previous receipt in the chain, or null at genesis. */
  readonly prevHash: string | null;
  /** `sha256:<hex>` over this receipt's content + prevHash. */
  readonly receiptHash: string;
}

/** Canonical serialization for a resolve audit (fixed field order; excludes receiptHash). */
const canonical = (r: SecretResolveAudit, prevHash: string | null): string =>
  JSON.stringify([r.event, r.ownerId, r.ref, r.purpose, r.outcome, r.reason, r.at, prevHash]);

const ACCESSORS: ChainAccessors<SecretResolveReceipt> = {
  canonical,
  prevHashOf: (r) => r.prevHash,
  receiptHashOf: (r) => r.receiptHash,
};

/**
 * Seal a resolve audit into a chained receipt: stamps `prevHash` (the prior receipt's
 * `receiptHash`, or null for the first) and a content hash over the whole. Pure.
 */
export function sealResolveReceipt(
  audit: SecretResolveAudit,
  prevHash: string | null
): SecretResolveReceipt {
  return { ...audit, prevHash, receiptHash: sealHash(canonical(audit, prevHash)) };
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
  const { ok, brokenAt } = verifyReceiptChain(receipts, ACCESSORS);
  return { ok, brokenAt };
}

/**
 * A resolve-receipt SINK — the emit → seal → persist wire that turns the resolver's audit
 * stream into a live tamper-evident chain. Hand {@link ResolveReceiptSink.audit} to
 * `createSecretResolver({ store, audit })` (or `createHoloKeyVault({ audit })`) and every
 * resolve attempt — allowed or denied — is sealed onto the chain via {@link sealResolveReceipt}
 * (this is that function's first live caller). Read the sealed log with `.chain()` and prove
 * it untampered with `.verify()`.
 */
export interface ResolveReceiptSink
  extends ReceiptChainSink<SecretResolveAudit, SecretResolveReceipt> {
  /**
   * Resolver-compatible audit callback: seals each attempt onto the chain. Never throws — the
   * seal is pure and durable persistence is caught — so it is safe as the resolver's
   * fire-and-forget `audit` sink and cannot break value resolution.
   */
  readonly audit: (event: SecretResolveAudit) => void;
}

export interface ResolveReceiptSinkDeps {
  /**
   * Durable, append-only persistence for each sealed resolve receipt. Receipts carry ZERO
   * secret material (owner, ref, outcome, reason, time, hashes only). DEFAULT: none — the
   * chain is in-memory only (resets per process; wire this for a durable audit trail).
   */
  persist?: (receipt: SecretResolveReceipt) => void | Promise<void>;
  /** Called when a `persist` throws/rejects. Default: `console.error` (never silently swallowed). */
  onPersistError?: (err: unknown, receipt: SecretResolveReceipt) => void;
}

/**
 * Build a {@link ResolveReceiptSink} over the resolve-receipt seal + accessors. Additive and
 * side-effect-free by default: no durable write happens unless {@link ResolveReceiptSinkDeps.persist}
 * is supplied.
 */
export function createResolveReceiptSink(deps: ResolveReceiptSinkDeps = {}): ResolveReceiptSink {
  const sink = createReceiptChainSink<SecretResolveAudit, SecretResolveReceipt>({
    seal: sealResolveReceipt,
    accessors: ACCESSORS,
    persist: deps.persist,
    onPersistError: deps.onPersistError,
  });
  return {
    ...sink,
    audit: (event: SecretResolveAudit) => {
      sink.append(event);
    },
  };
}
