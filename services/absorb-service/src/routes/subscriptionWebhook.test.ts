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
  periodEndOf,
  type SubscriptionCredits,
  type SubscriptionStripe,
} from './subscriptionWebhook.js';

const USER = '11111111-2222-4333-8444-555555555555';
const PERIOD_END = 1_793_000_000; // seconds

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: USER, plan: 'studio_pro' },
    items: { object: 'list', data: [{ current_period_end: PERIOD_END }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function setup(sub: Stripe.Subscription = subscription()) {
  const stripe: SubscriptionStripe = { subscriptions: { retrieve: vi.fn(async () => sub) } };
  const credits = {
    SUBSCRIPTION_PRICING: { studioPro: { includedCredits: 500 } },
    findSubscriptionUser: vi.fn(async () => null as string | null),
    recordSubscription: vi.fn(async (_u: string, s: { status: string }) => ({
      tier: ['active', 'trialing', 'past_due'].includes(s.status) ? 'pro' : 'free',
    })),
    grantSubscriptionCredits: vi.fn(async () => ({ balanceCents: 600 })),
  } satisfies SubscriptionCredits;
  return { stripe, credits };
}

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', type, data: { object } }) as unknown as Stripe.Event;

const paidInvoice = (billing_reason: string, id = 'in_1') =>
  event('invoice.paid', {
    id,
    billing_reason,
    amount_paid: 1500,
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
    const { stripe, credits } = setup();
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
    expect(credits.recordSubscription).toHaveBeenCalledWith(USER, {
      plan: 'studio_pro',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      status: 'active',
      currentPeriodEnd: new Date(PERIOD_END * 1000),
      cancelAtPeriodEnd: false,
    });
    // The first invoice.paid grants the first month; the checkout must not also.
    expect(credits.grantSubscriptionCredits).not.toHaveBeenCalled();
  });

  it('the first invoice and each renewal grant 500 credits, keyed by the invoice id', async () => {
    for (const reason of ['subscription_create', 'subscription_cycle']) {
      const { stripe, credits } = setup();
      const reply = await handleSubscriptionEvent(paidInvoice(reason, `in_${reason}`), stripe, credits);
      expect(reply?.status).toBe(200);
      expect(reply?.body.credited).toBe(true);
      expect(credits.grantSubscriptionCredits).toHaveBeenCalledWith(USER, `in_${reason}`, 500, {
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
    const { stripe, credits } = setup(subscription({ status: 'canceled' }));
    const reply = await handleSubscriptionEvent(
      event('customer.subscription.updated', { id: 'sub_1', status: 'active' }),
      stripe,
      credits
    );
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_1');
    expect(credits.recordSubscription.mock.calls[0][1].status).toBe('canceled');
    expect(reply?.body.tier).toBe('free');
  });

  it('cancellation at the end of the paid month keeps Pro until then, and deletion ends it', async () => {
    const pending = setup(subscription({ cancel_at_period_end: true }));
    const r1 = await handleSubscriptionEvent(
      event('customer.subscription.updated', { id: 'sub_1' }),
      pending.stripe,
      pending.credits
    );
    expect(pending.credits.recordSubscription.mock.calls[0][1].cancelAtPeriodEnd).toBe(true);
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
});
