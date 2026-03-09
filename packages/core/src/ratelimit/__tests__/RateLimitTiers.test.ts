import { describe, it, expect } from 'vitest';
import {
  RATE_LIMIT_TIERS,
  QUOTA_TIERS,
  getRateLimitConfig,
  getQuotaConfig,
  type TierName,
} from '../RateLimitTiers';

describe('RateLimitTiers', () => {
  // RATE_LIMIT_TIERS
  it('has free, pro, enterprise tiers', () => {
    for (const t of ['free', 'pro', 'enterprise'] as TierName[]) {
      expect(RATE_LIMIT_TIERS[t]).toBeDefined();
    }
  });

  it('tiers have increasing limits', () => {
    expect(RATE_LIMIT_TIERS.pro.tokensPerSecond).toBeGreaterThan(
      RATE_LIMIT_TIERS.free.tokensPerSecond
    );
    expect(RATE_LIMIT_TIERS.enterprise.tokensPerSecond).toBeGreaterThan(
      RATE_LIMIT_TIERS.pro.tokensPerSecond
    );
  });

  it('all rate limit configs have positive values', () => {
    for (const tier of Object.values(RATE_LIMIT_TIERS)) {
      expect(tier.tokensPerSecond).toBeGreaterThan(0);
      expect(tier.tokensPerMinute).toBeGreaterThan(0);
      expect(tier.burstSize).toBeGreaterThan(0);
    }
  });

  // QUOTA_TIERS
  it('quota tiers have correct structure', () => {
    for (const t of ['free', 'pro', 'enterprise'] as TierName[]) {
      const q = QUOTA_TIERS[t];
      expect(q.daily).toBeDefined();
      expect(q.monthly).toBeDefined();
    }
  });

  it('enterprise quotas are unlimited (-1)', () => {
    const e = QUOTA_TIERS.enterprise;
    expect(e.daily.parseOperations).toBe(-1);
    expect(e.monthly.totalBytes).toBe(-1);
    expect(e.monthly.apiCalls).toBe(-1);
  });

  it('free quotas are more restrictive than pro', () => {
    expect(QUOTA_TIERS.free.daily.parseOperations).toBeLessThan(
      QUOTA_TIERS.pro.daily.parseOperations
    );
    expect(QUOTA_TIERS.free.monthly.apiCalls).toBeLessThan(QUOTA_TIERS.pro.monthly.apiCalls);
  });

  // getRateLimitConfig
  it('getRateLimitConfig returns copy', () => {
    const config = getRateLimitConfig('free');
    expect(config.tokensPerSecond).toBe(RATE_LIMIT_TIERS.free.tokensPerSecond);
    config.tokensPerSecond = 999;
    expect(RATE_LIMIT_TIERS.free.tokensPerSecond).not.toBe(999);
  });

  it('getRateLimitConfig throws on unknown tier', () => {
    expect(() => getRateLimitConfig('gold' as TierName)).toThrow();
  });

  // getQuotaConfig
  it('getQuotaConfig returns deep copy', () => {
    const config = getQuotaConfig('pro');
    expect(config.daily.parseOperations).toBe(QUOTA_TIERS.pro.daily.parseOperations);
    config.daily.parseOperations = 0;
    expect(QUOTA_TIERS.pro.daily.parseOperations).not.toBe(0);
  });

  it('getQuotaConfig throws on unknown tier', () => {
    expect(() => getQuotaConfig('gold' as TierName)).toThrow();
  });
});
