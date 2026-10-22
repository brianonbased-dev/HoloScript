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
 * mid-import can be taken over after PENDING_STALE_MS, with three guards
 * (Mapping second seat on #617):
 *
 *   1. No takeover, fresh claim or release after a charge. A stale pending claim is taken over only
 *      when the ledger (`credit_transactions`) holds no usage row for this
 *      user and importId. An import that was charged but never recorded as
 *      done answers 409 import_already_charged instead of charging twice.
 *      The holder also re-confirms (and refreshes) its claim right before it
 *      charges (`confirm`), so a live holder is never stale at charge time.
 *   2. Holder token. Each claim carries a fresh `holder` token. complete,
 *      release and confirm match on it, so a late write from an old holder
 *      cannot overwrite or delete a newer holder's claim.
 *   3. Same import, same repo. The claim stores repo_url and branch. Reusing
 *      an importId with a different URL or branch is refused (409
 *      import_id_reused) and never takes over or replays the other import.
 *
 * With no database configured (local dev) the same contract runs in memory
 * for this process only (no ledger, so guard 1 is the confirm step only).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { SqlQuery } from '../../middleware/rateLimiter.js';

export type ScanOutcome = { status: number; json: Record<string, unknown> };
export interface ImportRef {
  repoUrl: string;
  branch: string | null;
}
export type ClaimResult =
  | { kind: 'claimed'; holder: string }
  | { kind: 'done'; outcome: ScanOutcome }
  | { kind: 'pending' }
  | { kind: 'charged' }
  | { kind: 'mismatch' };

export interface ImportClaimStore {
  /** Take the (user, import) claim, or report who already has it. */
  claim(userId: string, importId: string, ref: ImportRef): Promise<ClaimResult>;
  /** True (and the claim refreshed) only while `holder` still holds a pending claim. */
  confirm(userId: string, importId: string, holder: string): Promise<boolean>;
  /**
   * The same confirm, run on the debit's own transaction (deductCredits
   * `opts.guard`), so "still the holder" and the debit commit or roll back
   * together. The UPDATE row-locks the claim until that transaction ends, so a
   * takeover waits for it and then sees a fresh claim and the usage row.
   */
  chargeGuard(userId: string, importId: string, holder: string): (tx: unknown) => Promise<boolean>;
  /** Record the delivered result; later claims replay it. Ignored for a non-holder. */
  complete(userId: string, importId: string, holder: string, outcome: ScanOutcome): Promise<void>;
  /** Drop a pending claim after a failure, so the import can be retried. Ignored for a non-holder. */
  release(userId: string, importId: string, holder: string): Promise<void>;
}

/**
 * Production never runs the memory store: it has no ledger check (a stale
 * takeover and a release never consult credit_transactions), so it is for local
 * dev with no billing only. Treasurer, #617.
 */
export function databaseRequiredRefusal(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.NODE_ENV === 'production' && !env.DATABASE_URL
    ? 'DATABASE_URL is required in production: absorb will not run imports or charges on the in-memory claim store.'
    : null;
}

/** A store that refuses every claim (fails closed: 503, never charged). */
export class RefusingImportClaimStore implements ImportClaimStore {
  constructor(private readonly reason: string) {}
  async claim(): Promise<ClaimResult> {
    throw new Error(this.reason);
  }
  async confirm(): Promise<boolean> {
    return false;
  }
  chargeGuard(): (tx: unknown) => Promise<boolean> {
    return async () => false;
  }
  async complete(): Promise<void> {}
  async release(): Promise<void> {}
}

/** A pending claim older than this belongs to an instance that died mid-import. */
export const PENDING_STALE_MS = 15 * 60 * 1000;

/**
 * A live holder refreshes its claim this often for as long as it clones and
 * scans (Mapping, #617), so the claim's age is the time since the holder last
 * proved it was alive, never the length of the clone or scan. The clone is
 * capped at CLONE_TIMEOUT_MS (60 s); the scan has no cap of its own, which is
 * why the heartbeat is the guard and not a longer cutoff. PENDING_STALE_MS is
 * 15 heartbeats, so a live holder would have to miss 14 refreshes in a row
 * before a takeover could start.
 */
export const CLAIM_HEARTBEAT_MS = 60 * 1000;

/**
 * A usage row in the ledger for this user and importId: the import was charged.
 * It must match the row deductCredits writes (packages/absorb-service
 * src/credits/creditService.ts: type 'usage', the caller's metadata as given),
 * and /scan passes metadata { graphId, shallow, importId }. Pinned by
 * importClaims.ledger.test.ts against the real deductCredits.
 */
export const CHARGED_SQL = `EXISTS (SELECT 1 FROM credit_transactions ct
    WHERE ct.user_id::text = $1 AND ct.type = 'usage' AND ct.metadata->>'importId' = $2)`;

/**
 * Insert the claim, or take over a stale pending one for the same repo and
 * branch that was never charged. RETURNING a row means this caller owns the
 * import; no row means someone else does.
 * Params: $1 user, $2 import, $3 stale ms, $4 holder, $5 repo_url, $6 branch.
 */
export const CLAIM_SQL = `INSERT INTO absorb_import_claims (user_id, import_id, status, holder, repo_url, branch, claimed_at)
SELECT $1, $2, 'pending', $4, $5, $6, now()
WHERE NOT ${CHARGED_SQL}
ON CONFLICT (user_id, import_id) DO UPDATE SET claimed_at = now(), holder = EXCLUDED.holder
  WHERE absorb_import_claims.status = 'pending'
    AND absorb_import_claims.claimed_at < now() - ($3 * interval '1 millisecond')
    AND absorb_import_claims.repo_url IS NOT DISTINCT FROM EXCLUDED.repo_url
    AND absorb_import_claims.branch IS NOT DISTINCT FROM EXCLUDED.branch
    AND NOT ${CHARGED_SQL}
RETURNING import_id`;

export const READ_CLAIM_SQL = `SELECT status, outcome, repo_url, branch, ${CHARGED_SQL} AS charged
FROM absorb_import_claims
WHERE user_id = $1 AND import_id = $2`;

/** Params: $1 user, $2 import, $3 holder. */
export const CONFIRM_CLAIM_SQL = `UPDATE absorb_import_claims SET claimed_at = now()
WHERE user_id = $1 AND import_id = $2 AND holder = $3 AND status = 'pending'
RETURNING import_id`;

/** Params: $1 user, $2 import, $3 holder, $4 outcome. */
export const COMPLETE_CLAIM_SQL = `UPDATE absorb_import_claims
SET status = 'done', outcome = $4::jsonb, completed_at = now()
WHERE user_id = $1 AND import_id = $2 AND holder = $3`;

/**
 * Params: $1 user, $2 import, $3 holder. A charged claim is never deleted
 * (Mapping H1): an exception after the debit must not free the import for a
 * second charge.
 */
export const RELEASE_CLAIM_SQL = `DELETE FROM absorb_import_claims
WHERE user_id = $1 AND import_id = $2 AND holder = $3 AND status = 'pending'
  AND NOT ${CHARGED_SQL}`;

/** Params: $1 user, $2 import. Was this import already charged? */
export const CHARGED_ONLY_SQL = `SELECT ${CHARGED_SQL} AS charged`;

function sameRef(row: { repo_url?: unknown; branch?: unknown }, ref: ImportRef): boolean {
  return (row.repo_url ?? null) === ref.repoUrl && (row.branch ?? null) === (ref.branch ?? null);
}

export class PostgresImportClaimStore implements ImportClaimStore {
  constructor(
    private readonly query: SqlQuery,
    private readonly newHolder: () => string = randomUUID
  ) {}

  async claim(userId: string, importId: string, ref: ImportRef): Promise<ClaimResult> {
    const holder = this.newHolder();
    const won = await this.query(CLAIM_SQL, [
      userId,
      importId,
      PENDING_STALE_MS,
      holder,
      ref.repoUrl,
      ref.branch ?? null,
    ]);
    if (won.rows.length > 0) return { kind: 'claimed', holder };
    const { rows } = await this.query(READ_CLAIM_SQL, [userId, importId]);
    const row = rows[0];
    if (!row) {
      // No row and no insert: either the import was already charged (the
      // fresh insert is refused by the ledger check) or a concurrent delete.
      const ledger = await this.query(CHARGED_ONLY_SQL, [userId, importId]);
      return ledger.rows[0]?.charged === true ? { kind: 'charged' } : { kind: 'pending' };
    }
    if (!sameRef(row, ref)) return { kind: 'mismatch' };
    if (row.status === 'done' && row.outcome) {
      const outcome = (typeof row.outcome === 'string' ? JSON.parse(row.outcome) : row.outcome) as ScanOutcome;
      return { kind: 'done', outcome };
    }
    if (row.charged === true) return { kind: 'charged' };
    return { kind: 'pending' };
  }

  async confirm(userId: string, importId: string, holder: string): Promise<boolean> {
    const { rows } = await this.query(CONFIRM_CLAIM_SQL, [userId, importId, holder]);
    return rows.length > 0;
  }

  chargeGuard(userId: string, importId: string, holder: string): (tx: unknown) => Promise<boolean> {
    return async (tx: unknown) => {
      // CONFIRM_CLAIM_SQL, on the transaction's own client: holder- and
      // pending-gated, and it holds the claim row's lock until commit.
      const res = (await (tx as { execute: (q: unknown) => Promise<{ rows?: unknown[] }> }).execute(
        sql`UPDATE absorb_import_claims SET claimed_at = now()
WHERE user_id = ${userId} AND import_id = ${importId} AND holder = ${holder} AND status = 'pending'
RETURNING import_id`
      )) as { rows?: unknown[] };
      return (res.rows?.length ?? 0) > 0;
    };
  }

  async complete(userId: string, importId: string, holder: string, outcome: ScanOutcome): Promise<void> {
    await this.query(COMPLETE_CLAIM_SQL, [userId, importId, holder, JSON.stringify(outcome)]);
  }

  async release(userId: string, importId: string, holder: string): Promise<void> {
    await this.query(RELEASE_CLAIM_SQL, [userId, importId, holder]);
  }
}

type MemoryRow = {
  status: 'pending' | 'done';
  at: number;
  holder: string;
  ref: ImportRef;
  outcome?: ScanOutcome;
};

/** The same contract, for one process (no database configured). */
export class MemoryImportClaimStore implements ImportClaimStore {
  private readonly rows = new Map<string, MemoryRow>();

  async claim(userId: string, importId: string, ref: ImportRef): Promise<ClaimResult> {
    const key = `${userId}:${importId}`;
    const row = this.rows.get(key);
    const now = Date.now();
    if (row && !sameRef({ repo_url: row.ref.repoUrl, branch: row.ref.branch }, ref)) {
      return { kind: 'mismatch' };
    }
    if (!row || (row.status === 'pending' && now - row.at > PENDING_STALE_MS)) {
      const holder = randomUUID();
      this.rows.set(key, { status: 'pending', at: now, holder, ref: { repoUrl: ref.repoUrl, branch: ref.branch ?? null } });
      return { kind: 'claimed', holder };
    }
    if (row.status === 'done' && row.outcome) return { kind: 'done', outcome: row.outcome };
    return { kind: 'pending' };
  }

  async confirm(userId: string, importId: string, holder: string): Promise<boolean> {
    const row = this.rows.get(`${userId}:${importId}`);
    if (!row || row.holder !== holder || row.status !== 'pending') return false;
    row.at = Date.now();
    return true;
  }

  /** One process, no database: the check runs synchronously before the debit. Local dev only. */
  chargeGuard(userId: string, importId: string, holder: string): (tx: unknown) => Promise<boolean> {
    return () => this.confirm(userId, importId, holder);
  }

  async complete(userId: string, importId: string, holder: string, outcome: ScanOutcome): Promise<void> {
    const row = this.rows.get(`${userId}:${importId}`);
    if (!row || row.holder !== holder) return;
    Object.assign(row, { status: 'done', at: Date.now(), outcome });
  }

  async release(userId: string, importId: string, holder: string): Promise<void> {
    const key = `${userId}:${importId}`;
    const row = this.rows.get(key);
    if (row?.status === 'pending' && row.holder === holder) this.rows.delete(key);
  }

  /** Test seam: age a pending claim past PENDING_STALE_MS. */
  ageForTests(userId: string, importId: string): void {
    const row = this.rows.get(`${userId}:${importId}`);
    if (row) row.at = 0;
  }

  clear(): void {
    this.rows.clear();
  }
}