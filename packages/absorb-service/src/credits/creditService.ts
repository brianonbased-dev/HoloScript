/**
 * Credit Service — Atomic credit operations for the Absorb Service.
 *
 * addCredits runs its balance update and ledger row in one transaction, and is
 * idempotent on stripeSessionId. deductCredits relies on a single conditional
 * SQL update instead, which is atomic for the balance but writes its ledger row
 * separately — say that rather than claim a blanket guarantee, because this
 * header claimed one until 2026-09-21 while addCredits used no transaction at
 * all. Falls back gracefully when DB is not configured.
 */

import { eq, desc, sql } from 'drizzle-orm';
import { creditAccounts, creditSubscriptions, creditTransactions } from '../schema';
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
  if (!db) {
    console.warn('[creditService] Database unavailable — operation skipped. Set DATABASE_URL.');
    return null;
  }

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
  if (!db) {
    console.warn('[creditService] Database unavailable — operation skipped. Set DATABASE_URL.');
    return null;
  }

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
  if (!db) {
    console.warn('[creditService] Database unavailable — operation skipped. Set DATABASE_URL.');
    return null;
  }

  // Ensure account exists
  await getOrCreateAccount(userId);

  /**
   * One body, run either inside a transaction or directly, so the two cannot
   * drift apart. The balance update and the ledger row belong together: this
   * file's own header has always promised "all balance-modifying operations use
   * database transactions", and until 2026-09-21 this function used none, so a
   * failure between the two statements left credits granted with no record of
   * why.
   */
  const apply = async (tx: DbClient): Promise<{ balanceCents: number } | null> => {
    // IDEMPOTENCE. A Stripe checkout session may credit an account once.
    // Stripe re-sends a webhook whenever it is not certain we received it, and
    // the handler returns 500 on any internal error, which asks for exactly
    // that. The comment at the call site claimed "idempotent allocation inside
    // the database transaction logic"; no such check existed, and the ledger
    // recorded the session id without ever reading it back. A retry therefore
    // added the credits again, every time. Measured from the source 2026-09-21.
    if (opts.stripeSessionId) {
      const prior = await tx
        .select({ balanceAfterCents: creditTransactions.balanceAfterCents })
        .from(creditTransactions)
        .where(eq(creditTransactions.stripeSessionId, opts.stripeSessionId))
        .limit(1);

      if (prior?.[0]) {
        console.log(
          `[creditService] Session ${opts.stripeSessionId} was already applied; not crediting again.`
        );
        return { balanceCents: prior[0].balanceAfterCents };
      }
    }

    const [updated] = await tx
      .update(creditAccounts)
      .set({
        balanceCents: sql`${creditAccounts.balanceCents} + ${amountCents}`,
        lifetimePurchasedCents: sql`${creditAccounts.lifetimePurchasedCents} + ${amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.userId, userId))
      .returning({ balanceCents: creditAccounts.balanceCents });

    if (!updated) return null;

    await tx.insert(creditTransactions).values({
      userId,
      type: opts.type ?? 'purchase',
      amountCents,
      balanceAfterCents: updated.balanceCents,
      description,
      stripeSessionId: opts.stripeSessionId ?? null,
      metadata: opts.metadata ?? {},
    });

    return { balanceCents: updated.balanceCents };
  };

  // The unique index on stripe_session_id is the backstop the check above
  // cannot be: two deliveries racing each other both read "no prior row" before
  // either writes. Under a transaction the loser's insert violates the index
  // and its whole transaction rolls back, balance included. Without one, the
  // read-then-write is advisory only — which is why the index went in with it.
  // A TRANSACTION IS REQUIRED, and its absence refuses rather than degrades.
  //
  // Review of this change found the hazard in the fallback that used to be
  // here. Outside a transaction the balance UPDATE commits, the ledger INSERT
  // is then rejected by the unique index, and the account is left
  // double-credited with a SINGLE ledger row — a ledger less honest than the
  // duplicate rows this fix exists to prevent. No ordering of two statements
  // avoids that without atomicity, so there is nothing to reorder.
  //
  // A client that cannot give us a transaction therefore does not get to move
  // money. Failing closed costs a credit that a redelivery will deliver, now
  // that redelivery is safe; failing open costs a balance nobody can explain.
  if (typeof db.transaction !== 'function') {
    console.error(
      '[creditService] REFUSED: the database client exposes no transaction(). ' +
        'addCredits will not apply a balance change it cannot make atomic. ' +
        'No credits were granted.'
    );
    return null;
  }

  return await db.transaction(apply);
}

// ─── Studio Pro Subscription ─────────────────────────────────────────────────

export interface CreditSubscription {
  userId: string;
  plan: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * The tier a Stripe subscription status earns. Pro while Stripe still treats the
 * subscription as live: active, trialing, or past_due while it retries a failed
 * card (dropping a customer on one declined charge would punish a bank hiccup;
 * Stripe moves the subscription on to unpaid or canceled if the retries fail).
 * Everything else, and anything unrecognised, is free: nothing unproven counts
 * as paid.
 */
export function tierForSubscriptionStatus(status: string | null | undefined): Tier {
  return status === 'active' || status === 'trialing' || status === 'past_due' ? 'pro' : 'free';
}

function toSubscription(row: Record<string, unknown>): CreditSubscription {
  return {
    userId: row.userId as string,
    plan: row.plan as string,
    stripeCustomerId: row.stripeCustomerId as string,
    stripeSubscriptionId: row.stripeSubscriptionId as string,
    status: row.status as string,
    currentPeriodEnd: (row.currentPeriodEnd as Date | null) ?? null,
    cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
  };
}

export async function getSubscription(userId: string): Promise<CreditSubscription | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(creditSubscriptions)
    .where(eq(creditSubscriptions.userId, userId))
    .limit(1);
  return row ? toSubscription(row) : null;
}

/**
 * Whose subscription a Stripe object belongs to, when its metadata does not say:
 * by the subscription id first, then the customer id. Null when neither is known.
 */
export async function findSubscriptionUser(ref: {
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  for (const [column, value] of [
    [creditSubscriptions.stripeSubscriptionId, ref.stripeSubscriptionId],
    [creditSubscriptions.stripeCustomerId, ref.stripeCustomerId],
  ] as const) {
    if (!value) continue;
    const [row] = await db
      .select({ userId: creditSubscriptions.userId })
      .from(creditSubscriptions)
      .where(eq(column, value))
      .limit(1);
    if (row?.userId) return row.userId as string;
  }
  return null;
}

/**
 * Record what Stripe says about a user's subscription and set their tier from it,
 * in one transaction, so the row and the tier can never disagree. Upsert by user:
 * subscribing again after cancelling replaces the old subscription on the same row.
 */
export async function recordSubscription(
  userId: string,
  sub: Omit<CreditSubscription, 'userId'>
): Promise<{ tier: Tier } | null> {
  const db = getDb();
  if (!db) {
    console.warn('[creditService] Database unavailable — operation skipped. Set DATABASE_URL.');
    return null;
  }
  await getOrCreateAccount(userId);
  const tier = tierForSubscriptionStatus(sub.status);
  const now = new Date();
  const apply = async (tx: DbClient): Promise<{ tier: Tier }> => {
    await tx
      .insert(creditSubscriptions)
      .values({ userId, ...sub, updatedAt: now })
      .onConflictDoUpdate({ target: creditSubscriptions.userId, set: { ...sub, updatedAt: now } });
    await tx
      .update(creditAccounts)
      .set({ tier, updatedAt: now })
      .where(eq(creditAccounts.userId, userId));
    return { tier };
  };
  // Same rule as addCredits: without a transaction the row and the tier could
  // land apart, so refuse rather than write half.
  if (typeof db.transaction !== 'function') {
    console.error(
      '[creditService] REFUSED: the database client exposes no transaction(). ' +
        'recordSubscription will not write a subscription and a tier separately.'
    );
    return null;
  }
  return await db.transaction(apply);
}

/**
 * Grant one paid invoice's Studio Pro credits, once. The invoice id goes in the
 * ledger's stripe_session_id, so the unique index that stops a redelivered
 * checkout crediting twice does the same for a redelivered invoice.paid.
 */
export async function grantSubscriptionCredits(
  userId: string,
  invoiceId: string,
  credits: number,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceCents: number } | null> {
  return addCredits(userId, credits, 'Studio Pro monthly credits', {
    type: 'subscription',
    stripeSessionId: invoiceId,
    metadata: { ...metadata, invoiceId },
  });
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

  return rows.map((r: (typeof rows)[number]) => ({
    id: r.id,
    type: r.type,
    amountCents: r.amountCents,
    balanceAfterCents: r.balanceAfterCents,
    description: r.description,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  }));
}
