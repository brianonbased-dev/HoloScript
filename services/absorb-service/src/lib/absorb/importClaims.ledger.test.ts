/**
 * Mapping, #617 note 1: CHARGED_SQL must find exactly the ledger row the REAL
 * deductCredits writes for a /scan import, both the type ('usage') and the
 * importId path in the metadata. The row below is captured from the real
 * deductCredits (packages/absorb-service/src/credits/creditService.ts) through
 * a stand-in drizzle client, mapped to its Postgres column names with the real
 * creditTransactions table, and checked against the predicate CHARGED_SQL
 * states. Nothing here is a hand-made row.
 */
import { describe, expect, it, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { ChargeGuardRefused, deductCredits, setDbProvider } from '../../../../../packages/absorb-service/src/credits/creditService';
import { creditTransactions } from '../../../../../packages/absorb-service/src/schema';
import { CHARGED_SQL } from './importClaims.js';

const USER = '11111111-2222-4333-8444-555555555555';
const IMPORT_ID = 'imp-ledger-0001';

/** Run the real deductCredits and return the credit_transactions row it inserts, by column name. */
async function realLedgerRow(metadata: Record<string, unknown>): Promise<Record<string, unknown>> {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const chain = { set: () => chain, where: () => chain, returning: async () => [{ balanceCents: 90 }] };
  setDbProvider(() => ({
    update: () => chain,
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => void inserted.push({ table, values }),
    }),
  }));
  try {
    expect(await deductCredits(USER, 10, 'Codebase scan: https://github.com/owner/tiny#', metadata)).toEqual({
      balanceCents: 90,
    });
  } finally {
    setDbProvider(() => null);
  }
  expect(inserted).toHaveLength(1);
  expect(inserted[0].table).toBe(creditTransactions);
  const row: Record<string, unknown> = {};
  for (const [prop, col] of Object.entries(getTableColumns(creditTransactions))) {
    if (prop in inserted[0].values) row[col.name] = inserted[0].values[prop];
  }
  return row;
}

/**
 * CHARGED_SQL's predicate, read from the SQL text itself (so a change to the
 * SQL changes what this checks): user_id::text = $1, type = '<literal>',
 * metadata->>'<key>' = $2.
 */
function chargedSqlMatches(row: Record<string, unknown>, user: string, importId: string): boolean {
  const type = /ct\.type = '([^']+)'/.exec(CHARGED_SQL)?.[1];
  const key = /ct\.metadata->>'([^']+)' = \$2/.exec(CHARGED_SQL)?.[1];
  expect(CHARGED_SQL).toMatch(/FROM credit_transactions ct/);
  expect(CHARGED_SQL).toMatch(/ct\.user_id::text = \$1/);
  expect(type, 'CHARGED_SQL names a type literal').toBeDefined();
  expect(key, 'CHARGED_SQL names a metadata key').toBeDefined();
  const meta = row.metadata as Record<string, unknown> | undefined;
  // ->> yields text; a JSON null or a missing key never equals $2.
  const metaText = meta && meta[key!] != null ? String(meta[key!]) : null;
  return String(row.user_id) === user && row.type === type && metaText === importId;
}

describe('CHARGED_SQL matches the row the real deductCredits writes (Mapping, #617)', () => {
  it("the /scan charge (metadata { graphId, shallow, importId }) is found: type 'usage', metadata.importId", async () => {
    // Exactly the metadata routes/absorb.ts passes to deductCredits for /scan.
    const row = await realLedgerRow({ graphId: 'g-1', shallow: true, importId: IMPORT_ID });
    expect(row.type).toBe('usage');
    expect((row.metadata as Record<string, unknown>).importId).toBe(IMPORT_ID);
    expect(chargedSqlMatches(row, USER, IMPORT_ID)).toBe(true);
  });

  it('another import, another user, or a scan with no importId is not counted as this charge', async () => {
    const row = await realLedgerRow({ graphId: 'g-1', shallow: true, importId: IMPORT_ID });
    expect(chargedSqlMatches(row, USER, 'imp-other-0002')).toBe(false);
    expect(chargedSqlMatches(row, '99999999-2222-4333-8444-555555555555', IMPORT_ID)).toBe(false);
    const pathScan = await realLedgerRow({ graphId: 'g-2', shallow: true, importId: null });
    expect(chargedSqlMatches(pathScan, USER, IMPORT_ID)).toBe(false);
  });

  it('routes/absorb.ts still charges with importId at the top level of the metadata', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../routes/absorb.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/\{ graphId, shallow, importId: body\.importId \?\? null \}/);
  });
});
describe('deductCredits opts.guard: the guard and the debit share one transaction (CoS, #617)', () => {
  function txDb() {
    const log: string[] = [];
    const tx = {
      update: () => { log.push('update'); const c = { set: () => c, where: () => c, returning: async () => [{ balanceCents: 90 }] }; return c; },
      insert: () => ({ values: async () => void log.push('insert') }),
    };
    const db = {
      update: () => { throw new Error('the debit must run on the transaction, not the pool'); },
      insert: () => { throw new Error('the ledger row must be written on the transaction'); },
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        log.push('begin');
        try { const r = await fn(tx); log.push('commit'); return r; } catch (e) { log.push('rollback'); throw e; }
      }),
    };
    return { db, tx, log };
  }

  it('guard true: guard, debit and ledger row on the same transaction, then commit', async () => {
    const { db, tx, log } = txDb();
    setDbProvider(() => db);
    try {
      const guard = vi.fn(async (t: unknown) => { expect(t).toBe(tx); log.push('guard'); return true; });
      expect(await deductCredits(USER, 10, 'scan', { importId: IMPORT_ID }, { guard })).toEqual({ balanceCents: 90 });
      expect(log).toEqual(['begin', 'guard', 'update', 'insert', 'commit']);
    } finally { setDbProvider(() => null); }
  });

  it('guard false: rollback, ChargeGuardRefused, no debit and no ledger row', async () => {
    const { db, log } = txDb();
    setDbProvider(() => db);
    try {
      await expect(deductCredits(USER, 10, 'scan', { importId: IMPORT_ID }, { guard: async () => false })).rejects.toBeInstanceOf(ChargeGuardRefused);
      expect(log).toEqual(['begin', 'rollback']);
    } finally { setDbProvider(() => null); }
  });

  it('a guarded charge on a client with no transaction() fails closed (not charged)', async () => {
    const { db } = txDb();
    const noTx = { update: db.update, insert: db.insert };
    setDbProvider(() => noTx);
    try {
      await expect(deductCredits(USER, 10, 'scan', {}, { guard: async () => true })).rejects.toBeInstanceOf(ChargeGuardRefused);
    } finally { setDbProvider(() => null); }
  });
});
