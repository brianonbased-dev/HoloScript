/**
 * Postgres-backed lease adapter — production persistence for the secrets broker.
 *
 * Like {@link createMemoryLeaseAdapter}, this NEVER returns secret material:
 * `resolveLease` answers only the boolean question "may this agent read this
 * ref under this lease?". The plaintext is fetched by a separate secret-store
 * adapter after the lease check passes.
 *
 * ── Decoupling ──────────────────────────────────────────────────────────────
 * The adapter takes an INJECTED `query` runner rather than a hardcoded `pg.Pool`,
 * so it is testable with an in-memory fake and reusable across any driver. The
 * established in-repo pattern is `pg.Pool#query` — e.g.
 * `packages/mcp-server/src/auth/postgres-token-store.ts` does
 * `import type { Pool } from 'pg'` then `this.pool.query(sql, params)`, and the
 * holomesh stores (`team-store.ts`, `state-store.ts`) use the same shape. To
 * wire this adapter against a real database, pass that pool's bound method:
 *
 * ```ts
 * import { Pool } from 'pg';
 * import { createPostgresLeaseAdapter, SECRET_LEASES_DDL } from './postgres-lease-adapter';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * await pool.query(SECRET_LEASES_DDL); // or run the migration
 * const adapter = createPostgresLeaseAdapter({
 *   query: (sql, params) => pool.query(sql, params as unknown[]),
 * });
 * ```
 *
 * The adapter itself imports no driver — only `node:crypto` — so this package
 * adds no runtime dependency.
 *
 * @module secrets-broker/postgres-lease-adapter
 */

import { randomUUID } from 'node:crypto';
import { type SecretRef, type LeaseAdapter } from './types';

/**
 * Minimal query-runner contract the adapter depends on. Structurally compatible
 * with `pg.Pool#query` / `pg.PoolClient#query` (those return additional fields
 * such as `rowCount`, which this contract simply ignores).
 */
export interface LeaseQueryRunner {
  query(sql: string, params: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Dependencies for {@link createPostgresLeaseAdapter}. */
export interface PostgresLeaseAdapterDeps {
  /** Injected query runner (e.g. a bound `pg.Pool#query`). */
  query: LeaseQueryRunner['query'];
  /** Injectable clock for deterministic time math. Defaults to `() => new Date()`. */
  now?: () => Date;
}

/**
 * DDL for the `secret_leases` table. Idempotent (`IF NOT EXISTS`) so it can be
 * run on boot or applied as a migration. Exported so callers can ensure the
 * schema without depending on a migration runner.
 */
export const SECRET_LEASES_DDL = `
CREATE TABLE IF NOT EXISTS secret_leases (
  lease_id       TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  scope          JSONB NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked        BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_reason TEXT,
  revoked_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_secret_leases_agent ON secret_leases (agent_id);
CREATE INDEX IF NOT EXISTS idx_secret_leases_task ON secret_leases (task_id);
CREATE INDEX IF NOT EXISTS idx_secret_leases_expires ON secret_leases (expires_at);
`;

/** Default lease duration — 15 minutes, matching {@link createMemoryLeaseAdapter}. */
const DEFAULT_DURATION_MS = 15 * 60 * 1000;

// ── Row narrowing (strict, no `any`) ─────────────────────────────────────────

/** The columns `resolveLease` reads back from a `secret_leases` row. */
interface LeaseRowView {
  agentId: string;
  scope: readonly string[];
  expiresAt: Date;
  revoked: boolean;
}

/** Coerce an unknown column value to a string, or `null` if not coercible. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Coerce an unknown column value to a boolean (Postgres BOOLEAN → JS boolean). */
function asBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * Coerce a `TIMESTAMPTZ` column to a `Date`. The `pg` driver returns a JS `Date`
 * for timestamptz; a fake may return an ISO string or epoch number. Returns
 * `null` when the value cannot be interpreted as a valid date.
 */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Coerce a `JSONB` scope column to a `string[]`. The `pg` driver parses jsonb
 * into a JS value (here an array); a fake may hand back the raw JSON string.
 * Non-string array members are dropped. Returns `[]` on any non-array shape.
 */
function asScope(value: unknown): readonly string[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

/**
 * Narrow a raw DB row to {@link LeaseRowView}. Returns `null` when required
 * columns are missing or malformed (treated by the caller as `lease_not_found`).
 */
function narrowLeaseRow(row: Record<string, unknown> | undefined): LeaseRowView | null {
  if (!row) return null;
  const agentId = asString(row.agent_id);
  const expiresAt = asDate(row.expires_at);
  if (agentId === null || expiresAt === null) return null;
  return {
    agentId,
    scope: asScope(row.scope),
    expiresAt,
    revoked: asBoolean(row.revoked),
  };
}

/**
 * Create a production Postgres-backed {@link LeaseAdapter}.
 *
 * `resolveLease` applies the EXACT same checks, in the same order, as
 * {@link createMemoryLeaseAdapter}: not-found → revoked → expired →
 * agent-mismatch → scope-violation. It returns a boolean verdict and NEVER a
 * secret value.
 *
 * The adapter performs no schema management itself — run {@link SECRET_LEASES_DDL}
 * (or the migration) before first use.
 */
export function createPostgresLeaseAdapter(deps: PostgresLeaseAdapterDeps): LeaseAdapter {
  const { query } = deps;
  const clock = deps.now ?? (() => new Date());

  return {
    async issueLease(params) {
      const leaseId = `lease-${randomUUID()}`;
      const durationMs = params.durationMs ?? DEFAULT_DURATION_MS;
      const expiresAtDate = new Date(clock().getTime() + durationMs);
      const expiresAt = expiresAtDate.toISOString();
      // scope is a SecretRef[]; serialize for the jsonb column.
      const scopeJson = JSON.stringify([...params.scope]);

      await query(
        `INSERT INTO secret_leases (lease_id, task_id, agent_id, scope, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [leaseId, params.taskId, params.agentId, scopeJson, expiresAt]
      );

      return { leaseId, expiresAt };
    },

    async resolveLease(params) {
      const { rows } = await query(
        `SELECT agent_id, scope, expires_at, revoked
         FROM secret_leases WHERE lease_id = $1`,
        [params.leaseId]
      );

      const lease = narrowLeaseRow(rows[0]);
      // Same checks, same order, as createMemoryLeaseAdapter:
      if (!lease) return { ok: false, reason: 'lease_not_found' };
      if (lease.revoked) return { ok: false, reason: 'lease_revoked' };
      if (lease.expiresAt.getTime() <= clock().getTime()) {
        return { ok: false, reason: 'lease_expired' };
      }
      if (lease.agentId !== params.agentId) {
        return { ok: false, reason: 'lease_agent_mismatch' };
      }
      if (!lease.scope.includes(params.secretRef)) {
        return { ok: false, reason: 'lease_scope_violation' };
      }
      return { ok: true };
    },

    async revokeLease(params) {
      const { rows } = await query(
        `UPDATE secret_leases
         SET revoked = TRUE, revoked_reason = $2, revoked_by = $3
         WHERE lease_id = $1 AND revoked = FALSE
         RETURNING lease_id`,
        [params.leaseId, params.reason, params.by]
      );
      // 0 rows → lease absent or already revoked.
      return { ok: rows.length > 0 };
    },
  };
}

// `SecretRef` is referenced in docs/serialization above; keep the import meaningful
// for consumers that build scope arrays against the same nominal type.
export type { SecretRef };
