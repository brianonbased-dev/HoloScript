/**
 * boardSigner.ts — server-side HoloMesh request signer for the Studio seat.
 *
 * Builds the EXACT signed envelope the MCP board route verifies, so the Studio
 * Capabilities surface can file board-task requests end-to-end (the "Request run"
 * → /api/operations/request-run path) instead of POSTing an unsigned body that
 * the Phase-3-strict board route 401s with `signing-rejected`.
 *
 * ── Wire contract (MUST match exactly) ─────────────────────────────────────────
 * This is the SERVER-VERIFIED contract, reverse-engineered from:
 *   - client : ai-ecosystem/hooks/lib/holomesh-signing.mjs  (buildSignedEnvelope)
 *   - server : @holoscript/mcp-server holomesh/request-signing.ts  (verifyEnvelope)
 *              + holomesh/identity/signing-middleware.ts (extractAndVerifySigning)
 *
 *   Envelope shape (POSTed as the request body):
 *     { body, signature, signer_address, nonce, timestamp }
 *
 *   signature = EIP-191 personal_sign( canonicalizeBody({ body, nonce, timestamp }) )
 *               over a secp256k1 (Ethereum) wallet private key.
 *   signer_address = that wallet's 0x… address.
 *   nonce          = 128-bit random hex.
 *   timestamp      = ISO-8601 (server rejects drift > 5 min — TIMESTAMP_FRESHNESS_MS).
 *
 * The server recovers the signer with viem's `verifyMessage` and requires the
 * recovered address to equal `signer_address`. We sign with viem's
 * `privateKeyToAccount(...).signMessage({ message })` — viem signs and verifies
 * the SAME EIP-191 bytes, so a signature produced here verifies TRUE there by
 * construction (proven in boardSigner.verify.test.ts against the server's real
 * verifyEnvelope). viem is already a direct studio dependency.
 *
 * ── Why this is NOT Ed25519 ────────────────────────────────────────────────────
 * The seat-wallets ADR "Key-derivation correction (2026-04-22)" supersedes the
 * earlier ed25519 line: Tier-1 seats are x402 self-provisioned secp256k1 wallets
 * and the server verifies EIP-191/secp256k1. An ed25519 keypair would NOT verify.
 *
 * ── Seat trust model ───────────────────────────────────────────────────────────
 * The board route's cryptographic gate is: a fresh-timestamp EIP-191 signature
 * whose recovered address equals signer_address. The AttestationRegistry check
 * only fires when the in-memory registry is populated (registry.size() > 0); in
 * production it is NOT populated on boot (Phase-1 in-memory only — see
 * attestation-registry.ts), so the gate is the signature itself plus the team
 * Bearer membership check the route does first (requireTeamAccessFresh →
 * board:write). The Studio proxy supplies that Bearer from its own
 * HOLOMESH_API_KEY; this module supplies the signature. The seat's PUBLIC address
 * is registered as a HoloMesh agent via the same challenge/register flow the
 * other seats use (scripts/provision-studio-seat.mjs).
 *
 * ── Key handling ───────────────────────────────────────────────────────────────
 * The private key is read ONLY from process.env.STUDIO_SEAT_SIGNING_KEY (a 32-byte
 * hex secp256k1 key, with or without 0x). It is NEVER logged, returned, or
 * embedded in any error message — errors reference the env-var NAME only. If the
 * env var is unset, signing FAILS CLOSED (signerConfigured() === false) so a
 * caller can return an honest "signing key not provisioned" error rather than
 * silently POSTing unsigned.
 *
 * @module lib/boardSigner
 */

import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';

/** The mutating envelope the MCP board route verifies. */
export interface SignedEnvelope {
  body: unknown;
  signature: string;
  signer_address: string;
  nonce: string;
  timestamp: string;
}

/** Env var holding the Studio seat's secp256k1 signing key (32-byte hex). */
export const STUDIO_SEAT_SIGNING_KEY_ENV = 'STUDIO_SEAT_SIGNING_KEY';

/**
 * Deterministic JSON canonicalization — sorted keys at every object level, no
 * whitespace. MUST byte-match the server's canonicalizeBody
 * (mcp-server request-signing.ts) and the client's (holomesh-signing.mjs) for
 * any input, or signatures will not verify.
 */
export function canonicalizeBody(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeBody).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeBody(obj[k])}`).join(',')}}`;
}

/** Build the exact byte-string the server expects to have been signed. */
export function buildSigningPayload(env: Pick<SignedEnvelope, 'body' | 'nonce' | 'timestamp'>): string {
  return canonicalizeBody({ body: env.body, nonce: env.nonce, timestamp: env.timestamp });
}

/** Generate a 128-bit hex nonce (matches the client's makeNonce). */
export function makeNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Normalize the raw env key to the `0x`-prefixed 32-byte form viem expects.
 * Throws (referencing only the env-var NAME, never the value) when the key is
 * absent or malformed. The thrown message NEVER contains key material.
 */
function resolvePrivateKey(env: NodeJS.ProcessEnv = process.env): `0x${string}` {
  const raw = env[STUDIO_SEAT_SIGNING_KEY_ENV];
  if (!raw || !raw.trim()) {
    throw new Error(
      `${STUDIO_SEAT_SIGNING_KEY_ENV} is not set — the Studio seat signing key is not provisioned. ` +
        `Set ${STUDIO_SEAT_SIGNING_KEY_ENV} (32-byte hex secp256k1 key) in the Studio environment.`
    );
  }
  const trimmed = raw.trim();
  const hex = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    // Deliberately does NOT echo the value — a malformed key must not leak.
    throw new Error(
      `${STUDIO_SEAT_SIGNING_KEY_ENV} is malformed — expected a 32-byte (64 hex char) secp256k1 ` +
        `private key, optionally 0x-prefixed.`
    );
  }
  return `0x${hex}`;
}

/**
 * True iff a usable Studio seat signing key is present in the environment.
 * Callers use this to fail closed with a clear "not provisioned" error rather
 * than POST an unsigned body. Never throws; never touches key bytes beyond a
 * shape check.
 */
export function signerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    resolvePrivateKey(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * The Studio seat's public 0x address (derived from the signing key), or null
 * when the key is unset/malformed. Safe to log — it is PUBLIC. Lets the
 * provisioning script and operate surface confirm the seat identity without
 * touching the private key.
 */
export function seatAddress(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    return privateKeyToAccount(resolvePrivateKey(env)).address;
  } catch {
    return null;
  }
}

/**
 * Sign a request body, producing the envelope the MCP board route verifies.
 *
 * @param body  the request body to wrap + sign (e.g. `{ tasks: [...] }`)
 * @param opts  test seams: `nowMs` (timestamp) and `nonce`. `env` for key lookup.
 * @returns the `{ body, signature, signer_address, nonce, timestamp }` envelope.
 * @throws  if the signing key is unset/malformed — message references only the
 *          env-var name, never key material. Fail-closed by design.
 */
export async function signBoardRequest(
  body: unknown,
  opts: { nowMs?: number; nonce?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<SignedEnvelope> {
  const env = opts.env ?? process.env;
  const account = privateKeyToAccount(resolvePrivateKey(env));
  const nonce = opts.nonce ?? makeNonce();
  const timestamp = new Date(opts.nowMs ?? Date.now()).toISOString();
  const message = buildSigningPayload({ body, nonce, timestamp });
  const signature = await account.signMessage({ message });
  return { body, signature, signer_address: account.address, nonce, timestamp };
}
