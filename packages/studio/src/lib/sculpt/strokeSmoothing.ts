/**
 * strokeSmoothing.ts
 *
 * Catmull-Rom spline interpolation for 3D sketch strokes.
 * Smooths raw pointer samples into visually pleasing curves.
 */

export type Vec3 = [number, number, number];

// ── Core Catmull-Rom ─────────────────────────────────────────────────────────

/**
 * Evaluate a single point on a Catmull-Rom segment.
 * p0, p1, p2, p3 are the four control points.
 * t ∈ [0,1] is the local progress along the p1→p2 segment.
 * alpha controls centripetal (0.5) vs uniform (0) vs chordal (1).
 */
export function catmullRomPoint(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  t: number,
  alpha = 0.5
): Vec3 {
  function td(pa: Vec3, pb: Vec3): number {
    const dx = pb[0] - pa[0],
      dy = pb[1] - pa[1],
      dz = pb[2] - pa[2];
    return Math.pow(Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-10, alpha);
  }

  const t0 = 0;
  const t1 = t0 + td(p0, p1);
  const t2 = t1 + td(p1, p2);
  const t3 = t2 + td(p2, p3);
  const tt = t1 + t * (t2 - t1); // remap t to the [t1,t2] segment (p1→p2)

  const interp = (a: number, b: number, tA: number, tB: number, tT: number) =>
    tA === tB ? a : a + (b - a) * ((tT - tA) / (tB - tA));

  const blendVec3 = (a: Vec3, b: Vec3, tA: number, tB: number, tT: number): Vec3 => [
    interp(a[0], b[0], tA, tB, tT),
    interp(a[1], b[1], tA, tB, tT),
    interp(a[2], b[2], tA, tB, tT),
  ];

  const A1 = blendVec3(p0, p1, t0, t1, tt);
  const A2 = blendVec3(p1, p2, t1, t2, tt);
  const A3 = blendVec3(p2, p3, t2, t3, tt);
  const B1 = blendVec3(A1, A2, t0, t2, tt);
  const B2 = blendVec3(A2, A3, t1, t3, tt);
  return blendVec3(B1, B2, t1, t2, tt);
}

/**
 * Interpolate an entire array of control points using Catmull-Rom splines.
 * Returns a new array with smoother intermediate points.
 *
 * @param points    Raw input points (must have ≥ 2)
 * @param segments  Number of interpolated segments between each pair of points
 * @param alpha     0=uniform, 0.5=centripetal (default), 1=chordal
 */
export function catmullRomInterpolate(points: Vec3[], segments = 8, alpha = 0.5): Vec3[] {
  if (points.length < 2) return [...points];
  if (points.length === 2) {
    // Linear interpolation between 2 points
    const [a, b] = points as [Vec3, Vec3];
    const result: Vec3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
    return result;
  }

  // Duplicate endcap control points
  const pts: Vec3[] = [points[0]!, ...points, points[points.length - 1]!];
  const result: Vec3[] = [];

  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i]!,
      p1 = pts[i + 1]!,
      p2 = pts[i + 2]!,
      p3 = pts[i + 3]!;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      result.push(catmullRomPoint(p0, p1, p2, p3, t, alpha));
    }
  }

  // Push final point
  result.push(points[points.length - 1]!);
  return result;
}

// ── Stroke Utilities ─────────────────────────────────────────────────────────

/** Calculate the total arc length of a polyline. */
export function strokeLength(points: Vec3[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    len += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return len;
}

/** Resample a stroke to evenly-spaced points along its arc length. */
export function resampleStroke(points: Vec3[], count: number): Vec3[] {
  if (points.length < 2 || count < 2) return [...points];
  const totalLen = strokeLength(points);
  const step = totalLen / (count - 1);
  const result: Vec3[] = [points[0]!];
  let accumulated = 0;
  let segIdx = 0;

  for (let i = 1; i < count - 1; i++) {
    const target = i * step;

    // Handle floating point imprecision pushing us past the end
    if (segIdx >= points.length - 1) {
      result.push(points[points.length - 1]!);
      continue;
    }

    while (segIdx < points.length - 1) {
      const a = points[segIdx]!;
      const b = points[segIdx + 1]!;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        dz = b[2] - a[2];
      const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (accumulated + segLen >= target) {
        // We found the segment containing the target distance
        const t = segLen === 0 ? 0 : (target - accumulated) / segLen;
        result.push([a[0] + dx * t, a[1] + dy * t, a[2] + dz * t]);
        break; // Process next target point
      } else {
        accumulated += segLen;
        segIdx++;
      }
    }
  }

  // Guarantee exact final point
  result.push(points[points.length - 1]!);
  return result;
}

/**
 * Smooth a stroke using repeated Gaussian averaging (Laplacian smoothing).
 * Good for removing jitter from tablet input.
 *
 * @param points   Raw points
 * @param passes   Number of smoothing passes (1–10)
 */
export function gaussianSmoothStroke(points: Vec3[], passes = 2): Vec3[] {
  if (points.length < 3) return [...points];
  let pts = [...points];
  for (let p = 0; p < passes; p++) {
    const smoothed: Vec3[] = [pts[0]!];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1]!,
        b = pts[i]!,
        c = pts[i + 1]!;
      smoothed.push([
        (a[0] + 2 * b[0] + c[0]) / 4,
        (a[1] + 2 * b[1] + c[1]) / 4,
        (a[2] + 2 * b[2] + c[2]) / 4,
      ]);
    }
    smoothed.push(pts[pts.length - 1]!);
    pts = smoothed;
  }
  return pts;
}
