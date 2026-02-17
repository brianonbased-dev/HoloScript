/**
 * Token-bucket rate limiter for external API-based asset generation.
 *
 * Prevents runaway costs when many traits trigger text-to-3D or
 * text-to-texture calls in the same scene. Callers `await acquire()`
 * before making an API call; the limiter holds them until a token
 * is available.
 *
 * Usage:
 * ```ts
 * const limiter = new RateLimiter({ tokensPerSecond: 2, burstSize: 5 });
 * await limiter.acquire();            // blocks if budget exhausted
 * const result = await api.generate(prompt);
 * ```
 */

export interface RateLimiterConfig {
  /**
   * How many API calls are allowed per second on a sustained basis.
   * Defaults to 1.
   */
  tokensPerSecond?: number;
  /**
   * Maximum number of tokens that can accumulate (burst budget).
   * Defaults to `tokensPerSecond * 5`.
   */
  burstSize?: number;
  /**
   * Hard cap on total calls regardless of token availability.
   * Once reached, further `acquire()` calls reject immediately.
   * Defaults to Infinity (no cap).
   */
  maxCallsTotal?: number;
}

export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

export class RateLimiter {
  private tokensPerMs: number;
  private tokens: number;
  private burstSize: number;
  private maxCallsTotal: number;
  private totalCalls = 0;
  private lastRefillAt: number;

  constructor(config: RateLimiterConfig = {}) {
    const tps = config.tokensPerSecond ?? 1;
    this.tokensPerMs = tps / 1000;
    this.burstSize = config.burstSize ?? tps * 5;
    this.maxCallsTotal = config.maxCallsTotal ?? Infinity;
    this.tokens = this.burstSize; // start with a full bucket
    this.lastRefillAt = Date.now();
  }

  /** Current available tokens (refills up to burstSize). */
  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /** Total calls made so far. */
  get callCount(): number {
    return this.totalCalls;
  }

  /**
   * Acquire a token, waiting if necessary.
   *
   * @param timeoutMs Maximum wait time before throwing `RateLimitExceededError`.
   *                  Defaults to 30 000 ms.
   */
  async acquire(timeoutMs = 30_000): Promise<void> {
    if (this.totalCalls >= this.maxCallsTotal) {
      throw new RateLimitExceededError(
        `Rate limiter: hard cap of ${this.maxCallsTotal} total calls reached`
      );
    }

    const deadline = Date.now() + timeoutMs;

    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.totalCalls += 1;
        return;
      }

      const waitMs = (1 - this.tokens) / this.tokensPerMs;
      if (Date.now() + waitMs > deadline) {
        throw new RateLimitExceededError(
          `Rate limiter: timed out waiting for a token after ${timeoutMs}ms`
        );
      }

      await sleep(Math.min(waitMs, 100));
    }
  }

  /**
   * Non-blocking check — returns true if a token is immediately available,
   * false otherwise. Does NOT consume a token.
   */
  canAcquireNow(): boolean {
    this.refill();
    return this.tokens >= 1;
  }

  /** Reset all state (useful for tests). */
  reset(): void {
    this.tokens = this.burstSize;
    this.totalCalls = 0;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillAt;
    const added = elapsed * this.tokensPerMs;
    this.tokens = Math.min(this.burstSize, this.tokens + added);
    this.lastRefillAt = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
