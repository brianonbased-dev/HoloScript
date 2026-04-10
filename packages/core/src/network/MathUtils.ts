/**
 * MathUtils.ts
 *
 * Higher-order interpolation utilities for the network synchronization layer.
 * Provides Catmull-Rom spline, Hermite, cubic Bezier, and supporting vec3 ops.
 *
 * These complement the linear helpers already in NetworkTypes
 * (lerpVector3, slerpQuaternion, distanceVector3).
 *
 * @module network
 */

import type { IVector3 } from './NetworkTypes';

// =============================================================================
// Vector3 Utilities
// =============================================================================

export function vec3Add(a: IVector3, b: IVector3): IVector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: IVector3, b: IVector3): IVector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: IVector3, s: number): IVector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Length(v: IVector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vec3Lerp(a: IVector3, b: IVector3, t: number): IVector3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// =============================================================================
// Catmull-Rom Spline
// =============================================================================

/**
 * Catmull-Rom spline interpolation between p1 and p2.
 * p0 and p3 are the points before/after the segment — used for tangent slope.
 *
 * @param p0  Point before start (tangent source)
 * @param p1  Start of interpolated segment
 * @param p2  End of interpolated segment
 * @param p3  Point after end (tangent source)
 * @param t   Interpolation factor [0, 1]
 */
export function catmullRom(
  p0: IVector3,
  p1: IVector3,
  p2: IVector3,
  p3: IVector3,
  t: number
): IVector3 {
  const t2 = t * t;
  const t3 = t2 * t;

  // Standard Catmull-Rom coefficients (tension α = 0.5)
  const c0 = -0.5 * t3 + t2 - 0.5 * t;
  const c1 = 1.5 * t3 - 2.5 * t2 + 1.0;
  const c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  const c3 = 0.5 * t3 - 0.5 * t2;

  return {
    x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
    y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
    z: c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z,
  };
}

// =============================================================================
// Hermite Interpolation
// =============================================================================

/**
 * Cubic Hermite spline — velocity-aware position interpolation.
 * Use when 2–3 states are available and velocity is known.
 * Produces C1-continuous curves that respect endpoint velocities.
 *
 * @param pos0  Starting position
 * @param vel0  Velocity at start (world units/second)
 * @param pos1  Ending position
 * @param vel1  Velocity at end (world units/second)
 * @param t     Interpolation factor [0, 1]
 * @param dt    Interval duration in seconds (scales velocity to position units)
 */
export function hermiteInterpolate(
  pos0: IVector3,
  vel0: IVector3,
  pos1: IVector3,
  vel1: IVector3,
  t: number,
  dt: number
): IVector3 {
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1; // starts 1, ends 0
  const h10 = t3 - 2 * t2 + t; // tangent at start
  const h01 = -2 * t3 + 3 * t2; // starts 0, ends 1
  const h11 = t3 - t2; // tangent at end

  return {
    x: h00 * pos0.x + h10 * vel0.x * dt + h01 * pos1.x + h11 * vel1.x * dt,
    y: h00 * pos0.y + h10 * vel0.y * dt + h01 * pos1.y + h11 * vel1.y * dt,
    z: h00 * pos0.z + h10 * vel0.z * dt + h01 * pos1.z + h11 * vel1.z * dt,
  };
}

// =============================================================================
// Cubic Bezier
// =============================================================================

/**
 * Cubic Bezier curve — used by CorrectionBlender for snap-free position fixes.
 * Choose c1 / c2 as forward-projected tangents from the current velocity:
 *   c1 = current + velocity * 0.3 * duration
 *   c2 = target  - velocity * 0.1 * duration
 *
 * @param p0  Start (current visual position)
 * @param c1  First control point (tangent out from p0)
 * @param c2  Second control point (tangent in to p3)
 * @param p3  End (authoritative target)
 * @param t   Parameter [0, 1]
 */
export function cubicBezier(
  p0: IVector3,
  c1: IVector3,
  c2: IVector3,
  p3: IVector3,
  t: number
): IVector3 {
  const inv = 1 - t;
  const inv2 = inv * inv;
  const t2 = t * t;
  const b0 = inv2 * inv;
  const b1 = 3 * inv2 * t;
  const b2 = 3 * inv * t2;
  const b3 = t * t2;

  return {
    x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p3.y,
    z: b0 * p0.z + b1 * c1.z + b2 * c2.z + b3 * p3.z,
  };
}
