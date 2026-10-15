/**
 * addCredits({ withinTransaction }): the caller's write runs inside the same
 * transaction as the balance update and ledger row, and a throw from it rolls
 * the grant back. The admin credit grant relies on this for its audit row and
 * its unique idempotency key. The fake transaction snapshots state and restores
 * it on throw, which is the only database behaviour these tests depend on.
 */
import { describe, expect, it } from 'vitest';
import { addCredits, setDbProvider } from '../creditService';

const USER = '11111111-2222-4333-8444-555555555555';

function makeDb() {
  const state = { balanceCents: 100, ledger: [] as any[] };
  const db: any = {
    select: () => {
      const c: any = { from: () => c, where: () => c, limit: async () => [{ userId: USER, balanceCents: state.balanceCents, tier: 'free' }] };
      return c;
    },
    update: () => {
      let amount = 0;
      const c: any = {
        set: (v: any) => { amount = (v.balanceCents?.queryChunks ?? []).find((x: unknown) => typeof x === 'number') ?? 0; return c; },
        where: () => c,
        returning: async () => { state.balanceCents += amount; return [{ balanceCents: state.balanceCents }]; },
      };
      return c;
    },
    insert: () => ({ values: async (row: any) => { state.ledger.push(row); } }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = { balanceCents: state.balanceCents, ledger: [...state.ledger] };
      try {
        return await fn(db);
      } catch (e) {
        state.balanceCents = snap.balanceCents;
        state.ledger = snap.ledger;
        throw e;
      }
    },
    state,
  };
  return db;
}

describe('addCredits withinTransaction', () => {
  it('runs the hook inside the transaction with the new balance', async () => {
    const db = makeDb();
    setDbProvider(() => db);
    let seen: number | null = null;
    let sawTx = false;
    const r = await addCredits(USER, 2500, 'grant', {
      type: 'admin_grant',
      withinTransaction: async (tx, applied) => { sawTx = tx === db; seen = applied.balanceCents; },
    });
    expect(sawTx).toBe(true);
    expect(seen).toBe(r?.balanceCents);
    expect(db.state.ledger).toHaveLength(1);
  });

  it('rolls the grant back when the hook throws', async () => {
    const db = makeDb();
    setDbProvider(() => db);
    const before = db.state.balanceCents;
    await expect(
      addCredits(USER, 2500, 'grant', {
        withinTransaction: async () => { throw Object.assign(new Error('dup'), { code: '23505' }); },
      })
    ).rejects.toThrow('dup');
    expect(db.state.balanceCents).toBe(before);
    expect(db.state.ledger).toHaveLength(0);
  });
});
