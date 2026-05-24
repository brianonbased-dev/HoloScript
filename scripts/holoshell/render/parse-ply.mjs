import { readFileSync } from 'node:fs';

export function parseAsciiPly(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line) => line.trim() === 'end_header');
  if (end < 0) throw new Error(`PLY missing end_header: ${path}`);
  const vertexLine = lines.slice(0, end).find((line) => line.startsWith('element vertex '));
  const expectedCount = vertexLine ? Number.parseInt(vertexLine.split(/\s+/)[2], 10) : undefined;
  const points = [];
  for (const line of lines.slice(end + 1)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length < 6 || parts.some((value) => Number.isNaN(value))) continue;
    points.push({
      x: parts[0],
      y: parts[1],
      z: parts[2],
      r: Math.max(0, Math.min(255, Math.round(parts[3]))),
      g: Math.max(0, Math.min(255, Math.round(parts[4]))),
      b: Math.max(0, Math.min(255, Math.round(parts[5]))),
      confidence: Number.isFinite(parts[6]) ? parts[6] : 1,
    });
  }
  if (Number.isInteger(expectedCount) && points.length !== expectedCount) {
    throw new Error(`PLY vertex count mismatch: expected ${expectedCount}, decoded ${points.length}`);
  }
  if (points.length < 1) throw new Error(`PLY has no vertices: ${path}`);
  return points;
}
