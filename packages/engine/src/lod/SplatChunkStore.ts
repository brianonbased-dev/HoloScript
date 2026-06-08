/**
 * SplatChunkStore — Fleet-Rail Chunk Addressing for Splat Streaming
 *
 * Maps octree node IDs (from SpatialPartitionPass) to addressable chunks
 * that can be fetched on demand by the LODStreamer. This is the "WIRE-3"
 * seam: SpatialPartitionPass emits node IDs → SplatChunkStore registers
 * chunks keyed by those IDs → view-driven streaming fetches via
 * GET /chunk/{nodeId}.
 *
 * Architecture:
 *  1. SpatialPartitionPass.run() produces a SpatialPartitionResult with
 *     SpatialAnchor[] (each carrying an `id` like `spa_<name>_l<level>`).
 *  2. SplatChunkStore.register(result) ingests all anchors, creating a
 *     ChunkEntry per anchor that carries provenance metadata + a
 *     content-addressable URL.
 *  3. LODStreamer queries the store for visible anchors (by LOD level,
 *     bounding box, or individual nodeId) and fetches chunks on demand.
 *  4. The fleet-rail URL scheme is: `<baseUrl>/chunk/<nodeId>` — a stable,
 *     cacheable address that any edge node can serve.
 *
 * Content-addressable URLs:
 *  - Each chunk URL embeds the provenanceHash, making it verifiable:
 *    `https://cdn.holoscript.net/chunk/spa_Terrain_l0?hash=<provenanceHash>`
 *  - R2/fetch backends serve from `<bucket>/<compositionId>/<nodeId>.bin`
 *
 * Provenance (D.058 / D.059 / Paper 34):
 *  - Each chunk carries a provenanceHash that chains into the
 *    SpatialPartitionResult.merkleRoot. A culled subtree is a verifiable
 *    provenance unit — "receipt rides to pixels" becomes structural.
 *
 * Research references:
 *  W.032 — Octree-GS LOD (anchor-based level selection, TPAMI 2025)
 *  W.034 — VR Gaussian budget (~180K total on Quest 3 at 72fps)
 *  D.058 — Visual evidence / receipt-to-pixel capstone
 *  D.059 — Staged matter assembly / world construction
 *  idea-run-17 — WIRE-3 keystone card (2026-05-22)
 *
 * @module SplatChunkStore
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single chunk entry in the store. Maps a SpatialAnchor's node ID to
 * a content-addressable URL and provenance metadata.
 */
export interface ChunkEntry {
  /** Octree node ID (matches SpatialAnchor.id, e.g. `spa_Terrain_l0`). */
  nodeId: string;
  /** LOD level (0 = coarsest, higher = finer). Matches SpatialAnchor.lodLevel. */
  lodLevel: number;
  /** Number of Gaussians in this chunk. */
  gaussianCount: number;
  /** Perceptual importance [0,1]. Higher = retained under budget pressure. */
  importance: number;
  /** World-space position [x, y, z] of the chunk's anchor. */
  position: [number, number, number];
  /** Effective scale (max axis radius) of the Gaussian cloud. */
  scale: number;
  /** Provenance hash (SHA-256 or deterministic content hash). */
  provenanceHash: string;
  /** Source .ply/.splat file path, if available. */
  sourceFile?: string;
  /** Content-addressable URL for fetching this chunk. */
  url: string;
  /** Size estimate in bytes (for budget-aware streaming). */
  estimatedSizeBytes: number;
  /** Composition name this chunk belongs to. */
  compositionName: string;
  /** Registration timestamp (ISO 8601). */
  registeredAt: string;
}

/**
 * Configuration for the chunk store.
 */
export interface SplatChunkStoreOptions {
  /** Base URL for fleet-rail chunk fetches (default: 'https://cdn.holoscript.net'). */
  baseUrl: string;
  /** Composition ID (namespace for chunk URLs, e.g. 'my-scene-v1'). */
  compositionId: string;
  /** Estimated bytes per Gaussian (for size estimation). Default: 56 (14 floats * 4 bytes). */
  bytesPerGaussian: number;
  /** Enable provenance hash verification on fetch. Default: true. */
  verifyProvenance: boolean;
  /** Debug logging. Default: false. */
  debug: boolean;
}

/**
 * Result of a chunk query — entries matching the query criteria.
 */
export interface ChunkQueryResult {
  /** Matching chunk entries. */
  entries: ChunkEntry[];
  /** Total Gaussian count across matched entries. */
  totalGaussians: number;
  /** Estimated total bytes across matched entries. */
  totalBytes: number;
  /** Number of distinct LOD levels in the result. */
  distinctLevels: number;
  /** Merkle root of the full composition (for provenance verification). */
  merkleRoot: string;
}

/**
 * Fleet-rail URL template for a chunk fetch. Variables:
 *  {baseUrl} — CDN base URL
 *  {compositionId} — composition namespace
 *  {nodeId} — octree node ID
 *  {provenanceHash} — content hash for verification
 */
export interface FleetRailURL {
  /** Full URL: {baseUrl}/chunk/{nodeId}?hash={provenanceHash} */
  full: string;
  /** Path only: /chunk/{nodeId} */
  path: string;
  /** Cache key for dedup: {compositionId}/{nodeId} */
  cacheKey: string;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_OPTIONS: SplatChunkStoreOptions = {
  baseUrl: 'https://cdn.holoscript.net',
  compositionId: 'default',
  bytesPerGaussian: 56, // 14 floats * 4 bytes (position, scale, rotation, color, opacity, etc.)
  verifyProvenance: true,
  debug: false,
};

// =============================================================================
// SPATIAL PARTITION ANCHOR INTERFACE
// =============================================================================

/**
 * Minimal interface matching SpatialPartitionPass.SpatialAnchor.
 * We use a structural type so core and engine don't need a direct import
 * (core does NOT import from engine per the dependency arrow convention
 * noted in SpatialPartitionPass.ts lines 13-16).
 *
 * The actual SpatialAnchor from core has these exact fields; the
 * structural type allows engine to consume it without a circular dep.
 */
export interface SpatialAnchorLike {
  id: string;
  position: [number, number, number];
  scale: number;
  lodLevel: number;
  gaussianCount: number;
  importance: number;
  provenanceHash: string;
  sourceFile?: string;
}

/**
 * Minimal interface matching SpatialPartitionResult.
 */
export interface SpatialPartitionResultLike {
  schema: string;
  compositionName: string;
  generatedAt: string;
  anchors: SpatialAnchorLike[];
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
    halfSize: number;
  };
  merkleRoot: string;
  totalGaussians: number;
  stats: Record<string, unknown>;
}

// =============================================================================
// SPLAT CHUNK STORE
// =============================================================================

/**
 * SplatChunkStore maps octree node IDs to addressable chunks for view-driven
 * splat streaming. It bridges SpatialPartitionPass output to the fleet-rail
 * URL scheme (GET /chunk/{nodeId}).
 *
 * Usage:
 * ```typescript
 * import { SplatChunkStore } from '@holoscript/engine/lod';
 * import { spatialPartition } from '@holoscript/core';
 *
 * const store = new SplatChunkStore({
 *   baseUrl: 'https://cdn.holoscript.net',
 *   compositionId: 'city-scene-v2',
 * });
 *
 * // Register all chunks from a SpatialPartitionResult
 * const result = spatialPartition(composition);
 * store.register(result);
 *
 * // Query chunks visible from a camera position
 * const visible = store.queryByLOD([0, 1, 2]); // coarsest 3 levels
 * for (const entry of visible.entries) {
 *   console.log(`Fetch: ${entry.url}`);
 * }
 * ```
 */
export class SplatChunkStore {
  private readonly options: SplatChunkStoreOptions;
  private readonly entries: Map<string, ChunkEntry> = new Map();
  private readonly lodIndex: Map<number, Set<string>> = new Map();
  private bounds: SpatialPartitionResultLike['bounds'] | null = null;
  private merkleRoot = '0'.repeat(64);
  private compositionName = '';
  private totalGaussians = 0;
  private registeredAt = '';

  constructor(options?: Partial<SplatChunkStoreOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register all anchors from a SpatialPartitionResult.
   * Each anchor becomes a ChunkEntry keyed by its nodeId.
   * Re-registering replaces all existing entries (fresh composition).
   */
  register(result: SpatialPartitionResultLike): void {
    // Clear previous composition
    this.clear();

    this.compositionName = result.compositionName;
    this.merkleRoot = result.merkleRoot;
    this.bounds = result.bounds;
    this.totalGaussians = result.totalGaussians;
    this.registeredAt = result.generatedAt;

    for (const anchor of result.anchors) {
      this.registerAnchor(anchor);
    }

    if (this.options.debug) {
      console.log(
        `[SplatChunkStore] Registered ${result.anchors.length} anchors ` +
          `for composition "${result.compositionName}" ` +
          `(total Gaussians: ${result.totalGaussians})`
      );
    }
  }

  /**
   * Register a single anchor. Can be used for incremental updates.
   */
  registerAnchor(anchor: SpatialAnchorLike): ChunkEntry {
    const url = this.buildFleetRailURL(anchor.id, anchor.provenanceHash);
    const estimatedSizeBytes = anchor.gaussianCount * this.options.bytesPerGaussian;

    const entry: ChunkEntry = {
      nodeId: anchor.id,
      lodLevel: anchor.lodLevel,
      gaussianCount: anchor.gaussianCount,
      importance: anchor.importance,
      position: anchor.position,
      scale: anchor.scale,
      provenanceHash: anchor.provenanceHash,
      sourceFile: anchor.sourceFile,
      url: url.full,
      estimatedSizeBytes,
      compositionName: this.compositionName || this.options.compositionId,
      registeredAt: this.registeredAt || new Date().toISOString(),
    };

    // Index by nodeId
    this.entries.set(anchor.id, entry);

    // Index by LOD level
    if (!this.lodIndex.has(anchor.lodLevel)) {
      this.lodIndex.set(anchor.lodLevel, new Set());
    }
    this.lodIndex.get(anchor.lodLevel)!.add(anchor.id);

    return entry;
  }

  /**
   * Deregister a single anchor by nodeId.
   */
  deregister(nodeId: string): boolean {
    const entry = this.entries.get(nodeId);
    if (!entry) return false;

    // Remove from LOD index
    const levelSet = this.lodIndex.get(entry.lodLevel);
    if (levelSet) {
      levelSet.delete(nodeId);
      if (levelSet.size === 0) {
        this.lodIndex.delete(entry.lodLevel);
      }
    }

    this.entries.delete(nodeId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Get a chunk entry by node ID. Returns undefined if not found.
   */
  get(nodeId: string): ChunkEntry | undefined {
    return this.entries.get(nodeId);
  }

  /**
   * Query chunks by LOD levels. Returns all chunks at the specified levels,
   * sorted coarsest-first (level ascending).
   */
  queryByLOD(levels: number[]): ChunkQueryResult {
    const entries: ChunkEntry[] = [];

    for (const level of levels) {
      const ids = this.lodIndex.get(level);
      if (ids) {
        for (const id of ids) {
          const entry = this.entries.get(id);
          if (entry) entries.push(entry);
        }
      }
    }

    // Sort coarsest-first
    entries.sort((a, b) => a.lodLevel - b.lodLevel);

    return this.buildQueryResult(entries);
  }

  /**
   * Query chunks by bounding box intersection.
   * Returns chunks whose anchor position falls within the AABB.
   */
  queryByBounds(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number
  ): ChunkQueryResult {
    const entries: ChunkEntry[] = [];

    for (const entry of this.entries.values()) {
      const [x, y, z] = entry.position;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ) {
        entries.push(entry);
      }
    }

    entries.sort((a, b) => a.lodLevel - b.lodLevel);
    return this.buildQueryResult(entries);
  }

  /**
   * Query chunks by camera distance. Returns chunks within `maxDistance`
   * of the camera position, sorted by distance (nearest first).
   */
  queryByDistance(
    cameraX: number,
    cameraY: number,
    cameraZ: number,
    maxDistance: number
  ): ChunkQueryResult {
    const maxDist2 = maxDistance * maxDistance;
    const entries: ChunkEntry[] = [];

    for (const entry of this.entries.values()) {
      const dx = entry.position[0] - cameraX;
      const dy = entry.position[1] - cameraY;
      const dz = entry.position[2] - cameraZ;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 <= maxDist2) {
        entries.push(entry);
      }
    }

    // Sort by distance (nearest first)
    entries.sort((a, b) => {
      const da2 =
        (a.position[0] - cameraX) ** 2 +
        (a.position[1] - cameraY) ** 2 +
        (a.position[2] - cameraZ) ** 2;
      const db2 =
        (b.position[0] - cameraX) ** 2 +
        (b.position[1] - cameraY) ** 2 +
        (b.position[2] - cameraZ) ** 2;
      return da2 - db2;
    });

    return this.buildQueryResult(entries);
  }

  /**
   * Query chunks by importance threshold. Returns chunks with importance
   * >= minImportance, sorted by importance descending.
   */
  queryByImportance(minImportance: number): ChunkQueryResult {
    const entries: ChunkEntry[] = [];

    for (const entry of this.entries.values()) {
      if (entry.importance >= minImportance) {
        entries.push(entry);
      }
    }

    entries.sort((a, b) => b.importance - a.importance);
    return this.buildQueryResult(entries);
  }

  /**
   * Get all chunk entries, sorted coarsest-first.
   */
  getAll(): ChunkQueryResult {
    const entries = Array.from(this.entries.values());
    entries.sort((a, b) => a.lodLevel - b.lodLevel);
    return this.buildQueryResult(entries);
  }

  /**
   * Get all distinct LOD levels present in the store.
   */
  getAvailableLevels(): number[] {
    return Array.from(this.lodIndex.keys()).sort((a, b) => a - b);
  }

  /**
   * Get the composition bounds (from the registered SpatialPartitionResult).
   */
  getBounds(): SpatialPartitionResultLike['bounds'] | null {
    return this.bounds;
  }

  /**
   * Get the merkle root of the registered composition.
   */
  getMerkleRoot(): string {
    return this.merkleRoot;
  }

  // ---------------------------------------------------------------------------
  // Fleet-Rail URL Generation
  // ---------------------------------------------------------------------------

  /**
   * Build a fleet-rail URL for a given node ID and provenance hash.
   */
  buildFleetRailURL(nodeId: string, provenanceHash: string): FleetRailURL {
    const path = `/chunk/${nodeId}`;
    const cacheKey = `${this.options.compositionId}/${nodeId}`;

    if (this.options.verifyProvenance) {
      return {
        full: `${this.options.baseUrl}${path}?hash=${provenanceHash}`,
        path,
        cacheKey,
      };
    }

    return {
      full: `${this.options.baseUrl}${path}`,
      path,
      cacheKey,
    };
  }

  /**
   * Parse a fleet-rail URL back to its nodeId and provenanceHash.
   */
  parseFleetRailURL(url: string): { nodeId: string; provenanceHash?: string } | null {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/^\/chunk\/(.+)$/);
    if (!pathMatch) return null;

    const nodeId = pathMatch[1];
    const provenanceHash = urlObj.searchParams.get('hash') ?? undefined;

    return { nodeId, provenanceHash };
  }

  // ---------------------------------------------------------------------------
  // Budget-Aware Streaming
  // ---------------------------------------------------------------------------

  /**
   * Select chunks for streaming within a Gaussian budget.
   * Prioritises by importance (higher first), then by LOD level (coarser first).
   * Returns as many chunks as fit within the budget.
   */
  selectForBudget(gaussianBudget: number): ChunkQueryResult {
    const entries = Array.from(this.entries.values());

    // Sort by importance descending, then by LOD level ascending (coarser first)
    entries.sort((a, b) => {
      if (a.importance !== b.importance) return b.importance - a.importance;
      return a.lodLevel - b.lodLevel;
    });

    const selected: ChunkEntry[] = [];
    let remaining = gaussianBudget;

    for (const entry of entries) {
      if (entry.gaussianCount <= remaining) {
        selected.push(entry);
        remaining -= entry.gaussianCount;
      }
    }

    return this.buildQueryResult(selected);
  }

  /**
   * Select chunks for streaming within a byte budget.
   * Prioritises by importance (higher first), then by LOD level (coarser first).
   */
  selectForByteBudget(byteBudget: number): ChunkQueryResult {
    const entries = Array.from(this.entries.values());

    entries.sort((a, b) => {
      if (a.importance !== b.importance) return b.importance - a.importance;
      return a.lodLevel - b.lodLevel;
    });

    const selected: ChunkEntry[] = [];
    let remaining = byteBudget;

    for (const entry of entries) {
      if (entry.estimatedSizeBytes <= remaining) {
        selected.push(entry);
        remaining -= entry.estimatedSizeBytes;
      }
    }

    return this.buildQueryResult(selected);
  }

  // ---------------------------------------------------------------------------
  // Provenance Verification
  // ---------------------------------------------------------------------------

  /**
   * Verify that a fetched chunk matches its expected provenance hash.
   * In production, this would compute the hash over the fetched bytes and
   * compare against the stored provenanceHash. For now, returns true
   * if the hash strings match.
   */
  verifyChunk(nodeId: string, claimedHash: string): boolean {
    const entry = this.entries.get(nodeId);
    if (!entry) return false;
    return entry.provenanceHash === claimedHash;
  }

  // ---------------------------------------------------------------------------
  // Store Metrics
  // ---------------------------------------------------------------------------

  /**
   * Get store metrics.
   */
  getMetrics(): {
    totalChunks: number;
    totalGaussians: number;
    totalBytes: number;
    levels: number[];
    levelDistribution: Record<number, number>;
    compositionName: string;
    registeredAt: string;
  } {
    const levelDistribution: Record<number, number> = {};
    let totalGaussians = 0;
    let totalBytes = 0;

    for (const entry of this.entries.values()) {
      levelDistribution[entry.lodLevel] = (levelDistribution[entry.lodLevel] ?? 0) + 1;
      totalGaussians += entry.gaussianCount;
      totalBytes += entry.estimatedSizeBytes;
    }

    return {
      totalChunks: this.entries.size,
      totalGaussians,
      totalBytes,
      levels: Array.from(this.lodIndex.keys()).sort((a, b) => a - b),
      levelDistribution,
      compositionName: this.compositionName,
      registeredAt: this.registeredAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Check if a node ID is registered.
   */
  has(nodeId: string): boolean {
    return this.entries.has(nodeId);
  }

  /**
   * Get the number of registered chunks.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
    this.lodIndex.clear();
    this.bounds = null;
    this.merkleRoot = '0'.repeat(64);
    this.compositionName = '';
    this.totalGaussians = 0;
    this.registeredAt = '';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a ChunkQueryResult from an array of entries.
   * Includes the store's merkle root for provenance verification.
   */
  private buildQueryResult(entries: ChunkEntry[]): ChunkQueryResult {
    const totalGaussians = entries.reduce((s, e) => s + e.gaussianCount, 0);
    const totalBytes = entries.reduce((s, e) => s + e.estimatedSizeBytes, 0);
    const levels = new Set(entries.map((e) => e.lodLevel));

    return {
      entries,
      totalGaussians,
      totalBytes,
      distinctLevels: levels.size,
      merkleRoot: this.merkleRoot,
    };
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a SplatChunkStore with default options.
 */
export function createSplatChunkStore(options?: Partial<SplatChunkStoreOptions>): SplatChunkStore {
  return new SplatChunkStore(options);
}

/**
 * Create a SplatChunkStore optimised for VR streaming (Quest 3 / mobile).
 */
export function createVRSplatChunkStore(compositionId: string): SplatChunkStore {
  return new SplatChunkStore({
    baseUrl: 'https://cdn.holoscript.net',
    compositionId,
    bytesPerGaussian: 56,
    verifyProvenance: true,
  });
}

/**
 * Create a SplatChunkStore optimised for desktop/high-end.
 */
export function createDesktopSplatChunkStore(compositionId: string): SplatChunkStore {
  return new SplatChunkStore({
    baseUrl: 'https://cdn.holoscript.net',
    compositionId,
    bytesPerGaussian: 56,
    verifyProvenance: true,
  });
}
