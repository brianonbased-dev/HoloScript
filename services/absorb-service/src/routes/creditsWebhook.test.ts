/**
 * The Stripe webhook is the only path that turns a real payment into credits,
 * and nothing tested it.
 *
 * `/success` deliberately no longer grants, so this handler is where money
 * becomes balance. Independent review (claude2, distinct seat, 2026-09-22)
 * checked my claim "each fix proven by feeding the fault back in" against this
 * file and found it FALSE for four of five: no test imported creditsWebhook.ts
 * at all, so the 200-on-failed-grant bug could be put back and the suite stayed
 * 33/33 green. That claim was mine. These are the tests that make its corrected
 * version true.
 *
 * WHY THE REAL CREDIT MODULE, NOT A DOUBLE OF IT.
 *
 * The obvious shape — replacing `@holoscript/absorb-service/credits` wholesale —
 * is refused by the repository's skill-redirect rule, and correctly: a
 * module-level stand-in for one of our own services is exactly what that rule
 * exists to catch, and I am not going to relax a rule that happens to sit
 * between my own work and landing. So the REAL credit module runs here, with a
 * database supplied through `setDbProvider`, the injection seam the production
 * code already exposes. That tests strictly more: the idempotence read, the
 * transaction requirement and the ledger write are all real code paths in these
 * assertions rather than assumptions about them.
 *
 * WHAT IS STILL WEAK, SAID PLAINLY. The injected database is an in-memory
 * stand-in, so it cannot enforce the UNIQUE index that is the real race
 * backstop. Review already made the matching point about the existing suite:
 * deleting `uniqueIndex` from the schema leaves those tests green, because a
 * fake never throws and never rolls back. These tests therefore cover the
 * handler's decisions and the ledger's contents, NOT the race. The race is
 * covered by the index, whose presence at boot is what
 * `db/ensureCreditLedgerIndex.ts` exists to guarantee and log. A real-Postgres
 * integration test is filed separately rather than implied here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

/**
 * The credit module is reached AFTER vi.resetModules(), inside each test.
 *
 * The handler obtains it with a dynamic `await import(...)`, so a top-level
 * import here plus `resetModules()` in beforeEach gave the test one module
 * instance and the handler another: `setDbProvider` landed on a copy the
 * handler never saw, and every grant reported "Database unavailable". Resolving
 * it after the reset means both sides share the cached instance -- which is
 * also what makes the injection seam usable at all.
 */
async function useDb(db: unknown): Promise<void> {
  const credits = await import('@holoscript/absorb-service/credits');
  // EXACTLY as server.ts:271-273 does it. That line reads
  // `(creditsModule as any).default || creditsModule` because the package can
  // arrive wrapped in a CJS/ESM interop `default`, and reaching for the
  // namespace directly then sets the provider on an object the handler never
  // consults -- which is what made these tests report "Database unavailable"
  // against a database that was right there. Mirroring the production wiring is
  // also the only way this test proves the production wiring works.
  const mod = (credits as unknown as { default?: typeof credits }).default || credits;
  mod.setDbProvider(() => db);
}

interface StripeSession {
  id: string;
  payment_status: string;
  amount_total?: number | null;
  metadata: Record<string, string> | null;
}

interface LedgerRow {
  userId: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  stripeSessionId: string | null;
  metadata: Record<string, unknown>;
}

const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn((_body: unknown, _sig: string, _secret: string) => ({
    type: 'checkout.session.completed',
    data: { object: {} as StripeSession },
  })),
}));

// Stripe is a third-party payment API. A unit test cannot make it deliver a
// webhook, and making it try would mean real charges.
vi.mock('stripe', () => ({
  default: class FakeStripe {
    webhooks = { constructEvent: stripeMocks.constructEvent };
    constructor(_key: string) {}
  },
}));

vi.mock('./credits.js', async () => {
  const actual = await vi.importActual<typeof import('./credits.js')>('./credits.js');
  return { ...actual, configuredStripeKey: () => 'sk_test_fake' };
});

const USER = '11111111-2222-4333-8444-555555555555';

/**
 * The smallest database the REAL creditService will accept: a drizzle-shaped
 * builder over two arrays. `transaction` is honoured because addCredits refuses
 * outright without it — that refusal is production behaviour, and a stand-in
 * that quietly lacked the method would make these tests pass for the wrong
 * reason.
 */
function makeDb(opts: { accountExists?: boolean } = {}) {
  const ledger: LedgerRow[] = [];
  let balance = 2500;
  let accountRows = opts.accountExists === false ? [] : [{
    userId: USER,
    balanceCents: balance,
    lifetimeSpentCents: 0,
    lifetimePurchasedCents: 0,
    tier: 'free',
    freeCreditsUsedCents: 0,
  }];

  // WHICH TABLE a call is about is decided by the SHAPE of the call, not by
  // stringifying the table object. `String(drizzleTable)` is "[object Object]",
  // so an `includes('transaction')` test is false for everything -- and the
  // idempotence lookup, which selects from credit_transactions, was answered
  // with the ACCOUNT row instead. A truthy row reads as "this session was
  // already applied", so every grant returned early having written nothing, and
  // the log said so: "Session cs_test_A was already applied; not crediting
  // again." The tests failed for a reason entirely inside this stand-in.
  //
  // The real discriminator is already there: the idempotence query passes an
  // explicit column map, `select({ balanceAfterCents })`, while the account
  // lookup calls `select()` with nothing.
  const db = {
    select: (cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_w: unknown) => ({
          limit: (_n: number) =>
            Promise.resolve(
              cols === undefined
                ? accountRows
                : ledger
                    .filter((r) => r.stripeSessionId !== null)
                    .map((r) => ({ balanceAfterCents: r.balanceAfterCents }))
            ),
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      // The ledger insert passes a row carrying stripeSessionId; the account
      // insert chains .onConflictDoNothing(). Distinguished by the chain the
      // caller builds, again rather than by the table object.
      values: (v: LedgerRow) => {
        if (v && Object.prototype.hasOwnProperty.call(v, 'balanceAfterCents')) {
          ledger.push(v);
          return Promise.resolve([v]);
        }
        accountRows = [{ ...(accountRows[0] ?? {}), ...v } as (typeof accountRows)[number]];
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve(accountRows) }),
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (_s: unknown) => ({
        where: (_w: unknown) => ({
          returning: (_c?: unknown) => {
            balance += 2500;
            return Promise.resolve([{ balanceCents: balance }]);
          },
        }),
      }),
    }),
    transaction: async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => fn(db),
    __ledger: ledger,
  };
  return db;
}

type Handler = (req: Request, res: Response) => Promise<void>;

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> };
}

interface MockRes {
  _status: number;
  _json: Record<string, unknown> | null;
  status(code: number): MockRes;
  json(data: Record<string, unknown>): MockRes;
  send(data: string): MockRes;
}

async function handler(): Promise<Handler> {
  const { creditsWebhookRouter } = await import('./creditsWebhook.js');
  const stack = (creditsWebhookRouter as unknown as { stack: RouteLayer[] }).stack;
  const route = stack.find((l) => l.route?.path === '/stripe' && l.route.methods.post)?.route;
  if (!route) throw new Error('no post /stripe route');
  return route.stack[route.stack.length - 1].handle;
}

const req = () =>
  ({ body: Buffer.from('{}'), headers: { 'stripe-signature': 'sig_test' } }) as unknown as Request;

function res(): MockRes {
  const r: MockRes = {
    _status: 200,
    _json: null,
    status(c) {
      r._status = c;
      return r;
    },
    json(d) {
      r._json = d;
      return r;
    },
    send() {
      return r;
    },
  };
  return r;
}

function paidSession(over: Partial<StripeSession> = {}): void {
  stripeMocks.constructEvent.mockReturnValue({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_A',
        payment_status: 'paid',
        amount_total: 2000,
        metadata: {
          userId: USER,
          amountCents: '2500',
          pricePaidCents: '2000',
          packageId: 'builder',
        },
        ...over,
      } as StripeSession,
    },
  });
}

describe('Stripe webhook — money becomes credits exactly once, or loudly not at all', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stripeMocks.constructEvent.mockClear();
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('answers 500 when the grant FAILS, so Stripe redelivers', async () => {
    // addCredits returns null WITHOUT throwing when it has no database.
    // Answering 200 there meant money captured, zero credits, a log line
    // claiming success, and Stripe told the event was handled so it never
    // retried. This is the real refusal path, not a stubbed return value.
    paidSession();
    await useDb(null);

    const r = res();
    await (await handler())(req(), r as unknown as Response);

    expect(r._status).toBe(500);
    expect(r._json).toMatchObject({ credited: false });
  });

  it('answers 200 and credits NOBODY when a paid session carries no userId', async () => {
    // 'anonymous' is the id every UNAUTHENTICATED caller carries, so the old
    // fallback filed a paying customer's balance under it. 200 is deliberate: a
    // retry cannot supply an id Stripe never sent, so asking for one loops.
    paidSession({ metadata: { amountCents: '2500' } });
    const db = makeDb();
    await useDb(db);

    const r = res();
    await (await handler())(req(), r as unknown as Response);

    expect(r._status).toBe(200);
    expect(r._json).toMatchObject({ credited: false, reason: 'missing userId' });
    expect(db.__ledger).toHaveLength(0);
  });

  it('records the MONEY and the PACKAGE in the ledger, not only the credits', async () => {
    // metadata.amountCents is the CREDITS to grant, so the row alone reports
    // 2500 for a 2000-cent sale. Without the money beside it nothing in our own
    // database can reconcile a refund.
    paidSession();
    const db = makeDb();
    await useDb(db);

    const r = res();
    await (await handler())(req(), r as unknown as Response);

    expect(r._status).toBe(200);
    const row = db.__ledger.at(-1);
    expect(row?.stripeSessionId).toBe('cs_test_A');
    expect(row?.amountCents).toBe(2500);
    expect(row?.metadata).toMatchObject({ pricePaidCents: 2000, packageId: 'builder' });
  });

  it('writes the session id, which is what makes a redelivery survivable', async () => {
    // Idempotence is keyed on stripeSessionId inside addCredits. If the handler
    // stopped passing it, the guard could not fire and a redelivery would credit
    // again — with nothing here to notice.
    paidSession();
    const db = makeDb();
    await useDb(db);

    await (await handler())(req(), res() as unknown as Response);

    expect(db.__ledger.at(-1)?.stripeSessionId).toBe('cs_test_A');
  });
});
