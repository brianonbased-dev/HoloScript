/**
 * VTKImporter — Parse VTK Legacy ASCII files back into simulation data.
 *
 * Reverses the exports from VTKExporter:
 *   - STRUCTURED_POINTS → RegularGrid3D + scalar field
 *   - UNSTRUCTURED_GRID → vertex array + tet connectivity + point/cell data
 *
 * @see VTKExporter — produces the files this module reads
 */

import { RegularGrid3D } from '../RegularGrid3D';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VTKStructuredResult {
  grid: RegularGrid3D;
  scalars: Map<string, Float32Array>;
}

export interface VTKUnstructuredResult {
  vertices: Float64Array;
  tetrahedra: Uint32Array;
  nodeCount: number;
  elementCount: number;
  pointData: Map<string, Float32Array>;
  cellData: Map<string, Float32Array>;
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse a VTK STRUCTURED_POINTS file.
 */
export function importStructuredPoints(vtk: string): VTKStructuredResult {
  const lines = vtk.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let dimensions: [number, number, number] = [0, 0, 0];
  let spacing: [number, number, number] = [1, 1, 1];
  let origin: [number, number, number] = [0, 0, 0];
  const scalars = new Map<string, Float32Array>();
  let numPoints = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('DIMENSIONS')) {
      const parts = line.split(/\s+/);
      dimensions = [parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3])];
      numPoints = dimensions[0] * dimensions[1] * dimensions[2];
    } else if (line.startsWith('SPACING') || line.startsWith('ASPECT_RATIO')) {
      const parts = line.split(/\s+/);
      spacing = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } else if (line.startsWith('ORIGIN')) {
      const parts = line.split(/\s+/);
      origin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } else if (line.startsWith('SCALARS')) {
      const parts = line.split(/\s+/);
      const name = parts[1];
      i++; // skip LOOKUP_TABLE line
      i++;
      const data = new Float32Array(numPoints);
      let idx = 0;
      while (i < lines.length && idx < numPoints) {
        const vals = lines[i].split(/\s+/).map(Number);
        for (const v of vals) {
          if (idx < numPoints) data[idx++] = v;
        }
        i++;
      }
      scalars.set(name, data);
      continue; // don't increment i again
    }
    i++;
  }

  const domainSize: [number, number, number] = [
    spacing[0] * (dimensions[0] - 1),
    spacing[1] * (dimensions[1] - 1),
    spacing[2] * (dimensions[2] - 1),
  ];

  const grid = new RegularGrid3D(dimensions, domainSize);

  return { grid, scalars };
}

/**
 * Parse a VTK UNSTRUCTURED_GRID file.
 */
export function importUnstructuredGrid(vtk: string): VTKUnstructuredResult {
  const lines = vtk.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let vertices = new Float64Array(0);
  let tetrahedra = new Uint32Array(0);
  let nodeCount = 0;
  let elementCount = 0;
  const pointData = new Map<string, Float32Array>();
  const cellData = new Map<string, Float32Array>();

  let i = 0;
  let readingPointData = false;
  let readingCellData = false;
  let currentDataCount = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('POINTS')) {
      const parts = line.split(/\s+/);
      nodeCount = parseInt(parts[1]);
      vertices = new Float64Array(nodeCount * 3);
      i++;
      let idx = 0;
      while (i < lines.length && idx < nodeCount * 3) {
        const vals = lines[i].split(/\s+/).map(Number);
        for (const v of vals) {
          if (idx < nodeCount * 3) vertices[idx++] = v;
        }
        i++;
      }
      continue;
    }

    if (line.startsWith('CELLS')) {
      const parts = line.split(/\s+/);
      elementCount = parseInt(parts[1]);
      tetrahedra = new Uint32Array(elementCount * 4);
      i++;
      for (let e = 0; e < elementCount && i < lines.length; e++) {
        const vals = lines[i].split(/\s+/).map(Number);
        // First number is vertex count (4 for tets), followed by indices
        tetrahedra[e * 4] = vals[1];
        tetrahedra[e * 4 + 1] = vals[2];
        tetrahedra[e * 4 + 2] = vals[3];
        tetrahedra[e * 4 + 3] = vals[4];
        i++;
      }
      continue;
    }

    if (line.startsWith('POINT_DATA')) {
      currentDataCount = parseInt(line.split(/\s+/)[1]);
      readingPointData = true;
      readingCellData = false;
      i++;
      continue;
    }

    if (line.startsWith('CELL_DATA')) {
      currentDataCount = parseInt(line.split(/\s+/)[1]);
      readingCellData = true;
      readingPointData = false;
      i++;
      continue;
    }

    if (line.startsWith('SCALARS') && (readingPointData || readingCellData)) {
      const parts = line.split(/\s+/);
      const name = parts[1];
      i++; // skip LOOKUP_TABLE
      i++;
      const data = new Float32Array(currentDataCount);
      let idx = 0;
      while (i < lines.length && idx < currentDataCount) {
        const vals = lines[i].split(/\s+/).map(Number);
        for (const v of vals) {
          if (idx < currentDataCount) data[idx++] = v;
        }
        i++;
      }
      if (readingPointData) pointData.set(name, data);
      else cellData.set(name, data);
      continue;
    }

    i++;
  }

  return { vertices, tetrahedra, nodeCount, elementCount, pointData, cellData };
}
