/**
 * Signing-middleware helper — Phase 1.5 wiring (task _wfrt).
 *
 * Bridges the request-signing verifier (../request-signing.ts) and the
 * attestation registry (./attestation-registry.ts) into a single helper that
 * route handlers can call once-per-mutation to:
 *   1. Detect whether the request body is a signed envelope or a legacy
 *      unsigned body (strict by default; HOLOMESH_SIGNING_GRACE=1 opts
 *      into the grace period where unsigned requests are still accepted).
 *   2. Verify the cryptographic signature (when present) and the registry
 *      check (when the registry is populated).
 *   3. Return the effective body (unwrapped from the envelope when present)
 *      so existing route logic continues to read body.x without change.
 *   4. Return a SigningContext that the handler attaches to broadcasts /
 *      audit logs / req metadata.
 *
 * The HoloMesh router is a custom dispatcher (handleTeamRoutes), not an
 * Express middleware chain, so this is deliberately a *helper* — the
 * canonical call-site recipe is documented at the bottom of this file.
 *
 * Spec: research/2026-04-21_seat-wallets-adr.md §"Shared — HoloMesh signing
 * protocol", "Server-side verification", "Grace period for legacy unsigned
 * requests".
 *
 * @module holomesh/identity/signing-middleware
 */

import * as http from 'http';
import {
  canonicalizeBody,
  extractEnvelope,
  verifyEnvelope,
  type SignedEnvelope,
  type VerifyResult,
} from '../request-signing';
import { AttestationRegistry } from './attestation-registry';
import {
  parseDualSignatureEnvelope,
  verifyDualSignature,
  type DualSignatureEnvelope,
  type IClassicalVerifier,
  type VerifyDualSignatureResult,
} from './dual-signature-envelope';
import {
  CapabilityTokenError,
  CapabilityTokenRegistry,
  type Capability,
  type StoredCapabilityToken,
} from '@holoscript/secrets-broker';

// ── Singleton registry instance ────────────────────────────────────────

let _registry: AttestationRegistry | null = null;

/**
 * Module-level singleton AttestationRegistry. Lazy-initialized so test code
 * can inject a fresh instance via `setAttestationRegistry`. Production code
 * paths share state across the verifier middleware, the founder dashboard
 * route, and any future audit/replay tools.
 */
export function getAttestationRegistry(): AttestationRegistry {
  if (!_registry) _registry = new AttestationRegistry();
  return _registry;
}

/** Test-only: replace the singleton (e.g. with an SSE-broadcasting variant). */
export function setAttestationRegistry(registry: AttestationRegistry): void {
  _registry = registry;
}

/** Test-only: drop the singleton so the next get() creates a fresh registry. */
export function resetAttestationRegistry(): void {
  _registry = null;
}

// ── Per-request signing context ───────────────────────────────────────

export interface SigningContext {
  /** True when the request body was a {body, signature, ...} envelope. */
  signedRequest: boolean;
  /** True when signature verified AND registry check passed (or was skipped). */
  signingValid: boolean;
  /** signer_address from a signed envelope, or null when unsigned.
   *
   * For dual-envelope `pqc_only` mode this is a synthetic identifier of the
   * form `pqc:<first-16-hex-of-publickey>`; the AttestationRegistry does not
   * yet carry PQC public keys (follow-up task — extend registry with
   * `pqcPublicKey` field). */
  signer: string | null;
  /** Failure reason from request-signing.verifyEnvelope (timestamp-stale, etc). */
  signingReason?: string;
  /** Signing protocol used. `classical` = legacy EIP-191 ECDSA envelope.
   *  `dual` = post-quantum DualSignatureEnvelope (any of its 3 modes).
   *  `capability` = short-lived capability-token Bearer auth (no payload
   *  integrity — caller asserts a single capability scope per request). */
  signingProtocol?: 'classical' | 'dual' | 'capability';
  /** When `signingProtocol='dual'`, which mode the envelope used. */
  dualMode?: 'classical_only' | 'pqc_only' | 'dual';
  /** When `signingProtocol='capability'`, the capability the token was scoped
   *  to for THIS request. The route handler asserted it via `req.capability`;
   *  the registry validated the token grants it. */
  capabilityScope?: Capability;
  /** Convenience alias — granted capability scopes for ForkSandboxGate.
   *  Populated from capabilityScope when present, otherwise empty. */
  scopes?: string[];
}

export interface ExtractAndVerifyResult {
  /** The body the route handler should consume. Unwrapped when signed. */
  effectiveBody: unknown;
  ctx: SigningContext;
}

export interface ExtractAndVerifyOptions {
  /** Override the registry (default: module singleton). */
  registry?: AttestationRegistry;
  /** Override now-ms for deterministic tests. */
  nowMs?: number;
  /** Force strict mode regardless of HOLOMESH_SIGNING_MIGRATION_ACK env. */
  strictMode?: boolean;
  /** Inject env vars for tests (default: process.env). */
  env?: NodeJS.ProcessEnv;
  /** Inject a classical-side verifier for the dual-signature path (default:
   *  ViemClassicalVerifier). Tests use a deterministic mock. */
  classicalVerifier?: IClassicalVerifier;
  /** Inject the capability-token registry for the capability auth path
   *  (default: module singleton). Tests pass a fresh registry. */
  capabilityRegistry?: CapabilityTokenRegistry;
}

// ── Capability-token registry singleton ───────────────────────────────

let _capabilityRegistry: CapabilityTokenRegistry | null = null;

/**
 * Module-level singleton CapabilityTokenRegistry. Same lazy-init pattern as
 * the AttestationRegistry singleton above — production paths share state
 * across the verifier middleware, the broker-issued mint route, and the
 * broker-revoke route.
 */
export function getCapabilityRegistry(): CapabilityTokenRegistry {
  if (!_capabilityRegistry) _capabilityRegistry = new CapabilityTokenRegistry();
  return _capabilityRegistry;
}

/** Test-only: replace the singleton. */
export function setCapabilityRegistry(registry: CapabilityTokenRegistry): void {
  _capabilityRegistry = registry;
}

/** Test-only: drop the singleton. */
export function resetCapabilityRegistry(): void {
  _capabilityRegistry = null;
}

// ── Capability-token header resolver ────────────────────────────────────

export interface CapabilityHeaderResult {
  token: StoredCapabilityToken | null;
  error?: string;
}

/**
 * Resolve a capability token presented in the `Authorization` header.
 *
 * Expected format: `Authorization: Bearer <tokenId>:<tokenSecret>`
 *
 * Regular API keys (no colon separator) are ignored — callers should fall
 * through to legacy Bearer resolution (e.g. `resolveRequestingAgent`).
 *
 * On success, returns the stored token record. On failure because a token
 * was presented but invalid, returns `{ token: null, error: <reason> }`.
 * When no capability token is present at all, returns `{ token: null }`.
 */
export function resolveCapabilityFromHeader(
  req: http.IncomingMessage,
  needsCapability: Capability
): CapabilityHeaderResult {
  const auth = req.headers['authorization'];
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    return { token: null };
  }
  const bearer = auth.slice(7).trim();

  // Capability tokens use `<tokenId>:<tokenSecret>` format.
  // Regular API keys do not contain a colon in this position.
  const colonIdx = bearer.indexOf(':');
  if (colonIdx === -1) {
    return { token: null };
  }

  const tokenId = bearer.slice(0, colonIdx);
  const tokenSecret = bearer.slice(colonIdx + 1);

  const registry = getCapabilityRegistry();
  try {
    registry.validateById(tokenId, tokenSecret, needsCapability);
    const stored = registry.get(tokenId);
    return { token: stored ?? null };
  } catch (err) {
    if (err instanceof CapabilityTokenError) {
      return { token: null, error: capabilityTokenErrorToSigningReason(err) };
    }
    throw err;
  }
}

// ── Dual-signature envelope request shape ─────────────────────────────
//
// Callers signal opt-in to the dual-sig path with an `envelope_type: 'dual'`
// discriminator on the request body. This keeps the legacy classical envelope
// shape (`{body, signature, signer_address, nonce, timestamp}`) untouched —
// existing callers continue to work, dual-capable callers opt in explicitly.
//
// Canonicalization MUST match the signer side: `canonicalizeBody({body,
// nonce, timestamp})` from request-signing.ts. Identical canonicalizer means
// the signer's payload hash and the verifier's recomputed hash agree, which
// is what the DualSignatureEnvelope.payloadHash field commits to.
//
export interface DualEnvelopeRequestBody {
  envelope_type: 'dual';
  /** Base64-encoded bytes of a serialized DualSignatureEnvelope. */
  envelope_b64: string;
  /** The actual payload the handler will consume. */
  body: unknown;
  /** Replay-protection nonce (mirrors classical envelope). */
  nonce: string;
  /** RFC 3339 timestamp (mirrors classical envelope). */
  timestamp: string;
}

export function isDualEnvelopeBody(b: unknown): b is DualEnvelopeRequestBody {
  if (b === null || typeof b !== 'object') return false;
  const obj = b as Record<string, unknown>;
  return (
    obj.envelope_type === 'dual' &&
    typeof obj.envelope_b64 === 'string' &&
    typeof obj.nonce === 'string' &&
    typeof obj.timestamp === 'string'
  );
}

// ── Capability-token envelope request shape ─────────────────────────────
//
// Third auth shape — used by surfaces that cannot easily sign (mobile,
// headless reduced-trust), and for high-volume read operations where the
// signing overhead is excessive. Caller MUST declare `capability` so the
// registry can enforce scope. The token itself carries the set of granted
// capabilities; this request asserts which ONE of them is being exercised
// right now.
//
// Trade-off vs signed envelopes: a capability token proves IDENTITY but
// NOT PAYLOAD INTEGRITY. An attacker who steals the token can mint
// arbitrary requests up to the token's granted capabilities. Route
// handlers that mutate high-trust state (mesh:sign, protocol:publish)
// should require signed envelopes regardless of capability scope.
//
export interface CapabilityEnvelopeRequestBody {
  envelope_type: 'capability';
  /** Token id (e.g. `captok_a1b2c3...`). */
  token_id: string;
  /** Plaintext token secret. Hashed internally before comparison. */
  token_secret: string;
  /** The actual payload the handler will consume. */
  body: unknown;
  /** Capability the caller is exercising. Must be in the token's granted set. */
  capability: Capability;
}

export function isCapabilityEnvelopeBody(b: unknown): b is CapabilityEnvelopeRequestBody {
  if (b === null || typeof b !== 'object') return false;
  const obj = b as Record<string, unknown>;
  return (
    obj.envelope_type === 'capability' &&
    typeof obj.token_id === 'string' &&
    typeof obj.token_secret === 'string' &&
    typeof obj.capability === 'string'
  );
}

/** Map a CapabilityTokenError.code to a stable SigningContext.signingReason. */
function capabilityTokenErrorToSigningReason(err: CapabilityTokenError): string {
  switch (err.code) {
    case 'TOKEN_REVOKED':
      return 'capability-token-revoked';
    case 'TOKEN_EXPIRED':
      return 'capability-token-expired';
    case 'TOKEN_INVALID_SECRET':
      return 'capability-token-invalid';
    case 'CAPABILITY_NOT_IN_TRUST_TIER':
      return 'capability-not-granted';
    default:
      return `capability-error-${err.code}`;
  }
}

/** Decode base64 -> bytes. Returns null on malformed input. */
function base64Decode(s: string): Uint8Array | null {
  try {
    const buf = Buffer.from(s, 'base64');
    // Round-trip sanity check: base64 silently ignores invalid chars; require
    // that re-encoding produces the same string modulo padding (so a caller
    // can't smuggle arbitrary bytes via non-base64 input).
    if (buf.toString('base64').replace(/=+$/, '') !== s.replace(/=+$/, '')) {
      return null;
    }
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** Map a DualSignatureEnvelope to a SigningContext.signer string.
 *
 * For `classical_only` / `dual`: returns the 0x-Ethereum address.
 * For `pqc_only`: returns `pqc:<first-16-hex-of-publickey>` (synthetic id —
 * registry-side PQC support is a follow-up task). */
function dualEnvelopeSignerId(env: DualSignatureEnvelope): string {
  if (env.mode === 'classical_only' || env.mode === 'dual') {
    return env.classicalSignerAddress;
  }
  // pqc_only — derive a short stable identifier from the public key.
  let hex = '';
  const slice = env.pqcPublicKey.slice(0, 8);
  for (let i = 0; i < slice.length; i++) {
    hex += slice[i].toString(16).padStart(2, '0');
  }
  return `pqc:${hex}`;
}

/** Map a VerifyDualSignatureResult.reason to a SigningContext.signingReason. */
function dualReasonToSigningReason(r: VerifyDualSignatureResult): string | undefined {
  if (r.valid) return undefined;
  switch (r.reason) {
    case 'payload-hash-mismatch':
      return 'dual-payload-tampered';
    case 'classical-signature-invalid':
      return 'dual-classical-invalid';
    case 'pqc-signature-invalid':
      return 'dual-pqc-invalid';
    case 'classical-verify-threw':
      return 'dual-classical-verify-threw';
    case 'pqc-verify-threw':
      return 'dual-pqc-verify-threw';
    case 'unsupported-classical-algo':
      return 'dual-unsupported-classical-algo';
    case 'unsupported-pqc-algo':
      return 'dual-unsupported-pqc-algo';
    case 'mode-mismatch':
      return 'dual-mode-mismatch';
    default:
      return 'dual-verify-failed';
  }
}

/**
 * Duration of the Phase 3 grace period in milliseconds. Unsigned requests
 * are accepted for this long after `HOLOMESH_SIGNING_DEPLOY_DATE`, then
 * automatically rejected. Per ADR §Q4 the window is 14 days.
 */
export const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * True when the server should reject unsigned mutating requests outright.
 *
 * Phase 3 strict-by-default: unsigned requests are rejected unless the
 * operator explicitly opts out. Two escape hatches, either sufficient:
 *
 *   1. **Explicit opt-out**: `HOLOMESH_SIGNING_GRACE=1` disables strict mode
 *      for machines that are not yet sending signed requests. Set this
 *      temporarily during rollout until all clients are signing.
 *
 *   2. **Timed cutover**: when `HOLOMESH_SIGNING_DEPLOY_DATE` is set (ISO
 *      8601 date string) and the current time is past `deployDate + 14 days`,
 *      unsigned requests are automatically rejected regardless of GRACE.
 *      This implements the Phase 3 14-day migration window from ADR §Q4.
 *
 * Migration note (2026-05-14): the old `HOLOMESH_SIGNING_MIGRATION_ACK=1`
 * opt-in is no longer checked — strict mode is now the default. Remove
 * MIGRATION_ACK from deployment configs; it has no effect.
 */
export function isStrictMode(env: NodeJS.ProcessEnv = process.env, nowMs: number = Date.now()): boolean {
  // Phase 3: strict mode is ON by default. Set GRACE=1 to opt out during
  // the transition period (for machines not yet sending signed requests).
  if (env.HOLOMESH_SIGNING_GRACE === '1') return false;

  // Timed cutover: automatic strict mode after the 14-day grace period.
  // This is redundant when strict is already the default, but kept as a
  // safety net for configs that set DEPLOY_DATE without GRACE=1.
  const deployDateStr = env.HOLOMESH_SIGNING_DEPLOY_DATE;
  if (deployDateStr) {
    const deployMs = Date.parse(deployDateStr);
    if (!Number.isNaN(deployMs) && nowMs >= deployMs + GRACE_PERIOD_MS) {
      return true;
    }
  }

  // Default: strict mode ON (signed attribution required).
  return true;
}

/**
 * Extract a signing envelope from a request body and verify it against the
 * attestation registry. Returns the effective body (unwrapped) plus a
 * SigningContext that route handlers attach to broadcasts / audit logs.
 *
 * Failure modes:
 *   - body is unsigned + strict-mode → ctx.signingValid=false, reason='unsigned-rejected'
 *   - body is unsigned + GRACE=1    → ctx.signingValid=true (Phase 3 grace),
 *     reason='unsigned-grace'
 *   - body is signed + envelope verifies + registry attests → signingValid=true
 *   - any verifier failure → signingValid=false, reason from verifyEnvelope
 *     (timestamp-stale / signature-mismatch / signer-retired / signer-not-attested)
 */
export async function extractAndVerifySigning(
  reqBody: unknown,
  options: ExtractAndVerifyOptions = {}
): Promise<ExtractAndVerifyResult> {
  const strict = options.strictMode ?? isStrictMode(options.env, options.nowMs);

  // ── Capability-token envelope path (Bearer-style, mobile/headless) ──
  //
  // Detected first because envelope_type='capability' makes the discrimination
  // unambiguous and the registry lookup is cheap. Callers exercising
  // high-trust capabilities (mesh:sign / protocol:publish) should still
  // require a signed envelope — capability scoping is at the route-handler
  // boundary, not here.
  if (isCapabilityEnvelopeBody(reqBody)) {
    return verifyCapabilityEnvelopeRequest(reqBody, options);
  }

  // ── Dual-signature envelope path (post-quantum opt-in) ──────────
  //
  // Detect dual-envelope shape next so the legacy `extractEnvelope` doesn't
  // misread `envelope_b64` as a classical signature field. The dual path is
  // strictly opt-in (caller sets envelope_type='dual'); legacy callers fall
  // through to the classical path below with no behavior change.
  if (isDualEnvelopeBody(reqBody)) {
    return verifyDualEnvelopeRequest(reqBody, options);
  }

  const env: SignedEnvelope | null = extractEnvelope(reqBody);
  const registry = options.registry ?? getAttestationRegistry();

  if (!env) {
    return {
      effectiveBody: reqBody,
      ctx: {
        signedRequest: false,
        signingValid: !strict,
        signer: null,
        signingReason: strict ? 'unsigned-rejected' : 'unsigned-grace',
        signingProtocol: 'classical',
      },
    };
  }

  // Only consult the registry when it has at least one attestation —
  // an empty registry during early Phase 1.5 would reject every signer.
  // This makes the substrate land safely before the founder dashboard
  // populates real attestations.
  const useRegistry = registry.size() > 0;
  const verifyOptions = useRegistry
    ? { nowMs: options.nowMs, registryCheck: registry.toRegistryCheck(options.nowMs) }
    : { nowMs: options.nowMs };

  const result: VerifyResult = await verifyEnvelope(env, verifyOptions);
  return {
    effectiveBody: env.body,
    ctx: {
      signedRequest: true,
      signingValid: result.valid,
      signer: result.signer,
      signingReason: result.reason,
      signingProtocol: 'classical',
    },
  };
}

// ── Dual-signature envelope verification path ─────────────────────────

/**
 * Verify a dual-signature request body. Called by `extractAndVerifySigning`
 * when the body shape matches `DualEnvelopeRequestBody`.
 *
 * Reuses the verifier from `dual-signature-envelope.ts` so all envelope rules
 * (mode invariants, algorithm-tag checks, payload-hash recomputation) are
 * enforced consistently with the signer side.
 *
 * Canonicalization: `canonicalizeBody({body, nonce, timestamp})` — identical
 * to the classical envelope's signed payload, so a caller can switch from
 * classical to dual without changing how they canonicalize.
 */
export async function verifyDualEnvelopeRequest(
  req: DualEnvelopeRequestBody,
  options: ExtractAndVerifyOptions = {}
): Promise<ExtractAndVerifyResult> {
  // Decode the envelope bytes.
  const envBytes = base64Decode(req.envelope_b64);
  if (!envBytes) {
    return {
      effectiveBody: req.body,
      ctx: {
        signedRequest: true,
        signingValid: false,
        signer: null,
        signingReason: 'dual-envelope-base64-malformed',
        signingProtocol: 'dual',
      },
    };
  }

  // Parse the envelope.
  const parsed = parseDualSignatureEnvelope(envBytes);
  if (!parsed.ok) {
    return {
      effectiveBody: req.body,
      ctx: {
        signedRequest: true,
        signingValid: false,
        signer: null,
        signingReason: `dual-envelope-parse-${parsed.reason}`,
        signingProtocol: 'dual',
      },
    };
  }

  // Canonicalize the payload identically to the classical signing protocol.
  const canonical = canonicalizeBody({
    body: req.body,
    nonce: req.nonce,
    timestamp: req.timestamp,
  });
  const payloadBytes = new TextEncoder().encode(canonical);

  // Verify (recomputes SHA-256 internally, checks against envelope.payloadHash).
  const result = await verifyDualSignature(parsed.envelope, payloadBytes, {
    classicalVerifier: options.classicalVerifier,
  });

  if (!result.valid) {
    return {
      effectiveBody: req.body,
      ctx: {
        signedRequest: true,
        signingValid: false,
        signer: null,
        signingReason: dualReasonToSigningReason(result),
        signingProtocol: 'dual',
        dualMode: parsed.envelope.mode,
      },
    };
  }

  // ── Registry checks (only when registry is populated — Phase 1.5 safe-default) ──
  //
  // Same safe-default as the classical path: an empty registry during early
  // rollout should not reject every signer. Once any attestation is registered,
  // checks become enforcing for that signer's mode.
  const registry = options.registry ?? getAttestationRegistry();
  const useRegistry = registry.size() > 0;
  if (useRegistry) {
    const env = parsed.envelope;
    if (env.mode === 'classical_only') {
      const check = registry.toRegistryCheck(options.nowMs);
      const r = await check(env.classicalSignerAddress);
      if (!r.attested) {
        return {
          effectiveBody: req.body,
          ctx: {
            signedRequest: true,
            signingValid: false,
            signer: null,
            signingReason: r.reason ?? 'signer-not-attested',
            signingProtocol: 'dual',
            dualMode: env.mode,
          },
        };
      }
    } else if (env.mode === 'pqc_only') {
      const pqcCheck = registry.toPqcRegistryCheck(options.nowMs);
      const r = await pqcCheck(env.pqcPublicKey);
      if (!r.attested) {
        return {
          effectiveBody: req.body,
          ctx: {
            signedRequest: true,
            signingValid: false,
            signer: null,
            signingReason: r.reason ?? 'signer-not-attested',
            signingProtocol: 'dual',
            dualMode: env.mode,
          },
        };
      }
    } else {
      // dual mode — cross-verify both keys map to the SAME attestation.
      const cross = registry.crossVerifyDual(
        env.classicalSignerAddress,
        env.pqcPublicKey,
        options.nowMs
      );
      if (!cross.matched) {
        return {
          effectiveBody: req.body,
          ctx: {
            signedRequest: true,
            signingValid: false,
            signer: null,
            signingReason: cross.reason,
            signingProtocol: 'dual',
            dualMode: env.mode,
          },
        };
      }
    }
  }

  // Signer resolution: when the registry has an entry for this signer, prefer
  // the canonical (lowercased) 0x-Ethereum-address — that's the form the
  // registry stored on attest(). Works for all 3 modes:
  //   - `classical_only` / `dual`: look up by the envelope's address
  //   - `pqc_only`: look up by the PQC public key
  // Falls back to the raw envelope address (or synthetic pqc:<hex> id) when
  // the registry is empty or doesn't have an entry.
  let signer = dualEnvelopeSignerId(parsed.envelope);
  if (useRegistry) {
    const env = parsed.envelope;
    if (env.mode === 'pqc_only') {
      const att = registry.lookupByPqcKey(env.pqcPublicKey);
      if (att) signer = att.publicKey;
    } else {
      const att = registry.lookup(env.classicalSignerAddress);
      if (att) signer = att.publicKey;
    }
  }

  return {
    effectiveBody: req.body,
    ctx: {
      signedRequest: true,
      signingValid: true,
      signer,
      signingReason: undefined,
      signingProtocol: 'dual',
      dualMode: parsed.envelope.mode,
    },
  };
}

// ── Capability-token envelope verification path ───────────────────────

/**
 * Verify a capability-token request body. Called by `extractAndVerifySigning`
 * when the body shape matches `CapabilityEnvelopeRequestBody`.
 *
 * Looks up the token in the CapabilityTokenRegistry and validates:
 *   - token exists
 *   - presented secret hashes match the stored hash
 *   - token is not revoked
 *   - token is not expired (vs `options.nowMs`)
 *   - the requested `capability` is in the token's granted set
 *
 * On any failure, returns a SigningContext with `signingValid=false` and a
 * structured `signingReason` (capability-token-revoked / -expired / -invalid
 * / capability-not-granted). On success, the `signer` is the token's
 * `handle` (e.g. `mobile1`) — NOT an Ethereum address (capability tokens
 * are surface-bound, not wallet-bound).
 */
export async function verifyCapabilityEnvelopeRequest(
  req: CapabilityEnvelopeRequestBody,
  options: ExtractAndVerifyOptions = {}
): Promise<ExtractAndVerifyResult> {
  const registry = options.capabilityRegistry ?? getCapabilityRegistry();
  const nowDate = options.nowMs !== undefined ? new Date(options.nowMs) : new Date();

  try {
    registry.validateById(req.token_id, req.token_secret, req.capability, nowDate);
  } catch (err) {
    if (err instanceof CapabilityTokenError) {
      return {
        effectiveBody: req.body,
        ctx: {
          signedRequest: true,
          signingValid: false,
          signer: null,
          signingReason: capabilityTokenErrorToSigningReason(err),
          signingProtocol: 'capability',
          capabilityScope: req.capability,
        },
      };
    }
    // Non-CapabilityTokenError — re-throw; callers will surface as 500.
    throw err;
  }

  // Validation passed. Surface the token's handle as the signer.
  const stored = registry.get(req.token_id);
  // stored must be defined here — validateById would have thrown otherwise.
  const signer = stored ? stored.handle : null;

  return {
    effectiveBody: req.body,
    ctx: {
      signedRequest: true,
      signingValid: true,
      signer,
      signingProtocol: 'capability',
      capabilityScope: req.capability,
    },
  };
}

// ── requireCapability — authorization helper for capability-gated handlers ──

/**
 * Result of a capability-authorization check. Discriminated union so callers
 * branch on `authorized` and get type-narrowed access to either `signer` or
 * `reason`.
 */
export type AuthorizationResult =
  | { authorized: true; signer: string; protocol: 'classical' | 'dual' | 'capability' }
  | { authorized: false; reason: AuthorizationFailureReason };

/**
 * Stable reason strings handlers can match on for HTTP response shaping.
 * - `unsigned`              : request had no signing envelope at all (grace mode left signedRequest=false)
 * - `signing-invalid`       : envelope failed verification (signature mismatch, expired, etc.)
 * - `capability-scope-mismatch`: capability token DID NOT grant the requested capability
 * - `capability-required`   : route requires capability-token scoping; caller used classical/dual without the explicit allow flag
 * - `unknown-protocol`      : SigningContext.signingProtocol was unset (legacy unset path) or an unrecognized value
 */
export type AuthorizationFailureReason =
  | 'unsigned'
  | 'signing-invalid'
  | 'capability-scope-mismatch'
  | 'capability-required'
  | 'unknown-protocol';

export interface RequireCapabilityOptions {
  /**
   * If true, accept a classical-envelope SigningContext WITHOUT
   * capability-scope checking. Default `false` — classical envelopes carry
   * identity but no scope, so capability-gated routes must opt in explicitly.
   */
  allowClassical?: boolean;
  /**
   * If true, accept a dual-envelope SigningContext WITHOUT capability-scope
   * checking. Default `true` — dual envelopes are the strongest identity
   * proof in the system; routes that opt out of dual should be rare.
   */
  allowDual?: boolean;
}

/**
 * Verify that a route caller is authorized to exercise `capability` against
 * a verified `SigningContext`.
 *
 * Semantics by `ctx.signingProtocol`:
 * - `capability`: authorized iff `ctx.capabilityScope === capability`.
 *   Capability tokens carry explicit scope; the registry already enforced
 *   that the scope is in the token's granted set at validate time.
 * - `dual`     : authorized when `options.allowDual !== false` (default true).
 *   Dual envelopes don't carry per-request capability scope, but they prove
 *   the strongest identity available — routes typically trust dual signers.
 * - `classical`: authorized when `options.allowClassical === true`.
 *   Default-off: classical signers must explicitly be admitted, since they
 *   don't carry per-request scope and run the legacy ECDSA path.
 *
 * Refuses outright when the caller is unsigned (`!ctx.signedRequest`) or when
 * the signing path failed (`!ctx.signingValid`) — regardless of what
 * `capability` the route asks for. These should never reach `requireCapability`
 * in normal flow (the verifier middleware would have rejected first), but
 * the guard catches mis-wired handlers.
 *
 * Designed to be one-liner-easy at the call site:
 *
 *   const auth = requireCapability(ctx, 'secrets:grant.create');
 *   if (!auth.authorized) return json(res, 401, { error: auth.reason });
 *   // …handler runs with auth.signer + auth.protocol attached to logs…
 *
 * Companion to the F.051 canary task_1778596074561_adcf — adopting this
 * helper closes the holo_secrets_* authorization gap with a single line
 * per handler.
 */
export function requireCapability(
  ctx: SigningContext,
  capability: Capability,
  options: RequireCapabilityOptions = {}
): AuthorizationResult {
  if (!ctx.signedRequest) {
    return { authorized: false, reason: 'unsigned' };
  }
  if (!ctx.signingValid) {
    return { authorized: false, reason: 'signing-invalid' };
  }
  if (!ctx.signer) {
    // Defense-in-depth: signingValid=true implies signer should be set.
    // If a future code path lands an inconsistent ctx, treat it as failure.
    return { authorized: false, reason: 'signing-invalid' };
  }

  switch (ctx.signingProtocol) {
    case 'capability':
      if (ctx.capabilityScope === capability) {
        return { authorized: true, signer: ctx.signer, protocol: 'capability' };
      }
      return { authorized: false, reason: 'capability-scope-mismatch' };

    case 'dual':
      if (options.allowDual !== false) {
        return { authorized: true, signer: ctx.signer, protocol: 'dual' };
      }
      return { authorized: false, reason: 'capability-required' };

    case 'classical':
      if (options.allowClassical === true) {
        return { authorized: true, signer: ctx.signer, protocol: 'classical' };
      }
      return { authorized: false, reason: 'capability-required' };

    default:
      // ctx.signingProtocol is undefined or an unexpected value. Fail closed.
      return { authorized: false, reason: 'unknown-protocol' };
  }
}

// ── Canonical call-site recipe (documentation) ────────────────────────
//
// Inside a mutating handler in routes/team-routes.ts (or any other
// HoloMesh route file):
//
//   const rawBody = await parseJsonBody(req);
//   const { effectiveBody, ctx } = await extractAndVerifySigning(rawBody);
//   if (!ctx.signingValid) {
//     return json(res, 401, {
//       error: 'signing-rejected',
//       reason: ctx.signingReason,
//     });
//   }
//   // …existing handler reads effectiveBody.x as before…
//   broadcastToRoom(teamId, {
//     type: 'team:join',
//     agent: caller.name,
//     data: {
//       …,
//       signer: ctx.signer,        // null when unsigned-grace
//       signedRequest: ctx.signedRequest,
//     },
//   });
//
// Phase 3 strict-by-default: unsigned requests are rejected unless
// HOLOMESH_SIGNING_GRACE=1 is set. Signed callers get richer attribution
// and pass verification. Set GRACE=1 during rollout until all clients sign.
