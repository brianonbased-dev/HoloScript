/**
 * CSVImporter — Import scalar field data from CSV files.
 *
 * Reverses the export from CSVExporter.exportScalarFieldCSV().
 * Format: x,y,z,value rows with header. Auto-detects grid resolution
 * from coordinate spacing.
 */

import { RegularGrid3D } from '../RegularGrid3D';

/**
 * Import a CSV scalar field (x,y,z,value format) into a RegularGrid3D.
 * Auto-detects grid resolution and domain size from coordinate data.
 */
export function importScalarFieldCSV(csv: string): { grid: RegularGrid3D; range: [number, number] } {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV: Need at least header + 1 data row');

  // Skip header
  const header = lines[0].toLowerCase();
  const startRow = header.includes('x') || header.includes('value') ? 1 : 0;

  // Parse all data points
  const points: { x: number; y: number; z: number; v: number }[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const parts = lines[i].split(',').map(Number);
    if (parts.length < 4 || parts.some(isNaN)) continue;
    points.push({ x: parts[0], y: parts[1], z: parts[2], v: parts[3] });
  }

  if (points.length === 0) throw new Error('CSV: No valid data rows');

  // Detect unique coordinates per axis
  const xs = [...new Set(points.map((p) => round6(p.x)))].sort((a, b) => a - b);
  const ys = [...new Set(points.map((p) => round6(p.y)))].sort((a, b) => a - b);
  const zs = [...new Set(points.map((p) => round6(p.z)))].sort((a, b) => a - b);

  const nx = xs.length;
  const ny = ys.length;
  const nz = zs.length;

  const domainX = xs[xs.length - 1] - xs[0] || 1;
  const domainY = ys[ys.length - 1] - ys[0] || 1;
  const domainZ = zs[zs.length - 1] - zs[0] || 1;

  const grid = new RegularGrid3D([nx, ny, nz], [domainX, domainY, domainZ]);

  // Build coordinate → index maps
  const xMap = new Map(xs.map((v, i) => [v, i]));
  const yMap = new Map(ys.map((v, i) => [v, i]));
  const zMap = new Map(zs.map((v, i) => [v, i]));

  let min = Infinity, max = -Infinity;

  for (const p of points) {
    const i = xMap.get(round6(p.x));
    const j = yMap.get(round6(p.y));
    const k = zMap.get(round6(p.z));
    if (i !== undefined && j !== undefined && k !== undefined) {
      grid.set(i, j, k, p.v);
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
  }

  return { grid, range: [min, max] };
}

/**
 * Import a tabular CSV with named columns into an array of records.
 * Generic utility for any CSV format.
 */
export function importTableCSV(csv: string): Record<string, number>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, number>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map(Number);
    if (parts.length !== headers.length) continue;
    const row: Record<string, number> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = parts[j];
    }
    rows.push(row);
  }

  return rows;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
