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
): Promise<{ balanceCents: number; applied: boolean } | null> {
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
  // `applied` is false when this grant had already been made. Callers reporting
  // to logs or to Stripe must say so, or a redelivery reads as a second grant.
  const apply = async (
    tx: DbClient
  ): Promise<{ balanceCents: number; applied: boolean } | null> => {
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
        return { balanceCents: prior[0].balanceAfterCents, applied: false };
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

    return { balanceCents: updated.balanceCents, applied: true };
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

  try {
    return await db.transaction(apply);
  } catch (error) {
    // The race the index exists for, answered the way the check above answers a
    // redelivery: two deliveries of one session or invoice both read "no prior
    // row", the loser's ledger insert violates the index, and its transaction
    // rolls back, balance included. Until 2026-09-28 that loser threw instead
    // (review, real PostgreSQL: 10 concurrent grants of one invoice, 9 settled
    // and 1 threw), so "a redelivery is a no-op" held only where a caller
    // happened to catch it.
    if (opts.stripeSessionId && isStripeSessionConflict(error)) {
      const [prior] = await db
        .select({ balanceAfterCents: creditTransactions.balanceAfterCents })
        .from(creditTransactions)
        .where(eq(creditTransactions.stripeSessionId, opts.stripeSessionId))
        .limit(1);
      if (prior) {
        console.log(
          `[creditService] Session ${opts.stripeSessionId} was applied by a concurrent delivery; not crediting again.`
        );
        return { balanceCents: prior.balanceAfterCents, applied: false };
      }
    }
    throw error;
  }
}

/** The ledger's unique index on stripe_session_id (schema.ts, migration 0001). */
const STRIPE_SESSION_INDEX = 'idx_credit_tx_stripe_session';

/**
 * Is this the unique-index violation a concurrent grant of the same session
 * raises? PostgreSQL reports code 23505 with the constraint's name; drizzle
 * wraps the driver's error, so the cause chain is searched too.
 */
function isStripeSessionConflict(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (e.code === '23505' && e.constraint === STRIPE_SESSION_INDEX) return true;
    current = e.cause;
  }
  return false;
}

// ─── Studio Pro Subscription ─────────────────────────────────────────────────

export interface CreditSubscription {
  userId: string;
  plan: string;
  stripeCustomerId: string;
  /** Null while the row holds only the customer, before the first checkout completes. */
  stripeSubscriptionId: string | null;
  status: string;
  /** The Stripe mode that wrote the row: true live, false test; null when not known. */
  livemode: boolean | null;
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

/** Statuses Stripe never moves a subscription out of. */
export function isEndedSubscriptionStatus(status: string | null | undefined): boolean {
  return status === 'canceled' || status === 'incomplete_expired';
}

/**
 * The Stripe mode a secret key runs in: true for a live key, false for a test
 * (practice) key, null for no key or one this cannot read.
 */
export function stripeKeyLivemode(key: string | null | undefined): boolean | null {
  const k = key?.trim();
  if (!k) return null;
  if (/^(sk|rk)_live_/u.test(k)) return true;
  if (/^(sk|rk)_test_/u.test(k)) return false;
  return null;
}

/**
 * The row as a service running in `livemode` must see it. The "Turn on payments"
 * icon lets Joseph practise with a test key against production before switching
 * to the live key, and nothing marked which mode a row came from: a practice
 * subscription then read as real Pro forever (test events stop arriving once the
 * key is live), answered "you already have Studio Pro" to the real checkout, and
 * handed a test customer to the live portal. A row from the other mode does not
 * exist for this one. A null on either side means not known, and matches.
 */
export function subscriptionInMode(
  sub: CreditSubscription | null,
  livemode: boolean | null
): CreditSubscription | null {
  if (!sub) return null;
  if (livemode === null || sub.livemode === null) return sub;
  return sub.livemode === livemode ? sub : null;
}

/**
 * An account's tier as a service in `livemode` must treat it: Pro that only a
 * subscription from the other Stripe mode earned is not Pro here. Pro with no
 * subscription row at all (set by hand) stays Pro.
 */
export function tierInMode(
  accountTier: string,
  sub: CreditSubscription | null,
  livemode: boolean | null
): string {
  if (accountTier !== 'pro' || !sub) return accountTier;
  return subscriptionInMode(sub, livemode) ? accountTier : 'free';
}

/**
 * The tier to store after a Studio Pro change. Studio Pro moves an account
 * between free and pro only; any other tier (enterprise, set by hand) is not
 * Studio Pro's to change.
 */
export function nextTier(current: string, fromSubscription: Tier): string {
  return current === 'free' || current === 'pro' ? fromSubscription : current;
}

export type SubscriptionWrite =
  { write: true } | { write: false; reason: string; duplicate?: boolean };

/**
 * Whether a fresh read of one subscription may replace the user's stored row.
 *
 * The row used to take whatever arrived last. Stripe does not promise delivery
 * order, two deliveries can be handled at once, and a user can hold more than
 * one subscription (an abandoned first attempt, a second checkout), so "last"
 * was often "older". Measured by review on real PostgreSQL, 2026-09-28: a late
 * delivery about an ended subscription turned a paying user free, and an older
 * "active" read written after the "canceled" one gave Pro back after
 * cancellation. So a read replaces the row only when it cannot be the older one:
 *
 * - no row, a customer-only row, or a row from the other Stripe mode: write;
 * - the same subscription: write, because recordSubscription reads Stripe only
 *   after locking the row, so this read is at least as new as the one stored;
 *   active to unpaid and back are both real. The one exception is a guard:
 *   never from ended back to live, because Stripe never revives an ended
 *   subscription, so a live read of one can only be an older read;
 * - a different subscription: an unpaid or ended one never replaces a live one,
 *   and a SECOND live one is kept out and reported, because the user is being
 *   charged twice and a person has to cancel one and refund it.
 */
export function decideSubscriptionWrite(
  stored: CreditSubscription | null,
  incoming: Omit<CreditSubscription, 'userId'>
): SubscriptionWrite {
  if (!stored || !stored.stripeSubscriptionId) return { write: true };
  if (
    stored.livemode !== null &&
    incoming.livemode !== null &&
    stored.livemode !== incoming.livemode
  ) {
    return { write: true };
  }
  if (stored.stripeSubscriptionId === incoming.stripeSubscriptionId) {
    if (isEndedSubscriptionStatus(stored.status) && !isEndedSubscriptionStatus(incoming.status)) {
      return {
        write: false,
        reason: `subscription ${stored.stripeSubscriptionId} already ended (${stored.status}); a ${incoming.status} read of it is older`,
      };
    }
    return { write: true };
  }
  const storedLive = tierForSubscriptionStatus(stored.status) === 'pro';
  const incomingLive = tierForSubscriptionStatus(incoming.status) === 'pro';
  if (storedLive && incomingLive) {
    return {
      write: false,
      duplicate: true,
      reason: `user already has live subscription ${stored.stripeSubscriptionId}; ${incoming.stripeSubscriptionId} is a second one`,
    };
  }
  if (storedLive) {
    return {
      write: false,
      reason: `live subscription ${stored.stripeSubscriptionId} is not replaced by ${incoming.stripeSubscriptionId} (${incoming.status})`,
    };
  }
  return { write: true };
}

function toSubscription(row: Record<string, unknown>): CreditSubscription {
  return {
    userId: row.userId as string,
    plan: row.plan as string,
    stripeCustomerId: row.stripeCustomerId as string,
    stripeSubscriptionId: (row.stripeSubscriptionId as string | null) ?? null,
    status: row.status as string,
    livemode: typeof row.livemode === 'boolean' ? row.livemode : null,
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

/** What recordSubscription did. `recorded: false` is a decision, not a failure. */
export interface SubscriptionRecordResult {
  tier: string;
  recorded: boolean;
  reason?: string;
  duplicate?: boolean;
}

const NO_TRANSACTION =
  '[creditService] REFUSED: the database client exposes no transaction(). ' +
  'Studio Pro will not write a subscription and a tier separately.';

/**
 * A read of one subscription from Stripe, as the row would hold it. It is a
 * function because recordSubscription decides WHEN it runs: after the lock.
 */
export type SubscriptionRead = () => Promise<Omit<CreditSubscription, 'userId'>>;

/**
 * Studio Pro calls Stripe INSIDE a transaction, holding the user's row lock
 * (recordSubscription, ensureSubscriptionCustomer), so a slow Stripe holds the
 * lock and a pool connection with it. The Stripe client's own default wait is 80
 * seconds per attempt, and Stripe redelivers its backlog of webhooks right after
 * an outage. So each Stripe call gets a deadline: past it the call is abandoned,
 * the transaction rolls back and the lock is released. The webhook answers 500
 * and Stripe redelivers; a checkout click can be tried again.
 *
 * A second delivery waiting for that lock gives up after lockWaitMs (SET LOCAL
 * lock_timeout, this transaction only) instead of queueing behind a stuck one;
 * it fails, and Stripe sends it again.
 *
 * Deliberately NOT idle_in_transaction_session_timeout as a database-side
 * backstop: PostgreSQL ends such a session between statements, and node-postgres
 * then raises 'error' on a client drizzle has checked out, with no listener. On
 * real PostgreSQL 17 (2026-09-28) that crashed the process; in the service,
 * server.ts shuts down on an uncaught exception. A slow Stripe must not become
 * a restart. The deadline above fires from a timer, whatever Stripe does.
 */
export interface StripeCallBounds {
  deadlineMs?: number;
  lockWaitMs?: number;
}

export const STRIPE_CALL_BOUNDS: Required<StripeCallBounds> = {
  deadlineMs: 10_000,
  lockWaitMs: 15_000,
};

/** Rejects when `work` has not settled within `ms`; `what` names the call in the error. */
export function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** A ceiling on the wait for the row lock, for this transaction only; see above. */
async function boundStripeTransaction(
  tx: DbClient,
  bounds: Required<StripeCallBounds>
): Promise<void> {
  const ms = Math.max(1, Math.floor(bounds.lockWaitMs));
  await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${ms}ms'`));
}

/**
 * Record what Stripe says about a user's subscription and set their tier from it,
 * in one transaction, so the row and the tier can never disagree.
 *
 * The user's account row is locked first (SELECT ... FOR UPDATE), and only then
 * is Stripe read. Two deliveries for one user therefore run one after the other,
 * and the one that writes last also read last, so the row ends at what Stripe
 * says now, whatever order the deliveries came in. Until 2026-09-28 the caller
 * read Stripe before the lock: two deliveries could read in one order and write
 * in the other, and an older "unpaid" read written last turned a paying member
 * free (review, real PostgreSQL). decideSubscriptionWrite then says whether this
 * read may replace the stored row at all.
 */
export async function recordSubscription(
  userId: string,
  read: SubscriptionRead,
  boundsIn: StripeCallBounds = {}
): Promise<SubscriptionRecordResult | null> {
  const bounds = { ...STRIPE_CALL_BOUNDS, ...boundsIn };
  const db = getDb();
  if (!db) {
    console.warn('[creditService] Database unavailable — operation skipped. Set DATABASE_URL.');
    return null;
  }
  await getOrCreateAccount(userId);
  // Same rule as addCredits: without a transaction the row and the tier could
  // land apart, so refuse rather than write half.
  if (typeof db.transaction !== 'function') {
    console.error(NO_TRANSACTION);
    return null;
  }
  const now = new Date();
  return await db.transaction(async (tx: DbClient): Promise<SubscriptionRecordResult> => {
    await boundStripeTransaction(tx, bounds);
    const [account] = await tx
      .select({ tier: creditAccounts.tier })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
      .for('update');
    // Stripe is read here, holding the lock, never before it (see above). The
    // lock is held for at most one bounded Stripe call (STRIPE_CALL_BOUNDS).
    const sub = await withDeadline(read(), bounds.deadlineMs, 'Stripe subscription read');
    const current = (account?.tier as string | undefined) ?? 'free';
    const [row] = await tx
      .select()
      .from(creditSubscriptions)
      .where(eq(creditSubscriptions.userId, userId))
      .limit(1);
    const decision = decideSubscriptionWrite(row ? toSubscription(row) : null, sub);
    if (!decision.write) {
      return {
        tier: current,
        recorded: false,
        reason: decision.reason,
        duplicate: decision.duplicate,
      };
    }
    await tx
      .insert(creditSubscriptions)
      .values({ userId, ...sub, updatedAt: now })
      .onConflictDoUpdate({ target: creditSubscriptions.userId, set: { ...sub, updatedAt: now } });
    const tier = nextTier(current, tierForSubscriptionStatus(sub.status));
    if (tier !== current) {
      await tx
        .update(creditAccounts)
        .set({ tier, updatedAt: now })
        .where(eq(creditAccounts.userId, userId));
    }
    return { tier, recorded: true };
  });
}

/**
 * The Stripe customer this user's Studio Pro checkouts use, created once and
 * saved BEFORE the first checkout.
 *
 * Every first-time checkout used to make its own customer, and the "already
 * subscribed" check read only this row, which exists only once the webhook has
 * run. A second click before the first webhook arrived (a slow webhook, or one
 * failing on a database blip) opened a second subscription on a second customer:
 * charged twice, with the Manage button reaching only one of them. Serialised on
 * the account row, so two clicks at once still make one customer.
 *
 * `createCustomer` runs inside the transaction, holding that one row lock for
 * at most one bounded Stripe call (STRIPE_CALL_BOUNDS); this path is one click
 * per user. A create abandoned at the deadline may still have happened at
 * Stripe, so the caller must send an idempotency key: the retry then gets that
 * same customer back instead of making a second one.
 */
export async function ensureSubscriptionCustomer(
  userId: string,
  opts: { plan: string; livemode: boolean | null },
  createCustomer: () => Promise<string>,
  boundsIn: StripeCallBounds = {}
): Promise<string | null> {
  const bounds = { ...STRIPE_CALL_BOUNDS, ...boundsIn };
  const db = getDb();
  if (!db) {
    console.warn('[creditService] Database unavailable — operation skipped. Set DATABASE_URL.');
    return null;
  }
  await getOrCreateAccount(userId);
  if (typeof db.transaction !== 'function') {
    console.error(NO_TRANSACTION);
    return null;
  }
  return await db.transaction(async (tx: DbClient): Promise<string> => {
    await boundStripeTransaction(tx, bounds);
    const [account] = await tx
      .select({ tier: creditAccounts.tier })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
      .for('update');
    const [row] = await tx
      .select()
      .from(creditSubscriptions)
      .where(eq(creditSubscriptions.userId, userId))
      .limit(1);
    const stored = row ? toSubscription(row) : null;
    const usable = subscriptionInMode(stored, opts.livemode);
    if (usable) return usable.stripeCustomerId;
    const customerId = await withDeadline(
      createCustomer(),
      bounds.deadlineMs,
      'Stripe customer create'
    );
    const now = new Date();
    const fresh = {
      plan: opts.plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      status: 'none',
      livemode: opts.livemode,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
    await tx
      .insert(creditSubscriptions)
      .values({ userId, ...fresh, updatedAt: now })
      .onConflictDoUpdate({
        target: creditSubscriptions.userId,
        set: { ...fresh, updatedAt: now },
      });
    // A row from the other Stripe mode just gave way. Pro that practice earned
    // ends with it: otherwise the stored tier (still pro) and this same-mode,
    // customer-only row would read as Pro to a live service that was never paid.
    // Measured on real PostgreSQL 2026-09-28 before this line existed.
    if (stored) {
      const current = (account?.tier as string | undefined) ?? 'free';
      const tier = nextTier(current, 'free');
      if (tier !== current) {
        await tx
          .update(creditAccounts)
          .set({ tier, updatedAt: now })
          .where(eq(creditAccounts.userId, userId));
      }
    }
    return customerId;
  });
}

/**
 * Grant one paid invoice's Studio Pro credits, once. The invoice id goes in the
 * ledger's stripe_session_id, so the unique index that stops a redelivered
 * checkout crediting twice does the same for a redelivered invoice.paid.
 * `applied` is false when this invoice had already been credited.
 */
export async function grantSubscriptionCredits(
  userId: string,
  invoiceId: string,
  credits: number,
  metadata: Record<string, unknown> = {}
): Promise<{ balanceCents: number; applied: boolean } | null> {
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
