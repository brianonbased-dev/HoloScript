/**
 * Phase 12: Universal Data Import tests — STL, OBJ, CSV, VTK, GMSH parsers.
 */

import { describe, it, expect } from 'vitest';
import { parseSTL, buildSTL } from '../import/STLParser';
import { parseOBJ } from '../import/OBJParser';
import { importScalarFieldCSV, importTableCSV } from '../import/CSVImporter';
import { importStructuredPoints, importUnstructuredGrid } from '../import/VTKImporter';
import { parseGmsh, MeshImportError } from '../import/GmshParser';
import { exportScalarFieldCSV } from '../export/index';

// ═══════════════════════════════════════════════════════════════════════
// STL Parser
// ═══════════════════════════════════════════════════════════════════════

describe('STL Parser', () => {
  it('parses binary STL (single triangle)', () => {
    const stl = buildSTL([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
    ]);
    const mesh = parseSTL(stl);
    expect(mesh.triangles.length / 3).toBe(1);
    expect(mesh.vertices.length / 3).toBe(3);
  });

  it('parses binary STL (cube = 12 triangles)', () => {
    // Build a cube from 12 triangles (2 per face)
    const tris: [number, number, number][][] = [
      [[0,0,0],[1,0,0],[1,1,0]], [[0,0,0],[1,1,0],[0,1,0]], // -z
      [[0,0,1],[1,1,1],[1,0,1]], [[0,0,1],[0,1,1],[1,1,1]], // +z
      [[0,0,0],[0,1,0],[0,1,1]], [[0,0,0],[0,1,1],[0,0,1]], // -x
      [[1,0,0],[1,1,1],[1,1,0]], [[1,0,0],[1,0,1],[1,1,1]], // +x
      [[0,0,0],[1,0,1],[1,0,0]], [[0,0,0],[0,0,1],[1,0,1]], // -y
      [[0,1,0],[1,1,0],[1,1,1]], [[0,1,0],[1,1,1],[0,1,1]], // +y
    ];
    const stl = buildSTL(tris);
    const mesh = parseSTL(stl);

    expect(mesh.triangles.length / 3).toBe(12);
    // Cube has 8 unique vertices
    expect(mesh.vertices.length / 3).toBe(8);
  });

  it('deduplicates shared vertices', () => {
    // Two triangles sharing an edge (3 shared vertices → 4 unique)
    const stl = buildSTL([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ]);
    const mesh = parseSTL(stl);
    expect(mesh.triangles.length / 3).toBe(2);
    expect(mesh.vertices.length / 3).toBe(4); // not 6
  });
});

// ═══════════════════════════════════════════════════════════════════════
// OBJ Parser
// ═══════════════════════════════════════════════════════════════════════

describe('OBJ Parser', () => {
  it('parses simple triangle', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`;
    const mesh = parseOBJ(obj);
    expect(mesh.vertices.length / 3).toBe(3);
    expect(mesh.triangles.length / 3).toBe(1);
    // OBJ is 1-indexed, parser converts to 0-indexed
    expect(mesh.triangles[0]).toBe(0);
    expect(mesh.triangles[1]).toBe(1);
    expect(mesh.triangles[2]).toBe(2);
  });

  it('auto-triangulates quads', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`;
    const mesh = parseOBJ(obj);
    expect(mesh.triangles.length / 3).toBe(2); // quad → 2 triangles
  });

  it('handles v/vt/vn face format', () => {
    const obj = `
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
vt 0 0
f 1/1/1 2/1/1 3/1/1
`;
    const mesh = parseOBJ(obj);
    expect(mesh.triangles.length / 3).toBe(1);
  });

  it('ignores comments and empty lines', () => {
    const obj = `
# comment
v 0 0 0

v 1 0 0
# another comment
v 0 1 0
f 1 2 3
`;
    const mesh = parseOBJ(obj);
    expect(mesh.vertices.length / 3).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CSV Importer
// ═══════════════════════════════════════════════════════════════════════

describe('CSV Importer', () => {
  it('roundtrips with CSVExporter scalar field', () => {
    // Build a known field: value = x + y + z
    const nx = 4, ny = 3, nz = 2;
    const dx = 0.5, dy = 0.5, dz = 0.5;
    const data = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          data[(k * ny + j) * nx + i] = i * dx + j * dy + k * dz;
        }
      }
    }

    const csv = exportScalarFieldCSV(nx, ny, nz, dx, dy, dz, data);
    const result = importScalarFieldCSV(csv);

    expect(result.grid.nx).toBe(nx);
    expect(result.grid.ny).toBe(ny);
    expect(result.grid.nz).toBe(nz);

    // Verify values match
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const expected = i * dx + j * dy + k * dz;
          expect(result.grid.get(i, j, k)).toBeCloseTo(expected, 3);
        }
      }
    }
  });

  it('importTableCSV parses named columns', () => {
    const csv = 'E,stress,safety\n100,50,2.0\n200,25,4.0\n300,16.7,6.0';
    const rows = importTableCSV(csv);
    expect(rows.length).toBe(3);
    expect(rows[0].E).toBe(100);
    expect(rows[1].stress).toBe(25);
    expect(rows[2].safety).toBe(6.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// VTK Importer
// ═══════════════════════════════════════════════════════════════════════

describe('VTK Importer', () => {
  it('importStructuredPoints parses VTK structured grid', () => {
    const vtk = `# vtk DataFile Version 3.0
Test
ASCII
DATASET STRUCTURED_POINTS
DIMENSIONS 3 3 3
SPACING 0.5 0.5 0.5
ORIGIN 0 0 0
POINT_DATA 27
SCALARS temperature float 1
LOOKUP_TABLE default
0 1 2 3 4 5 6 7 8
9 10 11 12 13 14 15 16 17
18 19 20 21 22 23 24 25 26
`;

    const result = importStructuredPoints(vtk);
    expect(result.grid.nx).toBe(3);
    expect(result.grid.ny).toBe(3);
    expect(result.grid.nz).toBe(3);
    expect(result.scalars.has('temperature')).toBe(true);
    expect(result.scalars.get('temperature')![0]).toBe(0);
    expect(result.scalars.get('temperature')![26]).toBe(26);
  });

  it('importUnstructuredGrid parses VTK tet mesh', () => {
    const vtk = `# vtk DataFile Version 3.0
Test
ASCII
DATASET UNSTRUCTURED_GRID
POINTS 4 float
0.000000 0.000000 0.000000
1.000000 0.000000 0.000000
0.000000 1.000000 0.000000
0.000000 0.000000 1.000000
CELLS 1 5
4 0 1 2 3
CELL_TYPES 1
10
CELL_DATA 1
SCALARS stress float 1
LOOKUP_TABLE default
1000.0
`;

    const result = importUnstructuredGrid(vtk);
    expect(result.nodeCount).toBe(4);
    expect(result.elementCount).toBe(1);
    expect(result.tetrahedra[0]).toBe(0);
    expect(result.tetrahedra[3]).toBe(3);
    expect(result.cellData.has('stress')).toBe(true);
    expect(result.cellData.get('stress')![0]).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GMSH 2.x ASCII (.msh)
// ═══════════════════════════════════════════════════════════════════════

const MINIMAL_TET_MSH = `$MeshFormat
2.2 0 8
$EndMeshFormat
$Nodes
4
1 0 0 0
2 1 0 0
3 0 1 0
4 0 0 1
$EndNodes
$Elements
1
1 4 2 1 1 1 2 3 4
$EndElements
`;

describe('GMSH Parser', () => {
  it('parses v2.2 ASCII with one linear tet', () => {
    const r = parseGmsh(MINIMAL_TET_MSH);
    expect(r.nodeCount).toBe(4);
    expect(r.elementCount).toBe(1);
    expect(r.vertices.length).toBe(12);
    expect(r.tetrahedra.length).toBe(4);
    expect(r.tetrahedra[0]).toBe(0);
    expect(r.tetrahedra[1]).toBe(1);
    expect(r.tetrahedra[2]).toBe(2);
    expect(r.tetrahedra[3]).toBe(3);
  });

  it('rejects garbage', () => {
    expect(() => parseGmsh('hello')).toThrow(MeshImportError);
  });

  it('rejects GMSH 4 format version', () => {
    const v4 = `$MeshFormat
4.1 0 8
$EndMeshFormat
`;
    expect(() => parseGmsh(v4)).toThrow(MeshImportError);
  });
});
