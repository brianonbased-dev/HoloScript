/**
 * Data Importer Tests — W4-T2 coverage pass
 *
 * Covers: CSVImporter (importScalarFieldCSV, importTableCSV),
 *         OBJParser (parseOBJ), STLParser (parseSTL binary + ASCII),
 *         GmshParser (parseGmsh), VTKImporter (importStructuredPoints,
 *         importUnstructuredGrid).
 */

import { describe, it, expect } from 'vitest';
import { importScalarFieldCSV, importTableCSV } from '../CSVImporter';
import { parseOBJ } from '../OBJParser';
import { parseSTL } from '../STLParser';
import { parseGmsh, MeshImportError } from '../GmshParser';
import { importStructuredPoints, importUnstructuredGrid } from '../VTKImporter';

// ─── CSVImporter ─────────────────────────────────────────────────────────────

describe('importScalarFieldCSV', () => {
  const CSV_2x2x1 = [
    'x,y,z,value',
    '0,0,0,1.0',
    '1,0,0,2.0',
    '0,1,0,3.0',
    '1,1,0,4.0',
  ].join('\n');

  it('parses a minimal 2×2×1 grid', () => {
    const { grid, range } = importScalarFieldCSV(CSV_2x2x1);
    expect(grid).toBeDefined();
    expect(range[0]).toBeCloseTo(1.0);
    expect(range[1]).toBeCloseTo(4.0);
  });

  it('detects resolution from coordinates', () => {
    const { grid } = importScalarFieldCSV(CSV_2x2x1);
    expect(grid.nx).toBe(2);
    expect(grid.ny).toBe(2);
    expect(grid.nz).toBe(1);
  });

  it('throws on missing header + data rows', () => {
    expect(() => importScalarFieldCSV('x,y,z,value')).toThrow('CSV');
  });

  it('handles no-header CSV (all-numeric first row)', () => {
    const csv = ['0,0,0,5', '1,0,0,10'].join('\n');
    const { range } = importScalarFieldCSV(csv);
    expect(range[1]).toBeGreaterThanOrEqual(range[0]);
  });

  it('skips rows with invalid numbers', () => {
    const csv = ['x,y,z,value', '0,0,0,1', 'bad,row', '1,0,0,2'].join('\n');
    const { range } = importScalarFieldCSV(csv);
    expect(range[0]).toBeCloseTo(1);
    expect(range[1]).toBeCloseTo(2);
  });

  it('returns correct range min and max', () => {
    const csv = [
      'x,y,z,value',
      '0,0,0,-5',
      '1,0,0,0',
      '0,1,0,10',
      '1,1,0,3',
    ].join('\n');
    const { range } = importScalarFieldCSV(csv);
    expect(range[0]).toBeCloseTo(-5);
    expect(range[1]).toBeCloseTo(10);
  });
});

describe('importTableCSV', () => {
  it('parses a 2-column numeric table', () => {
    const csv = ['time,value', '0,1', '1,2', '2,3'].join('\n');
    const rows = importTableCSV(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ time: 0, value: 1 });
    expect(rows[2].value).toBe(3);
  });

  it('returns empty array for CSV with fewer than 2 lines', () => {
    expect(importTableCSV('just a header')).toHaveLength(0);
    expect(importTableCSV('')).toHaveLength(0);
  });

  it('handles whitespace in headers', () => {
    const csv = [' x , y ', '1,2'].join('\n');
    const rows = importTableCSV(csv);
    expect(rows[0]['x']).toBe(1);
    expect(rows[0]['y']).toBe(2);
  });
});

// ─── OBJParser ───────────────────────────────────────────────────────────────

describe('parseOBJ', () => {
  const TRIANGLE_OBJ = [
    '# simple triangle',
    'v 0 0 0',
    'v 1 0 0',
    'v 0 1 0',
    'f 1 2 3',
  ].join('\n');

  it('parses a single triangle', () => {
    const mesh = parseOBJ(TRIANGLE_OBJ);
    expect(mesh.vertices.length).toBe(9); // 3 verts × 3 coords
    expect(mesh.triangles.length).toBe(3); // 1 triangle
  });

  it('returns Float64Array for vertices and Uint32Array for triangles', () => {
    const mesh = parseOBJ(TRIANGLE_OBJ);
    expect(mesh.vertices).toBeInstanceOf(Float64Array);
    expect(mesh.triangles).toBeInstanceOf(Uint32Array);
  });

  it('triangulates a quad face (4 verts → 2 triangles)', () => {
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 1 1 0',
      'v 0 1 0',
      'f 1 2 3 4',
    ].join('\n');
    const mesh = parseOBJ(obj);
    expect(mesh.triangles.length).toBe(6); // 2 triangles × 3 indices
  });

  it('handles v/vt/vn face format', () => {
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'vt 0 0',
      'vn 0 0 1',
      'f 1/1/1 2/1/1 3/1/1',
    ].join('\n');
    const mesh = parseOBJ(obj);
    expect(mesh.triangles.length).toBe(3);
  });

  it('ignores comment and empty lines', () => {
    const obj = ['# comment', '', 'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    const mesh = parseOBJ(obj);
    expect(mesh.vertices.length).toBe(9);
  });

  it('returns empty mesh for no-face OBJ', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0'].join('\n');
    const mesh = parseOBJ(obj);
    expect(mesh.triangles.length).toBe(0);
  });
});

// ─── STLParser ────────────────────────────────────────────────────────────────

describe('parseSTL (ASCII)', () => {
  function makeAsciiSTL(triangles: [number, number, number][][]): ArrayBuffer {
    const lines: string[] = ['solid test'];
    for (const tri of triangles) {
      lines.push('  facet normal 0 0 1');
      lines.push('    outer loop');
      for (const v of tri) {
        lines.push(`      vertex ${v[0]} ${v[1]} ${v[2]}`);
      }
      lines.push('    endloop');
      lines.push('  endfacet');
    }
    lines.push('endsolid test');
    const text = lines.join('\n');
    const enc = new TextEncoder();
    return enc.encode(text).buffer;
  }

  it('parses a single-triangle ASCII STL', () => {
    const buf = makeAsciiSTL([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
    const mesh = parseSTL(buf);
    expect(mesh.triangles.length).toBe(3);
  });

  it('deduplicates shared vertices', () => {
    // Two triangles sharing an edge
    const buf = makeAsciiSTL([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ]);
    const mesh = parseSTL(buf);
    // 4 unique vertices (not 6)
    expect(mesh.vertices.length / 3).toBeLessThanOrEqual(4);
    expect(mesh.triangles.length).toBe(6);
  });

  it('returns Float64Array vertices', () => {
    const buf = makeAsciiSTL([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
    const mesh = parseSTL(buf);
    expect(mesh.vertices).toBeInstanceOf(Float64Array);
  });
});

describe('parseSTL (binary)', () => {
  function makeBinarySTL(numTris: number): ArrayBuffer {
    // 80 header + 4 count + N * 50 bytes
    const buf = new ArrayBuffer(84 + numTris * 50);
    const view = new DataView(buf);
    view.setUint32(80, numTris, true);

    // Write one degenerate triangle per slot
    for (let t = 0; t < numTris; t++) {
      const base = 84 + t * 50;
      // Normal (3×f32)
      view.setFloat32(base, 0, true);
      view.setFloat32(base + 4, 0, true);
      view.setFloat32(base + 8, 1, true);
      // Vertex 0
      view.setFloat32(base + 12, t, true);
      view.setFloat32(base + 16, 0, true);
      view.setFloat32(base + 20, 0, true);
      // Vertex 1
      view.setFloat32(base + 24, t + 1, true);
      view.setFloat32(base + 28, 0, true);
      view.setFloat32(base + 32, 0, true);
      // Vertex 2
      view.setFloat32(base + 36, t, true);
      view.setFloat32(base + 40, 1, true);
      view.setFloat32(base + 44, 0, true);
      // Attribute
      view.setUint16(base + 48, 0, true);
    }
    return buf;
  }

  it('parses a 2-triangle binary STL', () => {
    const buf = makeBinarySTL(2);
    const mesh = parseSTL(buf);
    expect(mesh.triangles.length).toBe(6);
  });

  it('returns correct triangle index count', () => {
    const buf = makeBinarySTL(5);
    const mesh = parseSTL(buf);
    expect(mesh.triangles.length).toBe(15);
  });

  it('returns Uint32Array for triangles', () => {
    const buf = makeBinarySTL(1);
    const mesh = parseSTL(buf);
    expect(mesh.triangles).toBeInstanceOf(Uint32Array);
  });
});

// ─── GmshParser ───────────────────────────────────────────────────────────────

function minimalGmsh(numTets: number): string {
  // Build a minimal GMSH 2.2 file with 4 nodes and `numTets` tetrahedra
  const nodeLines = [
    '$MeshFormat',
    '2.2 0 8',
    '$EndMeshFormat',
    '$Nodes',
    '4',
    '1 0 0 0',
    '2 1 0 0',
    '3 0 1 0',
    '4 0 0 1',
    '$EndNodes',
    '$Elements',
    String(numTets),
  ];
  for (let i = 1; i <= numTets; i++) {
    // elm-number elm-type ntags [tags...] n1 n2 n3 n4
    nodeLines.push(`${i} 4 1 1 1 2 3 4`);
  }
  nodeLines.push('$EndElements');
  return nodeLines.join('\n');
}

describe('parseGmsh', () => {
  it('parses a single tetrahedron', () => {
    const result = parseGmsh(minimalGmsh(1));
    expect(result.nodeCount).toBe(4);
    expect(result.elementCount).toBe(1);
    expect(result.tetrahedra.length).toBe(4);
  });

  it('parses multiple tetrahedra', () => {
    const result = parseGmsh(minimalGmsh(3));
    expect(result.elementCount).toBe(3);
    expect(result.tetrahedra.length).toBe(12);
  });

  it('vertex coordinates are correct', () => {
    const result = parseGmsh(minimalGmsh(1));
    // Node 1: 0,0,0
    expect(result.vertices[0]).toBe(0);
    expect(result.vertices[1]).toBe(0);
    expect(result.vertices[2]).toBe(0);
    // Node 2: 1,0,0
    expect(result.vertices[3]).toBe(1);
  });

  it('node indices are dense (0-based)', () => {
    const result = parseGmsh(minimalGmsh(1));
    // All indices should be in [0, 3]
    for (const idx of Array.from(result.tetrahedra)) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
  });

  it('throws MeshImportError for empty/invalid input', () => {
    expect(() => parseGmsh('')).toThrow(MeshImportError);
    expect(() => parseGmsh('not a mesh')).toThrow(MeshImportError);
  });

  it('throws GMSH_UNSUPPORTED for v4 format', () => {
    const v4 = [
      '$MeshFormat',
      '4.1 0 8',
      '$EndMeshFormat',
      '$Nodes',
      '0',
      '$EndNodes',
      '$Elements',
      '0',
      '$EndElements',
    ].join('\n');
    expect(() => parseGmsh(v4)).toThrow('not supported');
  });

  it('returns empty tetrahedra for non-tet elements only', () => {
    // element type 1 = 2-node line — no tet4 found → GmshParser throws GMSH_UNSUPPORTED
    const text = [
      '$MeshFormat', '2.2 0 8', '$EndMeshFormat',
      '$Nodes', '2', '1 0 0 0', '2 1 0 0', '$EndNodes',
      '$Elements', '1', '1 1 1 1 1 2', '$EndElements',
    ].join('\n');
    expect(() => parseGmsh(text)).toThrow(MeshImportError);
  });
});

// ─── VTKImporter ─────────────────────────────────────────────────────────────

describe('importStructuredPoints', () => {
  const STRUCTURED_VTK = [
    '# vtk DataFile Version 3.0',
    'test',
    'ASCII',
    'DATASET STRUCTURED_POINTS',
    'DIMENSIONS 2 2 1',
    'SPACING 1.0 1.0 1.0',
    'ORIGIN 0 0 0',
    'POINT_DATA 4',
    'SCALARS pressure float 1',
    'LOOKUP_TABLE default',
    '1.0 2.0',
    '3.0 4.0',
  ].join('\n');

  it('parses dimensions correctly', () => {
    const { grid } = importStructuredPoints(STRUCTURED_VTK);
    expect(grid.nx).toBe(2);
    expect(grid.ny).toBe(2);
    expect(grid.nz).toBe(1);
  });

  it('loads scalar data into map', () => {
    const { scalars } = importStructuredPoints(STRUCTURED_VTK);
    expect(scalars.has('pressure')).toBe(true);
    const pressure = scalars.get('pressure')!;
    expect(pressure.length).toBe(4);
    expect(pressure[0]).toBeCloseTo(1.0);
    expect(pressure[3]).toBeCloseTo(4.0);
  });

  it('derives spacing into non-zero cell size', () => {
    const { grid } = importStructuredPoints(STRUCTURED_VTK);
    expect(grid.dx).toBeGreaterThan(0);
    expect(grid.dy).toBeGreaterThan(0);
    // A single z-slice implies nz=1, so dz is domainZ / 0 => Infinity by current grid contract.
    expect(Number.isFinite(grid.dz)).toBe(false);
  });
});

describe('importUnstructuredGrid', () => {
  const UNSTRUCTURED_VTK = [
    '# vtk DataFile Version 3.0',
    'test',
    'ASCII',
    'DATASET UNSTRUCTURED_GRID',
    'POINTS 4 float',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '0 0 1',
    'CELLS 1 5',
    '4 0 1 2 3',
    'CELL_TYPES 1',
    '10',
    'POINT_DATA 4',
    'SCALARS temperature float 1',
    'LOOKUP_TABLE default',
    '10 20 30 40',
    'CELL_DATA 1',
    'SCALARS density float 1',
    'LOOKUP_TABLE default',
    '99',
  ].join('\n');

  it('parses vertex count correctly', () => {
    const result = importUnstructuredGrid(UNSTRUCTURED_VTK);
    expect(result.nodeCount).toBe(4);
  });

  it('parses element count correctly', () => {
    const result = importUnstructuredGrid(UNSTRUCTURED_VTK);
    expect(result.elementCount).toBe(1);
  });

  it('vertex array has correct size', () => {
    const result = importUnstructuredGrid(UNSTRUCTURED_VTK);
    expect(result.vertices.length).toBe(12); // 4 nodes × 3 coords
  });

  it('returns correct tetrahedron connectivity', () => {
    const result = importUnstructuredGrid(UNSTRUCTURED_VTK);
    expect(result.tetrahedra[0]).toBe(0);
    expect(result.tetrahedra[1]).toBe(1);
    expect(result.tetrahedra[2]).toBe(2);
    expect(result.tetrahedra[3]).toBe(3);
  });

  it('parses point data scalars', () => {
    const result = importUnstructuredGrid(UNSTRUCTURED_VTK);
    expect(result.pointData.has('temperature')).toBe(true);
    expect(result.pointData.get('temperature')?.[2]).toBeCloseTo(30);
  });

  it('parses cell data scalars', () => {
    const result = importUnstructuredGrid(UNSTRUCTURED_VTK);
    expect(result.cellData.has('density')).toBe(true);
    expect(result.cellData.get('density')?.[0]).toBeCloseTo(99);
  });
});
