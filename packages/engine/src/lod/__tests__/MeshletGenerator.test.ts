import { describe, it, expect } from 'vitest';
import { MeshletGenerator, generateMeshlets, DEFAULT_MESHLET_OPTIONS } from '../MeshletGenerator';
import type { MeshData } from '../LODGenerator';

/** 2-triangle quad */
function makeQuadMesh(): MeshData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

/** Grid mesh with (gridSize^2 * 2) triangles */
function makeGridMesh(gridSize: number = 8): MeshData {
  const vertCount = (gridSize + 1) * (gridSize + 1);
  const triCount = gridSize * gridSize * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  let vIdx = 0;
  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = 0;
      normals[vIdx * 3] = 0;
      normals[vIdx * 3 + 1] = 0;
      normals[vIdx * 3 + 2] = 1;
      vIdx++;
    }
  }

  let iIdx = 0;
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const i = y * (gridSize + 1) + x;
      indices[iIdx++] = i;
      indices[iIdx++] = i + 1;
      indices[iIdx++] = i + gridSize + 1;
      indices[iIdx++] = i + 1;
      indices[iIdx++] = i + gridSize + 2;
      indices[iIdx++] = i + gridSize + 1;
    }
  }

  return { positions, normals, indices };
}

describe('MeshletGenerator', () => {
  it('generates a single meshlet for a small quad', () => {
    const gen = new MeshletGenerator();
    const result = gen.generate(makeQuadMesh());

    expect(result.meshlets.length).toBe(1);
    expect(result.totalTriangles).toBe(2);
    expect(result.sourceTriangles).toBe(2);

    const m = result.meshlets[0];
    expect(m.triangleCount).toBe(2);
    expect(m.vertexCount).toBe(4);
    expect(m.boundRadius).toBeGreaterThan(0);
  });

  it('generates multiple meshlets for a large grid', () => {
    // 16x16 grid = 512 triangles, exceeds maxTriangles=124
    const gen = new MeshletGenerator();
    const result = gen.generate(makeGridMesh(16));

    expect(result.meshlets.length).toBeGreaterThan(1);
    expect(result.totalTriangles).toBe(512);
    expect(result.sourceTriangles).toBe(512);
  });

  it('respects maxTriangles limit', () => {
    const gen = new MeshletGenerator({ maxTriangles: 20 });
    const result = gen.generate(makeGridMesh(8)); // 128 triangles

    for (const m of result.meshlets) {
      expect(m.triangleCount).toBeLessThanOrEqual(20);
    }
    expect(result.totalTriangles).toBe(128);
  });

  it('respects maxVertices limit', () => {
    const gen = new MeshletGenerator({ maxVertices: 16 });
    const result = gen.generate(makeGridMesh(8));

    for (const m of result.meshlets) {
      expect(m.vertexCount).toBeLessThanOrEqual(16);
    }
  });

  it('handles empty mesh', () => {
    const gen = new MeshletGenerator();
    const result = gen.generate({
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
    });

    expect(result.meshlets.length).toBe(0);
    expect(result.totalTriangles).toBe(0);
  });

  it('computes bounding spheres', () => {
    const gen = new MeshletGenerator();
    const result = gen.generate(makeGridMesh(4));

    for (const m of result.meshlets) {
      expect(m.boundCenter).toHaveLength(3);
      expect(m.boundRadius).toBeGreaterThan(0);
      // Center should be within grid bounds
      expect(m.boundCenter[0]).toBeGreaterThanOrEqual(-1);
      expect(m.boundCenter[1]).toBeGreaterThanOrEqual(-1);
    }
  });

  it('computes normal cones', () => {
    const gen = new MeshletGenerator();
    const result = gen.generate(makeGridMesh(4));

    for (const m of result.meshlets) {
      expect(m.coneAxis).toHaveLength(3);
      // For a flat grid, cone axis should be close to [0,0,1]
      expect(Math.abs(m.coneAxis[2])).toBeGreaterThan(0.9);
      // Cone cutoff should be close to 1 (all normals point same direction)
      expect(m.coneCutoff).toBeGreaterThan(0.9);
    }
  });

  it('local triangle indices are valid', () => {
    const gen = new MeshletGenerator();
    const result = gen.generate(makeGridMesh(8));

    for (const m of result.meshlets) {
      // Each local index should be < vertexCount
      for (let i = 0; i < m.triangleIndices.length; i++) {
        expect(m.triangleIndices[i]).toBeLessThan(m.vertexCount);
      }
      expect(m.triangleIndices.length).toBe(m.triangleCount * 3);
    }
  });

  it('covers all source triangles exactly once', () => {
    const gen = new MeshletGenerator();
    const mesh = makeGridMesh(8);
    const result = gen.generate(mesh);

    // Sum of all meshlet triangle counts should equal source
    const totalTris = result.meshlets.reduce((s, m) => s + m.triangleCount, 0);
    expect(totalTris).toBe(128);
  });

  it('reports generation time', () => {
    const gen = new MeshletGenerator();
    const result = gen.generate(makeGridMesh(8));

    expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  // ─── Factory functions ─────────────────────────────────────────────

  it('generateMeshlets convenience function works', () => {
    const result = generateMeshlets(makeGridMesh(4));
    expect(result.meshlets.length).toBeGreaterThan(0);
    expect(result.totalTriangles).toBe(32);
  });

  it('DEFAULT_MESHLET_OPTIONS has expected values', () => {
    expect(DEFAULT_MESHLET_OPTIONS.maxVertices).toBe(64);
    expect(DEFAULT_MESHLET_OPTIONS.maxTriangles).toBe(124);
    expect(DEFAULT_MESHLET_OPTIONS.coneWeight).toBe(0.9);
  });
});
