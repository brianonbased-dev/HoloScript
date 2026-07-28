/**
 * Receipt Hash Policy — two-tier SSOT for all receipt payloads in @holoscript/core.
 *
 * ## Tiers
 *
 * | Tier       | Algorithm | Output length | When to use                                        |
 * |------------|-----------|---------------|----------------------------------------------------|
 * | `'fast'`   | FNV-1a 32 | 8 hex chars   | Non-adversarial, high-throughput, local receipts   |
 * | `'secure'` | SHA-256   | 64 hex chars  | Chain-anchored, adversarial-peer, on-chain records |
 *
 * **Default is `'fast'`** — this matches the non-adversarial threat model that governs
 * most simulation receipts (internal replay, developer tooling, local twin). Use
 * `'secure'` when a receipt will be anchored on-chain (x402/CAEL base anchor) or
 * shared across trust boundaries where collision resistance matters.
 *
 * ## Usage
 *
 *   import { hashReceiptPayload, RECEIPT_HASH_POLICY_DEFAULT } from './hash-policy';
 *
 *   // Fast path (DomainSimulationReceipt, internal receipts):
 *   const tag = hashReceiptPayload(payload);         // uses 'fast'
 *
 *   // Secure path (chain-anchored receipts):
 *   const tag = hashReceiptPayload(payload, 'secure');
 *
 * ## Format tags
 *
 * Both functions prefix the raw hex with a format tag so receipts are
 * self-identifying even without the policy field:
 *   `fast`   → `"fnv1a32:<8 hex>"`
 *   `secure` → `"sha256:<64 hex>"`
 *
 * ## Rationale
 *
 * Prior to this file, the fnv1a32 implementation was duplicated:
 *   - `packages/core/src/receipts/DomainSimulationReceipt.ts` (private local fn)
 *   - `packages/engine/src/simulation/sha256.ts` (byte-domain variant)
 *   - `packages/core/src/reconstruction/replayFingerprint.ts` (double-FNV, 16 chars)
 *
 * Those existing callers are left unchanged (they are locked by tests). All NEW
 * receipt hashing should go through this module.
 *
 * See: research/2026-06-16_language-extension-roadmap.md §H1 hash-policy
 *      packages/engine/src/simulation/sha256.ts (engine-level mode dispatch)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The two tiers of receipt hashing.
 * Match the engine's `HashMode` naming intent but kept independent
 * so @holoscript/core does not import from @holoscript/engine.
 */
export type ReceiptHashPolicy = 'fast' | 'secure';

/** Default policy: FNV-1a 32 — fast, non-adversarial, non-cryptographic. */
export const RECEIPT_HASH_POLICY_DEFAULT: ReceiptHashPolicy = 'fast';

// ── FNV-1a 32 (fast tier) ─────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit over a UTF-16 code-unit string.
 * Produces 8 lowercase hex chars. Not cryptographically secure.
 * Identical algorithm to the private `fnv1a32` in DomainSimulationReceipt.ts.
 */
function fnv1a32String(value: string): string {
  let hash = 0x811c9dc5;
  for (const cp of value) {
    hash ^= cp.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ── SHA-256 (secure tier) ─────────────────────────────────────────────────────

const TEXT_ENCODER = new TextEncoder();

/**
 * SHA-256 over a UTF-8 encoded string using the Web Crypto API.
 * Returns a Promise<string> of 64 lowercase hex chars.
 * Available in Node ≥ 20 (globalThis.crypto.subtle) and all modern browsers.
 */
async function sha256StringAsync(value: string): Promise<string> {
  const bytes = TEXT_ENCODER.encode(value);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Hash a canonicalized receipt payload string using the specified policy.
 *
 * For `'fast'` (default): synchronous, returns a prefixed string immediately.
 * For `'secure'`: returns a Promise — await it or use `hashReceiptPayloadAsync`.
 *
 * The output is always prefixed with the format tag so receipts are
 * self-identifying: `"fnv1a32:<hex>"` or `"sha256:<hex>"`.
 */
export function hashReceiptPayload(canonicalized: string, policy?: 'fast'): string;
export function hashReceiptPayload(canonicalized: string, policy: 'secure'): Promise<string>;
export function hashReceiptPayload(
  canonicalized: string,
  policy: ReceiptHashPolicy = RECEIPT_HASH_POLICY_DEFAULT
): string | Promise<string> {
  if (policy === 'fast') {
    return `fnv1a32:${fnv1a32String(canonicalized)}`;
  }
  return sha256StringAsync(canonicalized).then((hex) => `sha256:${hex}`);
}

/**
 * Async variant — always returns a Promise regardless of policy tier.
 * Useful in async contexts where the synchronous fast path is still valid.
 */
export async function hashReceiptPayloadAsync(
  canonicalized: string,
  policy: ReceiptHashPolicy = RECEIPT_HASH_POLICY_DEFAULT
): Promise<string> {
  if (policy === 'fast') {
    return `fnv1a32:${fnv1a32String(canonicalized)}`;
  }
  const hex = await sha256StringAsync(canonicalized);
  return `sha256:${hex}`;
}

/**
 * Parse a format-tagged hash string produced by `hashReceiptPayload`.
 * Returns `{ policy, hex }` or `null` if the tag is not recognized.
 *
 * Useful for receipt verification: infer the tier from the stored hash
 * without requiring a separate `hashAlgorithm` field.
 */
export function parseReceiptHash(
  tagged: string
): { policy: ReceiptHashPolicy; hex: string } | null {
  if (tagged.startsWith('fnv1a32:')) {
    return { policy: 'fast', hex: tagged.slice(8) };
  }
  if (tagged.startsWith('sha256:')) {
    return { policy: 'secure', hex: tagged.slice(7) };
  }
  return null;
}

/**
 * Format-level consistency check: does the hash string's prefix match
 * the expected policy? Used to detect mid-receipt policy tampering.
 */
export function receiptHashMatchesPolicy(tagged: string, policy: ReceiptHashPolicy): boolean {
  const parsed = parseReceiptHash(tagged);
  return parsed !== null && parsed.policy === policy;
}
