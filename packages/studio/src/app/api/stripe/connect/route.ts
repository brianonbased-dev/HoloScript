import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/api-auth';
import { getDb } from '../../../../db/client';
import { creatorProfiles } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import {
  createConnectAccount,
  isConnectAccountReady,
  isStripeConfigured,
} from '../../../../lib/stripe';

/**
 * Stripe Connect — Creator onboarding for marketplace payouts.
 *
 * POST /api/stripe/connect         → Start onboarding (create Connect account + redirect URL)
 * GET  /api/stripe/connect         → Check onboarding status
 */

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;
  const email = auth.user.email ?? '';

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Check if creator already has a Connect account
  const [existing] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);

  if (existing?.stripeConnectAccountId && existing.stripeOnboardingComplete) {
    return NextResponse.json({
      status: 'complete',
      accountId: existing.stripeConnectAccountId,
      message: 'Stripe Connect already set up',
    });
  }

  const origin = req.nextUrl.origin;

  const { accountId, onboardingUrl } = await createConnectAccount({
    userId,
    email,
    returnUrl: `${origin}/settings?stripe=connected`,
    refreshUrl: `${origin}/settings?stripe=refresh`,
  });

  // Upsert creator profile with Connect account ID
  if (existing) {
    await db
      .update(creatorProfiles)
      .set({
        stripeConnectAccountId: accountId,
        stripeOnboardingComplete: false,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.userId, userId));
  } else {
    await db.insert(creatorProfiles).values({
      userId,
      stripeConnectAccountId: accountId,
      stripeOnboardingComplete: false,
      displayName: auth.user.name ?? null,
    });
  }

  return NextResponse.json({ onboardingUrl, accountId });
}

export async function GET(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);

  if (!profile?.stripeConnectAccountId) {
    return NextResponse.json({
      status: 'not_started',
      message: 'No Stripe Connect account. POST to start onboarding.',
    });
  }

  // Check with Stripe if onboarding is complete
  const ready = await isConnectAccountReady(profile.stripeConnectAccountId);

  if (ready && !profile.stripeOnboardingComplete) {
    // Update DB to reflect completed onboarding
    await db
      .update(creatorProfiles)
      .set({ stripeOnboardingComplete: true, updatedAt: new Date() })
      .where(eq(creatorProfiles.userId, userId));
  }

  return NextResponse.json({
    status: ready ? 'complete' : 'pending',
    accountId: profile.stripeConnectAccountId,
    totalEarningsCents: profile.totalEarningsCents,
  });
}
