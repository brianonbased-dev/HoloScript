/**
 * Attestation routes — Phase 2 founder-side approval flow (task _nk25).
 *
 * Founder uses Trezor (via the existing wallet-extension flow that anchors
 * S.ANC provenance — Rabby + Trezor, NOT trezor-connect) to sign batched
 * attestation envelopes. This module verifies those signatures server-side
 * and lands them in the AttestationRegistry singleton, completing the
 * cryptographic chain that the Phase 1 verifier needs to gate new claims.
 *
 * Routes:
 *   GET  /api/identity/attestation/pending         — registry stats
 *   POST /api/identity/attestation/approve         — batched founder-signed attests
 *   POST /api/identity/attestation/revoke          — batched founder-signed retires
 *
 * Trezor pattern (mirrors S.ANC anchor_base.py):
 *   1. Local CLI helper (ai-ecosystem/scripts/founder-attest-pending.mjs)
 *      reads ~/.ai-ecosystem/seats/.pending/, builds unsigned EIP-712 typed
 *      data per envelope.
 *   2. Founder pastes typed data into a generated HTML broadcaster (parallel
 *      to scripts/broadcast_base_*.html). Rabby + Trezor pop, founder
 *      confirms once for batch of N.
 *   3. HTML POSTs the signed batch to /approve here. We `verifyTypedData`
 *      each, confirm the recovered signer is the founder anchor address
 *      (S.ANC: 0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3 on Base mainnet
 *      chainId 8453), and registry.attest() per valid envelope.
 *
 * Authority: founder-only. Requires `caller.isFounder === true` from
 * `auth-utils.requireAuth`. The Trezor signature is the cryptographic root;
 * Bearer-token auth is just the channel.
 *
 * Spec: research/2026-04-21_seat-wallets-adr.md §"Attestation flow (founder
 * side)", §"Attestation format" (lines 138-152), §"Key-derivation correction
 * (2026-04-22)".
 *
 * @module holomesh/routes/attestation-routes
 */

import type http from 'http';
import { verifyTypedData } from 'viem';
import { json, parseJsonBody } from '../utils';
import { requireAuth } from '../auth-utils';
import { broadcastToRoom } from '../team-room';
import { getAttestationRegistry } from '../identity/signing-middleware';
import type { Attestation } from '../identity/attestation-registry';

/** Founder Trezor anchor on Base mainnet (S.ANC: m/44'/60'/0'/0/0). */
const DEFAULT_FOUNDER_ANCHOR = '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3';

/** Override via env for tests / staging environments. */
function getFounderAnchor(env: NodeJS.ProcessEnv = process.env): string {
  return (env.HOLOMESH_FOUNDER_ANCHOR_ADDRESS ?? DEFAULT_FOUNDER_ANCHOR).toLowerCase();
}

/** EIP-712 domain — pinned to Base mainnet (8453) per ADR Tier 1 conventions. */
function attestationDomain(env: NodeJS.ProcessEnv = process.env) {
  const chainId = Number.parseInt(env.HOLOMESH_ATTESTATION_CHAIN_ID ?? '8453', 10);
  return { name: 'HoloMesh', version: '1', chainId };
}

/** Typed data spec for an attestation envelope. */
const ATTESTATION_TYPES = {
  Attestation: [
    { name: 'seat_id', type: 'string' },
    { name: 'seat_pubkey', type: 'address' },
    { name: 'role', type: 'string' },
    { name: 'surface', type: 'string' },
    { name: 'model', type: 'string' },
    { name: 'authorized_by', type: 'address' },
    { name: 'issued_at', type: 'string' },
    { name: 'expires_at', type: 'string' },
  ],
} as const;

/** Typed data spec for a revocation envelope (separate primary type). */
const REVOCATION_TYPES = {
  Revocation: [
    { name: 'seat_pubkey', type: 'address' },
    { name: 'reason', type: 'string' },
    { name: 'revoked_at', type: 'string' },
  ],
} as const;

/** Shape of one attestation envelope in the approve request body. */
export interface AttestationEnvelope {
  seat_id: string;
  seat_pubkey: string;
  role: string;
  surface: string;
  model: string;
  authorized_by: string;
  issued_at: string;
  expires_at: string;
  signature: string;
}

/** Shape of one revocation envelope in the revoke request body. */
export interface RevocationEnvelope {
  seat_pubkey: string;
  reason: string;
  revoked_at: string;
  signature: string;
}

interface ApproveResult {
  seat_id: string;
  seat_pubkey: string;
  status: 'attested' | 'rejected';
  reason?: string;
}

interface RevokeResult {
  seat_pubkey: string;
  status: 'retired' | 'rejected';
  reason?: string;
}

function isHexAddress(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

function isHexSignature(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-fA-F]+$/.test(s) && s.length >= 132;
}

async function verifyAttestationSignature(
  env: AttestationEnvelope,
  founderAnchor: string,
  domain: ReturnType<typeof attestationDomain>
): Promise<{ valid: boolean; reason?: string }> {
  if (!isHexAddress(env.seat_pubkey)) return { valid: false, reason: 'malformed-seat-pubkey' };
  if (!isHexAddress(env.authorized_by)) return { valid: false, reason: 'malformed-authorized-by' };
  if (!isHexSignature(env.signature)) return { valid: false, reason: 'malformed-signature' };
  if (env.authorized_by.toLowerCase() !== founderAnchor) {
    return { valid: false, reason: 'authorized-by-not-founder-anchor' };
  }
  const message = {
    seat_id: env.seat_id,
    seat_pubkey: env.seat_pubkey as `0x${string}`,
    role: env.role,
    surface: env.surface,
    model: env.model,
    authorized_by: env.authorized_by as `0x${string}`,
    issued_at: env.issued_at,
    expires_at: env.expires_at,
  };
  try {
    const valid = await verifyTypedData({
      address: env.authorized_by as `0x${string}`,
      domain,
      types: ATTESTATION_TYPES,
      primaryType: 'Attestation',
      message,
      signature: env.signature as `0x${string}`,
    });
    return valid ? { valid: true } : { valid: false, reason: 'signature-mismatch' };
  } catch {
    return { valid: false, reason: 'verify-threw' };
  }
}

async function verifyRevocationSignature(
  env: RevocationEnvelope,
  founderAnchor: string,
  domain: ReturnType<typeof attestationDomain>
): Promise<{ valid: boolean; reason?: string }> {
  if (!isHexAddress(env.seat_pubkey)) return { valid: false, reason: 'malformed-seat-pubkey' };
  if (!isHexSignature(env.signature)) return { valid: false, reason: 'malformed-signature' };
  const message = {
    seat_pubkey: env.seat_pubkey as `0x${string}`,
    reason: env.reason,
    revoked_at: env.revoked_at,
  };
  try {
    const valid = await verifyTypedData({
      address: founderAnchor as `0x${string}`,
      domain,
      types: REVOCATION_TYPES,
      primaryType: 'Revocation',
      message,
      signature: env.signature as `0x${string}`,
    });
    return valid ? { valid: true } : { valid: false, reason: 'signature-mismatch' };
  } catch {
    return { valid: false, reason: 'verify-threw' };
  }
}

/** Test seam: process one attestation. Exposed for unit tests. */
export async function processAttestation(
  env: AttestationEnvelope,
  options: {
    founderAnchor?: string;
    domain?: ReturnType<typeof attestationDomain>;
    registry?: ReturnType<typeof getAttestationRegistry>;
  } = {}
): Promise<ApproveResult> {
  const founderAnchor = options.founderAnchor ?? getFounderAnchor();
  const domain = options.domain ?? attestationDomain();
  const sigResult = await verifyAttestationSignature(env, founderAnchor, domain);
  if (!sigResult.valid) {
    return { seat_id: env.seat_id, seat_pubkey: env.seat_pubkey, status: 'rejected', reason: sigResult.reason };
  }
  const registry = options.registry ?? getAttestationRegistry();
  const att: Attestation = {
    publicKey: env.seat_pubkey,
    seatId: env.seat_id,
    authorizedBy: env.authorized_by,
    issuedAt: env.issued_at,
    expiresAt: env.expires_at && env.expires_at.length > 0 ? env.expires_at : null,
  };
  registry.attest(att);
  return { seat_id: env.seat_id, seat_pubkey: env.seat_pubkey, status: 'attested' };
}

/** Test seam: process one revocation. */
export async function processRevocation(
  env: RevocationEnvelope,
  options: {
    founderAnchor?: string;
    domain?: ReturnType<typeof attestationDomain>;
    registry?: ReturnType<typeof getAttestationRegistry>;
  } = {}
): Promise<RevokeResult> {
  const founderAnchor = options.founderAnchor ?? getFounderAnchor();
  const domain = options.domain ?? attestationDomain();
  const sigResult = await verifyRevocationSignature(env, founderAnchor, domain);
  if (!sigResult.valid) {
    return { seat_pubkey: env.seat_pubkey, status: 'rejected', reason: sigResult.reason };
  }
  const registry = options.registry ?? getAttestationRegistry();
  const result = registry.retire(env.seat_pubkey, env.reason);
  if (!result) {
    return { seat_pubkey: env.seat_pubkey, status: 'rejected', reason: 'unknown-pubkey' };
  }
  return { seat_pubkey: env.seat_pubkey, status: 'retired' };
}

export async function handleAttestationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string
): Promise<boolean> {
  // GET /api/identity/attestation/pending — registry stats + canonical-pending-source note
  if (pathname === '/api/identity/attestation/pending' && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    if (!caller.isFounder) {
      json(res, 403, { error: 'founder-only' });
      return true;
    }
    const registry = getAttestationRegistry();
    json(res, 200, {
      success: true,
      attested_count: registry.size() - registry.retiredCount(),
      retired_count: registry.retiredCount(),
      total: registry.size(),
      note:
        'Server-side pending mirror not yet implemented. The canonical pending queue ' +
        'lives at ~/.ai-ecosystem/seats/.pending/ on the founder machine; the ' +
        'CLI helper scripts/founder-attest-pending.mjs reads it.',
    });
    return true;
  }

  // POST /api/identity/attestation/approve — batched founder-signed attestations
  if (pathname === '/api/identity/attestation/approve' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    if (!caller.isFounder) {
      json(res, 403, { error: 'founder-only' });
      return true;
    }
    const body = await parseJsonBody(req);
    const attestations = Array.isArray(body?.attestations) ? body.attestations : null;
    if (!attestations || attestations.length === 0) {
      json(res, 400, { error: 'attestations array required' });
      return true;
    }
    const teamId = typeof body?.team_id === 'string' ? body.team_id : null;
    const results: ApproveResult[] = [];
    for (const env of attestations as AttestationEnvelope[]) {
      const r = await processAttestation(env);
      results.push(r);
      if (r.status === 'attested' && teamId) {
        // Notify connected team-room SSE consumers so cached attestation maps
        // pick up the new attest. Mirrors the retire-broadcast convention.
        try {
          broadcastToRoom(teamId, {
            type: 'attestation:approve',
            agent: caller.name,
            data: { seat_id: env.seat_id, seat_pubkey: env.seat_pubkey, attested_at: env.issued_at },
          });
        } catch {
          // Broadcast failure must not roll back the attest — registry state is authoritative.
        }
      }
    }
    const attested = results.filter((r) => r.status === 'attested').length;
    const rejected = results.length - attested;
    json(res, 200, { success: true, attested, rejected, results });
    return true;
  }

  // POST /api/identity/attestation/revoke — batched founder-signed revocations
  if (pathname === '/api/identity/attestation/revoke' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    if (!caller.isFounder) {
      json(res, 403, { error: 'founder-only' });
      return true;
    }
    const body = await parseJsonBody(req);
    const revocations = Array.isArray(body?.revocations) ? body.revocations : null;
    if (!revocations || revocations.length === 0) {
      json(res, 400, { error: 'revocations array required' });
      return true;
    }
    const teamId = typeof body?.team_id === 'string' ? body.team_id : null;
    const results: RevokeResult[] = [];
    for (const env of revocations as RevocationEnvelope[]) {
      const r = await processRevocation(env);
      results.push(r);
      if (r.status === 'retired' && teamId) {
        // The registry's onRetire-callback fires here too if the registry was
        // built via createBroadcastingRegistry — but for the singleton (default)
        // we broadcast explicitly so the team room sees the event without
        // having to opt into the broadcasting variant.
        try {
          broadcastToRoom(teamId, {
            type: 'attestation:retire',
            agent: caller.name,
            data: { seat_pubkey: env.seat_pubkey, reason: env.reason, retired_at: env.revoked_at },
          });
        } catch {
          // Same broadcast-tolerance rule as approve.
        }
      }
    }
    const retired = results.filter((r) => r.status === 'retired').length;
    const rejected = results.length - retired;
    json(res, 200, { success: true, retired, rejected, results });
    return true;
  }

  return false;
}
