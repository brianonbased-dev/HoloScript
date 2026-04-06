/**
 * SemanticCache - Redis-backed semantic caching for compiled modules and AST subtrees
 *
 * Features:
 * - SHA-256 content-based hashing for cache keys
 * - Redis backend for distributed caching
 * - AST subtree caching with dependency tracking
 * - Compiled module caching
 * - 7-day TTL (configurable)
 * - Performance metrics (hit rate, latency)
 * - Graceful degradation (falls back to in-memory if Redis unavailable)
 *
 * Target: 50-80% compilation time reduction on incremental builds
 *
 * @version 1.0.0
 */

import { createHash } from 'crypto';
import type { HoloObjectDecl, HoloComposition } from '../parser/HoloCompositionTypes';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Cache entry types
 */
export type SemanticCacheEntryType =
  | 'ast-subtree' // Parsed AST for a module or composition
  | 'compiled-module' // Compiled output for a module
  | 'compiled-object' // Compiled output for a single HoloObject
  | 'trait-composition' // Resolved trait composition
  | 'import-resolution'; // Resolved import graph

/**
 * Cache entry metadata
 */
export interface SemanticCacheEntry<T = unknown> {
  /** SHA-256 hash of source content */
  contentHash: string;
  /** Entry type */
  type: SemanticCacheEntryType;
  /** Cached data */
  data: T;
  /** Source file path (for debugging) */
  sourcePath?: string;
  /** Dependencies (file paths or content hashes) */
  dependencies?: string[];
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  accessedAt: number;
  /** Access count */
  accessCount: number;
  /** Data size in bytes */
  size: number;
  /** Cache version (for invalidation) */
  version: string;
}

/**
 * Cache lookup result
 */
export interface CacheLookupResult<T = unknown> {
  /** Cache hit or miss */
  hit: boolean;
  /** Retrieved entry (if hit) */
  entry?: SemanticCacheEntry<T>;
  /** Miss reason */
  reason?: 'not_found' | 'expired' | 'version_mismatch' | 'redis_error';
  /** Lookup latency in milliseconds */
  latencyMs?: number;
}

/**
 * Cache statistics
 */
export interface SemanticCacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Average lookup latency (ms) */
  avgLatencyMs: number;
  /** Total entries in cache */
  totalEntries: number;
  /** Cache backend type */
  backend: 'redis' | 'memory';
  /** Redis connection status */
  redisConnected: boolean;
  /** Entries by type */
  entriesByType: Record<SemanticCacheEntryType, number>;
}

/**
 * SemanticCache options
 */
export interface SemanticCacheOptions {
  /** Redis connection URL (e.g., redis://localhost:6379) */
  redisUrl?: string;
  /** Cache key prefix */
  keyPrefix?: string;
  /** TTL in seconds (default: 7 days) */
  ttl?: number;
  /** Cache version (for invalidation) */
  version?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Redis connection timeout (ms) */
  connectionTimeout?: number;
  /** Max retries for Redis operations */
  maxRetries?: number;
}

// ============================================================================
// Redis Client Interface (for optional dependency)
// ============================================================================

/**
 * Redis client interface (compatible with ioredis)
 * Allows using the cache without hard dependency on Redis
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
  quit(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Hash source code using SHA-256
 */
export function hashSourceCode(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/**
 * Generate cache key
 */
function generateCacheKey(
  contentHash: string,
  type: SemanticCacheEntryType,
  prefix: string
): string {
  return `${prefix}:${type}:${contentHash}`;
}

/**
 * Serialize AST node for hashing
 */
export function serializeASTNode(node: HoloObjectDecl | HoloComposition): string {
  return JSON.stringify(node, null, 0);
}

/**
 * Calculate hash for AST subtree
 */
export function hashASTSubtree(node: HoloObjectDecl | HoloComposition): string {
  const serialized = serializeASTNode(node);
  return hashSourceCode(serialized);
}

// ============================================================================
// SemanticCache Class
// ============================================================================

/**
 * SemanticCache - Redis-backed semantic cache with fallback to in-memory
 */
export class SemanticCache {
  private redis: RedisClient | null = null;
  private memoryCache: Map<string, SemanticCacheEntry> = new Map();
  private options: Required<SemanticCacheOptions>;
  private stats = {
    hits: 0,
    misses: 0,
    totalLatencyMs: 0,
    lookupCount: 0,
  };
  private redisConnected = false;
  private initialized = false;

  constructor(options: SemanticCacheOptions = {}) {
    this.options = {
      redisUrl: options.redisUrl ?? 'redis://localhost:6379',
      keyPrefix: options.keyPrefix ?? 'holoscript:semantic',
      ttl: options.ttl ?? 7 * 24 * 60 * 60, // 7 days in seconds
      version: options.version ?? '1.0.0',
      debug: options.debug ?? false,
      connectionTimeout: options.connectionTimeout ?? 5000,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  /**
   * Initialize the cache (connect to Redis if available)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Try to connect to Redis (optional dependency)
    try {
      // Dynamic import of ioredis (optional)
      const Redis = await this.loadRedisClient();
      if (Redis) {
        this.redis = new Redis(this.options.redisUrl, {
          connectTimeout: this.options.connectionTimeout,
          maxRetriesPerRequest: this.options.maxRetries,
          lazyConnect: true,
          enableOfflineQueue: false,
        }) as unknown as RedisClient;

        // Setup event handlers
        this.redis.on('connect', () => {
          this.redisConnected = true;
          this.log('Redis connected');
        });

        this.redis.on('error', (error: Error) => {
          this.log(`Redis error: ${error.message}`);
          this.redisConnected = false;
        });

        this.redis.on('close', () => {
          this.redisConnected = false;
          this.log('Redis disconnected');
        });

        // Test connection
        await this.redis.ping();
        this.redisConnected = true;
        this.log('Redis cache initialized');
      }
    } catch (error) {
      this.log(`Redis initialization failed: ${error}. Falling back to in-memory cache.`);
      this.redis = null;
      this.redisConnected = false;
    }

    this.initialized = true;
    this.log(`Semantic cache initialized (backend: ${this.getBackend()})`);
  }

  /**
   * Load Redis client dynamically (optional dependency)
   */
  private async loadRedisClient(): Promise<any> {
    try {
      const ioredis = await import('ioredis');
      return ioredis.default;
    } catch (error) {
      this.log('ioredis not installed, using in-memory cache');
      return null;
    }
  }

  /**
   * Get cache entry
   */
  async get<T>(contentHash: string, type: SemanticCacheEntryType): Promise<CacheLookupResult<T>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const key = generateCacheKey(contentHash, type, this.options.keyPrefix);

    try {
      let entry: SemanticCacheEntry<T> | null = null;

      // Try Redis first
      if (this.redis && this.redisConnected) {
        const raw = await this.redis.get(key);
        if (raw) {
          entry = JSON.parse(raw) as SemanticCacheEntry<T>;
        }
      } else {
        // Fallback to memory cache
        const memEntry = this.memoryCache.get(key);
        if (memEntry) {
          entry = memEntry as SemanticCacheEntry<T>;
        }
      }

      const latencyMs = Date.now() - startTime;
      this.stats.totalLatencyMs += latencyMs;
      this.stats.lookupCount++;

      // Cache miss
      if (!entry) {
        this.stats.misses++;
        return {
          hit: false,
          reason: 'not_found',
          latencyMs,
        };
      }

      // Version mismatch
      if (entry.version !== this.options.version) {
        this.stats.misses++;
        await this.delete(contentHash, type);
        return {
          hit: false,
          reason: 'version_mismatch',
          latencyMs,
        };
      }

      // Check TTL (for memory cache)
      if (!this.redis) {
        const age = Date.now() - entry.createdAt;
        const ttlMs = this.options.ttl * 1000;
        if (age > ttlMs) {
          this.stats.misses++;
          this.memoryCache.delete(key);
          return {
            hit: false,
            reason: 'expired',
            latencyMs,
          };
        }
      }

      // Cache hit
      entry.accessedAt = Date.now();
      entry.accessCount++;

      // Update access stats in cache
      if (this.redis && this.redisConnected) {
        await this.redis.set(key, JSON.stringify(entry), 'EX', this.options.ttl);
      } else {
        this.memoryCache.set(key, entry);
      }

      this.stats.hits++;
      this.log(`Cache HIT: ${type} (${contentHash.slice(0, 8)}...) [${latencyMs}ms]`);

      return {
        hit: true,
        entry,
        latencyMs,
      };
    } catch (error) {
      this.stats.misses++;
      this.log(`Cache lookup error: ${error}`);
      return {
        hit: false,
        reason: 'redis_error',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Set cache entry
   */
  async set<T>(
    contentHash: string,
    type: SemanticCacheEntryType,
    data: T,
    options?: {
      sourcePath?: string;
      dependencies?: string[];
    }
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const key = generateCacheKey(contentHash, type, this.options.keyPrefix);
    const serialized = JSON.stringify(data);

    const entry: SemanticCacheEntry<T> = {
      contentHash,
      type,
      data,
      sourcePath: options?.sourcePath,
      dependencies: options?.dependencies,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      size: serialized.length,
      version: this.options.version,
    };

    try {
      if (this.redis && this.redisConnected) {
        await this.redis.set(key, JSON.stringify(entry), 'EX', this.options.ttl);
      } else {
        this.memoryCache.set(key, entry);
      }

      this.log(`Cache SET: ${type} (${contentHash.slice(0, 8)}...) [${entry.size} bytes]`);
    } catch (error) {
      this.log(`Cache set error: ${error}`);
    }
  }

  /**
   * Delete cache entry
   */
  async delete(contentHash: string, type: SemanticCacheEntryType): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const key = generateCacheKey(contentHash, type, this.options.keyPrefix);

    try {
      if (this.redis && this.redisConnected) {
        await this.redis.del(key);
      } else {
        this.memoryCache.delete(key);
      }

      this.log(`Cache DELETE: ${type} (${contentHash.slice(0, 8)}...)`);
    } catch (error) {
      this.log(`Cache delete error: ${error}`);
    }
  }

  /**
   * Invalidate all cache entries for a type
   */
  async invalidateType(type: SemanticCacheEntryType): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    let count = 0;

    try {
      if (this.redis && this.redisConnected) {
        const pattern = `${this.options.keyPrefix}:${type}:*`;
        const keys = await this.redis.keys(pattern);
        for (const key of keys) {
          await this.redis.del(key);
          count++;
        }
      } else {
        for (const [key, entry] of this.memoryCache.entries()) {
          if (entry.type === type) {
            this.memoryCache.delete(key);
            count++;
          }
        }
      }

      this.log(`Invalidated ${count} entries of type: ${type}`);
    } catch (error) {
      this.log(`Cache invalidation error: ${error}`);
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (this.redis && this.redisConnected) {
        const pattern = `${this.options.keyPrefix}:*`;
        const keys = await this.redis.keys(pattern);
        for (const key of keys) {
          await this.redis.del(key);
        }
      } else {
        this.memoryCache.clear();
      }

      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.totalLatencyMs = 0;
      this.stats.lookupCount = 0;

      this.log('Cache cleared');
    } catch (error) {
      this.log(`Cache clear error: ${error}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<SemanticCacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const avgLatencyMs =
      this.stats.lookupCount > 0 ? this.stats.totalLatencyMs / this.stats.lookupCount : 0;

    let totalEntries = 0;
    const entriesByType: Record<SemanticCacheEntryType, number> = {
      'ast-subtree': 0,
      'compiled-module': 0,
      'compiled-object': 0,
      'trait-composition': 0,
      'import-resolution': 0,
    };

    try {
      if (this.redis && this.redisConnected) {
        const pattern = `${this.options.keyPrefix}:*`;
        const keys = await this.redis.keys(pattern);
        totalEntries = keys.length;

        // Count by type
        for (const key of keys) {
          const parts = key.split(':');
          const type = parts[2] as SemanticCacheEntryType;
          if (type in entriesByType) {
            entriesByType[type]++;
          }
        }
      } else {
        totalEntries = this.memoryCache.size;

        for (const entry of this.memoryCache.values()) {
          entriesByType[entry.type]++;
        }
      }
    } catch (error) {
      this.log(`Stats error: ${error}`);
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      avgLatencyMs,
      totalEntries,
      backend: this.getBackend(),
      redisConnected: this.redisConnected,
      entriesByType,
    };
  }

  /**
   * Get cache backend type
   */
  getBackend(): 'redis' | 'memory' {
    return this.redis && this.redisConnected ? 'redis' : 'memory';
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        this.log('Redis connection closed');
      } catch (error) {
        this.log(`Error closing Redis: ${error}`);
      }
    }
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[SemanticCache] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a semantic cache instance
 */
export function createSemanticCache(options?: SemanticCacheOptions): SemanticCache {
  return new SemanticCache(options);
}

/**
 * Global cache instance (singleton)
 */
let globalCache: SemanticCache | null = null;

/**
 * Get or create global cache instance
 */
export function getGlobalSemanticCache(options?: SemanticCacheOptions): SemanticCache {
  if (!globalCache) {
    globalCache = new SemanticCache(options);
  }
  return globalCache;
}

// ============================================================================
// High-Level Cache Utilities
// ============================================================================

/**
 * Cache compiled module
 */
export async function cacheCompiledModule(
  sourceCode: string,
  compiledOutput: string,
  cache: SemanticCache,
  options?: { sourcePath?: string; dependencies?: string[] }
): Promise<void> {
  const hash = hashSourceCode(sourceCode);
  await cache.set(hash, 'compiled-module', compiledOutput, options);
}

/**
 * Retrieve cached compiled module
 */
export async function getCachedCompiledModule(
  sourceCode: string,
  cache: SemanticCache
): Promise<string | null> {
  const hash = hashSourceCode(sourceCode);
  const result = await cache.get<string>(hash, 'compiled-module');
  return result.hit ? result.entry!.data : null;
}

/**
 * Cache AST subtree
 */
export async function cacheASTSubtree(
  node: HoloObjectDecl | HoloComposition,
  cache: SemanticCache,
  options?: { sourcePath?: string; dependencies?: string[] }
): Promise<void> {
  const hash = hashASTSubtree(node);
  await cache.set(hash, 'ast-subtree', node, options);
}

/**
 * Retrieve cached AST subtree
 */
export async function getCachedASTSubtree(
  node: HoloObjectDecl | HoloComposition,
  cache: SemanticCache
): Promise<(HoloObjectDecl | HoloComposition) | null> {
  const hash = hashASTSubtree(node);
  const result = await cache.get<HoloObjectDecl | HoloComposition>(hash, 'ast-subtree');
  return result.hit ? result.entry!.data : null;
}
