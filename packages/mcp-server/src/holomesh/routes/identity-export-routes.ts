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

// ── Constants ─────────────────────────────────────────────────────────────────

const PREPARE_RATE_LIMIT_COUNT = 3;
const PREPARE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EXPORT_SESSION_TTL_MS = 15 * 60 * 1000; // 15 min (matches spec "short-lived")

// Route paths (canonical — referenced by tests)
export const ROUTE_PREPARE = '/api/identity/self-custody/export/prepare';
export const ROUTE_PACKAGE = '/api/identity/self-custody/export/package';
export const ROUTE_FINALIZE = '/api/identity/self-custody/export/finalize';

// ── Shadow state (replaced by _dny4 atomic-registry when it lands) ───────────

export type CustodyMode = 'custodial_active' | 'self_custody_active';

/**
 * Per-user custody mode. Mirrors what the atomic-registry layer will own.
 * Keeping this as a module-level export so tests can reset it and _dny4 can
 * hand it off to the real store.
 */
export const userCustodyMode: Map<string, CustodyMode> = new Map();

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

// ── Atomic retirement stub (replaced by _dny4) ───────────────────────────────

/**
 * Retire the custodial signer for a user and mark the user as self-custody.
 *
 * STUB for _dny4. Expected real implementation:
 *   1. Begin atomic transaction against the identity registry.
 *   2. Mark current custodial signer as 'retired' with effective_at timestamp.
 *   3. Bind the user's new wallet address as the active signer.
 *   4. Commit transaction.
 *   5. Return the retired signer's ID for audit.
 *
 * Current stub: generates a deterministic fake signer ID (derived from user_id
 * + timestamp) so happy-path tests can assert structural correctness. DO NOT
 * rely on this in production — the task spec explicitly calls this out.
 */
export interface RetirementResult {
  retiredCustodialSignerId: string;
  effectiveAt: string;
}

export function retireCustodialSigner(
  userId: string,
  newWalletAddress: string,
  now = new Date()
): RetirementResult {
  // Stub ID is prefixed so it's greppable in logs.
  const retiredId = `custodial-signer-STUB-${crypto
    .createHash('sha256')
    .update(`${userId}:${now.getTime()}`)
    .digest('hex')
    .slice(0, 16)}`;

  // Shadow-track the transition so invariant #1 is enforceable pre-_dny4.
  userCustodyMode.set(userId, 'self_custody_active');

  console.info(
    `[identity-export] STUB retirement: user=${userId} new_wallet=${newWalletAddress} retired_signer=${retiredId}`
  );

  return {
    retiredCustodialSignerId: retiredId,
    effectiveAt: now.toISOString(),
  };
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
  if (userCustodyMode.get(userId) === 'self_custody_active') {
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
  if (
    userCustodyMode.get(agent.id) === 'self_custody_active' &&
    session.status === 'finalized'
  ) {
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

  // Atomic registry transition (stubbed; see retireCustodialSigner).
  const retirement = retireCustodialSigner(agent.id, newWalletAddress);

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
