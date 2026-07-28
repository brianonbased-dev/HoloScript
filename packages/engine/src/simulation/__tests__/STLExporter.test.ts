/**
 * STLExporter Tests — physics/geometry validated against analytic values.
 *
 * Round-trip through the existing parseSTL (STLParser.ts) to confirm the
 * exported bytes are spec-conformant, not just structurally present.
 *
 * Analytic reference:
 *   Unit cube [0,1]^3 decomposed into 12 triangles (6 faces × 2 triangles).
 *   - Vertex count after deduplication: 8 (cube corners).
 *   - Triangle count: 12.
 *   - AABB min = (0,0,0), AABB max = (1,1,1).
 *   - +Z face normals (both triangles): (0, 0, 1) exactly.
 *
 *   f32 round-trip tolerance: 1e-6 (float32 precision ~7 significant digits,
 *   max absolute error on values in [0,1] ≈ 6e-8; using 1e-6 gives headroom).
 */

import { describe, it, expect } from 'vitest';
import { exportSTLBinary, exportSTLAscii } from '../export/STLExporter';
import { parseSTL } from '../import/STLParser';
import type { SurfaceMesh } from '../AutoMesher';

// ── Unit cube mesh (hand-built, analytic reference) ───────────────────────────
//
// 8 vertices, 12 triangles (2 per face × 6 faces).
// Winding: right-hand rule so normals point outward.
//
// Vertex index layout:
//   0: (0,0,0)  1: (1,0,0)  2: (1,1,0)  3: (0,1,0)  — bottom face z=0
//   4: (0,0,1)  5: (1,0,1)  6: (1,1,1)  7: (0,1,1)  — top face    z=1

const CUBE_VERTICES = new Float64Array([
  0,
  0,
  0, // 0
  1,
  0,
  0, // 1
  1,
  1,
  0, // 2
  0,
  1,
  0, // 3
  0,
  0,
  1, // 4
  1,
  0,
  1, // 5
  1,
  1,
  1, // 6
  0,
  1,
  1, // 7
]);

// Outward-facing winding per face:
//   -Z (bottom): normal (0,0,-1)
//   +Z (top):    normal (0,0, 1) — triangles 10 & 11 in this list
//   -X:          normal (-1,0,0)
//   +X:          normal ( 1,0,0)
//   -Y:          normal (0,-1,0)
//   +Y:          normal (0, 1,0)
const CUBE_TRIANGLES = new Uint32Array([
  // -Z face (z=0), normal (0,0,-1): CW when viewed from -Z → CCW from inside
  0, 3, 2, 0, 2, 1,
  // +Z face (z=1), normal (0,0,+1): triangles at indices 2 and 3 (tri 2 = verts 4,5,6; tri 3 = 4,6,7)
  4,
  5, 6, 4, 6, 7,
  // -X face (x=0), normal (-1,0,0)
  0, 4, 7, 0, 7, 3,
  // +X face (x=1), normal (+1,0,0)
  1, 2, 6, 1, 6, 5,
  // -Y face (y=0), normal (0,-1,0)
  0, 1, 5, 0, 5, 4,
  // +Y face (y=1), normal (0,+1,0)
  2, 3, 7, 2, 7, 6,
]);

const CUBE_MESH: SurfaceMesh = {
  vertices: CUBE_VERTICES,
  triangles: CUBE_TRIANGLES,
};

// ── Helper: compute AABB from a parsed mesh ───────────────────────────────────

function meshAABB(mesh: SurfaceMesh): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const v = mesh.vertices;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    minX = Math.min(minX, v[i]);
    maxX = Math.max(maxX, v[i]);
    minY = Math.min(minY, v[i + 1]);
    maxY = Math.max(maxY, v[i + 1]);
    minZ = Math.min(minZ, v[i + 2]);
    maxZ = Math.max(maxZ, v[i + 2]);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// ── Helper: max per-vertex position deviation after round-trip ────────────────
//
// parseSTL deduplicates vertices, so vertex order differs from the export.
// We compare unique positions: for each unique vertex in the original, find the
// closest match in the reimport and record the distance.

function maxVertexDeviation(original: SurfaceMesh, reimport: SurfaceMesh): number {
  // Collect unique original vertices
  const origMap = new Map<string, [number, number, number]>();
  for (let i = 0; i < original.vertices.length / 3; i++) {
    const x = original.vertices[i * 3];
    const y = original.vertices[i * 3 + 1];
    const z = original.vertices[i * 3 + 2];
    origMap.set(`${x},${y},${z}`, [x, y, z]);
  }

  // Build reimport vertex set
  const reimportVerts: [number, number, number][] = [];
  for (let i = 0; i < reimport.vertices.length / 3; i++) {
    reimportVerts.push([
      reimport.vertices[i * 3],
      reimport.vertices[i * 3 + 1],
      reimport.vertices[i * 3 + 2],
    ]);
  }

  let maxDev = 0;
  for (const [ox, oy, oz] of origMap.values()) {
    let minDist = Infinity;
    for (const [rx, ry, rz] of reimportVerts) {
      const d = Math.sqrt((ox - rx) ** 2 + (oy - ry) ** 2 + (oz - rz) ** 2);
      if (d < minDist) minDist = d;
    }
    maxDev = Math.max(maxDev, minDist);
  }
  return maxDev;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('STLExporter — binary round-trip through parseSTL', () => {
  it('exports unit cube binary → parseSTL reimport gives 12 triangles', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const reimport = parseSTL(buf);
    expect(reimport.triangles.length / 3).toBe(12);
  });

  it('exports unit cube binary → reimport has 8 unique vertices after dedup', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const reimport = parseSTL(buf);
    const uniqueCount = reimport.vertices.length / 3;
    expect(uniqueCount).toBe(8);
  });

  it('exports unit cube binary → max vertex position deviation < 1e-6 (f32 round-trip)', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const reimport = parseSTL(buf);
    const dev = maxVertexDeviation(CUBE_MESH, reimport);
    expect(dev).toBeLessThan(1e-6);
  });
});

describe('STLExporter — ASCII round-trip through parseSTL', () => {
  it('exports unit cube ASCII → parseSTL reimport gives 12 triangles', () => {
    const stlString = exportSTLAscii(CUBE_MESH);
    const buf = new TextEncoder().encode(stlString).buffer;
    const reimport = parseSTL(buf);
    expect(reimport.triangles.length / 3).toBe(12);
  });

  it('exports unit cube ASCII → reimport has 8 unique vertices after dedup', () => {
    const stlString = exportSTLAscii(CUBE_MESH);
    const buf = new TextEncoder().encode(stlString).buffer;
    const reimport = parseSTL(buf);
    const uniqueCount = reimport.vertices.length / 3;
    expect(uniqueCount).toBe(8);
  });

  it('exports unit cube ASCII → max vertex position deviation < 1e-6', () => {
    const stlString = exportSTLAscii(CUBE_MESH);
    const buf = new TextEncoder().encode(stlString).buffer;
    const reimport = parseSTL(buf);
    const dev = maxVertexDeviation(CUBE_MESH, reimport);
    expect(dev).toBeLessThan(1e-6);
  });
});

describe('STLExporter — normal computation correctness', () => {
  it('+Z face triangles in binary export have normal (0,0,1) within 1e-6', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const view = new DataView(buf);

    // +Z face = triangles at index 2 (tri 4,5,6) and index 3 (tri 4,6,7)
    // in CUBE_TRIANGLES above.
    const zTriIndices = [2, 3];

    for (const triIdx of zTriIndices) {
      const base = 84 + triIdx * 50;
      const nx = view.getFloat32(base, true);
      const ny = view.getFloat32(base + 4, true);
      const nz = view.getFloat32(base + 8, true);

      expect(Math.abs(nx - 0)).toBeLessThan(1e-6);
      expect(Math.abs(ny - 0)).toBeLessThan(1e-6);
      expect(Math.abs(nz - 1)).toBeLessThan(1e-6);
    }
  });

  it('all written normals are unit length within 1e-5 (binary)', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const view = new DataView(buf);
    const triCount = view.getUint32(80, true);

    for (let t = 0; t < triCount; t++) {
      const base = 84 + t * 50;
      const nx = view.getFloat32(base, true);
      const ny = view.getFloat32(base + 4, true);
      const nz = view.getFloat32(base + 8, true);
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      // All cube triangles are non-degenerate; expect unit normals
      expect(Math.abs(len - 1)).toBeLessThan(1e-5);
    }
  });
});

describe('STLExporter — scale option', () => {
  it('binary scale=10 → reimported AABB is 10× the original', () => {
    const bufOrig = exportSTLBinary(CUBE_MESH);
    const bufScale = exportSTLBinary(CUBE_MESH, { scale: 10 });

    const origAABB = meshAABB(parseSTL(bufOrig));
    const scaleAABB = meshAABB(parseSTL(bufScale));

    // Original cube spans [0,1] on each axis; scaled should span [0,10]
    for (let axis = 0; axis < 3; axis++) {
      expect(scaleAABB.max[axis]).toBeCloseTo(origAABB.max[axis] * 10, 4);
      expect(scaleAABB.min[axis]).toBeCloseTo(origAABB.min[axis] * 10, 4);
    }
  });

  it('ASCII scale=10 → reimported AABB is 10× the original', () => {
    const asciiOrig = exportSTLAscii(CUBE_MESH);
    const asciiScale = exportSTLAscii(CUBE_MESH, { scale: 10 });

    const toBuffer = (s: string) => new TextEncoder().encode(s).buffer;

    const origAABB = meshAABB(parseSTL(toBuffer(asciiOrig)));
    const scaleAABB = meshAABB(parseSTL(toBuffer(asciiScale)));

    for (let axis = 0; axis < 3; axis++) {
      expect(scaleAABB.max[axis]).toBeCloseTo(origAABB.max[axis] * 10, 4);
      expect(scaleAABB.min[axis]).toBeCloseTo(origAABB.min[axis] * 10, 4);
    }
  });
});

describe('STLExporter — degenerate triangle handling', () => {
  it('degenerate triangle exports without NaN in binary buffer', () => {
    // Three identical vertices → zero area → zero normal (not NaN)
    const degMesh: SurfaceMesh = {
      vertices: new Float64Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      triangles: new Uint32Array([0, 1, 2]),
    };

    const buf = exportSTLBinary(degMesh);
    // The 50-byte triangle record starts at offset 84 and contains 12 float32s
    // (3 normal + 9 vertex coords) followed by a uint16 attribute — 48 bytes of f32.
    // We check those 12 floats via DataView to avoid alignment issues.
    const view = new DataView(buf);
    for (let i = 0; i < 12; i++) {
      const val = view.getFloat32(84 + i * 4, true);
      expect(Number.isNaN(val)).toBe(false);
    }
  });

  it('degenerate triangle binary normal is (0,0,0)', () => {
    const degMesh: SurfaceMesh = {
      vertices: new Float64Array([1, 2, 3, 1, 2, 3, 1, 2, 3]),
      triangles: new Uint32Array([0, 1, 2]),
    };

    const buf = exportSTLBinary(degMesh);
    const view = new DataView(buf);

    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(84 + 4, true);
    const nz = view.getFloat32(84 + 8, true);

    expect(nx).toBe(0);
    expect(ny).toBe(0);
    expect(nz).toBe(0);
  });

  it('degenerate triangle ASCII normal is 0.000000 0.000000 0.000000', () => {
    const degMesh: SurfaceMesh = {
      vertices: new Float64Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      triangles: new Uint32Array([0, 1, 2]),
    };

    const stl = exportSTLAscii(degMesh);
    expect(stl).toContain('facet normal 0.000000 0.000000 0.000000');
    expect(stl).not.toMatch(/NaN/i);
  });
});

describe('STLExporter — input validation', () => {
  it('throws on out-of-range triangle index', () => {
    const bad: SurfaceMesh = {
      vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triangles: new Uint32Array([0, 1, 99]), // index 99 out of range (only 3 verts)
    };
    expect(() => exportSTLBinary(bad)).toThrow(/out of range/);
    expect(() => exportSTLAscii(bad)).toThrow(/out of range/);
  });

  it('throws on non-finite vertex coordinate', () => {
    const bad: SurfaceMesh = {
      vertices: new Float64Array([0, 0, NaN, 1, 0, 0, 0, 1, 0]),
      triangles: new Uint32Array([0, 1, 2]),
    };
    expect(() => exportSTLBinary(bad)).toThrow(/non-finite/);
    expect(() => exportSTLAscii(bad)).toThrow(/non-finite/);
  });

  it('throws on triangles array length not a multiple of 3', () => {
    const bad: SurfaceMesh = {
      vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triangles: new Uint32Array([0, 1]),
    };
    expect(() => exportSTLBinary(bad)).toThrow(/multiple of 3/);
  });
});

describe('STLExporter — binary format structure', () => {
  it('binary buffer length = 84 + triCount * 50', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const expected = 84 + 12 * 50;
    expect(buf.byteLength).toBe(expected);
  });

  it('triangle count field at offset 80 equals mesh triangle count', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const view = new DataView(buf);
    expect(view.getUint32(80, true)).toBe(12);
  });

  it('attribute byte count is 0 for every triangle', () => {
    const buf = exportSTLBinary(CUBE_MESH);
    const view = new DataView(buf);
    for (let t = 0; t < 12; t++) {
      const attrOffset = 84 + t * 50 + 48;
      expect(view.getUint16(attrOffset, true)).toBe(0);
    }
  });
});

describe('STLExporter — ASCII format structure', () => {
  it('starts with "solid" and ends with "endsolid"', () => {
    const stl = exportSTLAscii(CUBE_MESH, { name: 'test_part' });
    expect(stl.startsWith('solid test_part\n')).toBe(true);
    expect(stl.trimEnd().endsWith('endsolid test_part')).toBe(true);
  });

  it('contains exactly 12 "facet normal" lines', () => {
    const stl = exportSTLAscii(CUBE_MESH);
    const count = (stl.match(/facet normal/g) ?? []).length;
    expect(count).toBe(12);
  });

  it('precision option controls decimal places', () => {
    const stl = exportSTLAscii(CUBE_MESH, { precision: 3 });
    // All vertex lines should use 3 decimal places
    const vertexLines = stl.split('\n').filter((l) => l.trim().startsWith('vertex'));
    for (const line of vertexLines) {
      // Match numbers like "0.000" or "1.000" — exactly 3 decimal places
      const nums = line.trim().replace('vertex', '').trim().split(/\s+/);
      for (const n of nums) {
        const parts = n.split('.');
        expect(parts.length).toBe(2);
        expect(parts[1].length).toBe(3);
      }
    }
  });
});
