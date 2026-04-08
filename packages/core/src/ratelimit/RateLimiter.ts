/**
 * Token Bucket Rate Limiter
 *
 * Production-grade rate limiting using the token bucket algorithm.
 * Supports per-key rate limiting with configurable refill rates and burst sizes.
 *
 * @version 9.4.0
 * @Sprint Sprint 9: Rate Limiting & Quotas
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for rate limiting behavior.
 */
export interface RateLimitConfig {
  /** Maximum sustained tokens allowed per second */
  tokensPerSecond: number;
  /** Maximum tokens allowed per minute (soft cap for sustained usage) */
  tokensPerMinute: number;
  /** Maximum tokens that can accumulate (burst capacity) */
  burstSize: number;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining tokens after this check */
  remaining: number;
  /** Milliseconds to wait before retrying (0 if allowed) */
  retryAfterMs: number;
  /** The configured limit (burst size) */
  limit: number;
}

// =============================================================================
// INTERNAL BUCKET STATE
// =============================================================================

interface Bucket {
  /** Current number of tokens in the bucket */
  tokens: number;
  /** Timestamp (ms) of the last token refill */
  lastRefillTime: number;
  /** Tokens consumed in the current minute window */
  minuteTokens: number;
  /** Start of the current minute window */
  minuteWindowStart: number;
}

// =============================================================================
// TOKEN BUCKET RATE LIMITER
// =============================================================================

/**
 * Token bucket rate limiter with per-key isolation.
 *
 * The token bucket algorithm works by:
 * 1. Each key has a bucket that starts full (burstSize tokens)
 * 2. Tokens are consumed when requests are made
 * 3. Tokens refill at a steady rate (tokensPerSecond)
 * 4. The bucket never exceeds burstSize tokens
 * 5. A per-minute cap provides an additional layer of protection
 */
export class TokenBucketRateLimiter {
  private readonly config: RateLimitConfig;
  private readonly buckets: Map<string, Bucket> = new Map();

  constructor(config: RateLimitConfig) {
    if (config.tokensPerSecond <= 0) {
      throw new Error('tokensPerSecond must be positive');
    }
    if (config.tokensPerMinute <= 0) {
      throw new Error('tokensPerMinute must be positive');
    }
    if (config.burstSize <= 0) {
      throw new Error('burstSize must be positive');
    }

    this.config = { ...config };
  }

  /**
   * Get the configuration for this rate limiter.
   */
  getConfig(): Readonly<RateLimitConfig> {
    return { ...this.config };
  }

  /**
   * Check if a request is allowed for the given key without consuming tokens.
   */
  checkLimit(key: string): RateLimitResult {
    const bucket = this.getOrCreateBucket(key);
    this.refillBucket(bucket);

    const hasTokens = bucket.tokens >= 1;
    const withinMinuteLimit = bucket.minuteTokens < this.config.tokensPerMinute;
    const allowed = hasTokens && withinMinuteLimit;

    let retryAfterMs = 0;
    if (!allowed) {
      if (!hasTokens) {
        // Calculate time until at least 1 token refills
        const tokensNeeded = 1 - bucket.tokens;
        retryAfterMs = Math.ceil((tokensNeeded / this.config.tokensPerSecond) * 1000);
      } else {
        // Minute limit exceeded - wait until the minute window resets
        const elapsed = Date.now() - bucket.minuteWindowStart;
        retryAfterMs = Math.max(0, 60_000 - elapsed);
      }
    }

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs,
      limit: this.config.burstSize,
    };
  }

  /**
   * Consume tokens for the given key.
   * Returns the rate limit result. If not enough tokens, no tokens are consumed.
   *
   * @param key - The rate limit key (e.g., user ID, API key)
   * @param count - Number of tokens to consume (default: 1)
   */
  consumeTokens(key: string, count: number = 1): RateLimitResult {
    if (count <= 0) {
      throw new Error('Token count must be positive');
    }

    const bucket = this.getOrCreateBucket(key);
    this.refillBucket(bucket);

    const hasTokens = bucket.tokens >= count;
    const withinMinuteLimit = bucket.minuteTokens + count <= this.config.tokensPerMinute;
    const allowed = hasTokens && withinMinuteLimit;

    if (allowed) {
      bucket.tokens -= count;
      bucket.minuteTokens += count;
    }

    let retryAfterMs = 0;
    if (!allowed) {
      if (!hasTokens) {
        const tokensNeeded = count - bucket.tokens;
        retryAfterMs = Math.ceil((tokensNeeded / this.config.tokensPerSecond) * 1000);
      } else {
        const elapsed = Date.now() - bucket.minuteWindowStart;
        retryAfterMs = Math.max(0, 60_000 - elapsed);
      }
    }

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs,
      limit: this.config.burstSize,
    };
  }

  /**
   * Get the remaining tokens for a key without consuming any.
   */
  getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return this.config.burstSize;
    }
    this.refillBucket(bucket);
    return Math.floor(bucket.tokens);
  }

  /**
   * Reset rate limit state for a specific key.
   */
  resetKey(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all rate limit state.
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Get the number of tracked keys.
   */
  get size(): number {
    return this.buckets.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getOrCreateBucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.burstSize,
        lastRefillTime: Date.now(),
        minuteTokens: 0,
        minuteWindowStart: Date.now(),
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: Bucket): void {
    const now = Date.now();

    // Refill tokens based on elapsed time
    const elapsedMs = now - bucket.lastRefillTime;
    if (elapsedMs > 0) {
      const tokensToAdd = (elapsedMs / 1000) * this.config.tokensPerSecond;
      bucket.tokens = Math.min(this.config.burstSize, bucket.tokens + tokensToAdd);
      bucket.lastRefillTime = now;
    }

    // Reset minute window if it has elapsed
    const minuteElapsed = now - bucket.minuteWindowStart;
    if (minuteElapsed >= 60_000) {
      bucket.minuteTokens = 0;
      bucket.minuteWindowStart = now;
    }
  }
}
