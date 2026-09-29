/**
 * Brittney's daily limit (founder sheet line "daily-limit"): a person's count
 * and the day's total both move up in place, the limit refuses the message
 * after the last free one, and a count that cannot be written says so with
 * null instead of pretending. The same functions are also run against real
 * PostgreSQL for the concurrent case, which a fake cannot show.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: null as unknown,
  rows: new Map<string, number>(),
  failScopes: new Set<string>(),
}));

vi.mock('@/db/client', () => ({ getDb: () => h.db }));

import {
  EVERYONE,
  FREE_DAILY_MESSAGES,
  countBrittneyMessage,
  dailyLimitMessage,
  nextUtcMidnight,
  utcDay,
} from '../dailyUsage';

/** A drizzle-shaped fake that keeps counts per (scope, day) like the upsert does. */
function fakeDb() {
  return {
    insert: () => ({
      values: (v: { scope: string; day: string }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (h.failScopes.has(v.scope)) throw new Error(`write refused for ${v.scope}`);
            const key = `${v.scope}|${v.day}`;
            const next = (h.rows.get(key) ?? 0) + 1;
            h.rows.set(key, next);
            return [{ messages: next }];
          },
        }),
      }),
    }),
  };
}

const NOON = new Date('2026-09-28T12:00:00Z');

beforeEach(() => {
  h.rows.clear();
  h.failScopes.clear();
  h.db = fakeDb();
});

describe('Brittney’s daily limit', () => {
  it('counts days in UTC and starts over at the next UTC midnight', () => {
    expect(utcDay(new Date('2026-09-28T23:59:59Z'))).toBe('2026-09-28');
    expect(utcDay(new Date('2026-09-29T00:00:00Z'))).toBe('2026-09-29');
    expect(nextUtcMidnight(NOON).toISOString()).toBe('2026-09-29T00:00:00.000Z');
  });

  it('allows the free messages, refuses the one after, and counts everyone’s total too', async () => {
    for (let i = 1; i <= FREE_DAILY_MESSAGES; i += 1) {
      const count = await countBrittneyMessage('person-1', NOON);
      expect(count, `message ${i}`).toMatchObject({
        used: i,
        allowed: true,
        limit: FREE_DAILY_MESSAGES,
      });
    }
    const over = await countBrittneyMessage('person-1', NOON);
    expect(over).toMatchObject({ used: FREE_DAILY_MESSAGES + 1, allowed: false });
    expect(over?.resetsAt.toISOString()).toBe('2026-09-29T00:00:00.000Z');

    // Another person has their own count; the day's total holds both.
    expect(await countBrittneyMessage('person-2', NOON)).toMatchObject({ used: 1, allowed: true });
    expect(h.rows.get(`${EVERYONE}|2026-09-28`)).toBe(FREE_DAILY_MESSAGES + 2);
  });

  it('starts a person over on a new UTC day', async () => {
    h.rows.set('person-1|2026-09-28', FREE_DAILY_MESSAGES + 5);
    expect(await countBrittneyMessage('person-1', new Date('2026-09-29T00:00:01Z'))).toMatchObject({
      used: 1,
      allowed: true,
    });
  });

  it('says null, not "allowed", when it has no database or cannot write the count', async () => {
    h.db = null;
    expect(await countBrittneyMessage('person-1', NOON)).toBeNull();

    h.db = fakeDb();
    h.failScopes.add('person-1');
    expect(await countBrittneyMessage('person-1', NOON)).toBeNull();
  });

  it('still limits a person when only the day’s total could not be written', async () => {
    h.failScopes.add(EVERYONE);
    expect(await countBrittneyMessage('person-1', NOON)).toMatchObject({ used: 1, allowed: true });
  });

  it('tells the person, in plain words, how many and when they come back', () => {
    const count = { used: 41, limit: 40, allowed: false, resetsAt: nextUtcMidnight(NOON) };
    expect(dailyLimitMessage(count, NOON)).toBe(
      "You have used today's 40 free messages with Brittney. They come back at midnight UTC, in about 12 hours."
    );
    expect(dailyLimitMessage(count, new Date('2026-09-28T23:30:00Z'))).toMatch(
      /in about 1 hour\.$/
    );
  });
});
