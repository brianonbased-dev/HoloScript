/**
 * strokeSmoothing.ts — Freehand Stroke Smoothing
 *
 * Smooth user-drawn strokes using Catmull-Rom splines and
 * distance-based simplification for sketch, paint, and path tools.
 */

// Re-export 3D stroke smoothing utilities (strokeLength supersedes the local Vec2 version)
export {
  type Vec3,
  catmullRomPoint,
  catmullRomInterpolate,
  strokeLength,
  resampleStroke,
  gaussianSmoothStroke,
} from './sculpt/strokeSmoothing';

/*
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface StrokePoint {
  position: Vec2;
  pressure: number; // 0..1 (tablet pressure or 1.0 for mouse)
  timestamp: number;
}

export interface SmoothedStroke {
  points: StrokePoint[];
  length: number;
  simplified: boolean;
}

/**
 * Smooth a stroke using Catmull-Rom spline interpolation.
 */
export function catmullRomSmooth(
  points: StrokePoint[],
  tension: number = 0.5,
  segments: number = 4
): StrokePoint[] {
  if (points.length < 3) return points;

  const smoothed: StrokePoint[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.position.x +
          (-p0.position.x + p2.position.x) * t +
          (2 * p0.position.x - 5 * p1.position.x + 4 * p2.position.x - p3.position.x) * t2 +
          (-p0.position.x + 3 * p1.position.x - 3 * p2.position.x + p3.position.x) * t3);
      const y =
        0.5 *
        (2 * p1.position.y +
          (-p0.position.y + p2.position.y) * t +
          (2 * p0.position.y - 5 * p1.position.y + 4 * p2.position.y - p3.position.y) * t2 +
          (-p0.position.y + 3 * p1.position.y - 3 * p2.position.y + p3.position.y) * t3);

      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const timestamp = p1.timestamp + (p2.timestamp - p1.timestamp) * t;

      smoothed.push({ position: { x, y }, pressure, timestamp });
    }
  }

  return smoothed;
}

/**
 * Simplify a stroke using Ramer-Douglas-Peucker algorithm.
 */
export function rdpSimplify(points: StrokePoint[], epsilon: number = 1.0): StrokePoint[] {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from the line (first → last)
  const first = points[0].position;
  const last = points[points.length - 1].position;
  let maxDist = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i].position, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

function perpendicularDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  return (
    Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / len
  );
}

// strokeLength is re-exported from ./sculpt/strokeSmoothing (Vec3 version)

/**
 * Calculate average pressure along a stroke.
 */
export function averagePressure(points: StrokePoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((s, p) => s + p.pressure, 0) / points.length;
}

/**
 * Apply moving-average smoothing to a stroke.
 */
export function movingAverageSmooth(points: StrokePoint[], windowSize: number = 5): StrokePoint[] {
  if (points.length <= windowSize) return points;
  const half = Math.floor(windowSize / 2);
  return points.map((p, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(points.length - 1, i + half);
    let sumX = 0,
      sumY = 0,
      count = 0;
    for (let j = start; j <= end; j++) {
      sumX += points[j].position.x;
      sumY += points[j].position.y;
      count++;
    }
    return { ...p, position: { x: sumX / count, y: sumY / count } };
  });
}
