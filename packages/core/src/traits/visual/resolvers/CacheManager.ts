import type { ResolvedAsset } from './types';

interface CacheEntry {
  asset: ResolvedAsset;
  size: number;
  lastAccessed: number;
}

/**
 * LRU cache for resolved assets.
 *
 * Stores resolved textures, models, and shaders with a configurable
 * memory limit. When the limit is exceeded, the least-recently-used
 * entries are evicted.
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  private currentSize = 0;
  private maxSize: number;

  /**
   * @param maxSizeBytes Maximum cache size in bytes (default: 256MB)
   */
  constructor(maxSizeBytes: number = 256 * 1024 * 1024) {
    this.maxSize = maxSizeBytes;
  }

  /** Look up a cached asset by trait name. */
  get(trait: string): ResolvedAsset | undefined {
    const entry = this.cache.get(trait);
    if (!entry) return undefined;

    // Update access time for LRU
    entry.lastAccessed = Date.now();
    return entry.asset;
  }

  /** Store an asset in the cache. */
  set(trait: string, asset: ResolvedAsset): void {
    const size = this.estimateSize(asset);

    // Evict until we have room
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // Don't cache if single item exceeds limit
    if (size > this.maxSize) return;

    // Remove old entry if exists
    if (this.cache.has(trait)) {
      this.currentSize -= this.cache.get(trait)!.size;
    }

    this.cache.set(trait, {
      asset,
      size,
      lastAccessed: Date.now(),
    });
    this.currentSize += size;
  }

  /** Check if a trait has a cached asset. */
  has(trait: string): boolean {
    return this.cache.has(trait);
  }

  /** Number of cached entries. */
  get size(): number {
    return this.cache.size;
  }

  /** Total bytes used by cached assets. */
  get bytesUsed(): number {
    return this.currentSize;
  }

  /** Clear the entire cache. */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /** Evict the least-recently-used entry. */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.currentSize -= this.cache.get(oldestKey)!.size;
      this.cache.delete(oldestKey);
    }
  }

  /** Estimate the memory footprint of an asset. */
  private estimateSize(asset: ResolvedAsset): number {
    let size = 100; // base overhead
    if (asset.data) {
      size += asset.data.byteLength;
    }
    if (asset.url) {
      size += asset.url.length * 2; // UTF-16
    }
    if (asset.metadata) {
      size += JSON.stringify(asset.metadata).length * 2;
    }
    return size;
  }
}
