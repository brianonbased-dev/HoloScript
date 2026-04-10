/**
 * @holoscript/core Asset Registry
 *
 * Central registry for asset discovery, caching, and lifecycle management.
 * Provides a singleton interface for all asset operations.
 */

import { AssetMetadata, AssetType } from './AssetMetadata';
import { AssetManifest } from './AssetManifest';

// ============================================================================
// Registry Events
// ============================================================================

export type AssetEventType =
  | 'asset:added'
  | 'asset:removed'
  | 'asset:updated'
  | 'asset:loading'
  | 'asset:loaded'
  | 'asset:error'
  | 'asset:cached'
  | 'asset:evicted'
  | 'manifest:loaded'
  | 'manifest:updated'
  | 'group:created'
  | 'group:deleted';

export interface AssetEvent {
  type: AssetEventType;
  assetId?: string;
  asset?: AssetMetadata;
  groupId?: string;
  error?: Error;
  timestamp: number;
}

export type AssetEventListener = (event: AssetEvent) => void;

// ============================================================================
// Cache Entry
// ============================================================================

export interface CacheEntry {
  assetId: string;
  data: unknown;
  size: number;
  loadedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  ttl?: number;
}

// ============================================================================
// Registry Configuration
// ============================================================================

export interface RegistryConfig {
  /** Maximum cache size in bytes */
  maxCacheSize: number;

  /** Default TTL for cached assets (ms) */
  defaultTTL: number;

  /** Enable automatic cache eviction */
  autoEvict: boolean;

  /** Eviction strategy */
  evictionStrategy: 'lru' | 'lfu' | 'fifo';

  /** Enable preloading */
  enablePreload: boolean;

  /** Concurrent load limit */
  concurrentLoadLimit: number;
}

// ============================================================================
// Asset Registry
// ============================================================================

export class AssetRegistry {
  private static instance: AssetRegistry | null = null;

  private config: RegistryConfig;
  private manifests: Map<string, AssetManifest> = new Map();
  private activeManifest: AssetManifest | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private loading: Map<string, Promise<unknown>> = new Map();
  private listeners: Map<AssetEventType, Set<AssetEventListener>> = new Map();
  private currentCacheSize = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  private constructor(config: Partial<RegistryConfig> = {}) {
    this.config = {
      maxCacheSize: 256 * 1024 * 1024, // 256MB
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      autoEvict: true,
      evictionStrategy: 'lru',
      enablePreload: true,
      concurrentLoadLimit: 6,
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<RegistryConfig>): AssetRegistry {
    if (!AssetRegistry.instance) {
      AssetRegistry.instance = new AssetRegistry(config);
    }
    return AssetRegistry.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    AssetRegistry.instance = null;
  }

  // ─── Manifest Management ─────────────────────────────────────────────────

  /**
   * Register a manifest
   */
  registerManifest(id: string, manifest: AssetManifest): void {
    this.manifests.set(id, manifest);
    this.emit({ type: 'manifest:loaded', timestamp: Date.now() });

    // Set as active if first manifest
    if (!this.activeManifest) {
      this.activeManifest = manifest;
    }
  }

  /**
   * Set active manifest
   */
  setActiveManifest(id: string): boolean {
    const manifest = this.manifests.get(id);
    if (!manifest) return false;

    this.activeManifest = manifest;
    this.emit({ type: 'manifest:updated', timestamp: Date.now() });
    return true;
  }

  /**
   * Get active manifest
   */
  getActiveManifest(): AssetManifest | null {
    return this.activeManifest;
  }

  /**
   * Get manifest by ID
   */
  getManifest(id: string): AssetManifest | undefined {
    return this.manifests.get(id);
  }

  // ─── Asset Discovery ─────────────────────────────────────────────────────

  /**
   * Get asset metadata by ID
   */
  getAsset(assetId: string): AssetMetadata | undefined {
    // Search active manifest first
    if (this.activeManifest) {
      const asset = this.activeManifest.getAsset(assetId);
      if (asset) return asset;
    }

    // Search all manifests
    for (const manifest of this.manifests.values()) {
      const asset = manifest.getAsset(assetId);
      if (asset) return asset;
    }

    return undefined;
  }

  /**
   * Get asset by path
   */
  getAssetByPath(path: string): AssetMetadata | undefined {
    if (this.activeManifest) {
      const asset = this.activeManifest.getAssetByPath(path);
      if (asset) return asset;
    }

    for (const manifest of this.manifests.values()) {
      const asset = manifest.getAssetByPath(path);
      if (asset) return asset;
    }

    return undefined;
  }

  /**
   * Find assets by tag
   */
  findByTag(tag: string): AssetMetadata[] {
    const results: AssetMetadata[] = [];
    const seen = new Set<string>();

    for (const manifest of this.manifests.values()) {
      for (const asset of manifest.findByTag(tag)) {
        if (!seen.has(asset.id)) {
          seen.add(asset.id);
          results.push(asset);
        }
      }
    }

    return results;
  }

  /**
   * Find assets by type
   */
  findByType(type: AssetType): AssetMetadata[] {
    const results: AssetMetadata[] = [];
    const seen = new Set<string>();

    for (const manifest of this.manifests.values()) {
      for (const asset of manifest.findByType(type)) {
        if (!seen.has(asset.id)) {
          seen.add(asset.id);
          results.push(asset);
        }
      }
    }

    return results;
  }

  /**
   * Search assets
   */
  search(query: string): AssetMetadata[] {
    const results: AssetMetadata[] = [];
    const seen = new Set<string>();

    for (const manifest of this.manifests.values()) {
      for (const asset of manifest.search(query)) {
        if (!seen.has(asset.id)) {
          seen.add(asset.id);
          results.push(asset);
        }
      }
    }

    return results;
  }

  // ─── Asset Loading ───────────────────────────────────────────────────────

  /**
   * Load asset data
   */
  async loadAsset<T = unknown>(assetId: string): Promise<T> {
    // Check cache first
    const cached = this.getCached<T>(assetId);
    if (cached !== undefined) {
      return cached;
    }

    // Check if already loading
    const existingLoad = this.loading.get(assetId);
    if (existingLoad) {
      return existingLoad as Promise<T>;
    }

    // Get asset metadata
    const asset = this.getAsset(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Start loading
    this.emit({ type: 'asset:loading', assetId, asset, timestamp: Date.now() });

    const loadPromise = this.doLoadAsset<T>(asset);
    this.loading.set(assetId, loadPromise);

    try {
      const data = await loadPromise;

      // Cache the result
      this.setCached(assetId, data, asset.fileSize);

      this.emit({ type: 'asset:loaded', assetId, asset, timestamp: Date.now() });
      return data;
    } catch (error) {
      this.emit({
        type: 'asset:error',
        assetId,
        asset,
        error: error as Error,
        timestamp: Date.now(),
      });
      throw error;
    } finally {
      this.loading.delete(assetId);
    }
  }

  /**
   * Internal load implementation
   */
  private async doLoadAsset<T>(asset: AssetMetadata): Promise<T> {
    const url = asset.cdnUrl ?? asset.url ?? asset.sourcePath;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load asset: ${response.statusText}`);
    }

    // Parse based on asset type
    switch (asset.assetType) {
      case 'texture':
        return (await this.loadTexture(response)) as T;
      case 'model':
      case 'scene':
        return (await response.arrayBuffer()) as T;
      case 'audio':
        return (await response.arrayBuffer()) as T;
      case 'video':
        return (await response.blob()) as T;
      case 'script':
      case 'data':
        if (asset.format === 'holo' || asset.format === 'hsplus' || asset.format === 'hs') {
          return (await response.text()) as T;
        }
        return (await response.json()) as T;
      default:
        return (await response.arrayBuffer()) as T;
    }
  }

  /**
   * Load texture as ImageBitmap
   */
  private async loadTexture(response: Response): Promise<ImageBitmap> {
    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  /**
   * Preload assets by group
   */
  async preloadGroup(groupId: string): Promise<void> {
    if (!this.activeManifest) return;

    const assets = this.activeManifest.getGroupAssets(groupId);
    await this.preloadAssets(assets.map((a) => a.id));
  }

  /**
   * Preload multiple assets
   */
  async preloadAssets(assetIds: string[]): Promise<void> {
    const chunks = this.chunkArray(assetIds, this.config.concurrentLoadLimit);

    for (const chunk of chunks) {
      await Promise.all(chunk.map((id) => this.loadAsset(id).catch(() => {})));
    }
  }

  /**
   * Preload all eager assets
   */
  async preloadEager(): Promise<void> {
    if (!this.activeManifest || !this.config.enablePreload) return;

    const queue = this.activeManifest.getPreloadQueue();
    await this.preloadAssets(queue.map((a) => a.id));
  }

  // ─── Cache Management ────────────────────────────────────────────────────

  /**
   * Get cached asset data
   */
  getCached<T>(assetId: string): T | undefined {
    const entry = this.cache.get(assetId);
    if (!entry) {
      this.cacheMisses++;
      return undefined;
    }

    // Check TTL
    if (entry.ttl && Date.now() - entry.loadedAt > entry.ttl) {
      this.evictFromCache(assetId);
      this.cacheMisses++;
      return undefined;
    }

    // Update access stats
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.cacheHits++;

    return entry.data as T;
  }

  /**
   * Set cached asset data
   */
  setCached(assetId: string, data: unknown, size: number, ttl?: number): void {
    // Evict if needed
    if (this.config.autoEvict) {
      this.ensureCacheSpace(size);
    }

    const entry: CacheEntry = {
      assetId,
      data,
      size,
      loadedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
      ttl: ttl ?? this.config.defaultTTL,
    };

    this.cache.set(assetId, entry);
    this.currentCacheSize += size;

    this.emit({ type: 'asset:cached', assetId, timestamp: Date.now() });
  }

  /**
   * Evict asset from cache
   */
  evictFromCache(assetId: string): boolean {
    const entry = this.cache.get(assetId);
    if (!entry) return false;

    this.cache.delete(assetId);
    this.currentCacheSize -= entry.size;

    this.emit({ type: 'asset:evicted', assetId, timestamp: Date.now() });
    return true;
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    for (const assetId of this.cache.keys()) {
      this.evictFromCache(assetId);
    }
  }

  /**
   * Ensure cache has space for new entry
   */
  private ensureCacheSpace(requiredSize: number): void {
    while (this.currentCacheSize + requiredSize > this.config.maxCacheSize && this.cache.size > 0) {
      const victimId = this.selectEvictionVictim();
      if (victimId) {
        this.evictFromCache(victimId);
      } else {
        break;
      }
    }
  }

  /**
   * Select cache entry to evict based on strategy
   */
  private selectEvictionVictim(): string | null {
    if (this.cache.size === 0) return null;

    const entries = Array.from(this.cache.values());

    switch (this.config.evictionStrategy) {
      case 'lru':
        // Least Recently Used
        entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        break;
      case 'lfu':
        // Least Frequently Used
        entries.sort((a, b) => a.accessCount - b.accessCount);
        break;
      case 'fifo':
        // First In First Out
        entries.sort((a, b) => a.loadedAt - b.loadedAt);
        break;
    }

    return entries[0]?.assetId ?? null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    entryCount: number;
    hitRate: number;
    hits: number;
    misses: number;
  } {
    const totalRequests = this.cacheHits + this.cacheMisses;
    return {
      size: this.currentCacheSize,
      maxSize: this.config.maxCacheSize,
      entryCount: this.cache.size,
      hitRate: totalRequests > 0 ? this.cacheHits / totalRequests : 0,
      hits: this.cacheHits,
      misses: this.cacheMisses,
    };
  }

  // ─── Event System ────────────────────────────────────────────────────────

  /**
   * Subscribe to events
   */
  on(type: AssetEventType, listener: AssetEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events
   */
  onAny(listener: AssetEventListener): () => void {
    const unsubscribes: (() => void)[] = [];

    const allTypes: AssetEventType[] = [
      'asset:added',
      'asset:removed',
      'asset:updated',
      'asset:loading',
      'asset:loaded',
      'asset:error',
      'asset:cached',
      'asset:evicted',
      'manifest:loaded',
      'manifest:updated',
      'group:created',
      'group:deleted',
    ];

    for (const type of allTypes) {
      unsubscribes.push(this.on(type, listener));
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  }

  /**
   * Emit event
   */
  private emit(event: AssetEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Asset event listener error:', error);
        }
      }
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get configuration
   */
  getConfig(): RegistryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<RegistryConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Dispose registry
   */
  dispose(): void {
    this.clearCache();
    this.manifests.clear();
    this.activeManifest = null;
    this.listeners.clear();
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get global asset registry instance
 */
export function getAssetRegistry(config?: Partial<RegistryConfig>): AssetRegistry {
  return AssetRegistry.getInstance(config);
}

/**
 * Register a manifest with the global registry
 */
export function registerManifest(id: string, manifest: AssetManifest): void {
  getAssetRegistry().registerManifest(id, manifest);
}

/**
 * Load an asset from the global registry
 */
export async function loadAsset<T = unknown>(assetId: string): Promise<T> {
  return getAssetRegistry().loadAsset<T>(assetId);
}

/**
 * Preload assets
 */
export async function preloadAssets(assetIds: string[]): Promise<void> {
  return getAssetRegistry().preloadAssets(assetIds);
}
