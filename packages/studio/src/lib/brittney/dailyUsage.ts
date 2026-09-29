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
import { sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { brittneyDailyUsage } from '@/db/schema';

/** Free Brittney messages per person per UTC day. */
export const FREE_DAILY_MESSAGES = 40;

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

/** What the person reads when they reach the limit. */
export function dailyLimitMessage(count: DailyCount, now: Date = new Date()): string {
  const hours = Math.max(1, Math.ceil((count.resetsAt.getTime() - now.getTime()) / 3_600_000));
  return (
    `You have used today's ${count.limit} free messages with Brittney. ` +
    `They come back at midnight UTC, in about ${hours} hour${hours === 1 ? '' : 's'}.`
  );
}
