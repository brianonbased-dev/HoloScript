/**
 * RateLimiter — Sliding Window Rate Limiting
 *
 * Durable per-key rate limiting for the Brittney Cloud Service.
 * Enforces requests-per-minute and requests-per-hour limits.
 */

import { createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import { logger } from '../utils/logger';
import { JsonFileStore } from './JsonFileStore';

// ============================================================================
// Types
// ============================================================================

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

interface RateLimitState {
  version: 1;
  windows: Record<string, number[]>;
}

interface RateLimiterOptions {
  storePath?: string;
  now?: () => number;
}

// ============================================================================
// RateLimiter
// ============================================================================

export class RateLimiter {
  private readonly store: JsonFileStore<RateLimitState>;
  private readonly config: RateLimitConfig;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;
  private readonly now: () => number;

  constructor(config?: Partial<RateLimitConfig>, options: RateLimiterOptions = {}) {
    this.config = {
      requestsPerMinute: parseLimit(process.env.RATE_LIMIT_RPM, 60),
      requestsPerHour: parseLimit(process.env.RATE_LIMIT_RPH, 500),
      ...config,
    };
    this.now = options.now ?? Date.now;
    this.store = new JsonFileStore(
      options.storePath ?? process.env.RATE_LIMIT_STORE_PATH ?? join(process.cwd(), '.holoscript-llm', 'rate-limits', 'windows.json'),
      () => ({ version: 1, windows: {} }),
      { now: this.now }
    );

    // Clean expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      void this.cleanup().catch((error) => logger.warn('[RateLimiter] Cleanup failed:', error));
    }, 5 * 60 * 1000);
    this.cleanupInterval.unref?.();
  }

  /**
   * Check if a request is allowed. Returns null if allowed, or an error object if limited.
   */
  async check(key: string): Promise<{ limited: boolean; retryAfterSeconds: number; message: string } | null> {
    const bucket = hashKey(key || 'anonymous');
    return this.store.update((state) => {
      const now = this.now();
      const timestamps = (state.windows[bucket] ?? []).filter((t) => now - t < 3600_000);

      const oneMinuteAgo = now - 60_000;
      const minuteTimestamps = timestamps.filter((t) => t >= oneMinuteAgo).sort((a, b) => a - b);
      const hourTimestamps = timestamps.sort((a, b) => a - b);

      if (minuteTimestamps.length >= this.config.requestsPerMinute) {
        state.windows[bucket] = timestamps;
        const retryAfter = Math.ceil(((minuteTimestamps[0] ?? now) + 60_000 - now) / 1000);
        return {
          limited: true,
          retryAfterSeconds: Math.max(1, retryAfter),
          message: `Rate limit exceeded: ${this.config.requestsPerMinute} requests per minute`,
        };
      }

      if (hourTimestamps.length >= this.config.requestsPerHour) {
        state.windows[bucket] = timestamps;
        const retryAfter = Math.ceil(((hourTimestamps[0] ?? now) + 3600_000 - now) / 1000);
        return {
          limited: true,
          retryAfterSeconds: Math.max(1, retryAfter),
          message: `Rate limit exceeded: ${this.config.requestsPerHour} requests per hour`,
        };
      }

      timestamps.push(now);
      state.windows[bucket] = timestamps;
      return null;
    });
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = (req as any).rateLimitKey || (req as any).apiKey || req.ip || 'anonymous';
      const result = await this.check(key);

      if (result) {
        logger.warn(`[RateLimiter] Key ${key} rate limited: ${result.message}`);
        res.set('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({
          error: 'Too Many Requests',
          message: result.message,
          retryAfterSeconds: result.retryAfterSeconds,
        });
        return;
      }

      next();
    };
  }

  private async cleanup(): Promise<void> {
    await this.store.update((state) => {
      const now = this.now();
      for (const [key, timestamps] of Object.entries(state.windows)) {
        const fresh = timestamps.filter((t) => now - t < 3600_000);
        if (fresh.length === 0) {
          delete state.windows[key];
        } else {
          state.windows[key] = fresh;
        }
      }
    });
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }

  async getStats(): Promise<{ keys: number; config: RateLimitConfig; store: 'file' }> {
    const state = await this.store.read();
    return { keys: Object.keys(state.windows).length, config: this.config, store: 'file' };
  }
}

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
