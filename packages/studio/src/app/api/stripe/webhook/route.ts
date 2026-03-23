import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../db/client';
import { purchases, payouts, marketplaceListings, creatorProfiles } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { constructWebhookEvent, calculateRevenueSplit, isStripeConfigured } from '../../../../lib/stripe';
import { addCredits } from '../../../../lib/absorb/creditService';
import { CREDIT_PACKAGES } from '../../../../lib/absorb/pricing';
import type Stripe from 'stripe';

/**
 * POST /api/stripe/webhook — Stripe webhook handler.
 *
 * Processes payment events:
 *   - checkout.session.completed → Mark purchase as completed, record revenue splits
 *   - checkout.session.expired   → Mark purchase as expired
 *
 * Must receive raw body (not JSON-parsed) for signature verification.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const listingId = session.metadata?.listingId ?? '';

      // Credit purchase flow (listingId starts with "credit-")
      if (listingId.startsWith('credit-')) {
        await handleCreditPurchase(session);
      } else {
        await handleCheckoutCompleted(db, session);
      }
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutExpired(db, session);
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(
  db: NonNullable<ReturnType<typeof getDb>>,
  session: Stripe.Checkout.Session
) {
  const sessionId = session.id;
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

  // Update purchase status
  const [purchase] = await db
    .update(purchases)
    .set({
      status: 'completed',
      stripePaymentIntentId: paymentIntentId ?? null,
    })
    .where(eq(purchases.stripeSessionId, sessionId))
    .returning();

  if (!purchase) {
    console.error(`[stripe/webhook] No purchase found for session ${sessionId}`);
    return;
  }

  // Fetch the listing to identify the creator
  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, purchase.listingId))
    .limit(1);

  if (!listing) return;

  // Calculate 80/10/10 revenue split
  const { creatorCents, platformCents, aiAgentCents } = calculateRevenueSplit(purchase.amountCents);

  // Get creator's Stripe Connect account
  const [creatorProfile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, listing.sellerId))
    .limit(1);

  // Record payout entries
  await db.insert(payouts).values([
    {
      purchaseId: purchase.id,
      recipientId: listing.sellerId,
      role: 'creator',
      amountCents: creatorCents,
      stripeConnectAccountId: creatorProfile?.stripeConnectAccountId ?? null,
      status: creatorProfile?.stripeConnectAccountId ? 'transferred' : 'pending',
    },
    {
      purchaseId: purchase.id,
      recipientId: listing.sellerId, // platform uses seller as placeholder
      role: 'platform',
      amountCents: platformCents,
      status: 'completed', // platform keeps its share
    },
    {
      purchaseId: purchase.id,
      recipientId: listing.sellerId,
      role: 'agent',
      amountCents: aiAgentCents,
      status: 'held', // AI agent share held in escrow
    },
  ]);

  // Update creator earnings total
  if (creatorProfile) {
    await db
      .update(creatorProfiles)
      .set({
        totalEarningsCents: creatorProfile.totalEarningsCents + creatorCents,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.userId, listing.sellerId));
  }

  console.log(
    `[stripe/webhook] Purchase ${purchase.id} completed: $${(purchase.amountCents / 100).toFixed(2)} → creator $${(creatorCents / 100).toFixed(2)} / platform $${(platformCents / 100).toFixed(2)} / agent $${(aiAgentCents / 100).toFixed(2)}`
  );
}

async function handleCreditPurchase(session: Stripe.Checkout.Session) {
  const buyerId = session.metadata?.buyerId;
  const listingId = session.metadata?.listingId ?? '';
  const packageId = listingId.replace('credit-', '');

  if (!buyerId) {
    console.error('[stripe/webhook] Credit purchase missing buyerId');
    return;
  }

  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    console.error(`[stripe/webhook] Unknown credit package: ${packageId}`);
    return;
  }

  const result = await addCredits(
    buyerId,
    pkg.credits,
    `Purchased ${pkg.label} package (${pkg.credits} credits)`,
    {
      type: 'purchase',
      stripeSessionId: session.id,
      metadata: { packageId, priceCents: pkg.priceCents },
    },
  );

  console.log(
    `[stripe/webhook] Credit purchase: ${pkg.label} (${pkg.credits} credits) for user ${buyerId}. New balance: ${result?.balanceCents ?? 'unknown'}`,
  );
}

async function handleCheckoutExpired(
  db: NonNullable<ReturnType<typeof getDb>>,
  session: Stripe.Checkout.Session
) {
  await db
    .update(purchases)
    .set({ status: 'expired' })
    .where(eq(purchases.stripeSessionId, session.id));
}
