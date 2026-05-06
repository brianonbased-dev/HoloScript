/**
 * MeshImporter Pipeline Tests — STL / GMSH → TetMesh → Solver
 *
 * Verifies that imported meshes actually feed into StructuralSolverTET10
 * without crashing, closing the gap between file parsers and simulation.
 */

import { describe, it, expect } from 'vitest';
import {
  importMesh,
  importMeshSync,
  detectFormat,
  MeshImportError,
} from '../MeshImporter';
import { buildSTL } from '../STLParser';
import { StructuralSolver } from '../../StructuralSolver';
import type { TetMesh } from '../../AutoMesher';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGmshText(): string {
  return [
    '$MeshFormat',
    '2.2 0 8',
    '$EndMeshFormat',
    '$Nodes',
    '8',
    '1 0 0 0',
    '2 1 0 0',
    '3 1 1 0',
    '4 0 1 0',
    '5 0 0 1',
    '6 1 0 1',
    '7 1 1 1',
    '8 0 1 1',
    '$EndNodes',
    '$Elements',
    '6',
    '1 4 1 1 1 2 4 5',
    '2 4 1 1 2 3 4 7',
    '3 4 1 1 2 5 6 7',
    '4 4 1 1 4 5 7 8',
    '5 4 1 1 2 4 5 7',
    '6 4 1 1 4 5 6 7',
    '$EndElements',
  ].join('\n');
}

function makeOBJText(): string {
  return [
    'v 0 0 0',
    'v 1 0 0',
    'v 0 1 0',
    'f 1 2 3',
  ].join('\n');
}

function solverFromTetMesh(tetMesh: TetMesh): StructuralSolver {
  return new StructuralSolver({
    vertices: tetMesh.vertices,
    tetrahedra: tetMesh.tetrahedra,
    material: 'steel_a36',
    constraints: [],
    loads: [],
    maxIterations: 10,
    tolerance: 1e-6,
  });
}

// ─── detectFormat ────────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('detects .stl by extension', () => {
    expect(detectFormat('model.stl')).toBe('stl');
    expect(detectFormat('MODEL.STL')).toBe('stl');
  });

  it('detects .obj by extension', () => {
    expect(detectFormat('model.obj')).toBe('obj');
  });

  it('detects .msh by extension', () => {
    expect(detectFormat('model.msh')).toBe('msh');
  });

  it('detects .vtk by extension', () => {
    expect(detectFormat('model.vtk')).toBe('vtk');
  });

  it('detects STL from ArrayBuffer header', () => {
    const buf = buildSTL([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
    expect(detectFormat(buf)).toBe('stl');
  });

  it('detects GMSH from string content', () => {
    expect(detectFormat(makeGmshText())).toBe('msh');
  });

  it('returns unknown for unrecognised text', () => {
    expect(detectFormat('hello world')).toBe('unknown');
  });
});

// ─── importMeshSync ──────────────────────────────────────────────────────────

describe('importMeshSync', () => {
  it('parses GMSH into a direct TetMesh', () => {
    const result = importMeshSync(makeGmshText());
    expect(result.format).toBe('msh');
    expect(result.tetMesh).toBeDefined();
    expect(result.tetMesh!.nodeCount).toBe(8);
    expect(result.tetMesh!.elementCount).toBe(6);
    expect(result.unstructured).toBeDefined();
  });

  it('parses STL into a SurfaceMesh (no tetrahedralization sync)', () => {
    const buf = buildSTL([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ]);
    const result = importMeshSync(buf);
    expect(result.format).toBe('stl');
    expect(result.surfaceMesh).toBeDefined();
    expect(result.tetMesh).toBeUndefined();
    expect(result.surfaceMesh!.triangles.length).toBe(6);
  });

  it('parses OBJ into a SurfaceMesh', () => {
    const result = importMeshSync(makeOBJText());
    expect(result.format).toBe('obj');
    expect(result.surfaceMesh).toBeDefined();
    expect(result.surfaceMesh!.triangles.length).toBe(3);
  });

  it('throws MeshImportError for unsupported format', () => {
    expect(() => importMeshSync('random text')).toThrow(MeshImportError);
  });
});

// ─── importMesh (async, with tetrahedralization) ────────────────────────────

describe('importMesh', () => {
  it('GMSH → direct TetMesh (no async work needed)', async () => {
    const result = await importMesh(makeGmshText());
    expect(result.format).toBe('msh');
    expect(result.tetMesh).toBeDefined();
    expect(result.tetMesh!.elementCount).toBe(6);
  });

  it('STL → surfaceMesh → fallback bounding-box TetMesh', async () => {
    const buf = buildSTL([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ]);
    const result = await importMesh(buf, { tetrahedralize: true });
    expect(result.format).toBe('stl');
    expect(result.surfaceMesh).toBeDefined();
    // Because TetGen WASM is a stub, meshSurface falls back to bounding-box
    // meshing. The result should still be a valid TetMesh.
    expect(result.tetMesh).toBeDefined();
    expect(result.tetMesh!.elementCount).toBeGreaterThan(0);
    expect(result.tetMesh!.nodeCount).toBeGreaterThan(0);
  });

  it('STL with tetrahedralize=false returns only surfaceMesh', async () => {
    const buf = buildSTL([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]);
    const result = await importMesh(buf, { tetrahedralize: false });
    expect(result.tetMesh).toBeUndefined();
    expect(result.surfaceMesh).toBeDefined();
  });
});

// ─── Pipeline: Imported mesh → StructuralSolverTET10 ────────────────────────

describe('MeshImporter → StructuralSolverTET10 pipeline', () => {
  it('GMSH TetMesh feeds into the solver and runs a solve', () => {
    const imported = importMeshSync(makeGmshText());
    expect(imported.tetMesh).toBeDefined();

    const solver = solverFromTetMesh(imported.tetMesh!);
    expect(solver.getStats().solveResult).toBeNull();

    solver.solve();
    const stats = solver.getStats();
    expect(stats.solveResult).not.toBeNull();
    expect(stats.solveTimeMs).toBeGreaterThanOrEqual(0);
    expect(stats.nodeCount).toBe(imported.tetMesh!.nodeCount);
    expect(stats.elementCount).toBe(imported.tetMesh!.elementCount);
  });

  it('STL → importMesh → TetMesh feeds into the solver', async () => {
    const buf = buildSTL([
      [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ]);
    const imported = await importMesh(buf, { tetrahedralize: true });
    expect(imported.tetMesh).toBeDefined();

    const solver = solverFromTetMesh(imported.tetMesh!);
    solver.solve();
    const stats = solver.getStats();
    expect(stats.solveResult).not.toBeNull();
    expect(stats.solveTimeMs).toBeGreaterThanOrEqual(0);
  });
});
