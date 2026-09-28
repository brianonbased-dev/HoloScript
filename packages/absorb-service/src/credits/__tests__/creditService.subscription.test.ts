/**
 * Studio Pro in the credit service: which statuses are Pro, that a subscription
 * and its tier are written together or not at all, and that one paid invoice
 * grants its credits once. A recording fake stands in for drizzle here; the same
 * functions are also run against real PostgreSQL before this ships.
 */
import { describe, expect, it } from 'vitest';
import {
  grantSubscriptionCredits,
  recordSubscription,
  setDbProvider,
  tierForSubscriptionStatus,
} from '../creditService';
import { creditAccounts, creditSubscriptions, creditTransactions } from '../../schema';

const USER = '11111111-2222-4333-8444-555555555555';

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
    for (const v of Object.values(node as Record<string, unknown>)) collectStrings(v, out, depth + 1);
  }
  return out;
}

interface Write {
  op: 'insert' | 'update';
  table: unknown;
  values: Record<string, unknown>;
  conflictTarget?: unknown;
}

function makeDb(opts: { withTransaction: boolean }) {
  const state = {
    writes: [] as Write[],
    ledger: [] as Array<{ stripeSessionId: string | null; amountCents: number; type: string; balanceAfterCents: number }>,
    balance: 100,
    transactions: 0,
  };
  const account = { userId: USER, balanceCents: 100, lifetimeSpentCents: 0, lifetimePurchasedCents: 0, tier: 'free', freeCreditsUsedCents: 0 };
  const db: Record<string, unknown> = {
    select(_cols?: unknown) {
      let table: unknown = null;
      let strings: string[] = [];
      const chain = {
        from(t: unknown) {
          table = t;
          return chain;
        },
        where(pred: unknown) {
          strings = collectStrings(pred);
          return chain;
        },
        limit(_n: number) {
          if (table === creditTransactions) {
            return Promise.resolve(state.ledger.filter((r) => r.stripeSessionId && strings.includes(r.stripeSessionId)));
          }
          if (table === creditAccounts) return Promise.resolve([account]);
          return Promise.resolve([]);
        },
      };
      return chain;
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          if (table === creditTransactions) {
            state.ledger.push(values as (typeof state.ledger)[number]);
            return Promise.resolve();
          }
          return {
            onConflictDoUpdate(cfg: { target: unknown }) {
              state.writes.push({ op: 'insert', table, values, conflictTarget: cfg.target });
              return Promise.resolve();
            },
            onConflictDoNothing() {
              return { returning: () => Promise.resolve([account]) };
            },
          };
        },
      };
    },
    update(table: unknown) {
      let values: Record<string, unknown> = {};
      const chain = {
        set(v: Record<string, unknown>) {
          values = v;
          return chain;
        },
        where(_p: unknown) {
          if (table === creditAccounts && !('balanceCents' in values)) {
            state.writes.push({ op: 'update', table, values });
            return Promise.resolve();
          }
          return chain;
        },
        returning(_c?: unknown) {
          state.balance += 500;
          return Promise.resolve([{ balanceCents: state.balance }]);
        },
      };
      return chain;
    },
    _state: state,
  };
  if (opts.withTransaction) {
    db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      return fn(db);
    };
  }
  return db as Record<string, unknown> & { _state: typeof state };
}

const SUB = {
  plan: 'studio_pro',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  status: 'active',
  currentPeriodEnd: new Date('2026-10-28T00:00:00Z'),
  cancelAtPeriodEnd: false,
};

describe('Studio Pro in the credit service', () => {
  it('Pro while Stripe treats the subscription as live, free for everything else', () => {
    for (const s of ['active', 'trialing', 'past_due']) expect(tierForSubscriptionStatus(s)).toBe('pro');
    for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', '', 'weird', null, undefined]) {
      expect(tierForSubscriptionStatus(s)).toBe('free');
    }
  });

  it('records the subscription (upsert by user) and the tier in one transaction', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, SUB)).toEqual({ tier: 'pro' });
    const [row, tier] = db._state.writes;
    expect(row.table).toBe(creditSubscriptions);
    expect(row.values).toMatchObject({ userId: USER, ...SUB });
    expect(row.conflictTarget).toBe(creditSubscriptions.userId);
    expect(tier.table).toBe(creditAccounts);
    expect(tier.values.tier).toBe('pro');
    expect(db._state.transactions).toBe(1);
  });

  it('a canceled subscription writes the free tier', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, { ...SUB, status: 'canceled' })).toEqual({ tier: 'free' });
    expect(db._state.writes[1].values.tier).toBe('free');
  });

  it('refuses without a transaction rather than writing the row and the tier apart', async () => {
    const db = makeDb({ withTransaction: false });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, SUB)).toBeNull();
    expect(db._state.writes).toHaveLength(0);
  });

  it('one paid invoice grants its credits once, keyed by the invoice id', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    await grantSubscriptionCredits(USER, 'in_1', 500, { subscriptionId: 'sub_1' });
    await grantSubscriptionCredits(USER, 'in_1', 500, { subscriptionId: 'sub_1' });
    expect(db._state.ledger).toHaveLength(1);
    expect(db._state.ledger[0]).toMatchObject({ stripeSessionId: 'in_1', amountCents: 500, type: 'subscription' });
    await grantSubscriptionCredits(USER, 'in_2', 500);
    expect(db._state.ledger.map((r) => r.stripeSessionId)).toEqual(['in_1', 'in_2']);
  });
});
