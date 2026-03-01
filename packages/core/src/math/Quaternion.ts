/**
 * Quaternion.ts
 *
 * Unit-quaternion math for 3D rotations: construction from Euler angles
 * and axis-angle, spherical interpolation (SLERP), multiplication,
 * and conversion to column-major Matrix4 (Float64Array[16]).
 *
 * @module math
 */

// =============================================================================
// TYPE
// =============================================================================

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

// =============================================================================
// CONSTRUCTION
// =============================================================================

/** Identity quaternion (no rotation). */
export function identity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/**
 * Build a quaternion from Euler angles (radians).
 * Applies in intrinsic YXZ order (standard for first-person cameras).
 */
export function fromEuler(pitch: number, yaw: number, roll: number): Quat {
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
  const cy = Math.cos(yaw * 0.5),   sy = Math.sin(yaw * 0.5);
  const cr = Math.cos(roll * 0.5),  sr = Math.sin(roll * 0.5);

  return {
    x: sp * cy * cr + cp * sy * sr,
    y: cp * sy * cr - sp * cy * sr,
    z: cp * cy * sr - sp * sy * cr,
    w: cp * cy * cr + sp * sy * sr,
  };
}

/** Build a quaternion from axis (unit vec) and angle (radians). */
export function fromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
}

// =============================================================================
// OPERATIONS
// =============================================================================

/** Hamilton product: q1 * q2 (non-commutative). */
export function multiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Conjugate (inverse for unit quaternions). */
export function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Normalize to unit length. */
export function normalize(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-10) return identity();
  const inv = 1 / len;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
}

/** Dot product of two quaternions. */
export function dot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/**
 * Spherical Linear Interpolation.
 * Interpolates along the shortest arc. `t` in [0, 1].
 */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = dot(a, b);

  // Ensure shortest path
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (d < 0) {
    d = -d;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }

  // If very close, fall back to linear interpolation
  if (d > 0.9995) {
    return normalize({
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
      w: a.w + (bw - a.w) * t,
    });
  }

  const theta0 = Math.acos(d);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - d * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return {
    x: a.x * s0 + bx * s1,
    y: a.y * s0 + by * s1,
    z: a.z * s0 + bz * s1,
    w: a.w * s0 + bw * s1,
  };
}

/** Rotate a 3D vector by a unit quaternion. */
export function rotateVec3(q: Quat, vx: number, vy: number, vz: number): { x: number; y: number; z: number } {
  // q * v * q⁻¹  (optimized)
  const ix = q.w * vx + q.y * vz - q.z * vy;
  const iy = q.w * vy + q.z * vx - q.x * vz;
  const iz = q.w * vz + q.x * vy - q.y * vx;
  const iw = -q.x * vx - q.y * vy - q.z * vz;

  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

// =============================================================================
// CONVERSION
// =============================================================================

/** Convert unit quaternion to a 4×4 column-major rotation matrix (Float64Array[16]). */
export function toMatrix4(q: Quat): Float64Array {
  const m = new Float64Array(16);
  const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
  const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2;
  const yy = q.y * y2, yz = q.y * z2, zz = q.z * z2;
  const wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;

  m[0]  = 1 - (yy + zz); m[1]  = xy + wz;       m[2]  = xz - wy;       m[3]  = 0;
  m[4]  = xy - wz;       m[5]  = 1 - (xx + zz); m[6]  = yz + wx;       m[7]  = 0;
  m[8]  = xz + wy;       m[9]  = yz - wx;       m[10] = 1 - (xx + yy); m[11] = 0;
  m[12] = 0;              m[13] = 0;              m[14] = 0;              m[15] = 1;

  return m;
}

/** Extract Euler angles (radians) from a unit quaternion (YXZ order). */
export function toEuler(q: Quat): { pitch: number; yaw: number; roll: number } {
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const pitch = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const yaw = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);

  const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const roll = Math.atan2(siny_cosp, cosy_cosp);

  return { pitch, yaw, roll };
}

/** Compute the angle (radians) between two unit quaternions. */
export function angleBetween(a: Quat, b: Quat): number {
  const d = Math.abs(dot(a, b));
  return 2 * Math.acos(Math.min(d, 1));
}
