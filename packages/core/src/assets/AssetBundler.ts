/**
 * AssetBundler.ts
 *
 * Asset bundling system: groups assets into downloadable bundles,
 * tracks dependencies, computes sizes, and supports incremental updates.
 *
 * @module assets
 */

// =============================================================================
// TYPES
// =============================================================================

export type AssetType =
  | 'texture'
  | 'model'
  | 'audio'
  | 'shader'
  | 'script'
  | 'animation'
  | 'font'
  | 'data';

export interface AssetEntry {
  id: string;
  type: AssetType;
  path: string;
  sizeBytes: number;
  hash: string;
  dependencies: string[];
  metadata?: Record<string, unknown>;
}

export interface BundleConfig {
  id: string;
  name: string;
  entries: string[]; // Asset IDs
  compress: boolean;
  maxSizeBytes?: number; // Split if exceeded
  priority: number; // Load order (lower = first)
}

export interface Bundle {
  id: string;
  name: string;
  assets: AssetEntry[];
  totalSizeBytes: number;
  compressedSizeBytes: number;
  hash: string;
  priority: number;
  version: number;
}

export interface BundleManifest {
  bundles: Bundle[];
  totalAssets: number;
  totalSizeBytes: number;
  buildTimestamp: number;
  version: string;
}

// =============================================================================
// ASSET BUNDLER
// =============================================================================

export class AssetBundler {
  private assets: Map<string, AssetEntry> = new Map();
  private bundles: Map<string, Bundle> = new Map();
  private version = 0;

  // ---------------------------------------------------------------------------
  // Asset Registration
  // ---------------------------------------------------------------------------

  registerAsset(entry: AssetEntry): void {
    this.assets.set(entry.id, entry);
  }

  unregisterAsset(id: string): void {
    this.assets.delete(id);
  }

  getAsset(id: string): AssetEntry | undefined {
    return this.assets.get(id);
  }

  getAssetCount(): number {
    return this.assets.size;
  }

  // ---------------------------------------------------------------------------
  // Bundle Building
  // ---------------------------------------------------------------------------

  buildBundle(config: BundleConfig): Bundle {
    const assets: AssetEntry[] = [];
    const seen = new Set<string>();

    // Resolve all assets including dependencies
    const resolve = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const asset = this.assets.get(id);
      if (!asset) return;
      // Resolve dependencies first
      for (const dep of asset.dependencies) {
        resolve(dep);
      }
      assets.push(asset);
    };

    for (const entryId of config.entries) {
      resolve(entryId);
    }

    const totalSize = assets.reduce((sum, a) => sum + a.sizeBytes, 0);
    const compressedSize = config.compress ? Math.floor(totalSize * 0.6) : totalSize;
    const hash = this.computeBundleHash(assets);

    const bundle: Bundle = {
      id: config.id,
      name: config.name,
      assets,
      totalSizeBytes: totalSize,
      compressedSizeBytes: compressedSize,
      hash,
      priority: config.priority,
      version: ++this.version,
    };

    this.bundles.set(bundle.id, bundle);
    return bundle;
  }

  /**
   * Split a bundle if it exceeds maxSizeBytes.
   */
  splitBundle(config: BundleConfig): Bundle[] {
    const maxSize = config.maxSizeBytes ?? Infinity;
    const allAssets: AssetEntry[] = [];

    for (const id of config.entries) {
      const a = this.assets.get(id);
      if (a) allAssets.push(a);
    }

    if (allAssets.reduce((s, a) => s + a.sizeBytes, 0) <= maxSize) {
      return [this.buildBundle(config)];
    }

    // Split by size
    const result: Bundle[] = [];
    let chunk: AssetEntry[] = [];
    let chunkSize = 0;
    let partIndex = 0;

    for (const asset of allAssets) {
      if (chunkSize + asset.sizeBytes > maxSize && chunk.length > 0) {
        result.push(
          this.buildBundle({
            ...config,
            id: `${config.id}_part${partIndex}`,
            name: `${config.name} (Part ${partIndex + 1})`,
            entries: chunk.map((a) => a.id),
          })
        );
        partIndex++;
        chunk = [];
        chunkSize = 0;
      }
      chunk.push(asset);
      chunkSize += asset.sizeBytes;
    }

    if (chunk.length > 0) {
      result.push(
        this.buildBundle({
          ...config,
          id: `${config.id}_part${partIndex}`,
          name: `${config.name} (Part ${partIndex + 1})`,
          entries: chunk.map((a) => a.id),
        })
      );
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------

  generateManifest(): BundleManifest {
    const bundles = [...this.bundles.values()].sort((a, b) => a.priority - b.priority);
    const totalSize = bundles.reduce((s, b) => s + b.totalSizeBytes, 0);
    const totalAssets = new Set(bundles.flatMap((b) => b.assets.map((a) => a.id))).size;

    return {
      bundles,
      totalAssets,
      totalSizeBytes: totalSize,
      buildTimestamp: Date.now(),
      version: `${this.version}`,
    };
  }

  /**
   * Compute diff between current and previous manifest for incremental updates.
   */
  computeDiff(previous: BundleManifest): { added: string[]; removed: string[]; changed: string[] } {
    const currentIds = new Map<string, string>();
    const previousIds = new Map<string, string>();

    for (const b of this.bundles.values()) {
      currentIds.set(b.id, b.hash);
    }
    for (const b of previous.bundles) {
      previousIds.set(b.id, b.hash);
    }

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const [id, hash] of currentIds) {
      if (!previousIds.has(id)) added.push(id);
      else if (previousIds.get(id) !== hash) changed.push(id);
    }
    for (const id of previousIds.keys()) {
      if (!currentIds.has(id)) removed.push(id);
    }

    return { added, removed, changed };
  }

  getBundle(id: string): Bundle | undefined {
    return this.bundles.get(id);
  }

  getBundleCount(): number {
    return this.bundles.size;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeBundleHash(assets: AssetEntry[]): string {
    // Simple hash from asset hashes
    let h = 0;
    for (const a of assets) {
      for (let i = 0; i < a.hash.length; i++) {
        h = ((h << 5) - h + a.hash.charCodeAt(i)) | 0;
      }
    }
    return `bundle_${Math.abs(h).toString(16)}`;
  }

  /**
   * Get all transitive dependencies of an asset.
   */
  getDependencyChain(assetId: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const asset = this.assets.get(id);
      if (!asset) return;
      for (const dep of asset.dependencies) {
        walk(dep);
      }
      chain.push(id);
    };

    walk(assetId);
    return chain;
  }
}
