/**
 * PrintabilityAnalyzer — FFF / SLA / SLS 3D-print pre-flight checker.
 *
 * Takes a triangle surface mesh (shared `SurfaceMesh` contract) plus optional
 * signed-distance field, and returns a `PrintabilityReport` with all fields
 * analytically computed — none are stubbed.
 *
 * ## Units
 *
 * The analyzer is **unit-agnostic**: it operates on raw coordinate values with
 * no built-in conversion.  By STL convention coordinates are typically in
 * millimetres, but the caller controls interpretation.  Use `scaleFactor` in
 * `PrintabilityOptions` if you need to normalise to a different unit before
 * analysis (vault rule G.GOLD.485: physical-unit assumptions are config, not
 * code).
 *
 * ## Algorithms
 *
 * ### Watertightness & Manifold check
 *
 * Build an undirected edge map: key = `min(a,b)_max(a,b)`.  Each directed
 * half-edge (a→b) for triangle winding contributes one count per undirected
 * key.  A closed, manifold mesh has every edge shared by exactly 2 triangles.
 *
 *   watertight  ⟺  ∀ edges: count == 2
 *   manifold    ⟺  ∀ edges: count ≤ 2  AND  no degenerate faces
 *
 * Degenerate face: any two vertex indices are equal, OR the cross-product
 * magnitude is < ε (zero-area face).
 *
 * ### Volume (divergence theorem)
 *
 * Signed volume via the divergence-theorem form of the surface integral:
 *
 *   V = (1/6) Σ_i  (v0 · (v1 × v2))
 *
 * where v0,v1,v2 are the three vertices of each triangle in winding order.
 * A positive result means outward-facing normals (right-hand rule pointing
 * away from the interior); negative means inward / inverted winding.
 *
 * ### Surface area
 *
 *   A = Σ_i  ½ ‖(v1−v0) × (v2−v0)‖
 *
 * ### Overhang detection
 *
 * Let N̂ be the outward face normal (unnormalised → normalised) and D̂ the
 * normalised build direction (default +Z).  A face overhangs when:
 *
 *   angle(N̂, −D̂)  <  (90° − threshold°)
 *
 * i.e. the face tilts toward the build plate more than `threshold` degrees
 * from the horizontal.  Equivalently:
 *
 *   dot(N̂, −D̂) > cos(90° − threshold°) = sin(threshold°)
 *
 * Faces whose centroid is within `bedEpsilon` of `aabb.min` along the build
 * direction are bed-contact faces and are excluded (they rest on the plate).
 *
 * ### Thin-wall heuristic (SDF sampling)
 *
 * Samples a uniform grid over the mesh AABB.  For each interior sample
 * (evaluateSDFNode(p) < 0) within the narrow band |d| < minWallThickness,
 * records 2·|d| as the local wall-thickness estimate.  Reports the minimum.
 *
 * This is a heuristic, not an exact medial-axis computation — it can miss
 * thin walls thinner than the grid spacing and may undercount on curved
 * surfaces.  Accurate wall-thickness analysis requires medial-axis extraction
 * or morphological erosion.
 *
 * ## Build direction convention
 *
 * `buildDirection` is a convention parameter, NOT a physics-derived value.
 * The default [0,0,1] means "print layers stack along +Z" — the most common
 * slicer convention for STL files.  Override this for machines that print
 * along a different axis, or when the part is oriented differently.
 *
 * @see SurfaceMesh    — shared mesh contract (AutoMesher.ts)
 * @see SDFNode        — signed-distance tree (SDFPointEvaluator.ts)
 * @see evaluateSDFNode — JS SDF evaluator
 */

import type { SurfaceMesh } from '../AutoMesher';
import type { SDFNode } from '../SDFPointEvaluator';
import { evaluateSDFNode } from '../SDFPointEvaluator';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Three-component vector (no heap allocation in hot paths — use inline arrays). */
type Vec3 = readonly [number, number, number];

/** Axis-aligned bounding box. */
export interface AABB {
  min: Vec3;
  max: Vec3;
  size: Vec3;
}

/** Overhang summary returned in the report. */
export interface OverhangStats {
  /** Number of overhanging triangles. */
  count: number;
  /** Total area of overhanging triangles (same units² as geometry). */
  totalArea: number;
  /** Fraction of total surface area that overhangs: totalArea / surfaceArea. */
  fraction: number;
  /**
   * Worst overhang angle in degrees — the smallest angle between the
   * face normal and –buildDirection (0° = perfectly horizontal underside).
   * NaN when count === 0.
   */
  worstAngleDeg: number;
}

/**
 * Thin-wall sampling result.
 *
 * **Heuristic only** — this is a coarse grid-sampling estimate using the
 * signed-distance field.  It is NOT an exact medial-axis computation.  Thin
 * walls narrower than the grid spacing may not be detected, and curved
 * surfaces will yield conservative (under-)estimates.  For production-grade
 * wall-thickness analysis, use morphological erosion or medial-axis
 * extraction on the full SDF.
 */
export interface ThinWallHeuristic {
  /**
   * Minimum 2·|sdf| measured over interior narrow-band samples.
   * Undefined when no interior narrow-band samples were found.
   */
  minEstimatedThicknessMm: number | undefined;
  /** Number of interior narrow-band sample points queried. */
  sampleCount: number;
}

/** Full printability analysis report. */
export interface PrintabilityReport {
  // ── Topology ──────────────────────────────────────────────────────────────
  /** True iff every edge is shared by exactly 2 triangles. */
  watertight: boolean;
  /** Number of edges shared by only 1 triangle (boundary edges). */
  openEdgeCount: number;
  /**
   * True iff watertight AND no edge is shared by >2 triangles AND no
   * degenerate (zero-area or repeated-index) face exists.
   */
  manifold: boolean;

  // ── Geometry ──────────────────────────────────────────────────────────────
  /**
   * Signed volume via the divergence theorem (same units³ as geometry).
   * Negative → winding is inverted (normals point inward).
   */
  volume: number;
  /** Total surface area (same units² as geometry). */
  surfaceArea: number;
  /**
   * True iff the computed volume is positive, meaning face normals are
   * consistently outward-facing.
   */
  orientationOutward: boolean;
  /** Axis-aligned bounding box of the mesh vertices. */
  aabb: AABB;
  /**
   * Whether the mesh AABB fits inside the given `buildVolume`.
   * Undefined when `buildVolume` was not provided.
   */
  fitsBuildVolume: boolean | undefined;

  // ── Printability ──────────────────────────────────────────────────────────
  /**
   * Overhang statistics.  Bed-contact faces (centroid within `bedEpsilon` of
   * aabb.min along buildDirection) are excluded.
   */
  overhangs: OverhangStats;
  /**
   * Thin-wall heuristic result.  Undefined when `sdf` and `minWallThickness`
   * were not both provided.
   */
  wallThickness: ThinWallHeuristic | undefined;

  // ── Recommendation ────────────────────────────────────────────────────────
  /**
   * - `'not-printable'`  — mesh has topology errors or inverted winding.
   * - `'needs-supports'` — mesh is topologically sound but has overhangs.
   * - `'printable'`      — no detected issues.
   */
  recommendation: 'printable' | 'needs-supports' | 'not-printable';
}

/**
 * Options for `analyzePrintability`.
 *
 * All fields are optional; documented defaults match common FFF-printer
 * conventions but are NOT physics laws — override as needed.
 */
export interface PrintabilityOptions {
  /**
   * Build direction — the direction in which layers are stacked.
   *
   * **Convention, not physics**: [0,0,1] (+Z up) is the most common slicer
   * convention for STL files and is the default here.  Override for machines
   * that print along a different axis, or when the part is placed on its side.
   *
   * The vector does not need to be normalised — it is normalised internally.
   *
   * @default [0, 0, 1]
   */
  buildDirection?: Vec3;

  /**
   * Overhang threshold in degrees (0°–90°).
   *
   * Faces angled more than this many degrees from horizontal (away from the
   * build plate) are flagged as overhangs.  FFF printers typically bridge
   * ≤45° without supports; SLA/DLP can sometimes handle steeper angles.
   *
   * @default 45
   */
  overhangThresholdDeg?: number;

  /**
   * Optional build-volume AABB.  When provided, `fitsBuildVolume` is set in
   * the report.  Coordinates must be in the same unit system as the mesh.
   */
  buildVolume?: { min: Vec3; max: Vec3 };

  /**
   * Optional minimum wall thickness (same units as geometry).
   *
   * Only evaluated when `sdf` is also provided.  Triggers SDF grid sampling
   * to estimate the thinnest wall present; see `ThinWallHeuristic`.
   */
  minWallThickness?: number;

  /**
   * Optional SDF tree for interior wall-thickness sampling.
   *
   * Must describe the same solid as the surface mesh.  Interior is defined
   * as evaluateSDFNode(p) < 0.  Only used when `minWallThickness` is also
   * given.
   */
  sdf?: SDFNode;

  /**
   * Optional uniform scale factor applied to all vertex coordinates before
   * analysis.  Use to convert units (e.g. inches → mm: scaleFactor = 25.4).
   *
   * All report distances/areas/volumes are in the scaled units.
   *
   * @default 1
   */
  scaleFactor?: number;

  /**
   * Grid resolution for the thin-wall SDF sampling pass along each axis.
   *
   * Higher values give finer resolution at the cost of O(n³) SDF evaluations.
   *
   * @default [20, 20, 20]
   */
  sdfGridResolution?: readonly [number, number, number];

  /**
   * Bed-contact epsilon: faces whose centroid is within this distance of
   * `aabb.min` along the build direction are treated as resting on the print
   * bed and excluded from overhang detection.
   *
   * @default 1e-6
   */
  bedEpsilon?: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-300) return [0, 0, 0];
  return [x / len, y / len, z / len];
}

function dot3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

function cross3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number
): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/**
 * Pack an undirected edge (a, b) as a Map key (min/max ordering so both
 * half-edges hash identically). Number packing `lo·2³² + hi` is exact while
 * lo < 2²¹ (Number.MAX_SAFE_INTEGER = 2⁵³); for larger meshes fall back to
 * string keys — correct for any index, just slower. No BigInt: keeps this
 * module type-checkable under consumers targeting < ES2020 (e.g. studio).
 */
function undirectedEdgeKey(a: number, b: number, useStringKeys: boolean): number | string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return useStringKeys ? `${lo},${hi}` : lo * 0x100000000 + hi;
}

/** Vertex-index bound for the exact number-packed edge key (2²¹). */
const NUMBER_KEY_MAX_VERTEX = 0x200000;

// ── Core analysis ─────────────────────────────────────────────────────────────

/**
 * Analyse a triangle surface mesh for 3D-print feasibility.
 *
 * @param mesh  Triangle surface mesh — `SurfaceMesh` from AutoMesher.ts.
 * @param opts  Analysis options (all optional; see `PrintabilityOptions`).
 * @returns     `PrintabilityReport` with all fields computed.
 */
export function analyzePrintability(
  mesh: SurfaceMesh,
  opts: PrintabilityOptions = {}
): PrintabilityReport {
  // ── Normalise options ──────────────────────────────────────────────────────
  const scaleFactor = opts.scaleFactor ?? 1;
  const thresholdDeg = opts.overhangThresholdDeg ?? 45;
  const bedEpsilon = opts.bedEpsilon ?? 1e-6;
  const gridRes = opts.sdfGridResolution ?? ([20, 20, 20] as const);

  const rawBuildDir = opts.buildDirection ?? ([0, 0, 1] as const);
  const [bdx, bdy, bdz] = normalize3(rawBuildDir[0], rawBuildDir[1], rawBuildDir[2]);

  // sin(threshold) = cos(90° - threshold) — used in overhang dot-product test
  const sinThreshold = Math.sin((thresholdDeg * Math.PI) / 180);

  const verts = mesh.vertices;
  const tris = mesh.triangles;
  const triCount = (tris.length / 3) | 0;
  const vertCount = (verts.length / 3) | 0;

  // ── Scale vertices once into Float64 working copy ─────────────────────────
  const sv = new Float64Array(verts.length);
  if (scaleFactor === 1) {
    for (let i = 0; i < verts.length; i++) sv[i] = verts[i]!;
  } else {
    for (let i = 0; i < verts.length; i++) sv[i] = (verts[i] as number) * scaleFactor;
  }

  // ── AABB ──────────────────────────────────────────────────────────────────
  let mnX = Infinity,
    mnY = Infinity,
    mnZ = Infinity;
  let mxX = -Infinity,
    mxY = -Infinity,
    mxZ = -Infinity;

  for (let i = 0; i < vertCount; i++) {
    const x = sv[i * 3]!;
    const y = sv[i * 3 + 1]!;
    const z = sv[i * 3 + 2]!;
    if (x < mnX) mnX = x;
    if (y < mnY) mnY = y;
    if (z < mnZ) mnZ = z;
    if (x > mxX) mxX = x;
    if (y > mxY) mxY = y;
    if (z > mxZ) mxZ = z;
  }

  if (!Number.isFinite(mnX)) {
    // Empty mesh
    mnX = mnY = mnZ = mxX = mxY = mxZ = 0;
  }

  const aabb: AABB = {
    min: [mnX, mnY, mnZ],
    max: [mxX, mxY, mxZ],
    size: [mxX - mnX, mxY - mnY, mxZ - mnZ],
  };

  // Bed position along build direction (aabb.min projected onto buildDir)
  const bedLevel = dot3(mnX, mnY, mnZ, bdx, bdy, bdz);

  // ── Build volume fit ───────────────────────────────────────────────────────
  let fitsBuildVolume: boolean | undefined;
  if (opts.buildVolume) {
    const bv = opts.buildVolume;
    fitsBuildVolume =
      mnX >= bv.min[0] &&
      mnY >= bv.min[1] &&
      mnZ >= bv.min[2] &&
      mxX <= bv.max[0] &&
      mxY <= bv.max[1] &&
      mxZ <= bv.max[2];
  }

  // ── Per-triangle geometry pass ────────────────────────────────────────────
  // Computes: signed volume, surface area, overhang detection, degenerate check.

  // key → count of triangles sharing that edge; string keys only for huge meshes
  const useStringKeys = vertCount >= NUMBER_KEY_MAX_VERTEX;
  const edgeMap = new Map<number | string, number>();

  let signedVolumeSum = 0;
  let surfaceArea = 0;
  let overhangCount = 0;
  let overhangArea = 0;
  let worstAngleDeg = 90; // will only go down when overhangs are found
  let hasDegenerate = false;
  let openEdgeCount = 0;

  for (let t = 0; t < triCount; t++) {
    const i0 = tris[t * 3]!;
    const i1 = tris[t * 3 + 1]!;
    const i2 = tris[t * 3 + 2]!;

    // Degenerate: repeated vertex index
    if (i0 === i1 || i1 === i2 || i0 === i2) {
      hasDegenerate = true;
    }

    const x0 = sv[i0 * 3]!;
    const y0 = sv[i0 * 3 + 1]!;
    const z0 = sv[i0 * 3 + 2]!;
    const x1 = sv[i1 * 3]!;
    const y1 = sv[i1 * 3 + 1]!;
    const z1 = sv[i1 * 3 + 2]!;
    const x2 = sv[i2 * 3]!;
    const y2 = sv[i2 * 3 + 1]!;
    const z2 = sv[i2 * 3 + 2]!;

    // Edge map: three undirected edges per triangle
    const edges: [number, number][] = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ];
    for (const [a, b] of edges) {
      const key = undirectedEdgeKey(a, b, useStringKeys);
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }

    // Cross product (v1-v0) × (v2-v0)
    const ex = x1 - x0;
    const ey = y1 - y0;
    const ez = z1 - z0;
    const fx = x2 - x0;
    const fy = y2 - y0;
    const fz = z2 - z0;
    const [cx, cy, cz] = cross3(ex, ey, ez, fx, fy, fz);

    // Face area = ½‖cross‖
    const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const faceArea = 0.5 * crossLen;

    // Degenerate: zero-area face
    if (faceArea < 1e-300) {
      hasDegenerate = true;
    }

    surfaceArea += faceArea;

    // Signed volume contribution: (1/6) v0 · (v1 × v2)
    // Uses the divergence theorem: V = (1/6)Σ v0·(v1×v2)
    const [cx2, cy2, cz2] = cross3(x1, y1, z1, x2, y2, z2);
    signedVolumeSum += dot3(x0, y0, z0, cx2, cy2, cz2);

    // Overhang detection
    if (crossLen > 1e-300) {
      const [nx, ny, nz] = normalize3(cx, cy, cz);

      // Centroid along build direction
      const cx3 = (x0 + x1 + x2) / 3;
      const cy3 = (y0 + y1 + y2) / 3;
      const cz3 = (z0 + z1 + z2) / 3;
      const centroidAlongBuild = dot3(cx3, cy3, cz3, bdx, bdy, bdz);

      // Skip bed-contact faces
      if (centroidAlongBuild - bedLevel > bedEpsilon) {
        // Overhang: dot(N, -buildDir) > sin(threshold)
        // i.e. the face normal points "downward" more than threshold allows
        const downwardDot = dot3(nx, ny, nz, -bdx, -bdy, -bdz);
        if (downwardDot > sinThreshold) {
          overhangCount++;
          overhangArea += faceArea;

          // angle between N and -buildDir (0° = horizontal underside)
          const clampedDot = Math.min(1, Math.max(-1, downwardDot));
          const angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;
          if (angleDeg < worstAngleDeg) worstAngleDeg = angleDeg;
        }
      }
    }
  }

  const volume = signedVolumeSum / 6;

  // ── Topology summary ──────────────────────────────────────────────────────
  let hasNonManifoldEdge = false;
  openEdgeCount = 0;

  for (const [, count] of edgeMap) {
    if (count === 1) openEdgeCount++;
    if (count > 2) hasNonManifoldEdge = true;
  }

  const watertight = openEdgeCount === 0;
  const manifold = watertight && !hasNonManifoldEdge && !hasDegenerate;

  // ── Overhang summary ──────────────────────────────────────────────────────
  const overhangFraction = surfaceArea > 0 ? overhangArea / surfaceArea : 0;
  const overhangs: OverhangStats = {
    count: overhangCount,
    totalArea: overhangArea,
    fraction: overhangFraction,
    worstAngleDeg: overhangCount > 0 ? worstAngleDeg : NaN,
  };

  // ── Thin-wall heuristic (SDF) ─────────────────────────────────────────────
  let wallThickness: ThinWallHeuristic | undefined;

  if (opts.sdf !== undefined && opts.minWallThickness !== undefined) {
    const sdfNode = opts.sdf;
    const minWall = opts.minWallThickness;
    const [gx, gy, gz] = gridRes;

    const spanX = mxX - mnX;
    const spanY = mxY - mnY;
    const spanZ = mxZ - mnZ;
    const stepX = gx > 1 ? spanX / (gx - 1) : 0;
    const stepY = gy > 1 ? spanY / (gy - 1) : 0;
    const stepZ = gz > 1 ? spanZ / (gz - 1) : 0;

    let minThickness: number | undefined;
    let sampleCount = 0;

    for (let ix = 0; ix < gx; ix++) {
      for (let iy = 0; iy < gy; iy++) {
        for (let iz = 0; iz < gz; iz++) {
          const px = mnX + ix * stepX;
          const py = mnY + iy * stepY;
          const pz = mnZ + iz * stepZ;

          const d = evaluateSDFNode(sdfNode, [px, py, pz]);

          // Interior narrow-band: d < 0 and |d| < minWallThickness
          if (d < 0 && Math.abs(d) < minWall) {
            sampleCount++;
            const localThickness = 2 * Math.abs(d);
            if (minThickness === undefined || localThickness < minThickness) {
              minThickness = localThickness;
            }
          }
        }
      }
    }

    wallThickness = {
      minEstimatedThicknessMm: minThickness,
      sampleCount,
    };
  }

  // ── Recommendation ────────────────────────────────────────────────────────
  const orientationOutward = volume > 0;

  let recommendation: PrintabilityReport['recommendation'];
  if (!watertight || !manifold || !orientationOutward) {
    recommendation = 'not-printable';
  } else if (overhangCount > 0) {
    recommendation = 'needs-supports';
  } else {
    recommendation = 'printable';
  }

  return {
    watertight,
    openEdgeCount,
    manifold,
    volume,
    surfaceArea,
    orientationOutward,
    aabb,
    fitsBuildVolume,
    overhangs,
    wallThickness,
    recommendation,
  };
}
