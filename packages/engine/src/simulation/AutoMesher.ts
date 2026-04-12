/**
 * AutoMesher — Surface-to-volume tetrahedral mesh generation.
 *
 * Provides structured meshing for axis-aligned boxes (built-in) and a
 * pluggable interface for WASM-based meshers (TetGen, Gmsh) to handle
 * arbitrary surface geometry.
 *
 * ## Built-in: Structured Box Mesher
 *
 * Generates a regular hexahedral grid subdivided into 5 tetrahedra per hex
 * using the alternating Freudenthal decomposition (same as verification tests).
 * Produces consistent, high-quality meshes for rectangular domains.
 *
 * ## Pluggable: Surface Mesh Interface
 *
 * `meshSurface()` accepts a triangle surface mesh (STL/OBJ-style) and
 * delegates to a registered WASM mesher. When no WASM mesher is registered,
 * falls back to bounding-box meshing.
 *
 * ## TET10 Upgrade
 *
 * All meshers produce TET4 connectivity. Use `tet4ToTet10()` from
 * StructuralSolverTET10 to upgrade to quadratic elements.
 *
 * @see StructuralSolverTET10 — consumes the mesh this module produces
 * @see tet4ToTet10 — upgrades TET4 → TET10 by inserting mid-edge nodes
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TetMesh {
  /** Vertex positions: flat [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float64Array;
  /** Element connectivity: flat [n0,n1,n2,n3, ...] — 4 per tet */
  tetrahedra: Uint32Array;
  /** Number of vertices */
  nodeCount: number;
  /** Number of tetrahedra */
  elementCount: number;
}

export interface BoxMeshOptions {
  /** Box origin [x, y, z] (default: [0, 0, 0]) */
  origin?: [number, number, number];
  /** Box dimensions [lx, ly, lz] */
  size: [number, number, number];
  /** Number of subdivisions [nx, ny, nz] (default: [4, 4, 4]) */
  divisions?: [number, number, number];
}

export interface SurfaceMesh {
  /** Triangle vertex positions: flat [x0,y0,z0, ...] */
  vertices: Float64Array | Float32Array;
  /** Triangle connectivity: flat [i0,i1,i2, ...] — 3 per face */
  triangles: Uint32Array;
}

export interface SurfaceMeshOptions {
  /** Target maximum edge length */
  maxEdgeLength?: number;
  /** Target element quality (0-1, higher = better) */
  quality?: number;
  /** Volume constraint (max tet volume) */
  maxVolume?: number;
}

/**
 * Pluggable WASM mesher interface.
 * Implement this and register via `AutoMesher.registerWasmMesher()`.
 */
export interface WasmMesher {
  /** Generate volumetric tet mesh from surface triangles */
  tetrahedralize(surface: SurfaceMesh, options?: SurfaceMeshOptions): Promise<TetMesh>;
}

// ── Structured Box Mesher ────────────────────────────────────────────────────

/**
 * Generate a structured tetrahedral mesh for an axis-aligned box.
 *
 * Algorithm: Regular hexahedral grid → 5 tets per hex (alternating Freudenthal).
 * This decomposition alternates orientation at each cell to maintain conforming
 * faces between adjacent hexahedra, producing a valid conformal mesh.
 *
 * @returns TET4 mesh (upgrade to TET10 via tet4ToTet10)
 */
export function meshBox(options: BoxMeshOptions): TetMesh {
  const origin = options.origin ?? [0, 0, 0];
  const [lx, ly, lz] = options.size;
  const [nx, ny, nz] = options.divisions ?? [4, 4, 4];

  if (nx < 1 || ny < 1 || nz < 1) {
    throw new Error(`Divisions must be >= 1, got [${nx}, ${ny}, ${nz}]`);
  }
  if (lx <= 0 || ly <= 0 || lz <= 0) {
    throw new Error(`Size must be positive, got [${lx}, ${ly}, ${lz}]`);
  }

  // Generate vertices on regular grid
  const nodeCount = (nx + 1) * (ny + 1) * (nz + 1);
  const vertices = new Float64Array(nodeCount * 3);

  let idx = 0;
  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        vertices[idx++] = origin[0] + (i * lx) / nx;
        vertices[idx++] = origin[1] + (j * ly) / ny;
        vertices[idx++] = origin[2] + (k * lz) / nz;
      }
    }
  }

  function nodeIndex(i: number, j: number, k: number): number {
    return k * (nx + 1) * (ny + 1) + j * (nx + 1) + i;
  }

  // Generate tetrahedra: 5 per hex, alternating decomposition
  const elementCount = nx * ny * nz * 5;
  const tetrahedra = new Uint32Array(elementCount * 4);

  let tetIdx = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = nodeIndex(i, j, k);
        const v1 = nodeIndex(i + 1, j, k);
        const v2 = nodeIndex(i + 1, j + 1, k);
        const v3 = nodeIndex(i, j + 1, k);
        const v4 = nodeIndex(i, j, k + 1);
        const v5 = nodeIndex(i + 1, j, k + 1);
        const v6 = nodeIndex(i + 1, j + 1, k + 1);
        const v7 = nodeIndex(i, j + 1, k + 1);

        // Alternating decomposition for conforming faces
        // Node orderings verified for positive determinant (right-hand rule)
        if ((i + j + k) % 2 === 0) {
          tetrahedra[tetIdx++] = v0; tetrahedra[tetIdx++] = v1; tetrahedra[tetIdx++] = v3; tetrahedra[tetIdx++] = v4;
          tetrahedra[tetIdx++] = v1; tetrahedra[tetIdx++] = v2; tetrahedra[tetIdx++] = v3; tetrahedra[tetIdx++] = v6;
          tetrahedra[tetIdx++] = v4; tetrahedra[tetIdx++] = v5; tetrahedra[tetIdx++] = v1; tetrahedra[tetIdx++] = v6;
          tetrahedra[tetIdx++] = v4; tetrahedra[tetIdx++] = v7; tetrahedra[tetIdx++] = v6; tetrahedra[tetIdx++] = v3;
          tetrahedra[tetIdx++] = v1; tetrahedra[tetIdx++] = v4; tetrahedra[tetIdx++] = v6; tetrahedra[tetIdx++] = v3;
        } else {
          tetrahedra[tetIdx++] = v1; tetrahedra[tetIdx++] = v0; tetrahedra[tetIdx++] = v5; tetrahedra[tetIdx++] = v2;
          tetrahedra[tetIdx++] = v3; tetrahedra[tetIdx++] = v0; tetrahedra[tetIdx++] = v2; tetrahedra[tetIdx++] = v7;
          tetrahedra[tetIdx++] = v4; tetrahedra[tetIdx++] = v5; tetrahedra[tetIdx++] = v0; tetrahedra[tetIdx++] = v7;
          tetrahedra[tetIdx++] = v6; tetrahedra[tetIdx++] = v5; tetrahedra[tetIdx++] = v7; tetrahedra[tetIdx++] = v2;
          tetrahedra[tetIdx++] = v0; tetrahedra[tetIdx++] = v5; tetrahedra[tetIdx++] = v2; tetrahedra[tetIdx++] = v7;
        }
      }
    }
  }

  return { vertices, tetrahedra, nodeCount, elementCount };
}

// ── Boundary Node Queries ────────────────────────────────────────────────────

/**
 * Find all nodes on a specific face of an axis-aligned box mesh.
 * Useful for applying boundary conditions (constraints/loads).
 */
export function findNodesOnFace(
  mesh: TetMesh,
  face: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+',
  tolerance = 1e-10,
): number[] {
  const verts = mesh.vertices;
  const nodeCount = mesh.nodeCount;

  // Find bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < nodeCount; i++) {
    const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const targets: Record<string, { axis: number; value: number }> = {
    'x-': { axis: 0, value: minX },
    'x+': { axis: 0, value: maxX },
    'y-': { axis: 1, value: minY },
    'y+': { axis: 1, value: maxY },
    'z-': { axis: 2, value: minZ },
    'z+': { axis: 2, value: maxZ },
  };

  const { axis, value } = targets[face];
  const nodes: number[] = [];

  for (let i = 0; i < nodeCount; i++) {
    if (Math.abs(verts[i * 3 + axis] - value) < tolerance) {
      nodes.push(i);
    }
  }

  return nodes;
}

/**
 * Find all nodes within a spherical region.
 * Useful for point load application.
 */
export function findNodesInSphere(
  mesh: TetMesh,
  center: [number, number, number],
  radius: number,
): number[] {
  const verts = mesh.vertices;
  const r2 = radius * radius;
  const nodes: number[] = [];

  for (let i = 0; i < mesh.nodeCount; i++) {
    const dx = verts[i * 3] - center[0];
    const dy = verts[i * 3 + 1] - center[1];
    const dz = verts[i * 3 + 2] - center[2];
    if (dx * dx + dy * dy + dz * dz <= r2) {
      nodes.push(i);
    }
  }

  return nodes;
}

// ── Surface Mesh Interface ───────────────────────────────────────────────────

let registeredMesher: WasmMesher | null = null;

/**
 * Register a WASM-based mesher (e.g., TetGen compiled to WASM).
 * Once registered, `meshSurface()` will use it instead of the fallback.
 */
export function registerWasmMesher(mesher: WasmMesher): void {
  registeredMesher = mesher;
}

/**
 * Generate a volumetric tet mesh from a surface triangle mesh.
 *
 * If a WASM mesher is registered (via `registerWasmMesher`), delegates to it.
 * Otherwise falls back to bounding-box meshing with the surface's AABB.
 */
export async function meshSurface(
  surface: SurfaceMesh,
  options?: SurfaceMeshOptions,
): Promise<TetMesh> {
  if (registeredMesher) {
    return registeredMesher.tetrahedralize(surface, options);
  }

  // Fallback: mesh the bounding box of the surface
  const verts = surface.vertices;
  const nodeCount = verts.length / 3;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < nodeCount; i++) {
    const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const lx = maxX - minX || 1;
  const ly = maxY - minY || 1;
  const lz = maxZ - minZ || 1;

  // Estimate divisions from maxEdgeLength or default
  const targetEdge = options?.maxEdgeLength ?? Math.min(lx, ly, lz) / 4;
  const nx = Math.max(2, Math.round(lx / targetEdge));
  const ny = Math.max(2, Math.round(ly / targetEdge));
  const nz = Math.max(2, Math.round(lz / targetEdge));

  return meshBox({
    origin: [minX, minY, minZ],
    size: [lx, ly, lz],
    divisions: [nx, ny, nz],
  });
}

/**
 * Compute mesh quality statistics.
 */
export function meshQuality(mesh: TetMesh): {
  minVolume: number;
  maxVolume: number;
  avgVolume: number;
  minAspectRatio: number;
  invertedCount: number;
} {
  const verts = mesh.vertices;
  const tets = mesh.tetrahedra;
  let minVol = Infinity, maxVol = -Infinity, sumVol = 0;
  let minAR = Infinity;
  let inverted = 0;

  for (let e = 0; e < mesh.elementCount; e++) {
    const base = e * 4;
    const n0 = tets[base], n1 = tets[base + 1], n2 = tets[base + 2], n3 = tets[base + 3];

    // Edge vectors from n0
    const dx1 = verts[n1 * 3] - verts[n0 * 3], dy1 = verts[n1 * 3 + 1] - verts[n0 * 3 + 1], dz1 = verts[n1 * 3 + 2] - verts[n0 * 3 + 2];
    const dx2 = verts[n2 * 3] - verts[n0 * 3], dy2 = verts[n2 * 3 + 1] - verts[n0 * 3 + 1], dz2 = verts[n2 * 3 + 2] - verts[n0 * 3 + 2];
    const dx3 = verts[n3 * 3] - verts[n0 * 3], dy3 = verts[n3 * 3 + 1] - verts[n0 * 3 + 1], dz3 = verts[n3 * 3 + 2] - verts[n0 * 3 + 2];

    // Signed volume = det(J) / 6
    const det = dx1 * (dy2 * dz3 - dz2 * dy3) - dy1 * (dx2 * dz3 - dz2 * dx3) + dz1 * (dx2 * dy3 - dy2 * dx3);
    const vol = det / 6;

    if (vol < 0) inverted++;
    const absVol = Math.abs(vol);

    if (absVol < minVol) minVol = absVol;
    if (absVol > maxVol) maxVol = absVol;
    sumVol += absVol;

    // Aspect ratio: ratio of inscribed sphere radius to circumscribed sphere radius
    // Simplified: edge length ratio (max/min edge length)
    const edges = [
      Math.sqrt(dx1 * dx1 + dy1 * dy1 + dz1 * dz1),
      Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2),
      Math.sqrt(dx3 * dx3 + dy3 * dy3 + dz3 * dz3),
      Math.sqrt((dx2 - dx1) ** 2 + (dy2 - dy1) ** 2 + (dz2 - dz1) ** 2),
      Math.sqrt((dx3 - dx1) ** 2 + (dy3 - dy1) ** 2 + (dz3 - dz1) ** 2),
      Math.sqrt((dx3 - dx2) ** 2 + (dy3 - dy2) ** 2 + (dz3 - dz2) ** 2),
    ];
    const minE = Math.min(...edges);
    const maxE = Math.max(...edges);
    const ar = minE > 0 ? minE / maxE : 0;
    if (ar < minAR) minAR = ar;
  }

  return {
    minVolume: minVol === Infinity ? 0 : minVol,
    maxVolume: maxVol === -Infinity ? 0 : maxVol,
    avgVolume: mesh.elementCount > 0 ? sumVol / mesh.elementCount : 0,
    minAspectRatio: minAR === Infinity ? 0 : minAR,
    invertedCount: inverted,
  };
}
