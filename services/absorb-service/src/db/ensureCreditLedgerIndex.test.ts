/**
 * The boot-time credit-ledger check, which until 2026-09-23 had no test at all.
 *
 * Two claims live in ensureCreditLedgerIndex.ts that nothing enforced:
 *
 *   1. that its dedupe SQL is "identical to migration 0001 so the two paths
 *      cannot drift" — a comment, with no check behind it;
 *   2. that its boot log answers "how much was credited twice?" — true only on
 *      a boot that happened to do the marking itself, and silent on a clean
 *      zero, so a real zero and a report that never ran printed the same thing.
 *
 * The exposure line is about to be the number a founder decision starts from
 * (reclaiming duplicate credits, decided 2026-09-23), so the words it prints are
 * pinned here rather than assumed.
 *
 * What this file cannot test, said plainly: the SQL is never executed. There is
 * no real-Postgres harness in this repo, so the statements are checked as text
 * — equivalence between the two copies, and the presence of the race guard —
 * not run. The race guard's concurrent behaviour rests on Postgres's documented
 * READ COMMITTED re-check.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CREATE_INDEX_SQL,
  DEDUPE_SQL,
  EXPOSURE_SQL,
  INDEX_STATE_SQL,
  classifyIndexState,
  describeLedgerExposure,
  ensureCreditLedgerIndex,
} from './ensureCreditLedgerIndex.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', '..', 'drizzle', '0001_dedupe_stripe_sessions.sql');

const RACE_GUARD = 'AND ct.stripe_session_id IS NOT NULL';

/** The dedupe UPDATE from the migration: from `WITH ranked AS` to its `;`. */
function migrationDedupe(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('WITH ranked AS');
  expect(start, 'migration 0001 still contains the dedupe statement').toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(';', start);
  expect(end, 'the dedupe statement is terminated').toBeGreaterThan(start);
  return sql.slice(start, end);
}

/**
 * Compare statements, not formatting: strip SQL line comments, collapse
 * whitespace OUTSIDE string literals, and replace the one field that is SUPPOSED
 * to differ — the `supersededBy` label saying which path did the marking.
 *
 * Whitespace inside a quoted literal is kept exactly. The first version
 * collapsed it everywhere, so a space added inside a literal in one copy stayed
 * green (claude2's review of be0ede0ff). A literal's contents are data, and data
 * that differs between the two copies is exactly the drift this test exists for.
 */
function normalize(statement: string): string {
  const withoutComments = statement
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/'supersededBy',\s*'[^']*'/, "'supersededBy', <label>");
  // Split into quoted literals (odd indexes) and everything else (even).
  return withoutComments
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\s+/g, ' ')))
    .join('')
    .trim();
}

/** The unique-index statement from the migration: `CREATE UNIQUE INDEX ... ;` */
function migrationCreateIndex(): string {
  const sql = readFileSync(MIGRATION, 'utf8');
  const start = sql.indexOf('CREATE UNIQUE INDEX');
  expect(start, 'migration 0001 still builds a UNIQUE index').toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf(';', start));
}

describe('the two dedupe copies cannot drift', () => {
  it('the migration and the boot path run the same statement, apart from the label', () => {
    expect(normalize(DEDUPE_SQL)).toBe(normalize(migrationDedupe()));
  });

  it('both carry the race guard, so a concurrent run cannot erase the payment link', () => {
    // Without it, a second run re-checks WHERE against a row the first already
    // committed, still matches, and overwrites supersededStripeSessionId with
    // NULL — the duplicate stays marked but no longer says which payment it
    // duplicated, which is the field a clawback needs.
    expect(DEDUPE_SQL).toContain(RACE_GUARD);
    expect(migrationDedupe()).toContain(RACE_GUARD);
  });

  it('the label really is the only intended difference', () => {
    // Guards the normalizer itself: if it swallowed more than the label, the
    // drift test above would pass over a real difference.
    expect(DEDUPE_SQL).toContain("'supersededBy', 'boot ensureCreditLedgerIndex'");
    expect(migrationDedupe()).toContain("'supersededBy', 'migration 0001_dedupe_stripe_sessions'");
    expect(normalize(DEDUPE_SQL)).toContain('supersededStripeSessionId');
  });
});

describe('the exposure the boot log reports', () => {
  it('counts only rows the dedupe marked, and only grants', () => {
    expect(EXPOSURE_SQL).toContain("metadata ? 'supersededStripeSessionId'");
    expect(EXPOSURE_SQL).toContain('amount_cents > 0');
  });

  it('says ZERO out loud, so "nothing to reclaim" never looks like "never measured"', () => {
    const line = describeLedgerExposure({ grants: 0, accounts: 0, credits: 0 });
    expect(line).toContain('0 duplicate grants');
    expect(line).not.toContain('NOT reclaimed');
  });

  it('states count, accounts and credits when there is something to reclaim', () => {
    const line = describeLedgerExposure({ grants: 3, accounts: 2, credits: 5000 });
    expect(line).toContain('3 duplicate grant(s)');
    expect(line).toContain('2 account(s)');
    expect(line).toContain('5000 credits granted twice and NOT reclaimed');
  });
});

describe('the unique index the boot builds is the one the migration builds', () => {
  it('is UNIQUE — an index that lost UNIQUE would still read as "present"', () => {
    expect(CREATE_INDEX_SQL).toMatch(/^CREATE UNIQUE INDEX /);
  });

  it('matches migration 0001 statement for statement', () => {
    // Quoting and IF NOT EXISTS are the same in both; compare as normalized text.
    expect(normalize(CREATE_INDEX_SQL)).toBe(normalize(migrationCreateIndex()));
  });
});

describe('an INVALID index is not protection', () => {
  it('reads validity, not mere presence', () => {
    // pg_indexes lists invalid indexes too; only pg_index.indisvalid says whether
    // one enforces anything.
    expect(INDEX_STATE_SQL).toContain('indisvalid');
    expect(INDEX_STATE_SQL).not.toContain('pg_indexes');
  });

  it('classifies missing, valid and invalid — and treats unknown validity as invalid', () => {
    expect(classifyIndexState([])).toBe('missing');
    expect(classifyIndexState([{ valid: true }])).toBe('valid');
    expect(classifyIndexState([{ valid: false }])).toBe('invalid');
    // A null never counts as protection.
    expect(classifyIndexState([{ valid: null }])).toBe('invalid');
  });
});

/**
 * These call the REAL ensureCreditLedgerIndex(). claude2's review found no test
 * did, so every promise about what the boot prints was unchecked. The two paths
 * here need no database: one has none configured, the other points at a port
 * nothing listens on. The paths that DO need Postgres — PRESENT, CREATED,
 * INVALID-rebuilt — are not covered here and are named as such rather than
 * implied.
 */
describe('the boot check itself says UNKNOWN, never nothing, when it cannot measure', () => {
  const saved = { url: process.env.DATABASE_URL, timeout: process.env.PG_CONNECTION_TIMEOUT_MS };
  afterEach(() => {
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.url;
    if (saved.timeout === undefined) delete process.env.PG_CONNECTION_TIMEOUT_MS;
    else process.env.PG_CONNECTION_TIMEOUT_MS = saved.timeout;
    vi.restoreAllMocks();
  });

  function captureWarnings(): () => string {
    const lines: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    return () => lines.join('\n');
  }

  it('with no DATABASE_URL: protection UNVERIFIED and exposure UNKNOWN', async () => {
    delete process.env.DATABASE_URL;
    const warnings = captureWarnings();
    await ensureCreditLedgerIndex();
    expect(warnings()).toContain('UNVERIFIED');
    expect(warnings()).toContain('credit ledger exposure: UNKNOWN');
  });

  it('when the database cannot be reached: NOT guaranteed and exposure UNKNOWN', async () => {
    // Port 1 on loopback refuses immediately; nothing listens there.
    process.env.DATABASE_URL = 'postgres://nobody:nothing@127.0.0.1:1/none';
    const warnings = captureWarnings();
    await ensureCreditLedgerIndex();
    expect(warnings()).toContain('NOT guaranteed');
    expect(warnings()).toContain('credit ledger exposure: UNKNOWN');
    expect(warnings()).not.toContain('0 duplicate grants');
  });
});

describe('the normalizer does not swallow a difference inside a literal', () => {
  it('a space added inside a quoted value is a real difference', () => {
    const a = "SET x = 'duplicate webhook'";
    const b = "SET x = 'duplicate  webhook'";
    expect(normalize(a)).not.toBe(normalize(b));
    // …while whitespace OUTSIDE literals is still just formatting.
    expect(normalize("SET  x =\n'duplicate webhook'")).toBe(normalize(a));
  });
});
