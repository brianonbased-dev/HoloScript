/**
 * MarchingCubes — SDF-to-watertight-triangle-mesh via the classic marching cubes algorithm.
 *
 * ## Algorithm Overview
 *
 * Marching cubes (Lorensen & Cline, 1987) evaluates a scalar field at the 8 corners of each
 * axis-aligned voxel and produces zero, one or more triangles whose vertices lie on the cell
 * edges where the field changes sign.  The full 256-case edge/triangle lookup tables here are
 * taken verbatim from Paul Bourke's public-domain `polygonise()` implementation
 * (http://paulbourke.net/geometry/polygonise/).
 *
 * ## SDF sign convention
 *
 * The SDF convention used throughout this codebase (matching SDFPointEvaluator) is:
 *   - **negative inside** the solid
 *   - **positive outside** the solid
 *
 * The iso-surface is the zero level-set.  Triangles are wound so that the face normal
 * (v1-v0)×(v2-v0) points **outward** (away from the negative / interior region).
 * Bourke's tri-table uses the opposite convention (inside = distance > isoLevel), so
 * this implementation swaps i1 and i2 in every emitted triangle to correct the winding.
 * Verified: the signed divergence-theorem volume of a unit sphere is positive, confirming
 * outward winding.
 *
 * ## Cube vertex / edge numbering (Bourke convention)
 *
 *         7 ──────── 6
 *        /|          /|
 *       4 ──────── 5  |        Edges:
 *       |  3 ──────|─ 2         0: v0–v1   4: v4–v5   8:  v0–v4
 *       | /        | /          1: v1–v2   5: v5–v6   9:  v1–v5
 *       0 ──────── 1            2: v2–v3   6: v6–v7   10: v2–v6
 *                               3: v3–v0   7: v7–v4   11: v3–v7
 *
 * Corner offsets (dx,dy,dz):
 *   0=(0,0,0)  1=(1,0,0)  2=(1,1,0)  3=(0,1,0)
 *   4=(0,0,1)  5=(1,0,1)  6=(1,1,1)  7=(0,1,1)
 *
 * ## Vertex placement
 *
 * Vertex positions are computed by **linear interpolation** along each cell edge at the
 * fraction where the SDF crosses `isoLevel`:
 *
 *   t = (isoLevel - d0) / (d1 - d0)
 *   vertex = p0 + t * (p1 - p0)
 *
 * ## Vertex welding
 *
 * Vertices are keyed by a canonical global grid-edge identifier:
 *   `(lowerCornerFlatIndex) * 3 + dir`
 * where `lowerCornerFlatIndex = gx + nx*(gy + ny*gz)` for the lower-indexed corner of the
 * edge, and `dir` is 0=X, 1=Y, 2=Z.  Because this key is intrinsic to the physical grid
 * edge (independent of which cell looks it up), adjacent cells that share an edge always
 * retrieve the same pre-computed vertex — giving an exactly-welded, watertight mesh with
 * zero floating-point tolerance required.
 *
 * ## Boundary handling (`closeBoundary`)
 *
 * If the SDF is still negative (inside) at the sampling-box faces the surface would exit
 * the grid and produce open holes.  When `closeBoundary = true` (the default), boundary
 * layer sample values that are below `isoLevel` are clamped to `isoLevel + 1e-6`, forcing
 * the iso-surface to close at the box faces.
 *
 * **Trade-off**: the resulting caps are flat and lie exactly on the bounding-box faces.
 * For objects that genuinely extend beyond the sampled region this is geometrically
 * incorrect but watertight.  Set `closeBoundary = false` if the object is known to be
 * fully contained within the sampling box (SDF is positive everywhere on the boundary).
 *
 * ## Units
 *
 * Geometry is unit-agnostic.  STL convention is millimetres; the caller controls units
 * via the `bounds` option.  **Never hardcode a unit conversion** (vault rule G.GOLD.485:
 * physical assumptions are config).  Expose `scaleFactor` (default 1.0) to apply a
 * uniform scale to the output mesh without changing the SDF evaluation domain.
 *
 * @module MarchingCubes
 */

import type { SurfaceMesh } from '../AutoMesher';
import {
  type SDFNode,
  type SDFDistanceField,
  sampleSDFDistanceField,
} from '../SDFPointEvaluator';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Small positive epsilon added above iso when clamping boundary samples. */
const BOUNDARY_EPS = 1e-6;

/** Triangles with cross-product squared length below this are culled. */
const AREA_EPS_SQ = 1e-24;

// ── Paul Bourke edge table — 256 entries (public domain) ─────────────────────
//
// Each entry is a 12-bit bitmask; bit i is set when the iso-surface crosses edge i.
const EDGE_TABLE: ReadonlyArray<number> = [
  0x000, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
  0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x099, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x033, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0x0aa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x066, 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0x0ff, 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x055, 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0x0cc,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0x0cc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x15c, 0x055, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0x0ff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x066, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0x0aa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x033, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x099, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x000,
];

// ── Paul Bourke triangle table — 256 rows (public domain) ────────────────────
//
// Each row lists edge indices forming triangles (3 per tri); -1 terminates.
// Stored as flat arrays for fast iteration; undefined entries are omitted.
const TRI_TABLE: ReadonlyArray<ReadonlyArray<number>> = [
  [],
  [0, 8, 3],
  [0, 1, 9],
  [1, 8, 3, 9, 8, 1],
  [1, 2, 10],
  [0, 8, 3, 1, 2, 10],
  [9, 2, 10, 0, 2, 9],
  [2, 8, 3, 2, 10, 8, 10, 9, 8],
  [3, 11, 2],
  [0, 11, 2, 8, 11, 0],
  [1, 9, 0, 2, 3, 11],
  [1, 11, 2, 1, 9, 11, 9, 8, 11],
  [3, 10, 1, 11, 10, 3],
  [0, 10, 1, 0, 8, 10, 8, 11, 10],
  [3, 9, 0, 3, 11, 9, 11, 10, 9],
  [9, 8, 10, 10, 8, 11],
  [4, 7, 8],
  [4, 3, 0, 7, 3, 4],
  [0, 1, 9, 8, 4, 7],
  [4, 1, 9, 4, 7, 1, 7, 3, 1],
  [1, 2, 10, 8, 4, 7],
  [3, 4, 7, 3, 0, 4, 1, 2, 10],
  [9, 2, 10, 9, 0, 2, 8, 4, 7],
  [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4],
  [8, 4, 7, 3, 11, 2],
  [11, 4, 7, 11, 2, 4, 2, 0, 4],
  [9, 0, 1, 8, 4, 7, 2, 3, 11],
  [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4],
  [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4],
  [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3],
  [4, 7, 11, 4, 11, 9, 9, 11, 10],
  [9, 5, 4],
  [9, 5, 4, 0, 8, 3],
  [0, 5, 4, 1, 5, 0],
  [8, 5, 4, 8, 3, 5, 3, 1, 5],
  [1, 2, 10, 9, 5, 4],
  [3, 0, 8, 1, 2, 10, 4, 9, 5],
  [5, 2, 10, 5, 4, 2, 4, 0, 2],
  [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8],
  [9, 5, 4, 2, 3, 11],
  [0, 11, 2, 0, 8, 11, 4, 9, 5],
  [0, 5, 4, 0, 1, 5, 2, 3, 11],
  [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5],
  [10, 3, 11, 10, 1, 3, 9, 5, 4],
  [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10],
  [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3],
  [5, 4, 8, 5, 8, 10, 10, 8, 11],
  [9, 7, 8, 5, 7, 9],
  [9, 3, 0, 9, 5, 3, 5, 7, 3],
  [0, 7, 8, 0, 1, 7, 1, 5, 7],
  [1, 5, 3, 3, 5, 7],
  [9, 7, 8, 9, 5, 7, 10, 1, 2],
  [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3],
  [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2],
  [2, 10, 5, 2, 5, 3, 3, 5, 7],
  [7, 9, 5, 7, 8, 9, 3, 11, 2],
  [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11],
  [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7],
  [11, 2, 1, 11, 1, 7, 7, 1, 5],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11],
  [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0],
  [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0],
  [11, 10, 5, 7, 11, 5],
  [10, 6, 5],
  [0, 8, 3, 5, 10, 6],
  [9, 0, 1, 5, 10, 6],
  [1, 8, 3, 1, 9, 8, 5, 10, 6],
  [1, 6, 5, 2, 6, 1],
  [1, 6, 5, 1, 2, 6, 3, 0, 8],
  [9, 6, 5, 9, 0, 6, 0, 2, 6],
  [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8],
  [2, 3, 11, 10, 6, 5],
  [11, 0, 8, 11, 2, 0, 10, 6, 5],
  [0, 1, 9, 2, 3, 11, 5, 10, 6],
  [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11],
  [6, 3, 11, 6, 5, 3, 5, 1, 3],
  [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6],
  [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9],
  [6, 5, 9, 6, 9, 11, 11, 9, 8],
  [5, 10, 6, 4, 7, 8],
  [4, 3, 0, 4, 7, 3, 6, 5, 10],
  [1, 9, 0, 5, 10, 6, 8, 4, 7],
  [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4],
  [6, 1, 2, 6, 5, 1, 4, 7, 8],
  [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7],
  [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6],
  [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9],
  [3, 11, 2, 7, 8, 4, 10, 6, 5],
  [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11],
  [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6],
  [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6],
  [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11],
  [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7],
  [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9],
  [10, 4, 9, 6, 4, 10],
  [4, 10, 6, 4, 9, 10, 0, 8, 3],
  [10, 0, 1, 10, 6, 0, 6, 4, 0],
  [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10],
  [1, 4, 9, 1, 2, 4, 2, 6, 4],
  [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4],
  [0, 2, 4, 4, 2, 6],
  [8, 3, 2, 8, 2, 4, 4, 2, 6],
  [10, 4, 9, 10, 6, 4, 11, 2, 3],
  [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6],
  [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10],
  [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3],
  [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1],
  [3, 11, 6, 3, 6, 0, 0, 6, 4],
  [6, 4, 8, 11, 6, 8],
  [7, 10, 6, 7, 8, 10, 8, 9, 10],
  [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10],
  [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0],
  [10, 6, 7, 10, 7, 1, 1, 7, 3],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7],
  [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9],
  [7, 8, 0, 7, 0, 6, 6, 0, 2],
  [7, 3, 2, 6, 7, 2],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7],
  [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7],
  [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11],
  [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6],
  [0, 9, 1, 11, 6, 7],
  [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0],
  [7, 11, 6],
  [7, 6, 11],
  [3, 0, 8, 11, 7, 6],
  [0, 1, 9, 11, 7, 6],
  [8, 1, 9, 8, 3, 1, 11, 7, 6],
  [10, 1, 2, 6, 11, 7],
  [1, 2, 10, 3, 0, 8, 6, 11, 7],
  [2, 9, 0, 2, 10, 9, 6, 11, 7],
  [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8],
  [7, 2, 3, 6, 2, 7],
  [7, 0, 8, 7, 6, 0, 6, 2, 0],
  [2, 7, 6, 2, 3, 7, 0, 1, 9],
  [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6],
  [10, 7, 6, 10, 1, 7, 1, 3, 7],
  [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8],
  [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7],
  [7, 6, 10, 7, 10, 8, 8, 10, 9],
  [6, 8, 4, 11, 8, 6],
  [3, 6, 11, 3, 0, 6, 0, 4, 6],
  [8, 6, 11, 8, 4, 6, 9, 0, 1],
  [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6],
  [6, 8, 4, 6, 11, 8, 2, 10, 1],
  [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6],
  [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9],
  [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3],
  [8, 2, 3, 8, 4, 2, 4, 6, 2],
  [0, 4, 2, 4, 6, 2],
  [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8],
  [1, 9, 4, 1, 4, 2, 2, 4, 6],
  [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1],
  [10, 1, 0, 10, 0, 6, 6, 0, 4],
  [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3],
  [10, 9, 4, 6, 10, 4],
  [4, 9, 5, 7, 6, 11],
  [0, 8, 3, 4, 9, 5, 11, 7, 6],
  [5, 0, 1, 5, 4, 0, 7, 6, 11],
  [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5],
  [9, 5, 4, 10, 1, 2, 7, 6, 11],
  [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5],
  [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2],
  [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6],
  [7, 2, 3, 7, 6, 2, 5, 4, 9],
  [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7],
  [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0],
  [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8],
  [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7],
  [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4],
  [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10],
  [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10],
  [6, 9, 5, 6, 11, 9, 11, 8, 9],
  [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5],
  [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11],
  [6, 11, 3, 6, 3, 5, 5, 3, 1],
  [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6],
  [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10],
  [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5],
  [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3],
  [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2],
  [9, 5, 6, 9, 6, 0, 0, 6, 2],
  [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8],
  [1, 5, 6, 2, 1, 6],
  [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6],
  [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0],
  [0, 3, 8, 5, 6, 10],
  [10, 5, 6],
  [11, 5, 10, 7, 5, 11],
  [11, 5, 10, 11, 7, 5, 8, 3, 0],
  [5, 11, 7, 5, 10, 11, 1, 9, 0],
  [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1],
  [11, 1, 2, 11, 7, 1, 7, 5, 1],
  [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11],
  [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7],
  [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2],
  [2, 5, 10, 2, 3, 5, 3, 7, 5],
  [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5],
  [9, 0, 1, 2, 3, 5, 3, 7, 5, 2, 5, 10],
  [1, 10, 2, 5, 8, 7, 5, 9, 8, 5, 7, 8],
  [1, 3, 5, 3, 7, 5],
  [0, 8, 7, 0, 7, 1, 1, 7, 5],
  [9, 0, 3, 9, 3, 5, 5, 3, 7],
  [9, 8, 7, 5, 9, 7],
  [5, 8, 4, 5, 10, 8, 10, 11, 8],
  [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0],
  [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5],
  [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4],
  [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8],
  [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11],
  [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5],
  [9, 4, 5, 2, 11, 3],
  [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4],
  [5, 10, 2, 5, 2, 4, 4, 2, 0],
  [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9],
  [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2],
  [8, 4, 5, 8, 5, 3, 3, 5, 1],
  [0, 4, 5, 1, 0, 5],
  [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5],
  [9, 4, 5],
  [4, 11, 7, 4, 9, 11, 9, 10, 11],
  [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11],
  [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11],
  [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4],
  [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2],
  [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3],
  [11, 7, 4, 11, 4, 2, 2, 4, 0],
  [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4],
  [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9],
  [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7],
  [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10],
  [1, 10, 2, 8, 7, 4],
  [4, 9, 1, 4, 1, 7, 7, 1, 3],
  [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1],
  [4, 0, 3, 7, 4, 3],
  [4, 8, 7],
  [9, 10, 8, 10, 11, 8],
  [3, 0, 9, 3, 9, 11, 11, 9, 10],
  [0, 1, 10, 0, 10, 8, 8, 10, 11],
  [3, 1, 10, 11, 3, 10],
  [1, 2, 11, 1, 11, 9, 9, 11, 8],
  [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9],
  [0, 2, 11, 8, 0, 11],
  [3, 2, 11],
  [2, 3, 8, 2, 8, 10, 10, 8, 9],
  [9, 10, 2, 0, 9, 2],
  [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8],
  [1, 10, 2],
  [1, 3, 8, 9, 1, 8],
  [0, 9, 1],
  [0, 3, 8],
  [],
];

// ── Edge endpoint vertex pairs (edge index 0–11) ──────────────────────────────
//
// Each entry [a, b] gives the two corner indices connected by that edge.
const EDGE_VERTICES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0], // bottom face (z=0)
  [4, 5], [5, 6], [6, 7], [7, 4], // top face (z=1)
  [0, 4], [1, 5], [2, 6], [3, 7], // vertical edges
];

// ── Corner offsets [dx, dy, dz] for the 8 voxel corners ──────────────────────
//
// Ordered to match the Bourke cube vertex numbering above.
const CORNER_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], // 0
  [1, 0, 0], // 1
  [1, 1, 0], // 2
  [0, 1, 0], // 3
  [0, 0, 1], // 4
  [1, 0, 1], // 5
  [1, 1, 1], // 6
  [0, 1, 1], // 7
];

// ── Per-edge canonical offset and direction ───────────────────────────────────
//
// For edge index e, EDGE_CANONICAL[e] = [dx, dy, dz, dir] where:
//   (dx, dy, dz) is the grid offset of the *lower-addressed* corner of the edge
//   relative to the cell origin (ix, iy, iz), and
//   dir is 0=X, 1=Y, 2=Z (the axis along which the edge runs).
//
// The global edge key is then:
//   (ix + dx, iy + dy, iz + dz) → flattened grid index * 3 + dir
//
// This uniquely identifies each grid edge regardless of which cell references it,
// enabling exact vertex welding across cell boundaries.
//
// Derived from CORNER_OFFSETS and EDGE_VERTICES:
//   e0: c0=(0,0,0) c1=(1,0,0) → lower=(0,0,0) dir=0
//   e1: c1=(1,0,0) c2=(1,1,0) → lower=(1,0,0) dir=1
//   e2: c2=(1,1,0) c3=(0,1,0) → lower=(0,1,0) dir=0
//   e3: c3=(0,1,0) c0=(0,0,0) → lower=(0,0,0) dir=1
//   e4: c4=(0,0,1) c5=(1,0,1) → lower=(0,0,1) dir=0
//   e5: c5=(1,0,1) c6=(1,1,1) → lower=(1,0,1) dir=1
//   e6: c6=(1,1,1) c7=(0,1,1) → lower=(0,1,1) dir=0
//   e7: c7=(0,1,1) c4=(0,0,1) → lower=(0,0,1) dir=1
//   e8: c0=(0,0,0) c4=(0,0,1) → lower=(0,0,0) dir=2
//   e9: c1=(1,0,0) c5=(1,0,1) → lower=(1,0,0) dir=2
//  e10: c2=(1,1,0) c6=(1,1,1) → lower=(1,1,0) dir=2
//  e11: c3=(0,1,0) c7=(0,1,1) → lower=(0,1,0) dir=2
const EDGE_CANONICAL: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0], // e0
  [1, 0, 0, 1], // e1
  [0, 1, 0, 0], // e2
  [0, 0, 0, 1], // e3
  [0, 0, 1, 0], // e4
  [1, 0, 1, 1], // e5
  [0, 1, 1, 0], // e6
  [0, 0, 1, 1], // e7
  [0, 0, 0, 2], // e8
  [1, 0, 0, 2], // e9
  [1, 1, 0, 2], // e10
  [0, 1, 0, 2], // e11
];

// ── Options ────────────────────────────────────────────────────────────────────

/**
 * Options for {@link marchingCubes}.
 *
 * All fields are optional and have documented defaults.
 */
export interface MarchingCubesOptions {
  /**
   * World-space AABB to sample over.
   * Default: `{ min: [-1, -1, -1], max: [1, 1, 1] }`.
   *
   * STL convention is millimetres.  The caller controls units by setting
   * these bounds appropriately — no unit conversion is ever hardcoded here
   * (G.GOLD.485: physical assumptions are config).
   */
  bounds?: {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  };

  /**
   * Number of sample points along each axis [nx, ny, nz].
   * Higher values produce finer meshes at O(N³) cost.
   * Default: `[32, 32, 32]`.  Must be >= 2 on every axis.
   */
  resolution?: readonly [number, number, number];

  /**
   * The iso-surface level.  The mesh will be the level-set `SDF == isoLevel`.
   * Default: `0` (the zero level-set).
   */
  isoLevel?: number;

  /**
   * When `true` (default), boundary face samples below `isoLevel` are clamped
   * to `isoLevel + 1e-6`, forcing the mesh to close at the box boundaries.
   *
   * Set to `false` only when the SDF is guaranteed positive everywhere on the
   * boundary faces (object fully contained in the sampling box).
   */
  closeBoundary?: boolean;

  /**
   * Uniform scale applied to output vertex positions after meshing.
   * Does not affect SDF sampling or isoLevel comparison.
   * Default: `1.0`.
   *
   * Use to convert between unit systems without re-evaluating the SDF
   * (G.GOLD.485: physical assumptions are config, never hardcoded).
   */
  scaleFactor?: number;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Convert an SDF into a watertight triangle mesh using the standard 256-case
 * marching cubes algorithm with vertex welding.
 *
 * @param input - An {@link SDFNode} tree (sampled on demand) or a
 *               pre-sampled {@link SDFDistanceField}.
 * @param opts  - Sampling bounds, resolution, iso-level, and mesh options.
 * @returns     - A {@link SurfaceMesh} with exactly-welded vertices and
 *               outward-facing triangle normals.
 */
export function marchingCubes(
  input: SDFNode | SDFDistanceField,
  opts: MarchingCubesOptions = {}
): SurfaceMesh {
  // ── Resolve options ─────────────────────────────────────────────────────
  const bMin: readonly [number, number, number] = opts.bounds?.min ?? [-1, -1, -1];
  const bMax: readonly [number, number, number] = opts.bounds?.max ?? [1, 1, 1];
  const res: readonly [number, number, number] = opts.resolution ?? [32, 32, 32];
  const iso: number = opts.isoLevel ?? 0;
  const closeBoundary: boolean = opts.closeBoundary !== false;
  const scale: number = opts.scaleFactor ?? 1.0;

  const nx = res[0], ny = res[1], nz = res[2];
  if (nx < 2 || ny < 2 || nz < 2) {
    throw new Error('marchingCubes: resolution must be >= 2 on every axis');
  }

  // Cell spacing between adjacent sample points.
  const sx = (bMax[0] - bMin[0]) / (nx - 1);
  const sy = (bMax[1] - bMin[1]) / (ny - 1);
  const sz = (bMax[2] - bMin[2]) / (nz - 1);

  // ── Obtain / validate the distance field ────────────────────────────────
  let field: SDFDistanceField;
  if (isSDFNode(input)) {
    field = sampleSDFDistanceField(input, {
      min: bMin,
      max: bMax,
      resolution: res,
    });
  } else {
    field = input;
  }

  // Build a mutable typed copy for boundary clamping.
  const nTotal = nx * ny * nz;
  const dist = new Float64Array(nTotal);
  for (let i = 0; i < nTotal; i++) dist[i] = field.distances[i] as number;

  // ── Boundary clamping ────────────────────────────────────────────────────
  if (closeBoundary) {
    const clamp = (ix: number, iy: number, iz: number): void => {
      const idx = ix + nx * (iy + ny * iz);
      if (dist[idx]! < iso) dist[idx] = iso + BOUNDARY_EPS;
    };
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      clamp(ix, iy, 0); clamp(ix, iy, nz - 1);
    }
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 0; ix < nx; ix++) {
      clamp(ix, 0, iz); clamp(ix, ny - 1, iz);
    }
    for (let iz = 1; iz < nz - 1; iz++) for (let iy = 1; iy < ny - 1; iy++) {
      clamp(0, iy, iz); clamp(nx - 1, iy, iz);
    }
  }

  // ── Output accumulation ──────────────────────────────────────────────────
  // Use plain number arrays; pack into typed arrays at the end.
  const vBuf: number[] = [];  // flat xyz: length = 3 * vertexCount
  const iBuf: number[] = [];  // flat triangle vertex indices

  // Vertex cache keyed by a canonical global grid-edge identifier.
  //
  // Key = (gx + nx * (gy + ny * gz)) * 3 + dir
  //   where (gx, gy, gz) is the lower-addressed corner of the edge and
  //   dir is 0=X, 1=Y, 2=Z.
  //
  // This makes the key intrinsic to the physical grid edge, so adjacent
  // cells referencing the same edge retrieve the same pre-computed vertex
  // — giving exact vertex welding and a watertight mesh.
  const edgeMap = new Map<number, number>();

  // ── Iterate over all voxel cells ─────────────────────────────────────────
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {

        // Sample corner distances and world positions.
        let cubeIndex = 0;
        const cd: [number,number,number,number,number,number,number,number] =
          [0,0,0,0,0,0,0,0];
        const cx: [number,number,number,number,number,number,number,number] =
          [0,0,0,0,0,0,0,0];
        const cy_: [number,number,number,number,number,number,number,number] =
          [0,0,0,0,0,0,0,0];
        const cz_: [number,number,number,number,number,number,number,number] =
          [0,0,0,0,0,0,0,0];

        for (let c = 0; c < 8; c++) {
          const off = CORNER_OFFSETS[c]!;
          const gx = ix + off[0];
          const gy = iy + off[1];
          const gz = iz + off[2];
          const d = dist[gx + nx * (gy + ny * gz)]!;
          cd[c] = d;
          cx[c] = bMin[0] + gx * sx;
          cy_[c] = bMin[1] + gy * sy;
          cz_[c] = bMin[2] + gz * sz;
          if (d < iso) cubeIndex |= (1 << c);
        }

        const edgeMask = EDGE_TABLE[cubeIndex]!;
        if (edgeMask === 0) continue;

        // Compute / retrieve the interpolated vertex on each active edge.
        // ev[e] = vertex index in vBuf, or -1 if edge e is not active.
        const ev: [number,number,number,number,number,number,number,number,
                   number,number,number,number] =
          [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];

        for (let e = 0; e < 12; e++) {
          if (!(edgeMask & (1 << e))) continue;

          // Build the canonical global edge key from the lower corner + direction.
          const ec = EDGE_CANONICAL[e]!;
          const gx = ix + ec[0];
          const gy = iy + ec[1];
          const gz = iz + ec[2];
          const dir = ec[3];
          const key = (gx + nx * (gy + ny * gz)) * 3 + dir;

          const cached = edgeMap.get(key);
          if (cached !== undefined) {
            ev[e] = cached;
            continue;
          }

          // Interpolate vertex position along the edge.
          const [ca, cb] = EDGE_VERTICES[e]!;
          const da = cd[ca]!;
          const db = cd[cb]!;
          const denom = db - da;
          const t = Math.abs(denom) < 1e-12 ? 0.5 : (iso - da) / denom;

          const vx = cx[ca]! + t * (cx[cb]! - cx[ca]!);
          const vy = cy_[ca]! + t * (cy_[cb]! - cy_[ca]!);
          const vz = cz_[ca]! + t * (cz_[cb]! - cz_[ca]!);

          const idx = (vBuf.length / 3) | 0;
          vBuf.push(vx, vy, vz);
          edgeMap.set(key, idx);
          ev[e] = idx;
        }

        // Emit triangles.
        //
        // Winding convention: Bourke's tri-table was defined for positive-inside
        // SDFs (corner inside when d > isoLevel).  Our evaluator is negative-inside
        // (corner inside when d < isoLevel).  To correct the winding and produce
        // outward-facing normals we swap i1 and i2 in every triangle, which is
        // equivalent to reversing the traversal order of each triple.
        const tris = TRI_TABLE[cubeIndex]!;
        for (let t = 0; t < tris.length; t += 3) {
          const i0 = ev[tris[t]!]!;
          // Swap i1 ↔ i2 to flip winding for negative-inside SDF convention.
          const i1 = ev[tris[t + 2]!]!;
          const i2 = ev[tris[t + 1]!]!;
          if (i0 === i1 || i1 === i2 || i0 === i2) continue;

          // Area check via cross product (v1-v0)×(v2-v0).
          const b0 = i0 * 3;
          const b1 = i1 * 3;
          const b2 = i2 * 3;
          const ex = vBuf[b1]! - vBuf[b0]!;
          const ey = vBuf[b1 + 1]! - vBuf[b0 + 1]!;
          const ez = vBuf[b1 + 2]! - vBuf[b0 + 2]!;
          const fx = vBuf[b2]! - vBuf[b0]!;
          const fy = vBuf[b2 + 1]! - vBuf[b0 + 1]!;
          const fz = vBuf[b2 + 2]! - vBuf[b0 + 2]!;
          const crossX = ey * fz - ez * fy;
          const crossY = ez * fx - ex * fz;
          const crossZ = ex * fy - ey * fx;
          if (crossX * crossX + crossY * crossY + crossZ * crossZ < AREA_EPS_SQ) continue;

          iBuf.push(i0, i1, i2);
        }
      }
    }
  }

  // ── Build output typed arrays ────────────────────────────────────────────
  const vertices = new Float64Array(vBuf.length);
  if (scale === 1.0) {
    for (let i = 0; i < vBuf.length; i++) vertices[i] = vBuf[i]!;
  } else {
    for (let i = 0; i < vBuf.length; i++) vertices[i] = vBuf[i]! * scale;
  }

  const triangles = new Uint32Array(iBuf.length);
  for (let i = 0; i < iBuf.length; i++) triangles[i] = iBuf[i]!;

  return { vertices, triangles };
}

// ── Type guard ─────────────────────────────────────────────────────────────────

/** Returns `true` when `input` is an SDFNode (has a `type` string field). */
function isSDFNode(input: SDFNode | SDFDistanceField): input is SDFNode {
  return typeof (input as SDFNode).type === 'string';
}
