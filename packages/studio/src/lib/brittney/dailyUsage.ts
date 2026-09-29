/**
 * Brittney's daily limit: how many messages one person may send her in a UTC
 * day, counted in the database so a restart or a second server cannot reset it.
 *
 * Founder sheet line "daily-limit" (kept 2026-09-28): "Free chat has a daily
 * limit per person, so strangers cannot run up our bill." Until then the only
 * limit was 20 requests a minute per address (rate-limiter.ts), which a person
 * could sustain all day.
 *
 * Every counted message also adds to the day's total under scope '*', which is
 * what a paid-model ceiling reads and what a "what did Brittney do today" page
 * can show.
 */
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { brittneyDailyUsage } from '@/db/schema';

/** Free Brittney messages per person per UTC day. */
export const FREE_DAILY_MESSAGES = 40;

/**
 * The most Brittney's paid fallback may cost in one UTC day, for everyone
 * together (founder sheet line "answers-always": a paid model when our
 * machines are asleep). A tenth of the $100/day purchased-compute rail that
 * paid-LLM tokens count against (SPEND.md).
 */
export const PAID_DAILY_CEILING_USD = 10;

/**
 * What a paid round is counted as when the provider reports no cost: high on
 * purpose, so an endpoint that stops reporting runs into the ceiling sooner
 * rather than never.
 */
export const UNREPORTED_ROUND_COST_USD = 0.05;

/** The scope under which the day's total for everyone is kept. */
export const EVERYONE = '*';

export interface DailyCount {
  used: number;
  limit: number;
  allowed: boolean;
  resetsAt: Date;
}

/** The UTC day a moment falls in, as the table stores it (YYYY-MM-DD). */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** When today's counts start over: the next midnight, UTC. */
export function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

type Db = NonNullable<ReturnType<typeof getDb>>;

async function addMessage(db: Db, scope: string, day: string, now: Date): Promise<number> {
  const [row] = await db
    .insert(brittneyDailyUsage)
    .values({ scope, day, messages: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [brittneyDailyUsage.scope, brittneyDailyUsage.day],
      // In place, so two requests at once both count: a read-then-write would
      // let one overwrite the other.
      set: { messages: sql`${brittneyDailyUsage.messages} + 1`, updatedAt: now },
    })
    .returning({ messages: brittneyDailyUsage.messages });
  return row?.messages ?? 1;
}

/**
 * Count one message from this person today, and say whether it is within the
 * limit. A refused message still counts: it was sent.
 *
 * Returns null when there is no database, or the count could not be written.
 * The caller decides what that means: Brittney on our own machines carries on,
 * and anything that costs money per message must not.
 */
export async function countBrittneyMessage(
  userId: string,
  now: Date = new Date(),
  limit: number = FREE_DAILY_MESSAGES
): Promise<DailyCount | null> {
  const db = getDb();
  if (!db) return null;
  const day = utcDay(now);
  let used: number;
  try {
    used = await addMessage(db, userId, day, now);
  } catch (error) {
    console.error('[brittney/daily-usage] could not count a message:', error);
    return null;
  }
  try {
    await addMessage(db, EVERYONE, day, now);
  } catch (error) {
    // The day's total is for reporting and the paid ceiling; a person's own
    // count above is what the limit reads, so this one failing does not block.
    console.error("[brittney/daily-usage] could not add to the day's total:", error);
  }
  return { used, limit, allowed: used <= limit, resetsAt: nextUtcMidnight(now) };
}

/**
 * May the paid fallback answer right now? Yes while the day's paid cost for
 * everyone is under the ceiling. No database, or a read that fails, is a no:
 * nothing is spent that cannot be counted.
 *
 * Checked before the call and paid for after it, so answers already in flight
 * when the ceiling is reached can take the day a little past it; each is one
 * answer's cost.
 */
export async function paidFallbackOpen(
  now: Date = new Date(),
  ceilingUsd: number = PAID_DAILY_CEILING_USD
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const [row] = await db
      .select({ cost: brittneyDailyUsage.paidCostMicroUsd })
      .from(brittneyDailyUsage)
      .where(and(eq(brittneyDailyUsage.scope, EVERYONE), eq(brittneyDailyUsage.day, utcDay(now))))
      .limit(1);
    return (row?.cost ?? 0) < Math.round(ceilingUsd * 1_000_000);
  } catch (error) {
    console.error('[brittney/daily-usage] could not read the paid total; no paid answers:', error);
    return false;
  }
}

/**
 * Add one paid answer and what it cost to the person's row and the day's total.
 * A write that fails is logged: the answer has already been given.
 */
export async function recordPaidAnswer(
  userId: string,
  costUsd: number,
  now: Date = new Date()
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const day = utcDay(now);
  const micro = Math.max(0, Math.round(costUsd * 1_000_000));
  for (const scope of [userId, EVERYONE]) {
    try {
      await db
        .insert(brittneyDailyUsage)
        .values({ scope, day, paidMessages: 1, paidCostMicroUsd: micro, updatedAt: now })
        .onConflictDoUpdate({
          target: [brittneyDailyUsage.scope, brittneyDailyUsage.day],
          set: {
            paidMessages: sql`${brittneyDailyUsage.paidMessages} + 1`,
            paidCostMicroUsd: sql`${brittneyDailyUsage.paidCostMicroUsd} + ${micro}`,
            updatedAt: now,
          },
        });
    } catch (error) {
      console.error(`[brittney/daily-usage] could not record a paid answer for ${scope}:`, error);
    }
  }
}

/** What the person reads when they reach the limit. */
export function dailyLimitMessage(count: DailyCount, now: Date = new Date()): string {
  const hours = Math.max(1, Math.ceil((count.resetsAt.getTime() - now.getTime()) / 3_600_000));
  return (
    `You have used today's ${count.limit} free messages with Brittney. ` +
    `They come back at midnight UTC, in about ${hours} hour${hours === 1 ? '' : 's'}.`
  );
}
