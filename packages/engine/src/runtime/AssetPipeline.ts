/**
 * AssetPipeline.ts — Sprint 7
 *
 * A lightweight, type-keyed asset loading pipeline with:
 *  - Per-type loader registration
 *  - Content-addressable cache (type + path key)
 *  - Failed-load exclusion from cache
 *  - evict(), clear(), isLoaded(), loadedCount
 *
 * Designed for use in SceneRunner and test contexts where you need
 * deterministic, promise-based asset loading with no framework dependencies.
 */

/** A loader function maps a path string → an arbitrary asset value. */
export type AssetLoader<T = unknown> = (path: string) => Promise<T>;

export class AssetPipeline {
  private loaders = new Map<string, AssetLoader>();
  private cache = new Map<string, unknown>();

  // ---------------------------------------------------------------------------
  // Loader registration
  // ---------------------------------------------------------------------------

  /** Register (or replace) a loader for an asset type. */
  registerLoader<T>(type: string, loader: AssetLoader<T>): void {
    this.loaders.set(type, loader as AssetLoader);
  }

  /** Whether a loader is registered for the given type. */
  hasLoader(type: string): boolean {
    return this.loaders.has(type);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  /**
   * Load an asset by type and path.
   *
   * - Returns the cached asset if already loaded.
   * - Calls the registered loader and caches the result.
   * - Throws if no loader is registered for the type.
   * - Does NOT cache failed loads, so a subsequent call may retry.
   */
  async load<T = unknown>(type: string, path: string): Promise<T> {
    const cacheKey = `${type}::${path}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    const loader = this.loaders.get(type);
    if (!loader) {
      throw new Error(`[AssetPipeline] No loader registered for type "${type}"`);
    }

    // Do NOT cache before the await — errors must not be cached
    const asset = await loader(path);
    this.cache.set(cacheKey, asset);
    return asset as T;
  }

  // ---------------------------------------------------------------------------
  // Cache inspection / management
  // ---------------------------------------------------------------------------

  /** Whether the asset at (type, path) is currently cached. */
  isLoaded(type: string, path: string): boolean {
    return this.cache.has(`${type}::${path}`);
  }

  /** Remove a single asset from the cache. */
  evict(type: string, path: string): void {
    this.cache.delete(`${type}::${path}`);
  }

  /** Remove all assets from the cache. */
  clear(): void {
    this.cache.clear();
  }

  /** Number of currently cached assets. */
  get loadedCount(): number {
    return this.cache.size;
  }
}

