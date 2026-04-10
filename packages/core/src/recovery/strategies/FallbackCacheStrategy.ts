/**
 * Fallback Cache Strategy
 *
 * Returns cached/stale data when primary source fails.
 */

import type {
  IRecoveryStrategy,
  IAgentFailure,
  IRecoveryResult,
  FailureType,
} from '../../extensions';

export interface FallbackCacheConfig {
  maxAge: number; // Max age of cached data (ms)
  staleWhileRevalidate: boolean;
}

const DEFAULT_CONFIG: FallbackCacheConfig = {
  maxAge: 300000, // 5 minutes
  staleWhileRevalidate: true,
};

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  key: string;
}

/**
 * Strategy that provides cached fallback data on failure
 */
export class FallbackCacheStrategy implements IRecoveryStrategy {
  readonly id = 'fallback-cache';
  readonly handles: FailureType[] = [
    'network-timeout',
    'api-rate-limit',
    'ai-service-error',
    'dependency-error',
  ];
  readonly maxAttempts = 1;
  readonly backoffMs = 0;

  private config: FallbackCacheConfig;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: Partial<FallbackCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if this strategy handles the failure
   */
  matches(failure: IAgentFailure): boolean {
    if (!this.handles.includes(failure.errorType)) {
      return false;
    }
    // Only match if we have cached data for this context
    const cacheKey = this.getCacheKey(failure);
    return this.hasValidCache(cacheKey);
  }

  /**
   * Execute cache fallback
   */
  async execute(failure: IAgentFailure): Promise<IRecoveryResult> {
    const cacheKey = this.getCacheKey(failure);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return {
        success: false,
        strategyUsed: this.id,
        message: 'No cached data available',
        retryRecommended: true,
        nextAction: 'escalate',
      };
    }

    const age = Date.now() - entry.timestamp;
    const isStale = age > this.config.maxAge;

    if (isStale && !this.config.staleWhileRevalidate) {
      return {
        success: false,
        strategyUsed: this.id,
        message: `Cached data expired (${Math.round(age / 1000)}s old)`,
        retryRecommended: true,
        nextAction: 'retry',
      };
    }

    return {
      success: true,
      strategyUsed: this.id,
      message: isStale
        ? `Returned stale cached data (${Math.round(age / 1000)}s old)`
        : 'Returned cached data',
      retryRecommended: isStale, // Suggest retry to refresh cache
      nextAction: undefined,
    };
  }

  /**
   * Store data in cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key,
    });
  }

  /**
   * Get data from cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    return entry?.data as T | undefined;
  }

  /**
   * Check if cache entry exists and is valid
   */
  hasValidCache(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    return age <= this.config.maxAge || this.config.staleWhileRevalidate;
  }

  /**
   * Get cache key from failure context
   */
  getCacheKey(failure: IAgentFailure): string {
    // Use context if available, otherwise agent + error type
    if (failure.context?.cacheKey) {
      return String(failure.context.cacheKey);
    }
    return `${failure.agentId}:${failure.errorType}`;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      const age = now - entry.timestamp;
      if (age > this.config.maxAge && !this.config.staleWhileRevalidate) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}
