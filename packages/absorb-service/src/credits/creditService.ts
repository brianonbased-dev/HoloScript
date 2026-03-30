/**
 * Credit Service — Atomic credit operations for the Absorb Service.
 *
 * All balance-modifying operations use database transactions to prevent
 * race conditions. Falls back gracefully when DB is not configured.
 */

import { eq, desc, sql } from 'drizzle-orm';
import { creditAccounts, creditTransactions } from '../schema';
import { TIER_LIMITS, type Tier } from './pricing';

// ─── DB Client Injection ────────────────────────────────────────────────────
// The credit service requires a Drizzle DB client to be injected by the consumer
// (typically Studio). Call setDbProvider() during app initialization.

type DbClient = ReturnType<typeof import('drizzle-orm/node-postgres').drizzle> | any;

let _getDb: () => DbClient | null = () => null;

/**
 * Set the database provider for the credit service.
 * Must be called before any credit operations.
 */
export function setDbProvider(provider: () => DbClient | null): void {
  _getDb = provider;
}

function getDb(): DbClient | null {
  return _getDb();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreditAccount {
  userId: string;
  balanceCents: number;
  lifetimeSpentCents: number;
  lifetimePurchasedCents: number;
  tier: Tier;
  freeCreditsUsedCents: number;
}

export interface CreditTransaction {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface BalanceCheck {
  sufficient: boolean;
  balanceCents: number;
  requiredCents: number;
}

// ─── Account Operations ──────────────────────────────────────────────────────

/**
 * Get or create a credit account for a user.
 * New accounts get free-tier credits.
 */
export async function getOrCreateAccount(userId: string): Promise<CreditAccount | null> {
  const db = getDb();
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .limit(1);

  if (existing) {
    return {
      userId: existing.userId,
      balanceCents: existing.balanceCents,
      lifetimeSpentCents: existing.lifetimeSpentCents,
      lifetimePurchasedCents: existing.lifetimePurchasedCents,
      tier: existing.tier as Tier,
      freeCreditsUsedCents: existing.freeCreditsUsedCents,
    };
  }

  const freeCredits = TIER_LIMITS.free.freeCredits;
  const [created] = await db
    .insert(creditAccounts)
    .values({
      userId,
      balanceCents: freeCredits,
      tier: 'free',
    })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    // Race: another request created it. Re-fetch.
    const [refetched] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
      .limit(1);
    if (!refetched) return null;
    return {
      userId: refetched.userId,
      balanceCents: refetched.balanceCents,
      lifetimeSpentCents: refetched.lifetimeSpentCents,
      lifetimePurchasedCents: refetched.lifetimePurchasedCents,
      tier: refetched.tier as Tier,
      freeCreditsUsedCents: refetched.freeCreditsUsedCents,
    };
  }

  // Record the free credits as a bonus transaction
  if (freeCredits > 0) {
    await db.insert(creditTransactions).values({
      userId,
      type: 'bonus',
      amountCents: freeCredits,
      balanceAfterCents: freeCredits,
      description: 'Welcome bonus — free tier credits',
      metadata: {},
    });
  }

  return {
    userId: created.userId,
    balanceCents: created.balanceCents,
    lifetimeSpentCents: created.lifetimeSpentCents,
    lifetimePurchasedCents: created.lifetimePurchasedCents,
    tier: created.tier as Tier,
    freeCreditsUsedCents: created.freeCreditsUsedCents,
  };
}

// ─── Balance Check ───────────────────────────────────────────────────────────

export async function checkBalance(userId: string, requiredCents: number): Promise<BalanceCheck> {
  const account = await getOrCreateAccount(userId);
  const balanceCents = account?.balanceCents ?? 0;
  return {
    sufficient: balanceCents >= requiredCents,
    balanceCents,
    requiredCents,
  };
}

// ─── Credit Operations (Atomic) ──────────────────────────────────────────────

/**
 * Deduct credits from a user's account. Returns the new balance or null on failure.
 * Uses SQL-level atomic update to prevent race conditions.
 */
export async function deductCredits(
  userId: string,
  amountCents: number,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceCents: number } | null> {
  const db = getDb();
  if (!db) return null;

  // Atomic: decrement balance only if sufficient, return new balance
  const [updated] = await db
    .update(creditAccounts)
    .set({
      balanceCents: sql`${creditAccounts.balanceCents} - ${amountCents}`,
      lifetimeSpentCents: sql`${creditAccounts.lifetimeSpentCents} + ${amountCents}`,
      updatedAt: new Date(),
    })
    .where(
      sql`${creditAccounts.userId} = ${userId} AND ${creditAccounts.balanceCents} >= ${amountCents}`
    )
    .returning({ balanceCents: creditAccounts.balanceCents });

  if (!updated) return null;

  await db.insert(creditTransactions).values({
    userId,
    type: 'usage',
    amountCents: -amountCents,
    balanceAfterCents: updated.balanceCents,
    description,
    metadata,
  });

  return { balanceCents: updated.balanceCents };
}

/**
 * Add credits to a user's account (purchase or refund).
 */
export async function addCredits(
  userId: string,
  amountCents: number,
  description: string,
  opts: { type?: string; stripeSessionId?: string; metadata?: Record<string, unknown> } = {}
): Promise<{ balanceCents: number } | null> {
  const db = getDb();
  if (!db) return null;

  // Ensure account exists
  await getOrCreateAccount(userId);

  const [updated] = await db
    .update(creditAccounts)
    .set({
      balanceCents: sql`${creditAccounts.balanceCents} + ${amountCents}`,
      lifetimePurchasedCents: sql`${creditAccounts.lifetimePurchasedCents} + ${amountCents}`,
      updatedAt: new Date(),
    })
    .where(eq(creditAccounts.userId, userId))
    .returning({ balanceCents: creditAccounts.balanceCents });

  if (!updated) return null;

  await db.insert(creditTransactions).values({
    userId,
    type: opts.type ?? 'purchase',
    amountCents,
    balanceAfterCents: updated.balanceCents,
    description,
    stripeSessionId: opts.stripeSessionId ?? null,
    metadata: opts.metadata ?? {},
  });

  return { balanceCents: updated.balanceCents };
}

// ─── Usage History ───────────────────────────────────────────────────────────

export async function getUsageHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<CreditTransaction[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    amountCents: r.amountCents,
    balanceAfterCents: r.balanceAfterCents,
    description: r.description,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
}
