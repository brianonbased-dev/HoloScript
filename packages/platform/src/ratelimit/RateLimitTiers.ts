/**
 * Rate Limit & Quota Tier Definitions
 *
 * Predefined tier configurations for free, pro, and enterprise users.
 *
 * @version 9.4.0
 * @Sprint Sprint 9: Rate Limiting & Quotas
 */

import type { RateLimitConfig } from './RateLimiter';
import type { QuotaConfig } from './QuotaManager';

// =============================================================================
// TIER NAMES
// =============================================================================

/**
 * Supported tier names.
 */
export type TierName = 'free' | 'pro' | 'enterprise';

// =============================================================================
// RATE LIMIT TIERS
// =============================================================================

/**
 * Predefined rate limit configurations by tier.
 *
 * - free: Light usage, suitable for evaluation and small projects
 * - pro: Production usage for individual developers and small teams
 * - enterprise: High-throughput usage for large teams and CI/CD pipelines
 */
export const RATE_LIMIT_TIERS: Record<TierName, RateLimitConfig> = {
  free: {
    tokensPerSecond: 2,
    tokensPerMinute: 10,
    burstSize: 5,
  },
  pro: {
    tokensPerSecond: 20,
    tokensPerMinute: 100,
    burstSize: 50,
  },
  enterprise: {
    tokensPerSecond: 200,
    tokensPerMinute: 1000,
    burstSize: 500,
  },
};

// =============================================================================
// QUOTA TIERS
// =============================================================================

/**
 * Predefined quota configurations by tier.
 *
 * A value of -1 means unlimited.
 *
 * - free: Conservative limits for evaluation
 * - pro: Generous limits for production use
 * - enterprise: Unlimited (all limits set to -1)
 */
export const QUOTA_TIERS: Record<TierName, QuotaConfig> = {
  free: {
    daily: {
      parseOperations: 100,
      compileOperations: 50,
      generateOperations: 30,
    },
    monthly: {
      totalBytes: 100_000_000, // 100 MB
      apiCalls: 3_000,
    },
  },
  pro: {
    daily: {
      parseOperations: 10_000,
      compileOperations: 5_000,
      generateOperations: 3_000,
    },
    monthly: {
      totalBytes: 10_000_000_000, // 10 GB
      apiCalls: 300_000,
    },
  },
  enterprise: {
    daily: {
      parseOperations: -1,
      compileOperations: -1,
      generateOperations: -1,
    },
    monthly: {
      totalBytes: -1,
      apiCalls: -1,
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the rate limit configuration for a tier.
 */
export function getRateLimitConfig(tier: TierName): RateLimitConfig {
  const config = RATE_LIMIT_TIERS[tier];
  if (!config) {
    throw new Error(`Unknown tier: ${tier}`);
  }
  return { ...config };
}

/**
 * Get the quota configuration for a tier.
 */
export function getQuotaConfig(tier: TierName): QuotaConfig {
  const config = QUOTA_TIERS[tier];
  if (!config) {
    throw new Error(`Unknown tier: ${tier}`);
  }
  return structuredClone(config);
}
