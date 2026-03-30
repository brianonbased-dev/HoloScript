/**
 * MeshletGenerator — Nanite-style mesh cluster generator.
 *
 * Splits a mesh into small, spatially-coherent triangle clusters
 * (meshlets) of bounded size. Each meshlet can be independently
 * culled, streamed, and LOD-transitioned.
 *
 * Key properties:
 * - Max 64 vertices, 124 triangles per meshlet (GPU-friendly)
 * - Spatial locality via greedy triangle growing
 * - Per-meshlet bounding sphere for efficient culling
 * - Compatible with mesh shaders (Task→Mesh pipeline)
 *
 * @see HS-5 — Meshlet cluster generator directive
 * @see W.080 — Draft→Mesh→Simulation pipeline
 */

import type { MeshData } from './LODGenerator';

// ── Types ────────────────────────────────────────────────────────────────────

/** Configuration for meshlet generation */
export interface MeshletGeneratorOptions {
  /** Maximum vertices per meshlet (default: 64) */
  maxVertices: number;
  /** Maximum triangles per meshlet (default: 124) */
  maxTriangles: number;
  /** Cone culling threshold for backface culling (0-1, default: 0.9) */
  coneWeight: number;
}

/** A single meshlet — a small, bounded cluster of triangles */
export interface Meshlet {
  /** Unique ID within the mesh */
  id: number;
  /** Indices into the meshlet's local vertex buffer */
  triangleIndices: Uint32Array;
  /** Global vertex indices referenced by this meshlet */
  vertexIndices: Uint32Array;
  /** Number of triangles in this meshlet */
  triangleCount: number;
  /** Number of vertices in this meshlet */
  vertexCount: number;
  /** Bounding sphere center [x, y, z] */
  boundCenter: [number, number, number];
  /** Bounding sphere radius */
  boundRadius: number;
  /** Normal cone axis [x, y, z] for backface culling */
  coneAxis: [number, number, number];
  /** Normal cone cutoff (dot product threshold) */
  coneCutoff: number;
}

/** Result of meshlet generation */
export interface MeshletGenerationResult {
  /** Generated meshlets */
  meshlets: Meshlet[];
  /** Total triangle count across all meshlets */
  totalTriangles: number;
  /** Total vertex references across all meshlets */
  totalVertexRefs: number;
  /** Source mesh triangle count */
  sourceTriangles: number;
  /** Generation time in ms */
  generationTimeMs: number;
}

export const DEFAULT_MESHLET_OPTIONS: MeshletGeneratorOptions = {
  maxVertices: 64,
  maxTriangles: 124,
  coneWeight: 0.9,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get position of vertex by global index */
function getPos(positions: Float32Array, idx: number): [number, number, number] {
  const i = idx * 3;
  return [positions[i], positions[i + 1], positions[i + 2]];
}

/** Euclidean distance squared between two points */
function distSq(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Compute bounding sphere for a set of positions */
function computeBoundingSphere(
  positions: Float32Array,
  vertexIndices: number[]
): { center: [number, number, number]; radius: number } {
  if (vertexIndices.length === 0) {
    return { center: [0, 0, 0], radius: 0 };
  }

  // Ritter's bounding sphere (fast approximate)
  let cx = 0,
    cy = 0,
    cz = 0;
  for (const vi of vertexIndices) {
    const p = getPos(positions, vi);
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  const n = vertexIndices.length;
  cx /= n;
  cy /= n;
  cz /= n;

  let maxR2 = 0;
  for (const vi of vertexIndices) {
    const p = getPos(positions, vi);
    const r2 = distSq(p, [cx, cy, cz]);
    if (r2 > maxR2) maxR2 = r2;
  }

  return {
    center: [cx, cy, cz],
    radius: Math.sqrt(maxR2),
  };
}

/** Compute normal cone for backface culling */
function computeNormalCone(
  positions: Float32Array,
  indices: Uint32Array,
  triangleList: number[]
): { axis: [number, number, number]; cutoff: number } {
  if (triangleList.length === 0) {
    return { axis: [0, 1, 0], cutoff: 1 };
  }

  // Accumulate face normals
  let ax = 0,
    ay = 0,
    az = 0;
  for (const ti of triangleList) {
    const i0 = indices[ti * 3];
    const i1 = indices[ti * 3 + 1];
    const i2 = indices[ti * 3 + 2];
    const p0 = getPos(positions, i0);
    const p1 = getPos(positions, i1);
    const p2 = getPos(positions, i2);
    // Cross product of edges
    const e1x = p1[0] - p0[0],
      e1y = p1[1] - p0[1],
      e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0],
      e2y = p2[1] - p0[1],
      e2z = p2[2] - p0[2];
    ax += e1y * e2z - e1z * e2y;
    ay += e1z * e2x - e1x * e2z;
    az += e1x * e2y - e1y * e2x;
  }

  // Normalize average axis
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-10) return { axis: [0, 1, 0], cutoff: 1 };
  ax /= len;
  ay /= len;
  az /= len;

  // Find min dot product (widest deviation from cone axis)
  let minDot = 1;
  for (const ti of triangleList) {
    const i0 = indices[ti * 3];
    const i1 = indices[ti * 3 + 1];
    const i2 = indices[ti * 3 + 2];
    const p0 = getPos(positions, i0);
    const p1 = getPos(positions, i1);
    const p2 = getPos(positions, i2);
    const e1x = p1[0] - p0[0],
      e1y = p1[1] - p0[1],
      e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0],
      e2y = p2[1] - p0[1],
      e2z = p2[2] - p0[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-10) continue;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const dot = ax * nx + ay * ny + az * nz;
    if (dot < minDot) minDot = dot;
  }

  return { axis: [ax, ay, az], cutoff: minDot };
}

// ── Adjacency ────────────────────────────────────────────────────────────────

/** Build triangle adjacency: for each triangle, find neighboring triangles */
function buildAdjacency(indices: Uint32Array, triCount: number): Map<number, Set<number>> {
  // Edge → triangles sharing that edge
  const edgeMap = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    const edges = [
      [Math.min(i0, i1), Math.max(i0, i1)],
      [Math.min(i1, i2), Math.max(i1, i2)],
      [Math.min(i2, i0), Math.max(i2, i0)],
    ];
    for (const [a, b] of edges) {
      const key = `${a}-${b}`;
      const list = edgeMap.get(key);
      if (list) list.push(t);
      else edgeMap.set(key, [t]);
    }
  }

  // Tri → neighbor tris
  const adj = new Map<number, Set<number>>();
  for (let t = 0; t < triCount; t++) {
    adj.set(t, new Set());
  }
  for (const tris of edgeMap.values()) {
    for (let i = 0; i < tris.length; i++) {
      for (let j = i + 1; j < tris.length; j++) {
        adj.get(tris[i])!.add(tris[j]);
        adj.get(tris[j])!.add(tris[i]);
      }
    }
  }
  return adj;
}

// ── Generator ────────────────────────────────────────────────────────────────

export class MeshletGenerator {
  private options: MeshletGeneratorOptions;

  constructor(options: Partial<MeshletGeneratorOptions> = {}) {
    this.options = { ...DEFAULT_MESHLET_OPTIONS, ...options };
  }

  /**
   * Generate meshlets from input mesh data.
   * Uses greedy spatial growing to build bounded clusters.
   */
  generate(mesh: MeshData): MeshletGenerationResult {
    const start = performance.now();
    const triCount = mesh.indices.length / 3;

    if (triCount === 0) {
      return {
        meshlets: [],
        totalTriangles: 0,
        totalVertexRefs: 0,
        sourceTriangles: 0,
        generationTimeMs: performance.now() - start,
      };
    }

    const adjacency = buildAdjacency(mesh.indices, triCount);
    const claimed = new Uint8Array(triCount); // 0 = unclaimed, 1 = claimed
    const meshlets: Meshlet[] = [];
    let meshletId = 0;

    // Greedy: pick a seed triangle, grow outward until limits hit
    for (let seed = 0; seed < triCount; seed++) {
      if (claimed[seed]) continue;

      const meshletTris: number[] = [];
      const meshletVerts = new Set<number>();
      const frontier: number[] = [seed];

      while (frontier.length > 0) {
        const tri = frontier.pop()!;
        if (claimed[tri]) continue;

        // Check if adding this triangle would exceed limits
        const i0 = mesh.indices[tri * 3];
        const i1 = mesh.indices[tri * 3 + 1];
        const i2 = mesh.indices[tri * 3 + 2];
        const newVerts = [i0, i1, i2].filter((v) => !meshletVerts.has(v));
        const wouldVertCount = meshletVerts.size + newVerts.length;
        const wouldTriCount = meshletTris.length + 1;

        if (wouldVertCount > this.options.maxVertices) continue;
        if (wouldTriCount > this.options.maxTriangles) continue;

        // Accept triangle
        claimed[tri] = 1;
        meshletTris.push(tri);
        meshletVerts.add(i0);
        meshletVerts.add(i1);
        meshletVerts.add(i2);

        // Add neighbors to frontier
        const neighbors = adjacency.get(tri);
        if (neighbors) {
          for (const n of neighbors) {
            if (!claimed[n]) frontier.push(n);
          }
        }
      }

      if (meshletTris.length === 0) continue;

      // Build meshlet
      const vertArray = Array.from(meshletVerts);
      const vertIndexMap = new Map<number, number>();
      vertArray.forEach((v, i) => vertIndexMap.set(v, i));

      // Local triangle indices (into meshlet's vertex buffer)
      const localIndices = new Uint32Array(meshletTris.length * 3);
      for (let t = 0; t < meshletTris.length; t++) {
        const ti = meshletTris[t];
        localIndices[t * 3] = vertIndexMap.get(mesh.indices[ti * 3])!;
        localIndices[t * 3 + 1] = vertIndexMap.get(mesh.indices[ti * 3 + 1])!;
        localIndices[t * 3 + 2] = vertIndexMap.get(mesh.indices[ti * 3 + 2])!;
      }

      const bounds = computeBoundingSphere(mesh.positions, vertArray);
      const cone = computeNormalCone(mesh.positions, mesh.indices, meshletTris);

      meshlets.push({
        id: meshletId++,
        triangleIndices: localIndices,
        vertexIndices: new Uint32Array(vertArray),
        triangleCount: meshletTris.length,
        vertexCount: vertArray.length,
        boundCenter: bounds.center,
        boundRadius: bounds.radius,
        coneAxis: cone.axis,
        coneCutoff: cone.cutoff,
      });
    }

    const generationTimeMs = performance.now() - start;

    return {
      meshlets,
      totalTriangles: meshlets.reduce((s, m) => s + m.triangleCount, 0),
      totalVertexRefs: meshlets.reduce((s, m) => s + m.vertexCount, 0),
      sourceTriangles: triCount,
      generationTimeMs,
    };
  }

  /** Get current options */
  getOptions(): MeshletGeneratorOptions {
    return { ...this.options };
  }
}

/** Factory function */
export function createMeshletGenerator(
  options?: Partial<MeshletGeneratorOptions>
): MeshletGenerator {
  return new MeshletGenerator(options);
}

/** Convenience: generate meshlets in one call */
export function generateMeshlets(
  mesh: MeshData,
  options?: Partial<MeshletGeneratorOptions>
): MeshletGenerationResult {
  return new MeshletGenerator(options).generate(mesh);
}
