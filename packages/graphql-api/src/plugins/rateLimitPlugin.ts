/**
 * Rate Limiting Plugin
 * Week 4: Protects API from abuse with per-client rate limits
 */

import { ApolloServerPlugin, GraphQLRequestListener, BaseContext } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { _createComplexityLimitRule, _getGraphQLRateLimiter } from 'graphql-rate-limit';
import type { GraphQLResolveInfo } from 'graphql';

export interface RateLimitPluginOptions {
  /**
   * Global rate limit: requests per window
   * Default: 1000 requests per 15 minutes
   */
  max?: number;

  /**
   * Time window in milliseconds
   * Default: 15 minutes (900000ms)
   */
  window?: number;

  /**
   * Per-operation limits (overrides global limit)
   * Example: { compile: { max: 100, window: 60000 } }
   */
  perOperationLimits?: Record<string, { max: number; window: number }>;

  /**
   * Whether to include rate limit info in response headers
   * Default: true
   */
  includeHeaders?: boolean;

  /**
   * Custom identifier function (defaults to IP address)
   */
  identifierFn?: (req: any) => string;
}

interface RateLimitStore {
  requests: Map<string, { count: number; resetAt: number }>;
}

const DEFAULT_MAX = 1000;
const DEFAULT_WINDOW = 15 * 60 * 1000; // 15 minutes

/**
 * In-memory rate limit store
 * For production, use Redis for distributed rate limiting
 */
class RateLimiter {
  private store: RateLimitStore = { requests: new Map() };
  private readonly max: number;
  private readonly window: number;
  private readonly perOperationLimits: Map<string, { max: number; window: number }>;

  constructor(options: RateLimitPluginOptions = {}) {
    this.max = options.max ?? DEFAULT_MAX;
    this.window = options.window ?? DEFAULT_WINDOW;
    this.perOperationLimits = new Map(Object.entries(options.perOperationLimits || {}));

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.store.requests.entries()) {
      if (now > value.resetAt) {
        this.store.requests.delete(key);
      }
    }
  }

  check(
    identifier: string,
    operationName?: string
  ): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    limit: number;
  } {
    const now = Date.now();
    const key = `${identifier}:${operationName || 'global'}`;

    // Get operation-specific limit or use global
    const opLimit = operationName ? this.perOperationLimits.get(operationName) : null;
    const max = opLimit?.max ?? this.max;
    const window = opLimit?.window ?? this.window;

    let entry = this.store.requests.get(key);

    // Create or reset entry if expired
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + window,
      };
      this.store.requests.set(key, entry);
    }

    // Check limit
    entry.count++;
    const allowed = entry.count <= max;
    const remaining = Math.max(0, max - entry.count);

    return {
      allowed,
      remaining,
      resetAt: entry.resetAt,
      limit: max,
    };
  }

  getStats() {
    return {
      totalClients: this.store.requests.size,
      activeRequests: Array.from(this.store.requests.values()).reduce(
        (sum, entry) => sum + entry.count,
        0
      ),
    };
  }
}

/**
 * Creates an Apollo Server plugin for rate limiting
 *
 * Rate limits by operation:
 * - Global: 1000 requests per 15 minutes
 * - compile: 100 requests per minute (expensive)
 * - batchCompile: 50 requests per minute (very expensive)
 * - validateCode: 200 requests per minute (moderate)
 * - Queries: Use global limit (cheap)
 * - Subscriptions: 10 connections per client (long-lived)
 */
export function createRateLimitPlugin(
  options: RateLimitPluginOptions = {}
): ApolloServerPlugin<BaseContext> {
  const limiter = new RateLimiter(options);
  const includeHeaders = options.includeHeaders ?? true;
  const identifierFn =
    options.identifierFn ??
    ((req: any) => {
      // Try to get IP from various headers (X-Forwarded-For, X-Real-IP, etc.)
      const forwarded = req.headers?.['x-forwarded-for'];
      if (forwarded) {
        return forwarded.split(',')[0].trim();
      }
      return req.ip || req.connection?.remoteAddress || 'unknown';
    });

  // Rate limit stats available via limiter.getStats()

  return {
    async requestDidStart(requestContext): Promise<GraphQLRequestListener<BaseContext>> {
      const identifier = identifierFn(requestContext.request.http);
      let operationName: string | undefined;
      let rateLimitResult: ReturnType<typeof limiter.check> | undefined;

      return {
        async didResolveOperation({ request }) {
          operationName = request.operationName;

          // Check rate limit
          rateLimitResult = limiter.check(identifier, operationName);

          if (!rateLimitResult.allowed) {
            const resetDate = new Date(rateLimitResult.resetAt);
            const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);

            throw new GraphQLError(
              `Rate limit exceeded for operation "${operationName || 'unknown'}". Try again in ${retryAfter} seconds.`,
              {
                extensions: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  limit: rateLimitResult.limit,
                  remaining: rateLimitResult.remaining,
                  resetAt: resetDate.toISOString(),
                  retryAfter,
                },
              }
            );
          }

          // Log warning when approaching limit
          if (rateLimitResult.remaining < rateLimitResult.limit * 0.1) {
            console.warn(
              `[Rate Limit Warning] Client ${identifier} has ${rateLimitResult.remaining}/${rateLimitResult.limit} requests remaining for ${operationName || 'global'}`
            );
          }
        },

        async willSendResponse({ response }) {
          // Add rate limit headers
          if (includeHeaders && rateLimitResult && response.http) {
            response.http.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
            response.http.headers.set(
              'X-RateLimit-Remaining',
              rateLimitResult.remaining.toString()
            );
            response.http.headers.set(
              'X-RateLimit-Reset',
              new Date(rateLimitResult.resetAt).toISOString()
            );

            if (!rateLimitResult.allowed) {
              const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
              response.http.headers.set('Retry-After', retryAfter.toString());
            }
          }
        },
      };
    },
  };
}

/**
 * Per-operation rate limit configuration
 */
export const OPERATION_RATE_LIMITS = {
  // Mutations (expensive)
  compile: { max: 100, window: 60 * 1000 }, // 100 per minute
  batchCompile: { max: 50, window: 60 * 1000 }, // 50 per minute
  validateCode: { max: 200, window: 60 * 1000 }, // 200 per minute

  // Queries (cheap, use global limit)
  parseHoloScript: { max: 500, window: 60 * 1000 }, // 500 per minute
  listTargets: { max: 1000, window: 60 * 1000 }, // 1000 per minute
  getTargetInfo: { max: 1000, window: 60 * 1000 }, // 1000 per minute
} as const;
