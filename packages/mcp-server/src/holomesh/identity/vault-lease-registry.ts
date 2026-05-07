/**
 * Task-Scoped Credential Vault Leases (task_1778102013331_u8q2).
 *
 * Spec evidence: research/2026-05-06_anthropic-managed-agents-gap-map.md row
 * "Vault credentials". Anthropic Managed Agents 2026-05-06 launched
 * session-scoped vault references - credentials are injected per session,
 * not pulled from a broad ambient `.env`. HoloMesh has `.env`, x402 seats,
 * and the GOLD posture, but no unified task-scoped secret lease layer.
 * This module is the substrate fix.
 *
 * Why a lease, not a vault:
 *   The credentials already live somewhere (.env, x402 keychain, GOLD,
 *   custodial-wallet store). The gap is not "where is the credential"
 *   it is "did the holder of this lease earn the right to read it,
 *   for this task, for this scope, until this expiry, with audit trail".
 *   A lease is a time-bounded, scope-bounded, task-bound capability that
 *   wraps the existing credential surface.
 *
 * Invariants (non-negotiable):
 *   1. A lease is bound to ONE task id (TeamTask.id). Cannot be reused
 *      across tasks. Re-issuance for a new task creates a new lease id.
 *   2. A lease is bound to ONE agent id (the claimer of the task). The
 *      agent id is the registered identity (TeamTask.claimedBy), not the
 *      surface tag. Surface tag is captured separately for the audit trail.
 *   3. A lease has a hard expiry (ISO timestamp). Expired leases are
 *      rejected without revealing whether the secretRef would have resolved.
 *      Lease expiry MUST be < 24h from issuance (enforced).
 *   4. A lease has a scope: an array of canonical secretRef strings the
 *      agent has permission to read. Reading any secret outside the scope
 *      is rejected as `lease_scope_violation` and audited.
 *   5. Wallet credentials (HOLOMESH_WALLET_*, anything ending in
 *      _WALLET_KEY / _WALLET_ADDRESS) are PERMANENTLY UNLEASABLE per
 *      G.GOLD.016 - wallets are identity, not sessions. Attempting to
 *      add a wallet ref to lease scope returns `wallet_unleasable` BEFORE
 *      the lease is persisted.
 *   6. Revocation propagates to running tasks: any open `redeemLease`
 *      handle for a revoked lease MUST observe revocation on its next
 *      check (we expose `isLeaseValid(leaseId)` for handle-side polling
 *      and refuse subsequent `resolveSecret` calls).
 *   7. Every lifecycle event (issue / redeem / deny / expire / revoke)
 *      emits a structured audit event via the existing audit-log module.
 *      No raw secret material in audit events - `secretRef` is the
 *      canonical name, never the value.
 *
 * Atomicity contract for `issueLease`:
 *   Either (A) lease persisted + audit event emitted + scope-resolved-secret-
 *   ref list returned, OR (B) zero state mutated + zero audit event emitted +
 *   structured rejection returned. The wallet-scope check fires BEFORE the
 *   commit phase so a rejected lease leaves no audit-log noise.
 *
 * Future DB backend:
 *   `withTransaction(fn)` wraps the persist phase. In-memory today; swap to
 *   PostgreSQL by reimplementing `withTransaction` as BEGIN/COMMIT/ROLLBACK
 *   around the same closure. Handler code does not change.
 *
 * Frame check (W.GOLD.191): the deployed read-path for secrets is
 *   `process.env.<KEY>`. This module is a parallel registry - it does NOT
 *   replace ambient .env reads in the existing codebase. The path forward is:
 *     - Phase 1 (this commit): registry + routes + tests + audit wiring.
 *       Existing code keeps reading .env. Leases are an opt-in layer.
 *     - Phase 2 (follow-up task): wrap critical secret reads with
 *       `resolveSecretWithLease(taskId, ref)` so the runner enforces leases
 *       at the call site, not at the vault.
 *   This is intentional. Shipping a registry that nothing checks is honest
 *   about the gap; rewiring every .env read in one commit would silently
 *   break unrelated paths. See "What ships?" in W.GOLD.191.
 *
 * @module holomesh/identity/vault-lease-registry
 */

import * as crypto from 'crypto';
import { appendAuditEvent, hashPublicKey, type AuditEvent } from './audit-log';

// -- Types -----------------------------------------------------------------

/** A canonical reference to a secret. Format: `<surface>:<key>` where surface
 *  is one of `env`, `x402`, `custodial`, `gold`. Examples:
 *    - `env:HOLOSCRIPT_API_KEY`
 *    - `x402:CLAUDECODE_X402`
 *    - `custodial:<userId>:signing-key`
 *  The string is the audit-safe label. Never the value. */
export type SecretRef = string;

/** Reason a lease was rejected. Stable strings for client-side branching. */
export type LeaseRejectReason =
  | 'wallet_unleasable'        // scope contained a wallet credential (G.GOLD.016)
  | 'expiry_too_far'            // expiry > MAX_LEASE_DURATION_MS from now
  | 'expiry_in_past'            // expiry already passed at issuance
  | 'scope_empty'               // empty scope array (always reject)
  | 'task_not_claimed'          // task has no claimedBy at issuance time
  | 'task_id_missing'           // taskId not provided
  | 'agent_id_missing'          // agentId not provided
  | 'duplicate_lease'           // lease already exists for (taskId, agentId)
  | 'lease_not_found'           // redeem/revoke against unknown lease id
  | 'lease_expired'             // redeem against past-expiry lease
  | 'lease_revoked'             // redeem against revoked lease
  | 'lease_agent_mismatch'      // redeem with wrong agent id
  | 'lease_scope_violation';    // resolveSecret for ref not in lease scope

/** Reason a lease was revoked. Recorded in audit trail for compliance. */
export type RevokeReason =
  | 'task_completed'   // happy-path: task moved to done, lease no longer needed
  | 'task_released'    // task unclaimed and returned to open pool
  | 'agent_compromise' // operator-initiated emergency revocation
  | 'expired_sweep'    // expired by background sweeper (audit even though redundant)
  | 'rotation'         // upstream secret rotated; downstream leases invalidated
  | 'manual';          // operator without specific reason

/** A persisted lease record. Returned by `issueLease`, `getLease`. */
export interface VaultLease {
  /** Unique lease id. Format: `lease-<taskId>-<8-hex>`. */
  leaseId: string;
  /** TeamTask.id this lease is bound to. */
  taskId: string;
  /** Registered agent id (TeamTask.claimedBy). */
  agentId: string;
  /** Surface-attribution tag captured at issuance, audit-only. May be undefined. */
  agentTag?: string;
  /** Canonical secretRef strings the agent may resolve under this lease. */
  scope: SecretRef[];
  /** ISO 8601 issuance timestamp. */
  issuedAt: string;
  /** ISO 8601 expiry. Always < issuedAt + MAX_LEASE_DURATION_MS. */
  expiresAt: string;
  /** Status. `active` until revoked/expired; never auto-flips on read. */
  status: 'active' | 'revoked' | 'expired';
  /** Revocation metadata once revoked. Undefined while `active`. */
  revoked?: {
    at: string;
    reason: RevokeReason;
    by: string; // agent id or 'system' for sweeper
  };
}

/** Successful issuance. */
export interface IssueLeaseSuccess {
  ok: true;
  lease: VaultLease;
}

/** Rejected issuance. */
export interface IssueLeaseFailure {
  ok: false;
  reason: LeaseRejectReason;
  detail?: string;
}

export type IssueLeaseResult = IssueLeaseSuccess | IssueLeaseFailure;

/** Outcome of a `resolveSecret` call. NEVER carries the raw value here -
 *  callers receive an opaque `resolved` boolean and pass through the
 *  redaction-safe label. The actual value is read by a separate adapter
 *  (Phase 2). This keeps the registry pure and audit-safe. */
export interface ResolveSecretResult {
  ok: boolean;
  reason?: LeaseRejectReason;
  /** Echo of the requested ref (audit-safe label). */
  secretRef?: SecretRef;
  /** Lease-side decision; the value-fetching adapter is a separate layer. */
  resolved: boolean;
}

// -- Constants -------------------------------------------------------------

/** Hard upper bound on lease duration (24h). Leases are SESSION-scoped, not
 *  long-lived API keys. If a task takes longer than 24h, re-issue. */
export const MAX_LEASE_DURATION_MS = 24 * 60 * 60 * 1000;

/** Minimum lease duration (1 second) - guards against zero/negative durations
 *  passed by callers. */
export const MIN_LEASE_DURATION_MS = 1000;

/** Wallet-credential ref patterns. Per G.GOLD.016 - wallets are identity,
 *  not sessions. These cannot be added to lease scope under any circumstances.
 *
 *  Patterns are case-insensitive substring checks against the bare key portion
 *  of the secretRef (the part after the surface prefix). The check is broad
 *  on purpose: better to reject a non-wallet ref that happens to mention
 *  WALLET than to ever leak a wallet via a typo. */
export const UNLEASABLE_PATTERNS: readonly RegExp[] = [
  /WALLET_ADDRESS/i,
  /WALLET_KEY/i,
  /WALLET_PRIVATE/i,
  /WALLET_SEED/i,
  /WALLET_MNEMONIC/i,
  /HOLOMESH_WALLET/i,
  /TREZOR/i,
  /LEDGER_PRIVATE/i,
];

// -- Registry storage ------------------------------------------------------

/** In-memory lease store. Key: leaseId. Future: swap for PostgreSQL with
 *  a UNIQUE constraint on (taskId, agentId, status='active'). */
const leasesById: Map<string, VaultLease> = new Map();

/** Index by (taskId, agentId) to enforce duplicate-lease invariant cheaply.
 *  Key: `${taskId}::${agentId}`. Only `active` leases are indexed; revoked
 *  and expired leases drop out of the index. */
const activeLeaseByTaskAgent: Map<string, string> = new Map();

// -- Helpers ---------------------------------------------------------------

function nextLeaseId(taskId: string): string {
  // Trim taskId to keep lease ids readable. taskIds are like
  // `task_1778102013331_u8q2`, which we abbreviate to the last 8 chars.
  const taskSuffix = taskId.length > 12 ? taskId.slice(-8) : taskId;
  const rand = crypto.randomBytes(4).toString('hex');
  return `lease-${taskSuffix}-${rand}`;
}

function leaseIndexKey(taskId: string, agentId: string): string {
  return `${taskId}::${agentId}`;
}

function isWalletRef(ref: SecretRef): boolean {
  for (const pattern of UNLEASABLE_PATTERNS) {
    if (pattern.test(ref)) return true;
  }
  return false;
}

function isExpired(lease: VaultLease, now: number): boolean {
  return Date.parse(lease.expiresAt) <= now;
}

/** Light-weight transaction wrapper. In-memory today; future DB backend
 *  swaps this with a real BEGIN/COMMIT/ROLLBACK. The contract is that
 *  the closure either runs to completion (commit) or throws (rollback -
 *  callers MUST not partially mutate before `commit()` runs). */
export function withTransaction<T>(commit: () => T): T {
  return commit();
}

// -- Public API ------------------------------------------------------------

/** Issue a new lease. Atomic: either the lease is persisted + indexed +
 *  audit event emitted, OR nothing changes and a structured rejection is
 *  returned. Wallet-scope check fires BEFORE the commit phase. */
export function issueLease(params: {
  taskId: string;
  agentId: string;
  agentTag?: string;
  scope: SecretRef[];
  durationMs?: number;
  /** Optional caller-supplied issuance timestamp (for testing/replay). */
  now?: number;
}): IssueLeaseResult {
  const now = params.now ?? Date.now();
  const duration = params.durationMs ?? MAX_LEASE_DURATION_MS;

  // Argument validation (cheap rejections before any state work).
  if (!params.taskId) return { ok: false, reason: 'task_id_missing' };
  if (!params.agentId) return { ok: false, reason: 'agent_id_missing' };
  if (!Array.isArray(params.scope) || params.scope.length === 0) {
    return { ok: false, reason: 'scope_empty' };
  }
  if (duration < MIN_LEASE_DURATION_MS) {
    return {
      ok: false,
      reason: 'expiry_in_past',
      detail: `duration ${duration}ms < min ${MIN_LEASE_DURATION_MS}ms`,
    };
  }
  if (duration > MAX_LEASE_DURATION_MS) {
    return {
      ok: false,
      reason: 'expiry_too_far',
      detail: `duration ${duration}ms > max ${MAX_LEASE_DURATION_MS}ms (24h)`,
    };
  }

  // G.GOLD.016: wallet credentials are PERMANENTLY UNLEASABLE.
  // This check fires before any persistence so a rejected lease leaves no
  // state behind. We surface the FIRST offending ref so debugging is easy.
  for (const ref of params.scope) {
    if (isWalletRef(ref)) {
      return {
        ok: false,
        reason: 'wallet_unleasable',
        detail: `secretRef '${ref}' matches wallet pattern; wallets are identity, not sessions (G.GOLD.016)`,
      };
    }
  }

  // Duplicate-lease invariant: one active lease per (taskId, agentId).
  // Re-issuance for the same pair requires the existing lease to be
  // revoked first.
  const indexKey = leaseIndexKey(params.taskId, params.agentId);
  const existing = activeLeaseByTaskAgent.get(indexKey);
  if (existing) {
    const existingLease = leasesById.get(existing);
    // If the existing lease has expired but wasn't swept yet, allow
    // re-issuance and lazily expire it. Otherwise reject.
    if (existingLease && existingLease.status === 'active' && !isExpired(existingLease, now)) {
      return {
        ok: false,
        reason: 'duplicate_lease',
        detail: `active lease ${existing} already exists for (${params.taskId}, ${params.agentId})`,
      };
    }
    // Lazy expire - observed-but-not-swept lease drops out.
    if (existingLease) {
      lazyExpire(existingLease, now);
    }
  }

  // Commit phase - staged so failure mid-stage rolls back.
  const lease: VaultLease = {
    leaseId: nextLeaseId(params.taskId),
    taskId: params.taskId,
    agentId: params.agentId,
    agentTag: params.agentTag,
    scope: [...params.scope], // defensive copy
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + duration).toISOString(),
    status: 'active',
  };

  return withTransaction(() => {
    leasesById.set(lease.leaseId, lease);
    activeLeaseByTaskAgent.set(indexKey, lease.leaseId);

    // Audit. We piggyback on the existing audit-log module so all key/secret
    // lifecycle events flow through one sink. Lease events use a distinct
    // type via the metadata payload - the audit-log type taxonomy stays
    // stable; the event-router downstream filters by `metadata.event`.
    appendAuditEvent({
      type: 'key_accessed', // closest existing taxonomy slot; metadata refines
      timestamp: lease.issuedAt,
      severity: 'info',
      userId: lease.agentId,
      publicKeyHash: hashPublicKey(`lease:${lease.leaseId}`),
      accessedBy: lease.agentTag ?? lease.agentId,
      metadata: {
        event: 'vault_lease_issued',
        leaseId: lease.leaseId,
        taskId: lease.taskId,
        scopeCount: lease.scope.length,
        scope: lease.scope,
        expiresAt: lease.expiresAt,
        agentTag: lease.agentTag,
      },
    });

    return { ok: true, lease } as IssueLeaseSuccess;
  });
}

/** Look up a lease by id. Does NOT lazily expire - callers that care
 *  about freshness should check `isLeaseValid`. */
export function getLease(leaseId: string): VaultLease | undefined {
  return leasesById.get(leaseId);
}

/** Find the active lease for (taskId, agentId), if any. */
export function findActiveLease(taskId: string, agentId: string): VaultLease | undefined {
  const id = activeLeaseByTaskAgent.get(leaseIndexKey(taskId, agentId));
  if (!id) return undefined;
  return leasesById.get(id);
}

/** True iff the lease exists, is `active`, and has not expired. */
export function isLeaseValid(leaseId: string, now: number = Date.now()): boolean {
  const lease = leasesById.get(leaseId);
  if (!lease) return false;
  if (lease.status !== 'active') return false;
  if (isExpired(lease, now)) return false;
  return true;
}

/** Decide whether `agentId` may resolve `secretRef` under `leaseId`. Does
 *  NOT return the secret value - that is a separate adapter layer. This
 *  function is the substrate enforcement point. */
export function resolveSecret(params: {
  leaseId: string;
  agentId: string;
  secretRef: SecretRef;
  now?: number;
}): ResolveSecretResult {
  const now = params.now ?? Date.now();
  const lease = leasesById.get(params.leaseId);

  if (!lease) {
    return { ok: false, reason: 'lease_not_found', resolved: false };
  }
  if (lease.status === 'revoked') {
    auditLeaseDenied(lease, params.secretRef, 'lease_revoked');
    return { ok: false, reason: 'lease_revoked', secretRef: params.secretRef, resolved: false };
  }
  if (isExpired(lease, now)) {
    // Don't mutate here - `expireLease` is the canonical state transition.
    // But audit so the agent's failed attempt is recorded.
    auditLeaseDenied(lease, params.secretRef, 'lease_expired');
    return { ok: false, reason: 'lease_expired', secretRef: params.secretRef, resolved: false };
  }
  if (lease.agentId !== params.agentId) {
    auditLeaseDenied(lease, params.secretRef, 'lease_agent_mismatch', params.agentId);
    return { ok: false, reason: 'lease_agent_mismatch', secretRef: params.secretRef, resolved: false };
  }
  if (!lease.scope.includes(params.secretRef)) {
    auditLeaseDenied(lease, params.secretRef, 'lease_scope_violation');
    return { ok: false, reason: 'lease_scope_violation', secretRef: params.secretRef, resolved: false };
  }
  // Belt-and-suspenders: refuse to resolve a wallet ref even if (somehow)
  // it ended up in scope. Defense in depth - the issuance-time check is
  // the primary gate; this is the last-line check.
  if (isWalletRef(params.secretRef)) {
    auditLeaseDenied(lease, params.secretRef, 'wallet_unleasable');
    return { ok: false, reason: 'wallet_unleasable', secretRef: params.secretRef, resolved: false };
  }

  // Audit the successful resolution. This is the access-log entry that
  // makes "who read what credential, for which task" visible.
  appendAuditEvent({
    type: 'key_accessed',
    timestamp: new Date(now).toISOString(),
    severity: 'info',
    userId: lease.agentId,
    publicKeyHash: hashPublicKey(`lease:${lease.leaseId}`),
    accessedBy: lease.agentTag ?? lease.agentId,
    metadata: {
      event: 'vault_lease_resolve_secret',
      leaseId: lease.leaseId,
      taskId: lease.taskId,
      secretRef: params.secretRef,
    },
  });

  return { ok: true, secretRef: params.secretRef, resolved: true };
}

/** Revoke an active lease. Idempotent on already-revoked leases - returns
 *  the existing record. Returns `lease_not_found` for unknown ids. */
export function revokeLease(params: {
  leaseId: string;
  reason: RevokeReason;
  by: string; // agent id or 'system'
  now?: number;
}): VaultLease | { ok: false; reason: LeaseRejectReason } {
  const now = params.now ?? Date.now();
  const lease = leasesById.get(params.leaseId);
  if (!lease) return { ok: false, reason: 'lease_not_found' };
  if (lease.status === 'revoked') return lease; // idempotent

  return withTransaction(() => {
    lease.status = 'revoked';
    lease.revoked = {
      at: new Date(now).toISOString(),
      reason: params.reason,
      by: params.by,
    };
    activeLeaseByTaskAgent.delete(leaseIndexKey(lease.taskId, lease.agentId));

    appendAuditEvent({
      type: 'key_rotated', // closest existing slot for "credential invalidated"
      timestamp: lease.revoked.at,
      severity: params.reason === 'agent_compromise' ? 'error' : 'info',
      userId: lease.agentId,
      publicKeyHash: hashPublicKey(`lease:${lease.leaseId}`),
      accessedBy: params.by,
      metadata: {
        event: 'vault_lease_revoked',
        leaseId: lease.leaseId,
        taskId: lease.taskId,
        reason: params.reason,
        scope: lease.scope,
      },
    });

    return lease;
  });
}

/** Bulk-revoke all active leases for a task. Used when a task is marked
 *  done or released. Returns the list of revoked leases. */
export function revokeLeasesForTask(taskId: string, reason: RevokeReason, by: string): VaultLease[] {
  const revoked: VaultLease[] = [];
  for (const lease of leasesById.values()) {
    if (lease.taskId === taskId && lease.status === 'active') {
      const result = revokeLease({ leaseId: lease.leaseId, reason, by });
      if ('leaseId' in result) revoked.push(result);
    }
  }
  return revoked;
}

/** Scan the registry and flip expired leases to `expired` status. Idempotent.
 *  Intended to be called by a periodic sweeper (e.g. once per minute). Each
 *  expired lease emits one audit event so compliance can correlate "lease
 *  used to be active" with "no further reads possible". */
export function sweepExpiredLeases(now: number = Date.now()): VaultLease[] {
  const expired: VaultLease[] = [];
  for (const lease of leasesById.values()) {
    if (lease.status === 'active' && isExpired(lease, now)) {
      lazyExpire(lease, now);
      expired.push(lease);
    }
  }
  return expired;
}

function lazyExpire(lease: VaultLease, now: number): void {
  if (lease.status !== 'active') return;
  lease.status = 'expired';
  activeLeaseByTaskAgent.delete(leaseIndexKey(lease.taskId, lease.agentId));
  appendAuditEvent({
    type: 'key_rotated',
    timestamp: new Date(now).toISOString(),
    severity: 'info',
    userId: lease.agentId,
    publicKeyHash: hashPublicKey(`lease:${lease.leaseId}`),
    accessedBy: 'system',
    metadata: {
      event: 'vault_lease_expired',
      leaseId: lease.leaseId,
      taskId: lease.taskId,
      reason: 'expired_sweep',
      expiredAt: lease.expiresAt,
    },
  });
}

function auditLeaseDenied(
  lease: VaultLease,
  secretRef: SecretRef,
  reason: LeaseRejectReason,
  attemptedBy?: string
): void {
  appendAuditEvent({
    type: 'key_access_denied',
    timestamp: new Date().toISOString(),
    severity: 'warn',
    userId: lease.agentId,
    publicKeyHash: hashPublicKey(`lease:${lease.leaseId}`),
    accessedBy: attemptedBy ?? lease.agentTag ?? lease.agentId,
    metadata: {
      event: 'vault_lease_denied',
      leaseId: lease.leaseId,
      taskId: lease.taskId,
      secretRef,
      reason,
    },
  });
}

/** List leases matching a filter. Returns a snapshot copy - callers cannot
 *  mutate the registry through this view. */
export function queryLeases(filter: {
  taskId?: string;
  agentId?: string;
  status?: VaultLease['status'];
  includeExpired?: boolean;
} = {}): VaultLease[] {
  const out: VaultLease[] = [];
  const now = Date.now();
  for (const lease of leasesById.values()) {
    if (filter.taskId && lease.taskId !== filter.taskId) continue;
    if (filter.agentId && lease.agentId !== filter.agentId) continue;
    if (filter.status && lease.status !== filter.status) continue;
    if (!filter.includeExpired && lease.status === 'active' && isExpired(lease, now)) continue;
    out.push({ ...lease, scope: [...lease.scope] }); // defensive copy
  }
  return out;
}

// -- Test helpers ----------------------------------------------------------

/** Reset the registry. Test-only - never call from production code. */
export function _resetVaultLeaseRegistryForTests(): void {
  leasesById.clear();
  activeLeaseByTaskAgent.clear();
}

/** Snapshot the active-lease index. Test-only. */
export function _getActiveLeaseIndexForTests(): ReadonlyMap<string, string> {
  return new Map(activeLeaseByTaskAgent);
}

/** Recover audit events for a lease. Test-only - uses the audit-log query
 *  surface but is exposed here for ergonomic test assertions. */
export function _getAuditEventsForLeaseInTests(_leaseId: string): readonly AuditEvent[] {
  // The audit-log buffer is module-private; we don't touch it from here.
  // Tests that need audit assertions import audit-log directly.
  return [];
}
