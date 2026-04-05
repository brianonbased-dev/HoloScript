/**
 * Generation Cache System
 *
 * Caches generated HoloScript code to avoid redundant API calls.
 * Implements LRU (Least Recently Used) eviction policy.
 *
 * Features:
 * - Prompt-based caching (hash of prompt + adapter)
 * - TTL (Time-To-Live) support
 * - Statistics tracking
 * - Serialization for persistence
 */

import * as crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface CacheEntry {
  prompt: string;
  code: string;
  confidence: number;
  timestamp: number;
  ttl?: number; // milliseconds
  hits: number; // Number of times this entry was hit
  adapterName: string;
}

export interface CacheStats {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  entriesCount: number;
  maxSize: number;
  averageHitCount: number;
}

// =============================================================================
// GENERATION CACHE
// =============================================================================

export class GenerationCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  // Statistics
  private hits = 0;
  private misses = 0;

  constructor(options: { maxSize?: number; ttlMs?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24 hours default
  }

  /**
   * Generate cache key from prompt and adapter
   */
  private generateKey(prompt: string, adapterName: string): string {
    const combined = `${prompt}::${adapterName}`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  }

  /**
   * Get cached code if available and valid
   */
  get(prompt: string, adapterName: string): CacheEntry | null {
    const key = this.generateKey(prompt, adapterName);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update hit tracking
    entry.hits++;
    this.hits++;

    return entry;
  }

  /**
   * Store generated code in cache
   */
  set(prompt: string, code: string, confidence: number, adapterName: string): void {
    const key = this.generateKey(prompt, adapterName);

    // Check if cache is full and evict LRU entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      prompt,
      code,
      confidence,
      timestamp: Date.now(),
      ttl: this.ttlMs,
      hits: 0,
      adapterName,
    };

    this.cache.set(key, entry);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    let oldestEntry: [string, CacheEntry] | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestEntry = [key, entry];
      }
    }

    if (oldestEntry) {
      this.cache.delete(oldestEntry[0]);
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const avgHits =
      this.cache.size > 0
        ? Array.from(this.cache.values()).reduce((sum, e) => sum + e.hits, 0) / this.cache.size
        : 0;

    return {
      totalHits: this.hits,
      totalMisses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      entriesCount: this.cache.size,
      maxSize: this.maxSize,
      averageHitCount: avgHits,
    };
  }

  /**
   * Export cache as JSON
   */
  serialize(): string {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      ...entry,
    }));

    return JSON.stringify({
      entries,
      stats: { hits: this.hits, misses: this.misses },
    });
  }

  /**
   * Import cache from JSON
   */
  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);

      this.cache.clear();
      data.entries.forEach((entry: CacheEntry & { key: string }) => {
        const { key, ...cacheEntry } = entry;
        this.cache.set(key, cacheEntry);
      });

      this.hits = data.stats.hits;
      this.misses = data.stats.misses;
    } catch (error) {
      throw new Error(
        `Failed to deserialize cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get all cache entries
   */
  getEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Remove specific entry
   */
  remove(prompt: string, adapterName: string): boolean {
    const key = this.generateKey(prompt, adapterName);
    return this.cache.delete(key);
  }

  /**
   * Get cache size in bytes (approximate)
   */
  getSize(): number {
    return this.serialize().length;
  }
}

// =============================================================================
// CACHED GENERATION RESULT
// =============================================================================

export interface CachedGenerationResult {
  code: string;
  confidence: number;
  fromCache: boolean;
  cacheAge?: number; // milliseconds
}

/**
 * Wrap generation with caching
 */
export async function cachedGenerate(
  prompt: string,
  adapterName: string,
  cache: GenerationCache,
  generator: () => Promise<{ holoScript: string; aiConfidence: number }>
): Promise<CachedGenerationResult> {
  // Check cache first
  const cached = cache.get(prompt, adapterName);
  if (cached) {
    return {
      code: cached.code,
      confidence: cached.confidence,
      fromCache: true,
      cacheAge: Date.now() - cached.timestamp,
    };
  }

  // Generate if not cached
  const result = await generator();
  cache.set(prompt, result.holoScript, result.aiConfidence, adapterName);

  return {
    code: result.holoScript,
    confidence: result.aiConfidence,
    fromCache: false,
  };
}
