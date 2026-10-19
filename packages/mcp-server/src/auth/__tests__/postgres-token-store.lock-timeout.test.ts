/**
 * Release follow-up on #578: the no_client_credentials ALTER runs as
 * BEGIN; SET LOCAL lock_timeout='5s'; ALTER; COMMIT on one client, rolls back
 * on error, and never leaves lock_timeout set on the pooled session.
 * A fake pool models Postgres session vs transaction-local settings.
 */
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  NO_CLIENT_CREDENTIALS_DDL,
  PostgresTokenStore,
  runLockBoundedDdl,
} from '../postgres-token-store';

class FakeConn {
  session: Record<string, string> = {};
  local: Record<string, string> | null = null;
  log: string[] = [];
  released = 0;
  constructor(private failOn?: RegExp) {}
  lockTimeout(): string {
    return this.local?.lock_timeout ?? this.session.lock_timeout ?? '0';
  }
  async query(sql: string) {
    this.log.push(sql);
    const t = sql.trim();
    if (/^BEGIN/i.test(t)) this.local = {};
    else if (/^(COMMIT|ROLLBACK)/i.test(t)) this.local = null;
    else if (/^SET LOCAL lock_timeout/i.test(t)) {
      if (this.local) this.local.lock_timeout = '5s';
    } else if (/SET lock_timeout/i.test(t)) this.session.lock_timeout = '5s';
    if (this.failOn && this.failOn.test(t)) throw new Error('lock timeout');
    return { rows: [], rowCount: 0 };
  }
  release() {
    this.released++;
  }
}

function fakePool(conn: FakeConn): Pool {
  return {
    connect: async () => conn,
    query: (sql: string) => conn.query(sql),
  } as unknown as Pool;
}

describe('no_client_credentials DDL is lock-bounded and leaves no session setting', () => {
  it('BEGIN; SET LOCAL; ALTER; COMMIT on one client, released', async () => {
    const c = new FakeConn();
    await runLockBoundedDdl(fakePool(c), NO_CLIENT_CREDENTIALS_DDL);
    expect(c.log).toEqual([
      'BEGIN',
      "SET LOCAL lock_timeout = '5s'",
      NO_CLIENT_CREDENTIALS_DDL,
      'COMMIT',
    ]);
    expect(c.lockTimeout()).toBe('0');
    expect(c.released).toBe(1);
  });

  it('on ALTER error: ROLLBACK, released, no lock_timeout left, error surfaces', async () => {
    const c = new FakeConn(/no_client_credentials/);
    await expect(runLockBoundedDdl(fakePool(c), NO_CLIENT_CREDENTIALS_DDL)).rejects.toThrow();
    expect(c.log.at(-1)).toBe('ROLLBACK');
    expect(c.lockTimeout()).toBe('0');
    expect(c.released).toBe(1);
  });

  it('ensureSchema: the pooled session has no lock_timeout afterwards, and SCHEMA_SQL has no session SET', async () => {
    const c = new FakeConn();
    const store = new PostgresTokenStore(fakePool(c));
    await store.countClients().catch(() => undefined);
    expect(c.log.some((q) => /^\s*SET lock_timeout/im.test(q))).toBe(false);
    expect(c.log).toContain("SET LOCAL lock_timeout = '5s'");
    expect(c.session.lock_timeout).toBeUndefined();
    expect(c.lockTimeout()).toBe('0');
  });
});
