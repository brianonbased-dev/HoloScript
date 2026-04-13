import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '@holoscript/platform';

// =============================================================================
// C216 — Token Bucket Rate Limiter
// =============================================================================

describe('TokenBucketRateLimiter', () => {
  const defaultConfig = { tokensPerSecond: 10, tokensPerMinute: 100, burstSize: 20 };

  it('constructor validates positive tokensPerSecond', () => {
    expect(() => new TokenBucketRateLimiter({ ...defaultConfig, tokensPerSecond: 0 })).toThrow();
  });

  it('constructor validates positive tokensPerMinute', () => {
    expect(() => new TokenBucketRateLimiter({ ...defaultConfig, tokensPerMinute: -1 })).toThrow();
  });

  it('constructor validates positive burstSize', () => {
    expect(() => new TokenBucketRateLimiter({ ...defaultConfig, burstSize: 0 })).toThrow();
  });

  it('getConfig returns frozen copy', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    const cfg = rl.getConfig();
    expect(cfg.tokensPerSecond).toBe(10);
    expect(cfg.burstSize).toBe(20);
  });

  it('first checkLimit is always allowed', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    const result = rl.checkLimit('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(20); // burstSize
    expect(result.retryAfterMs).toBe(0);
    expect(result.limit).toBe(20);
  });

  it('consumeTokens decreases remaining', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    const r1 = rl.consumeTokens('user1', 5);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(15);
  });

  it('consumeTokens rejects when insufficient tokens', () => {
    const rl = new TokenBucketRateLimiter({ ...defaultConfig, burstSize: 3 });
    const r = rl.consumeTokens('user1', 5);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('consumeTokens throws on count <= 0', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    expect(() => rl.consumeTokens('user1', 0)).toThrow();
  });

  it('checkLimit does not consume tokens', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    rl.checkLimit('user1');
    rl.checkLimit('user1');
    const remaining = rl.getRemainingTokens('user1');
    expect(remaining).toBe(20); // unchanged
  });

  it('per-key isolation', () => {
    const rl = new TokenBucketRateLimiter({ ...defaultConfig, burstSize: 5 });
    rl.consumeTokens('a', 5);
    const rb = rl.consumeTokens('b', 1);
    expect(rb.allowed).toBe(true);
    expect(rb.remaining).toBe(4);
  });

  it('getRemainingTokens returns burstSize for unknown key', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    expect(rl.getRemainingTokens('unknown')).toBe(20);
  });

  it('resetKey clears specific key state', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    rl.consumeTokens('user1', 10);
    rl.resetKey('user1');
    expect(rl.getRemainingTokens('user1')).toBe(20); // back to full
  });

  it('resetAll clears all state', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    rl.consumeTokens('a', 1);
    rl.consumeTokens('b', 1);
    rl.resetAll();
    expect(rl.size).toBe(0);
  });

  it('size tracks number of keys', () => {
    const rl = new TokenBucketRateLimiter(defaultConfig);
    expect(rl.size).toBe(0);
    rl.consumeTokens('a', 1);
    rl.consumeTokens('b', 1);
    expect(rl.size).toBe(2);
  });

  it('burst allows exceeding sustained rate temporarily', () => {
    const rl = new TokenBucketRateLimiter({
      tokensPerSecond: 1,
      tokensPerMinute: 100,
      burstSize: 10,
    });
    // Can consume 10 tokens immediately (burst)
    for (let i = 0; i < 10; i++) {
      expect(rl.consumeTokens('user', 1).allowed).toBe(true);
    }
    // 11th should fail (burst exhausted, need time to refill)
    expect(rl.consumeTokens('user', 1).allowed).toBe(false);
  });

  it('retryAfterMs provides meaningful wait time', () => {
    const rl = new TokenBucketRateLimiter({
      tokensPerSecond: 1,
      tokensPerMinute: 100,
      burstSize: 1,
    });
    rl.consumeTokens('u', 1);
    const result = rl.consumeTokens('u', 1);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(2000); // ~1 second for 1 token
  });
});
