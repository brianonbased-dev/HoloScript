/**
 * GET  /api/absorb/credits — Get user's credit balance and account info.
 * POST /api/absorb/credits — Purchase credits via Stripe checkout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getOrCreateAccount } from '@/lib/absorb/creditService';
import { CREDIT_PACKAGES, TIER_LIMITS, OPERATION_COSTS, type CreditPackageId } from '@/lib/absorb/pricing';
import { createCheckoutSession, isStripeConfigured } from '@/lib/stripe';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const account = await getOrCreateAccount(auth.user.id);
  if (!account) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const tierLimits = TIER_LIMITS[account.tier];

  return NextResponse.json({
    balance: account.balanceCents,
    balanceDollars: (account.balanceCents / 100).toFixed(2),
    tier: account.tier,
    tierLimits,
    lifetimeSpent: account.lifetimeSpentCents,
    lifetimePurchased: account.lifetimePurchasedCents,
    packages: CREDIT_PACKAGES,
    operations: OPERATION_COSTS,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  let body: { packageId: CreditPackageId };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pkg = CREDIT_PACKAGES.find((p) => p.id === body.packageId);
  if (!pkg) {
    return NextResponse.json(
      { error: 'Invalid package', available: CREDIT_PACKAGES.map((p) => p.id) },
      { status: 400 },
    );
  }

  const origin = req.headers.get('origin') || 'https://holoscript.net';

  const session = await createCheckoutSession({
    listingId: `credit-${pkg.id}`,
    listingTitle: `${pkg.credits} Absorb Credits`,
    priceCents: pkg.priceCents,
    currency: 'USD',
    buyerId: auth.user.id,
    successUrl: `${origin}/absorb?purchased=${pkg.id}`,
    cancelUrl: `${origin}/absorb?tab=credits`,
  });

  return NextResponse.json({ sessionUrl: session.url });
}
