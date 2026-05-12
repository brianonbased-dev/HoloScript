/**
 * Signing-middleware helper — Phase 1.5 wiring (task _wfrt).
 *
 * Bridges the request-signing verifier (../request-signing.ts) and the
 * attestation registry (./attestation-registry.ts) into a single helper that
 * route handlers can call once-per-mutation to:
 *   1. Detect whether the request body is a signed envelope or a legacy
 *      unsigned body (during the 14-day Phase 3 grace period both are
 *      accepted; HOLOMESH_SIGNING_MIGRATION_ACK=1 or elapsed grace period
 *      flips dual-mode → strict).
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
   *  `dual` = post-quantum DualSignatureEnvelope (any of its 3 modes). */
  signingProtocol?: 'classical' | 'dual';
  /** When `signingProtocol='dual'`, which mode the envelope used. */
  dualMode?: 'classical_only' | 'pqc_only' | 'dual';
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
 * Two independent triggers, either sufficient:
 *
 *   1. **Early opt-in**: `HOLOMESH_SIGNING_MIGRATION_ACK=1` opts a specific
 *      machine into the strict-mode rejection path before the global 14-day
 *      cutover — operators can validate the rejection path in production
 *      without rushing everyone onto signed-only.
 *
 *   2. **Timed cutover**: when `HOLOMESH_SIGNING_DEPLOY_DATE` is set (ISO 8601
 *      date string, e.g. `2026-05-01` or `2026-05-01T00:00:00Z`) and the
 *      current time is past `deployDate + 14 days`, unsigned requests are
 *      automatically rejected. This implements the Phase 3 14-day migration
 *      window from ADR §Q4.
 *
 * During the grace period (deploy date set but < 14 days elapsed and no
 * MIGRATION_ACK), the server runs in dual-mode: both signed and unsigned
 * requests are accepted, with unsigned ones logged as `unsigned-grace`.
 */
export function isStrictMode(env: NodeJS.ProcessEnv = process.env, nowMs: number = Date.now()): boolean {
  // Early opt-in: per-machine strict mode for testing the rejection path.
  if (env.HOLOMESH_SIGNING_MIGRATION_ACK === '1') return true;

  // Timed cutover: automatic strict mode after the 14-day grace period.
  const deployDateStr = env.HOLOMESH_SIGNING_DEPLOY_DATE;
  if (deployDateStr) {
    const deployMs = Date.parse(deployDateStr);
    if (!Number.isNaN(deployMs) && nowMs >= deployMs + GRACE_PERIOD_MS) {
      return true;
    }
  }

  return false;
}

/**
 * Extract a signing envelope from a request body and verify it against the
 * attestation registry. Returns the effective body (unwrapped) plus a
 * SigningContext that route handlers attach to broadcasts / audit logs.
 *
 * Failure modes:
 *   - body is unsigned + strict-mode → ctx.signingValid=false, reason='unsigned-rejected'
 *   - body is unsigned + dual-mode  → ctx.signingValid=true (Phase 1 grace),
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

  // ── Dual-signature envelope path (post-quantum opt-in) ──────────
  //
  // Detect dual-envelope shape FIRST so the legacy `extractEnvelope` doesn't
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

  return {
    effectiveBody: req.body,
    ctx: {
      signedRequest: true,
      signingValid: result.valid,
      signer: result.valid ? dualEnvelopeSignerId(parsed.envelope) : null,
      signingReason: dualReasonToSigningReason(result),
      signingProtocol: 'dual',
      dualMode: parsed.envelope.mode,
    },
  };
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
// The dual-mode default (no HOLOMESH_SIGNING_MIGRATION_ACK=1) means existing
// callers keep working without code changes; signed callers get richer
// attribution. After the 14-day cutover ADR §Q4 the default flips to strict.
