/**
 * @holoscript/core Asset Manifest
 *
 * Central catalog for all project assets with metadata, discovery, and validation.
 * Enables smart asset loading, dependency resolution, and platform optimization.
 */

import { AssetMetadata, AssetFormat, AssetType } from './AssetMetadata';

// ============================================================================
// Manifest Configuration
// ============================================================================

export interface ManifestConfig {
  /** Manifest version */
  version: string;

  /** Project name */
  projectName: string;

  /** Base URL for asset loading */
  baseUrl: string;

  /** CDN URL (optional) */
  cdnUrl?: string;

  /** Default asset settings */
  defaults: {
    /** Default compression format */
    compression: 'none' | 'draco' | 'meshopt' | 'gzip';

    /** Default texture format */
    textureFormat: 'png' | 'webp' | 'ktx2' | 'basis';

    /** Default LOD settings */
    lod: {
      enabled: boolean;
      levels: number;
      distances: number[];
    };

    /** Default cache policy */
    cachePolicy: 'immutable' | 'stale-while-revalidate' | 'no-cache';
  };

  /** Platform-specific overrides */
  platformOverrides?: {
    mobile?: Partial<ManifestConfig['defaults']>;
    vr?: Partial<ManifestConfig['defaults']>;
    desktop?: Partial<ManifestConfig['defaults']>;
  };
}

// ============================================================================
// Asset Groups
// ============================================================================

export interface AssetGroup {
  /** Group identifier */
  id: string;

  /** Group name */
  name: string;

  /** Group description */
  description?: string;

  /** Asset IDs in this group */
  assetIds: string[];

  /** Preload priority (0-10, higher = load first) */
  preloadPriority: number;

  /** Load strategy */
  loadStrategy: 'eager' | 'lazy' | 'on-demand';

  /** Tags for filtering */
  tags: string[];
}

// ============================================================================
// Manifest Statistics
// ============================================================================

export interface ManifestStats {
  /** Total number of assets */
  totalAssets: number;

  /** Assets by type */
  byType: Record<AssetType, number>;

  /** Assets by format */
  byFormat: Record<string, number>;

  /** Total file size (bytes) */
  totalSize: number;

  /** Estimated total GPU memory */
  estimatedGPUMemory: number;

  /** Estimated total CPU memory */
  estimatedCPUMemory: number;

  /** Number of validated assets */
  validatedCount: number;

  /** Number of assets with errors */
  errorCount: number;

  /** Number of assets with warnings */
  warningCount: number;

  /** Last updated timestamp */
  lastUpdated: string;
}

// ============================================================================
// Asset Manifest
// ============================================================================

export interface AssetManifestData {
  /** Manifest configuration */
  config: ManifestConfig;

  /** All assets indexed by ID */
  assets: Record<string, AssetMetadata>;

  /** Asset groups */
  groups: AssetGroup[];

  /** Computed statistics */
  stats: ManifestStats;

  /** Manifest creation timestamp */
  createdAt: string;

  /** Last modification timestamp */
  modifiedAt: string;
}

// ============================================================================
// Asset Manifest Class
// ============================================================================

export class AssetManifest {
  private config: ManifestConfig;
  private assets: Map<string, AssetMetadata> = new Map();
  private groups: Map<string, AssetGroup> = new Map();
  private pathIndex: Map<string, string> = new Map(); // path -> id
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> Set<id>
  private typeIndex: Map<AssetType, Set<string>> = new Map(); // type -> Set<id>
  private createdAt: string;
  private modifiedAt: string;

  constructor(config: ManifestConfig) {
    this.config = config;
    this.createdAt = new Date().toISOString();
    this.modifiedAt = this.createdAt;
  }

  // ─── Asset Management ────────────────────────────────────────────────────

  /**
   * Add an asset to the manifest
   */
  addAsset(asset: AssetMetadata): void {
    this.assets.set(asset.id, asset);
    this.pathIndex.set(asset.sourcePath, asset.id);

    // Update tag index
    for (const tag of asset.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(asset.id);
    }

    // Update type index
    if (!this.typeIndex.has(asset.assetType)) {
      this.typeIndex.set(asset.assetType, new Set());
    }
    this.typeIndex.get(asset.assetType)!.add(asset.id);

    this.modifiedAt = new Date().toISOString();
  }

  /**
   * Add multiple assets
   */
  addAssets(assets: AssetMetadata[]): void {
    for (const asset of assets) {
      this.addAsset(asset);
    }
  }

  /**
   * Remove an asset from the manifest
   */
  removeAsset(assetId: string): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;

    this.assets.delete(assetId);
    this.pathIndex.delete(asset.sourcePath);

    // Remove from tag index
    for (const tag of asset.tags) {
      this.tagIndex.get(tag)?.delete(assetId);
    }

    // Remove from type index
    this.typeIndex.get(asset.assetType)?.delete(assetId);

    // Remove from groups
    for (const group of this.groups.values()) {
      const idx = group.assetIds.indexOf(assetId);
      if (idx !== -1) {
        group.assetIds.splice(idx, 1);
      }
    }

    this.modifiedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get asset by ID
   */
  getAsset(assetId: string): AssetMetadata | undefined {
    return this.assets.get(assetId);
  }

  /**
   * Get asset by path
   */
  getAssetByPath(path: string): AssetMetadata | undefined {
    const id = this.pathIndex.get(path);
    return id ? this.assets.get(id) : undefined;
  }

  /**
   * Check if asset exists
   */
  hasAsset(assetId: string): boolean {
    return this.assets.has(assetId);
  }

  /**
   * Get all assets
   */
  getAllAssets(): AssetMetadata[] {
    return Array.from(this.assets.values());
  }

  /**
   * Update asset metadata
   */
  updateAsset(assetId: string, updates: Partial<AssetMetadata>): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;

    // Handle tag changes
    if (updates.tags) {
      // Remove old tags
      for (const tag of asset.tags) {
        this.tagIndex.get(tag)?.delete(assetId);
      }
      // Add new tags
      for (const tag of updates.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(assetId);
      }
    }

    // Handle type changes
    if (updates.assetType && updates.assetType !== asset.assetType) {
      this.typeIndex.get(asset.assetType)?.delete(assetId);
      if (!this.typeIndex.has(updates.assetType)) {
        this.typeIndex.set(updates.assetType, new Set());
      }
      this.typeIndex.get(updates.assetType)!.add(assetId);
    }

    // Merge updates
    Object.assign(asset, updates, { modifiedAt: new Date().toISOString() });
    this.modifiedAt = new Date().toISOString();

    return true;
  }

  // ─── Query Methods ───────────────────────────────────────────────────────

  /**
   * Find assets by tag
   */
  findByTag(tag: string): AssetMetadata[] {
    const ids = this.tagIndex.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.assets.get(id))
      .filter((a): a is AssetMetadata => a !== undefined);
  }

  /**
   * Find assets by multiple tags (AND)
   */
  findByTags(tags: string[]): AssetMetadata[] {
    if (tags.length === 0) return [];

    const sets = tags.map((t) => this.tagIndex.get(t) ?? new Set<string>());
    const intersection = sets.reduce((acc, set) => {
      return new Set([...acc].filter((id) => set.has(id)));
    });

    return Array.from(intersection)
      .map((id) => this.assets.get(id))
      .filter((a): a is AssetMetadata => a !== undefined);
  }

  /**
   * Find assets by type
   */
  findByType(type: AssetType): AssetMetadata[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.assets.get(id))
      .filter((a): a is AssetMetadata => a !== undefined);
  }

  /**
   * Find assets by format
   */
  findByFormat(format: AssetFormat): AssetMetadata[] {
    return Array.from(this.assets.values()).filter((a) => a.format === format);
  }

  /**
   * Search assets by name or description
   */
  search(query: string): AssetMetadata[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.assets.values()).filter(
      (a) =>
        a.name.toLowerCase().includes(lowerQuery) ||
        a.displayName.toLowerCase().includes(lowerQuery) ||
        a.description?.toLowerCase().includes(lowerQuery) ||
        a.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Find assets with validation errors
   */
  findWithErrors(): AssetMetadata[] {
    return Array.from(this.assets.values()).filter((a) => a.validationErrors.length > 0);
  }

  /**
   * Find assets with validation warnings
   */
  findWithWarnings(): AssetMetadata[] {
    return Array.from(this.assets.values()).filter((a) => a.validationWarnings.length > 0);
  }

  /**
   * Find unvalidated assets
   */
  findUnvalidated(): AssetMetadata[] {
    return Array.from(this.assets.values()).filter((a) => !a.validated);
  }

  // ─── Group Management ────────────────────────────────────────────────────

  /**
   * Create asset group
   */
  createGroup(group: AssetGroup): void {
    this.groups.set(group.id, group);
    this.modifiedAt = new Date().toISOString();
  }

  /**
   * Get group by ID
   */
  getGroup(groupId: string): AssetGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get all groups
   */
  getAllGroups(): AssetGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Add asset to group
   */
  addAssetToGroup(assetId: string, groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group || !this.assets.has(assetId)) return false;

    if (!group.assetIds.includes(assetId)) {
      group.assetIds.push(assetId);
      this.modifiedAt = new Date().toISOString();
    }

    return true;
  }

  /**
   * Remove asset from group
   */
  removeAssetFromGroup(assetId: string, groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    const idx = group.assetIds.indexOf(assetId);
    if (idx === -1) return false;

    group.assetIds.splice(idx, 1);
    this.modifiedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get assets in group
   */
  getGroupAssets(groupId: string): AssetMetadata[] {
    const group = this.groups.get(groupId);
    if (!group) return [];

    return group.assetIds
      .map((id) => this.assets.get(id))
      .filter((a): a is AssetMetadata => a !== undefined);
  }

  /**
   * Get preload queue (sorted by priority)
   */
  getPreloadQueue(): AssetMetadata[] {
    const groups = Array.from(this.groups.values())
      .filter((g) => g.loadStrategy === 'eager')
      .sort((a, b) => b.preloadPriority - a.preloadPriority);

    const seen = new Set<string>();
    const result: AssetMetadata[] = [];

    for (const group of groups) {
      for (const id of group.assetIds) {
        if (!seen.has(id)) {
          seen.add(id);
          const asset = this.assets.get(id);
          if (asset) {
            result.push(asset);
          }
        }
      }
    }

    return result;
  }

  // ─── Statistics ──────────────────────────────────────────────────────────

  /**
   * Compute manifest statistics
   */
  computeStats(): ManifestStats {
    const assets = Array.from(this.assets.values());

    const byType: Record<string, number> = {};
    const byFormat: Record<string, number> = {};
    let totalSize = 0;
    let estimatedGPUMemory = 0;
    let estimatedCPUMemory = 0;
    let validatedCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (const asset of assets) {
      byType[asset.assetType] = (byType[asset.assetType] ?? 0) + 1;
      byFormat[asset.format] = (byFormat[asset.format] ?? 0) + 1;
      totalSize += asset.fileSize;
      estimatedGPUMemory += asset.estimatedGPUMemory;
      estimatedCPUMemory += asset.estimatedCPUMemory;

      if (asset.validated) validatedCount++;
      if (asset.validationErrors.length > 0) errorCount++;
      if (asset.validationWarnings.length > 0) warningCount++;
    }

    return {
      totalAssets: assets.length,
      byType: byType as Record<AssetType, number>,
      byFormat,
      totalSize,
      estimatedGPUMemory,
      estimatedCPUMemory,
      validatedCount,
      errorCount,
      warningCount,
      lastUpdated: this.modifiedAt,
    };
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  /**
   * Export manifest to JSON
   */
  toJSON(): AssetManifestData {
    return {
      config: this.config,
      assets: Object.fromEntries(this.assets),
      groups: Array.from(this.groups.values()),
      stats: this.computeStats(),
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
    };
  }

  /**
   * Import manifest from JSON
   */
  static fromJSON(data: AssetManifestData): AssetManifest {
    const manifest = new AssetManifest(data.config);

    // Add assets
    for (const asset of Object.values(data.assets)) {
      manifest.addAsset(asset);
    }

    // Add groups
    for (const group of data.groups) {
      manifest.createGroup(group);
    }

    // Restore original timestamps AFTER adding assets/groups
    // (addAsset/createGroup update modifiedAt, so we restore it here)
    manifest.createdAt = data.createdAt;
    manifest.modifiedAt = data.modifiedAt;

    return manifest;
  }

  /**
   * Get configuration
   */
  getConfig(): ManifestConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ManifestConfig>): void {
    Object.assign(this.config, updates);
    this.modifiedAt = new Date().toISOString();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new empty manifest
 */
export function createManifest(
  projectName: string,
  baseUrl: string,
  options?: Partial<ManifestConfig>
): AssetManifest {
  const config: ManifestConfig = {
    version: '1.0.0',
    projectName,
    baseUrl,
    defaults: {
      compression: 'gzip',
      textureFormat: 'webp',
      lod: {
        enabled: true,
        levels: 3,
        distances: [10, 25, 50],
      },
      cachePolicy: 'stale-while-revalidate',
    },
    ...options,
  };

  return new AssetManifest(config);
}

/**
 * Load manifest from URL
 */
export async function loadManifest(url: string): Promise<AssetManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.statusText}`);
  }

  const data = (await response.json()) as AssetManifestData;
  return AssetManifest.fromJSON(data);
}
