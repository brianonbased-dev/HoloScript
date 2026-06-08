#!/usr/bin/env node
/**
 * HoloShell Consent Contract — classify → issue token → verify
 *
 * Lanes (Paper 12 intent→approval→receipt ladder):
 *   agent_reversible   — agent self-approves; operation is fully reversible
 *   express_reversible — shown in consent queue; short approval window; reversible
 *   founder_required   — explicit founder sign-off (F.095 / D.080 Founder Gate)
 *
 * Token: HMAC-SHA256, base64(payload).sig, 5-minute TTL, bound to preflightId.
 */

import { createHmac } from 'node:crypto';

const CONSENT_SECRET =
  process.env.HOLOSHELL_CONSENT_SECRET ?? 'holoshell-local-dev-secret-rotate-in-prod';
const TOKEN_TTL_MS = 5 * 60 * 1000;

// Operation → lane map. Unknown operations default to founder_required (fail-safe).
const LANE_MAP = {
  stale_process_cleanup: 'agent_reversible',
  stale_file_cleanup:    'agent_reversible',
  process_terminate:     'express_reversible',
  delete_file:           'express_reversible',
  legacy_app_mutation:   'founder_required',
};

/**
 * @param {string} operation
 * @returns {{ operation: string, lane: string, allowed: boolean }}
 */
export function classifyConsentRequirement(operation) {
  const lane = LANE_MAP[operation] ?? 'founder_required';
  return { operation, lane, allowed: true };
}

/**
 * @param {{ operation: string, preflightId: string, agentId?: string }} opts
 * @returns {{ token: string, lane: string, expiresAt: number }}
 */
export function issueConsentToken({ operation, preflightId, agentId = 'holoshell' }) {
  const { lane } = classifyConsentRequirement(operation);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_MS;
  const payload = JSON.stringify({ operation, preflightId, agentId, lane, issuedAt, expiresAt });
  const sig = createHmac('sha256', CONSENT_SECRET).update(payload).digest('hex');
  return {
    token: `${Buffer.from(payload).toString('base64')}.${sig}`,
    lane,
    expiresAt,
  };
}

/**
 * @param {string} rawToken
 * @param {{ operation: string, preflightId: string }} expected
 * @returns {{ valid: boolean, reason?: string, lane?: string, payload?: object }}
 */
export function verifyConsentToken(rawToken, { operation, preflightId }) {
  const dotIdx = rawToken.lastIndexOf('.');
  if (dotIdx === -1) return { valid: false, reason: 'malformed_token' };

  const b64 = rawToken.slice(0, dotIdx);
  const sig  = rawToken.slice(dotIdx + 1);

  let payloadStr;
  try {
    payloadStr = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return { valid: false, reason: 'invalid_base64' };
  }

  const expectedSig = createHmac('sha256', CONSENT_SECRET).update(payloadStr).digest('hex');
  // Constant-time comparison
  if (sig.length !== expectedSig.length ||
      !createHmac('sha256', CONSENT_SECRET).update(sig).digest().equals(
        createHmac('sha256', CONSENT_SECRET).update(expectedSig).digest()
      )) {
    return { valid: false, reason: 'tampered' };
  }

  let payload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (Date.now() > payload.expiresAt) return { valid: false, reason: 'expired' };
  if (payload.operation !== operation)   return { valid: false, reason: 'operation_mismatch' };
  if (payload.preflightId !== preflightId) return { valid: false, reason: 'preflight_mismatch' };

  return { valid: true, lane: payload.lane, payload };
}
