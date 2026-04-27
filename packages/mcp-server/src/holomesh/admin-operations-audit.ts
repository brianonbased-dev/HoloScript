/**
 * Append-only audit trail for founder/admin HTTP operations (P.009.01).
 *
 * - In-memory ring buffer (default cap from ADMIN_AUDIT_MAX_ENTRIES, default 2000).
 * - Optional async POST flush to a KV/webhook endpoint (ADMIN_AUDIT_KV_URL + ADMIN_AUDIT_KV_TOKEN).
 *
 * EU tool/auth audit lives in security/audit-log.ts; this store is specifically for
 * mutating admin actions (key rotation, provision, revoke, future failover/scaling).
 */

import { randomUUID } from 'crypto';

export type AdminOperationAction =
  | 'key_rotation'
  | 'provision'
  | 'revoke'
  | 'manual_failover'
  | 'scaling_override'
  | 'team_admin_room_toggle';

export interface AdminOperationAuditEntry {
  id: string;
  timestamp: string;
  action: AdminOperationAction;
  actor: {
    agentId: string;
    agentName: string;
    wallet?: string;
  };
  /** HTTP path that performed the change */
  path?: string;
  /** Redacted / structural state before the change */
  before?: Record<string, unknown> | null;
  /** Redacted / structural state after the change */
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_MAX = 2000;

function maxEntries(): number {
  const raw = process.env.ADMIN_AUDIT_MAX_ENTRIES;
  if (!raw) return DEFAULT_MAX;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 10 ? Math.min(n, 100_000) : DEFAULT_MAX;
}

const buffer: AdminOperationAuditEntry[] = [];
let cap = maxEntries();

function trim(): void {
  cap = maxEntries();
  while (buffer.length > cap) {
    buffer.shift();
  }
}

function flushToKv(entry: AdminOperationAuditEntry): void {
  const url = process.env.ADMIN_AUDIT_KV_URL?.trim();
  if (!url) return;

  const token = process.env.ADMIN_AUDIT_KV_TOKEN?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (token) headers.Authorization = `Bearer ${token}`;

  void fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(entry),
  }).catch(() => {
    /* never block admin path */
  });
}

/**
 * Record an admin operation (call after the operation succeeds).
 */
export function recordAdminOperation(params: {
  actor: { agentId: string; agentName: string; wallet?: string };
  action: AdminOperationAction;
  path?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): AdminOperationAuditEntry {
  const entry: AdminOperationAuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    action: params.action,
    actor: { ...params.actor },
    path: params.path,
    before: params.before ?? undefined,
    after: params.after ?? undefined,
    metadata: params.metadata,
  };

  buffer.push(entry);
  trim();

  if (process.env.ADMIN_AUDIT_STDOUT === 'true') {
    console.info('[admin-audit]', JSON.stringify(entry));
  }

  flushToKv(entry);
  return entry;
}

/** Convenience for future routes (manual failover, load balancer, etc.). */
export function recordManualFailoverAudit(
  actor: AdminOperationAuditEntry['actor'],
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  path?: string
): AdminOperationAuditEntry {
  return recordAdminOperation({
    actor,
    action: 'manual_failover',
    path,
    before,
    after,
  });
}

export function recordScalingOverrideAudit(
  actor: AdminOperationAuditEntry['actor'],
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  path?: string
): AdminOperationAuditEntry {
  return recordAdminOperation({
    actor,
    action: 'scaling_override',
    path,
    before,
    after,
  });
}

/**
 * Newest-first snapshot for GET /admin/audit.
 */
export function queryAdminOperationsAudit(limit: number): {
  entries: AdminOperationAuditEntry[];
  total: number;
} {
  const lim = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
  trim();
  const total = buffer.length;
  const slice = buffer.slice(Math.max(0, buffer.length - lim)).reverse();
  return { entries: slice, total };
}

/** Test-only reset */
export function resetAdminOperationsAudit(): void {
  buffer.length = 0;
}
