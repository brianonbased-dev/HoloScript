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
