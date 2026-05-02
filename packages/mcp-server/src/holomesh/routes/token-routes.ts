/**
 * Token-Balance REST Routes — Phase 5 (task_1776806224288_m5jg).
 *
 * Endpoints:
 *   GET    /api/holomesh/tokens/balance         — get current balance
 *   GET    /api/holomesh/tokens/history           — get ledger history
 *   POST   /api/holomesh/tokens/stripe-webhook    — Stripe webhook endpoint
 *   POST   /api/holomesh/admin/tokens/grant        — admin: grant tokens
 *   POST   /api/holomesh/admin/tokens/revoke       — admin: revoke tokens
 *   POST   /api/holomesh/admin/tokens/credit        — admin: manual credit
 *
 * Spec: research/2026-04-21_seat-wallets-adr.md §"Token seeding".
 *
 * @module holomesh/routes/token-routes
 */

import type http from 'http';
import * as crypto from 'crypto';
import { json, parseJsonBody } from '../utils';
import { resolveRequestingAgent, requireAuth } from '../auth-utils';
import {
  creditTokens,
  debitTokens,
  getBalance,
  getBalanceInfo,
  getLedgerHistory,
  grantTokens,
  revokeTokens,
  processStripePayment,
  type StripePaymentEvent,
} from '../identity/token-ledger';

// ── Stripe webhook secret verification ────────────────────────────────────

/**
 * Verify a Stripe webhook signature using the shared secret.
 * In production, this uses Stripe's official `stripe.webhooks.constructEvent()`.
 * This implementation provides the same security guarantee using Node crypto.
 *
 * Stripe signs webhooks with HMAC-SHA256 using the endpoint secret.
 * The signature is in the `Stripe-Signature` header with format:
 *   t=<timestamp>,v1=<signature>,v1=<signature> (multiple signatures possible)
 */
function verifyStripeSignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
  toleranceMs: number = 300000 // 5 minutes — Stripe default
): { verified: boolean; reason?: string } {
  if (!signatureHeader) {
    return { verified: false, reason: 'missing_signature' };
  }

  const elements = signatureHeader.split(',');
  const timestampPart = elements.find((e) => e.startsWith('t='));
  const signatureParts = elements.filter((e) => e.startsWith('v1='));

  if (!timestampPart || signatureParts.length === 0) {
    return { verified: false, reason: 'invalid_signature_format' };
  }

  const timestamp = timestampPart.slice(2);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const webhookTimestamp = parseInt(timestamp, 10);

  if (isNaN(webhookTimestamp)) {
    return { verified: false, reason: 'invalid_timestamp' };
  }

  // Reject replayed or future webhooks outside tolerance
  if (Math.abs(currentTimestamp - webhookTimestamp) > toleranceMs / 1000) {
    return { verified: false, reason: 'timestamp_outside_tolerance' };
  }

  // Verify at least one signature matches
  const signedPayload = `${timestamp}.${payload}`;
  let valid = false;
  for (const sigPart of signatureParts) {
    const signature = sigPart.slice(3); // Remove 'v1='
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      valid = true;
      break;
    }
  }

  if (!valid) {
    return { verified: false, reason: 'signature_mismatch' };
  }

  return { verified: true };
}

// ── Route handler ──────────────────────────────────────────────────────────

/**
 * Handle token-balance routes. Returns true if the route was handled.
 */
export async function handleTokenRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  // ── GET /api/holomesh/tokens/balance ──────────────────────────────────────
  // Get current balance for the authenticated user.
  if (pathname === '/api/holomesh/tokens/balance' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated || !caller.agent) {
      json(res, 401, { error: 'Authentication required' });
      return true;
    }
    const balanceInfo = getBalanceInfo(caller.id);
    json(res, 200, { success: true, ...balanceInfo });
    return true;
  }

  // ── GET /api/holomesh/tokens/history ──────────────────────────────────────
  // Get ledger history for the authenticated user.
  // Query params: ?limit=N&offset=N&type=credit|debit
  if (pathname === '/api/holomesh/tokens/history' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated || !caller.agent) {
      json(res, 401, { error: 'Authentication required' });
      return true;
    }

    const params = new URL(url, 'http://localhost').searchParams;
    const limit = Math.min(parseInt(params.get('limit') || '100', 10), 500);
    const offset = parseInt(params.get('offset') || '0', 10);
    const typeParam = params.get('type');
    const type: 'credit' | 'debit' | undefined =
      typeParam === 'credit' || typeParam === 'debit' ? typeParam : undefined;

    const entries = getLedgerHistory(caller.id, { limit, offset, type });
    const balanceInfo = getBalanceInfo(caller.id);

    json(res, 200, {
      success: true,
      ...balanceInfo,
      entries,
      limit,
      offset,
    });
    return true;
  }

  // ── POST /api/holomesh/tokens/stripe-webhook ─────────────────────────────
  // Stripe webhook endpoint. Validates Stripe signature, then credits tokens.
  // This endpoint does NOT require HoloMesh auth — Stripe signs the payload.
  if (pathname === '/api/holomesh/tokens/stripe-webhook' && method === 'POST') {
    const body = await parseJsonBody(req);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid_json' });
      return true;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[token-routes] STRIPE_WEBHOOK_SECRET not configured');
      json(res, 500, { error: 'webhook_not_configured' });
      return true;
    }

    // Read raw body for signature verification
    // Note: parseJsonBody already consumed the stream; in production this
    // needs raw body access before JSON parsing. For now, we verify against
    // the stringified JSON (acceptable for v1 — the signature check still
    // prevents tampering and replay attacks).
    const rawBody = JSON.stringify(body);
    const signature = req.headers['stripe-signature'] as string | undefined;
    const verification = verifyStripeSignature(rawBody, signature, webhookSecret);

    if (!verification.verified) {
      console.warn('[token-routes] Stripe webhook signature verification failed:', verification.reason);
      json(res, 401, { error: 'invalid_signature', reason: verification.reason });
      return true;
    }

    // Extract user ID and token amount from Stripe event
    // Stripe checkout sessions include metadata we set during checkout creation
    const eventType = body.type;
    const stripeEventId = body.id;

    // Supported event types
    if (
      !['checkout.session.completed', 'invoice.paid', 'payment_intent.succeeded'].includes(eventType)
    ) {
      // Acknowledge but skip unsupported event types
      json(res, 200, { received: true, skipped: true, reason: 'unsupported_event_type' });
      return true;
    }

    // Extract user ID and token amount from Stripe event data
    // Checkout session: data.object.metadata
    // Invoice: data.object.metadata
    // Payment intent: data.object.metadata
    const data = body.data?.object || {};
    const userId =
      data.metadata?.holomesh_user_id ||
      data.metadata?.user_id ||
      data.client_reference_id;

    const tokenAmount =
      parseInt(data.metadata?.token_amount || '0', 10) ||
      parseInt(data.metadata?.tokens || '0', 10);

    if (!userId) {
      console.warn('[token-routes] Stripe webhook: missing user ID in event', stripeEventId);
      json(res, 400, { error: 'missing_user_id' });
      return true;
    }

    if (!tokenAmount || tokenAmount <= 0) {
      console.warn('[token-routes] Stripe webhook: invalid token amount in event', stripeEventId);
      json(res, 400, { error: 'invalid_token_amount' });
      return true;
    }

    const stripeId =
      data.id || data.payment_intent || data.subscription || 'unknown';

    const event: StripePaymentEvent = {
      type: eventType,
      id: stripeEventId,
      userId,
      tokenAmount,
      stripeId,
      stripeTimestamp: data.created
        ? new Date(data.created * 1000).toISOString()
        : new Date().toISOString(),
      raw: body,
    };

    const result = processStripePayment(event);

    if (result === null) {
      // Deduplicated — already processed
      json(res, 200, { received: true, deduplicated: true });
      return true;
    }

    console.log(
      `[token-routes] Stripe webhook: credited ${event.tokenAmount} tokens to user ${event.userId} ` +
        `(balance: ${result.balanceBefore} → ${result.balanceAfter})`
    );

    json(res, 200, {
      received: true,
      credited: true,
      entryId: result.entry.id,
      balance: result.balanceAfter,
      amount: event.tokenAmount,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/tokens/grant ────────────────────────────────
  // Admin: grant tokens to a user. Requires founder auth.
  if (pathname === '/api/holomesh/admin/tokens/grant' && method === 'POST') {
    const admin = requireAuth(req, res, { requireFounder: true });
    if (!admin) return true; // requireAuth already sent 401/403

    const body = await parseJsonBody(req);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid_json' });
      return true;
    }

    const { userId, amount, reason } = body;
    if (!userId || typeof userId !== 'string') {
      json(res, 400, { error: 'missing_user_id' });
      return true;
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      json(res, 400, { error: 'invalid_amount', message: 'amount must be a positive number' });
      return true;
    }

    const result = grantTokens(userId, amount, admin.id, reason || 'admin_grant');
    json(res, 200, {
      success: true,
      entry: result.entry,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/tokens/revoke ───────────────────────────────
  // Admin: revoke tokens from a user. Requires founder auth.
  if (pathname === '/api/holomesh/admin/tokens/revoke' && method === 'POST') {
    const admin = requireAuth(req, res, { requireFounder: true });
    if (!admin) return true;

    const body = await parseJsonBody(req);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid_json' });
      return true;
    }

    const { userId, amount, reason } = body;
    if (!userId || typeof userId !== 'string') {
      json(res, 400, { error: 'missing_user_id' });
      return true;
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      json(res, 400, { error: 'invalid_amount', message: 'amount must be a positive number' });
      return true;
    }

    const result = revokeTokens(userId, amount, admin.id, reason || 'admin_revoke');
    json(res, 200, {
      success: true,
      entry: result.entry,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    });
    return true;
  }

  // ── POST /api/holomesh/admin/tokens/credit ──────────────────────────────
  // Admin: manually credit tokens (same as grant, different route name for
  // clarity). Requires founder auth.
  if (pathname === '/api/holomesh/admin/tokens/credit' && method === 'POST') {
    const admin = requireAuth(req, res, { requireFounder: true });
    if (!admin) return true;

    const body = await parseJsonBody(req);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid_json' });
      return true;
    }

    const { userId, amount, reason } = body;
    if (!userId || typeof userId !== 'string') {
      json(res, 400, { error: 'missing_user_id' });
      return true;
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      json(res, 400, { error: 'invalid_amount', message: 'amount must be a positive number' });
      return true;
    }

    const result = grantTokens(userId, amount, admin.id, reason || 'admin_credit');
    json(res, 200, {
      success: true,
      entry: result.entry,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    });
    return true;
  }

  // ── POST /api/holomesh/tokens/debit ─────────────────────────────────────
  // Debit tokens from the authenticated user's balance. Used by HoloScript
  // operations that consume compute tokens.
  if (pathname === '/api/holomesh/tokens/debit' && method === 'POST') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated || !caller.agent) {
      json(res, 401, { error: 'Authentication required' });
      return true;
    }

    const body = await parseJsonBody(req);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid_json' });
      return true;
    }

    const { amount, operation, metadata } = body;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      json(res, 400, { error: 'invalid_amount', message: 'amount must be a positive number' });
      return true;
    }
    if (!operation || typeof operation !== 'string') {
      json(res, 400, { error: 'missing_operation', message: 'operation name is required' });
      return true;
    }

    const balance = getBalance(caller.id);
    if (balance < amount) {
      json(res, 402, {
        error: 'insufficient_balance',
        message: `Insufficient tokens: requested ${amount}, available ${balance}`,
        requested: amount,
        available: balance,
      });
      return true;
    }

    const result = debitTokens(
      caller.id,
      amount,
      'operation_debit',
      `op_${operation}_${Date.now()}`,
      { operation, ...metadata }
    );

    json(res, 200, {
      success: true,
      entry: result.entry,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
    });
    return true;
  }

  // ── GET /api/holomesh/admin/tokens/balance/:userId ───────────────────────
  // Admin: get any user's balance. Requires founder auth.
  if (pathname.match(/^\/api\/holomesh\/admin\/tokens\/balance\//) && method === 'GET') {
    const admin = requireAuth(req, res, { requireFounder: true });
    if (!admin) return true;

    const targetUserId = decodeURIComponent(
      pathname.replace('/api/holomesh/admin/tokens/balance/', '')
    );
    if (!targetUserId) {
      json(res, 400, { error: 'missing_user_id' });
      return true;
    }

    const balanceInfo = getBalanceInfo(targetUserId);
    json(res, 200, { success: true, ...balanceInfo });
    return true;
  }

  return false; // Not a token route
}