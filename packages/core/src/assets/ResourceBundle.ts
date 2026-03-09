/**
 * ResourceBundle.ts
 *
 * Resource bundles: bundle packing, streaming chunks,
 * priority queues, and preloading.
 *
 * @module assets
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BundleEntry {
  id: string;
  sizeBytes: number;
  type: string;
  loaded: boolean;
}

export interface BundleConfig {
  id: string;
  name: string;
  priority: number;
  maxSizeBytes: number;
  preload: boolean;
}

export type StreamCallback = (bundleId: string, chunkIndex: number, totalChunks: number) => void;

// =============================================================================
// RESOURCE BUNDLE
// =============================================================================

export class ResourceBundle {
  private bundles: Map<string, { config: BundleConfig; entries: BundleEntry[] }> = new Map();
  private streamCallbacks: StreamCallback[] = [];

  // ---------------------------------------------------------------------------
  // Bundle Management
  // ---------------------------------------------------------------------------

  createBundle(config: BundleConfig): void {
    this.bundles.set(config.id, { config, entries: [] });
  }

  removeBundle(id: string): void {
    this.bundles.delete(id);
  }

  addEntry(bundleId: string, entry: BundleEntry): boolean {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return false;

    const currentSize = bundle.entries.reduce((s, e) => s + e.sizeBytes, 0);
    if (currentSize + entry.sizeBytes > bundle.config.maxSizeBytes) return false;

    bundle.entries.push(entry);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  async loadBundle(bundleId: string, chunkSize = 3): Promise<void> {
    const bundle = this.bundles.get(bundleId);
    if (!bundle) return;

    const entries = bundle.entries.filter((e) => !e.loaded);
    const totalChunks = Math.ceil(entries.length / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = entries.slice(i * chunkSize, (i + 1) * chunkSize);
      for (const entry of chunk) entry.loaded = true;

      for (const cb of this.streamCallbacks) cb(bundleId, i, totalChunks);
    }
  }

  onStream(callback: StreamCallback): void {
    this.streamCallbacks.push(callback);
  }

  // ---------------------------------------------------------------------------
  // Preloading
  // ---------------------------------------------------------------------------

  async preloadAll(): Promise<string[]> {
    const preloadable = [...this.bundles.values()]
      .filter((b) => b.config.preload)
      .sort((a, b) => b.config.priority - a.config.priority);

    for (const bundle of preloadable) {
      await this.loadBundle(bundle.config.id);
    }

    return preloadable.map((b) => b.config.id);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getBundleSize(bundleId: string): number {
    const bundle = this.bundles.get(bundleId);
    return bundle ? bundle.entries.reduce((s, e) => s + e.sizeBytes, 0) : 0;
  }

  getLoadedCount(bundleId: string): number {
    const bundle = this.bundles.get(bundleId);
    return bundle ? bundle.entries.filter((e) => e.loaded).length : 0;
  }

  getEntryCount(bundleId: string): number {
    return this.bundles.get(bundleId)?.entries.length ?? 0;
  }

  getBundleCount(): number {
    return this.bundles.size;
  }

  isFullyLoaded(bundleId: string): boolean {
    const bundle = this.bundles.get(bundleId);
    return bundle ? bundle.entries.every((e) => e.loaded) : false;
  }

  getLoadProgress(bundleId: string): number {
    const bundle = this.bundles.get(bundleId);
    if (!bundle || bundle.entries.length === 0) return 0;
    return bundle.entries.filter((e) => e.loaded).length / bundle.entries.length;
  }
}
