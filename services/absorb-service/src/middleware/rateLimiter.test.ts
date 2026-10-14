import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  effectiveAppLimit,
  FallbackRateCounterStore,
  MemoryRateCounterStore,
  PostgresRateCounterStore,
  RATE_COUNTERS_HIT_SQL,
  RateLimiter,
  type RateCounterStore,
} from './rateLimiter.js';

const HOUR = 60 * 60 * 1000;

describe('effectiveAppLimit (app caps can only be lower)', () => {
  it('clamps an app cap above the user cap down to the user cap', () => {
    expect(effectiveAppLimit(10, 50)).toBe(10);
  });
  it('keeps a lower app cap', () => {
    expect(effectiveAppLimit(10, 3)).toBe(3);
  });
  it('falls back to the user cap when unset or invalid', () => {
    expect(effectiveAppLimit(10)).toBe(10);
    expect(effectiveAppLimit(10, -1)).toBe(10);
    expect(effectiveAppLimit(10, Number.NaN)).toBe(10);
  });
});

describe('RateLimiter', () => {
  it('limits a user after userLimit hits in one window and resets next window', async () => {
    let now = 1_000_000;
    const rl = new RateLimiter(new MemoryRateCounterStore(), HOUR, () => now);
    for (let i = 0; i < 3; i++)
      expect((await rl.check({ userId: 'a', userLimit: 3 })).limited).toBe(false);
    expect(await rl.check({ userId: 'a', userLimit: 3 })).toMatchObject({
      limited: true,
      scope: 'user',
    });
    now += HOUR;
    expect((await rl.check({ userId: 'a', userLimit: 3 })).limited).toBe(false);
  });

  it('per-app cap trips before the user cap and does not affect other users', async () => {
    const rl = new RateLimiter(new MemoryRateCounterStore(), HOUR, () => 1);
    for (let i = 0; i < 2; i++) {
      expect(
        (await rl.check({ userId: 'a', clientId: 'muse', userLimit: 10, appLimit: 2 })).limited
      ).toBe(false);
    }
    expect(
      await rl.check({ userId: 'a', clientId: 'muse', userLimit: 10, appLimit: 2 })
    ).toMatchObject({
      limited: true,
      scope: 'app',
      effectiveAppLimit: 2,
    });
    expect(
      (await rl.check({ userId: 'b', clientId: 'muse', userLimit: 10, appLimit: 2 })).limited
    ).toBe(false);
  });

  it('rolls app usage up to the human: two apps share the user cap', async () => {
    const rl = new RateLimiter(new MemoryRateCounterStore(), HOUR, () => 1);
    for (let i = 0; i < 2; i++) await rl.check({ userId: 'a', clientId: 'muse', userLimit: 4 });
    for (let i = 0; i < 2; i++)
      await rl.check({ userId: 'a', clientId: 'grokbot-cos', userLimit: 4 });
    expect(await rl.check({ userId: 'a', clientId: 'grokbot-cos', userLimit: 4 })).toMatchObject({
      limited: true,
      scope: 'user',
    });
  });

  it('an app cap set above the user cap cannot raise it', async () => {
    const rl = new RateLimiter(new MemoryRateCounterStore(), HOUR, () => 1);
    for (let i = 0; i < 2; i++)
      await rl.check({ userId: 'a', clientId: 'x', userLimit: 2, appLimit: 100 });
    expect(
      (await rl.check({ userId: 'a', clientId: 'x', userLimit: 2, appLimit: 100 })).limited
    ).toBe(true);
  });
});

describe('PostgresRateCounterStore', () => {
  it('issues only the atomic upsert (no runtime DDL; table comes from migration 0002)', async () => {
    const query = vi.fn(async () => ({ rows: [{ count: 7 }] }));
    const store = new PostgresRateCounterStore(query);
    expect(await store.hit('u:a', HOUR, 6)).toBe(7);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(RATE_COUNTERS_HIT_SQL, ['u:a', 6, HOUR]);
    expect(query.mock.calls.some((c) => /CREATE TABLE/i.test(String((c as unknown[])[0])))).toBe(
      false
    );
  });
});

describe('migration 0002_rate_counters', () => {
  it('exists, is journaled, and matches the columns the upsert uses', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');
    const sqlText = readFileSync(join(dir, '0002_rate_counters.sql'), 'utf8');
    expect(sqlText).toMatch(/CREATE TABLE "rate_counters"/);
    for (const col of [
      '"key" text PRIMARY KEY',
      '"window_start" timestamp with time zone',
      '"count" integer',
    ]) {
      expect(sqlText).toContain(col);
    }
    const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8'));
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toContain('0002_rate_counters');
  });
});

describe('FallbackRateCounterStore', () => {
  it('still counts in memory when the database errors (never lets a hit through uncounted)', async () => {
    const broken: RateCounterStore = { hit: async () => Promise.reject(new Error('db down')) };
    const onError = vi.fn();
    const store = new FallbackRateCounterStore(broken, new MemoryRateCounterStore(), onError);
    expect(await store.hit('k', HOUR, 1)).toBe(1);
    expect(await store.hit('k', HOUR, 2)).toBe(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
