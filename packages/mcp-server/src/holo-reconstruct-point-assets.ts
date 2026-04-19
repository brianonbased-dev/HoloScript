/**
 * Aggregate per-step HoloMap points for export-sidecar artifacts (PLY, trajectory JSON).
 */

import type { ReconstructionManifest, ReconstructionStep } from '@holoscript/core/reconstruction';

export type AggregatedScanGeometry = {
  positions: number[];
  colors: number[];
  poses: Array<{
    frameIndex: number;
    position: [number, number, number];
    rotation: [number, number, number, number];
    confidence: number;
  }>;
};

export function emptyAggregate(): AggregatedScanGeometry {
  return { positions: [], colors: [], poses: [] };
}

export function appendStepToAggregate(
  agg: AggregatedScanGeometry,
  step: ReconstructionStep,
  maxPoints: number,
): void {
  const pos = step.points.positions;
  const col = step.points.colors;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    if (agg.positions.length / 3 >= maxPoints) return;
    const b = i * 3;
    agg.positions.push(pos[b], pos[b + 1], pos[b + 2]);
    if (col && col.length >= n * 3) {
      agg.colors.push(col[b], col[b + 1], col[b + 2]);
    } else {
      agg.colors.push(200, 200, 200);
    }
  }
  agg.poses.push({
    frameIndex: step.frame.index,
    position: [...step.pose.position] as [number, number, number],
    rotation: [...step.pose.rotation] as [number, number, number, number],
    confidence: step.pose.confidence,
  });
}

export function boundsFromPositions(positions: number[]): {
  min: [number, number, number];
  max: [number, number, number];
} | undefined {
  const nv = positions.length / 3;
  if (nv < 1) return undefined;
  let minx = positions[0];
  let miny = positions[1];
  let minz = positions[2];
  let maxx = minx;
  let maxy = miny;
  let maxz = minz;
  for (let i = 1; i < nv; i++) {
    const b = i * 3;
    const x = positions[b];
    const y = positions[b + 1];
    const z = positions[b + 2];
    minx = Math.min(minx, x);
    miny = Math.min(miny, y);
    minz = Math.min(minz, z);
    maxx = Math.max(maxx, x);
    maxy = Math.max(maxy, y);
    maxz = Math.max(maxz, z);
  }
  return {
    min: [minx, miny, minz],
    max: [maxx, maxy, maxz],
  };
}

/** ASCII PLY (x,y,z + uchar rgb) for Unity / Blender / MeshLab / three.js loaders. */
export function encodePlyAscii(positions: number[], colors: number[]): string {
  const n = Math.min(positions.length / 3, colors.length / 3);
  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    `element vertex ${n}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
  ];
  for (let i = 0; i < n; i++) {
    const b = i * 3;
    const x = positions[b];
    const y = positions[b + 1];
    const z = positions[b + 2];
    const r = Math.max(0, Math.min(255, Math.round(colors[b])));
    const g = Math.max(0, Math.min(255, Math.round(colors[b + 1])));
    const cc = Math.max(0, Math.min(255, Math.round(colors[b + 2])));
    lines.push(`${x} ${y} ${z} ${r} ${g} ${cc}`);
  }
  return `${lines.join('\n')}\n`;
}

export function encodeTrajectoryJson(poses: AggregatedScanGeometry['poses']): string {
  return `${JSON.stringify({ version: 1, poses }, null, 2)}\n`;
}

/** Prefer a tight AABB from sampled points; fall back to manifest bounds. */
export function effectiveBoundsForExport(
  m: ReconstructionManifest,
  fromPoints?: { min: [number, number, number]; max: [number, number, number] },
): { min: [number, number, number]; max: [number, number, number] } {
  return fromPoints ?? m.bounds;
}
