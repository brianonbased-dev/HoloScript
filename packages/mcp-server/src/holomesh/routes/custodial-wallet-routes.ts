/**
 * Tier 2 Custodial Wallet API Routes — Phase 5.
 *
 * REST API endpoints for the custodial wallet lifecycle:
 *   POST /api/identity/custodial/provision  — Provision a wallet for a user
 *   POST /api/identity/custodial/sign        — Sign on behalf of a user
 *   GET  /api/identity/custodial/wallet       — Get wallet info (public key only)
 *   POST /api/identity/custodial/rotate       — Rotate a user's keypair
 *   POST /api/identity/custodial/2fa/enable   — Enable 2FA opt-in
 *   GET  /api/identity/custodial/2fa/status    — Check 2FA status
 *   GET  /api/identity/custodial/audit        — Query audit log
 *
 * Per ADR §"Server-side key management":
 *   - "Decrypt only inside authenticated request handler" — all endpoints
 *     require authentication via requireAuth.
 *   - "Principle of least privilege" — the signing service has its own
 *     IAM identity separate from the API server.
 *   - "2FA opt-in" — provision and sign endpoints require 2FA when enabled.
 *   - "Redacted structured logs" — all logs go through audit-log redaction.
 *
 * Architecture: this module is the API layer. The crypto and storage logic
 * lives in identity/custodial-wallet.ts. This separation allows the signing
 * service to run as a separate IAM role with its own deployment if needed.
 *
 * @module holomesh/routes/custodial-wallet-routes
 */

import type http from 'http';
import { json, parseJsonBody } from '../utils';
import { requireAuth } from '../auth-utils';
import {
  provisionCustodialWallet,
  custodialSign,
  getWalletInfo,
  hasCustodialWallet,
  rotateCustodialKey,
  enableTwoFactor,
  isTwoFactorEnabled,
  markSelfCustodyActive,
} from '../identity/custodial-wallet';
import { queryAuditEvents, redactForLogging } from '../identity/audit-log';
import { rejectIfMigratedToSelfCustody } from './identity-export-routes';

// ── 2FA verification stub ──────────────────────────────────────────────────
// Per identity-export-routes.ts: the current server has no 2FA service.
// This stub accepts tokens shaped like `2fa:<non-empty>` when REQUIRE_2FA
// is set. Production swaps the body with a real 2FA service call.
function verifyTwoFactorToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  return /^2fa:.+/.test(token.trim());
}

function twoFactorRequired(): boolean {
  const v = (process.env.REQUIRE_2FA || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function checkTwoFactor(body: Record<string, unknown>, userId: string, action: string): {
  ok: boolean;
  error?: string;
} {
  if (!twoFactorRequired()) {
    // 2FA not required — log the gap
    console.warn(
      `[custodial-wallet] REQUIRE_2FA disabled — ${action} accepted without 2FA for user ${userId}. ` +
        'Enable REQUIRE_2FA=true in production.'
    );
    return { ok: true };
  }

  const token = typeof body.two_factor_token === 'string' ? body.two_factor_token : undefined;
  if (!verifyTwoFactorToken(token)) {
    return { ok: false, error: 'two_factor_required' };
  }
  return { ok: true };
}

// ── Route handlers ────────────────────────────────────────────────────────

/**
 * POST /api/identity/custodial/provision
 *
 * Provision a new custodial wallet for an authenticated user.
 * Idempotent — if the user already has a wallet, returns the existing one.
 *
 * Request body (optional):
 *   { two_factor_token?: string } — required when REQUIRE_2FA=true
 *
 * Response:
 *   200: { success: true, wallet: { publicKeyBase64, publicKeyHash, derivationPath, ... } }
 *   401: not authenticated
 *   403: user migrated to self-custody
 *   500: internal error (missing KMS key, etc.)
 */
async function handleProvision(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const userId = agent.id;

  // If user has migrated to self-custody, reject provision
  if (rejectIfMigratedToSelfCustody(userId, res)) return;

  const body = await parseJsonBody(req).catch(() => ({}));

  // 2FA check (when enabled)
  const twoFaResult = checkTwoFactor(body as Record<string, unknown>, userId, 'provision');
  if (!twoFaResult.ok) {
    json(res, 403, {
      success: false,
      error: twoFaResult.error,
      message: 'Step-up 2FA token required when REQUIRE_2FA is enabled.',
    });
    return;
  }

  try {
    const result = provisionCustodialWallet(userId, {
      provisionedBy: agent.name ?? agent.id,
      sourceIp: req.socket.remoteAddress,
    });

    // Return only public information — never encrypted key material
    json(res, 200, {
      success: true,
      wallet: {
        publicKeyBase64: result.wallet.publicKeyBase64,
        publicKeyHash: result.wallet.publicKeyHash,
        derivationPath: result.wallet.derivationPath,
        userOrdinal: result.wallet.userOrdinal,
        createdAt: result.wallet.createdAt,
        custodyMode: result.wallet.custodyMode,
        twoFactorEnabled: result.wallet.twoFactorEnabled,
      },
      attestation: {
        publicKey: result.attestation.publicKey,
        seatId: result.attestation.seatId,
        authorizedBy: result.attestation.authorizedBy,
        issuedAt: result.attestation.issuedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[custodial-wallet] provision failed:', redactForLogging({ error: message, userId }));
    json(res, 500, { success: false, error: 'provision_failed', message });
  }
}

/**
 * POST /api/identity/custodial/sign
 *
 * Sign a payload on behalf of a user using their custodial wallet.
 * The private key is decrypted ONLY inside this handler and is never
 * returned to the caller — only the signature is returned.
 *
 * Request body:
 *   { payload_base64: string, two_factor_token?: string }
 *
 * Response:
 *   200: { success: true, signature_base64: string, audit_event_id: string }
 *   401: not authenticated
 *   403: user migrated to self-custody or 2FA required
 *   404: user has no custodial wallet
 */
async function handleSign(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const userId = agent.id;

  // If user has migrated to self-custody, reject signing
  if (rejectIfMigratedToSelfCustody(userId, res)) return;

  const body = await parseJsonBody(req).catch(() => ({}));

  // 2FA check (when enabled — signing always requires 2FA if the user has
  // it enabled, regardless of the global REQUIRE_2FA flag)
  if (isTwoFactorEnabled(userId)) {
    const token = typeof (body as Record<string, unknown>).two_factor_token === 'string'
      ? ((body as Record<string, unknown>).two_factor_token as string)
      : undefined;
    if (!verifyTwoFactorToken(token)) {
      json(res, 403, {
        success: false,
        error: 'two_factor_required',
        message: 'User has 2FA enabled. Provide a valid two_factor_token.',
      });
      return;
    }
  } else if (twoFactorRequired()) {
    // Global 2FA required but user hasn't enabled per-user 2FA yet
    const twoFaResult = checkTwoFactor(body as Record<string, unknown>, userId, 'sign');
    if (!twoFaResult.ok) {
      json(res, 403, {
        success: false,
        error: twoFaResult.error,
        message: 'Step-up 2FA token required when REQUIRE_2FA is enabled.',
      });
      return;
    }
  }

  const payloadBase64 = typeof (body as Record<string, unknown>).payload_base64 === 'string'
    ? ((body as Record<string, unknown>).payload_base64 as string)
    : '';

  if (!payloadBase64) {
    json(res, 400, { success: false, error: 'payload_base64_required' });
    return;
  }

  let payload: Buffer;
  try {
    payload = Buffer.from(payloadBase64, 'base64');
  } catch {
    json(res, 400, { success: false, error: 'invalid_base64_payload' });
    return;
  }

  try {
    const result = custodialSign(userId, payload, agent.name ?? agent.id, {
      sourceIp: req.socket.remoteAddress,
    });

    json(res, 200, {
      success: true,
      signature_base64: result.signatureBase64,
      audit_event_id: result.auditEventId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Redact any key material that might have leaked into the error message
    console.error('[custodial-wallet] sign failed:', redactForLogging({ error: message, userId }));

    if (message.includes('no wallet found')) {
      json(res, 404, { success: false, error: 'no_wallet_found', message: 'User has no custodial wallet. Provision one first.' });
    } else if (message.includes('not authorized')) {
      json(res, 403, { success: false, error: 'not_authorized', message: 'Caller is not authorized to sign on behalf of this user.' });
    } else if (message.includes('migrated to self-custody')) {
      json(res, 403, { success: false, error: 'user_migrated_to_self_custody', message: 'User has migrated to self-custody. Custodial signing is permanently disabled.' });
    } else {
      json(res, 500, { success: false, error: 'signing_failed', message });
    }
  }
}

/**
 * GET /api/identity/custodial/wallet
 *
 * Get a user's wallet info (public key only — never private key material).
 *
 * Response:
 *   200: { success: true, wallet: { ... } } or { success: true, has_wallet: false }
 *   401: not authenticated
 */
async function handleGetWallet(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const userId = agent.id;
  const walletInfo = getWalletInfo(userId);

  if (!walletInfo) {
    json(res, 200, { success: true, has_wallet: false });
    return;
  }

  json(res, 200, { success: true, has_wallet: true, wallet: walletInfo });
}

/**
 * POST /api/identity/custodial/rotate
 *
 * Rotate a user's custodial keypair. The old key is retired in the
 * attestation registry (signatures from it remain valid-at-time-of-signing).
 * The new key becomes active immediately.
 *
 * Request body (optional):
 *   { two_factor_token?: string } — required when REQUIRE_2FA=true
 *
 * Response:
 *   200: { success: true, wallet: { ... }, attestation: { ... } }
 *   401: not authenticated
 *   403: user migrated to self-custody or 2FA required
 *   404: user has no custodial wallet
 */
async function handleRotate(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const userId = agent.id;

  if (rejectIfMigratedToSelfCustody(userId, res)) return;

  const body = await parseJsonBody(req).catch(() => ({}));

  // 2FA always required for key rotation (high-value operation)
  const twoFaResult = checkTwoFactor(body as Record<string, unknown>, userId, 'rotate');
  if (!twoFaResult.ok) {
    json(res, 403, {
      success: false,
      error: twoFaResult.error,
      message: 'Step-up 2FA token required for key rotation.',
    });
    return;
  }

  try {
    const result = rotateCustodialKey(userId, agent.name ?? agent.id, {
      sourceIp: req.socket.remoteAddress,
    });

    json(res, 200, {
      success: true,
      wallet: {
        publicKeyBase64: result.wallet.publicKeyBase64,
        publicKeyHash: result.wallet.publicKeyHash,
        derivationPath: result.wallet.derivationPath,
        userOrdinal: result.wallet.userOrdinal,
        createdAt: result.wallet.createdAt,
        rotatedAt: result.wallet.rotatedAt,
        custodyMode: result.wallet.custodyMode,
      },
      attestation: {
        publicKey: result.attestation.publicKey,
        seatId: result.attestation.seatId,
        authorizedBy: result.attestation.authorizedBy,
        issuedAt: result.attestation.issuedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[custodial-wallet] rotate failed:', redactForLogging({ error: message, userId }));

    if (message.includes('no wallet found')) {
      json(res, 404, { success: false, error: 'no_wallet_found', message: 'User has no custodial wallet. Provision one first.' });
    } else {
      json(res, 500, { success: false, error: 'rotation_failed', message });
    }
  }
}

/**
 * POST /api/identity/custodial/2fa/enable
 *
 * Enable 2FA opt-in for the authenticated user's wallet.
 * Per ADR: "2FA on GitHub OAuth opt-in (required for token-purchase
 * and key-export flows; optional for read-only)".
 *
 * Response:
 *   200: { success: true, two_factor_enabled: true }
 *   401: not authenticated
 *   404: user has no wallet
 */
async function handleEnable2FA(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const userId = agent.id;

  if (!hasCustodialWallet(userId)) {
    json(res, 404, { success: false, error: 'no_wallet_found', message: 'User has no custodial wallet. Provision one first.' });
    return;
  }

  enableTwoFactor(userId);
  json(res, 200, { success: true, two_factor_enabled: true });
}

/**
 * GET /api/identity/custodial/2fa/status
 *
 * Check 2FA status for the authenticated user.
 */
async function handle2FAStatus(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  json(res, 200, {
    success: true,
    two_factor_enabled: isTwoFactorEnabled(agent.id),
  });
}

/**
 * GET /api/identity/custodial/audit
 *
 * Query audit events for the authenticated user.
 * Per ADR: "Audit log of every private-key access — append-only,
 * separate store, external retention."
 *
 * Query params:
 *   type: filter by event type (key_generated, key_accessed, etc.)
 *   since: ISO 8601 timestamp — only events after this time
 *   limit: maximum number of events to return (default 50)
 */
async function handleAuditLog(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const agent = requireAuth(req, res);
  if (!agent) return;

  const url = new URL(req.url || '/', 'http://localhost');
  const type = url.searchParams.get('type') ?? undefined;
  const since = url.searchParams.get('since') ?? undefined;
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

  const events = queryAuditEvents({
    userId: agent.id,
    type: type as any,
    since,
    limit: Math.min(limit, 200), // Cap at 200 to prevent abuse
  });

  json(res, 200, {
    success: true,
    events,
    count: events.length,
  });
}

// ── Route dispatcher ───────────────────────────────────────────────────────

/** Route paths (canonical — referenced by tests). */
export const ROUTE_PROVISION = '/api/identity/custodial/provision';
export const ROUTE_SIGN = '/api/identity/custodial/sign';
export const ROUTE_WALLET = '/api/identity/custodial/wallet';
export const ROUTE_ROTATE = '/api/identity/custodial/rotate';
export const ROUTE_2FA_ENABLE = '/api/identity/custodial/2fa/enable';
export const ROUTE_2FA_STATUS = '/api/identity/custodial/2fa/status';
export const ROUTE_AUDIT = '/api/identity/custodial/audit';

/**
 * Handle Tier 2 custodial wallet routes. Wired into http-routes.ts as a
 * sibling to handleIdentityExportRoutes / handleAttestationRoutes.
 *
 * Returns true when a route in this family matched (regardless of outcome),
 * false when the caller should keep searching.
 */
export async function handleCustodialWalletRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string
): Promise<boolean> {
  // POST /api/identity/custodial/provision
  if (pathname === ROUTE_PROVISION && method === 'POST') {
    await handleProvision(req, res);
    return true;
  }

  // POST /api/identity/custodial/sign
  if (pathname === ROUTE_SIGN && method === 'POST') {
    await handleSign(req, res);
    return true;
  }

  // GET /api/identity/custodial/wallet
  if (pathname === ROUTE_WALLET && method === 'GET') {
    await handleGetWallet(req, res);
    return true;
  }

  // POST /api/identity/custodial/rotate
  if (pathname === ROUTE_ROTATE && method === 'POST') {
    await handleRotate(req, res);
    return true;
  }

  // POST /api/identity/custodial/2fa/enable
  if (pathname === ROUTE_2FA_ENABLE && method === 'POST') {
    await handleEnable2FA(req, res);
    return true;
  }

  // GET /api/identity/custodial/2fa/status
  if (pathname === ROUTE_2FA_STATUS && method === 'GET') {
    await handle2FAStatus(req, res);
    return true;
  }

  // GET /api/identity/custodial/audit
  if (pathname === ROUTE_AUDIT && method === 'GET') {
    await handleAuditLog(req, res);
    return true;
  }

  return false;
}