/**
 * Studio Pro in the credit service: which statuses are Pro, that a subscription
 * and its tier are written together or not at all, and that one paid invoice
 * grants its credits once. A recording fake stands in for drizzle here; the same
 * functions are also run against real PostgreSQL before this ships.
 */
import { describe, expect, it } from 'vitest';
import {
  decideSubscriptionWrite,
  ensureSubscriptionCustomer,
  grantSubscriptionCredits,
  isEndedSubscriptionStatus,
  nextTier,
  recordSubscription,
  setDbProvider,
  stripeKeyLivemode,
  subscriptionInMode,
  tierForSubscriptionStatus,
  tierInMode,
  type CreditSubscription,
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
    for (const v of Object.values(node as Record<string, unknown>))
      collectStrings(v, out, depth + 1);
  }
  return out;
}

interface Write {
  op: 'insert' | 'update';
  table: unknown;
  values: Record<string, unknown>;
  conflictTarget?: unknown;
}

function makeDb(opts: {
  withTransaction: boolean;
  tier?: string;
  stored?: Record<string, unknown> | null;
  /** Make the ledger insert fail this way, after a concurrent winner's row lands. */
  ledgerInsertError?: unknown;
  winnerRow?: {
    stripeSessionId: string;
    amountCents: number;
    type: string;
    balanceAfterCents: number;
  };
}) {
  const state = {
    writes: [] as Write[],
    ledger: [] as Array<{
      stripeSessionId: string | null;
      amountCents: number;
      type: string;
      balanceAfterCents: number;
    }>,
    balance: 100,
    transactions: 0,
    locks: 0,
    /** bound, lock, read and write, in the order they happened. */
    order: [] as string[],
    /** The SQL each tx.execute ran (the SET LOCAL ceilings). */
    sql: [] as string[],
  };
  const account = {
    userId: USER,
    balanceCents: 100,
    lifetimeSpentCents: 0,
    lifetimePurchasedCents: 0,
    tier: opts.tier ?? 'free',
    freeCreditsUsedCents: 0,
  };
  const db: Record<string, unknown> = {
    execute(query: unknown) {
      state.sql.push(collectStrings(query).join(' '));
      state.order.push('bound');
      return Promise.resolve();
    },
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
            return Promise.resolve(
              state.ledger.filter((r) => r.stripeSessionId && strings.includes(r.stripeSessionId))
            );
          }
          if (table === creditAccounts) return Promise.resolve([account]);
          if (table === creditSubscriptions && opts.stored) return Promise.resolve([opts.stored]);
          return Promise.resolve([]);
        },
        for(strength: string) {
          if (strength === 'update') {
            state.locks += 1;
            state.order.push('lock');
          }
          return chain.limit(1);
        },
      };
      return chain;
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          if (table === creditTransactions) {
            if (opts.ledgerInsertError) {
              if (opts.winnerRow) state.ledger.push(opts.winnerRow);
              return Promise.reject(opts.ledgerInsertError);
            }
            state.ledger.push(values as (typeof state.ledger)[number]);
            return Promise.resolve();
          }
          return {
            onConflictDoUpdate(cfg: { target: unknown }) {
              state.order.push('write');
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
  livemode: true,
  currentPeriodEnd: new Date('2026-10-28T00:00:00Z'),
  cancelAtPeriodEnd: false,
};

/** A Stripe read that returns this record, as the webhook's re-read would. */
const read = (sub: Omit<CreditSubscription, 'userId'>) => async () => sub;

/** A stored row as the table holds it (camelCase, as drizzle returns it). */
function storedRow(over: Partial<CreditSubscription> = {}): Record<string, unknown> {
  return { userId: USER, ...SUB, ...over };
}

function stored(over: Partial<CreditSubscription> = {}): CreditSubscription {
  return { userId: USER, ...SUB, ...over };
}

describe('Studio Pro in the credit service', () => {
  it('Pro while Stripe treats the subscription as live, free for everything else', () => {
    for (const s of ['active', 'trialing', 'past_due'])
      expect(tierForSubscriptionStatus(s)).toBe('pro');
    for (const s of [
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused',
      'none',
      '',
      'weird',
      null,
      undefined,
    ]) {
      expect(tierForSubscriptionStatus(s)).toBe('free');
    }
    expect(['canceled', 'incomplete_expired'].every(isEndedSubscriptionStatus)).toBe(true);
    expect(
      ['active', 'past_due', 'unpaid', 'incomplete', 'paused'].some(isEndedSubscriptionStatus)
    ).toBe(false);
  });

  it('records the subscription (upsert by user) and the tier in one transaction, under a row lock', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, read(SUB))).toEqual({ tier: 'pro', recorded: true });
    const [row, tier] = db._state.writes;
    expect(row.table).toBe(creditSubscriptions);
    expect(row.values).toMatchObject({ userId: USER, ...SUB });
    expect(row.conflictTarget).toBe(creditSubscriptions.userId);
    expect(tier.table).toBe(creditAccounts);
    expect(tier.values.tier).toBe('pro');
    expect(db._state.transactions).toBe(1);
    expect(db._state.locks).toBe(1);
  });

  it('reads Stripe only after the row is locked, so the delivery that writes last read last', async () => {
    // P1 from review on real PostgreSQL, 2026-09-28: the read happened before
    // the lock, so two deliveries could read in one order and write in the
    // other, and an older "unpaid" read written last turned a paying member free.
    const db = makeDb({ withTransaction: true, tier: 'pro', stored: storedRow() });
    setDbProvider(() => db);
    const result = await recordSubscription(USER, async () => {
      db._state.order.push('read');
      return { ...SUB, status: 'unpaid' };
    });
    expect(db._state.order).toEqual(['bound', 'lock', 'read', 'write']);
    // A read taken under the lock is written whichever way it moves: active to
    // unpaid is what a renewal whose retries all failed really does.
    expect(result).toEqual({ tier: 'free', recorded: true });
  });

  // P1 from review round 2 (claude3, 2026-09-28): the Stripe call runs holding the row lock,
  // and nothing bounded it. The Stripe client waits 80s per attempt by default.
  it('caps the wait for the row lock before taking it, so a second delivery cannot queue without end', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    await recordSubscription(USER, read(SUB));
    expect(db._state.order.slice(0, 2)).toEqual(['bound', 'lock']);
    expect(db._state.sql).toEqual([expect.stringMatching(/SET LOCAL lock_timeout = '15000ms'/)]);
  });

  it('a Stripe read that never answers is abandoned at the deadline, and nothing is written', async () => {
    const db = makeDb({ withTransaction: true, tier: 'pro', stored: storedRow() });
    setDbProvider(() => db);
    const hangs = () => new Promise<Omit<CreditSubscription, 'userId'>>(() => {});
    const started = Date.now();
    await expect(recordSubscription(USER, hangs, { deadlineMs: 50 })).rejects.toThrow(
      /Stripe subscription read did not answer within 50ms/
    );
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(db._state.writes).toEqual([]);
  });

  it('a Stripe customer create that never answers is abandoned at the deadline, and nothing is written', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    const hangs = () => new Promise<string>(() => {});
    await expect(
      ensureSubscriptionCustomer(USER, { plan: 'studio_pro', livemode: true }, hangs, {
        deadlineMs: 50,
      })
    ).rejects.toThrow(/Stripe customer create did not answer within 50ms/);
    expect(db._state.writes).toEqual([]);
    expect(db._state.order.slice(0, 2)).toEqual(['bound', 'lock']);
  });

  it('a Stripe read that fails writes nothing, so the delivery fails and is sent again', async () => {
    const db = makeDb({ withTransaction: true, tier: 'pro', stored: storedRow() });
    setDbProvider(() => db);
    await expect(
      recordSubscription(USER, async () => {
        throw new Error('Stripe unreachable');
      })
    ).rejects.toThrow('Stripe unreachable');
    expect(db._state.writes).toHaveLength(0);
  });

  it('a canceled subscription moves a Pro account back to free', async () => {
    const db = makeDb({ withTransaction: true, tier: 'pro', stored: storedRow() });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, read({ ...SUB, status: 'canceled' }))).toEqual({
      tier: 'free',
      recorded: true,
    });
    expect(db._state.writes[1].values.tier).toBe('free');
  });

  it('refuses without a transaction rather than writing the row and the tier apart', async () => {
    const db = makeDb({ withTransaction: false });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, read(SUB))).toBeNull();
    expect(db._state.writes).toHaveLength(0);
  });

  it('a read that would move the row backwards writes nothing, and says why', async () => {
    // D1, found on real PostgreSQL by review: a late delivery about the user's
    // older, ended subscription replaced the live one and turned them free.
    const db = makeDb({
      withTransaction: true,
      tier: 'pro',
      stored: storedRow({ stripeSubscriptionId: 'sub_new' }),
    });
    setDbProvider(() => db);
    const result = await recordSubscription(
      USER,
      read({ ...SUB, stripeSubscriptionId: 'sub_old', status: 'canceled' })
    );
    expect(result).toMatchObject({ tier: 'pro', recorded: false });
    expect(result?.reason).toMatch(/sub_new is not replaced by sub_old/);
    expect(db._state.writes).toHaveLength(0);
  });

  it('never changes a tier Studio Pro does not own', async () => {
    const db = makeDb({ withTransaction: true, tier: 'enterprise' });
    setDbProvider(() => db);
    expect(await recordSubscription(USER, read({ ...SUB, status: 'canceled' }))).toEqual({
      tier: 'enterprise',
      recorded: true,
    });
    expect(db._state.writes.filter((w) => w.table === creditAccounts)).toHaveLength(0);
    expect(nextTier('enterprise', 'pro')).toBe('enterprise');
    expect(nextTier('free', 'pro')).toBe('pro');
    expect(nextTier('pro', 'free')).toBe('free');
  });

  it('one paid invoice grants its credits once, keyed by the invoice id, and says which call applied it', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    expect(
      (await grantSubscriptionCredits(USER, 'in_1', 2000, { subscriptionId: 'sub_1' }))?.applied
    ).toBe(true);
    expect(
      (await grantSubscriptionCredits(USER, 'in_1', 2000, { subscriptionId: 'sub_1' }))?.applied
    ).toBe(false);
    expect(db._state.ledger).toHaveLength(1);
    expect(db._state.ledger[0]).toMatchObject({
      stripeSessionId: 'in_1',
      amountCents: 2000,
      type: 'subscription',
    });
    await grantSubscriptionCredits(USER, 'in_2', 2000);
    expect(db._state.ledger.map((r) => r.stripeSessionId)).toEqual(['in_1', 'in_2']);
  });

  // P2 from review on real PostgreSQL, 2026-09-28: 10 concurrent grants of one
  // invoice left 9 settled and 1 thrown by the unique index. Both deliveries
  // read "no prior row"; the loser's insert then violates the index.
  const SESSION_CONFLICT = { code: '23505', constraint: 'idx_credit_tx_stripe_session' };
  it.each([
    ['as drizzle wraps it', Object.assign(new Error('Failed query'), { cause: SESSION_CONFLICT })],
    ['as the driver raises it', Object.assign(new Error('duplicate key value'), SESSION_CONFLICT)],
  ])(
    'a grant that loses a race to a concurrent delivery of the same invoice says applied:false (%s)',
    async (_shape, conflict) => {
      const db = makeDb({
        withTransaction: true,
        ledgerInsertError: conflict,
        winnerRow: {
          stripeSessionId: 'in_race',
          amountCents: 2000,
          type: 'subscription',
          balanceAfterCents: 2100,
        },
      });
      setDbProvider(() => db);
      expect(await grantSubscriptionCredits(USER, 'in_race', 2000)).toEqual({
        balanceCents: 2100,
        applied: false,
      });
      expect(db._state.ledger).toHaveLength(1);
    }
  );

  // Only that one race is answered "already applied". The invoice's row exists
  // in both cases below, so a catch that answered every error the same way
  // would report a grant that never happened as done.
  it.each([
    [
      'a different kind of error',
      { code: '23503', constraint: 'credit_transactions_user_id_fkey' },
    ],
    ['a unique violation on another index', { code: '23505', constraint: 'credit_accounts_pkey' }],
  ])('%s from a grant still throws', async (_kind, cause) => {
    const db = makeDb({
      withTransaction: true,
      ledgerInsertError: Object.assign(new Error('Failed query'), { cause }),
      winnerRow: {
        stripeSessionId: 'in_other',
        amountCents: 2000,
        type: 'subscription',
        balanceAfterCents: 2100,
      },
    });
    setDbProvider(() => db);
    await expect(grantSubscriptionCredits(USER, 'in_other', 2000)).rejects.toThrow('Failed query');
  });
});

describe('which read may replace the row (decideSubscriptionWrite)', () => {
  const incoming = (over: Partial<CreditSubscription> = {}) => ({ ...SUB, ...over });

  it('the same subscription moves both ways between live and unpaid, because its read was taken under the lock', () => {
    expect(decideSubscriptionWrite(stored(), incoming({ status: 'unpaid' }))).toEqual({
      write: true,
    });
    expect(decideSubscriptionWrite(stored({ status: 'unpaid' }), incoming())).toEqual({
      write: true,
    });
  });

  it('writes when there is nothing to protect', () => {
    expect(decideSubscriptionWrite(null, incoming())).toEqual({ write: true });
    // A row holding only the customer, from before the first checkout.
    expect(
      decideSubscriptionWrite(stored({ stripeSubscriptionId: null, status: 'none' }), incoming())
    ).toEqual({ write: true });
    // A practice row, once the service is live.
    expect(
      decideSubscriptionWrite(
        stored({ livemode: false }),
        incoming({ stripeSubscriptionId: 'sub_live', status: 'canceled' })
      )
    ).toEqual({ write: true });
  });

  it('the same subscription never comes back to life (D3: an older read written last)', () => {
    const ended = stored({ status: 'canceled' });
    const decision = decideSubscriptionWrite(ended, incoming({ status: 'active' }));
    expect(decision.write).toBe(false);
    expect(
      decideSubscriptionWrite(
        stored({ status: 'incomplete_expired' }),
        incoming({ status: 'active' })
      ).write
    ).toBe(false);
    // Forward moves and same-state refreshes are written.
    expect(decideSubscriptionWrite(stored(), incoming({ status: 'canceled' }))).toEqual({
      write: true,
    });
    expect(decideSubscriptionWrite(stored(), incoming({ cancelAtPeriodEnd: true }))).toEqual({
      write: true,
    });
    expect(
      decideSubscriptionWrite(stored({ status: 'incomplete' }), incoming({ status: 'active' }))
    ).toEqual({ write: true });
    expect(decideSubscriptionWrite(ended, incoming({ status: 'canceled' }))).toEqual({
      write: true,
    });
  });

  it('a live subscription is never replaced by another that is ended or unpaid (D1)', () => {
    for (const status of ['canceled', 'incomplete_expired', 'unpaid', 'incomplete', 'paused']) {
      const decision = decideSubscriptionWrite(
        stored(),
        incoming({ stripeSubscriptionId: 'sub_other', status })
      );
      expect(decision.write, status).toBe(false);
    }
  });

  it('a second live subscription is kept out of the row and reported as a duplicate', () => {
    const decision = decideSubscriptionWrite(
      stored(),
      incoming({ stripeSubscriptionId: 'sub_second' })
    );
    expect(decision).toMatchObject({ write: false, duplicate: true });
  });

  it('an ended subscription is replaced by a new one, live or not', () => {
    const ended = stored({ status: 'canceled' });
    expect(decideSubscriptionWrite(ended, incoming({ stripeSubscriptionId: 'sub_2' }))).toEqual({
      write: true,
    });
    expect(
      decideSubscriptionWrite(
        ended,
        incoming({ stripeSubscriptionId: 'sub_2', status: 'incomplete' })
      )
    ).toEqual({ write: true });
  });
});

describe('practice and real payments stay apart (Stripe mode)', () => {
  it('reads the mode from the key', () => {
    expect(stripeKeyLivemode('sk_live_abc')).toBe(true);
    expect(stripeKeyLivemode('rk_live_abc')).toBe(true);
    expect(stripeKeyLivemode(' sk_test_abc ')).toBe(false);
    expect(stripeKeyLivemode('rk_test_abc')).toBe(false);
    for (const k of [null, undefined, '', '   ', 'pk_live_abc', 'whsec_abc'])
      expect(stripeKeyLivemode(k)).toBeNull();
  });

  it('a practice row does not exist for a live service, and a live row does for a live service', () => {
    const practice = stored({ livemode: false });
    expect(subscriptionInMode(practice, true)).toBeNull();
    expect(subscriptionInMode(practice, false)).toBe(practice);
    expect(subscriptionInMode(stored(), true)?.stripeSubscriptionId).toBe('sub_1');
    // Unknown on either side matches: no key configured, or an old row.
    expect(subscriptionInMode(practice, null)).toBe(practice);
    expect(subscriptionInMode(stored({ livemode: null }), true)).not.toBeNull();
    expect(subscriptionInMode(null, true)).toBeNull();
  });

  it('Pro that only a practice subscription earned is free for a live service', () => {
    expect(tierInMode('pro', stored({ livemode: false }), true)).toBe('free');
    expect(tierInMode('pro', stored({ livemode: true }), true)).toBe('pro');
    expect(tierInMode('pro', null, true)).toBe('pro');
    expect(tierInMode('free', stored({ livemode: false }), true)).toBe('free');
    expect(tierInMode('enterprise', stored({ livemode: false }), true)).toBe('enterprise');
  });
});

describe('one Stripe customer per user, saved before the first checkout', () => {
  it('creates the customer once, saves it with no subscription yet, under a row lock', async () => {
    const db = makeDb({ withTransaction: true });
    setDbProvider(() => db);
    let created = 0;
    const id = await ensureSubscriptionCustomer(
      USER,
      { plan: 'studio_pro', livemode: true },
      async () => {
        created += 1;
        return 'cus_new';
      }
    );
    expect(id).toBe('cus_new');
    expect(created).toBe(1);
    expect(db._state.locks).toBe(1);
    const [row] = db._state.writes;
    expect(row.table).toBe(creditSubscriptions);
    expect(row.values).toMatchObject({
      userId: USER,
      stripeCustomerId: 'cus_new',
      stripeSubscriptionId: null,
      status: 'none',
      livemode: true,
    });
  });

  it('reuses the customer already saved in this mode, and creates nothing', async () => {
    const db = makeDb({ withTransaction: true, stored: storedRow({ status: 'canceled' }) });
    setDbProvider(() => db);
    const id = await ensureSubscriptionCustomer(
      USER,
      { plan: 'studio_pro', livemode: true },
      async () => {
        throw new Error('must not create');
      }
    );
    expect(id).toBe('cus_1');
    expect(db._state.writes).toHaveLength(0);
  });

  it('replaces a practice customer when the service is live, and ends the Pro that practice earned', async () => {
    const db = makeDb({
      withTransaction: true,
      tier: 'pro',
      stored: storedRow({ livemode: false, stripeCustomerId: 'cus_test' }),
    });
    setDbProvider(() => db);
    const id = await ensureSubscriptionCustomer(
      USER,
      { plan: 'studio_pro', livemode: true },
      async () => 'cus_live'
    );
    expect(id).toBe('cus_live');
    expect(db._state.writes[0].values).toMatchObject({
      stripeCustomerId: 'cus_live',
      stripeSubscriptionId: null,
      livemode: true,
    });
    // Found on real PostgreSQL: without this, the stored pro tier and the new
    // same-mode row read as Pro to a live service that was never paid.
    const tierWrites = db._state.writes.filter((w) => w.table === creditAccounts);
    expect(tierWrites.map((w) => w.values.tier)).toEqual(['free']);
  });

  it('refuses without a transaction', async () => {
    const db = makeDb({ withTransaction: false });
    setDbProvider(() => db);
    expect(
      await ensureSubscriptionCustomer(
        USER,
        { plan: 'studio_pro', livemode: true },
        async () => 'cus_x'
      )
    ).toBeNull();
  });
});
