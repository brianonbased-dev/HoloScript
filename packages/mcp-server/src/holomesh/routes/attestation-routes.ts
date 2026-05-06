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
import { hashTypedData, verifyTypedData } from 'viem';
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

// ─── via-tx attestation (W.GOLD.514 calibration session, 2026-05-06) ─────────
//
// The eth_signTypedData_v4 path has a known canonicalization-rot failure mode
// (W.GOLD.514): Rabby treats the typed-data envelope's `from` arg as advisory
// and signs with whichever account is currently active in the wallet popup,
// regardless of intent. Recovery against `authorized_by` then fails with
// `signature-mismatch` on the server, even after the founder confirmed the
// "right" account in Rabby's UI. The bypass: use eth_sendTransaction (where
// `from` is authoritative — the chain enforces it) to anchor the EIP-712 hash
// of the attestation envelope on Base mainnet. Then the server validates the
// chain proof (tx.from = authorized_by, tx.input = eip712_hash, receipt.status
// = 0x1) instead of recovering an EIP-712 signature.
//
// Trust the chain: this handler INTENTIONALLY does NOT also verify an EIP-712
// signature — that's exactly the path we're avoiding. The existence of a
// confirmed self-tx whose calldata equals the envelope's typed-data hash, sent
// by the founder anchor on the canonical chain, IS the cryptographic proof.

/** Shape of one via-tx envelope in the approve-via-tx request body. */
export interface AttestationViaTxEnvelope {
  /** EIP-712 typed data — same shape as the sign-path envelopes. */
  typedData: {
    domain: { name: string; version: string; chainId: number };
    types: typeof ATTESTATION_TYPES;
    primaryType: 'Attestation';
    message: {
      seat_id: string;
      seat_pubkey: string;
      role: string;
      surface: string;
      model: string;
      authorized_by: string;
      issued_at: string;
      expires_at: string;
    };
  };
  /** Hash the client computed; server recomputes and verifies match. */
  eip712_hash: string;
  /** Self-tx hash on the chain. */
  tx_hash: string;
  /** Chain id (8453 = Base mainnet). */
  chain_id: number;
}

interface ViaTxResult {
  seat_id: string;
  seat_pubkey: string;
  status: 'attested' | 'rejected';
  reason?: string;
  tx_hash?: string;
  block_number?: string;
}

function isHexHash(s: unknown): s is string {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);
}

interface BaseRpcTx {
  from: string;
  to: string | null;
  input: string;
  blockNumber: string | null;
}

interface BaseRpcReceipt {
  status: string;
  blockNumber: string;
}

/** Get the Base mainnet RPC URL for chain proofs. */
function getBaseRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOLOMESH_BASE_RPC_URL ?? 'https://mainnet.base.org';
}

/** Minimal JSON-RPC POST against a Base RPC endpoint. Returns parsed `result` or throws. */
async function baseRpcCall(method: string, params: unknown[], rpcUrl: string): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`base-rpc-${method}-http-${res.status}`);
  }
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) {
    throw new Error(`base-rpc-${method}-error-${body.error.message}`);
  }
  return body.result;
}

/**
 * Inject point for tests. Returns `null` for a missing tx (e.g. pruned RPC,
 * wrong network); throws for transport failures.
 */
export type BaseRpcFetcher = (txHash: string) => Promise<{
  tx: BaseRpcTx | null;
  receipt: BaseRpcReceipt | null;
}>;

const defaultBaseRpcFetcher: BaseRpcFetcher = async (txHash) => {
  const rpcUrl = getBaseRpcUrl();
  const [tx, receipt] = await Promise.all([
    baseRpcCall('eth_getTransactionByHash', [txHash], rpcUrl) as Promise<BaseRpcTx | null>,
    baseRpcCall('eth_getTransactionReceipt', [txHash], rpcUrl) as Promise<BaseRpcReceipt | null>,
  ]);
  return { tx, receipt };
};

/**
 * Validate a via-tx envelope. Public test seam — exposed for unit tests so the
 * Base RPC dependency can be mocked.
 */
export async function processAttestationViaTx(
  env: AttestationViaTxEnvelope,
  options: {
    founderAnchor?: string;
    domain?: ReturnType<typeof attestationDomain>;
    registry?: ReturnType<typeof getAttestationRegistry>;
    rpcFetcher?: BaseRpcFetcher;
  } = {}
): Promise<ViaTxResult> {
  const founderAnchor = (options.founderAnchor ?? getFounderAnchor()).toLowerCase();
  const expectedDomain = options.domain ?? attestationDomain();
  const fetcher = options.rpcFetcher ?? defaultBaseRpcFetcher;

  const seatId = env.typedData?.message?.seat_id ?? '<unknown>';
  const seatPubkey = env.typedData?.message?.seat_pubkey ?? '<unknown>';

  // Shape checks first — cheaper than RPC.
  if (!env.typedData?.message || !env.typedData.domain || env.typedData.primaryType !== 'Attestation') {
    return { seat_id: seatId, seat_pubkey: seatPubkey, status: 'rejected', reason: 'malformed-typed-data' };
  }
  if (!isHexHash(env.eip712_hash)) {
    return { seat_id: seatId, seat_pubkey: seatPubkey, status: 'rejected', reason: 'malformed-eip712-hash' };
  }
  if (!isHexHash(env.tx_hash)) {
    return { seat_id: seatId, seat_pubkey: seatPubkey, status: 'rejected', reason: 'malformed-tx-hash' };
  }
  if (env.chain_id !== expectedDomain.chainId) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: `chain-id-mismatch (got ${env.chain_id}, expected ${expectedDomain.chainId})`,
    };
  }
  if (env.typedData.domain.chainId !== expectedDomain.chainId) {
    return { seat_id: seatId, seat_pubkey: seatPubkey, status: 'rejected', reason: 'typed-data-chain-id-mismatch' };
  }
  const message = env.typedData.message;
  if (!isHexAddress(message.seat_pubkey)) {
    return { seat_id: seatId, seat_pubkey: seatPubkey, status: 'rejected', reason: 'malformed-seat-pubkey' };
  }
  if (!isHexAddress(message.authorized_by)) {
    return { seat_id: seatId, seat_pubkey: seatPubkey, status: 'rejected', reason: 'malformed-authorized-by' };
  }
  if (message.authorized_by.toLowerCase() !== founderAnchor) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: 'authorized-by-not-founder-anchor',
    };
  }

  // (a) Recompute eip712_hash server-side from typedData. This guarantees the
  // client's claim about what they hashed matches the envelope they're asking
  // us to attest. Without this, a malicious client could submit envelope X and
  // a tx anchoring hash(envelope Y).
  let recomputed: string;
  try {
    recomputed = hashTypedData({
      domain: env.typedData.domain,
      types: env.typedData.types,
      primaryType: 'Attestation',
      message: {
        seat_id: message.seat_id,
        seat_pubkey: message.seat_pubkey as `0x${string}`,
        role: message.role,
        surface: message.surface,
        model: message.model,
        authorized_by: message.authorized_by as `0x${string}`,
        issued_at: message.issued_at,
        expires_at: message.expires_at,
      },
    }).toLowerCase();
  } catch (err) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: `hash-typed-data-threw-${(err as Error)?.message ?? 'unknown'}`,
    };
  }
  const claimedHash = env.eip712_hash.toLowerCase();
  if (recomputed !== claimedHash) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: 'eip712-hash-recomputed-mismatch',
    };
  }

  // (b)-(d) Query Base RPC and verify the chain proof.
  let tx: BaseRpcTx | null;
  let receipt: BaseRpcReceipt | null;
  try {
    const fetched = await fetcher(env.tx_hash);
    tx = fetched.tx;
    receipt = fetched.receipt;
  } catch (err) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: `base-rpc-error-${(err as Error)?.message ?? 'unknown'}`,
    };
  }
  if (!tx || !receipt) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: 'tx-not-found-on-base',
    };
  }
  if (receipt.status !== '0x1') {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: `tx-receipt-status-${receipt.status}`,
    };
  }
  if (tx.from.toLowerCase() !== founderAnchor) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: `tx-from-not-authorized-by (got ${tx.from.toLowerCase()})`,
    };
  }
  if (tx.input.toLowerCase() !== claimedHash) {
    return {
      seat_id: seatId,
      seat_pubkey: seatPubkey,
      status: 'rejected',
      reason: 'tx-input-mismatch-eip712-hash',
    };
  }

  // All chain proofs valid — register the attestation.
  const registry = options.registry ?? getAttestationRegistry();
  const att: Attestation = {
    publicKey: message.seat_pubkey,
    seatId: message.seat_id,
    authorizedBy: message.authorized_by,
    issuedAt: message.issued_at,
    expiresAt: message.expires_at && message.expires_at.length > 0 ? message.expires_at : null,
  };
  registry.attest(att);
  return {
    seat_id: message.seat_id,
    seat_pubkey: message.seat_pubkey,
    status: 'attested',
    tx_hash: env.tx_hash,
    block_number: receipt.blockNumber,
  };
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

  // POST /api/identity/attestation/approve-via-tx — via-tx attestation bypass
  // (W.GOLD.514): the chain self-tx replaces eth_signTypedData_v4 entirely.
  if (pathname === '/api/identity/attestation/approve-via-tx' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    if (!caller.isFounder) {
      json(res, 403, { error: 'founder-only' });
      return true;
    }
    const body = await parseJsonBody(req);
    // Accept either a single envelope or a batch under attestations_via_tx.
    const envelopes: AttestationViaTxEnvelope[] = Array.isArray(body?.attestations_via_tx)
      ? body.attestations_via_tx
      : body?.tx_hash && body?.eip712_hash && body?.typedData
        ? [
            {
              typedData: body.typedData,
              eip712_hash: body.eip712_hash,
              tx_hash: body.tx_hash,
              chain_id: typeof body.chain_id === 'number' ? body.chain_id : 8453,
            },
          ]
        : [];
    if (envelopes.length === 0) {
      json(res, 400, {
        error:
          'request must contain either { tx_hash, eip712_hash, typedData, chain_id } ' +
          'or { attestations_via_tx: [ ... ] }',
      });
      return true;
    }
    const teamId = typeof body?.team_id === 'string' ? body.team_id : null;
    const results: ViaTxResult[] = [];
    for (const env of envelopes) {
      const r = await processAttestationViaTx(env);
      results.push(r);
      if (r.status === 'attested' && teamId) {
        try {
          broadcastToRoom(teamId, {
            type: 'attestation:approve-via-tx',
            agent: caller.name,
            data: {
              seat_id: r.seat_id,
              seat_pubkey: r.seat_pubkey,
              tx_hash: r.tx_hash,
              block_number: r.block_number,
            },
          });
        } catch {
          // Broadcast failure must not roll back the registry write.
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
