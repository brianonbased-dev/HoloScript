/**
 * MarchingCubes test suite — analytic geometry assertions.
 *
 * All expected values are computed from closed-form formulae, not from the
 * mesh itself ("does not throw" is insufficient). Every test that measures
 * volume uses the divergence theorem:
 *
 *   V = (1/6) Σ_triangles  v0 · (v1 × v2)
 *
 * and surface area via the cross-product magnitude of edge vectors.
 *
 * Sign convention: SDF is negative INSIDE; signed volume should be POSITIVE
 * for a correctly outward-wound mesh.
 */

import { describe, it, expect } from 'vitest';
import {
  decideManufacturingBackend,
  estimateMarchingCubesTolerance,
  marchingCubes,
} from '../MarchingCubes';
import type { SDFNode } from '../../SDFPointEvaluator';
import { sampleSDFDistanceField } from '../../SDFPointEvaluator';

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Signed volume of a closed triangle mesh via the divergence theorem.
 * Positive = outward-wound normals (correct orientation).
 */
function signedVolume(vertices: Float64Array, triangles: Uint32Array): number {
  let vol = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t]! * 3;
    const i1 = triangles[t + 1]! * 3;
    const i2 = triangles[t + 2]! * 3;
    const x0 = vertices[i0]!;
    const y0 = vertices[i0 + 1]!;
    const z0 = vertices[i0 + 2]!;
    const x1 = vertices[i1]!;
    const y1 = vertices[i1 + 1]!;
    const z1 = vertices[i1 + 2]!;
    const x2 = vertices[i2]!;
    const y2 = vertices[i2 + 1]!;
    const z2 = vertices[i2 + 2]!;
    // v0 · (v1 × v2)
    const cx = y1 * z2 - z1 * y2;
    const cy = z1 * x2 - x1 * z2;
    const cz = x1 * y2 - y1 * x2;
    vol += x0 * cx + y0 * cy + z0 * cz;
  }
  return vol / 6;
}

/** Surface area of a triangle mesh. */
function surfaceArea(vertices: Float64Array, triangles: Uint32Array): number {
  let area = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t]! * 3;
    const i1 = triangles[t + 1]! * 3;
    const i2 = triangles[t + 2]! * 3;
    const ex = vertices[i1]! - vertices[i0]!;
    const ey = vertices[i1 + 1]! - vertices[i0 + 1]!;
    const ez = vertices[i1 + 2]! - vertices[i0 + 2]!;
    const fx = vertices[i2]! - vertices[i0]!;
    const fy = vertices[i2 + 1]! - vertices[i0 + 1]!;
    const fz = vertices[i2 + 2]! - vertices[i0 + 2]!;
    const cx = ey * fz - ez * fy;
    const cy = ez * fx - ex * fz;
    const cz = ex * fy - ey * fx;
    area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  return area;
}

/**
 * Build an undirected edge map (sorted vertex-index pair → count).
 * Every directed edge i→j contributes one entry to key min(i,j)_max(i,j).
 * For a watertight manifold every undirected edge should appear exactly twice.
 */
function edgeManifoldCheck(triangles: Uint32Array): {
  ok: boolean;
  badEdges: number;
  totalEdges: number;
} {
  const edgeCount = new Map<string, number>();
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!;
    const b = triangles[t + 1]!;
    const c = triangles[t + 2]!;
    const edges: [number, number][] = [
      [Math.min(a, b), Math.max(a, b)],
      [Math.min(b, c), Math.max(b, c)],
      [Math.min(a, c), Math.max(a, c)],
    ];
    for (const [u, v] of edges) {
      const key = `${u}_${v}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  let badEdges = 0;
  for (const count of edgeCount.values()) {
    if (count !== 2) badEdges++;
  }
  return { ok: badEdges === 0, badEdges, totalEdges: edgeCount.size };
}

// ── SDFNode factories ─────────────────────────────────────────────────────────

function sphereNode(radius: number): SDFNode {
  return { type: 'primitive', primitive: 'sphere', params: { radius } };
}

function boxNode(width: number, height: number, depth: number): SDFNode {
  return { type: 'primitive', primitive: 'box', params: { width, height, depth } };
}

function cylinderNode(height: number, radius: number): SDFNode {
  return { type: 'primitive', primitive: 'cylinder', params: { height, radius } };
}

function differenceNode(a: SDFNode, b: SDFNode): SDFNode {
  return { type: 'csg', operation: 'difference', children: [a, b] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MarchingCubes — sphere r=1 at 48³', () => {
  const RADIUS = 1;
  const RES = 48;
  const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };
  const ANALYTIC_VOLUME = (4 / 3) * Math.PI * RADIUS ** 3; // ≈ 4.189
  const ANALYTIC_AREA = 4 * Math.PI * RADIUS ** 2; // ≈ 12.566

  let vertices: Float64Array;
  let triangles: Uint32Array;

  // Compute once for the whole describe block.
  {
    const mesh = marchingCubes(sphereNode(RADIUS), {
      bounds: BOUNDS,
      resolution: [RES, RES, RES],
    });
    vertices = mesh.vertices;
    triangles = mesh.triangles;
  }

  it('produces a non-empty mesh', () => {
    expect(vertices.length).toBeGreaterThan(0);
    expect(triangles.length).toBeGreaterThan(0);
  });

  it('volume is within 2% of 4π/3', () => {
    const vol = signedVolume(vertices, triangles);
    const relErr = Math.abs(vol - ANALYTIC_VOLUME) / ANALYTIC_VOLUME;
    expect(relErr).toBeLessThan(0.02);
  });

  it('surface area is within 3% of 4π', () => {
    const area = surfaceArea(vertices, triangles);
    const relErr = Math.abs(area - ANALYTIC_AREA) / ANALYTIC_AREA;
    expect(relErr).toBeLessThan(0.03);
  });

  it('is watertight — every edge shared by exactly 2 triangles', () => {
    const { ok, badEdges } = edgeManifoldCheck(triangles);
    expect(badEdges).toBe(0);
    expect(ok).toBe(true);
  });

  it('has positive signed volume (outward-wound normals)', () => {
    const vol = signedVolume(vertices, triangles);
    expect(vol).toBeGreaterThan(0);
  });
});

describe('MarchingCubes — resolution convergence (sphere)', () => {
  const RADIUS = 1;
  const ANALYTIC_VOLUME = (4 / 3) * Math.PI * RADIUS ** 3;
  const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };

  it('volume error at 64³ is smaller than at 24³', () => {
    const coarse = marchingCubes(sphereNode(RADIUS), {
      bounds: BOUNDS,
      resolution: [24, 24, 24],
    });
    const fine = marchingCubes(sphereNode(RADIUS), {
      bounds: BOUNDS,
      resolution: [64, 64, 64],
    });

    const errCoarse = Math.abs(signedVolume(coarse.vertices, coarse.triangles) - ANALYTIC_VOLUME);
    const errFine = Math.abs(signedVolume(fine.vertices, fine.triangles) - ANALYTIC_VOLUME);

    expect(errFine).toBeLessThan(errCoarse);
  });
});

describe('MarchingCubes — CSG box minus cylinder', () => {
  // Box: half-extents 1×1×1, so full box size 2×2×2 → volume = 8
  // Cylinder through the box along Y-axis: height=1 (half-height), radius=0.5
  //   Full cylinder height capped by box = 2, cylinder volume = π r² h = π(0.25)(2) = π/2
  // Cylinder extends from y=-1 to y=+1 fully through the box.
  // Analytic: V_box − V_cyl = 8 − π * 0.5² * 2 = 8 − π/2 ≈ 6.429
  const BOX_HALF = 1;
  const CYL_HEIGHT = 1; // half-height param
  const CYL_RADIUS = 0.5;
  const BOX_VOL = (BOX_HALF * 2) ** 3; // 8
  const CYL_VOL = Math.PI * CYL_RADIUS ** 2 * (CYL_HEIGHT * 2); // π * 0.25 * 2 = π/2
  const ANALYTIC_VOLUME = BOX_VOL - CYL_VOL;

  const node = differenceNode(
    boxNode(BOX_HALF, BOX_HALF, BOX_HALF),
    cylinderNode(CYL_HEIGHT, CYL_RADIUS)
  );

  const RES = 48;
  const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };

  let vertices: Float64Array;
  let triangles: Uint32Array;

  {
    const mesh = marchingCubes(node, { bounds: BOUNDS, resolution: [RES, RES, RES] });
    vertices = mesh.vertices;
    triangles = mesh.triangles;
  }

  it('produces a non-empty mesh', () => {
    expect(vertices.length).toBeGreaterThan(0);
    expect(triangles.length).toBeGreaterThan(0);
  });

  it('is watertight', () => {
    const { ok } = edgeManifoldCheck(triangles);
    expect(ok).toBe(true);
  });

  it('volume within 3% of analytic (box − cylinder)', () => {
    const vol = Math.abs(signedVolume(vertices, triangles));
    const relErr = Math.abs(vol - ANALYTIC_VOLUME) / ANALYTIC_VOLUME;
    expect(relErr).toBeLessThan(0.03);
  });
});

describe('MarchingCubes — pre-sampled SDFDistanceField input', () => {
  it('accepts a pre-sampled SDFDistanceField and produces the same mesh', () => {
    const node = sphereNode(1);
    const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };
    const RES = [24, 24, 24] as const;

    const field = sampleSDFDistanceField(node, {
      min: BOUNDS.min,
      max: BOUNDS.max,
      resolution: RES,
    });

    const meshFromNode = marchingCubes(node, { bounds: BOUNDS, resolution: RES });
    const meshFromField = marchingCubes(field, { bounds: BOUNDS, resolution: RES });

    expect(meshFromField.vertices.length).toBe(meshFromNode.vertices.length);
    expect(meshFromField.triangles.length).toBe(meshFromNode.triangles.length);

    const volNode = signedVolume(meshFromNode.vertices, meshFromNode.triangles);
    const volField = signedVolume(meshFromField.vertices, meshFromField.triangles);
    expect(Math.abs(volNode - volField)).toBeLessThan(1e-6);
  });
});

describe('MarchingCubes — scaleFactor option', () => {
  it('scales vertex positions uniformly without affecting topology', () => {
    const RADIUS = 1;
    const SCALE = 2.5;
    const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };
    const RES = [24, 24, 24] as const;

    const unscaled = marchingCubes(sphereNode(RADIUS), { bounds: BOUNDS, resolution: RES });
    const scaled = marchingCubes(sphereNode(RADIUS), {
      bounds: BOUNDS,
      resolution: RES,
      scaleFactor: SCALE,
    });

    expect(scaled.triangles.length).toBe(unscaled.triangles.length);

    // Scaled volume should be SCALE³ × unscaled volume.
    const volU = signedVolume(unscaled.vertices, unscaled.triangles);
    const volS = signedVolume(scaled.vertices, scaled.triangles);
    const ratio = volS / volU;
    expect(Math.abs(ratio - SCALE ** 3)).toBeLessThan(0.01 * SCALE ** 3);
  });
});

describe('MarchingCubes tolerance estimate', () => {
  it('reports a conservative scaled sampling envelope', () => {
    const estimate = estimateMarchingCubesTolerance({
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      resolution: [5, 9, 17],
      scaleFactor: 2,
    });

    expect(estimate.cellSize).toEqual([1, 0.5, 0.25]);
    expect(estimate.maxCellSize).toBe(1);
    expect(estimate.cellDiagonal).toBeCloseTo(Math.hypot(1, 0.5, 0.25), 12);
    expect(estimate.conservativeSurfaceError).toBe(estimate.cellDiagonal);
    expect(estimate.units).toBe('same-as-bounds');
  });

  it('rejects invalid resolution the same way marchingCubes does', () => {
    expect(() => estimateMarchingCubesTolerance({ resolution: [1, 32, 32] })).toThrow();
  });
});

describe('Manufacturing backend decision', () => {
  const opts = {
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    resolution: [41, 41, 41],
  } as const;

  it('uses the sovereign SDF path when no mechanical tolerance is supplied', () => {
    const decision = decideManufacturingBackend(opts);

    expect(decision.backend).toBe('sovereign-sdf-marching-cubes');
    expect(decision.bridgeRequired).toBe(false);
    expect(decision.requestedTolerance).toBeNull();
    expect(decision.tolerance.conservativeSurfaceError).toBeCloseTo(
      Math.hypot(0.05, 0.05, 0.05),
      12
    );
  });

  it('keeps the sovereign SDF path when the conservative envelope is within tolerance', () => {
    const decision = decideManufacturingBackend({
      ...opts,
      requestedTolerance: 0.1,
    });

    expect(decision.backend).toBe('sovereign-sdf-marching-cubes');
    expect(decision.bridgeRequired).toBe(false);
    expect(decision.reason).toMatch(/no OpenSCAD-WASM bridge is required/i);
  });

  it('requires OpenSCAD-WASM when tolerance is tighter than the SDF envelope', () => {
    const decision = decideManufacturingBackend({
      ...opts,
      requestedTolerance: 0.01,
    });

    expect(decision.backend).toBe('openscad-wasm');
    expect(decision.bridgeRequired).toBe(true);
    expect(decision.reason).toMatch(/exact CAD backend/i);
  });

  it('rejects invalid requested tolerances', () => {
    expect(() => decideManufacturingBackend({ ...opts, requestedTolerance: 0 })).toThrow();
  });
});

describe('MarchingCubes — closeBoundary option', () => {
  it('closeBoundary=true produces a watertight mesh when the SDF extends to the bounds', () => {
    // Large sphere (radius 2) whose surface exits a 1.5-box grid.
    const node = sphereNode(2);
    const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };

    const closed = marchingCubes(node, {
      bounds: BOUNDS,
      resolution: [20, 20, 20],
      closeBoundary: true,
    });
    expect(closed.triangles.length).toBeGreaterThan(0);
    const { ok } = edgeManifoldCheck(closed.triangles);
    expect(ok).toBe(true);
  });

  it('closeBoundary=false does NOT throw, but mesh may be open when SDF exits bounds', () => {
    const node = sphereNode(2);
    const BOUNDS = { min: [-1.5, -1.5, -1.5] as const, max: [1.5, 1.5, 1.5] as const };

    // Just verify it runs without throwing; topology may be open.
    expect(() => {
      marchingCubes(node, { bounds: BOUNDS, resolution: [20, 20, 20], closeBoundary: false });
    }).not.toThrow();
  });
});

describe('MarchingCubes — edge cases', () => {
  it('throws when resolution is less than 2 on any axis', () => {
    expect(() => marchingCubes(sphereNode(1), { resolution: [1, 32, 32] })).toThrow();
  });

  it('returns empty mesh for an SDF entirely outside the bounds', () => {
    // Sphere at radius 0.1 fully inside the iso-level shell; sample only the outside.
    // A sphere of radius 0.1 is entirely inside a box of ±1.5; SDF is positive everywhere
    // on the boundary.  However at the interior the SDF is negative.  Actually we need
    // a shape that is ENTIRELY OUTSIDE (SDF > 0 everywhere in the box).
    // Use a sphere translated far outside the sampling region.
    const farSphere: SDFNode = {
      type: 'primitive',
      primitive: 'sphere',
      params: { radius: 0.1 },
      translate: [100, 100, 100],
    };
    const mesh = marchingCubes(farSphere, {
      bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
      resolution: [8, 8, 8],
      closeBoundary: false,
    });
    // All SDF values are positive → no zero crossing → no triangles.
    expect(mesh.triangles.length).toBe(0);
  });
});
