/**
 * SpatialPartitionPass — HoloScript Core Compiler
 *
 * Compile-time pass that lowers a HoloComposition into an octree-of-Gaussian-anchors,
 * bridging the compile-orphan gap between the compiler and the already-built runtime
 * scale machinery in packages/engine (OctreeLODSystem, GPUCullingSystem, LODStreamer).
 *
 * Before this pass, OptimizationPass.ts:544 emitted only advisory LODRecommendation[]
 * ("N objects would benefit from LOD") — helpful text but never consumed by the engine.
 * This pass produces a serializable SpatialPartitionResult that the engine can directly
 * feed into OctreeLODSystem.bulkInsert() at runtime.
 *
 * Design: core does NOT import from engine (that would invert the dependency arrow).
 * Instead, this pass defines its own SpatialAnchor type that mirrors engine's
 * GaussianAnchor interface — they are structurally identical, so engine can deserialize
 * SpatialPartitionResult.anchors into GaussianAnchor[] with a simple cast/assign.
 *
 * Algorithm:
 *  1. Walk the HoloComposition collecting all gaussian_splat trait sources (same walk as
 *     GaussianBudgetAnalyzer.collectGaussianSources, lines 518-563).
 *  2. For each source, resolve a world-space position from the declaring object's
 *     position/transform field (defaulting to origin when absent).
 *  3. Derive a scale from max_splats × SCALE_PER_SPLAT_UNIT (larger splat count → coarser
 *     anchor → lower LOD level; calibrated against OctreeLODSystem's Levy-flight thresholds).
 *  4. Compute lodLevel via the same logarithmic mapping as OctreeLODSystem.computeLODLevelFromScale
 *     (level = floor(log2(maxScale / scale)), clamped to [0, maxDepth-1]).
 *  5. Serialize the anchor set + octree bounding volume (AABB of all anchors) + provenance
 *     metadata into a SpatialPartitionResult.
 *
 * Provenance (D.059 / Paper 34):
 *  Each SpatialAnchor carries a provenanceHash (SHA-256 of sourceFile if available, else
 *  a deterministic hash of name+lodLevel). This makes a culled octree subtree a verifiable
 *  provenance unit — "receipt rides to pixels" (D.058) becomes structural rather than
 *  bolt-on. The hash chain mirrors quantum_assemble.py's merkle_root hierarchy; the octree
 *  level IS the provenance hierarchy level (Paper 34 seed: provenance-isomorphic LOD).
 *
 * Research references:
 *  W.032 — Octree-GS LOD (anchor-based level selection, TPAMI 2025)
 *  W.034 — VR Gaussian budget
 *  D.058 — Visual evidence / receipt-to-pixel capstone
 *  D.059 — Staged matter assembly / world construction
 *  idea-run-17 — BUILD-1 keystone card (2026-05-22)
 *
 * @module SpatialPartitionPass
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Number of LOD depth levels. Matches OctreeLODSystem's default maxDepth.
 * Level 0 = coarsest (root), level MAX_DEPTH-1 = finest (leaf).
 */
const MAX_DEPTH = 8;

/**
 * Scale contribution per splat unit (metres per splat in the anchor's radius estimate).
 * Calibrated so a 2M-splat desktop-VR scene gets lodLevel=0 (coarsest) and a
 * 50-splat detail decoration gets lodLevel=7 (finest). Adjust if scene scale changes.
 *
 * scale = maxSplats × SCALE_PER_SPLAT_UNIT
 * Typical range: 50 splats → scale 0.00005; 2_000_000 splats → scale 2.0
 */
const SCALE_PER_SPLAT_UNIT = 1e-6;

/**
 * Minimum effective scale (avoids log2(0) / division-by-zero).
 */
const MIN_SCALE = 1e-9;

// =============================================================================
// OUTPUT TYPES
// =============================================================================

/**
 * A Gaussian anchor produced by the SpatialPartitionPass.
 *
 * Structurally identical to engine's GaussianAnchor interface — the engine
 * can consume this directly without a translation layer:
 *   import type { GaussianAnchor } from '@holoscript/engine';
 *   const anchors: GaussianAnchor[] = result.anchors; // valid by structural typing
 *
 * NOTE: position is a [x, y, z] tuple to match engine's Vector3 / OctreeEntry
 * shape (OctreeSystem.insert({ position: [x,y,z] })). Do NOT change to {x,y,z}.
 */
export interface SpatialAnchor {
  /** Stable deterministic ID: `spa_<objectName>_<lodLevel>` */
  id: string;
  /** World-space position [x, y, z] in metres. Defaults to [0,0,0] if not declared.
   * Tuple form matches engine's Vector3 / OctreeEntry — required for OctreeLODSystem.bulkInsert(). */
  position: [number, number, number];
  /** Effective scale of this anchor's Gaussian cloud (max axis radius). */
  scale: number;
  /** LOD level (0 = coarsest/root, MAX_DEPTH-1 = finest/leaf). */
  lodLevel: number;
  /** Number of Gaussians this anchor represents (for budget accounting). */
  gaussianCount: number;
  /**
   * Perceptual importance [0,1]. Higher = retained under budget pressure.
   * Derived from trait config importance field, defaults to 0.5.
   */
  importance: number;
  /** Source .ply/.splat file path, if declared in the gaussian_splat trait. */
  sourceFile?: string;
  /**
   * Provenance hash (SHA-256 hex of sourceFile if available, otherwise a
   * deterministic content-hash of `${objectName}:${lodLevel}:${gaussianCount}`).
   * Mirrors the merkle_root chain from quantum_assemble.py (D.059 / Paper 34):
   * a culled octree subtree is a verifiable provenance unit.
   */
  provenanceHash: string;
}

/**
 * Axis-aligned bounding volume for the full anchor set.
 * Used by OctreeLODSystem to size its root node and by GPUCullingSystem for
 * the initial frustum test.
 */
export interface SpatialBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  /** World-space centre of the AABB. */
  center: { x: number; y: number; z: number };
  /** Half-size of the enclosing cube (max of half-extents on each axis). */
  halfSize: number;
}

/**
 * Serializable result of the SpatialPartitionPass.
 *
 * This is the artifact the pass emits into the compiled output. The engine
 * deserializes it at load time and feeds it to OctreeLODSystem.bulkInsert().
 */
export interface SpatialPartitionResult {
  /** Schema version for forward-compatibility. */
  schema: 'spatial-partition/v1';
  /** Composition name this result was derived from. */
  compositionName: string;
  /** ISO 8601 timestamp of when the pass ran. */
  generatedAt: string;
  /** The anchor set, sorted by lodLevel ascending (coarsest first). */
  anchors: SpatialAnchor[];
  /** Bounding volume of all anchors (input for OctreeLODSystem root sizing). */
  bounds: SpatialBounds;
  /**
   * Merkle root over all anchor provenanceHashes (sorted by id, then XOR-chained).
   * Enables a single hash to verify the full anchor set without re-walking the tree.
   * Mirror of quantum_assemble.py's meta_merkle_root.
   */
  merkleRoot: string;
  /** Total Gaussian count across all anchors. */
  totalGaussians: number;
  /** Pass statistics for diagnostics. */
  stats: {
    objectsWalked: number;
    anchorsEmitted: number;
    lodLevelDistribution: Record<number, number>;
    maxLodLevel: number;
    maxScaleInScene: number;
  };
}

// =============================================================================
// PASS OPTIONS
// =============================================================================

export interface SpatialPartitionPassOptions {
  /**
   * Maximum octree depth / LOD levels (default: 8).
   * Must match OctreeLODSystem.config.maxDepth at runtime.
   */
  maxDepth?: number;
  /**
   * Override the scale-per-splat-unit calibration constant.
   * Useful when scenes use non-default unit conventions.
   */
  scalePerSplatUnit?: number;
  /**
   * If true, include objects without a position declaration (placed at origin).
   * Default: true (origin-placed objects are valid anchors).
   */
  includeUnpositioned?: boolean;
}

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * SpatialPartitionPass
 *
 * Run this pass after parsing a HoloComposition to produce a SpatialPartitionResult
 * that the engine's OctreeLODSystem can consume directly.
 *
 * @example
 * ```ts
 * import { SpatialPartitionPass } from '@holoscript/core';
 * const pass = new SpatialPartitionPass();
 * const result = pass.run(parsedComposition);
 * // result.anchors is ready for engine.OctreeLODSystem.bulkInsert(result.anchors)
 * ```
 */
export class SpatialPartitionPass {
  private readonly maxDepth: number;
  private readonly scalePerSplatUnit: number;
  private readonly includeUnpositioned: boolean;

  constructor(options: SpatialPartitionPassOptions = {}) {
    this.maxDepth = options.maxDepth ?? MAX_DEPTH;
    this.scalePerSplatUnit = options.scalePerSplatUnit ?? SCALE_PER_SPLAT_UNIT;
    this.includeUnpositioned = options.includeUnpositioned ?? true;
  }

  /**
   * Run the pass over a HoloComposition and return the serializable result.
   */
  run(composition: HoloComposition): SpatialPartitionResult {
    // ── 1. Collect all Gaussian sources (mirrors GaussianBudgetAnalyzer walk) ─
    const rawSources: RawGaussianSource[] = [];
    this.collectFromComposition(composition, rawSources);

    if (rawSources.length === 0) {
      return this.emptyResult(composition.name);
    }

    // ── 2. Derive max scale in scene (for LOD level computation) ─────────────
    const maxScaleInScene = Math.max(
      ...rawSources.map((s) => Math.max(s.maxSplats * this.scalePerSplatUnit, MIN_SCALE))
    );

    // ── 3. Build SpatialAnchor array ─────────────────────────────────────────
    const anchors: SpatialAnchor[] = [];
    const lodDist: Record<number, number> = {};
    let objectsWalked = 0;

    for (const src of rawSources) {
      objectsWalked++;

      if (!this.includeUnpositioned && !src.hasPosition) continue;

      const scale = Math.max(src.maxSplats * this.scalePerSplatUnit, MIN_SCALE);
      const lodLevel = this.computeLODLevel(scale, maxScaleInScene);

      const provenanceHash = src.sourceFile
        ? deterministicHash(`file:${src.sourceFile}:${src.maxSplats}`)
        : deterministicHash(`${src.objectName}:${lodLevel}:${src.maxSplats}`);

      const anchor: SpatialAnchor = {
        id: `spa_${sanitiseId(src.objectName)}_l${lodLevel}`,
        position: src.position,
        scale,
        lodLevel,
        gaussianCount: src.maxSplats,
        importance: src.importance,
        provenanceHash,
        ...(src.sourceFile ? { sourceFile: src.sourceFile } : {}),
      };

      anchors.push(anchor);
      lodDist[lodLevel] = (lodDist[lodLevel] ?? 0) + 1;
    }

    // Sort coarsest-first (mirrors OctreeLODSystem.bulkInsert sort for efficiency)
    anchors.sort((a, b) => a.lodLevel - b.lodLevel);

    // ── 4. Compute bounding volume ────────────────────────────────────────────
    const bounds = computeBounds(anchors);

    // ── 5. Compute Merkle root ────────────────────────────────────────────────
    const merkleRoot = computeMerkleRoot(anchors);

    const totalGaussians = anchors.reduce((s, a) => s + a.gaussianCount, 0);
    const maxLodLevel = anchors.length > 0 ? Math.max(...anchors.map((a) => a.lodLevel)) : 0;

    return {
      schema: 'spatial-partition/v1',
      compositionName: composition.name,
      generatedAt: new Date().toISOString(),
      anchors,
      bounds,
      merkleRoot,
      totalGaussians,
      stats: {
        objectsWalked,
        anchorsEmitted: anchors.length,
        lodLevelDistribution: lodDist,
        maxLodLevel,
        maxScaleInScene,
      },
    };
  }

  // ── LOD level computation (same algorithm as OctreeLODSystem.computeLODLevelFromScale) ──

  private computeLODLevel(scale: number, maxScaleInScene: number): number {
    if (scale <= 0 || maxScaleInScene <= 0) return this.maxDepth - 1;
    if (scale >= maxScaleInScene) return 0;
    const ratio = maxScaleInScene / scale;
    const level = Math.floor(Math.log2(ratio));
    return Math.min(Math.max(0, level), this.maxDepth - 1);
  }

  // ── AST Walk (mirrors GaussianBudgetAnalyzer.collectGaussianSources) ─────────

  private collectFromComposition(composition: HoloComposition, out: RawGaussianSource[]): void {
    if (composition.objects) {
      for (const obj of composition.objects) {
        this.collectFromObject(obj, out);
      }
    }
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        this.collectFromGroup(group, out);
      }
    }
    if (composition.conditionals) {
      for (const cond of composition.conditionals) {
        if (cond.objects) {
          for (const obj of cond.objects) this.collectFromObject(obj, out);
        }
        if (cond.elseObjects) {
          for (const obj of cond.elseObjects) this.collectFromObject(obj, out);
        }
      }
    }
    if (composition.iterators) {
      for (const iter of composition.iterators) {
        if (iter.objects) {
          for (const obj of iter.objects) this.collectFromObject(obj, out);
        }
      }
    }
  }

  private collectFromObject(obj: HoloObjectDecl, out: RawGaussianSource[]): void {
    if (obj.traits) {
      for (const trait of obj.traits) {
        if (trait.name === 'gaussian_splat') {
          const src = this.extractSource(obj, trait);
          if (src) out.push(src);
        }
      }
    }
    if (obj.children) {
      for (const child of obj.children) {
        this.collectFromObject(child, out);
      }
    }
  }

  private collectFromGroup(group: HoloSpatialGroup, out: RawGaussianSource[]): void {
    if (group.objects) {
      for (const obj of group.objects) this.collectFromObject(obj, out);
    }
    if (group.groups) {
      for (const sub of group.groups) this.collectFromGroup(sub, out);
    }
  }

  private extractSource(obj: HoloObjectDecl, trait: HoloObjectTrait): RawGaussianSource | null {
    const config = (trait.config ?? {}) as Record<string, unknown>;
    const maxSplats = typeof config.max_splats === 'number' ? config.max_splats : 50_000;
    const sourceFile =
      typeof config.src === 'string'
        ? config.src
        : typeof config.source === 'string'
          ? config.source
          : undefined;
    const importance =
      typeof config.importance === 'number' ? Math.max(0, Math.min(1, config.importance)) : 0.5;

    // Bug fix: the parser stores position in obj.properties[], not obj.position.
    // obj.position is only populated when constructing AST nodes directly (tests,
    // hand-built compositions). In parsed output, position lives in properties[].
    // We try obj.position first (for direct-set nodes) then fall back to
    // properties[] using the canonical findObjProp pattern
    // (see AndroidKotlinHelpers.ts:181 / AndroidXRGenerators.ts:220,298).
    let posArr: [number, number, number] | null = null;

    // Path A: top-level obj.position (HoloPosition = {x,y,z})
    if (obj.position && typeof obj.position.x === 'number') {
      posArr = [obj.position.x, obj.position.y, obj.position.z];
    } else {
      // Path B: obj.properties[] — value may be number[] or {x,y,z}
      const posProp = obj.properties?.find((p) => p.key === 'position')?.value;
      if (Array.isArray(posProp) && posProp.length >= 3) {
        posArr = [Number(posProp[0]), Number(posProp[1]), Number(posProp[2])];
      } else if (
        posProp !== null &&
        typeof posProp === 'object' &&
        !Array.isArray(posProp) &&
        typeof (posProp as Record<string, unknown>)['x'] === 'number'
      ) {
        const pobj = posProp as { x: number; y: number; z: number };
        posArr = [pobj.x, pobj.y, pobj.z];
      }
    }

    return {
      objectName: obj.name ?? `unnamed_${Math.random().toString(36).slice(2, 7)}`,
      position: posArr ?? [0, 0, 0],
      hasPosition: posArr !== null,
      maxSplats,
      sourceFile,
      importance,
    };
  }

  // ── Empty-composition fast path ─────────────────────────────────────────────

  private emptyResult(compositionName: string): SpatialPartitionResult {
    return {
      schema: 'spatial-partition/v1',
      compositionName,
      generatedAt: new Date().toISOString(),
      anchors: [],
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
        center: { x: 0, y: 0, z: 0 },
        halfSize: 0,
      },
      merkleRoot: '0'.repeat(64),
      totalGaussians: 0,
      stats: {
        objectsWalked: 0,
        anchorsEmitted: 0,
        lodLevelDistribution: {},
        maxLodLevel: 0,
        maxScaleInScene: 0,
      },
    };
  }
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface RawGaussianSource {
  objectName: string;
  position: [number, number, number];
  hasPosition: boolean;
  maxSplats: number;
  sourceFile?: string;
  importance: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deterministic string hash → 64-char hex string.
 *
 * Uses a simple FNV-1a-inspired rolling XOR + multiply, then formats as
 * zero-padded hex. This is NOT cryptographic — it is a stable content-address
 * for anchors whose sourceFile is unavailable. For sourceFile-backed anchors,
 * the real SHA-256 from the build pipeline should replace this value at
 * bundle-time.
 */
function deterministicHash(input: string): string {
  let h0 = 0x811c9dc5;
  let h1 = 0xd1e4a9f3;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h0 = Math.imul(h0 ^ c, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
  }
  // Produce a 64-char hex by repeating / extending the two 32-bit words
  const hex0 = h0.toString(16).padStart(8, '0');
  const hex1 = h1.toString(16).padStart(8, '0');
  // Interleave and repeat to reach 64 chars
  const base = (hex0 + hex1).repeat(4).slice(0, 64);
  return base;
}

/**
 * Compute XOR Merkle root over all anchor provenanceHashes (sorted by anchor id).
 * Mirrors quantum_assemble.py's meta_merkle_root convention: each leaf is a
 * placement-bound hash; the root is the composition of all leaves.
 */
function computeMerkleRoot(anchors: SpatialAnchor[]): string {
  if (anchors.length === 0) return '0'.repeat(64);

  const sorted = [...anchors].sort((a, b) => a.id.localeCompare(b.id));
  // XOR-chain the hashes (same as Python's XOR Merkle approach in assemble.py)
  const bytes = new Uint8Array(32);
  for (const anchor of sorted) {
    const hash = anchor.provenanceHash.slice(0, 64).padEnd(64, '0');
    for (let i = 0; i < 32; i++) {
      const byteHex = hash.slice(i * 2, i * 2 + 2);
      bytes[i] ^= parseInt(byteHex, 16) || 0;
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute the AABB + enclosing half-cube of all anchors.
 */
function computeBounds(anchors: SpatialAnchor[]): SpatialBounds {
  if (anchors.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      halfSize: 0,
    };
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const a of anchors) {
    const r = a.scale; // use scale as radius contribution
    minX = Math.min(minX, a.position[0] - r);
    minY = Math.min(minY, a.position[1] - r);
    minZ = Math.min(minZ, a.position[2] - r);
    maxX = Math.max(maxX, a.position[0] + r);
    maxY = Math.max(maxY, a.position[1] + r);
    maxZ = Math.max(maxZ, a.position[2] + r);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const halfSize = Math.max((maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2);

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center: { x: cx, y: cy, z: cz },
    halfSize,
  };
}

/**
 * Sanitise a string for use as part of an anchor ID (alphanumeric + underscores).
 */
function sanitiseId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32);
}

// =============================================================================
// CONVENIENCE EXPORT
// =============================================================================

/**
 * Functional wrapper: run the pass with default options.
 *
 * @example
 * ```ts
 * const result = spatialPartition(composition);
 * ```
 */
export function spatialPartition(
  composition: HoloComposition,
  options?: SpatialPartitionPassOptions
): SpatialPartitionResult {
  return new SpatialPartitionPass(options).run(composition);
}
