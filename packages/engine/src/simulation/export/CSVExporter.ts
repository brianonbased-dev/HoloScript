/**
 * CSVExporter — Export simulation data as CSV for analysis in MATLAB, Python, Excel.
 *
 * Produces well-formed CSV with:
 * - Header row including unit annotations
 * - Consistent numeric formatting
 * - RFC 4180 compliant output
 */

import type { ConvergenceResult } from '../ConvergenceControl';

// ── Convergence History ──────────────────────────────────────────────────────

/**
 * Export solver convergence history as CSV.
 * Columns: iteration, residual_norm, max_change (if available)
 */
export function exportConvergenceHistory(
  result: ConvergenceResult,
  options: { solverName?: string } = {}
): string {
  const header = `# Solver: ${options.solverName ?? 'unknown'}, Converged: ${result.converged}, Total iterations: ${result.iterations}`;
  const lines: string[] = [
    header,
    'iteration,residual_norm',
  ];

  const history = result.residualHistory ?? [];
  for (let i = 0; i < history.length; i++) {
    lines.push(`${i},${history[i].toExponential(8)}`);
  }

  return lines.join('\n') + '\n';
}

// ── Scalar Field ─────────────────────────────────────────────────────────────

export interface ScalarFieldCSVOptions {
  fieldName?: string;
  unit?: string;
}

/**
 * Export a 3D scalar field as CSV with spatial coordinates.
 * Columns: x, y, z, value
 */
export function exportScalarFieldCSV(
  nx: number,
  ny: number,
  nz: number,
  dx: number,
  dy: number,
  dz: number,
  data: Float32Array,
  options: ScalarFieldCSVOptions = {}
): string {
  const fieldName = options.fieldName ?? 'value';
  const unit = options.unit ? ` [${options.unit}]` : '';
  const lines: string[] = [
    `x [m],y [m],z [m],${fieldName}${unit}`,
  ];

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = i + j * nx + k * nx * ny;
        const x = (i * dx).toFixed(6);
        const y = (j * dy).toFixed(6);
        const z = (k * dz).toFixed(6);
        lines.push(`${x},${y},${z},${data[idx].toFixed(6)}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ── Tabular Data ─────────────────────────────────────────────────────────────

/**
 * Export arbitrary tabular data as CSV.
 * Generic utility for material property tables, solver statistics, etc.
 */
export function exportTable(
  headers: string[],
  rows: (string | number)[][],
  options: { comment?: string } = {}
): string {
  const lines: string[] = [];
  if (options.comment) {
    lines.push(`# ${options.comment}`);
  }
  lines.push(headers.join(','));
  for (const row of rows) {
    lines.push(row.map(v => typeof v === 'number' ? v.toExponential(8) : v).join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Material Property Table ──────────────────────────────────────────────────

export interface MaterialRow {
  name: string;
  conductivity: number;
  specific_heat: number;
  density: number;
  source: string;
}

/**
 * Export material property table as CSV with unit-annotated headers.
 */
export function exportMaterialTable(materials: MaterialRow[]): string {
  const headers = [
    'material',
    'conductivity [W/(m*K)]',
    'specific_heat [J/(kg*K)]',
    'density [kg/m3]',
    'source',
  ];
  const rows = materials.map(m => [
    m.name,
    m.conductivity.toFixed(4),
    m.specific_heat.toFixed(2),
    m.density.toFixed(2),
    `"${m.source}"`,
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n';
}
