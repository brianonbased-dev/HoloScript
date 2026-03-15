/**
 * RateLimiterTrait — v5.1
 *
 * Token bucket and sliding window rate limiting for HoloScript compositions.
 * Guards actions from exceeding configured request limits. Supports per-key
 * limits for multi-tenant or multi-action scenarios.
 *
 * Events:
 *  rate_limiter:allowed     { key, remaining, resetAt }
 *  rate_limiter:rejected    { key, retryAfterMs, limit }
 *  rate_limiter:execute     (command) Check rate limit and forward action
 *  rate_limiter:get_status  (command) Get current bucket state
 *  rate_limiter:reset       (command) Reset a specific key or all keys
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type RateLimitStrategy = 'token_bucket' | 'sliding_window';

export interface RateLimiterConfig {
  /** Rate limit strategy */
  strategy: RateLimitStrategy;
  /** Maximum requests allowed per window */
  max_requests: number;
  /** Window duration in ms (for sliding_window) or refill interval (for token_bucket) */
  window_ms: number;
  /** Token bucket: tokens added per refill */
  refill_rate: number;
  /** Token bucket: max tokens the bucket can hold */
  max_tokens: number;
  /** Default key for rate limiting */
  default_key: string;
}

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

interface SlidingWindowEntry {
  timestamps: number[];
}

export interface RateLimiterState {
  buckets: Map<string, TokenBucket>;
  windows: Map<string, SlidingWindowEntry>;
  totalAllowed: number;
  totalRejected: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const rateLimiterHandler: TraitHandler<RateLimiterConfig> = {
  name: 'rate_limiter',

  defaultConfig: {
    strategy: 'token_bucket',
    max_requests: 100,
    window_ms: 60000,
    refill_rate: 10,
    max_tokens: 100,
    default_key: 'default',
  },

  onAttach(node: any, _config: RateLimiterConfig, _context: any): void {
    const state: RateLimiterState = {
      buckets: new Map(),
      windows: new Map(),
      totalAllowed: 0,
      totalRejected: 0,
    };
    node.__rateLimiterState = state;
  },

  onDetach(node: any, _config: RateLimiterConfig, _context: any): void {
    delete node.__rateLimiterState;
  },

  onUpdate(node: any, config: RateLimiterConfig, _context: any, _delta: number): void {
    const state: RateLimiterState | undefined = node.__rateLimiterState;
    if (!state) return;

    if (config.strategy === 'token_bucket') {
      // Refill token buckets
      const now = Date.now();
      for (const [, bucket] of state.buckets) {
        const elapsed = now - bucket.lastRefillAt;
        const refills = Math.floor(elapsed / config.window_ms);
        if (refills > 0) {
          bucket.tokens = Math.min(config.max_tokens, bucket.tokens + refills * config.refill_rate);
          bucket.lastRefillAt = now;
        }
      }
    } else {
      // Prune old sliding window entries
      const cutoff = Date.now() - config.window_ms;
      for (const [, entry] of state.windows) {
        entry.timestamps = entry.timestamps.filter(t => t >= cutoff);
      }
    }
  },

  onEvent(node: any, config: RateLimiterConfig, context: any, event: any): void {
    const state: RateLimiterState | undefined = node.__rateLimiterState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      case 'rate_limiter:execute': {
        const action = payload.action as string;
        const key = (payload.key as string) ?? config.default_key;
        if (!action) break;

        const result = config.strategy === 'token_bucket'
          ? checkTokenBucket(state, config, key)
          : checkSlidingWindow(state, config, key);

        if (result.allowed) {
          state.totalAllowed++;
          context.emit?.('rate_limiter:allowed', {
            key,
            remaining: result.remaining,
            resetAt: result.resetAt,
          });
          // Forward the action
          context.emit?.(action, {
            ...payload.params,
            __rateLimitKey: key,
          });
        } else {
          state.totalRejected++;
          context.emit?.('rate_limiter:rejected', {
            key,
            retryAfterMs: result.retryAfterMs,
            limit: config.max_requests,
          });
        }
        break;
      }

      case 'rate_limiter:reset': {
        const key = payload.key as string;
        if (key) {
          state.buckets.delete(key);
          state.windows.delete(key);
        } else {
          state.buckets.clear();
          state.windows.clear();
        }
        break;
      }

      case 'rate_limiter:get_status': {
        const key = (payload.key as string) ?? config.default_key;
        let remaining = 0;
        if (config.strategy === 'token_bucket') {
          const bucket = state.buckets.get(key);
          remaining = bucket?.tokens ?? config.max_tokens;
        } else {
          const entry = state.windows.get(key);
          remaining = config.max_requests - (entry?.timestamps.length ?? 0);
        }
        context.emit?.('rate_limiter:status', {
          key,
          strategy: config.strategy,
          remaining,
          totalAllowed: state.totalAllowed,
          totalRejected: state.totalRejected,
        });
        break;
      }
    }
  },
};

function checkTokenBucket(
  state: RateLimiterState,
  config: RateLimiterConfig,
  key: string,
): { allowed: boolean; remaining: number; resetAt: number; retryAfterMs: number } {
  let bucket = state.buckets.get(key);
  if (!bucket) {
    bucket = { tokens: config.max_tokens, lastRefillAt: Date.now() };
    state.buckets.set(key, bucket);
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: bucket.tokens,
      resetAt: bucket.lastRefillAt + config.window_ms,
      retryAfterMs: 0,
    };
  }

  const nextRefill = bucket.lastRefillAt + config.window_ms;
  return {
    allowed: false,
    remaining: 0,
    resetAt: nextRefill,
    retryAfterMs: Math.max(0, nextRefill - Date.now()),
  };
}

function checkSlidingWindow(
  state: RateLimiterState,
  config: RateLimiterConfig,
  key: string,
): { allowed: boolean; remaining: number; resetAt: number; retryAfterMs: number } {
  let entry = state.windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    state.windows.set(key, entry);
  }

  const now = Date.now();
  const cutoff = now - config.window_ms;
  entry.timestamps = entry.timestamps.filter(t => t >= cutoff);

  if (entry.timestamps.length < config.max_requests) {
    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: config.max_requests - entry.timestamps.length,
      resetAt: (entry.timestamps[0] ?? now) + config.window_ms,
      retryAfterMs: 0,
    };
  }

  const oldestInWindow = entry.timestamps[0] ?? now;
  const retryAfterMs = Math.max(0, oldestInWindow + config.window_ms - now);
  return {
    allowed: false,
    remaining: 0,
    resetAt: oldestInWindow + config.window_ms,
    retryAfterMs,
  };
}

export default rateLimiterHandler;
