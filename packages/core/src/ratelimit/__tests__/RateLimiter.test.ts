import { describe, it, expect } from 'vitest';
import { TokenBucketRateLimiter } from '../RateLimiter';

function makeLimiter() {
  return new TokenBucketRateLimiter({
    tokensPerSecond: 10,
    tokensPerMinute: 100,
    burstSize: 20,
  });
}

describe('TokenBucketRateLimiter', () => {
  it('constructor rejects invalid configs', () => {
    expect(
      () => new TokenBucketRateLimiter({ tokensPerSecond: 0, tokensPerMinute: 10, burstSize: 5 })
    ).toThrow();
    expect(
      () => new TokenBucketRateLimiter({ tokensPerSecond: 10, tokensPerMinute: 0, burstSize: 5 })
    ).toThrow();
    expect(
      () => new TokenBucketRateLimiter({ tokensPerSecond: 10, tokensPerMinute: 10, burstSize: 0 })
    ).toThrow();
  });

  it('getConfig returns config copy', () => {
    const rl = makeLimiter();
    const c = rl.getConfig();
    expect(c.tokensPerSecond).toBe(10);
    expect(c.burstSize).toBe(20);
  });

  it('new key starts with full burst', () => {
    const rl = makeLimiter();
    expect(rl.getRemainingTokens('user1')).toBe(20);
  });

  it('consumeTokens reduces remaining', () => {
    const rl = makeLimiter();
    const result = rl.consumeTokens('user1', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(15);
    expect(result.limit).toBe(20);
  });

  it('consumeTokens rejects when insufficient tokens', () => {
    const rl = makeLimiter();
    rl.consumeTokens('user1', 20); // exhaust
    const result = rl.consumeTokens('user1', 1);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('consumeTokens rejects negative count', () => {
    const rl = makeLimiter();
    expect(() => rl.consumeTokens('user1', -1)).toThrow();
  });

  it('checkLimit does not consume tokens', () => {
    const rl = makeLimiter();
    const before = rl.getRemainingTokens('user1');
    const result = rl.checkLimit('user1');
    expect(result.allowed).toBe(true);
    expect(rl.getRemainingTokens('user1')).toBe(before);
  });

  it('per-key isolation', () => {
    const rl = makeLimiter();
    rl.consumeTokens('A', 20);
    const resultB = rl.consumeTokens('B', 1);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(19);
  });

  it('resetKey clears specific key', () => {
    const rl = makeLimiter();
    rl.consumeTokens('user1', 20);
    rl.resetKey('user1');
    expect(rl.getRemainingTokens('user1')).toBe(20);
  });

  it('resetAll clears all keys', () => {
    const rl = makeLimiter();
    rl.consumeTokens('A', 5);
    rl.consumeTokens('B', 5);
    rl.resetAll();
    expect(rl.size).toBe(0);
  });

  it('size tracks key count', () => {
    const rl = makeLimiter();
    expect(rl.size).toBe(0);
    rl.consumeTokens('A', 1);
    rl.consumeTokens('B', 1);
    expect(rl.size).toBe(2);
  });

  it('consumeTokens with count > 1 works', () => {
    const rl = makeLimiter();
    const result = rl.consumeTokens('user1', 15);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});
