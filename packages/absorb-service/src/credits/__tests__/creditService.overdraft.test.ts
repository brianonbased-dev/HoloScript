/**
 * deductCredits({ allowOverdraft }) (#617 N2). A scan that already ran is
 * settled even if the balance dropped below the price meanwhile: the balance
 * goes negative (owed) instead of the finished work being free. Without the
 * flag the debit is still refused when the balance is short. With no account
 * row it is null either way (fail closed).
 *
 * The fake models only the UPDATE ... WHERE: it reads the predicate's SQL text
 * and applies the `balance_cents >= amount` condition only when that text is
 * present, which is exactly the switch allowOverdraft flips.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { deductCredits, setDbProvider } from '../creditService';

const USER = '11111111-2222-4333-8444-555555555555';

function sqlText(node: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (depth > 10 || node == null || seen.has(node)) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return '';
  seen.add(node);
  if (Array.isArray(node)) return node.map((v) => sqlText(v, depth + 1, seen)).join(' ');
  const o = node as Record<string, unknown>;
  if ('queryChunks' in o) return sqlText(o.queryChunks, depth + 1, seen);
  if ('value' in o) return sqlText(o.value, depth + 1, seen);
  return '';
}

/** A fake whose UPDATE applies amount and honours the >= guard only when present. */
function ledgerDb(start: number | null) {
  const state = {
    balance: start,
    ledger: [] as Array<{ amountCents: number; balanceAfterCents: number }>,
  };
  let pending = 0;
  const db = {
    update() {
      return {
        set() {
          return {
            where(pred: unknown) {
              const guarded = sqlText(pred).includes('>=');
              return {
                async returning() {
                  if (state.balance === null) return [];
                  if (guarded && state.balance < pending) return [];
                  state.balance -= pending;
                  return [{ balanceCents: state.balance }];
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        async values(v: { amountCents: number; balanceAfterCents: number }) {
          state.ledger.push(v);
        },
      };
    },
  };
  return { db, state, price: (c: number) => void (pending = c) };
}

afterEach(() => setDbProvider(() => null));

describe('deductCredits allowOverdraft (#617 N2)', () => {
  it('without the flag a short balance is refused and nothing is written', async () => {
    const f = ledgerDb(5);
    f.price(10);
    setDbProvider(() => f.db as never);
    expect(await deductCredits(USER, 10, 'scan')).toBeNull();
    expect(f.state.balance).toBe(5);
    expect(f.state.ledger).toHaveLength(0);
  });

  it('with the flag a short balance is settled and goes negative (owed)', async () => {
    const f = ledgerDb(5);
    f.price(10);
    setDbProvider(() => f.db as never);
    expect(await deductCredits(USER, 10, 'scan', {}, { allowOverdraft: true })).toEqual({
      balanceCents: -5,
    });
    expect(f.state.ledger).toEqual([
      expect.objectContaining({ amountCents: -10, balanceAfterCents: -5 }),
    ]);
  });

  it('with the flag and enough balance it is an ordinary debit', async () => {
    const f = ledgerDb(25);
    f.price(10);
    setDbProvider(() => f.db as never);
    expect(await deductCredits(USER, 10, 'scan', {}, { allowOverdraft: true })).toEqual({
      balanceCents: 15,
    });
  });

  it('with the flag but no account row it still fails closed (null, nothing written)', async () => {
    const f = ledgerDb(null);
    f.price(10);
    setDbProvider(() => f.db as never);
    expect(await deductCredits(USER, 10, 'scan', {}, { allowOverdraft: true })).toBeNull();
    expect(f.state.ledger).toHaveLength(0);
  });

  it('with no database it is null even with the flag (no free path)', async () => {
    setDbProvider(() => null);
    expect(await deductCredits(USER, 10, 'scan', {}, { allowOverdraft: true })).toBeNull();
  });
});
