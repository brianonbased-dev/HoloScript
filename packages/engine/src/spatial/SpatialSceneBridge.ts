/**
 * SpatialSceneBridge.ts — WIRE-1
 *
 * Runtime bridge: SpatialPartitionResult (from @holoscript/core compiler pass)
 * → OctreeLODSystem.bulkInsert() + GPUCullingSystem ObjectInstance[].
 *
 * This closes the compile-orphan gap described in SpatialPartitionPass.ts:
 *   - Before: SpatialPartitionPass emits a SpatialPartitionResult JSON artifact,
 *     but nothing in the engine consumed it at runtime.
 *   - After: `loadSpatialPartition()` initialises the OctreeLODSystem from the
 *     partition bounds, bulk-inserts all anchors, and produces ObjectInstance[]
 *     ready for GPUCullingSystem.cull().
 *
 * Dependency direction (preserved):
 *   engine → core is forbidden. This module uses structural typing
 *   (SpatialAnchorLike / SpatialPartitionResultLike) — the same technique
 *   used by SplatChunkStore — so no import from @holoscript/core is needed.
 *
 * Usage:
 * ```typescript
 * import { loadSpatialPartition, SpatialSceneBridge } from '@holoscript/engine/spatial';
 *
 * // One-shot load
 * const { octreeLOD, objectInstances } = loadSpatialPartition(compiledResult);
 *
 * // Frame-driven: LOD selection + GPU culling input
 * const bridge = new SpatialSceneBridge(compiledResult);
 * const frame = bridge.update(cam.x, cam.y, cam.z);
 * gpuCulling.cull(frame.objectInstances, camera);
 * const visibleAnchors = frame.lodSelection.anchors; // render these Gaussians
 * ```
 *
 * Research references:
 *   W.032 — Octree-GS LOD (anchor-based level selection, TPAMI 2025)
 *   W.034 — VR Gaussian budget (~180K total on Quest 3 at 72fps)
 *   D.058 — "Receipt rides to pixels" visual capstone
 *   D.059 — Staged matter assembly (world construction)
 *   idea-run-17 — WIRE-1 keystone card (2026-05-22)
 *
 * @module spatial
 */

import { OctreeLODSystem } from './OctreeLODSystem';
import type { GaussianAnchor, OctreeLODConfig, LODSelectionResult } from './OctreeLODSystem';
import type { ObjectInstance } from '../lod/GPUCullingSystem';

// =============================================================================
// STRUCTURAL TYPES (mirror @holoscript/core — no circular import)
// =============================================================================

/**
 * Structural mirror of SpatialPartitionPass.SpatialAnchor.
 * Kept in sync by structural typing: both have the same fields.
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
 * Structural mirror of SpatialPartitionPass.SpatialBounds.
 */
export interface SpatialBoundsLike {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  halfSize: number;
}

/**
 * Structural mirror of SpatialPartitionPass.SpatialPartitionResult.
 */
export interface SpatialPartitionResultLike {
  schema: string;
  compositionName: string;
  generatedAt: string;
  anchors: SpatialAnchorLike[];
  bounds: SpatialBoundsLike;
  merkleRoot: string;
  totalGaussians: number;
  stats: Record<string, unknown>;
}

// =============================================================================
// ONE-SHOT LOAD
// =============================================================================

/**
 * Result of `loadSpatialPartition()`.
 */
export interface SpatialLoadResult {
  /** Initialised OctreeLODSystem with all partition anchors loaded. */
  octreeLOD: OctreeLODSystem;
  /**
   * Anchors as ObjectInstance[] for GPUCullingSystem.cull().
   * LOD distances are derived from anchor scale (power-of-2 progression matching
   * OctreeLODSystem's default power-law thresholds).
   */
  objectInstances: ObjectInstance[];
  /** Number of anchors successfully inserted into the octree. */
  insertedCount: number;
  /** Merkle root from the partition result — carry into renderer for provenance. */
  merkleRoot: string;
  /** Total Gaussians across all anchors. */
  totalGaussians: number;
}

/**
 * Convert a SpatialAnchorLike to GaussianAnchor (structurally identical fields,
 * explicit cast avoids any import from @holoscript/core).
 */
function toGaussianAnchor(a: SpatialAnchorLike): GaussianAnchor {
  return {
    id: a.id,
    position: a.position, // [x,y,z] tuple — matches engine Vector3
    scale: a.scale,
    lodLevel: a.lodLevel,
    gaussianCount: a.gaussianCount,
    importance: a.importance,
  };
}

/**
 * Derive GPU-culling LOD distance thresholds from anchor scale.
 *
 * Strategy: power-of-2 doubling from the anchor's own scale, which is the
 * effective Gaussian cloud radius. A distance equal to the radius means we're
 * inside the cloud (highest detail); 2×, 4×, 8× correspond to falloff zones.
 * This is a conservative default — callers can override per-anchor via the
 * full SpatialSceneBridge.update() path.
 */
function deriveLODDistances(scale: number): [number, number, number, number] {
  const s = Math.max(scale, 0.01); // guard against zero-scale anchors
  return [s * 2.0, s * 4.0, s * 8.0, s * 16.0];
}

/**
 * Convert a SpatialAnchorLike + index to an ObjectInstance for GPUCullingSystem.
 */
function toObjectInstance(a: SpatialAnchorLike, idx: number): ObjectInstance {
  return {
    position: a.position,
    radius: Math.max(a.scale, 0.01),
    lodLevel: a.lodLevel,
    lodDistances: deriveLODDistances(a.scale),
    objectId: idx,
  };
}

/**
 * One-shot: initialise OctreeLODSystem from a SpatialPartitionResult and
 * bulk-insert all anchors. Returns the loaded system + GPU-culling inputs.
 *
 * @param result  Compiled SpatialPartitionResult from SpatialPartitionPass.
 * @param lodConfig  Optional overrides for OctreeLODSystem (VR budget, depth, etc.).
 */
export function loadSpatialPartition(
  result: SpatialPartitionResultLike,
  lodConfig?: Partial<OctreeLODConfig>,
): SpatialLoadResult {
  const octreeLOD = new OctreeLODSystem(lodConfig);

  // Initialise octree from compiled bounding volume
  const { center, halfSize } = result.bounds;
  octreeLOD.initialize(center.x, center.y, center.z, halfSize);

  // Bulk-insert: SpatialAnchor → GaussianAnchor (structural cast, no transform)
  const gaussianAnchors: GaussianAnchor[] = result.anchors.map(toGaussianAnchor);
  const insertedCount = octreeLOD.bulkInsert(gaussianAnchors);

  // Build ObjectInstance[] for GPU culling (parallel to anchor array)
  const objectInstances: ObjectInstance[] = result.anchors.map(toObjectInstance);

  return {
    octreeLOD,
    objectInstances,
    insertedCount,
    merkleRoot: result.merkleRoot,
    totalGaussians: result.totalGaussians,
  };
}

// =============================================================================
// FRAME-DRIVEN BRIDGE
// =============================================================================

/**
 * Per-frame update result from SpatialSceneBridge.
 */
export interface SpatialFrameResult {
  /** LOD selection from OctreeLODSystem for the current camera position. */
  lodSelection: LODSelectionResult;
  /**
   * ObjectInstance[] filtered to visible LOD levels — pass to GPUCullingSystem.
   * Anchors outside the selected LOD range are excluded to reduce GPU culling work.
   */
  objectInstances: ObjectInstance[];
  /** Camera position used for this frame (for debugging / receipts). */
  camera: [number, number, number];
}

/**
 * SpatialSceneBridge — frame-driven orchestrator.
 *
 * Wraps the loaded OctreeLODSystem and provides a per-frame `update()` that:
 *  1. Calls OctreeLODSystem.selectLOD(cameraX, cameraY, cameraZ)
 *  2. Filters ObjectInstances to the selected LOD levels
 *  3. Returns the frame result for downstream GPU culling + rendering
 *
 * Constructed from a SpatialPartitionResult; rebuild when the composition
 * changes (scene load, hot-reload).
 */
export class SpatialSceneBridge {
  private readonly octreeLOD: OctreeLODSystem;
  private readonly allInstances: ObjectInstance[];
  private readonly anchorLodLevels: number[];
  readonly merkleRoot: string;
  readonly totalGaussians: number;
  readonly compositionName: string;

  constructor(result: SpatialPartitionResultLike, lodConfig?: Partial<OctreeLODConfig>) {
    const loaded = loadSpatialPartition(result, lodConfig);
    this.octreeLOD = loaded.octreeLOD;
    this.allInstances = loaded.objectInstances;
    // Parallel array: lodLevel for each instance (for fast level-filter in update)
    this.anchorLodLevels = result.anchors.map((a) => a.lodLevel);
    this.merkleRoot = loaded.merkleRoot;
    this.totalGaussians = loaded.totalGaussians;
    this.compositionName = result.compositionName;
  }

  /**
   * Per-frame update: select active LOD levels for the given camera position
   * and return GPU-culling inputs filtered to those levels.
   *
   * @param cameraX  Camera world X
   * @param cameraY  Camera world Y
   * @param cameraZ  Camera world Z
   */
  update(cameraX: number, cameraY: number, cameraZ: number): SpatialFrameResult {
    const lodSelection = this.octreeLOD.selectLOD(cameraX, cameraY, cameraZ);
    const activeLevels = new Set(lodSelection.selectedLevels);

    // Filter to only instances at active LOD levels (GPU culling skips the rest)
    const objectInstances = this.allInstances.filter(
      (_, idx) => activeLevels.has(this.anchorLodLevels[idx]),
    );

    return {
      lodSelection,
      objectInstances,
      camera: [cameraX, cameraY, cameraZ],
    };
  }

  /**
   * The underlying OctreeLODSystem (for advanced use: budget queries, VR mode, etc.)
   */
  get lod(): OctreeLODSystem {
    return this.octreeLOD;
  }
}
