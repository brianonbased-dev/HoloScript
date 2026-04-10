/**
 * TokenBucketRateLimiter.prod.test.ts — Sprint CLXIX
 *
 * Production tests for the token bucket rate limiter.
 * API: new TokenBucketRateLimiter({ tokensPerSecond, tokensPerMinute, burstSize })
 *   .consumeTokens(key, count?) → RateLimitResult
 *   .checkLimit(key)            → RateLimitResult (non-consuming)
 *   .getRemainingTokens(key)    → number
 *   .resetKey(key)              → void
 *   .resetAll()                 → void
 *   .size                       → number (getter)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '../RateLimiter';

function makeLimiter(
  overrides: Partial<{ tokensPerSecond: number; tokensPerMinute: number; burstSize: number }> = {}
) {
  return new TokenBucketRateLimiter({
    tokensPerSecond: 10,
    tokensPerMinute: 100,
    burstSize: 10,
    ...overrides,
  });
}

describe('TokenBucketRateLimiter', () => {
  // -------------------------------------------------------------------------
  // constructor validation
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('throws on non-positive tokensPerSecond', () => {
      expect(() => makeLimiter({ tokensPerSecond: 0 })).toThrow('tokensPerSecond');
    });

    it('throws on non-positive tokensPerMinute', () => {
      expect(() => makeLimiter({ tokensPerMinute: -1 })).toThrow('tokensPerMinute');
    });

    it('throws on non-positive burstSize', () => {
      expect(() => makeLimiter({ burstSize: 0 })).toThrow('burstSize');
    });

    it('getConfig() returns a copy of config', () => {
      const lim = makeLimiter({ tokensPerSecond: 5 });
      const cfg = lim.getConfig();
      expect(cfg.tokensPerSecond).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // consumeTokens()
  // -------------------------------------------------------------------------

  describe('consumeTokens()', () => {
    it('allows first request from full bucket', () => {
      const lim = makeLimiter();
      const result = lim.consumeTokens('user-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('rejects when bucket is empty', () => {
      const lim = makeLimiter({ burstSize: 3, tokensPerSecond: 3, tokensPerMinute: 100 });
      lim.consumeTokens('u', 3); // drain
      const result = lim.consumeTokens('u');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('each consumed token decrements remaining', () => {
      const lim = makeLimiter({ burstSize: 5, tokensPerSecond: 5, tokensPerMinute: 100 });
      lim.consumeTokens('u'); // 4 remaining
      lim.consumeTokens('u'); // 3 remaining
      const result = lim.consumeTokens('u'); // 2 remaining
      expect(result.remaining).toBe(2);
    });

    it('consuming more than available tokens is rejected', () => {
      const lim = makeLimiter({ burstSize: 5, tokensPerSecond: 5, tokensPerMinute: 100 });
      lim.consumeTokens('u', 3);
      // Only 2 left, try consuming 3 more
      const result = lim.consumeTokens('u', 3);
      expect(result.allowed).toBe(false);
    });

    it('per-minute cap is enforced', () => {
      const lim = makeLimiter({ tokensPerSecond: 100, tokensPerMinute: 5, burstSize: 100 });
      lim.consumeTokens('u', 5);
      const result = lim.consumeTokens('u', 1);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('tokens are not consumed on rejection', () => {
      const lim = makeLimiter({ burstSize: 3, tokensPerSecond: 3, tokensPerMinute: 100 });
      lim.consumeTokens('u', 3); // drain
      lim.consumeTokens('u'); // rejected — should not change state
      expect(lim.getRemainingTokens('u')).toBe(0);
    });

    it('throws on count <= 0', () => {
      const lim = makeLimiter();
      expect(() => lim.consumeTokens('u', 0)).toThrow();
    });

    it('isolates per-key rate limits', () => {
      const lim = makeLimiter({ burstSize: 2, tokensPerSecond: 2, tokensPerMinute: 100 });
      lim.consumeTokens('a', 2); // drain 'a'
      const b = lim.consumeTokens('b'); // 'b' still full
      expect(b.allowed).toBe(true);
    });

    it('limit field equals burstSize', () => {
      const lim = makeLimiter({ burstSize: 7, tokensPerSecond: 7, tokensPerMinute: 100 });
      const result = lim.consumeTokens('u');
      expect(result.limit).toBe(7);
    });
  });

  // -------------------------------------------------------------------------
  // checkLimit() — non-consuming
  // -------------------------------------------------------------------------

  describe('checkLimit()', () => {
    it('returns allowed without consuming tokens', () => {
      const lim = makeLimiter({ burstSize: 5, tokensPerSecond: 5, tokensPerMinute: 100 });
      lim.checkLimit('u');
      lim.checkLimit('u');
      expect(lim.getRemainingTokens('u')).toBe(5);
    });

    it('new key starts at burstSize remaining', () => {
      const lim = makeLimiter({ burstSize: 8, tokensPerSecond: 8, tokensPerMinute: 100 });
      const result = lim.checkLimit('fresh');
      expect(result.remaining).toBe(8);
    });

    it('reports correct remaining after prior consumption', () => {
      const lim = makeLimiter({ burstSize: 10, tokensPerSecond: 10, tokensPerMinute: 100 });
      lim.consumeTokens('u', 3);
      expect(lim.checkLimit('u').remaining).toBe(7);
    });
  });

  // -------------------------------------------------------------------------
  // getRemainingTokens()
  // -------------------------------------------------------------------------

  describe('getRemainingTokens()', () => {
    it('returns burstSize for never-seen key', () => {
      const lim = makeLimiter({ burstSize: 5, tokensPerSecond: 5, tokensPerMinute: 100 });
      expect(lim.getRemainingTokens('unknown')).toBe(5);
    });

    it('returns floor of remaining tokens', () => {
      const lim = makeLimiter({ burstSize: 3, tokensPerSecond: 3, tokensPerMinute: 100 });
      lim.consumeTokens('u', 2);
      expect(Number.isInteger(lim.getRemainingTokens('u'))).toBe(true);
      expect(lim.getRemainingTokens('u')).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Token refill (fake timers)
  // -------------------------------------------------------------------------

  describe('token refill (time advancement)', () => {
    afterEach(() => vi.useRealTimers());

    it('refills tokens after time passes', () => {
      vi.useFakeTimers();
      const lim = makeLimiter({ tokensPerSecond: 5, burstSize: 5, tokensPerMinute: 1000 });
      lim.consumeTokens('u', 5); // drain

      vi.advanceTimersByTime(1000); // 1 second → +5 tokens
      const result = lim.consumeTokens('u', 1);
      expect(result.allowed).toBe(true);
    });

    it('cannot refill above burstSize', () => {
      vi.useFakeTimers();
      const lim = makeLimiter({ tokensPerSecond: 100, burstSize: 5, tokensPerMinute: 10000 });
      lim.consumeTokens('u', 2);
      vi.advanceTimersByTime(10000); // massive overfill attempt
      expect(lim.getRemainingTokens('u')).toBe(5); // capped at burstSize
    });

    it('minute window resets after 60 seconds', () => {
      vi.useFakeTimers();
      const lim = makeLimiter({ tokensPerSecond: 100, burstSize: 100, tokensPerMinute: 5 });
      lim.consumeTokens('u', 5); // exhaust minute quota
      expect(lim.consumeTokens('u').allowed).toBe(false);

      vi.advanceTimersByTime(61000); // minute window resets
      // consumeTokens drains bucket normally now
      expect(lim.consumeTokens('u').allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // resetKey() / resetAll()
  // -------------------------------------------------------------------------

  describe('resetKey() / resetAll()', () => {
    it('resetKey restores full bucket for that key', () => {
      const lim = makeLimiter({ burstSize: 3, tokensPerSecond: 3, tokensPerMinute: 100 });
      lim.consumeTokens('u', 3);
      lim.resetKey('u');
      expect(lim.getRemainingTokens('u')).toBe(3);
    });

    it('resetKey is a no-op for unknown key', () => {
      const lim = makeLimiter();
      expect(() => lim.resetKey('ghost')).not.toThrow();
    });

    it('resetAll removes all buckets', () => {
      const lim = makeLimiter();
      lim.consumeTokens('a');
      lim.consumeTokens('b');
      lim.resetAll();
      expect(lim.size).toBe(0);
    });

    it('size getter tracks bucket count', () => {
      const lim = makeLimiter();
      expect(lim.size).toBe(0);
      lim.consumeTokens('a');
      lim.consumeTokens('b');
      expect(lim.size).toBe(2);
    });

    it('resetKey decrements size', () => {
      const lim = makeLimiter();
      lim.consumeTokens('x');
      lim.resetKey('x');
      expect(lim.size).toBe(0);
    });
  });
});
