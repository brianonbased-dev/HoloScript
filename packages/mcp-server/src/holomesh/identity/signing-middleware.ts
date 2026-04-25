/**
 * Signing-middleware helper — Phase 1.5 wiring (task _wfrt).
 *
 * Bridges the request-signing verifier (../request-signing.ts) and the
 * attestation registry (./attestation-registry.ts) into a single helper that
 * route handlers can call once-per-mutation to:
 *   1. Detect whether the request body is a signed envelope or a legacy
 *      unsigned body (during the 14-day Phase 1 grace period both are
 *      accepted; HOLOMESH_SIGNING_MIGRATION_ACK=1 flips dual-mode → strict).
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
  extractEnvelope,
  verifyEnvelope,
  type SignedEnvelope,
  type VerifyResult,
} from '../request-signing';
import { AttestationRegistry } from './attestation-registry';

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
  /** signer_address from a signed envelope, or null when unsigned. */
  signer: string | null;
  /** Failure reason from request-signing.verifyEnvelope (timestamp-stale, etc). */
  signingReason?: string;
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
}

/**
 * True when the server should reject unsigned mutating requests outright.
 * Default during Phase 1 grace period: false (dual-mode accepts both).
 *
 * Per ADR §Q4: HOLOMESH_SIGNING_MIGRATION_ACK=1 opts a specific machine into
 * the strict-mode rejection path before the global 14-day cutover, so
 * operators can validate the rejection path in production without rushing
 * everyone onto signed-only.
 */
export function isStrictMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.HOLOMESH_SIGNING_MIGRATION_ACK === '1';
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
  const env: SignedEnvelope | null = extractEnvelope(reqBody);
  const registry = options.registry ?? getAttestationRegistry();
  const strict = options.strictMode ?? isStrictMode(options.env);

  if (!env) {
    return {
      effectiveBody: reqBody,
      ctx: {
        signedRequest: false,
        signingValid: !strict,
        signer: null,
        signingReason: strict ? 'unsigned-rejected' : 'unsigned-grace',
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
