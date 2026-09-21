/**
 * A Stripe checkout session may credit an account ONCE.
 *
 * Stripe re-sends a webhook whenever it is not certain we received it, and the
 * handler returns 500 on any internal error, which asks for exactly that. Until
 * 2026-09-21 nothing stopped the second delivery: the call site carried the
 * comment "Idempotent allocation inside the database transaction logic",
 * addCredits recorded `stripeSessionId` without ever reading it back, and the
 * ledger table had no constraint on that column either. Read from the source,
 * not inferred: a retry added the credits again, every time.
 *
 * These tests pin the three properties that were missing. The fake below models
 * only what addCredits does — it is not a database — and it says so where it
 * cheats: `where()` is matched by collecting the string literals out of the
 * drizzle predicate, which is exactly enough to model `eq(col, sessionId)` and
 * nothing more.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { addCredits, setDbProvider } from '../creditService';
import { creditAccounts, creditTransactions } from '../../schema';

const USER = '11111111-2222-4333-8444-555555555555';

interface LedgerRow {
  userId: string;
  amountCents: number;
  balanceAfterCents: number;
  stripeSessionId: string | null;
}

/** Every string literal reachable in a drizzle predicate, to match eq(col, value). */
function collectStrings(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, out, depth + 1);
    return out;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) {
      collectStrings(v, out, depth + 1);
    }
  }
  return out;
}

function makeFakeDb(opts: { withTransaction: boolean }) {
  const state = {
    balanceCents: 0,
    pendingAmount: 0,
    accountRows: [{ userId: USER, balanceCents: 0, lifetimeSpentCents: 0, lifetimePurchasedCents: 0, tier: 'free', freeCreditsUsedCents: 0 }],
    ledger: [] as LedgerRow[],
    transactionCalls: 0,
  };

  const db: Record<string, unknown> = {
    select(_cols?: unknown) {
      let table: unknown = null;
      let predicateStrings: string[] = [];
      const chain = {
        from(t: unknown) {
          table = t;
          return chain;
        },
        where(pred: unknown) {
          predicateStrings = collectStrings(pred);
          return chain;
        },
        limit(_n: number) {
          if (table === creditTransactions) {
            return Promise.resolve(
              state.ledger.filter(
                (r) => r.stripeSessionId != null && predicateStrings.includes(r.stripeSessionId)
              )
            );
          }
          return Promise.resolve(state.accountRows);
        },
      };
      return chain;
    },
    update(_t: unknown) {
      const chain = {
        set(_vals: unknown) {
          return chain;
        },
        where(_pred: unknown) {
          return chain;
        },
        // The real column is incremented by SQL the fake cannot evaluate, so the
        // test states the amount in flight and the fake applies it here. Nothing
        // is applied unless addCredits actually reaches the update.
        returning(_cols: unknown) {
          return Promise.resolve([{ balanceCents: state.balanceCents + state.pendingAmount }]);
        },
      };
      return chain;
    },
    insert(_t: unknown) {
      return {
        values(row: LedgerRow) {
          state.ledger.push(row);
          state.balanceCents = row.balanceAfterCents;
          return Promise.resolve();
        },
      };
    },
    _state: state,
  };

  if (opts.withTransaction) {
    db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
      state.transactionCalls++;
      return fn(db);
    };
  }
  return db;
}

/** State the amount in flight, then credit. The fake applies it only if reached. */
function creditOnce(db: ReturnType<typeof makeFakeDb>, amount: number, sessionId?: string) {
  db._state.pendingAmount = amount;
  return addCredits(USER, amount, 'Stripe purchase', { stripeSessionId: sessionId });
}

describe('addCredits — one Stripe session credits once', () => {
  let db: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    db = makeFakeDb({ withTransaction: true });
    setDbProvider(() => db);
  });

  it('a redelivered webhook does not add the credits a second time', async () => {
    const SESSION = 'cs_test_redelivered_1';

    const first = await creditOnce(db, 500, SESSION);
    expect(first).not.toBeNull();

    const ledgerAfterFirst = db._state.ledger.length;
    const balanceAfterFirst = db._state.balanceCents;

    // Stripe redelivers the identical event.
    const second = await creditOnce(db, 500, SESSION);

    expect(db._state.ledger.length).toBe(ledgerAfterFirst);
    expect(db._state.balanceCents).toBe(balanceAfterFirst);
    expect(second?.balanceCents).toBe(balanceAfterFirst);
  });

  it('a DIFFERENT session still credits, so the guard is not simply refusing everything', async () => {
    await creditOnce(db, 500, 'cs_test_a');
    const afterFirst = db._state.ledger.length;

    await creditOnce(db, 700, 'cs_test_b');

    expect(db._state.ledger.length).toBe(afterFirst + 1);
    expect(db._state.ledger.map((r) => r.stripeSessionId)).toEqual(['cs_test_a', 'cs_test_b']);
  });

  it('a grant with no session id is never deduplicated against another', async () => {
    db._state.pendingAmount = 100;
    await addCredits(USER, 100, 'promo grant', {});
    await addCredits(USER, 100, 'promo grant', {});

    expect(db._state.ledger.length).toBe(2);
    expect(db._state.ledger.every((r) => r.stripeSessionId === null)).toBe(true);
  });

  it('the balance update and the ledger row go through one transaction', async () => {
    await creditOnce(db, 500, 'cs_test_tx');
    expect(db._state.transactionCalls).toBe(1);
  });

  it('still works against a client with no transaction support, on the same code path', async () => {
    const plain = makeFakeDb({ withTransaction: false });
    setDbProvider(() => plain);

    const SESSION = 'cs_test_no_tx';
    await creditOnce(plain, 500, SESSION);
    const ledgerAfterFirst = plain._state.ledger.length;
    await creditOnce(plain, 500, SESSION);

    expect(plain._state.ledger.length).toBe(ledgerAfterFirst);
  });
});
