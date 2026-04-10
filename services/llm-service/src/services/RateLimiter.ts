/**
 * RateLimiter — Sliding Window Rate Limiting
 *
 * In-memory per-key rate limiting for the Brittney Cloud Service.
 * Enforces requests-per-minute and requests-per-hour limits.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

interface WindowEntry {
  timestamps: number[];
}

// ============================================================================
// RateLimiter
// ============================================================================

export class RateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      requestsPerMinute: parseInt(process.env.RATE_LIMIT_RPM || '60', 10),
      requestsPerHour: parseInt(process.env.RATE_LIMIT_RPH || '500', 10),
      ...config,
    };

    // Clean expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a request is allowed. Returns null if allowed, or an error object if limited.
   */
  check(key: string): { limited: boolean; retryAfterSeconds: number; message: string } | null {
    const now = Date.now();
    const entry = this.getOrCreate(key);

    // Prune timestamps older than 1 hour
    entry.timestamps = entry.timestamps.filter(t => now - t < 3600_000);

    const oneMinuteAgo = now - 60_000;
    const recentMinute = entry.timestamps.filter(t => t >= oneMinuteAgo).length;
    const recentHour = entry.timestamps.length;

    // Check per-minute limit
    if (recentMinute >= this.config.requestsPerMinute) {
      const oldestInMinute = entry.timestamps.filter(t => t >= oneMinuteAgo).sort()[0];
      const retryAfter = Math.ceil((oldestInMinute + 60_000 - now) / 1000);
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, retryAfter),
        message: `Rate limit exceeded: ${this.config.requestsPerMinute} requests per minute`,
      };
    }

    // Check per-hour limit
    if (recentHour >= this.config.requestsPerHour) {
      const oldestInHour = entry.timestamps.sort()[0];
      const retryAfter = Math.ceil((oldestInHour + 3600_000 - now) / 1000);
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, retryAfter),
        message: `Rate limit exceeded: ${this.config.requestsPerHour} requests per hour`,
      };
    }

    // Record this request
    entry.timestamps.push(now);
    return null;
  }

  /**
   * Express middleware
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = (req as any).apiKey || req.ip || 'anonymous';
      const result = this.check(key);

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

  private getOrCreate(key: string): WindowEntry {
    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }
    return entry;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter(t => now - t < 3600_000);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.windows.clear();
  }

  getStats(): { keys: number; config: RateLimitConfig } {
    return { keys: this.windows.size, config: this.config };
  }
}
