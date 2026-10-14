/**
 * Durable per-user and per-(user, app) rate limits (external-agent access path, PR-6).
 *
 * Replaces the in-process Map that reset on every deploy and was separate per
 * replica. Counters live in Postgres (`rate_counters`, fixed hourly window,
 * one atomic upsert per hit) when a database is configured, otherwise in memory.
 *
 * Caps roll up to the human: every hit counts against the user's own key
 * (`u:<userId>`) AND, when the call comes through an app/agent client, against
 * `ua:<userId>:<clientId>`. The app's effective cap is min(appCap, userCap), so
 * an app limit can only ever be LOWER than the user's, never raise it.
 */

export interface RateCounterStore {
  /** Count one hit for `key` in the current window and return the new count. */
  hit(key: string, windowMs: number, now: number): Promise<number>;
}

export class MemoryRateCounterStore implements RateCounterStore {
  private readonly map = new Map<string, { count: number; windowStart: number }>();

  async hit(key: string, windowMs: number, now: number): Promise<number> {
    const entry = this.map.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      this.map.set(key, { count: 1, windowStart: now });
      return 1;
    }
    entry.count++;
    return entry.count;
  }

  /** Drop expired windows (call periodically). */
  sweep(windowMs: number, now: number): void {
    for (const [key, entry] of this.map) {
      if (now - entry.windowStart >= windowMs) this.map.delete(key);
    }
  }
}

export type SqlQuery = (
  text: string,
  params: unknown[]
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export const RATE_COUNTERS_DDL = `CREATE TABLE IF NOT EXISTS rate_counters (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
)`;

/** Atomic fixed-window increment: a stale window restarts at 1. */
export const RATE_COUNTERS_HIT_SQL = `INSERT INTO rate_counters (key, window_start, count)
VALUES ($1, to_timestamp($2 / 1000.0), 1)
ON CONFLICT (key) DO UPDATE SET
  count = CASE WHEN rate_counters.window_start <= to_timestamp(($2 - $3) / 1000.0) THEN 1 ELSE rate_counters.count + 1 END,
  window_start = CASE WHEN rate_counters.window_start <= to_timestamp(($2 - $3) / 1000.0) THEN EXCLUDED.window_start ELSE rate_counters.window_start END
RETURNING count`;

export class PostgresRateCounterStore implements RateCounterStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly query: SqlQuery) {}

  async hit(key: string, windowMs: number, now: number): Promise<number> {
    if (!this.ready) {
      this.ready = this.query(RATE_COUNTERS_DDL, []).then(() => undefined);
      this.ready.catch(() => {
        this.ready = null;
      });
    }
    await this.ready;
    const { rows } = await this.query(RATE_COUNTERS_HIT_SQL, [key, now, windowMs]);
    return Number(rows[0]?.count ?? 0);
  }
}

/**
 * Durable store with a memory fallback. If the database errors, the hit is
 * still counted (in memory) rather than letting the request through uncounted.
 */
export class FallbackRateCounterStore implements RateCounterStore {
  constructor(
    private readonly primary: RateCounterStore,
    private readonly fallback: RateCounterStore,
    private readonly onError: (e: unknown) => void = () => {}
  ) {}

  async hit(key: string, windowMs: number, now: number): Promise<number> {
    try {
      return await this.primary.hit(key, windowMs, now);
    } catch (e) {
      this.onError(e);
      return this.fallback.hit(key, windowMs, now);
    }
  }
}

export interface LimitCheck {
  userId: string;
  /** OAuth/app client acting for the user, if any. */
  clientId?: string;
  /** The human's hourly cap. */
  userLimit: number;
  /** Optional per-app cap; clamped so it can never exceed userLimit. */
  appLimit?: number;
}

export interface LimitResult {
  limited: boolean;
  remaining: number;
  /** Which cap tripped, if any. */
  scope?: 'user' | 'app';
  effectiveAppLimit?: number;
}

export function effectiveAppLimit(userLimit: number, appLimit?: number): number {
  if (appLimit === undefined || !Number.isFinite(appLimit) || appLimit < 0) return userLimit;
  return Math.min(userLimit, appLimit);
}

export class RateLimiter {
  constructor(
    private readonly store: RateCounterStore,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now
  ) {}

  async check(c: LimitCheck): Promise<LimitResult> {
    const now = this.clock();
    const userCount = await this.store.hit(`u:${c.userId}`, this.windowMs, now);
    let remaining = Math.max(0, c.userLimit - userCount);
    if (userCount > c.userLimit) return { limited: true, remaining: 0, scope: 'user' };

    if (c.clientId) {
      const cap = effectiveAppLimit(c.userLimit, c.appLimit);
      const appCount = await this.store.hit(`ua:${c.userId}:${c.clientId}`, this.windowMs, now);
      if (appCount > cap)
        return { limited: true, remaining: 0, scope: 'app', effectiveAppLimit: cap };
      remaining = Math.min(remaining, Math.max(0, cap - appCount));
      return { limited: false, remaining, effectiveAppLimit: cap };
    }
    return { limited: false, remaining };
  }
}
