/**
 * SceneBundler — Asset collection, tree-shaking, and manifest generation
 *
 * Collects all assets referenced by a scene, performs tree-shaking
 * to remove unused references, splits into chunks, and generates
 * a deployment manifest.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BundleAsset {
  id: string;
  type: 'mesh' | 'texture' | 'audio' | 'shader' | 'script' | 'data';
  path: string;
  sizeBytes: number;
  references: string[];
  chunk?: string;
}

export interface BundleChunk {
  id: string;
  name: string;
  assets: string[];
  totalSize: number;
  priority: 'critical' | 'high' | 'normal' | 'lazy';
}

export interface BundleManifest {
  version: string;
  buildId: string;
  chunks: BundleChunk[];
  totalAssets: number;
  totalSize: number;
  treeShakenCount: number;
  createdAt: number;
  entryChunk: string;
}

export interface BundleConfig {
  maxChunkSize: number;
  enableTreeShaking: boolean;
  entryPoints: string[];
}

// =============================================================================
// SCENE BUNDLER
// =============================================================================

export class SceneBundler {
  private assets: Map<string, BundleAsset> = new Map();
  private entryPoints: Set<string> = new Set();
  private config: BundleConfig;

  constructor(config: Partial<BundleConfig> = {}) {
    this.config = {
      maxChunkSize: config.maxChunkSize ?? 5 * 1024 * 1024, // 5MB
      enableTreeShaking: config.enableTreeShaking ?? true,
      entryPoints: config.entryPoints ?? [],
    };

    for (const ep of this.config.entryPoints) {
      this.entryPoints.add(ep);
    }
  }

  /**
   * Register an asset
   */
  addAsset(asset: BundleAsset): void {
    this.assets.set(asset.id, { ...asset });
  }

  /**
   * Add an entry point
   */
  addEntryPoint(assetId: string): void {
    this.entryPoints.add(assetId);
  }

  /**
   * Perform tree-shaking — remove unreachable assets from entry points
   */
  treeShake(): string[] {
    if (!this.config.enableTreeShaking) return [];

    const reachable = new Set<string>();

    const visit = (id: string) => {
      if (reachable.has(id)) return;
      const asset = this.assets.get(id);
      if (!asset) return;
      reachable.add(id);
      for (const ref of asset.references) {
        visit(ref);
      }
    };

    for (const entry of this.entryPoints) {
      visit(entry);
    }

    const removed: string[] = [];
    for (const id of this.assets.keys()) {
      if (!reachable.has(id)) {
        removed.push(id);
      }
    }

    for (const id of removed) {
      this.assets.delete(id);
    }

    return removed;
  }

  /**
   * Split assets into chunks based on size limits
   */
  splitChunks(): BundleChunk[] {
    const chunks: BundleChunk[] = [];

    // Critical chunk = entry point assets
    const criticalAssets = [...this.entryPoints].filter((id) => this.assets.has(id));
    if (criticalAssets.length > 0) {
      const criticalSize = criticalAssets.reduce(
        (sum, id) => sum + (this.assets.get(id)?.sizeBytes || 0),
        0
      );
      chunks.push({
        id: 'chunk_critical',
        name: 'Critical',
        assets: criticalAssets,
        totalSize: criticalSize,
        priority: 'critical',
      });
    }

    // Remaining assets grouped by type
    const remaining = [...this.assets.entries()].filter(([id]) => !this.entryPoints.has(id));

    let currentChunk: BundleChunk = {
      id: `chunk_${chunks.length}`,
      name: `Chunk ${chunks.length}`,
      assets: [],
      totalSize: 0,
      priority: 'normal',
    };

    for (const [id, asset] of remaining) {
      if (
        currentChunk.totalSize + asset.sizeBytes > this.config.maxChunkSize &&
        currentChunk.assets.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = {
          id: `chunk_${chunks.length}`,
          name: `Chunk ${chunks.length}`,
          assets: [],
          totalSize: 0,
          priority: 'normal',
        };
      }
      currentChunk.assets.push(id);
      currentChunk.totalSize += asset.sizeBytes;
    }

    if (currentChunk.assets.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Generate full bundle manifest
   */
  bundle(): BundleManifest {
    const treeShakenCount = this.treeShake().length;
    const chunks = this.splitChunks();
    const totalSize = [...this.assets.values()].reduce((s, a) => s + a.sizeBytes, 0);

    return {
      version: '1.0.0',
      buildId: `build_${Date.now()}`,
      chunks,
      totalAssets: this.assets.size,
      totalSize,
      treeShakenCount,
      createdAt: Date.now(),
      entryChunk: chunks[0]?.id || '',
    };
  }

  /**
   * Get asset by ID
   */
  getAsset(id: string): BundleAsset | undefined {
    return this.assets.get(id);
  }

  /**
   * Get total asset count
   */
  getAssetCount(): number {
    return this.assets.size;
  }
}
