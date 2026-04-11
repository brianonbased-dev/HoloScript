/**
 * VTKExporter — Export simulation results in VTK Legacy ASCII format.
 *
 * Supported output types:
 * - Structured Points (RegularGrid3D scalar fields → thermal)
 * - Unstructured Grid (tetrahedral mesh → structural FEM)
 * - PolyData (line segments → hydraulic pipe networks)
 *
 * Output files can be opened directly in ParaView, VisIt, or any
 * VTK-compatible post-processing tool.
 *
 * Reference: VTK File Formats (Kitware), https://vtk.org/wp-content/uploads/2015/04/file-formats.pdf
 */

import type { RegularGrid3D } from '../RegularGrid3D';

// ── Structured Points (Thermal) ──────────────────────────────────────────────

export interface StructuredPointsOptions {
  /** Dataset title (appears in VTK header) */
  title?: string;
  /** Scalar field name (e.g., "Temperature") */
  fieldName?: string;
  /** Physical unit string for documentation (e.g., "K") */
  unit?: string;
}

/**
 * Export a RegularGrid3D scalar field as VTK Structured Points.
 * Suitable for thermal temperature fields, saturation fields, etc.
 */
export function exportStructuredPoints(
  grid: RegularGrid3D,
  data: Float32Array,
  options: StructuredPointsOptions = {}
): string {
  const title = options.title ?? 'HoloScript Simulation Output';
  const fieldName = options.fieldName ?? 'Scalar';
  const { nx, ny, nz, dx, dy, dz } = grid;
  const numPoints = nx * ny * nz;

  const lines: string[] = [
    '# vtk DataFile Version 3.0',
    title,
    'ASCII',
    'DATASET STRUCTURED_POINTS',
    `DIMENSIONS ${nx} ${ny} ${nz}`,
    `ORIGIN 0.0 0.0 0.0`,
    `SPACING ${dx} ${dy} ${dz}`,
    `POINT_DATA ${numPoints}`,
    `SCALARS ${fieldName} float 1`,
    'LOOKUP_TABLE default',
  ];

  // Write data in VTK order: x varies fastest, then y, then z
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const rowValues: string[] = [];
      for (let i = 0; i < nx; i++) {
        const idx = i + j * nx + k * nx * ny;
        rowValues.push(data[idx].toFixed(6));
      }
      lines.push(rowValues.join(' '));
    }
  }

  return lines.join('\n') + '\n';
}

// ── Unstructured Grid (Structural FEM) ───────────────────────────────────────

export interface UnstructuredGridOptions {
  title?: string;
  /** Names for point data arrays */
  pointDataNames?: string[];
  /** Names for cell data arrays */
  cellDataNames?: string[];
}

/**
 * Export a tetrahedral mesh with results as VTK Unstructured Grid.
 * Suitable for structural FEM results (displacements, Von Mises stress).
 *
 * @param nodes     Node coordinates [x0,y0,z0, x1,y1,z1, ...]
 * @param elements  Element connectivity [n0,n1,n2,n3, ...] (4 nodes per tet)
 * @param pointData Per-node scalar/vector arrays (e.g., displacements)
 * @param cellData  Per-element scalar arrays (e.g., Von Mises stress)
 */
export function exportUnstructuredGrid(
  nodes: Float32Array | Float64Array,
  elements: Uint32Array | number[],
  pointData: { name: string; data: Float32Array | Float64Array; components: number }[],
  cellData: { name: string; data: Float32Array | Float64Array }[],
  options: UnstructuredGridOptions = {}
): string {
  const title = options.title ?? 'HoloScript FEM Results';
  const numNodes = Math.floor(nodes.length / 3);
  const numElements = Math.floor(elements.length / 4);

  const lines: string[] = [
    '# vtk DataFile Version 3.0',
    title,
    'ASCII',
    'DATASET UNSTRUCTURED_GRID',
  ];

  // Points
  lines.push(`POINTS ${numNodes} float`);
  for (let i = 0; i < numNodes; i++) {
    lines.push(`${nodes[i * 3].toFixed(6)} ${nodes[i * 3 + 1].toFixed(6)} ${nodes[i * 3 + 2].toFixed(6)}`);
  }

  // Cells (tetrahedra: VTK cell type 10)
  const cellListSize = numElements * 5; // 4 nodes + 1 count per element
  lines.push(`CELLS ${numElements} ${cellListSize}`);
  for (let i = 0; i < numElements; i++) {
    lines.push(`4 ${elements[i * 4]} ${elements[i * 4 + 1]} ${elements[i * 4 + 2]} ${elements[i * 4 + 3]}`);
  }

  // Cell types
  lines.push(`CELL_TYPES ${numElements}`);
  for (let i = 0; i < numElements; i++) {
    lines.push('10'); // VTK_TETRA
  }

  // Point data
  if (pointData.length > 0) {
    lines.push(`POINT_DATA ${numNodes}`);
    for (const pd of pointData) {
      if (pd.components === 1) {
        lines.push(`SCALARS ${pd.name} float 1`);
        lines.push('LOOKUP_TABLE default');
        for (let i = 0; i < numNodes; i++) {
          lines.push(pd.data[i].toFixed(6));
        }
      } else if (pd.components === 3) {
        lines.push(`VECTORS ${pd.name} float`);
        for (let i = 0; i < numNodes; i++) {
          lines.push(`${pd.data[i * 3].toFixed(6)} ${pd.data[i * 3 + 1].toFixed(6)} ${pd.data[i * 3 + 2].toFixed(6)}`);
        }
      }
    }
  }

  // Cell data
  if (cellData.length > 0) {
    lines.push(`CELL_DATA ${numElements}`);
    for (const cd of cellData) {
      lines.push(`SCALARS ${cd.name} float 1`);
      lines.push('LOOKUP_TABLE default');
      for (let i = 0; i < numElements; i++) {
        lines.push(cd.data[i].toFixed(6));
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ── PolyData (Hydraulic Pipe Networks) ───────────────────────────────────────

/**
 * Export a pipe network as VTK PolyData (lines with scalar data).
 * Suitable for hydraulic solver results (pressure, flow rate).
 *
 * @param nodePositions  Node coordinates [x0,y0,z0, ...]
 * @param pipes          Pipe connectivity [startNode, endNode] pairs
 * @param nodeData       Per-node scalar arrays (e.g., pressure head)
 * @param pipeData       Per-pipe scalar arrays (e.g., flow rate)
 */
export function exportPolyData(
  nodePositions: Float32Array | Float64Array | number[],
  pipes: [number, number][],
  nodeData: { name: string; data: Float32Array | Float64Array | number[] }[],
  pipeData: { name: string; data: Float32Array | Float64Array | number[] }[],
  options: { title?: string } = {}
): string {
  const title = options.title ?? 'HoloScript Hydraulic Results';
  const numNodes = Math.floor(nodePositions.length / 3);
  const numPipes = pipes.length;

  const lines: string[] = [
    '# vtk DataFile Version 3.0',
    title,
    'ASCII',
    'DATASET POLYDATA',
  ];

  // Points
  lines.push(`POINTS ${numNodes} float`);
  for (let i = 0; i < numNodes; i++) {
    lines.push(`${Number(nodePositions[i * 3]).toFixed(6)} ${Number(nodePositions[i * 3 + 1]).toFixed(6)} ${Number(nodePositions[i * 3 + 2]).toFixed(6)}`);
  }

  // Lines (pipes)
  const lineListSize = numPipes * 3; // 2 nodes + 1 count per line
  lines.push(`LINES ${numPipes} ${lineListSize}`);
  for (const [start, end] of pipes) {
    lines.push(`2 ${start} ${end}`);
  }

  // Point data (node pressures, etc.)
  if (nodeData.length > 0) {
    lines.push(`POINT_DATA ${numNodes}`);
    for (const nd of nodeData) {
      lines.push(`SCALARS ${nd.name} float 1`);
      lines.push('LOOKUP_TABLE default');
      for (let i = 0; i < numNodes; i++) {
        lines.push(Number(nd.data[i]).toFixed(6));
      }
    }
  }

  // Cell data (pipe flow rates, etc.)
  if (pipeData.length > 0) {
    lines.push(`CELL_DATA ${numPipes}`);
    for (const pd of pipeData) {
      lines.push(`SCALARS ${pd.name} float 1`);
      lines.push('LOOKUP_TABLE default');
      for (let i = 0; i < numPipes; i++) {
        lines.push(Number(pd.data[i]).toFixed(6));
      }
    }
  }

  return lines.join('\n') + '\n';
}
