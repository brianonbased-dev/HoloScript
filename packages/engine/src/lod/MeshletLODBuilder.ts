/**
 * MeshletLODBuilder — Nanite-style hierarchical meshlet LOD generation
 *
 * Builds a DAG of meshlet LOD levels:
 *   LOD0: meshlets from the original high-poly mesh
 *   LOD1+: group meshlets, merge triangles, simplify, re-meshletize
 *
 * Each meshlet tracks its parent meshlets so the runtime can stream
 * and cull at the appropriate granularity for any screen size.
 *
 * @see HS-5 — Meshlet cluster generator directive
 */

import type { MeshData } from './LODGenerator';
import {
  Meshlet,
  MeshletGenerator,
  MeshletGenerationResult,
  DEFAULT_MESHLET_OPTIONS,
  type MeshletGeneratorOptions,
} from './MeshletGenerator';
import { LODGenerator } from './LODGenerator';

// ── Types ────────────────────────────────────────────────────────────────────

/** A meshlet at a specific LOD level with parent-child links */
export interface HierarchicalMeshlet extends Meshlet {
  /** LOD level (0 = highest detail) */
  lodLevel: number;
  /** IDs of child meshlets that were merged to create this one */
  children: number[];
  /** IDs of parent meshlets this meshlet contributes to */
  parents: number[];
  /** Global meshlet ID across all LOD levels */
  globalId: number;
}

/** One level in the meshlet LOD hierarchy */
export interface MeshletLODLevel {
  /** LOD level index */
  level: number;
  /** Meshlets at this level */
  meshlets: HierarchicalMeshlet[];
  /** Total triangles at this level */
  totalTriangles: number;
  /** Total unique vertices at this level */
  totalVertices: number;
}

/** Complete hierarchical meshlet result */
export interface MeshletHierarchyResult {
  /** LOD levels from finest to coarsest */
  levels: MeshletLODLevel[];
  /** Total meshlets across all levels */
  totalMeshlets: number;
  /** Source triangle count */
  sourceTriangles: number;
  /** Generation time in ms */
  generationTimeMs: number;
  /** Reduction ratios per level */
  reductionRatios: number[];
}

/** Options for hierarchical meshlet generation */
export interface MeshletHierarchyOptions {
  /** Meshlet generation options */
  meshletOptions?: Partial<MeshletGeneratorOptions>;
  /** Target number of meshlets to group for simplification (default: 4) */
  groupSize: number;
  /** Number of LOD levels to generate (default: 3) */
  levelCount: number;
  /** Triangle reduction ratio per level (default: 0.5) */
  reductionRatio: number;
  /** Simplification algorithm */
  simplificationAlgorithm: 'quadricError' | 'edgeCollapse' | 'vertexClustering';
}

export const DEFAULT_HIERARCHY_OPTIONS: MeshletHierarchyOptions = {
  groupSize: 4,
  levelCount: 3,
  reductionRatio: 0.5,
  simplificationAlgorithm: 'quadricError',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Rebuild a MeshData from a set of meshlets */
function meshletsToMeshData(meshlets: Meshlet[], originalPositions: Float32Array): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const m of meshlets) {
    // Copy unique vertices for this meshlet
    const vertMap = new Map<number, number>(); // original global index -> local offset
    for (let i = 0; i < m.vertexCount; i++) {
      const globalIdx = m.vertexIndices[i];
      if (!vertMap.has(globalIdx)) {
        vertMap.set(globalIdx, vertexOffset + i);
        const p = globalIdx * 3;
        positions.push(originalPositions[p], originalPositions[p + 1], originalPositions[p + 2]);
      }
    }

    // Copy triangles with remapped indices
    for (let t = 0; t < m.triangleCount; t++) {
      indices.push(
        vertMap.get(m.vertexIndices[m.triangleIndices[t * 3]])!,
        vertMap.get(m.vertexIndices[m.triangleIndices[t * 3 + 1]])!,
        vertMap.get(m.vertexIndices[m.triangleIndices[t * 3 + 2]])!
      );
    }

    vertexOffset += m.vertexCount;
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/** Group meshlets spatially by bounding-sphere proximity */
function groupMeshlets(meshlets: Meshlet[], groupSize: number): Meshlet[][] {
  if (meshlets.length <= groupSize) return [meshlets];

  const groups: Meshlet[][] = [];
  const remaining = [...meshlets];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const group: Meshlet[] = [seed];

    // Sort remaining by distance to seed center
    remaining.sort((a, b) => {
      const da =
        Math.pow(a.boundCenter[0] - seed.boundCenter[0], 2) +
        Math.pow(a.boundCenter[1] - seed.boundCenter[1], 2) +
        Math.pow(a.boundCenter[2] - seed.boundCenter[2], 2);
      const db =
        Math.pow(b.boundCenter[0] - seed.boundCenter[0], 2) +
        Math.pow(b.boundCenter[1] - seed.boundCenter[1], 2) +
        Math.pow(b.boundCenter[2] - seed.boundCenter[2], 2);
      return da - db;
    });

    while (group.length < groupSize && remaining.length > 0) {
      group.push(remaining.shift()!);
    }

    groups.push(group);
  }

  return groups;
}

// ── Builder ──────────────────────────────────────────────────────────────────

export class MeshletLODBuilder {
  private options: MeshletHierarchyOptions;

  constructor(options: Partial<MeshletHierarchyOptions> = {}) {
    this.options = { ...DEFAULT_HIERARCHY_OPTIONS, ...options };
  }

  /**
   * Build a hierarchical meshlet LOD structure from a mesh.
   *
   * Algorithm:
   * 1. Generate LOD0 meshlets from the original mesh
   * 2. For each subsequent level:
   *    a. Group meshlets from the previous level
   *    b. Merge their triangles into a sub-mesh
   *    c. Simplify the sub-mesh
   *    d. Re-meshletize the simplified mesh
   *    e. Link parent-child relationships
   */
  build(mesh: MeshData): MeshletHierarchyResult {
    const start = performance.now();
    const meshletGen = new MeshletGenerator(this.options.meshletOptions);
    const lodGen = new LODGenerator({
      levelCount: 2,
      reductionPerLevel: this.options.reductionRatio,
      algorithm: this.options.simplificationAlgorithm,
    });

    // ── LOD 0: original meshlets ──
    const lod0Result = meshletGen.generate(mesh);
    let currentMeshlets = lod0Result.meshlets;
    const levels: MeshletLODLevel[] = [];
    let globalIdCounter = 0;

    const lod0Hierarchical: HierarchicalMeshlet[] = currentMeshlets.map((m) => ({
      ...m,
      lodLevel: 0,
      children: [],
      parents: [],
      globalId: globalIdCounter++,
    }));

    levels.push({
      level: 0,
      meshlets: lod0Hierarchical,
      totalTriangles: lod0Result.totalTriangles,
      totalVertices: lod0Result.totalVertexRefs,
    });

    // ── Subsequent LODs ──
    for (let lod = 1; lod < this.options.levelCount; lod++) {
      if (currentMeshlets.length <= 1) break;

      const groups = groupMeshlets(currentMeshlets, this.options.groupSize);
      const nextMeshlets: HierarchicalMeshlet[] = [];
      let levelTriangles = 0;
      let levelVertices = 0;

      for (const group of groups) {
        // Merge group triangles into a sub-mesh
        const subMesh = meshletsToMeshData(group, mesh.positions);
        if (subMesh.indices.length === 0) continue;

        // Simplify the sub-mesh
        const targetTriangles = Math.max(
          4,
          Math.floor((subMesh.indices.length / 3) * this.options.reductionRatio)
        );

        let simplified: MeshData;
        try {
          simplified = lodGen.simplifyMesh(subMesh, targetTriangles, this.options.simplificationAlgorithm);
        } catch {
          // Fallback: use sub-mesh as-is if simplification fails
          simplified = subMesh;
        }

        // Re-meshletize
        const groupResult = meshletGen.generate(simplified);

        for (const m of groupResult.meshlets) {
          const hm: HierarchicalMeshlet = {
            ...m,
            lodLevel: lod,
            children: group.map((g) => g.id),
            parents: [],
            globalId: globalIdCounter++,
          };
          nextMeshlets.push(hm);
          levelTriangles += m.triangleCount;
          levelVertices += m.vertexCount;
        }
      }

      if (nextMeshlets.length === 0) break;

      // Set parent links on children
      for (const hm of nextMeshlets) {
        for (const childId of hm.children) {
          const child = levels[lod - 1].meshlets.find((c) => c.id === childId);
          if (child) {
            child.parents.push(hm.globalId);
          }
        }
      }

      levels.push({
        level: lod,
        meshlets: nextMeshlets,
        totalTriangles: levelTriangles,
        totalVertices: levelVertices,
      });

      currentMeshlets = nextMeshlets;
    }

    const generationTimeMs = performance.now() - start;
    const totalMeshlets = levels.reduce((s, l) => s + l.meshlets.length, 0);
    const reductionRatios = levels.map((l) =>
      l.totalTriangles / (levels[0]?.totalTriangles || 1)
    );

    return {
      levels,
      totalMeshlets,
      sourceTriangles: lod0Result.sourceTriangles,
      generationTimeMs,
      reductionRatios,
    };
  }

  /** Get current options */
  getOptions(): MeshletHierarchyOptions {
    return { ...this.options };
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMeshletLODBuilder(
  options?: Partial<MeshletHierarchyOptions>
): MeshletLODBuilder {
  return new MeshletLODBuilder(options);
}

/** Convenience: build hierarchy in one call */
export function buildMeshletHierarchy(
  mesh: MeshData,
  options?: Partial<MeshletHierarchyOptions>
): MeshletHierarchyResult {
  return new MeshletLODBuilder(options).build(mesh);
}
