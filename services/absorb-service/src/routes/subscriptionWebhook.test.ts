/**
 * Studio Pro webhook branches, with a fake Stripe client and fake credit
 * functions: what gets recorded, what tier results, and when credits are
 * granted. The credit functions' own database behaviour (upsert, tier write,
 * one grant per invoice) is proven against real PostgreSQL separately.
 */
import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  CREDITED_BILLING_REASONS,
  handleSubscriptionEvent,
  isStudioProPrice,
  periodEndOf,
  subscriptionRecordFrom,
  type SubscriptionCredits,
  type SubscriptionStripe,
} from './subscriptionWebhook.js';

const USER = '11111111-2222-4333-8444-555555555555';
const PERIOD_END = 1_793_000_000; // seconds

/** The one item /subscribe creates: $15.00 a month, quantity one. */
function studioProItem(price: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    current_period_end: PERIOD_END,
    quantity: 1,
    price: { unit_amount: 1500, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, ...price },
    ...over,
  };
}

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    livemode: true,
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { userId: USER, plan: 'studio_pro' },
    items: { object: 'list', data: [studioProItem()] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

type RecordedSubscription = Awaited<ReturnType<Parameters<SubscriptionCredits['recordSubscription']>[1]>>;

function setup(sub: Stripe.Subscription = subscription()) {
  const stripe: SubscriptionStripe = { subscriptions: { retrieve: vi.fn(async () => sub) } };
  // What each recordSubscription call wrote: the fake runs the read it is
  // handed, as the real one does once it holds the user's row lock.
  const records: RecordedSubscription[] = [];
  const credits = {
    SUBSCRIPTION_PRICING: { studioPro: { includedCredits: 2000, priceCentsMonthly: 1500 } },
    findSubscriptionUser: vi.fn(async () => null as string | null),
    recordSubscription: vi.fn(
      async (
        _u: string,
        read: () => Promise<RecordedSubscription>
      ): Promise<{ tier: string; recorded: boolean; reason?: string; duplicate?: boolean } | null> => {
        const s = await read();
        records.push(s);
        return { tier: ['active', 'trialing', 'past_due'].includes(s.status) ? 'pro' : 'free', recorded: true };
      }
    ),
    grantSubscriptionCredits: vi.fn(
      async (): Promise<{ balanceCents: number; applied: boolean } | null> => ({ balanceCents: 2100, applied: true })
    ),
  } satisfies SubscriptionCredits;
  return { stripe, credits, records };
}

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', type, data: { object } }) as unknown as Stripe.Event;

const paidInvoice = (billing_reason: string, id = 'in_1') =>
  event('invoice.paid', {
    id,
    billing_reason,
    amount_paid: 1500,
    total: 1500,
    customer: 'cus_1',
    parent: { subscription_details: { subscription: 'sub_1', metadata: { userId: USER, plan: 'studio_pro' } } },
  });

describe('Studio Pro webhook', () => {
  it('leaves one-time purchases to the existing handler', async () => {
    const { stripe, credits } = setup();
    const reply = await handleSubscriptionEvent(
      event('checkout.session.completed', { id: 'cs_1', mode: 'payment', payment_status: 'paid' }),
      stripe,
      credits
    );
    expect(reply).toBeNull();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('a subscription checkout records the subscription and makes the user Pro, granting nothing yet', async () => {
    const { stripe, credits, records } = setup();
    const reply = await handleSubscriptionEvent(
      event('checkout.session.completed', {
        id: 'cs_sub',
        mode: 'subscription',
        subscription: 'sub_1',
        client_reference_id: USER,
        metadata: { userId: USER, plan: 'studio_pro' },
      }),
      stripe,
      credits
    );
    expect(reply?.status).toBe(200);
    expect(reply?.body.tier).toBe('pro');
    expect(credits.recordSubscription).toHaveBeenCalledWith(USER, expect.any(Function));
    expect(records).toEqual([{
      plan: 'studio_pro',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      status: 'active',
      livemode: true,
      currentPeriodEnd: new Date(PERIOD_END * 1000),
      cancelAtPeriodEnd: false,
    }]);
    // The first invoice.paid grants the first month; the checkout must not also.
    expect(credits.grantSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('the first invoice and each renewal grant the monthly credits, keyed by the invoice id', async () => {
    for (const reason of ['subscription_create', 'subscription_cycle']) {
      const { stripe, credits } = setup();
      const reply = await handleSubscriptionEvent(paidInvoice(reason, `in_${reason}`), stripe, credits);
      expect(reply?.status).toBe(200);
      expect(reply?.body.credited).toBe(true);
      expect(credits.grantSubscriptionCredits).toHaveBeenCalledWith(USER, `in_${reason}`, 2000, {
        subscriptionId: 'sub_1',
        billingReason: reason,
        amountPaidCents: 1500,
      });
    }
    expect(CREDITED_BILLING_REASONS).toEqual(['subscription_create', 'subscription_cycle']);
  });

  it('a mid-cycle change (proration invoice) grants nothing', async () => {
    const { stripe, credits } = setup();
    const reply = await handleSubscriptionEvent(paidInvoice('subscription_update'), stripe, credits);
    expect(reply?.status).toBe(200);
    expect(reply?.body.credited).toBe(false);
    expect(credits.grantSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('state comes from Stripe, not the event: a late "active" after cancellation does not restore Pro', async () => {
    // The event payload says active; Stripe, asked now, says canceled.
    const { stripe, credits, records } = setup(subscription({ status: 'canceled' }));
    const reply = await handleSubscriptionEvent(
      event('customer.subscription.updated', { id: 'sub_1', status: 'active' }),
      stripe,
      credits
    );
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(records[0].status).toBe('canceled');
    expect(reply?.body.tier).toBe('free');
  });

  it('the read that is recorded is taken under the lock: Stripe moving between the two reads records the later state', async () => {
    // P1 from review on real PostgreSQL, 2026-09-28: the only read happened
    // before the lock, so a delivery could write a state Stripe had moved past.
    const { credits, records } = setup();
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce(subscription({ status: 'unpaid' }))
      .mockResolvedValueOnce(subscription({ status: 'active' }));
    const reply = await handleSubscriptionEvent(
      event('customer.subscription.updated', { id: 'sub_1' }),
      { subscriptions: { retrieve } },
      credits
    );
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(records.map((r) => r.status)).toEqual(['active']);
    expect(reply?.body.tier).toBe('pro');
  });

  it('cancellation at the end of the paid month keeps Pro until then, and deletion ends it', async () => {
    const pending = setup(subscription({ cancel_at_period_end: true }));
    const r1 = await handleSubscriptionEvent(
      event('customer.subscription.updated', { id: 'sub_1' }),
      pending.stripe,
      pending.credits
    );
    expect(pending.records[0].cancelAtPeriodEnd).toBe(true);
    expect(r1?.body.tier).toBe('pro');

    const ended = setup(subscription({ status: 'canceled' }));
    const r2 = await handleSubscriptionEvent(
      event('customer.subscription.deleted', { id: 'sub_1' }),
      ended.stripe,
      ended.credits
    );
    expect(r2?.body.tier).toBe('free');
  });

  it('ignores subscriptions that are not Studio Pro', async () => {
    const { stripe, credits } = setup(subscription({ metadata: { plan: 'something_else' } }));
    const reply = await handleSubscriptionEvent(paidInvoice('subscription_cycle'), stripe, credits);
    expect(reply?.body.ignored).toMatch(/not a Studio Pro/);
    expect(credits.recordSubscription).not.toHaveBeenCalled();
    expect(credits.grantSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('finds the owner by subscription or customer id when metadata does not say', async () => {
    const { stripe, credits } = setup(subscription({ metadata: { plan: 'studio_pro' } }));
    credits.findSubscriptionUser.mockResolvedValueOnce(USER);
    await handleSubscriptionEvent(event('customer.subscription.updated', { id: 'sub_1' }), stripe, credits);
    expect(credits.findSubscriptionUser).toHaveBeenCalledWith({
      stripeSubscriptionId: 'sub_1',
      stripeCustomerId: 'cus_1',
    });
    expect(credits.recordSubscription.mock.calls[0][0]).toBe(USER);
  });

  it('refuses, with 200, a subscription no user can be found for', async () => {
    const { stripe, credits } = setup(subscription({ metadata: { plan: 'studio_pro' } }));
    const reply = await handleSubscriptionEvent(
      event('customer.subscription.updated', { id: 'sub_1' }),
      stripe,
      credits
    );
    expect(reply).toEqual({ status: 200, body: { received: true, recorded: false, reason: 'unknown user' } });
    expect(credits.recordSubscription).not.toHaveBeenCalled();
  });

  it('answers 500 so Stripe redelivers when the subscription or the grant could not be written', async () => {
    const noRecord = setup();
    noRecord.credits.recordSubscription.mockResolvedValueOnce(null);
    expect((await handleSubscriptionEvent(paidInvoice('subscription_cycle'), noRecord.stripe, noRecord.credits))?.status).toBe(500);
    expect(noRecord.credits.grantSubscriptionCredits).not.toHaveBeenCalled();

    const noGrant = setup();
    noGrant.credits.grantSubscriptionCredits.mockResolvedValueOnce(null);
    expect((await handleSubscriptionEvent(paidInvoice('subscription_cycle'), noGrant.stripe, noGrant.credits))?.status).toBe(500);
  });

  it('an invoice that belongs to no subscription is not ours', async () => {
    const { stripe, credits } = setup();
    const reply = await handleSubscriptionEvent(
      event('invoice.paid', { id: 'in_x', billing_reason: 'manual', parent: null }),
      stripe,
      credits
    );
    expect(reply?.body.ignored).toMatch(/not a subscription invoice/);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('reads the paid period end from the first item, where the 2026-02-25.clover API keeps it', () => {
    expect(periodEndOf(subscription())).toEqual(new Date(PERIOD_END * 1000));
    expect(periodEndOf(subscription({ items: { object: 'list', data: [] } }))).toBeNull();
  });

  it('credits only a subscription at exactly the Studio Pro price', async () => {
    // Review: a subscription switched to another price, or billed for more than
    // one seat, kept earning the full monthly credits.
    const off = [
      studioProItem({ unit_amount: 500 }),
      studioProItem({ currency: 'eur' }),
      studioProItem({ recurring: { interval: 'year', interval_count: 1 } }),
      studioProItem({ recurring: { interval: 'month', interval_count: 3 } }),
      studioProItem({}, { quantity: 2 }),
    ];
    for (const item of off) {
      const { stripe, credits } = setup(subscription({ items: { object: 'list', data: [item] } }));
      const reply = await handleSubscriptionEvent(paidInvoice('subscription_cycle'), stripe, credits);
      expect(reply?.status).toBe(200);
      expect(reply?.body).toMatchObject({ credited: false, reason: 'not the Studio Pro price' });
      expect(credits.grantSubscriptionCredits).not.toHaveBeenCalled();
      // The subscription itself is still recorded: only the credits are held.
      expect(credits.recordSubscription).toHaveBeenCalledTimes(1);
    }
    const twoItems = subscription({ items: { object: 'list', data: [studioProItem(), studioProItem()] } });
    expect(isStudioProPrice(twoItems, 1500)).toBe(false);
    expect(isStudioProPrice(subscription(), 1500)).toBe(true);
  });

  it('an invoice discounted below the Studio Pro price earns no credits by itself', async () => {
    const { stripe, credits } = setup();
    const discounted = event('invoice.paid', {
      id: 'in_zero',
      billing_reason: 'subscription_cycle',
      amount_paid: 0,
      total: 0,
      parent: { subscription_details: { subscription: 'sub_1', metadata: { userId: USER, plan: 'studio_pro' } } },
    });
    const reply = await handleSubscriptionEvent(discounted, stripe, credits);
    expect(reply?.body).toMatchObject({ credited: false, reason: 'not the Studio Pro price' });
    expect(credits.grantSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('a redelivered invoice that was already credited says so instead of claiming a second grant', async () => {
    const { stripe, credits } = setup();
    credits.grantSubscriptionCredits.mockResolvedValueOnce({ balanceCents: 2100, applied: false });
    const reply = await handleSubscriptionEvent(paidInvoice('subscription_cycle'), stripe, credits);
    expect(reply?.status).toBe(200);
    expect(reply?.body).toMatchObject({ credited: false, reason: 'already credited' });
  });

  it('a read the credit service refuses as older is answered 200, and changes nothing', async () => {
    const { stripe, credits } = setup(subscription({ status: 'canceled' }));
    credits.recordSubscription.mockResolvedValueOnce({
      tier: 'pro',
      recorded: false,
      reason: 'live subscription sub_new is not replaced by sub_1 (canceled)',
    });
    const reply = await handleSubscriptionEvent(event('customer.subscription.deleted', { id: 'sub_1' }), stripe, credits);
    expect(reply).toEqual({
      status: 200,
      body: { received: true, recorded: false, tier: 'pro', reason: 'older than the stored record' },
    });
  });

  it('a second live subscription is reported as a duplicate, and its paid invoice is still credited', async () => {
    const { stripe, credits } = setup(subscription({ id: 'sub_2' }));
    credits.recordSubscription.mockResolvedValueOnce({
      tier: 'pro',
      recorded: false,
      duplicate: true,
      reason: 'user already has live subscription sub_1; sub_2 is a second one',
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reply = await handleSubscriptionEvent(paidInvoice('subscription_create', 'in_dup'), stripe, credits);
    expect(reply?.body).toMatchObject({ recorded: false, reason: 'duplicate subscription', credited: true });
    expect(errors.mock.calls.flat().join(' ')).toMatch(/DUPLICATE .*charged twice/);
    errors.mockRestore();
  });

  it('records which Stripe mode the subscription lives in, and an ending set by date', () => {
    const record = subscriptionRecordFrom(subscription({ livemode: false, cancel_at: PERIOD_END }), 'cus_1');
    expect(record.livemode).toBe(false);
    expect(record.cancelAtPeriodEnd).toBe(true);
    expect(subscriptionRecordFrom(subscription(), 'cus_1')).toMatchObject({ livemode: true, cancelAtPeriodEnd: false });
  });
});
