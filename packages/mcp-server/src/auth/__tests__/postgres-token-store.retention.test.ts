/**
 * Client retention in PostgresTokenStore, against a real PostgreSQL (board
 * task_1790545471449_w6yi).
 *
 * The in-memory backend proves the rule; this file proves the SQL that
 * production runs: the column added to a table that already holds rows, the
 * one-statement retirement, and the use clock that never moves back.
 *
 * Gated like compute-job-store.postgres.test.ts: skipped unless
 * OAUTH_POSTGRES_TEST_URL is set, and refused outright unless that URL points
 * at this machine (localhost, 127.0.0.1, ::1). Each test builds its own
 * throwaway schema and drops it afterwards; nothing touches `public`.
 *
 *   OAUTH_POSTGRES_TEST_URL=postgres://user@127.0.0.1:5432/postgres \
 *     pnpm exec vitest run src/auth/__tests__/postgres-token-store.retention.test.ts
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresTokenStore } from '../postgres-token-store';
import { ClientStoreFullError, TokenStore } from '../token-store';

const DATABASE_URL = process.env.OAUTH_POSTGRES_TEST_URL;
const DAY = 86_400_000;

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return ['127.0.0.1', 'localhost', '::1'].includes(host);
  } catch {
    return false;
  }
}

/**
 * The oauth tables exactly as the store created them before this change: no
 * last_used_at. Production's full table has this shape.
 */
const PRE_RETENTION_SCHEMA = `
CREATE TABLE oauth_access_tokens (
  token TEXT PRIMARY KEY, client_id TEXT NOT NULL, scopes TEXT[] NOT NULL DEFAULT '{}',
  issued_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, agent_id TEXT, dpop_thumbprint TEXT
);
CREATE TABLE oauth_refresh_tokens (
  token TEXT PRIMARY KEY, client_id TEXT NOT NULL, scopes TEXT[] NOT NULL DEFAULT '{}',
  issued_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, chain_id TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE, agent_id TEXT
);
CREATE TABLE oauth_auth_codes (
  code TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}', code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256', expires_at BIGINT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY, client_secret_hash TEXT NOT NULL, client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}', scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL, client_type TEXT NOT NULL DEFAULT 'public',
  rate_limit INTEGER NOT NULL DEFAULT 100, agent_id TEXT
);
CREATE TABLE oauth_revoked_chains (chain_id TEXT PRIMARY KEY, revoked_at BIGINT NOT NULL);
`;

const REGISTRATION = {
  clientName: 'retention-pg-test',
  redirectUris: ['https://client.test/callback'],
  scopes: ['tools:read'],
  clientType: 'confidential' as const,
};

describe.skipIf(!DATABASE_URL)('PostgresTokenStore client retention, real PostgreSQL', () => {
  const pools: Pool[] = [];
  const schemas: string[] = [];

  function adminPool(): Pool {
    if (!isLoopbackUrl(DATABASE_URL as string)) {
      throw new Error(
        'OAUTH_POSTGRES_TEST_URL must point at this machine (localhost, 127.0.0.1 or ::1). ' +
          'These tests create and drop schemas; they refuse any other database.'
      );
    }
    if (!pools[0]) pools[0] = new Pool({ connectionString: DATABASE_URL, ssl: false, max: 2 });
    return pools[0];
  }

  /** A fresh schema, optionally pre-loaded with the pre-retention tables. */
  async function freshStore(options: { preRetentionTables?: boolean } = {}) {
    const schema = `oauth_retention_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await adminPool().query(`CREATE SCHEMA ${schema}`);
    schemas.push(schema);
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: false,
      max: 4,
      // lock_timeout: a statement that would wait on another transaction fails
      // in 5 s instead of hanging the suite.
      options: `-c search_path=${schema} -c lock_timeout=5000`,
    });
    pools.push(pool);
    if (options.preRetentionTables) await pool.query(PRE_RETENTION_SCHEMA);
    const backend = new PostgresTokenStore(pool);
    const store = new TokenStore({ backend, cleanupIntervalMs: 0 });
    return { pool, backend, store };
  }

  afterAll(async () => {
    for (const schema of schemas) {
      await adminPool().query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    await Promise.all(pools.map((pool) => pool.end()));
  });

  it('upgrading a full pre-retention table keeps every row, starts every idle clock now, and retires nothing', async () => {
    const { pool, store } = await freshStore({ preRetentionTables: true });
    // Production's shape: 1000 rows, the newest from 2026-06-28.
    const first = Date.parse('2026-03-25T00:00:00Z');
    const last = Date.parse('2026-06-28T00:00:00Z');
    await pool.query(
      `INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, created_at, client_type)
       SELECT 'hsc_old_' || g, 'hash', 'old client ' || g,
              $1::bigint + ((g - 1) * ($2::bigint - $1::bigint) / 999), 'confidential'
         FROM generate_series(1, 1000) AS g`,
      [first, last]
    );
    const upgradeStartedAt = Date.now();

    // The first call runs the schema step: the column appears here.
    await expect(
      store.registerClient({ ...REGISTRATION, maxClients: 1000 })
    ).rejects.toBeInstanceOf(ClientStoreFullError);

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n, MIN(last_used_at) AS lo, MAX(last_used_at) AS hi,
              MAX(created_at) AS newest FROM oauth_clients`
    );
    expect(rows[0].n).toBe(1000);
    // One shared stamp: the moment tracking began, not any row's real history.
    expect(Number(rows[0].lo)).toBe(Number(rows[0].hi));
    expect(Number(rows[0].lo)).toBeGreaterThanOrEqual(upgradeStartedAt - 5_000);
    expect(Number(rows[0].lo)).toBeLessThanOrEqual(Date.now() + 5_000);
    expect(Number(rows[0].newest)).toBe(last);

    // At the default cap there is room: the next client is stored, nothing retired.
    const registered = await store.registerClient(REGISTRATION);
    expect(registered.retiredClientIds).toEqual([]);
    const after = await pool.query('SELECT COUNT(*)::int AS n FROM oauth_clients');
    expect(after.rows[0].n).toBe(1001);
  });

  it('retires only provably idle rows, longest-idle first, exactly as many as needed', async () => {
    const { pool, backend, store } = await freshStore();
    const now = Date.now();
    const client = (clientId: string, idleDays: number, registeredDaysAgo = 90) =>
      backend.setClient({
        clientId,
        clientSecretHash: 'hash',
        clientName: clientId,
        redirectUris: [],
        scopes: ['tools:read'],
        createdAt: now - registeredDaysAgo * DAY,
        clientType: 'confidential',
        rateLimit: 60,
        lastUsedAt: now - idleDays * DAY,
      });
    await client('idle_60', 60);
    await client('idle_50', 50);
    await client('idle_40', 40);
    await client('idle_90_expired_access_token', 90);
    await client('idle_90_consumed_refresh_token', 90);
    await client('used_5_days_ago', 5);
    // Longest "idle" of all, so only the registered-recently test keeps it.
    await client('registered_5_days_ago', 70, 5);
    // Token rows in states the sweep has not reached yet still hold their client.
    await backend.setAccessToken({
      token: 'at_expired',
      clientId: 'idle_90_expired_access_token',
      scopes: [],
      issuedAt: now - 2 * 3_600_000,
      expiresAt: now - 3_600_000,
    });
    await backend.setRefreshToken({
      token: 'rt_consumed',
      clientId: 'idle_90_consumed_refresh_token',
      scopes: [],
      issuedAt: now - DAY,
      expiresAt: now + DAY,
      chainId: 'chain',
      used: true,
    });

    const registered = await store.registerClient({ ...REGISTRATION, maxClients: 6 });

    expect([...registered.retiredClientIds].sort()).toEqual(['idle_50', 'idle_60']);
    const { rows } = await pool.query('SELECT client_id FROM oauth_clients');
    expect(rows.map((r: { client_id: string }) => r.client_id).sort()).toEqual(
      [
        'idle_40',
        'idle_90_consumed_refresh_token',
        'idle_90_expired_access_token',
        registered.clientId,
        'registered_5_days_ago',
        'used_5_days_ago',
      ].sort()
    );
  });

  it('a row a grant is recording use on right now is skipped, and its new last use then keeps it', async () => {
    const { pool, backend } = await freshStore();
    const now = Date.now();
    for (const [clientId, idleDays] of [
      ['being_granted', 60],
      ['idle_40', 40],
    ] as const) {
      await backend.setClient({
        clientId,
        clientSecretHash: 'hash',
        clientName: clientId,
        redirectUris: [],
        scopes: [],
        createdAt: now - 90 * DAY,
        clientType: 'confidential',
        rateLimit: 60,
        lastUsedAt: now - idleDays * DAY,
      });
    }
    // A grant's use record, open and not yet committed, holds the row.
    const grant = await pool.connect();
    try {
      await grant.query('BEGIN');
      await grant.query('UPDATE oauth_clients SET last_used_at = $2 WHERE client_id = $1', [
        'being_granted',
        now,
      ]);

      // Without SKIP LOCKED, or without the row lock, this call would wait on
      // the uncommitted grant; the pool's lock_timeout turns that into a
      // failure here instead of a hang.
      const during = await backend.retireIdleClients({ idleBefore: now - 30 * DAY, limit: 1 });
      expect(during).toEqual(['idle_40']);

      await grant.query('COMMIT');
    } finally {
      // Destroy rather than pool it: if an assertion failed, the transaction is
      // still open and its lock would stall the schema drop in afterAll.
      grant.release(true);
    }

    const after = await backend.retireIdleClients({ idleBefore: now - 30 * DAY, limit: 1 });
    expect(after).toEqual([]);
    expect((await backend.getClient('being_granted'))?.lastUsedAt).toBe(now);
  });

  it('refuses rather than retire when every row is in use, recent, or holds a token', async () => {
    const { backend, store } = await freshStore();
    const now = Date.now();
    await backend.setClient({
      clientId: 'used_yesterday',
      clientSecretHash: 'hash',
      clientName: 'used_yesterday',
      redirectUris: [],
      scopes: [],
      createdAt: now - 90 * DAY,
      clientType: 'confidential',
      rateLimit: 60,
      lastUsedAt: now - DAY,
    });

    await expect(store.registerClient({ ...REGISTRATION, maxClients: 1 })).rejects.toBeInstanceOf(
      ClientStoreFullError
    );
    expect(await backend.countClients()).toBe(1);
  });

  it('a token written through records use, and an older token never moves the clock back', async () => {
    const { backend, store } = await freshStore();
    const now = Date.now();
    await backend.setClient({
      clientId: 'came_back',
      clientSecretHash: 'hash',
      clientName: 'came_back',
      redirectUris: [],
      scopes: [],
      createdAt: now - 90 * DAY,
      clientType: 'confidential',
      rateLimit: 60,
      lastUsedAt: now - 40 * DAY,
    });

    await store.importAccessToken({
      token: 'at_now',
      clientId: 'came_back',
      scopes: [],
      issuedAt: now,
      expiresAt: now + 3_600_000,
    });
    expect((await backend.getClient('came_back'))?.lastUsedAt).toBe(now);

    await store.importAccessToken({
      token: 'at_old',
      clientId: 'came_back',
      scopes: [],
      issuedAt: now - 50 * DAY,
      expiresAt: now - 50 * DAY + 3_600_000,
    });
    expect((await backend.getClient('came_back'))?.lastUsedAt).toBe(now);
    expect(await backend.touchClient('never_registered', now)).toBe(false);
  });

  it('rewriting a stored client id at the cap takes no new slot and keeps the newer use time', async () => {
    const { backend, store } = await freshStore();
    await store.registerClient({ ...REGISTRATION, clientId: 'hsc_a', clientSecret: 's1' });
    await store.registerClient({ ...REGISTRATION, clientId: 'hsc_b', clientSecret: 's2' });
    const usedAt = (await backend.getClient('hsc_a'))?.lastUsedAt as number;

    const again = await store.registerClient({
      ...REGISTRATION,
      clientId: 'hsc_a',
      clientSecret: 's3',
      maxClients: 2,
    });

    expect(again.retiredClientIds).toEqual([]);
    expect(await backend.countClients()).toBe(2);
    const row = await backend.getClient('hsc_a');
    expect(row?.clientSecretHash).toBe(store.hashSecret('s3'));
    expect(row?.lastUsedAt).toBeGreaterThanOrEqual(usedAt);
  });
});
