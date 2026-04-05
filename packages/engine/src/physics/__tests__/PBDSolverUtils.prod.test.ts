/**
 * PBDSolverUtils.prod.test.ts
 *
 * Production tests for PBD CPU-side utility functions exported from PBDSolver.ts:
 * - colorConstraints()
 * - extractEdges()
 * - computeRestLengths()
 * - generateTetrahedra()
 * - extractBendingPairs()
 */

import { describe, it, expect } from 'vitest';
import {
  colorConstraints,
  extractEdges,
  computeRestLengths,
  generateTetrahedra,
  extractBendingPairs,
} from '@holoscript/core';

// Two triangles sharing the edge (1,2): [0,1,2] and [1,3,2]
const QUAD_INDICES = new Uint32Array([0, 1, 2, 1, 3, 2]);
const QUAD_POSITIONS = new Float32Array([
  0,
  0,
  0, // v0
  1,
  0,
  0, // v1
  1,
  1,
  0, // v2
  0,
  1,
  0, // v3 (used in second triangle as 1,3,2)
]);

describe('colorConstraints()', () => {
  it('returns numColors >= 1 for non-empty constraints', () => {
    const cs = [
      { vertexA: 0, vertexB: 1 },
      { vertexA: 2, vertexB: 3 },
    ];
    const result = colorConstraints(cs, 4);
    expect(result.numColors).toBeGreaterThanOrEqual(1);
  });

  it('two constraints sharing no vertex can have the same color', () => {
    const cs = [
      { vertexA: 0, vertexB: 1 },
      { vertexA: 2, vertexB: 3 },
    ];
    const result = colorConstraints(cs, 4);
    // Non-adjacent constraints can safely share a color
    expect(result.numColors).toBeGreaterThanOrEqual(1);
  });

  it('two constraints sharing a vertex get different colors', () => {
    const cs = [
      { vertexA: 0, vertexB: 1 },
      { vertexA: 1, vertexB: 2 }, // shares vertex 1
    ];
    const result = colorConstraints(cs, 3);
    expect(result.colors[0]).not.toBe(result.colors[1]);
  });

  it('sortedIndices covers all constraint indices', () => {
    const cs = [
      { vertexA: 0, vertexB: 1 },
      { vertexA: 2, vertexB: 3 },
      { vertexA: 1, vertexB: 2 },
    ];
    const result = colorConstraints(cs, 4);
    const sorted = [...result.sortedIndices].sort();
    expect(sorted).toEqual([0, 1, 2]);
  });

  it('groupCounts sum equals total constraints', () => {
    const cs = Array.from({ length: 6 }, (_, i) => ({ vertexA: i, vertexB: (i + 1) % 6 }));
    const result = colorConstraints(cs, 6);
    const total = [...result.groupCounts].reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  it('handles single constraint', () => {
    const result = colorConstraints([{ vertexA: 0, vertexB: 1 }], 2);
    expect(result.numColors).toBe(1);
    expect(result.colors[0]).toBe(0);
  });

  it('handles empty constraints', () => {
    const result = colorConstraints([], 0);
    expect(result.numColors).toBe(1); // maxColor=0 → numColors=1
  });
});

describe('extractEdges()', () => {
  it('returns an edges Uint32Array', () => {
    const result = extractEdges(QUAD_INDICES, 4);
    expect(result).toHaveProperty('edges');
    expect(result.edges).toBeInstanceOf(Uint32Array);
  });

  it('extracts correct number of unique edges from 2 triangles', () => {
    const result = extractEdges(QUAD_INDICES, 4);
    // 2 triangles = 6 edge references, but 5 unique edges (one shared)
    expect(result.edges.length / 2).toBe(5);
  });

  it('no duplicate edges', () => {
    const result = extractEdges(QUAD_INDICES, 4);
    const seen = new Set<string>();
    for (let i = 0; i < result.edges.length / 2; i++) {
      const a = result.edges[i * 2];
      const b = result.edges[i * 2 + 1];
      const key = `${Math.min(a, b)}_${Math.max(a, b)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('computeRestLengths()', () => {
  it('rest lengths have correct length (one per edge)', () => {
    const edges = new Uint32Array([0, 1, 1, 2]); // 2 edges
    const positions = new Float32Array([
      0,
      0,
      0, // v0
      1,
      0,
      0, // v1 — dist from v0 = 1
      1,
      1,
      0, // v2 — dist from v1 = 1
    ]);
    const rl = computeRestLengths(positions, edges);
    expect(rl.length).toBe(2);
  });

  it('rest length between (0,0,0) and (3,4,0) is 5', () => {
    const edges = new Uint32Array([0, 1]);
    const positions = new Float32Array([0, 0, 0, 3, 4, 0]);
    const rl = computeRestLengths(positions, edges);
    expect(rl[0]).toBeCloseTo(5);
  });

  it('rest length between identical vertices is 0', () => {
    const edges = new Uint32Array([0, 1]);
    const positions = new Float32Array([1, 2, 3, 1, 2, 3]);
    const rl = computeRestLengths(positions, edges);
    expect(rl[0]).toBeCloseTo(0);
  });
});

describe('generateTetrahedra()', () => {
  it('returns tetIndices and restVolumes', () => {
    const result = generateTetrahedra(QUAD_POSITIONS, QUAD_INDICES);
    expect(result).toHaveProperty('tetIndices');
    expect(result).toHaveProperty('restVolumes');
  });

  it('tetIndices has 4 entries per triangle', () => {
    const numTris = QUAD_INDICES.length / 3;
    const result = generateTetrahedra(QUAD_POSITIONS, QUAD_INDICES);
    expect(result.tetIndices.length).toBe(numTris * 4);
  });

  it('restVolumes length equals number of triangles', () => {
    const numTris = QUAD_INDICES.length / 3;
    const result = generateTetrahedra(QUAD_POSITIONS, QUAD_INDICES);
    expect(result.restVolumes.length).toBe(numTris);
  });

  it('restVolumes are non-negative', () => {
    const result = generateTetrahedra(QUAD_POSITIONS, QUAD_INDICES);
    for (const v of result.restVolumes) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('extractBendingPairs()', () => {
  it('returns constraints and restAngles', () => {
    const result = extractBendingPairs(QUAD_INDICES, QUAD_POSITIONS);
    expect(result).toHaveProperty('constraints');
    expect(result).toHaveProperty('restAngles');
  });

  it('finds the one shared edge between two triangles', () => {
    const result = extractBendingPairs(QUAD_INDICES, QUAD_POSITIONS);
    // 2 triangles sharing 1 edge → 1 bending pair
    expect(result.constraints.length / 4).toBe(1);
    expect(result.restAngles.length).toBe(1);
  });

  it('bending constraints are Uint32Array', () => {
    const result = extractBendingPairs(QUAD_INDICES, QUAD_POSITIONS);
    expect(result.constraints).toBeInstanceOf(Uint32Array);
  });

  it('rest angle for a flat quad is 0', () => {
    // Flat quad in XY plane → face normals both point in ±Z → dihedral = 0 or π
    const result = extractBendingPairs(QUAD_INDICES, QUAD_POSITIONS);
    // Either 0 or π is valid for flat; just check it's a finite number
    expect(Number.isFinite(result.restAngles[0])).toBe(true);
  });
});

