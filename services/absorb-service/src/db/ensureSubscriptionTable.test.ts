/**
 * The boot step that creates credit_subscriptions must match, statement for
 * statement, the migration fresh installs run, and the drizzle table the code
 * queries. Three copies of one table can drift; these tests are what stop it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { creditSubscriptions } from '@holoscript/absorb-service/schema';
import { SUBSCRIPTION_TABLE_SQL, ensureSubscriptionTable } from './ensureSubscriptionTable.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, '..', '..', 'drizzle', '0002_credit_subscriptions.sql');

/** Statements as the database sees them: comments and layout removed. */
function statements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*;\s*$/, '')
        .trim()
    )
    .filter(Boolean);
}

describe('credit_subscriptions: one table, three copies, no drift', () => {
  it('the boot statements are exactly the migration file statements', () => {
    expect(statements(SUBSCRIPTION_TABLE_SQL.join('\n--> statement-breakpoint\n'))).toEqual(
      statements(readFileSync(MIGRATION, 'utf8'))
    );
  });

  it('every statement can run twice: all IF NOT EXISTS', () => {
    for (const s of SUBSCRIPTION_TABLE_SQL) expect(s).toMatch(/IF NOT EXISTS/);
  });

  it('the columns and indexes are the ones the drizzle table queries', () => {
    const config = getTableConfig(creditSubscriptions as unknown as PgTable);
    const createTable = SUBSCRIPTION_TABLE_SQL[0];
    const sqlColumns = [...createTable.matchAll(/^\s*"([a-z_]+)"\s/gm)].map((m) => m[1]).sort();
    expect(sqlColumns).toEqual(config.columns.map((c) => c.name).sort());
    const sqlIndexes = SUBSCRIPTION_TABLE_SQL.slice(1)
      .map((s) => /INDEX IF NOT EXISTS "([a-z_]+)"/.exec(s)?.[1])
      .sort();
    expect(sqlIndexes).toEqual(config.indexes.map((i) => i.config.name).sort());
  });

  it('each column is required, or optional, in the SQL exactly as in the drizzle table', () => {
    // Names alone let the two copies disagree on NOT NULL: review found the
    // name check stayed green after a NOT NULL was dropped from both SQL copies.
    // Nullability decides what a customer-only row (no subscription yet) and a
    // row of unknown Stripe mode can hold, so it is compared too.
    const config = getTableConfig(creditSubscriptions as unknown as PgTable);
    const sqlRequired = Object.fromEntries(
      [...SUBSCRIPTION_TABLE_SQL[0].matchAll(/^\s*"([a-z_]+)"\s([^\n]*?),?$/gm)].map((m) => [
        m[1],
        /NOT NULL/.test(m[2]),
      ])
    );
    const drizzleRequired = Object.fromEntries(config.columns.map((c) => [c.name, c.notNull]));
    expect(sqlRequired).toEqual(drizzleRequired);
    // The two a Studio Pro row relies on being optional.
    expect(drizzleRequired.stripe_subscription_id).toBe(false);
    expect(drizzleRequired.livemode).toBe(false);
  });

  it('both indexes are unique, so no customer or subscription can belong to two users', () => {
    const indexes = SUBSCRIPTION_TABLE_SQL.slice(1);
    expect(indexes).toHaveLength(2);
    for (const s of indexes) expect(s).toMatch(/^CREATE UNIQUE INDEX/);
  });
});

describe('ensureSubscriptionTable says UNKNOWN when it cannot look', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('with no DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await ensureSubscriptionTable()).toBe('unknown');
    expect(warn.mock.calls.flat().join(' ')).toMatch(/UNKNOWN/);
  });

  it('when the database cannot be reached', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://nobody:nothing@127.0.0.1:1/none');
    vi.stubEnv('PG_CONNECTION_TIMEOUT_MS', '2000');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await ensureSubscriptionTable()).toBe('unknown');
    expect(error.mock.calls.flat().join(' ')).toMatch(/subscription table UNKNOWN/);
  });
});
