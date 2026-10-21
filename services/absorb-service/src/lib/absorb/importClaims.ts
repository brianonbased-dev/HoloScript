/**
 * Durable once-per-import guard for /scan repoUrl imports.
 *
 * One import is one charge. The guard is a row in `absorb_import_claims`
 * (migration drizzle/0003_absorb_import_claims.sql), unique on
 * (user_id, import_id), next to the credit ledger in the same database. The
 * row is claimed BEFORE the clone, scan and charge, so a retry that lands on a
 * different absorb instance (or after a restart) finds it and is not charged
 * again: a finished import replays its first result with cost 0, and one that
 * is still running elsewhere gets 409 import_in_progress.
 *
 * A failed import releases its claim, so it can be retried and is charged
 * only when it succeeds. A claim left `pending` by an instance that died
 * mid-import can be taken over after PENDING_STALE_MS.
 *
 * With no database configured (local dev) the same contract runs in memory
 * for this process only.
 */
import type { SqlQuery } from '../../middleware/rateLimiter.js';

export type ScanOutcome = { status: number; json: Record<string, unknown> };
export type ClaimResult =
  | { kind: 'claimed' }
  | { kind: 'done'; outcome: ScanOutcome }
  | { kind: 'pending' };

export interface ImportClaimStore {
  /** Take the (user, import) claim, or report who already has it. */
  claim(userId: string, importId: string): Promise<ClaimResult>;
  /** Record the delivered result; later claims replay it. */
  complete(userId: string, importId: string, outcome: ScanOutcome): Promise<void>;
  /** Drop a pending claim after a failure, so the import can be retried. */
  release(userId: string, importId: string): Promise<void>;
}

/** A pending claim older than this belongs to an instance that died mid-import. */
export const PENDING_STALE_MS = 15 * 60 * 1000;

/**
 * Insert the claim, or take over a stale pending one. RETURNING a row means
 * this caller owns the import; no row means someone else does.
 */
export const CLAIM_SQL = `INSERT INTO absorb_import_claims (user_id, import_id, status, claimed_at)
VALUES ($1, $2, 'pending', now())
ON CONFLICT (user_id, import_id) DO UPDATE SET claimed_at = now()
  WHERE absorb_import_claims.status = 'pending'
    AND absorb_import_claims.claimed_at < now() - ($3 * interval '1 millisecond')
RETURNING import_id`;

export const READ_CLAIM_SQL = `SELECT status, outcome FROM absorb_import_claims
WHERE user_id = $1 AND import_id = $2`;

export const COMPLETE_CLAIM_SQL = `UPDATE absorb_import_claims
SET status = 'done', outcome = $3::jsonb, completed_at = now()
WHERE user_id = $1 AND import_id = $2`;

export const RELEASE_CLAIM_SQL = `DELETE FROM absorb_import_claims
WHERE user_id = $1 AND import_id = $2 AND status = 'pending'`;

export class PostgresImportClaimStore implements ImportClaimStore {
  constructor(private readonly query: SqlQuery) {}

  async claim(userId: string, importId: string): Promise<ClaimResult> {
    const won = await this.query(CLAIM_SQL, [userId, importId, PENDING_STALE_MS]);
    if (won.rows.length > 0) return { kind: 'claimed' };
    const { rows } = await this.query(READ_CLAIM_SQL, [userId, importId]);
    const row = rows[0];
    if (row?.status === 'done' && row.outcome) {
      const outcome = (typeof row.outcome === 'string' ? JSON.parse(row.outcome) : row.outcome) as ScanOutcome;
      return { kind: 'done', outcome };
    }
    return { kind: 'pending' };
  }

  async complete(userId: string, importId: string, outcome: ScanOutcome): Promise<void> {
    await this.query(COMPLETE_CLAIM_SQL, [userId, importId, JSON.stringify(outcome)]);
  }

  async release(userId: string, importId: string): Promise<void> {
    await this.query(RELEASE_CLAIM_SQL, [userId, importId]);
  }
}

/** The same contract, for one process (no database configured). */
export class MemoryImportClaimStore implements ImportClaimStore {
  private readonly rows = new Map<string, { status: 'pending' | 'done'; at: number; outcome?: ScanOutcome }>();

  async claim(userId: string, importId: string): Promise<ClaimResult> {
    const key = `${userId}:${importId}`;
    const row = this.rows.get(key);
    const now = Date.now();
    if (!row || (row.status === 'pending' && now - row.at > PENDING_STALE_MS)) {
      this.rows.set(key, { status: 'pending', at: now });
      return { kind: 'claimed' };
    }
    if (row.status === 'done' && row.outcome) return { kind: 'done', outcome: row.outcome };
    return { kind: 'pending' };
  }

  async complete(userId: string, importId: string, outcome: ScanOutcome): Promise<void> {
    this.rows.set(`${userId}:${importId}`, { status: 'done', at: Date.now(), outcome });
  }

  async release(userId: string, importId: string): Promise<void> {
    const key = `${userId}:${importId}`;
    if (this.rows.get(key)?.status === 'pending') this.rows.delete(key);
  }

  clear(): void {
    this.rows.clear();
  }
}
