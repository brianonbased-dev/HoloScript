import { describe, it, expect } from 'vitest';
import { MeshletLODBuilder, buildMeshletHierarchy } from '../MeshletLODBuilder';
import type { MeshData } from '../LODGenerator';

function makeGridMesh(gridSize: number = 16): MeshData {
  const vertCount = (gridSize + 1) * (gridSize + 1);
  const triCount = gridSize * gridSize * 2;
  const positions = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  let vIdx = 0;
  for (let y = 0; y <= gridSize; y++) {
    for (let x = 0; x <= gridSize; x++) {
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = 0;
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

  return { positions, indices };
}

describe('MeshletLODBuilder', () => {
  it('generates multiple LOD levels', () => {
    const builder = new MeshletLODBuilder({ levelCount: 3 });
    const result = builder.build(makeGridMesh(16));

    expect(result.levels.length).toBeGreaterThanOrEqual(2);
    expect(result.levels[0].level).toBe(0);
    expect(result.totalMeshlets).toBeGreaterThan(0);
    expect(result.sourceTriangles).toBe(512);
  });

  it('reduces triangle count at each LOD level', () => {
    const builder = new MeshletLODBuilder({ levelCount: 3, reductionRatio: 0.5 });
    const result = builder.build(makeGridMesh(16));

    for (let i = 1; i < result.levels.length; i++) {
      expect(result.levels[i].totalTriangles).toBeLessThanOrEqual(
        result.levels[i - 1].totalTriangles
      );
    }
  });

  it('links parent-child relationships', () => {
    const builder = new MeshletLODBuilder({ levelCount: 3, groupSize: 2 });
    const result = builder.build(makeGridMesh(16));

    if (result.levels.length > 1) {
      // At least some LOD0 meshlets should have parents
      const lod0 = result.levels[0].meshlets;
      const hasParents = lod0.some((m) => m.parents.length > 0);
      expect(hasParents).toBe(true);

      // LOD1+ meshlets should have children
      const lod1 = result.levels[1].meshlets;
      const hasChildren = lod1.some((m) => m.children.length > 0);
      expect(hasChildren).toBe(true);
    }
  });

  it('assigns unique global IDs', () => {
    const builder = new MeshletLODBuilder({ levelCount: 3 });
    const result = builder.build(makeGridMesh(16));

    const ids = new Set<number>();
    for (const level of result.levels) {
      for (const m of level.meshlets) {
        expect(ids.has(m.globalId)).toBe(false);
        ids.add(m.globalId);
      }
    }
    expect(ids.size).toBe(result.totalMeshlets);
  });

  it('reports generation time', () => {
    const builder = new MeshletLODBuilder();
    const result = builder.build(makeGridMesh(8));

    expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('computes reduction ratios', () => {
    const builder = new MeshletLODBuilder({ levelCount: 3 });
    const result = builder.build(makeGridMesh(16));

    expect(result.reductionRatios.length).toBe(result.levels.length);
    expect(result.reductionRatios[0]).toBe(1);
  });

  it('handles small meshes that fit in one meshlet', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

    const builder = new MeshletLODBuilder({ levelCount: 3 });
    const result = builder.build({ positions, indices });

    expect(result.levels.length).toBeGreaterThanOrEqual(1);
    expect(result.levels[0].meshlets.length).toBe(1);
  });

  it('factory function works', () => {
    const result = buildMeshletHierarchy(makeGridMesh(8), { levelCount: 2 });
    expect(result.levels.length).toBeGreaterThanOrEqual(1);
    expect(result.totalMeshlets).toBeGreaterThan(0);
  });
});
