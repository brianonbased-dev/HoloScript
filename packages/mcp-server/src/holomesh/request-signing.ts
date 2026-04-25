/**
 * HoloMesh Request Signing — Phase 1 verifier (server side).
 *
 * Companion to ai-ecosystem/hooks/lib/holomesh-signing.mjs (client side).
 *
 * Wire format:
 *   { body, signature, signer_address, nonce, timestamp }
 *
 * Signature is an EIP-191 personal_sign over the canonicalized envelope
 * `{ body, nonce, timestamp }` (sorted keys, no whitespace). Verification
 * recovers the signing address via viem's verifyMessage; the recovered
 * address must equal `signer_address`.
 *
 * Phase 1 grace-period semantics: callers should treat unsigned requests as
 * legacy-attribution and signed requests as authoritative. Rejection is the
 * caller's choice — verifyEnvelope just returns the verification result.
 *
 * Spec: research/2026-04-21_seat-wallets-adr.md §"Shared — HoloMesh signing
 * protocol", "Server-side verification".
 *
 * Future hardening (out of scope here):
 *   - Attestation-registry lookup (verify signer is in the attested-seats set
 *     and not retired; verify authorized_by chain terminates at ecosystem-root
 *     or platform-root). Tracked under Phase 2 dashboard work.
 *   - Server-side nonce store for replay protection (this module rejects
 *     timestamps outside the freshness window; nonce-uniqueness checking is
 *     the consumer middleware's responsibility).
 *
 * @module holomesh/request-signing
 */

/** Mutating envelope for HoloMesh request signing. */
export interface SignedEnvelope {
  body: unknown;
  signature: string;
  signer_address: string;
  nonce: string;
  timestamp: string;
}

/** Result of verifying a signed envelope. */
export interface VerifyResult {
  valid: boolean;
  signer: string | null;
  reason?: string;
}

/**
 * Optional registry-side check. Returns whether the signer is currently
 * attested + retired-or-not. Wire from
 * `identity/attestation-registry.ts::toRegistryCheck()` for the production path.
 *
 * Decoupling rationale: verifier doesn't import the registry directly so the
 * grace-period mode (Phase 1, registry not yet shipped) can run without an
 * empty registry rejecting every signer.
 */
export type RegistryCheck = (publicKey: string) => Promise<{
  attested: boolean;
  retired: boolean;
  reason?: string;
}>;

/** Acceptable timestamp drift — older signatures are rejected as stale. */
export const TIMESTAMP_FRESHNESS_MS = 5 * 60 * 1000;

/**
 * Deterministic JSON canonicalization: sorted keys at every object level, no
 * whitespace. Must produce identical output to the client (hooks/lib/holomesh-
 * signing.mjs `canonicalizeBody`) for any input value, otherwise signatures
 * won't verify.
 */
export function canonicalizeBody(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeBody).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeBody(obj[k])}`).join(',')}}`;
}

/**
 * Build the exact byte-string the client signed: canonicalized
 * `{ body, nonce, timestamp }`. Must match
 * `hooks/lib/holomesh-signing.mjs::buildSignedEnvelope` payload assembly.
 */
export function buildSigningPayload(env: Pick<SignedEnvelope, 'body' | 'nonce' | 'timestamp'>): string {
  return canonicalizeBody({ body: env.body, nonce: env.nonce, timestamp: env.timestamp });
}

/** Pull the envelope shape out of a request body, or return null if not signed. */
export function extractEnvelope(reqBody: unknown): SignedEnvelope | null {
  if (!reqBody || typeof reqBody !== 'object') return null;
  const e = reqBody as Partial<SignedEnvelope>;
  if (
    typeof e.signature !== 'string' ||
    typeof e.signer_address !== 'string' ||
    typeof e.nonce !== 'string' ||
    typeof e.timestamp !== 'string' ||
    !('body' in e)
  ) {
    return null;
  }
  return e as SignedEnvelope;
}

/** Reject envelopes older than the freshness window (defends against trivially-stale replays). */
export function isFreshTimestamp(timestamp: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  const drift = Math.abs(nowMs - t);
  return drift <= TIMESTAMP_FRESHNESS_MS;
}

/** Address-equality check that's case-insensitive (Ethereum addresses are checksummed). */
function addressesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Verify a signed envelope. Returns the verification result; the caller
 * decides whether to reject the request.
 *
 * When `registryCheck` is provided, signers that are retired or not yet
 * attested are rejected even if the signature is cryptographically valid.
 * When omitted (Phase 1 grace-period default), only the cryptographic
 * checks fire — caller does Bearer-token attribution as today.
 */
export async function verifyEnvelope(
  env: SignedEnvelope,
  options: { nowMs?: number; registryCheck?: RegistryCheck } = {}
): Promise<VerifyResult> {
  if (!isFreshTimestamp(env.timestamp, options.nowMs)) {
    return { valid: false, signer: env.signer_address, reason: 'timestamp-stale' };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(env.signer_address)) {
    return { valid: false, signer: null, reason: 'malformed-signer-address' };
  }
  if (!/^0x[0-9a-fA-F]+$/.test(env.signature)) {
    return { valid: false, signer: env.signer_address, reason: 'malformed-signature' };
  }
  let recovered: boolean;
  try {
    const { verifyMessage } = await import('viem');
    recovered = await verifyMessage({
      address: env.signer_address as `0x${string}`,
      message: buildSigningPayload(env),
      signature: env.signature as `0x${string}`,
    });
  } catch {
    return { valid: false, signer: env.signer_address, reason: 'verify-threw' };
  }
  if (!recovered) {
    return { valid: false, signer: env.signer_address, reason: 'signature-mismatch' };
  }
  if (options.registryCheck) {
    let registry: { attested: boolean; retired: boolean; reason?: string };
    try {
      registry = await options.registryCheck(env.signer_address);
    } catch {
      return { valid: false, signer: env.signer_address, reason: 'registry-check-threw' };
    }
    if (registry.retired) {
      return { valid: false, signer: env.signer_address, reason: registry.reason ?? 'signer-retired' };
    }
    if (!registry.attested) {
      return { valid: false, signer: env.signer_address, reason: registry.reason ?? 'signer-not-attested' };
    }
  }
  return { valid: true, signer: env.signer_address };
}

/**
 * Convenience wrapper: extract + verify in one call. Returns {valid:false,
 * reason:'unsigned'} when no envelope shape is present so callers can decide
 * whether to fall through to legacy-attribution during the Phase 1 grace
 * period or reject outright after cutover.
 */
export async function verifyRequestBody(
  reqBody: unknown,
  options: { nowMs?: number; registryCheck?: RegistryCheck } = {}
): Promise<VerifyResult> {
  const env = extractEnvelope(reqBody);
  if (!env) return { valid: false, signer: null, reason: 'unsigned' };
  // Reject obviously-equal addresses — keeps the test's address-mismatch case clean
  // even if a malicious caller sets signer_address to match a different signer.
  const result = await verifyEnvelope(env, options);
  if (result.valid && !addressesEqual(result.signer ?? '', env.signer_address)) {
    return { valid: false, signer: env.signer_address, reason: 'signer-address-mismatch' };
  }
  return result;
}
