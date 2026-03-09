/**
 * ResourceCache.ts
 *
 * Resource caching: LRU eviction, reference counting,
 * TTL expiry, and memory pressure management.
 *
 * @module assets
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  sizeBytes: number;
  refCount: number;
  lastAccess: number;
  createdAt: number;
  ttlMs: number; // 0 = no expiry
}

// =============================================================================
// RESOURCE CACHE
// =============================================================================

export class ResourceCache<T = unknown> {
  private entries: Map<string, CacheEntry<T>> = new Map();
  private maxBytes: number;
  private currentBytes = 0;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  // ---------------------------------------------------------------------------
  // Get / Put
  // ---------------------------------------------------------------------------

  put(key: string, data: T, sizeBytes: number, ttlMs = 0): void {
    // Evict if needed
    while (this.currentBytes + sizeBytes > this.maxBytes && this.entries.size > 0) {
      const evicted = this.evictLRU();
      if (!evicted) break; // Nothing can be evicted (all referenced)
    }

    if (this.entries.has(key)) this.remove(key);

    this.entries.set(key, {
      key,
      data,
      sizeBytes,
      refCount: 0,
      lastAccess: Date.now(),
      createdAt: Date.now(),
      ttlMs,
    });
    this.currentBytes += sizeBytes;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (entry.ttlMs > 0 && Date.now() - entry.createdAt > entry.ttlMs) {
      this.remove(key);
      return undefined;
    }

    entry.lastAccess = Date.now();
    return entry.data;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  // ---------------------------------------------------------------------------
  // Reference Counting
  // ---------------------------------------------------------------------------

  addRef(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.refCount++;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.refCount = Math.max(0, entry.refCount - 1);
  }

  getRefCount(key: string): number {
    return this.entries.get(key)?.refCount ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Eviction
  // ---------------------------------------------------------------------------

  private evictLRU(): boolean {
    let oldest: CacheEntry<T> | null = null;

    for (const entry of this.entries.values()) {
      if (entry.refCount > 0) continue; // Don't evict referenced entries
      if (!oldest || entry.lastAccess < oldest.lastAccess) oldest = entry;
    }

    if (oldest) {
      this.remove(oldest.key);
      return true;
    }
    return false;
  }

  remove(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.currentBytes -= entry.sizeBytes;
    this.entries.delete(key);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  purgeExpired(): number {
    let purged = 0;
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.ttlMs > 0 && now - entry.createdAt > entry.ttlMs) {
        this.remove(entry.key);
        purged++;
      }
    }
    return purged;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntryCount(): number {
    return this.entries.size;
  }
  getCurrentBytes(): number {
    return this.currentBytes;
  }
  getMaxBytes(): number {
    return this.maxBytes;
  }
  getUsageRatio(): number {
    return this.currentBytes / this.maxBytes;
  }
  clear(): void {
    this.entries.clear();
    this.currentBytes = 0;
  }
}
