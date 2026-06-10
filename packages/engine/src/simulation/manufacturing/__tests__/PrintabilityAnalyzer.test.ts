/**
 * PrintabilityAnalyzer tests — analytic / hand-built meshes only.
 *
 * All meshes are constructed inline from first principles; no external loaders
 * or sibling module dependencies (e.g. MarchingCubes) are used.
 *
 * Every assertion verifies a computed quantity against an analytic value, not
 * merely "does not throw".
 */

import { describe, it, expect } from 'vitest';
import type { SurfaceMesh } from '../../AutoMesher';
import type { SDFNode } from '../../SDFPointEvaluator';
import { evaluateSDFNode } from '../../SDFPointEvaluator';
import { analyzePrintability } from '../PrintabilityAnalyzer';

// ── Mesh builders ─────────────────────────────────────────────────────────────

/**
 * Build a closed unit cube [0,1]³ with consistently outward-facing normals.
 * 6 faces × 2 triangles each = 12 triangles.
 *
 * Vertex layout (8 corners):
 *   0=(0,0,0)  1=(1,0,0)  2=(1,1,0)  3=(0,1,0)
 *   4=(0,0,1)  5=(1,0,1)  6=(1,1,1)  7=(0,1,1)
 *
 * Winding order is counter-clockwise when viewed from outside, yielding
 * outward-facing normals (volume > 0).
 */
function makeUnitCube(): SurfaceMesh {
  // prettier-ignore
  const vertices = new Float64Array([
    0,0,0,  1,0,0,  1,1,0,  0,1,0,  // 0-3: z=0 (bottom)
    0,0,1,  1,0,1,  1,1,1,  0,1,1,  // 4-7: z=1 (top)
  ]);

  // Each face: 2 CCW triangles viewed from outside
  // prettier-ignore
  const triangles = new Uint32Array([
    // Bottom face (z=0, normal -Z, CCW from below = 0,3,2,1)
    0,3,2,  0,2,1,
    // Top face (z=1, normal +Z, CCW from above = 4,5,6,7)
    4,5,6,  4,6,7,
    // Front face (y=0, normal -Y)
    0,1,5,  0,5,4,
    // Back face (y=1, normal +Y)
    2,3,7,  2,7,6,
    // Left face (x=0, normal -X)
    0,4,7,  0,7,3,
    // Right face (x=1, normal +X)
    1,2,6,  1,6,5,
  ]);

  return { vertices, triangles };
}

/**
 * Same geometry as the unit cube but with all triangle winding reversed,
 * so normals point inward (volume < 0).
 */
function makeInvertedCube(): SurfaceMesh {
  const cube = makeUnitCube();
  const tris = new Uint32Array(cube.triangles.length);
  for (let t = 0; t < tris.length / 3; t++) {
    // Swap v1 and v2 to invert winding
    tris[t * 3] = cube.triangles[t * 3]!;
    tris[t * 3 + 1] = cube.triangles[t * 3 + 2]!;
    tris[t * 3 + 2] = cube.triangles[t * 3 + 1]!;
  }
  return { vertices: cube.vertices, triangles: tris };
}

/**
 * Unit cube missing its top face (z=1) — 10 triangles instead of 12.
 * Has 4 open edges around the top opening.
 */
function makeCubeMissingTopFace(): SurfaceMesh {
  const cube = makeUnitCube();
  // Drop first 6 entries (2 top-face triangles × 3 indices)
  // Top face is indices [3..5] in the face list → byte offset 9..14
  // Layout: bottom(0-5), top(6-11), front(12-17), back(18-23), left(24-29), right(30-35)
  // Remove top face triangles (indices 6,7,8, 9,10,11)
  const allTris = Array.from(cube.triangles);
  const withoutTop = [...allTris.slice(0, 6), ...allTris.slice(12)];
  return { vertices: cube.vertices, triangles: new Uint32Array(withoutTop) };
}

/**
 * A "table" mesh: a thin square plate (size L×L, thickness T) raised at
 * height H on a square column (size C×C, height H).
 *
 * Coordinate system:
 *   Column: x∈[cLo,cHi], y∈[cLo,cHi], z∈[0,H]
 *   Plate:  x∈[0,L],     y∈[0,L],     z∈[H, H+T]
 *
 * The underside of the plate (z=H) minus the column cross-section is a
 * horizontal overhang when build direction is +Z.
 *
 * To keep the mesh closed and manifold, the plate bottom is constructed with
 * a hole matching the column top — built by splitting the bottom face into
 * the annular ring between the plate edge and the column opening.
 *
 * For test simplicity we use:
 *   L=2, T=0.1, H=1, C=0.4
 *   Column occupies [0.8,1.2]² in XY.
 *
 * The overhang underside area ≈ L² − C² = 4 − 0.16 = 3.84.
 *
 * Mesh strategy (watertight, manifold):
 *   1. Column: 4 side faces + column-bottom
 *   2. Plate top face (full L×L)
 *   3. Plate sides (4 faces)
 *   4. Plate bottom annular ring: L×L minus column hole
 *      Split into 4 trapezoids (one per side of the column square)
 *      + 4 corner triangles.  Easier: triangulate as fan from an outer ring.
 *
 * For implementation simplicity we instead build two separate closed sub-meshes
 * (column and plate) that share their junction but whose junction faces are
 * correctly wound, and merge them — OR we use the direct "no-interior-seam"
 * approach that triangulates the bottom annular ring explicitly.
 *
 * Simplest correct approach:
 *   - 8 outer corners of the plate bottom form a square at z=H.
 *   - 4 inner corners (column top corners) at z=H.
 *   - Triangulate the annular region as 8 triangles (4 trapezoids each split
 *     into 2 triangles).
 */
function makeTable(): SurfaceMesh {
  const L = 2;  // plate XY extent [0, L]
  const T = 0.1; // plate thickness
  const H = 1;  // column height / plate bottom z
  const C = 0.4; // column width (square)
  const cLo = (L - C) / 2; // = 0.8
  const cHi = (L + C) / 2; // = 1.2

  // Vertex indices (named for clarity)
  //
  // Column bottom corners (z=0): cb0..cb3
  // Column top / plate-hole corners (z=H): ct0..ct3
  // Plate bottom outer corners (z=H): pb0..pb3
  // Plate top outer corners (z=H+T): pt0..pt3
  //
  // Note: plate bottom outer corners == column bottom outer corners in XY, but
  // at z=H. The plate bottom annular region goes from [0,L]² (outer) down to
  // [cLo,cHi]² (inner hole where column attaches).

  // prettier-ignore
  const verts: number[] = [
    // Column bottom (z=0): 0..3
    cLo,cLo,0,  cHi,cLo,0,  cHi,cHi,0,  cLo,cHi,0,
    // Column top / plate hole inner corners (z=H): 4..7
    cLo,cLo,H,  cHi,cLo,H,  cHi,cHi,H,  cLo,cHi,H,
    // Plate bottom outer corners (z=H): 8..11
    0,0,H,  L,0,H,  L,L,H,  0,L,H,
    // Plate top outer corners (z=H+T): 12..15
    0,0,H+T,  L,0,H+T,  L,L,H+T,  0,L,H+T,
  ];

  const vertices = new Float64Array(verts);

  // Indices:
  // Column bottom corners: 0,1,2,3
  // Column top (inner plate hole): 4,5,6,7
  // Plate bottom outer: 8,9,10,11
  // Plate top: 12,13,14,15

  const trisArr: number[] = [];

  function addTri(a: number, b: number, c: number): void {
    trisArr.push(a, b, c);
  }

  // ── Column ───────────────────────────────────────────────────────────────
  // Column bottom (z=0, normal -Z): CCW from below = 0,3,2,1
  addTri(0, 3, 2); addTri(0, 2, 1);

  // Column side: front (y=cLo): verts 0,1 bottom → 4,5 top; normal -Y
  addTri(0, 1, 5); addTri(0, 5, 4);
  // Column side: right (x=cHi): verts 1,2 bottom → 5,6 top; normal +X
  addTri(1, 2, 6); addTri(1, 6, 5);
  // Column side: back (y=cHi): verts 2,3 bottom → 6,7 top; normal +Y
  addTri(2, 3, 7); addTri(2, 7, 6);
  // Column side: left (x=cLo): verts 3,0 bottom → 7,4 top; normal -X
  addTri(3, 0, 4); addTri(3, 4, 7);

  // ── Plate bottom annular region (z=H, normal -Z) ─────────────────────────
  // Outer: 8(0,0), 9(L,0), 10(L,L), 11(0,L)
  // Inner hole: 4(cLo,cLo), 5(cHi,cLo), 6(cHi,cHi), 7(cLo,cHi)
  //
  // For outward normal pointing -Z (downward), we need CW winding viewed from
  // above (equivalent to CCW viewed from below where the outward direction is).
  //
  // Fan-triangulate each trapezoid with CW-from-above winding:
  // Front strip (y=0): outer 8(0,0,H), 9(L,0,H) with inner 5(cHi,cLo,H), 4(cLo,cLo,H)
  //   CW from above: 8→5→9 and 8→4→5
  addTri(8, 5, 9); addTri(8, 4, 5);
  // Right strip (x=L): outer 9(L,0,H), 10(L,L,H) with inner 6(cHi,cHi,H), 5(cHi,cLo,H)
  addTri(9, 6, 10); addTri(9, 5, 6);
  // Back strip (y=L): outer 10(L,L,H), 11(0,L,H) with inner 7(cLo,cHi,H), 6(cHi,cHi,H)
  addTri(10, 7, 11); addTri(10, 6, 7);
  // Left strip (x=0): outer 11(0,L,H), 8(0,0,H) with inner 4(cLo,cLo,H), 7(cLo,cHi,H)
  addTri(11, 4, 8); addTri(11, 7, 4);

  // ── Plate sides (4 vertical faces) ───────────────────────────────────────
  // Front side (y=0): outer bottom 8,9 → top 12,13; normal -Y
  addTri(8, 13, 12); addTri(8, 9, 13);
  // Right side (x=L): outer bottom 9,10 → top 13,14; normal +X
  addTri(9, 14, 13); addTri(9, 10, 14);
  // Back side (y=L): outer bottom 10,11 → top 14,15; normal +Y
  addTri(10, 15, 14); addTri(10, 11, 15);
  // Left side (x=0): outer bottom 11,8 → top 15,12; normal -X
  addTri(11, 12, 15); addTri(11, 8, 12);

  // ── Plate top (z=H+T, normal +Z) ─────────────────────────────────────────
  addTri(12, 13, 14); addTri(12, 14, 15);

  const triangles = new Uint32Array(trisArr);
  return { vertices, triangles };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a simple box SDF node with half-extents [hx, hy, hz].
 * The box is centred at the origin.
 */
function makeBoxSDF(hx: number, hy: number, hz: number): SDFNode {
  return {
    type: 'primitive',
    primitive: 'box',
    params: { width: hx, height: hy, depth: hz },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PrintabilityAnalyzer', () => {
  describe('closed unit cube', () => {
    const mesh = makeUnitCube();
    const report = analyzePrintability(mesh, { buildDirection: [0, 0, 1] });

    it('is watertight', () => {
      expect(report.watertight).toBe(true);
    });

    it('has zero open edges', () => {
      expect(report.openEdgeCount).toBe(0);
    });

    it('is manifold', () => {
      expect(report.manifold).toBe(true);
    });

    it('volume ≈ 1 (divergence theorem)', () => {
      expect(report.volume).toBeCloseTo(1, 9);
    });

    it('surface area ≈ 6 (sum of 6 unit faces)', () => {
      expect(report.surfaceArea).toBeCloseTo(6, 9);
    });

    it('orientation is outward (volume > 0)', () => {
      expect(report.orientationOutward).toBe(true);
    });

    it('AABB min is [0,0,0]', () => {
      expect(report.aabb.min[0]).toBeCloseTo(0, 12);
      expect(report.aabb.min[1]).toBeCloseTo(0, 12);
      expect(report.aabb.min[2]).toBeCloseTo(0, 12);
    });

    it('AABB max is [1,1,1]', () => {
      expect(report.aabb.max[0]).toBeCloseTo(1, 12);
      expect(report.aabb.max[1]).toBeCloseTo(1, 12);
      expect(report.aabb.max[2]).toBeCloseTo(1, 12);
    });

    it('no overhangs (all side faces vertical; bottom is bed contact)', () => {
      // All side faces are exactly vertical (normal perpendicular to buildDir),
      // the bottom face is a bed-contact face and excluded.
      // A vertical face has dot(normal, -buildDir) = 0, which is ≤ sin(45°) ≈ 0.707,
      // so no overhangs should be flagged.
      expect(report.overhangs.count).toBe(0);
    });

    it("recommendation is 'printable'", () => {
      expect(report.recommendation).toBe('printable');
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('cube missing top face', () => {
    const mesh = makeCubeMissingTopFace();
    const report = analyzePrintability(mesh);

    it('is NOT watertight', () => {
      expect(report.watertight).toBe(false);
    });

    it('has 4 open edges (perimeter of the missing top face)', () => {
      // The top square has 4 boundary edges once the top face is removed.
      expect(report.openEdgeCount).toBe(4);
    });

    it("recommendation is 'not-printable'", () => {
      expect(report.recommendation).toBe('not-printable');
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('inverted cube (reversed winding)', () => {
    const mesh = makeInvertedCube();
    const report = analyzePrintability(mesh);

    it('is still watertight (topology unchanged)', () => {
      expect(report.watertight).toBe(true);
    });

    it('volume is negative (inward-facing normals)', () => {
      expect(report.volume).toBeLessThan(0);
    });

    it('|volume| ≈ 1', () => {
      expect(Math.abs(report.volume)).toBeCloseTo(1, 9);
    });

    it('orientation is NOT outward', () => {
      expect(report.orientationOutward).toBe(false);
    });

    it("recommendation is 'not-printable' due to inverted orientation", () => {
      expect(report.recommendation).toBe('not-printable');
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('table mesh — overhang detection', () => {
    // L=2, C=0.4 → expected overhang underside area ≈ L²−C² = 4−0.16 = 3.84
    const mesh = makeTable();
    const report = analyzePrintability(mesh, {
      buildDirection: [0, 0, 1],
      overhangThresholdDeg: 45,
    });

    it('is watertight', () => {
      expect(report.watertight).toBe(true);
    });

    it('is manifold', () => {
      expect(report.manifold).toBe(true);
    });

    it('has overhangs (overhang count > 0)', () => {
      expect(report.overhangs.count).toBeGreaterThan(0);
    });

    it('overhang totalArea is within 5% of expected plate underside area (3.84)', () => {
      // Expected: plate underside (4.0) minus column top (0.16) = 3.84
      const expected = 3.84;
      const actual = report.overhangs.totalArea;
      expect(actual).toBeGreaterThan(expected * 0.95);
      expect(actual).toBeLessThan(expected * 1.05);
    });

    it("recommendation is 'needs-supports'", () => {
      expect(report.recommendation).toBe('needs-supports');
    });

    it('worst overhang angle is 0° (flat horizontal underside)', () => {
      // Plate underside has normal [0,0,-1], build direction [0,0,1].
      // dot([0,0,-1], [0,0,-1]) = 1, acos(1) = 0° → truly horizontal.
      expect(report.overhangs.worstAngleDeg).toBeCloseTo(0, 6);
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('build volume fit', () => {
    const mesh = makeUnitCube(); // AABB [0,0,0]→[1,1,1], size 1³

    it('fits inside a 2³ build volume', () => {
      const report = analyzePrintability(mesh, {
        buildVolume: { min: [0, 0, 0], max: [2, 2, 2] },
      });
      expect(report.fitsBuildVolume).toBe(true);
    });

    it('does NOT fit inside a 0.5³ build volume', () => {
      const report = analyzePrintability(mesh, {
        buildVolume: { min: [0, 0, 0], max: [0.5, 0.5, 0.5] },
      });
      expect(report.fitsBuildVolume).toBe(false);
    });

    it('fitsBuildVolume is undefined when no buildVolume is provided', () => {
      const report = analyzePrintability(mesh);
      expect(report.fitsBuildVolume).toBeUndefined();
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('thinWallHeuristic — SDF box 0.1mm wall', () => {
    // Box SDF with half-extents [0.05, 1, 1] → thickness along X ≈ 0.1.
    // The mesh is the unit cube for topology; the SDF represents the thin box.
    // We use minWallThickness = 0.3 so there are interior narrow-band samples.
    //
    // SDF box centre at origin, half-extents [0.05, 1, 1]:
    //   Interior: |x| < 0.05 AND |y| < 1 AND |z| < 1
    //   At x=0 (centre), sdf ≈ −0.05 → 2·|sdf| ≈ 0.10 < 0.3 → detected.
    //
    // We centre the SDF on the unit cube centroid [0.5, 0.5, 0.5] via translate.

    const sdf: SDFNode = {
      type: 'primitive',
      primitive: 'box',
      params: { width: 0.05, height: 1, depth: 1 },
      translate: [0.5, 0.5, 0.5],
    };

    const mesh = makeUnitCube();
    const report = analyzePrintability(mesh, {
      sdf,
      minWallThickness: 0.3,
      sdfGridResolution: [30, 10, 10],
    });

    it('wallThickness is defined', () => {
      expect(report.wallThickness).toBeDefined();
    });

    it('detects thin wall: minEstimatedThicknessMm < 0.3', () => {
      const wt = report.wallThickness!;
      expect(wt.minEstimatedThicknessMm).toBeDefined();
      expect(wt.minEstimatedThicknessMm!).toBeLessThan(0.3);
    });

    it('min estimated thickness is > 0 (not zero)', () => {
      const wt = report.wallThickness!;
      expect(wt.minEstimatedThicknessMm!).toBeGreaterThan(0);
    });

    it('sampleCount > 0', () => {
      expect(report.wallThickness!.sampleCount).toBeGreaterThan(0);
    });

    it('wallThickness is undefined when sdf not provided', () => {
      const r2 = analyzePrintability(mesh, { minWallThickness: 0.3 });
      expect(r2.wallThickness).toBeUndefined();
    });

    it('wallThickness is undefined when minWallThickness not provided', () => {
      const r2 = analyzePrintability(mesh, { sdf });
      expect(r2.wallThickness).toBeUndefined();
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('scaleFactor option', () => {
    it('scales volume by factor³', () => {
      const mesh = makeUnitCube();
      const r1 = analyzePrintability(mesh);
      const r2 = analyzePrintability(mesh, { scaleFactor: 2 });
      // Volume should scale by 2³ = 8
      expect(r2.volume).toBeCloseTo(r1.volume * 8, 9);
    });

    it('scales surfaceArea by factor²', () => {
      const mesh = makeUnitCube();
      const r1 = analyzePrintability(mesh);
      const r2 = analyzePrintability(mesh, { scaleFactor: 3 });
      expect(r2.surfaceArea).toBeCloseTo(r1.surfaceArea * 9, 9);
    });
  });

  // ── ─────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty mesh (0 triangles) — does not throw', () => {
      const mesh: SurfaceMesh = {
        vertices: new Float64Array([0, 0, 0]),
        triangles: new Uint32Array([]),
      };
      const report = analyzePrintability(mesh);
      expect(report.watertight).toBe(true); // no open edges
      expect(report.openEdgeCount).toBe(0);
      expect(report.volume).toBe(0);
      expect(report.surfaceArea).toBe(0);
    });

    it('box SDF direct evaluation sanity — makeBoxSDF helper', () => {
      // Verify the helper SDF: point at origin inside a [0.05,1,1] box.
      // Expected distance ≈ -0.05 (inside, closest surface along X).
      const sdf = makeBoxSDF(0.05, 1, 1);
      const d = evaluateSDFNode(sdf, [0, 0, 0]);
      expect(d).toBeCloseTo(-0.05, 6);
    });
  });
});
