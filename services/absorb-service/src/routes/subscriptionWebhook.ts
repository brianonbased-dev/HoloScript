/**
 * The Studio Pro half of the Stripe webhook: turns subscription events into a
 * recorded subscription, a tier, and the monthly credits.
 *
 * Kept apart from creditsWebhook.ts, which verifies the signature and handles
 * one-time purchases, and given its Stripe client and credit functions as
 * arguments, so every branch here can be tested without a database or Stripe.
 *
 * Three rules decide the shape:
 *
 * 1. STATE IS READ FROM STRIPE, NOT FROM THE EVENT. Stripe does not promise
 *    delivery order, so every event that touches a subscription re-reads it
 *    (`subscriptions.retrieve`) and records what Stripe says now.
 *
 * 2. THE ROW ONLY MOVES FORWARD. Re-reading is not enough on its own: two
 *    deliveries can be handled at once (an older "active" read written after
 *    the "canceled" one), and a user can hold more than one subscription (a
 *    late event about an ended one used to replace the live one). The credit
 *    service locks the user's row and decideSubscriptionWrite refuses any read
 *    that would move it backwards. A refusal is answered 200: redelivering the
 *    same stale read cannot make it newer.
 *
 * 3. CREDITS COME FROM PAID STUDIO PRO INVOICES ONLY, ONCE EACH. `invoice.paid`
 *    with billing_reason subscription_create (the first month) or
 *    subscription_cycle (each renewal) grants includedCredits, keyed by the
 *    invoice id in the ledger's unique stripe_session_id, so a redelivered
 *    invoice.paid is a no-op. The subscription must carry exactly the Studio Pro
 *    price and the invoice must total at least that price: a subscription moved
 *    to another price, or an invoice discounted below it, is recorded but not
 *    credited, and says so. Checkout completion grants nothing: the first
 *    invoice.paid does, which keeps a checkout and its first invoice from paying
 *    out twice.
 *
 * Events are expected in the 2026-02-25.clover shape, which the "Turn on
 * payments" icon pins on the webhook endpoint: invoice.parent.subscription_details
 * and items[].current_period_end, not the older top-level fields.
 */
import type Stripe from 'stripe';

/** The one plan /subscribe sells. The webhook recognises its objects by this metadata. */
export const STUDIO_PRO_PLAN = 'studio_pro';

/** What a subscription row holds, as the credit service records it. */
export interface SubscriptionRecord {
  plan: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  livemode: boolean | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** The credit functions this handler uses; the real ones come from @holoscript/absorb-service/credits. */
export interface SubscriptionCredits {
  SUBSCRIPTION_PRICING: { studioPro: { includedCredits: number; priceCentsMonthly: number } };
  findSubscriptionUser(ref: {
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
  }): Promise<string | null>;
  recordSubscription(
    userId: string,
    sub: SubscriptionRecord
  ): Promise<{ tier: string; recorded: boolean; reason?: string; duplicate?: boolean } | null>;
  grantSubscriptionCredits(
    userId: string,
    invoiceId: string,
    credits: number,
    metadata?: Record<string, unknown>
  ): Promise<{ balanceCents: number; applied: boolean } | null>;
}

/** The one Stripe call this handler makes. */
export interface SubscriptionStripe {
  subscriptions: { retrieve(id: string): Promise<Stripe.Subscription> };
}

export interface WebhookReply {
  status: number;
  body: Record<string, unknown>;
}

/** Credits are granted for the first invoice and each renewal; mid-cycle changes grant nothing. */
export const CREDITED_BILLING_REASONS: readonly string[] = ['subscription_create', 'subscription_cycle'];

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id ?? null;
}

/** When the current paid period ends, from the first item (clover moved it there). */
export function periodEndOf(sub: Stripe.Subscription): Date | null {
  const end = sub.items?.data?.[0]?.current_period_end;
  return typeof end === 'number' ? new Date(end * 1000) : null;
}

/**
 * The row a Stripe subscription becomes. A cancellation is recorded as ending
 * whether Stripe marks it with cancel_at_period_end or with a cancel_at date,
 * so Settings never says "renews on" for a subscription that is ending.
 */
export function subscriptionRecordFrom(sub: Stripe.Subscription, customerId: string): SubscriptionRecord {
  return {
    plan: STUDIO_PRO_PLAN,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    livemode: typeof sub.livemode === 'boolean' ? sub.livemode : null,
    currentPeriodEnd: periodEndOf(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}

/**
 * True when the subscription is exactly the plan /subscribe sells: one item,
 * quantity one, at the Studio Pro price in US dollars, billed every month. The
 * monthly credits are the price's; anything else earns none automatically.
 */
export function isStudioProPrice(sub: Stripe.Subscription, priceCentsMonthly: number): boolean {
  const items = sub.items?.data ?? [];
  if (items.length !== 1) return false;
  const item = items[0];
  const price = item.price;
  return (
    (item.quantity ?? 1) === 1 &&
    price?.unit_amount === priceCentsMonthly &&
    price.currency === 'usd' &&
    price.recurring?.interval === 'month' &&
    (price.recurring.interval_count ?? 1) === 1
  );
}

/**
 * Bring our record of one subscription to what Stripe says now, and set the
 * user's tier from it. Returns the user id whenever the owner is known, and the
 * subscription as Stripe read it.
 */
export async function syncSubscription(
  stripe: SubscriptionStripe,
  credits: SubscriptionCredits,
  subscriptionId: string,
  hint: { userId?: string | null } = {}
): Promise<WebhookReply & { userId?: string; sub?: Stripe.Subscription }> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.metadata?.plan !== STUDIO_PRO_PLAN) {
    return { status: 200, body: { received: true, ignored: 'not a Studio Pro subscription' } };
  }
  const customerId = idOf(sub.customer as string | { id: string } | null);
  const userId =
    sub.metadata?.userId ||
    hint.userId ||
    (await credits.findSubscriptionUser({ stripeSubscriptionId: sub.id, stripeCustomerId: customerId }));
  if (!userId || !customerId) {
    // 200 on purpose: a retry cannot supply an owner Stripe never had.
    console.error(
      `[credits/webhook] REFUSED: subscription ${sub.id} (${sub.status}) names no user we know. ` +
        'Tier NOT changed. Attribute it by hand.'
    );
    return { status: 200, body: { received: true, recorded: false, reason: 'unknown user' } };
  }
  const recorded = await credits.recordSubscription(userId, subscriptionRecordFrom(sub, customerId));
  if (!recorded) {
    // The one failure a redelivery can fix, so ask for it.
    console.error(
      `[credits/webhook] SUBSCRIPTION NOT RECORDED for user ${userId}, ${sub.id} (${sub.status}). ` +
        'Answering 500 so Stripe redelivers.'
    );
    return { status: 500, body: { received: true, recorded: false, reason: 'record failed' } };
  }
  if (!recorded.recorded) {
    if (recorded.duplicate) {
      console.error(
        `[credits/webhook] DUPLICATE Studio Pro subscription for user ${userId}: ${recorded.reason}. ` +
          'They are being charged twice. Cancel the second one in Stripe and refund it by hand.'
      );
    } else {
      console.warn(`[credits/webhook] Studio Pro ${sub.id} for user ${userId} kept as it was: ${recorded.reason}`);
    }
    return {
      status: 200,
      body: {
        received: true,
        recorded: false,
        tier: recorded.tier,
        reason: recorded.duplicate ? 'duplicate subscription' : 'older than the stored record',
      },
      userId,
      sub,
    };
  }
  console.log(
    `[credits/webhook] Studio Pro ${sub.id} for user ${userId}: ${sub.status}, tier now ${recorded.tier}`
  );
  return { status: 200, body: { received: true, recorded: true, tier: recorded.tier }, userId, sub };
}

/**
 * The reply for a Studio Pro event, or null for an event that is not one (a
 * one-time purchase, or a type this handler does not own), which the caller
 * then handles as before.
 */
export async function handleSubscriptionEvent(
  event: Stripe.Event,
  stripe: SubscriptionStripe,
  credits: SubscriptionCredits
): Promise<WebhookReply | null> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') return null;
      const subscriptionId = idOf(session.subscription as string | { id: string } | null);
      if (!subscriptionId) {
        return { status: 200, body: { received: true, recorded: false, reason: 'no subscription on session' } };
      }
      const synced = await syncSubscription(stripe, credits, subscriptionId, {
        userId: session.metadata?.userId || session.client_reference_id,
      });
      return { status: synced.status, body: synced.body };
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const details = invoice.parent?.subscription_details;
      const subscriptionId = idOf(details?.subscription as string | { id: string } | null | undefined);
      if (!subscriptionId) {
        return { status: 200, body: { received: true, ignored: 'not a subscription invoice' } };
      }
      const synced = await syncSubscription(stripe, credits, subscriptionId, {
        userId: details?.metadata?.userId,
      });
      // A paid invoice is owed its credits whether or not this read moved the
      // row (a duplicate subscription's invoice was paid too), so only a known
      // owner and a Studio Pro subscription are required here.
      if (synced.status !== 200 || !synced.userId || !synced.sub) {
        return { status: synced.status, body: synced.body };
      }

      const reason = invoice.billing_reason ?? 'unknown';
      if (!CREDITED_BILLING_REASONS.includes(reason) || !invoice.id) {
        return { status: 200, body: { ...synced.body, credited: false, reason: `billing_reason ${reason}` } };
      }
      const pro = credits.SUBSCRIPTION_PRICING.studioPro;
      if (!isStudioProPrice(synced.sub, pro.priceCentsMonthly) || invoice.total < pro.priceCentsMonthly) {
        console.error(
          `[credits/webhook] NOT CREDITED: invoice ${invoice.id} for user ${synced.userId} is not a full ` +
            `Studio Pro month (total ${invoice.total}, plan ${pro.priceCentsMonthly} cents a month, ` +
            `subscription ${subscriptionId}). Grant by hand if it was meant to earn credits.`
        );
        return { status: 200, body: { ...synced.body, credited: false, reason: 'not the Studio Pro price' } };
      }
      const monthly = pro.includedCredits;
      const granted = await credits.grantSubscriptionCredits(synced.userId, invoice.id, monthly, {
        subscriptionId,
        billingReason: reason,
        amountPaidCents: invoice.amount_paid,
      });
      if (!granted) {
        console.error(
          `[credits/webhook] GRANT FAILED for user ${synced.userId}, invoice ${invoice.id}: ` +
            `${monthly} Studio Pro credits were NOT applied. Answering 500 so Stripe redelivers.`
        );
        return { status: 500, body: { received: true, credited: false, reason: 'grant failed' } };
      }
      if (!granted.applied) {
        console.log(
          `[credits/webhook] Studio Pro invoice ${invoice.id} was already credited; not crediting again.`
        );
        return { status: 200, body: { ...synced.body, credited: false, reason: 'already credited' } };
      }
      console.log(
        `[credits/webhook] Studio Pro: ${monthly} credits for user ${synced.userId} via invoice ` +
          `${invoice.id}; balance now ${granted.balanceCents}`
      );
      return { status: 200, body: { ...synced.body, credited: true, credits: monthly } };
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const synced = await syncSubscription(stripe, credits, sub.id);
      return { status: synced.status, body: synced.body };
    }
    default:
      return null;
  }
}
