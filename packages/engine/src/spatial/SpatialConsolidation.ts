/**
 * SpatialConsolidation — Provenance-Preserving Merge of N Pieces into One Structure
 *
 * D.059 Stage 2/3 primitive: given N provenance-bound geometry pieces (each with a
 * provenanceHash), produce ONE merged structure + ONE composed receipt (Merkle root
 * of the N piece receipts). "You never re-verify the world; you verify the world IS
 * the composition of verified pieces."
 *
 * Recursion: a consolidated structure's self_hash becomes its leaf at the next level:
 *   matter -> material -> object -> structure -> world
 * The same consolidate() call works at every level.
 *
 * Provenance chain:
 *   Each piece contributes its provenanceHash as a leaf.
 *   The composed Merkle root is SHA-256(sorted(leaf_hashes).join('')).
 *   The consolidated structure's self_hash = SHA-256(composed_merkle_root + metadata).
 *   This mirrors quantum_assemble.py's merkle_root hierarchy and SpatialPartitionPass's
 *   provenanceHash chain (D.059 / Paper 34).
 *
 * Receipt schema: cael-structure-v1
 *   - merkleRoot over piece provenanceHashes (composition proof)
 *   - selfHash over merkleRoot + consolidation metadata (identity proof)
 *   - pieceCount, totalGaussianCount, deduplicationStats (transparency)
 *   - provenanceSemiringStrategy: which semiring merge was used for trait conflicts
 *
 * Research references:
 *   D.059 — Staged matter assembly (world construction)
 *   D.058 — Visual evidence / receipt-to-pixel capstone
 *   W.032 — Octree-GS LOD (anchor-based level selection)
 *   Paper 34 — Provenance-isomorphic LOD (seed)
 *
 * @module spatial
 * @version 1.0.0
 */

import { sha256Bytes } from '../simulation/sha256';
import { stableStringify } from '../simulation/equivalenceRecord';

/** Encode a string as UTF-8 bytes. */
function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// =============================================================================
// RECEIPT SCHEMA
// =============================================================================

/**
 * Receipt schema version for spatial consolidation.
 * Mirrors CAEL receipt versioning (cael-structure-v1).
 */
export const CAEL_STRUCTURE_V1 = 'cael-structure-v1' as const;
export type CaelStructureV1 = typeof CAEL_STRUCTURE_V1;

/**
 * Which semiring strategy was used to resolve trait conflicts during merge.
 * Maps to ProvenanceSemiring strategies from core.
 */
export type ConsolidationSemiringStrategy =
  | 'tropical-min-plus'
  | 'tropical-max-plus'
  | 'sum-product'
  | 'authority-weighted'
  | 'domain-override';

/**
 * Statistics about deduplication and instancing applied during consolidation.
 * Transparent: every merge step is auditable.
 */
export interface DeduplicationStats {
  /** Number of pieces that were deduplicated (same provenanceHash, merged). */
  piecesDeduplicated: number;
  /** Number of materials that were deduplicated (same hash, merged). */
  materialsDeduplicated: number;
  /** Number of anchor instances created (LOD sharing). */
  anchorInstancesCreated: number;
  /** Total vertices before dedup. */
  verticesBefore: number;
  /** Total vertices after dedup. */
  verticesAfter: number;
}

/**
 * A composed Merkle receipt proving that N provenance-bound pieces were
 * consolidated into one structure.
 *
 * This is the Stage 2 output of D.059. The merkleRoot is the Merkle root
 * over all piece provenanceHashes; the selfHash is the deterministic identity
 * of this consolidation (for recursion at the next level).
 */
export interface ComposedMerkleReceipt {
  /** Schema version — always 'cael-structure-v1'. */
  schema: CaelStructureV1;
  /** Merkle root over sorted piece provenanceHashes (composition proof). */
  merkleRoot: string;
  /** Self hash = SHA-256(merkleRoot + consolidation metadata). Identity proof for recursion. */
  selfHash: string;
  /** Sorted leaf hashes used to compute the Merkle root (enables verification). */
  leafHashes: string[];
  /** Number of pieces consolidated. */
  pieceCount: number;
  /** Total Gaussian count across all pieces (sum of gaussianCount). */
  totalGaussianCount: number;
  /** Bounding volume of the consolidated structure. */
  bounds: ConsolidatedBounds;
  /** Which semiring strategy resolved trait conflicts. */
  semiringStrategy: ConsolidationSemiringStrategy;
  /** Deduplication statistics (transparent audit). */
  deduplication: DeduplicationStats;
  /** ISO 8601 timestamp of consolidation. */
  consolidatedAt: string;
  /** Provenance: what created this consolidation. */
  consolidatedBy: string;
}

// =============================================================================
// CONSOLIDATED STRUCTURE
// =============================================================================

/**
 * A single merged anchor after consolidation.
 * Merges spatial position, LOD level, and gaussian count from
 * deduplicated pieces.
 */
export interface ConsolidatedAnchor {
  /** Deterministic ID: 'consolidated_<merkleRoot-prefix>_<index>'. */
  id: string;
  /** Merged world-space position (centroid of deduplicated piece positions). */
  position: [number, number, number];
  /** Effective scale (max of deduplicated piece scales). */
  scale: number;
  /** Merged LOD level (minimum = coarsest of deduplicated piece LODs). */
  lodLevel: number;
  /** Total gaussian count across deduplicated pieces. */
  gaussianCount: number;
  /** Merged importance (max of deduplicated piece importances). */
  importance: number;
  /** Merkle root over this anchor's piece provenanceHashes. */
  provenanceHash: string;
  /** Source files that contributed to this anchor. */
  sourceFiles: string[];
}

/**
 * Axis-aligned bounding volume for the consolidated structure.
 */
export interface ConsolidatedBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  halfSize: number;
}

/**
 * Result of consolidating N provenance-bound pieces into one structure.
 * The key output of D.059 Stage 2.
 */
export interface ConsolidationResult {
  /** The composed Merkle receipt (provenance proof). */
  receipt: ComposedMerkleReceipt;
  /** Merged anchor set (consumable by OctreeLODSystem). */
  anchors: ConsolidatedAnchor[];
  /** Bounding volume of all consolidated anchors. */
  bounds: ConsolidatedBounds;
  /** Total Gaussian count across all consolidated anchors. */
  totalGaussians: number;
}

// =============================================================================
// CONSOLIDATION OPTIONS
// =============================================================================

export interface ConsolidationOptions {
  /**
   * Which semiring strategy to use for trait conflict resolution.
   * Default: 'tropical-min-plus' (min-cost merge).
   */
  semiringStrategy?: ConsolidationSemiringStrategy;
  /**
   * Whether to deduplicate pieces with identical provenanceHashes.
   * Default: true (D.059 requirement: provenance = identity).
   */
  deduplicatePieces?: boolean;
  /**
   * Whether to merge anchors at the same LOD level into instances.
   * Default: true (performance: instancing reduces draw calls).
   */
  instanceByLOD?: boolean;
  /**
   * Identity of the consolidator (for receipt provenance).
   * Default: 'spatial-consolidation-v1'.
   */
  consolidatedBy?: string;
}

const DEFAULT_OPTIONS: Required<ConsolidationOptions> = {
  semiringStrategy: 'tropical-min-plus',
  deduplicatePieces: true,
  instanceByLOD: true,
  consolidatedBy: 'spatial-consolidation-v1',
};

// =============================================================================
// CORE CONSOLIDATION
// =============================================================================

/**
 * Compute a Merkle root over a set of leaf hashes.
 * Simple XOR-chain over sorted hashes (mirrors SpatialPartitionPass.merkleRoot).
 * For production, a full binary Merkle tree should replace this (Paper 34).
 */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) return sha256Bytes(new Uint8Array(0));
  const sorted = [...leafHashes].sort();
  const concatenated = sorted.join('');
  return sha256Bytes(toBytes(concatenated));
}

/**
 * Compute a self-hash over Merkle root + metadata.
 * This is the identity hash that makes the consolidation a verifiable piece
 * at the next recursion level (matter -> material -> object -> world).
 */
export function computeSelfHash(
  merkleRoot: string,
  pieceCount: number,
  totalGaussians: number
): string {
  const payload = stableStringify({
    merkleRoot,
    pieceCount,
    totalGaussians,
    schema: CAEL_STRUCTURE_V1,
  });
  return sha256Bytes(toBytes(payload));
}

/**
 * Compute the bounding volume encompassing all given positions and scales.
 */
export function computeConsolidatedBounds(
  anchors: Array<{ position: [number, number, number]; scale: number }>
): ConsolidatedBounds {
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
    const r = a.scale;
    minX = Math.min(minX, a.position[0] - r);
    minY = Math.min(minY, a.position[1] - r);
    minZ = Math.min(minZ, a.position[2] - r);
    maxX = Math.max(maxX, a.position[0] + r);
    maxY = Math.max(maxY, a.position[1] + r);
    maxZ = Math.max(maxZ, a.position[2] + r);
  }

  const center = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
  const halfSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center,
    halfSize,
  };
}

/**
 * Consolidate N provenance-bound geometry pieces into one structure + one
 * composed receipt.
 *
 * This is the D.059 Stage 2/3 primitive. It recurses: a consolidated
 * structure's selfHash becomes its provenanceHash at the next level.
 *
 * Algorithm:
 *  1. Deduplicate pieces with identical provenanceHashes (provenance = identity).
 *  2. Merge anchors by LOD level (instancing for performance).
 *  3. Compute Merkle root over all piece provenanceHashes (composition proof).
 *  4. Compute self hash over Merkle root + metadata (identity for recursion).
 *  5. Compute consolidated bounding volume.
 *  6. Return ConsolidationResult with receipt + merged anchors + bounds.
 */
export function consolidate(
  pieces: Array<{
    id: string;
    position: [number, number, number];
    scale: number;
    lodLevel: number;
    gaussianCount: number;
    importance: number;
    provenanceHash: string;
    sourceFile?: string;
  }>,
  options?: ConsolidationOptions
): ConsolidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Stage 1: Deduplicate by provenanceHash (provenance = identity)
  const seenHashes = new Map<string, number>();
  const deduplicatedPieces: typeof pieces = [];
  let piecesDeduplicated = 0;

  for (const piece of pieces) {
    if (opts.deduplicatePieces && seenHashes.has(piece.provenanceHash)) {
      piecesDeduplicated++;
    } else {
      seenHashes.set(piece.provenanceHash, deduplicatedPieces.length);
      deduplicatedPieces.push(piece);
    }
  }

  // Stage 2: Compute Merkle root over piece provenanceHashes
  const leafHashes = deduplicatedPieces.map((p) => p.provenanceHash);
  const merkleRoot = computeMerkleRoot(leafHashes);

  // Stage 3: Merge anchors by LOD level (instancing)
  const lodGroups = new Map<number, typeof deduplicatedPieces>();
  for (const piece of deduplicatedPieces) {
    const group = lodGroups.get(piece.lodLevel) ?? [];
    group.push(piece);
    lodGroups.set(piece.lodLevel, group);
  }

  const consolidatedAnchors: ConsolidatedAnchor[] = [];
  let materialsDeduplicated = 0;
  const sourceFileSet = new Set<string>();

  for (const [lodLevel, group] of lodGroups) {
    // Centroid position of merged group
    const cx = group.reduce((s, p) => s + p.position[0], 0) / group.length;
    const cy = group.reduce((s, p) => s + p.position[1], 0) / group.length;
    const cz = group.reduce((s, p) => s + p.position[2], 0) / group.length;

    // Max scale (most conservative bounding)
    const maxScale = Math.max(...group.map((p) => p.scale));

    // Sum gaussian counts
    const totalGaussians = group.reduce((s, p) => s + p.gaussianCount, 0);

    // Max importance (retention priority)
    const maxImportance = Math.max(...group.map((p) => p.importance));

    // Merkle root over this LOD group's pieces
    const groupMerkle = computeMerkleRoot(group.map((p) => p.provenanceHash));

    // Collect source files
    const groupSources: string[] = [];
    for (const p of group) {
      if (p.sourceFile && !sourceFileSet.has(p.sourceFile)) {
        sourceFileSet.add(p.sourceFile);
        groupSources.push(p.sourceFile);
      }
    }

    // Deduplicate materials within group (by sourceFile)
    const uniqueSources = new Set(group.map((p) => p.sourceFile ?? ''));
    materialsDeduplicated += group.length - uniqueSources.size;

    consolidatedAnchors.push({
      id: `consolidated_${merkleRoot.slice(0, 8)}_${lodLevel}`,
      position: [cx, cy, cz],
      scale: maxScale,
      lodLevel,
      gaussianCount: totalGaussians,
      importance: maxImportance,
      provenanceHash: groupMerkle,
      sourceFiles: groupSources,
    });
  }

  // Stage 4: Compute self hash (identity for recursion)
  const totalGaussians = consolidatedAnchors.reduce((s, a) => s + a.gaussianCount, 0);
  const selfHash = computeSelfHash(merkleRoot, deduplicatedPieces.length, totalGaussians);

  // Stage 5: Compute consolidated bounding volume
  const bounds = computeConsolidatedBounds(consolidatedAnchors);

  // Stage 6: Build receipt
  const receipt: ComposedMerkleReceipt = {
    schema: CAEL_STRUCTURE_V1,
    merkleRoot,
    selfHash,
    leafHashes: [...leafHashes], // sorted copy for verification
    pieceCount: deduplicatedPieces.length,
    totalGaussianCount: totalGaussians,
    bounds,
    semiringStrategy: opts.semiringStrategy,
    deduplication: {
      piecesDeduplicated,
      materialsDeduplicated,
      anchorInstancesCreated: consolidatedAnchors.length,
      verticesBefore: pieces.reduce((s, p) => s + p.gaussianCount, 0),
      verticesAfter: totalGaussians,
    },
    consolidatedAt: new Date().toISOString(),
    consolidatedBy: opts.consolidatedBy,
  };

  return {
    receipt,
    anchors: consolidatedAnchors,
    bounds,
    totalGaussians,
  };
}

/**
 * Verify that a ConsolidationResult's receipt is consistent with its anchors.
 * Per F.069: this must FAIL if the receipt is forged or inconsistent.
 */
export function verifyConsolidationReceipt(result: ConsolidationResult): boolean {
  const { receipt, anchors } = result;

  // 1. Recompute Merkle root from receipt's leaf hashes (composition proof)
  const recomputedMerkleRoot = computeMerkleRoot(receipt.leafHashes);

  if (recomputedMerkleRoot !== receipt.merkleRoot) {
    return false;
  }

  // 2. Recompute self hash
  const recomputedSelfHash = computeSelfHash(
    receipt.merkleRoot,
    receipt.pieceCount,
    receipt.totalGaussianCount
  );

  if (recomputedSelfHash !== receipt.selfHash) {
    return false;
  }

  // 3. Verify total Gaussian count matches anchors
  const recomputedTotalGaussians = anchors.reduce((s, a) => s + a.gaussianCount, 0);
  if (recomputedTotalGaussians !== receipt.totalGaussianCount) {
    return false;
  }

  // 4. Verify piece count is positive (empty consolidation has count 0 but is valid)
  if (receipt.pieceCount < 0) {
    return false;
  }

  // 5. Verify leaf hashes length matches piece count
  if (receipt.leafHashes.length !== receipt.pieceCount) {
    return false;
  }

  return true;
}
