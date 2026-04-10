/**
 * Stripe payment client for HoloScript Studio marketplace.
 *
 * Handles checkout sessions, webhook verification, Connect onboarding,
 * and revenue splitting (80% creator / 10% platform / 10% AI agent).
 *
 * Configured via environment variables:
 *   - STRIPE_SECRET_KEY
 *   - STRIPE_WEBHOOK_SECRET
 *   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (client-side)
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  _stripe = new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    typescript: true,
  });

  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Revenue split percentages matching CreatorMonetization.ts */
export const REVENUE_SPLIT = {
  creator: 80,
  platform: 10,
  aiAgent: 10,
} as const;

/**
 * Calculate revenue split from a purchase amount in cents.
 */
export function calculateRevenueSplit(amountCents: number) {
  const creatorCents = Math.floor((amountCents * REVENUE_SPLIT.creator) / 100);
  const platformCents = Math.floor((amountCents * REVENUE_SPLIT.platform) / 100);
  const aiAgentCents = amountCents - creatorCents - platformCents; // remainder avoids rounding loss
  return { creatorCents, platformCents, aiAgentCents };
}

/**
 * Create a Stripe Checkout Session for purchasing a marketplace listing.
 */
export async function createCheckoutSession(opts: {
  listingId: string;
  listingTitle: string;
  priceCents: number;
  currency: string;
  buyerId: string;
  creatorConnectAccountId?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const { creatorCents } = calculateRevenueSplit(opts.priceCents);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: opts.currency.toLowerCase(),
          product_data: {
            name: opts.listingTitle,
            metadata: { listingId: opts.listingId },
          },
          unit_amount: opts.priceCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      listingId: opts.listingId,
      buyerId: opts.buyerId,
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  };

  // If creator has a Stripe Connect account, set up automatic transfer
  if (opts.creatorConnectAccountId) {
    sessionParams.payment_intent_data = {
      transfer_data: {
        destination: opts.creatorConnectAccountId,
        amount: creatorCents,
      },
    };
  }

  return stripe.checkout.sessions.create(sessionParams);
}

/**
 * Verify a Stripe webhook signature and parse the event.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Create a Stripe Connect account for a creator and generate an onboarding link.
 */
export async function createConnectAccount(opts: {
  userId: string;
  email: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<{ accountId: string; onboardingUrl: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const account = await stripe.accounts.create({
    type: 'express',
    email: opts.email,
    metadata: { userId: opts.userId },
    capabilities: {
      transfers: { requested: true },
    },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    return_url: opts.returnUrl,
    refresh_url: opts.refreshUrl,
    type: 'account_onboarding',
  });

  return { accountId: account.id, onboardingUrl: accountLink.url };
}

/**
 * Check if a Connect account has completed onboarding.
 */
export async function isConnectAccountReady(accountId: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;

  const account = await stripe.accounts.retrieve(accountId);
  return account.charges_enabled && account.payouts_enabled;
}
