/**
 * Vault-lease routes - task_1778102013331_u8q2.
 *
 * Spec evidence: research/2026-05-06_anthropic-managed-agents-gap-map.md
 * "Vault credentials" row. Anthropic Managed Agents 2026-05-06 launch
 * exposed session-scoped credential vault references. HoloMesh has the
 * registry primitives (custodial-wallet, x402, GOLD) but no task-scoped
 * lease layer. This module is the HTTP surface for the registry that
 * lives at `holomesh/identity/vault-lease-registry.ts`.
 *
 * Routes (all under /api/identity/vault/*):
 *   POST   /api/identity/vault/lease                 - issue a new lease
 *   GET    /api/identity/vault/lease/:leaseId        - fetch lease metadata (no secrets)
 *   POST   /api/identity/vault/lease/:leaseId/resolve - check if a secretRef can be read
 *   POST   /api/identity/vault/lease/:leaseId/revoke - revoke a lease
 *   GET    /api/identity/vault/leases                - list leases (filterable)
 *   POST   /api/identity/vault/sweep                 - founder-only: sweep expired
 *
 * Authority model:
 *   - issue:   any authenticated agent (caller becomes the leasing agent
 *              unless they are founder, in which case caller may issue a
 *              lease on behalf of any agentId).
 *   - get:     any authenticated agent; sees only their own leases unless
 *              they are founder.
 *   - resolve: must be the leasing agent (lease_agent_mismatch enforced
 *              by the registry).
 *   - revoke:  the leasing agent OR a founder.
 *   - list:    any authenticated agent; non-founder sees only their own.
 *   - sweep:   founder-only.
 *
 * Frame check (W.GOLD.191): the deployed read-path for secrets is still
 * `process.env.<KEY>`. This route surface does NOT yet reach into .env to
 * return secret values - `resolve` returns a lease decision boolean. Phase 2
 * (separate task) will add a server-side secret-fetching adapter behind the
 * lease check. Shipping a registry+routes that nothing reaches into yet is
 * honest about the gap; rewiring every secret read in one commit would
 * silently break unrelated paths.
 *
 * @module holomesh/routes/vault-lease-routes
 */

import type http from 'http';
import { json, parseJsonBody } from '../utils';
import { requireAuth } from '../auth-utils';
import {
  issueLease,
  getLease,
  resolveSecret,
  revokeLease,
  queryLeases,
  sweepExpiredLeases,
  type RevokeReason,
  type SecretRef,
} from '../identity/vault-lease-registry';

/** Recognized RevokeReason strings (mirror the registry type). */
const VALID_REVOKE_REASONS: ReadonlyArray<RevokeReason> = [
  'task_completed',
  'task_released',
  'agent_compromise',
  'expired_sweep',
  'rotation',
  'manual',
];

/** Strip lease record fields that are sensitive in transport. Currently a
 *  pass-through (the lease itself does not contain secret values), but
 *  isolated as a function so future fields like `revoked.by` can be redacted
 *  for non-founder callers without changing the call sites. */
function publicLeaseShape(
  lease: ReturnType<typeof getLease>,
  caller: ReturnType<typeof requireAuth>
) {
  if (!lease) return null;
  const isCallerLeaseHolder = caller && caller.id === lease.agentId;
  const isFounder = caller && caller.isFounder;
  // Founder sees full record. Lease-holder sees full record minus the
  // revocation `by` field (no need to expose ops identities). Anyone else
  // sees only the audit-safe shape.
  if (isFounder) return lease;
  if (isCallerLeaseHolder) {
    const { revoked, ...rest } = lease;
    return revoked ? { ...rest, revoked: { at: revoked.at, reason: revoked.reason } } : lease;
  }
  // Non-holder, non-founder: scrubbed shape.
  return {
    leaseId: lease.leaseId,
    taskId: lease.taskId,
    status: lease.status,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
  };
}

/** Parse `:leaseId` from a path like `/api/identity/vault/lease/lease-xxx-yyyy[/...]`. */
function extractLeaseId(pathname: string, prefix: string): string | null {
  const rest = pathname.slice(prefix.length);
  if (!rest) return null;
  // Stop at any further path segment.
  const slash = rest.indexOf('/');
  return slash === -1 ? rest : rest.slice(0, slash);
}

export async function handleVaultLeaseRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  _url: string
): Promise<boolean> {
  // -- POST /api/identity/vault/lease ------------------------------------
  if (method === 'POST' && pathname === '/api/identity/vault/lease') {
    const caller = requireAuth(req, res);
    if (!caller) return true; // requireAuth already wrote 401

    const body = await parseJsonBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid-body' });
      return true;
    }
    const b = body as Record<string, unknown>;

    const taskId = typeof b.taskId === 'string' ? b.taskId : '';
    const requestedAgentId = typeof b.agentId === 'string' ? b.agentId : caller.id;
    const agentTag = typeof b.agentTag === 'string' ? b.agentTag : undefined;
    const scope = Array.isArray(b.scope) ? (b.scope as unknown[]).filter((s): s is SecretRef => typeof s === 'string') : [];
    const durationMs = typeof b.durationMs === 'number' ? b.durationMs : undefined;

    // Authority check: non-founder callers may only issue leases for
    // themselves. Founder may issue on behalf of any agent (e.g. for
    // an automated runner that doesn't carry its own bearer).
    if (!caller.isFounder && requestedAgentId !== caller.id) {
      json(res, 403, {
        error: 'cannot-issue-for-other-agent',
        detail: 'only founder may issue leases on behalf of another agent',
      });
      return true;
    }

    const result = issueLease({
      taskId,
      agentId: requestedAgentId,
      agentTag,
      scope,
      durationMs,
    });

    if (!result.ok) {
      json(res, 400, { error: result.reason, detail: result.detail });
      return true;
    }

    json(res, 201, { lease: result.lease });
    return true;
  }

  // -- GET /api/identity/vault/lease/:leaseId ---------------------------
  if (method === 'GET' && pathname.startsWith('/api/identity/vault/lease/')) {
    const leaseId = extractLeaseId(pathname, '/api/identity/vault/lease/');
    if (!leaseId) {
      json(res, 400, { error: 'lease-id-missing' });
      return true;
    }

    const caller = requireAuth(req, res);
    if (!caller) return true; // requireAuth already wrote 401

    const lease = getLease(leaseId);
    if (!lease) {
      json(res, 404, { error: 'lease_not_found' });
      return true;
    }

    json(res, 200, { lease: publicLeaseShape(lease, caller) });
    return true;
  }

  // -- POST /api/identity/vault/lease/:leaseId/resolve ------------------
  if (
    method === 'POST' &&
    pathname.startsWith('/api/identity/vault/lease/') &&
    pathname.endsWith('/resolve')
  ) {
    const inner = pathname.slice(
      '/api/identity/vault/lease/'.length,
      pathname.length - '/resolve'.length
    );
    if (!inner) {
      json(res, 400, { error: 'lease-id-missing' });
      return true;
    }

    const caller = requireAuth(req, res);
    if (!caller) return true; // requireAuth already wrote 401

    const body = await parseJsonBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid-body' });
      return true;
    }
    const secretRef = typeof (body as Record<string, unknown>).secretRef === 'string'
      ? (body as Record<string, string>).secretRef
      : '';
    if (!secretRef) {
      json(res, 400, { error: 'secret-ref-missing' });
      return true;
    }

    const result = resolveSecret({
      leaseId: inner,
      agentId: caller.id, // ALWAYS use the authenticated caller, never trust body
      secretRef,
    });

    // Note: we do NOT expose the secret value here (Phase 1 - frame check).
    // The response is the lease decision; a downstream Phase 2 adapter will
    // read the actual value behind this gate.
    if (!result.ok) {
      json(res, 403, {
        error: result.reason,
        secretRef: result.secretRef,
        resolved: false,
      });
      return true;
    }

    json(res, 200, {
      ok: true,
      resolved: true,
      secretRef: result.secretRef,
      // Explicit echo of caller for audit-trail visibility.
      agentId: caller.id,
    });
    return true;
  }

  // -- POST /api/identity/vault/lease/:leaseId/revoke -------------------
  if (
    method === 'POST' &&
    pathname.startsWith('/api/identity/vault/lease/') &&
    pathname.endsWith('/revoke')
  ) {
    const inner = pathname.slice(
      '/api/identity/vault/lease/'.length,
      pathname.length - '/revoke'.length
    );
    if (!inner) {
      json(res, 400, { error: 'lease-id-missing' });
      return true;
    }

    const caller = requireAuth(req, res);
    if (!caller) return true; // requireAuth already wrote 401

    const body = await parseJsonBody(req).catch(() => null);
    if (!body || typeof body !== 'object') {
      json(res, 400, { error: 'invalid-body' });
      return true;
    }
    const reasonRaw = typeof (body as Record<string, unknown>).reason === 'string'
      ? (body as Record<string, string>).reason
      : '';
    if (!VALID_REVOKE_REASONS.includes(reasonRaw as RevokeReason)) {
      json(res, 400, {
        error: 'invalid-reason',
        validReasons: VALID_REVOKE_REASONS,
      });
      return true;
    }
    const reason = reasonRaw as RevokeReason;

    // Authority: lease-holder OR founder.
    const lease = getLease(inner);
    if (!lease) {
      json(res, 404, { error: 'lease_not_found' });
      return true;
    }
    if (!caller.isFounder && lease.agentId !== caller.id) {
      json(res, 403, { error: 'cannot-revoke-other-agents-lease' });
      return true;
    }

    const result = revokeLease({
      leaseId: inner,
      reason,
      by: caller.id,
    });

    if (!('leaseId' in result)) {
      json(res, 404, { error: result.reason });
      return true;
    }

    json(res, 200, { lease: publicLeaseShape(result, caller) });
    return true;
  }

  // -- GET /api/identity/vault/leases -----------------------------------
  if (method === 'GET' && pathname === '/api/identity/vault/leases') {
    const caller = requireAuth(req, res);
    if (!caller) return true; // requireAuth already wrote 401

    // Parse query params via _url (we already have it as a string).
    const queryStart = _url.indexOf('?');
    const params = new URLSearchParams(queryStart === -1 ? '' : _url.slice(queryStart + 1));
    const taskId = params.get('taskId') ?? undefined;
    const includeExpired = params.get('includeExpired') === 'true';

    // Non-founder: clamp agentId filter to caller. Founder: pass through.
    const agentId = caller.isFounder
      ? (params.get('agentId') ?? undefined)
      : caller.id;

    const leases = queryLeases({ taskId, agentId, includeExpired });
    json(res, 200, {
      count: leases.length,
      leases: leases.map((l) => publicLeaseShape(l, caller)),
    });
    return true;
  }

  // -- POST /api/identity/vault/sweep -----------------------------------
  if (method === 'POST' && pathname === '/api/identity/vault/sweep') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    if (!caller.isFounder) {
      json(res, 403, { error: 'founder-only' });
      return true;
    }

    const expired = sweepExpiredLeases();
    json(res, 200, {
      sweptCount: expired.length,
      leases: expired.map((l) => ({ leaseId: l.leaseId, taskId: l.taskId, expiredAt: l.expiresAt })),
    });
    return true;
  }

  // No route matched.
  return false;
}
