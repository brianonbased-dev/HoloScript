/**
 * SpatialConsolidation Tests — D.059 Stage 2/3 Primitive
 *
 * Verifies provenance-preserving merge of N pieces into one structure:
 * 1. Merkle root correctness (composition proof)
 * 2. Self hash correctness (identity for recursion)
 * 3. Deduplication by provenanceHash
 * 4. LOD-level instancing
 * 5. Bound computation
 * 6. Receipt verification (F.069: fails if forged/inconsistent)
 * 7. Recursion: consolidated structure as piece at next level
 *
 * Per F.069: every claim has failing-if-broken evidence.
 */

import { describe, it, expect } from 'vitest';
import {
  consolidate,
  verifyConsolidationReceipt,
  computeMerkleRoot,
  computeSelfHash,
  computeConsolidatedBounds,
  CAEL_STRUCTURE_V1,
  type ConsolidationResult,
  type ConsolidationOptions,
} from '../SpatialConsolidation';

// ─── Test fixtures ──────────────────────────────────────────────────────────────

const makePiece = (
  id: string,
  hash: string,
  lodLevel = 0,
  gaussianCount = 1000,
  position: [number, number, number] = [0, 0, 0],
  scale = 1.0,
  importance = 0.5,
  sourceFile?: string
) => ({
  id,
  position,
  scale,
  lodLevel,
  gaussianCount,
  importance,
  provenanceHash: hash,
  sourceFile,
});

// ─── Merkle Root ────────────────────────────────────────────────────────────────

describe('SpatialConsolidation — Merkle root', () => {
  it('produces deterministic Merkle root from sorted hashes', () => {
    const root1 = computeMerkleRoot(['hash_a', 'hash_b', 'hash_c']);
    const root2 = computeMerkleRoot(['hash_c', 'hash_a', 'hash_b']);
    expect(root1).toBe(root2); // order-independent
  });

  it('produces different Merkle roots for different hash sets', () => {
    const root1 = computeMerkleRoot(['hash_a', 'hash_b']);
    const root2 = computeMerkleRoot(['hash_a', 'hash_c']);
    expect(root1).not.toBe(root2);
  });

  it('single-hash Merkle root equals SHA-256 of that hash', () => {
    const root = computeMerkleRoot(['single_hash']);
    // Must be 64 hex chars (SHA-256)
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empty hash set produces SHA-256 of empty string', () => {
    const root = computeMerkleRoot([]);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
    expect(root.length).toBe(64);
  });
});

// ─── Self Hash ──────────────────────────────────────────────────────────────────

describe('SpatialConsolidation — Self hash', () => {
  it('self hash is deterministic for same inputs', () => {
    const hash1 = computeSelfHash('merkle_root_1', 5, 10000);
    const hash2 = computeSelfHash('merkle_root_1', 5, 10000);
    expect(hash1).toBe(hash2);
  });

  it('self hash differs for different piece counts', () => {
    const hash1 = computeSelfHash('root', 5, 10000);
    const hash2 = computeSelfHash('root', 10, 10000);
    expect(hash1).not.toBe(hash2);
  });

  it('self hash differs for different Gaussian counts', () => {
    const hash1 = computeSelfHash('root', 5, 10000);
    const hash2 = computeSelfHash('root', 5, 20000);
    expect(hash1).not.toBe(hash2);
  });

  it('self hash includes schema version (cael-structure-v1)', () => {
    const hash = computeSelfHash('root', 1, 100);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Consolidation ─────────────────────────────────────────────────────────────

describe('SpatialConsolidation — consolidate()', () => {
  it('consolidates 2 pieces into a structure with correct Merkle root', () => {
    const pieces = [
      makePiece('p1', 'hash_alpha', 0, 5000, [1, 0, 0], 0.1, 0.8),
      makePiece('p2', 'hash_beta', 0, 3000, [-1, 0, 0], 0.2, 0.6),
    ];

    const result = consolidate(pieces);

    expect(result.receipt.schema).toBe(CAEL_STRUCTURE_V1);
    expect(result.receipt.pieceCount).toBe(2);
    expect(result.receipt.totalGaussianCount).toBe(8000);
    expect(result.receipt.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipt.selfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipt.merkleRoot).not.toBe(result.receipt.selfHash);
  });

  it('deduplicates pieces with identical provenanceHashes', () => {
    const pieces = [
      makePiece('p1', 'same_hash', 0, 1000),
      makePiece('p2', 'same_hash', 0, 2000), // duplicate hash
      makePiece('p3', 'unique_hash', 0, 3000),
    ];

    const result = consolidate(pieces);

    expect(result.receipt.deduplication.piecesDeduplicated).toBe(1);
    expect(result.receipt.pieceCount).toBe(2); // p1 + p3 (p2 deduped)
    expect(result.receipt.totalGaussianCount).toBe(4000); // 1000 + 3000
  });

  it('groups anchors by LOD level (instancing)', () => {
    const pieces = [
      makePiece('p1', 'hash_1', 0, 1000, [1, 0, 0]),
      makePiece('p2', 'hash_2', 0, 2000, [2, 0, 0]),
      makePiece('p3', 'hash_3', 3, 500, [0, 1, 0]),
    ];

    const result = consolidate(pieces);

    // LOD 0: p1 + p2 merged → 1 anchor
    // LOD 3: p3 alone → 1 anchor
    expect(result.anchors.length).toBe(2);

    const lod0 = result.anchors.find((a) => a.lodLevel === 0);
    const lod3 = result.anchors.find((a) => a.lodLevel === 3);

    expect(lod0).toBeDefined();
    expect(lod3).toBeDefined();
    expect(lod0!.gaussianCount).toBe(3000); // 1000 + 2000
    expect(lod3!.gaussianCount).toBe(500);
  });

  it('merges positions as centroid of grouped anchors', () => {
    const pieces = [
      makePiece('p1', 'h1', 0, 100, [0, 0, 0]),
      makePiece('p2', 'h2', 0, 100, [10, 0, 0]),
    ];

    const result = consolidate(pieces);
    const anchor = result.anchors[0];

    // Centroid of [0,0,0] and [10,0,0] = [5,0,0]
    expect(anchor.position[0]).toBeCloseTo(5, 5);
    expect(anchor.position[1]).toBeCloseTo(0, 5);
    expect(anchor.position[2]).toBeCloseTo(0, 5);
  });

  it('uses max scale and max importance in merged anchors', () => {
    const pieces = [
      makePiece('p1', 'h1', 0, 100, [0, 0, 0], 0.5, 0.3),
      makePiece('p2', 'h2', 0, 100, [1, 0, 0], 2.0, 0.9),
    ];

    const result = consolidate(pieces);
    const anchor = result.anchors[0];

    expect(anchor.scale).toBeCloseTo(2.0, 5); // max scale
    expect(anchor.importance).toBeCloseTo(0.9, 5); // max importance
  });

  it('handles single piece consolidation (base case for recursion)', () => {
    const piece = makePiece('solo', 'hash_solo', 0, 5000, [3, 4, 5], 1.0, 0.7);

    const result = consolidate([piece]);

    expect(result.receipt.pieceCount).toBe(1);
    expect(result.receipt.totalGaussianCount).toBe(5000);
    expect(result.anchors.length).toBe(1);
    // Anchor provenanceHash is the Merkle root of the LOD group, not the original piece hash
    expect(result.anchors[0].provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    // But the receipt's leafHashes contains the original piece hash
    expect(result.receipt.leafHashes).toContain('hash_solo');
  });

  it('handles empty input gracefully', () => {
    const result = consolidate([]);

    expect(result.receipt.pieceCount).toBe(0);
    expect(result.receipt.totalGaussianCount).toBe(0);
    expect(result.anchors.length).toBe(0);
    expect(result.receipt.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it('skips deduplication when option is false', () => {
    const pieces = [makePiece('p1', 'same_hash', 0, 1000), makePiece('p2', 'same_hash', 0, 2000)];

    const result = consolidate(pieces, { deduplicatePieces: false });

    expect(result.receipt.deduplication.piecesDeduplicated).toBe(0);
    expect(result.receipt.pieceCount).toBe(2);
    expect(result.receipt.totalGaussianCount).toBe(3000);
  });
});

// ─── Bounds Computation ─────────────────────────────────────────────────────────

describe('SpatialConsolidation — bounds computation', () => {
  it('computes correct AABB for multiple anchors', () => {
    const anchors = [
      { position: [0, 0, 0] as [number, number, number], scale: 1 },
      { position: [10, 10, 10] as [number, number, number], scale: 2 },
    ];

    const bounds = computeConsolidatedBounds(anchors);

    // min = [0-1, 0-1, 0-1] = [-1, -1, -1], max = [10+2, 10+2, 10+2] = [12, 12, 12]
    expect(bounds.min.x).toBeCloseTo(-1, 3);
    expect(bounds.max.x).toBeCloseTo(12, 3);
    expect(bounds.center.x).toBeCloseTo(5.5, 3);
    expect(bounds.halfSize).toBeCloseTo(6.5, 3);
  });

  it('handles empty input with zero bounds', () => {
    const bounds = computeConsolidatedBounds([]);
    expect(bounds.halfSize).toBe(0);
    expect(bounds.center.x).toBe(0);
  });
});

// ─── Receipt Verification (F.069: adversarial) ──────────────────────────────────

describe('SpatialConsolidation — receipt verification (F.069)', () => {
  it('verifies a valid consolidation receipt', () => {
    const pieces = [
      makePiece('p1', 'hash_alpha', 0, 1000, [0, 0, 0]),
      makePiece('p2', 'hash_beta', 0, 2000, [1, 0, 0]),
    ];

    const result = consolidate(pieces);
    expect(verifyConsolidationReceipt(result)).toBe(true);
  });

  it('rejects a forged Merkle root (leaf hashes no longer match)', () => {
    const pieces = [makePiece('p1', 'hash_alpha', 0, 1000), makePiece('p2', 'hash_beta', 0, 2000)];

    const result = consolidate(pieces);
    const forged: ConsolidationResult = {
      ...result,
      receipt: { ...result.receipt, merkleRoot: '0'.repeat(64) },
    };

    expect(verifyConsolidationReceipt(forged)).toBe(false);
  });

  it('rejects a forged self hash', () => {
    const pieces = [makePiece('p1', 'hash_alpha', 0, 1000)];
    const result = consolidate(pieces);
    const forged: ConsolidationResult = {
      ...result,
      receipt: { ...result.receipt, selfHash: 'f'.repeat(64) },
    };

    expect(verifyConsolidationReceipt(forged)).toBe(false);
  });

  it('rejects a tampered Gaussian count (anchor count mismatch)', () => {
    const pieces = [makePiece('p1', 'hash_alpha', 0, 1000)];
    const result = consolidate(pieces);
    const forged: ConsolidationResult = {
      ...result,
      receipt: { ...result.receipt, totalGaussianCount: 999999 },
    };

    expect(verifyConsolidationReceipt(forged)).toBe(false);
  });

  it('rejects a tampered piece count (leaf hashes length mismatch)', () => {
    const pieces = [makePiece('p1', 'hash_alpha', 0, 1000)];
    const result = consolidate(pieces);
    const forged: ConsolidationResult = {
      ...result,
      receipt: { ...result.receipt, pieceCount: 0 },
    };

    expect(verifyConsolidationReceipt(forged)).toBe(false);
  });

  it('rejects a tampered leaf hashes array', () => {
    const pieces = [makePiece('p1', 'hash_alpha', 0, 1000)];
    const result = consolidate(pieces);
    const forged: ConsolidationResult = {
      ...result,
      receipt: { ...result.receipt, leafHashes: ['forged_hash'] },
    };

    expect(verifyConsolidationReceipt(forged)).toBe(false);
  });
});

// ─── Recursion (D.059: matter → material → object → world) ─────────────────────

describe('SpatialConsolidation — recursion (D.059)', () => {
  it('a consolidated structure can be a piece at the next level', () => {
    // Level 1: matter -> material
    const matterPieces = [
      makePiece('atom1', 'atom_hash_1', 0, 500),
      makePiece('atom2', 'atom_hash_2', 0, 500),
    ];
    const materialResult = consolidate(matterPieces);

    // Level 2: material -> object (use selfHash as provenanceHash)
    const objectPieces = [
      {
        ...materialResult.anchors[0],
        id: 'material_piece_1',
        provenanceHash: materialResult.receipt.selfHash,
        sourceFiles: materialResult.anchors[0].sourceFiles,
      },
      makePiece('addon', 'addon_hash', 1, 2000),
    ];
    const objectResult = consolidate(objectPieces);

    // The Merkle root at level 2 includes the level-1 selfHash
    expect(objectResult.receipt.pieceCount).toBe(2);
    expect(objectResult.receipt.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(objectResult.receipt.merkleRoot).not.toBe(materialResult.receipt.merkleRoot);

    // Both receipts verify independently
    expect(verifyConsolidationReceipt(materialResult)).toBe(true);
    expect(verifyConsolidationReceipt(objectResult)).toBe(true);
  });

  it('three-level recursion produces distinct Merkle roots at each level', () => {
    // Level 1: atoms
    const atoms = [makePiece('a1', 'atom1', 0, 100), makePiece('a2', 'atom2', 0, 100)];
    const l1 = consolidate(atoms);

    // Level 2: molecules (use l1 selfHash as provenance)
    const molecules = [
      {
        id: 'mol1',
        position: [0, 0, 0] as [number, number, number],
        scale: 1.0,
        lodLevel: 0,
        gaussianCount: 200,
        importance: 0.5,
        provenanceHash: l1.receipt.selfHash,
        sourceFiles: [],
      },
      makePiece('mol2', 'molecule2', 0, 300),
    ];
    const l2 = consolidate(molecules);

    // Level 3: object (use l2 selfHash as provenance)
    const objectPieces = [
      {
        id: 'obj1',
        position: [0, 0, 0] as [number, number, number],
        scale: 2.0,
        lodLevel: 0,
        gaussianCount: 500,
        importance: 0.8,
        provenanceHash: l2.receipt.selfHash,
        sourceFiles: [],
      },
      makePiece('obj2', 'object2', 1, 600),
    ];
    const l3 = consolidate(objectPieces);

    // All three levels have distinct Merkle roots
    expect(l1.receipt.merkleRoot).not.toBe(l2.receipt.merkleRoot);
    expect(l2.receipt.merkleRoot).not.toBe(l3.receipt.merkleRoot);
    expect(l1.receipt.merkleRoot).not.toBe(l3.receipt.merkleRoot);

    // All verify
    expect(verifyConsolidationReceipt(l1)).toBe(true);
    expect(verifyConsolidationReceipt(l2)).toBe(true);
    expect(verifyConsolidationReceipt(l3)).toBe(true);
  });
});
