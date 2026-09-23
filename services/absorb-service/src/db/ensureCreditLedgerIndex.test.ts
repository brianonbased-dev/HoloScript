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
import { describe, expect, it } from 'vitest';

import { DEDUPE_SQL, EXPOSURE_SQL, describeLedgerExposure } from './ensureCreditLedgerIndex.js';

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
 * whitespace, and replace the one field that is SUPPOSED to differ — the
 * `supersededBy` label saying which path did the marking.
 */
function normalize(statement: string): string {
  return statement
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/'supersededBy',\s*'[^']*'/, "'supersededBy', <label>")
    .replace(/\s+/g, ' ')
    .trim();
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
