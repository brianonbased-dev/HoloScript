/**
 * Response Caching Plugin
 * Week 3: Caches frequently accessed query results
 */

import { ApolloServerPlugin, GraphQLRequestListener, BaseContext } from '@apollo/server';
import type { GraphQLRequest } from '@apollo/server';
import { createHash } from 'crypto';

/** Extended request type carrying cached result through the plugin pipeline. */
interface CacheableRequest extends GraphQLRequest {
  __cachedResult?: Record<string, unknown>;
}

export interface CachePluginOptions {
  /**
   * Cache TTL in milliseconds
   * Default: 5 minutes (300000ms)
   */
  ttl?: number;

  /**
   * Maximum cache size (number of entries)
   * Default: 1000
   */
  maxSize?: number;

  /**
   * Operations to cache (by operation name)
   * Default: ['listTargets', 'getTargetInfo', 'parseHoloScript']
   */
  cacheableOperations?: string[];

  /**
   * Whether to include cache status in response extensions
   * Default: true in development
   */
  includeCacheStatusInExtensions?: boolean;
}

interface CacheEntry {
  result: Record<string, unknown>;
  timestamp: number;
  hits: number;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_CACHEABLE_OPERATIONS = ['listTargets', 'getTargetInfo', 'parseHoloScript'];

/**
 * In-memory LRU cache for GraphQL responses
 * For production, replace with Redis or Memcached
 */
class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(maxSize: number, ttl: number) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  private generateKey(
    operationName: string | undefined,
    variables: Record<string, unknown> | null
  ): string {
    const key = `${operationName || 'unknown'}:${JSON.stringify(variables || {})}`;
    return createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  get(
    operationName: string | undefined,
    variables: Record<string, unknown> | null
  ): CacheEntry['result'] | null {
    const key = this.generateKey(operationName, variables);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Increment hit counter
    entry.hits++;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.result;
  }

  set(
    operationName: string | undefined,
    variables: Record<string, unknown> | null,
    result: Record<string, unknown>
  ): void {
    const key = this.generateKey(operationName, variables);

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    const entries = Array.from(this.cache.values());
    return {
      size: this.cache.size,
      totalHits: entries.reduce((sum, entry) => sum + entry.hits, 0),
      averageAge:
        entries.length > 0
          ? entries.reduce((sum, entry) => sum + (Date.now() - entry.timestamp), 0) / entries.length
          : 0,
    };
  }
}

/**
 * Creates an Apollo Server plugin for response caching
 *
 * Cached operations:
 * - listTargets: Static list of compiler targets
 * - getTargetInfo: Target information (rarely changes)
 * - parseHoloScript: Parse results for identical code
 *
 * NOT cached:
 * - compile, batchCompile: Output may vary based on compiler internals
 * - Mutations: Should never be cached
 * - Subscriptions: Real-time data
 */
export function createCachePlugin(
  options: CachePluginOptions = {}
): ApolloServerPlugin<BaseContext> {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const cacheableOps = new Set(options.cacheableOperations ?? DEFAULT_CACHEABLE_OPERATIONS);
  const includeStatus =
    options.includeCacheStatusInExtensions ?? process.env.NODE_ENV !== 'production';

  const cache = new ResponseCache(maxSize, ttl);

  // Periodic cache stats available via cache.getStats()

  return {
    async requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
      const _cacheHit = false;
      let operationName: string | undefined;

      return {
        async didResolveOperation({ request }) {
          operationName = request.operationName;

          // Only cache queries (not mutations or subscriptions)
          if (!operationName || !cacheableOps.has(operationName)) {
            return;
          }

          // Check cache
          const cached = cache.get(operationName, request.variables);
          if (cached) {
            cacheHit = true;
            (request as CacheableRequest).__cachedResult = cached;
          }
        },

        async willSendResponse({ response, request }) {
          const isCacheable = operationName && cacheableOps.has(operationName);

          // Return cached result if available
          const cachedResult = (request as CacheableRequest).__cachedResult;
          if (cachedResult) {
            response.body.kind = 'single';
            if (response.body.kind === 'single') {
              const cachedExtensions = cachedResult.extensions as
                | Record<string, unknown>
                | undefined;
              response.body.singleResult = {
                ...cachedResult,
                extensions: includeStatus
                  ? {
                      ...cachedExtensions,
                      cache: { hit: true },
                    }
                  : cachedExtensions,
              };
            }
            return;
          }

          // Cache successful query results
          if (isCacheable && response.body.kind === 'single') {
            const result = response.body.singleResult;
            if (!result.errors || result.errors.length === 0) {
              cache.set(operationName, request.variables, result);

              // Add cache status to extensions
              if (includeStatus) {
                result.extensions = {
                  ...result.extensions,
                  cache: { hit: false, ttl },
                };
              }
            }
          }
        },
      };
    },
  };
}

/**
 * Clear the cache (useful for testing or when data changes)
 * Export this for external use if needed
 */
const cacheInstance: ResponseCache | null = null;

export function getCacheInstance(): ResponseCache | null {
  return cacheInstance;
}
