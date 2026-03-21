import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/api-auth';
import { getDb } from '../../../../db/client';
import { marketplaceListings, purchases, creatorProfiles } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { createCheckoutSession, isStripeConfigured } from '../../../../lib/stripe';

/**
 * POST /api/stripe/checkout — Create a Stripe Checkout Session for a marketplace purchase.
 *
 * Body: { listingId }
 * Returns: { sessionUrl } — redirect the user here to complete payment.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const buyerId = auth.user.id;

  let body: { listingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { listingId } = body;
  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Fetch the listing
  const [listing] = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.id, listingId))
    .limit(1);

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  if (listing.status !== 'published') {
    return NextResponse.json({ error: 'Listing is not available for purchase' }, { status: 400 });
  }

  if (listing.priceCents === 0) {
    return NextResponse.json({ error: 'This item is free — no checkout needed' }, { status: 400 });
  }

  // Don't let sellers buy their own listings
  if (listing.sellerId === buyerId) {
    return NextResponse.json({ error: 'Cannot purchase your own listing' }, { status: 400 });
  }

  // Check if creator has a Stripe Connect account for automatic payouts
  let creatorConnectAccountId: string | undefined;
  const [creatorProfile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, listing.sellerId))
    .limit(1);

  if (creatorProfile?.stripeConnectAccountId && creatorProfile.stripeOnboardingComplete) {
    creatorConnectAccountId = creatorProfile.stripeConnectAccountId;
  }

  const origin = req.nextUrl.origin;

  const session = await createCheckoutSession({
    listingId: listing.id,
    listingTitle: listing.title,
    priceCents: listing.priceCents,
    currency: listing.currency,
    buyerId,
    creatorConnectAccountId,
    successUrl: `${origin}/marketplace?purchased=${listing.id}`,
    cancelUrl: `${origin}/marketplace?cancelled=${listing.id}`,
  });

  // Record pending purchase
  await db.insert(purchases).values({
    buyerId,
    listingId: listing.id,
    stripeSessionId: session.id,
    amountCents: listing.priceCents,
    currency: listing.currency,
    status: 'pending',
  });

  return NextResponse.json({ sessionUrl: session.url });
}
