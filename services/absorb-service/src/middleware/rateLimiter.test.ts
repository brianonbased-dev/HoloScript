import { describe, it, expect, vi } from 'vitest';
import {
  effectiveAppLimit,
  FallbackRateCounterStore,
  MemoryRateCounterStore,
  PostgresRateCounterStore,
  RATE_COUNTERS_DDL,
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
  it('creates the table once, then issues the atomic upsert with key/now/window', async () => {
    const query = vi.fn(async (text: string) => ({
      rows: text === RATE_COUNTERS_HIT_SQL ? [{ count: 7 }] : [],
    }));
    const store = new PostgresRateCounterStore(query);
    expect(await store.hit('u:a', HOUR, 5)).toBe(7);
    expect(await store.hit('u:a', HOUR, 6)).toBe(7);
    expect(query.mock.calls.filter((c) => c[0] === RATE_COUNTERS_DDL)).toHaveLength(1);
    expect(query).toHaveBeenLastCalledWith(RATE_COUNTERS_HIT_SQL, ['u:a', 6, HOUR]);
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
