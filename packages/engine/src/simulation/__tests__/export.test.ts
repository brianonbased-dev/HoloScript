/**
 * Export Layer Tests — VTK, CSV, JSON metadata.
 *
 * Validates:
 * - VTK Structured Points format correctness (header, dimensions, data count)
 * - VTK Unstructured Grid format (cells, cell types, point/cell data)
 * - VTK PolyData format (lines, point/cell data)
 * - CSV convergence history format
 * - CSV scalar field with spatial coordinates
 * - CSV material table with units
 * - JSON metadata round-trip serialization
 * - JSON metadata validation
 */

import { describe, it, expect } from 'vitest';
import {
  exportStructuredPoints,
  exportUnstructuredGrid,
  exportPolyData,
} from '../export/VTKExporter';
import {
  exportConvergenceHistory,
  exportScalarFieldCSV,
  exportTable,
  exportMaterialTable,
} from '../export/CSVExporter';
import {
  createMetadata,
  validateMetadata,
  serializeMetadata,
  deserializeMetadata,
} from '../export/MetadataSchema';
import { RegularGrid3D } from '../RegularGrid3D';

// ── VTK Structured Points ────────────────────────────────────────────────────

describe('VTK Structured Points export', () => {
  it('produces valid VTK header for 3x3x3 grid', () => {
    const grid = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    const data = new Float32Array(27);
    data.fill(100);

    const vtk = exportStructuredPoints(grid, data, {
      title: 'Test Temperature',
      fieldName: 'Temperature',
    });

    expect(vtk).toContain('# vtk DataFile Version 3.0');
    expect(vtk).toContain('Test Temperature');
    expect(vtk).toContain('ASCII');
    expect(vtk).toContain('DATASET STRUCTURED_POINTS');
    expect(vtk).toContain('DIMENSIONS 3 3 3');
    expect(vtk).toContain('POINT_DATA 27');
    expect(vtk).toContain('SCALARS Temperature float 1');
    expect(vtk).toContain('LOOKUP_TABLE default');
  });

  it('writes correct number of data values', () => {
    const grid = new RegularGrid3D([4, 3, 2], [4, 3, 2]);
    const data = new Float32Array(24);
    for (let i = 0; i < 24; i++) data[i] = i * 10;

    const vtk = exportStructuredPoints(grid, data);
    const lines = vtk.trim().split('\n');
    // Header: 10 lines, then data rows
    const dataLines = lines.slice(10);
    // Count total values across data lines
    const totalValues = dataLines.reduce(
      (sum, line) => sum + line.trim().split(/\s+/).length,
      0
    );
    expect(totalValues).toBe(24);
  });

  it('includes spacing from grid', () => {
    const grid = new RegularGrid3D([5, 5, 5], [10, 10, 10]);
    const data = new Float32Array(125);
    const vtk = exportStructuredPoints(grid, data);
    // dx = 10/(5-1) = 2.5
    expect(vtk).toContain('SPACING 2.5 2.5 2.5');
  });
});

// ── VTK Unstructured Grid ────────────────────────────────────────────────────

describe('VTK Unstructured Grid export', () => {
  it('produces valid header for a single tetrahedron', () => {
    const nodes = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const elements = new Uint32Array([0, 1, 2, 3]);
    const vonMises = new Float32Array([250e6]);

    const vtk = exportUnstructuredGrid(
      nodes,
      elements,
      [{ name: 'Displacement', data: new Float32Array(12), components: 3 }],
      [{ name: 'VonMises', data: vonMises }],
      { title: 'FEM Test' }
    );

    expect(vtk).toContain('DATASET UNSTRUCTURED_GRID');
    expect(vtk).toContain('POINTS 4 float');
    expect(vtk).toContain('CELLS 1 5');
    expect(vtk).toContain('CELL_TYPES 1');
    expect(vtk).toContain('10'); // VTK_TETRA
    expect(vtk).toContain('POINT_DATA 4');
    expect(vtk).toContain('VECTORS Displacement float');
    expect(vtk).toContain('CELL_DATA 1');
    expect(vtk).toContain('SCALARS VonMises float 1');
  });
});

// ── VTK PolyData ─────────────────────────────────────────────────────────────

describe('VTK PolyData export', () => {
  it('produces valid pipe network output', () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]);
    const pipes: [number, number][] = [[0, 1], [1, 2]];
    const pressure = new Float32Array([100, 90, 80]);
    const flowRate = new Float32Array([0.05, 0.03]);

    const vtk = exportPolyData(
      positions,
      pipes,
      [{ name: 'Pressure', data: pressure }],
      [{ name: 'FlowRate', data: flowRate }],
      { title: 'Hydraulic Test' }
    );

    expect(vtk).toContain('DATASET POLYDATA');
    expect(vtk).toContain('POINTS 3 float');
    expect(vtk).toContain('LINES 2 6');
    expect(vtk).toContain('POINT_DATA 3');
    expect(vtk).toContain('SCALARS Pressure float 1');
    expect(vtk).toContain('CELL_DATA 2');
    expect(vtk).toContain('SCALARS FlowRate float 1');
  });
});

// ── CSV Convergence History ──────────────────────────────────────────────────

describe('CSV convergence history', () => {
  it('exports iteration,residual columns', () => {
    const result = {
      converged: true,
      iterations: 3,
      residual: 1e-8,
      maxChange: 1e-9,
      residualHistory: [1e-2, 1e-5, 1e-8],
    };

    const csv = exportConvergenceHistory(result, { solverName: 'CG' });
    const lines = csv.trim().split('\n');

    expect(lines[0]).toContain('Solver: CG');
    expect(lines[0]).toContain('Converged: true');
    expect(lines[1]).toBe('iteration,residual_norm');
    expect(lines.length).toBe(5); // comment + header + 3 data rows
  });
});

// ── CSV Scalar Field ─────────────────────────────────────────────────────────

describe('CSV scalar field', () => {
  it('exports x,y,z,value columns with unit headers', () => {
    const data = new Float32Array([100, 200, 300, 400, 500, 600, 700, 800]);
    const csv = exportScalarFieldCSV(2, 2, 2, 1.0, 1.0, 1.0, data, {
      fieldName: 'Temperature',
      unit: 'K',
    });

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('x [m],y [m],z [m],Temperature [K]');
    expect(lines.length).toBe(9); // header + 8 data rows
  });

  it('has correct number of columns per row', () => {
    const data = new Float32Array(27);
    const csv = exportScalarFieldCSV(3, 3, 3, 1, 1, 1, data);
    const dataLines = csv.trim().split('\n').slice(1);
    for (const line of dataLines) {
      expect(line.split(',').length).toBe(4);
    }
  });
});

// ── CSV Material Table ───────────────────────────────────────────────────────

describe('CSV material table', () => {
  it('exports with unit-annotated headers', () => {
    const csv = exportMaterialTable([
      { name: 'steel', conductivity: 50, specific_heat: 490, density: 7850, source: 'ASM Handbook' },
    ]);

    expect(csv).toContain('conductivity [W/(m*K)]');
    expect(csv).toContain('specific_heat [J/(kg*K)]');
    expect(csv).toContain('density [kg/m3]');
    expect(csv).toContain('steel');
  });
});

// ── CSV Generic Table ────────────────────────────────────────────────────────

describe('CSV generic table', () => {
  it('exports headers and rows', () => {
    const csv = exportTable(
      ['mesh_size', 'error_L2', 'order'],
      [[0.1, 1e-4, 2.01], [0.05, 2.5e-5, 1.98]],
      { comment: 'Convergence study' }
    );

    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('Convergence study');
    expect(lines[1]).toBe('mesh_size,error_L2,order');
    expect(lines.length).toBe(4);
  });
});

// ── JSON Metadata ────────────────────────────────────────────────────────────

describe('JSON metadata schema', () => {
  const validMeta = createMetadata({
    software: { name: 'HoloScript', version: '6.1.0' },
    solver: { type: 'thermal', config: { gridResolution: [10, 10, 10] } },
    mesh: { type: 'regular_grid', dimensions: { nx: 10, ny: 10, nz: 10 } },
    materials: [{ name: 'steel', properties: { conductivity: 50 } }],
    resultSummary: { fieldName: 'Temperature', min: 20, max: 100, avg: 60 },
    deterministic: true,
  });

  it('creates metadata with auto-generated runId and timestamp', () => {
    expect(validMeta.runId).toMatch(/^sim_/);
    expect(validMeta.timestamp).toBeTruthy();
    expect(validMeta.schemaVersion).toBe('1.0.0');
  });

  it('validates correct metadata with no errors', () => {
    const errors = validateMetadata(validMeta);
    expect(errors).toEqual([]);
  });

  it('round-trips through JSON serialization', () => {
    const json = serializeMetadata(validMeta);
    const restored = deserializeMetadata(json);
    expect(restored.runId).toBe(validMeta.runId);
    expect(restored.solver.type).toBe('thermal');
    expect(restored.resultSummary.max).toBe(100);
  });

  it('detects missing required fields', () => {
    const bad = { ...validMeta, solver: undefined } as never;
    const errors = validateMetadata(bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid JSON on deserialize', () => {
    expect(() => deserializeMetadata('not json')).toThrow();
  });
});
