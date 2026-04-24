/**
 * Tier 2 Self-Custody Export Escape-Hatch — API layer (task_1776990890662_ards).
 *
 * Spec: research/2026-04-23_tier2-self-custody-export-escape-hatch-v3.md
 *   §"API contract (proposed)" — prepare / package / finalize
 *   §"User-facing flow" — step-up auth + single transaction boundary
 *   §"Non-negotiable invariants" — 1-4
 *   §"Acceptance tests" — #1 happy path, #2 expired, #3 replay, #4 bad proof
 *
 * Depends on:
 *   - export-session.ts (task_1776990890662_2bpv, commit 0b8deb2cd) — session model
 *   - export-package.ts (task_1776990890662_jdz1, commit 4ef856407) — crypto half
 *   - atomic-registry transition (task_1776990890662_dny4, PENDING) — stubbed here;
 *     see `retireCustodialSigner` below. When _dny4 lands, replace the stub with the
 *     real call and the happy-path test's "stub retired-id" assertion becomes real.
 *
 * Design notes:
 *   1. "Authenticated GitHub session" in the v3 spec maps to this server's bearer-
 *      token auth (requireAuth → keyRegistry → RegisteredAgent). The user-facing
 *      studio/web surface is responsible for routing GitHub OAuth down to a bearer
 *      token; this layer doesn't re-authenticate against GitHub. If that layering
 *      changes, swap the guard in prepareHandler.
 *
 *   2. Step-up 2FA (spec Invariant #4): this server does NOT currently ship a 2FA
 *      layer. The prepare handler gates on `REQUIRE_2FA` env — when set truthy, a
 *      `two_factor_token` is required in the request body. Token verification is
 *      delegated to a stub (`verifyTwoFactorToken`) that only accepts tokens shaped
 *      like `2fa:<non-empty>` in dev; production swap lands with the 2FA service.
 *      Skipping 2FA is logged loudly so the gap is never silent.
 *
 *   3. Rate-limit on /prepare (spec rate-limit): 3/hour per authenticated agent.
 *      Implemented with an in-memory sliding window (prepareAttemptsByAgent). If
 *      the server restarts, limits reset — the limit exists for enumeration defense,
 *      not for billing, so an in-memory window is acceptable. A future Redis-backed
 *      layer can replace this without touching the handler.
 *
 *   4. Invariant #1 (one active signing authority per user): the finalize handler
 *      checks the user's current `custody_mode`. If already `self_custody_active`,
 *      finalize returns 409 without mutating anything. The atomic-registry layer
 *      (_dny4) will own the authoritative transition; this layer holds a shadow
 *      Map so the invariant is enforceable before _dny4 ships.
 *
 *   5. Invariant #2 (one-time consumable): the session module (_2bpv) tracks
 *      `status` transitions. Once `markExportSessionPackaged` runs, calling package
 *      again returns the 'replay' branch via idempotency keys; finalize requires
 *      status === 'packaged' and rejects if session is already 'finalized' or
 *      'expired'.
 */

import type http from 'http';
import * as crypto from 'crypto';
import { json, parseJsonBody } from '../utils';
import { requireAuth } from '../auth-utils';
import {
  exportSessionStore,
  persistExportSessionStore,
} from '../state';
import {
  createExportSession,
  isExportSessionExpired,
  markExportSessionFinalized,
  markExportSessionPackaged,
  pruneExpiredExportSessions,
  registerIdempotencyKey,
} from '../export-session';
import {
  buildExportPackage,
  generatePlatformKeypair,
  type ExportPackage,
} from '../export-package';
import type { ExportSession } from '../types';
import {
  retireCustodialSigner as registryRetireCustodialSigner,
  isSelfCustodyActive,
  _getUserCustodyModeForTests,
  _setUserCustodyModeForTests,
  _resetCustodyRegistryForTests,
  type CustodyMode as RegistryCustodyMode,
  type RetirementResult as RegistryRetirementResult,
} from '../identity/custody-registry';

// ── Constants ─────────────────────────────────────────────────────────────────

const PREPARE_RATE_LIMIT_COUNT = 3;
const PREPARE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EXPORT_SESSION_TTL_MS = 15 * 60 * 1000; // 15 min (matches spec "short-lived")

// Route paths (canonical — referenced by tests)
export const ROUTE_PREPARE = '/api/identity/self-custody/export/prepare';
export const ROUTE_PACKAGE = '/api/identity/self-custody/export/package';
export const ROUTE_FINALIZE = '/api/identity/self-custody/export/finalize';

// ── Custody state (owned by identity/custody-registry.ts after _dny4) ────────

/** Re-exported so downstream callers that typed on this module's CustodyMode
 *  don't break. Authoritative type lives in custody-registry.ts. */
export type CustodyMode = RegistryCustodyMode;

/**
 * BACK-COMPAT shim. Tests and legacy callers imported `userCustodyMode` as a
 * Map from this module. _dny4 moved the authoritative store into
 * identity/custody-registry.ts. This Proxy wraps the registry test helpers
 * so existing code (`userCustodyMode.get(id)`, `userCustodyMode.set(id, m)`,
 * `userCustodyMode.clear()`) keeps working without changes.
 *
 * New code should import `isSelfCustodyActive` / `requireCustodial` /
 * `_setUserCustodyModeForTests` from custody-registry directly.
 */
export const userCustodyMode: Pick<
  Map<string, CustodyMode>,
  'get' | 'set' | 'clear' | 'has'
> = {
  get: (userId: string) => _getUserCustodyModeForTests(userId),
  set: (userId: string, mode: CustodyMode) => {
    _setUserCustodyModeForTests(userId, mode);
    return userCustodyMode;
  },
  clear: () => {
    // Delegates to the registry test reset. A tighter reset (clear only the
    // custody-mode map) is intentionally not exposed — tests should use
    // `_resetCustodyRegistryForTests` to reset the full registry instead.
    _resetCustodyRegistryForTests();
  },
  has: (userId: string) => _getUserCustodyModeForTests(userId) !== undefined,
} as unknown as Pick<Map<string, CustodyMode>, 'get' | 'set' | 'clear' | 'has'>;

/** Per-user prepare-attempt timestamps for rate-limiting (enumeration defense). */
const prepareAttemptsByAgent: Map<string, number[]> = new Map();

/** Platform Ed25519 keypair used to sign issued packages. Generated at module load
 *  for dev/test. Production swaps via env (see getPlatformSigningKey). */
let _platformKeypair: { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } | null = null;

function getPlatformSigningKey(): { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject } {
  if (_platformKeypair) return _platformKeypair;

  // Production path: PEM in env. The env-var name tracks the seat-signing pattern
  // (see S.IDENT Dim-2 / scripts/seat-signing-env.mjs). Not required for dev.
  const envPrivPem = process.env.HOLOMESH_EXPORT_PLATFORM_PRIVATE_KEY_PEM;
  const envPubPem = process.env.HOLOMESH_EXPORT_PLATFORM_PUBLIC_KEY_PEM;
  if (envPrivPem && envPubPem) {
    _platformKeypair = {
      privateKey: crypto.createPrivateKey(envPrivPem),
      publicKey: crypto.createPublicKey(envPubPem),
    };
    return _platformKeypair;
  }

  // Dev/test fallback: generate an ephemeral keypair. Log so operators spot when
  // this accidentally runs in prod.
  _platformKeypair = generatePlatformKeypair();
  console.warn(
    '[identity-export] No HOLOMESH_EXPORT_PLATFORM_PRIVATE_KEY_PEM in env — using ephemeral keypair. ' +
      'Issued packages will not verify across server restarts. Set the env var in production.'
  );
  return _platformKeypair;
}

// ── Step-up 2FA (stub — swap when 2FA service lands) ─────────────────────────

/**
 * Spec Invariant #4: Export requires step-up 2FA even for authenticated users.
 * Current server has no 2FA layer. This stub is the integration seam:
 *   - When `REQUIRE_2FA=true`, prepare requires `two_factor_token` in body and
 *     validates shape via this function.
 *   - When `REQUIRE_2FA` is unset, prepare skips 2FA but logs a WARN so the
 *     gap is observable in production logs.
 *   - Production swap: replace the body of this function with a call to the
 *     2FA service (TOTP verify, WebAuthn attestation, etc.). The route contract
 *     stays the same.
 */
function verifyTwoFactorToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  // Dev-shape: `2fa:<non-empty>` — forces token to be present and distinguishable
  // from the bearer token. Real impl swaps here.
  return /^2fa:.+/.test(token.trim());
}

function twoFactorRequired(): boolean {
  const v = (process.env.REQUIRE_2FA || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

// ── Rate limiting ────────────────────────────────────────────────────────────

function checkPrepareRateLimit(agentId: string, now = Date.now()): boolean {
  const attempts = prepareAttemptsByAgent.get(agentId) || [];
  const cutoff = now - PREPARE_RATE_LIMIT_WINDOW_MS;
  const windowed = attempts.filter((ts) => ts > cutoff);
  if (windowed.length >= PREPARE_RATE_LIMIT_COUNT) {
    prepareAttemptsByAgent.set(agentId, windowed);
    return false;
  }
  windowed.push(now);
  prepareAttemptsByAgent.set(agentId, windowed);
  return true;
}

// Test-only helper: reset in-memory rate-limit state. Not exported from index.
export function _resetPrepareRateLimitForTests(): void {
  prepareAttemptsByAgent.clear();
}

// ── Atomic retirement — delegates to identity/custody-registry (_dny4) ───────

/**
 * Thin delegate to the real registry. The full atomicity contract,
 * staged-write buffer, and audit-event emission live in
 * identity/custody-registry.ts. Shape preserved here so route handlers
 * don't change.
 */
export type RetirementResult = RegistryRetirementResult;

export function retireCustodialSigner(
  userId: string,
  newWalletAddress: string,
  now = new Date()
): RetirementResult {
  return registryRetireCustodialSigner(userId, newWalletAddress, now);
}

// ── Handler: prepare ─────────────────────────────────────────────────────────

async function handlePrepare(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const userId = agent.id;

  // Invariant #1: if already self-custody, prepare is a no-op from user's
  // perspective — no new session. Return 409 explicitly so the UI can route
  // the user to the "already migrated" flow.
  if (isSelfCustodyActive(userId)) {
    json(res, 409, {
      success: false,
      error: 'already_self_custody',
      message: 'User is already in self-custody mode. Export flow is no-op.',
    });
    return;
  }

  const body = await parseJsonBody(req).catch(() => ({}));
  const twoFactorToken = typeof body?.two_factor_token === 'string' ? body.two_factor_token : undefined;
  const idempotencyKey = typeof body?.idempotency_key === 'string' ? body.idempotency_key.trim() : '';

  // Step-up auth (Invariant #4)
  if (twoFactorRequired()) {
    if (!verifyTwoFactorToken(twoFactorToken)) {
      json(res, 403, {
        success: false,
        error: 'two_factor_required',
        message: 'Step-up 2FA token required when REQUIRE_2FA is enabled.',
      });
      return;
    }
  } else {
    // Observable gap — see file-header rationale.
    console.warn(
      '[identity-export] REQUIRE_2FA disabled — prepare accepted without 2FA for user ' +
        userId +
        '. This is a known gap; enable REQUIRE_2FA=true in production.'
    );
  }

  // Idempotency key is required by spec; treat missing as 400.
  if (!idempotencyKey) {
    json(res, 400, {
      success: false,
      error: 'idempotency_key_required',
      message: 'idempotency_key is required (non-empty string).',
    });
    return;
  }

  // Rate limit (enumeration defense)
  if (!checkPrepareRateLimit(userId)) {
    json(res, 429, {
      success: false,
      error: 'rate_limited',
      message: `Prepare limited to ${PREPARE_RATE_LIMIT_COUNT} attempts per hour.`,
    });
    return;
  }

  // Prune expired sessions opportunistically so the store doesn't grow unbounded.
  pruneExpiredExportSessions(exportSessionStore);

  // Create the session. The idempotency key is registered on the session so
  // a retry of prepare with the same key returns the same session_id rather
  // than creating a second one (matches spec's "idempotency key" semantics).
  // Search existing sessions for the same (userId, idempotencyKey) first.
  for (const existing of exportSessionStore.values()) {
    if (
      existing.userId === userId &&
      existing.idempotencyKeys.has(idempotencyKey) &&
      !isExportSessionExpired(existing) &&
      existing.status === 'prepared'
    ) {
      json(res, 200, {
        success: true,
        export_session_id: existing.sessionId,
        expires_at: new Date(existing.expiresAt).toISOString(),
        nonce: existing.serverNonce,
        replay: true,
      });
      return;
    }
  }

  const session = createExportSession(userId, { ttlMs: EXPORT_SESSION_TTL_MS });
  const regResult = registerIdempotencyKey(session, idempotencyKey);
  if (regResult !== 'accepted') {
    // Should be impossible for a fresh session; guard anyway.
    json(res, 500, {
      success: false,
      error: 'idempotency_register_failed',
      detail: regResult,
    });
    return;
  }

  exportSessionStore.set(session.sessionId, session);
  persistExportSessionStore();

  json(res, 200, {
    success: true,
    export_session_id: session.sessionId,
    expires_at: new Date(session.expiresAt).toISOString(),
    nonce: session.serverNonce,
  });
}

// ── Handler: package ─────────────────────────────────────────────────────────

async function handlePackage(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const body = await parseJsonBody(req).catch(() => ({}));
  const sessionId = typeof body?.export_session_id === 'string' ? body.export_session_id : '';
  const recoveryPassword = typeof body?.recovery_password === 'string' ? body.recovery_password : '';
  const recoveryBytesB64 =
    typeof body?.recovery_bytes_b64 === 'string' ? body.recovery_bytes_b64 : '';

  if (!sessionId) {
    json(res, 400, { success: false, error: 'export_session_id_required' });
    return;
  }
  if (!recoveryPassword) {
    json(res, 400, { success: false, error: 'recovery_password_required' });
    return;
  }
  if (!recoveryBytesB64) {
    json(res, 400, { success: false, error: 'recovery_bytes_required' });
    return;
  }

  const session = exportSessionStore.get(sessionId);
  if (!session) {
    json(res, 404, { success: false, error: 'session_not_found' });
    return;
  }

  // Session-user binding (Invariant #4 — bound to authenticated principal).
  if (session.userId !== agent.id) {
    json(res, 403, { success: false, error: 'session_not_owned_by_caller' });
    return;
  }

  // Expiry check
  if (isExportSessionExpired(session)) {
    session.status = 'expired';
    json(res, 400, { success: false, error: 'session_expired' });
    return;
  }

  // Invariant #2: one-time consumable. If already packaged or finalized,
  // reject — the package is not re-downloadable on demand (that would defeat
  // the single-issue guarantee and the audit trail).
  if (session.status !== 'prepared') {
    json(res, 409, {
      success: false,
      error: 'session_not_in_prepared_state',
      current_status: session.status,
    });
    return;
  }

  let recoveryBytes: Buffer;
  try {
    recoveryBytes = Buffer.from(recoveryBytesB64, 'base64');
  } catch {
    json(res, 400, { success: false, error: 'recovery_bytes_invalid_base64' });
    return;
  }
  if (recoveryBytes.length === 0) {
    json(res, 400, { success: false, error: 'recovery_bytes_empty' });
    return;
  }

  let pkg: ExportPackage;
  try {
    pkg = buildExportPackage({
      user_id: agent.id,
      recovery_bytes: recoveryBytes,
      password: recoveryPassword,
      platform_signing_key: getPlatformSigningKey().privateKey,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    json(res, 500, { success: false, error: 'package_build_failed', detail: msg });
    return;
  }

  // Invariant #2: mark session consumed for this package. Further /package
  // calls will hit the 'session_not_in_prepared_state' branch above.
  markExportSessionPackaged(session, pkg.manifest_hash);
  persistExportSessionStore();

  json(res, 200, {
    success: true,
    package: pkg,
    manifest_hash: pkg.manifest_hash,
  });
}

// ── Handler: finalize ────────────────────────────────────────────────────────

async function handleFinalize(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const body = await parseJsonBody(req).catch(() => ({}));
  const sessionId = typeof body?.export_session_id === 'string' ? body.export_session_id : '';
  const newWalletAddress =
    typeof body?.new_wallet_address === 'string' ? body.new_wallet_address.trim() : '';
  const nonceSignatureB64 =
    typeof body?.nonce_signature_b64 === 'string' ? body.nonce_signature_b64 : '';
  const manifestHash =
    typeof body?.package_manifest_hash === 'string' ? body.package_manifest_hash.trim() : '';
  const newWalletPublicKeyPem =
    typeof body?.new_wallet_public_key_pem === 'string' ? body.new_wallet_public_key_pem : '';

  if (!sessionId) {
    json(res, 400, { success: false, error: 'export_session_id_required' });
    return;
  }
  if (!newWalletAddress) {
    json(res, 400, { success: false, error: 'new_wallet_address_required' });
    return;
  }
  if (!nonceSignatureB64) {
    json(res, 400, { success: false, error: 'nonce_signature_required' });
    return;
  }
  if (!manifestHash) {
    json(res, 400, { success: false, error: 'package_manifest_hash_required' });
    return;
  }
  if (!newWalletPublicKeyPem) {
    json(res, 400, { success: false, error: 'new_wallet_public_key_pem_required' });
    return;
  }

  const session = exportSessionStore.get(sessionId);
  if (!session) {
    json(res, 404, { success: false, error: 'session_not_found' });
    return;
  }

  if (session.userId !== agent.id) {
    json(res, 403, { success: false, error: 'session_not_owned_by_caller' });
    return;
  }

  // Invariant #1 re-check: if the user is already self-custody, finalize is
  // an idempotent no-op. This is the replay branch for acceptance test #3.
  if (isSelfCustodyActive(agent.id) && session.status === 'finalized') {
    json(res, 200, {
      success: true,
      status: 'self_custody_active',
      replay: true,
      message: 'Finalize already completed for this session.',
    });
    return;
  }

  // Already finalized on a different custody path (shouldn't happen, defensive).
  if (session.status === 'finalized') {
    json(res, 409, {
      success: false,
      error: 'session_already_finalized',
    });
    return;
  }

  // Expiry check (acceptance test #2)
  if (isExportSessionExpired(session)) {
    session.status = 'expired';
    persistExportSessionStore();
    json(res, 400, { success: false, error: 'session_expired' });
    return;
  }

  // Must have a packaged payload before finalize can trust the manifest hash.
  if (session.status !== 'packaged') {
    json(res, 409, {
      success: false,
      error: 'session_not_packaged',
      current_status: session.status,
    });
    return;
  }

  // Manifest hash binding — the package the user finalizes must match the
  // package the server issued. Tamper or swap rejected.
  if (!session.packageManifestHash || session.packageManifestHash !== manifestHash) {
    json(res, 400, {
      success: false,
      error: 'manifest_hash_mismatch',
    });
    return;
  }

  // Ownership proof — verify signature over server-issued nonce using the
  // user's newly-provided public key. Acceptance test #4: bad ownership
  // proof rejected with 400, no custody-mode transition.
  let ownershipValid = false;
  try {
    const pubKey = crypto.createPublicKey(newWalletPublicKeyPem);
    const sigBytes = Buffer.from(nonceSignatureB64, 'base64');
    // Ed25519: algorithm param is null in Node 16+. If the new wallet uses a
    // different algo (ECDSA, etc.) the PEM encodes that and crypto.verify
    // dispatches accordingly.
    ownershipValid = crypto.verify(
      null,
      Buffer.from(session.serverNonce, 'utf8'),
      pubKey,
      sigBytes
    );
  } catch {
    ownershipValid = false;
  }

  if (!ownershipValid) {
    json(res, 400, {
      success: false,
      error: 'bad_ownership_proof',
      message: 'Signature over server nonce did not verify against provided public key.',
    });
    return;
  }

  // Atomic registry transition. Wrapped in try/catch because
  // retireCustodialSigner delegates to identity/custody-registry.ts, which
  // can throw on DB failure, staged-write rollback, or injected failure
  // (_setFailAfterStageForTests). The atomicity contract in _dny4 guarantees
  // NO partial state mutation on throw — so we can safely signal "retry safe"
  // to the client. Without this guard, the throw propagates uncaught through
  // handleFinalize → handleIdentityExportRoutes → Node default error handler
  // and the client sees a connection-level 500 with NO JSON body (r0pp
  // integration finding 2026-04-24, task_1777008639101_xq23).
  let retirement: RetirementResult;
  try {
    retirement = retireCustodialSigner(agent.id, newWalletAddress);
  } catch (err) {
    // Log with the original error name/message for debugging; never leak
    // internal details in the client response body.
    const errName = err instanceof Error ? err.name : 'UnknownError';
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      '[identity-export] retireCustodialSigner threw during /finalize for user ' +
        agent.id +
        ': ' +
        errName +
        ': ' +
        errMsg
    );
    json(res, 500, {
      success: false,
      error: 'registry_transaction_failed',
      message:
        'Custody registration could not be committed; retry is safe (no partial state).',
      code: 'registry_error',
    });
    return;
  }

  // Mark session finalized (Invariant #2 consumed; idempotency keys now map
  // to 'consumed' for any further ops).
  markExportSessionFinalized(session);
  persistExportSessionStore();

  json(res, 200, {
    success: true,
    status: 'self_custody_active',
    retired_custodial_signer_id: retirement.retiredCustodialSignerId,
    effective_at: retirement.effectiveAt,
  });
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Handle Tier-2 self-custody export routes. Wired into http-routes.ts as a
 * sibling to handleBoardRoutes / handleKnowledgeRoutes / etc.
 *
 * Returns true when a route in this family matched (regardless of outcome),
 * false when the caller should keep searching.
 */
export async function handleIdentityExportRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string
): Promise<boolean> {
  if (method !== 'POST') return false;

  if (pathname === ROUTE_PREPARE) {
    await handlePrepare(req, res);
    return true;
  }

  if (pathname === ROUTE_PACKAGE) {
    await handlePackage(req, res);
    return true;
  }

  if (pathname === ROUTE_FINALIZE) {
    await handleFinalize(req, res);
    return true;
  }

  return false;
}

// ── Invariant #1 guard for custodial signing endpoints ──────────────────────

/**
 * Spec acceptance test #6: "post-migration, custodial signing endpoint
 * rejects migrated user."
 *
 * Current server status: the holomesh server does NOT ship a user-facing
 * custodial signing endpoint. Wallet-bound signatures are produced
 * client-side and verified on the server via `/api/holomesh/key/challenge`
 * + `/api/holomesh/key/register` (core-routes.ts). There is no route that
 * signs on behalf of a custodial user — the user's wallet is always the
 * signer.
 *
 * Therefore acceptance test #6 currently degenerates to: "any future
 * custodial-signing endpoint added to this server must call
 * `requireCustodial(userId)` at its top and return HTTP 403 if the user
 * has migrated." The guard lives in `identity/custody-registry.ts`
 * (exported `requireCustodial`). The route-layer adapter below is the
 * integration seam.
 *
 * When a real custodial-signing endpoint lands, it calls
 * `rejectIfMigratedToSelfCustody(userId, res)` at the top of its handler.
 * If this returns `true` the endpoint must not continue (response is
 * already written). If `false`, the user is still custodial and the
 * endpoint proceeds normally.
 *
 * TODO(post-_dny4): when `/api/identity/custodial/sign` or similar lands,
 * wire the first line of its handler to:
 *     if (rejectIfMigratedToSelfCustody(agent.id, res)) return;
 * Test: `packages/mcp-server/src/holomesh/identity/__tests__/
 *        custody-registry.test.ts` already verifies the guard shape; the
 *        endpoint-level test lives alongside that endpoint when shipped.
 */
export function rejectIfMigratedToSelfCustody(
  userId: string,
  res: http.ServerResponse
): boolean {
  if (isSelfCustodyActive(userId)) {
    json(res, 403, {
      success: false,
      error: 'user_migrated_to_self_custody',
      message:
        'User has migrated to self-custody. Custodial signing is permanently disabled for this user.',
    });
    return true;
  }
  return false;
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Test-only: reset all in-memory state owned by this module. The route tests
 * run back-to-back in one Vitest process, so leak-free cleanup is load-bearing.
 */
export function _resetIdentityExportStateForTests(): void {
  exportSessionStore.clear();
  userCustodyMode.clear();
  prepareAttemptsByAgent.clear();
  _platformKeypair = null;
}
