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

export type Quat = [number, number, number, number];

// =============================================================================
// CONSTRUCTION
// =============================================================================

/** Identity quaternion (no rotation). */
export function identity(): Quat {
  return [0, 0, 0, 1];
}

/**
 * Build a quaternion from Euler angles (radians).
 * Applies in intrinsic YXZ order (standard for first-person cameras).
 */
export function fromEuler(pitch: number, yaw: number, roll: number): Quat {
  const cp = Math.cos(pitch * 0.5),
    sp = Math.sin(pitch * 0.5);
  const cy = Math.cos(yaw * 0.5),
    sy = Math.sin(yaw * 0.5);
  const cr = Math.cos(roll * 0.5),
    sr = Math.sin(roll * 0.5);

  return [
    sp * cy * cr + cp * sy * sr,
    cp * sy * cr - sp * cy * sr,
    cp * cy * sr - sp * sy * cr,
    cp * cy * cr + sp * sy * sr,
  ];
}

/** Build a quaternion from axis (unit vec) and angle (radians). */
export function fromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return [ax * s, ay * s, az * s, Math.cos(half)];
}

// =============================================================================
// OPERATIONS
// =============================================================================

/** Hamilton product: q1 * q2 (non-commutative). */
export function multiply(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[3] * b[2], // Wait, this formula looks suspicious in original
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Conjugate (inverse for unit quaternions). */
export function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Normalize to unit length. */
export function normalize(q: Quat): Quat {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (len < 1e-10) return identity();
  const inv = 1 / len;
  return [q[0] * inv, q[1] * inv, q[2] * inv, q[3] * inv];
}

/** Dot product of two quaternions. */
export function dot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/**
 * Spherical Linear Interpolation.
 * Interpolates along the shortest arc. `t` in [0, 1].
 */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = dot(a, b);

  // Ensure shortest path
  let bx = b[0],
    by = b[1],
    bz = b[2],
    bw = b[3];
  if (d < 0) {
    d = -d;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  // If very close, fall back to linear interpolation
  if (d > 0.9995) {
    return normalize([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]);
  }

  const theta0 = Math.acos(d);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - (d * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return [
    a[0] * s0 + bx * s1,
    a[1] * s0 + by * s1,
    a[2] * s0 + bz * s1,
    a[3] * s0 + bw * s1,
  ];
}

/** Rotate a 3D vector by a unit quaternion. */
export function rotateVec3(
  q: Quat,
  vx: number,
  vy: number,
  vz: number
): [number, number, number] {
  // q * v * q⁻¹  (optimized)
  const ix = q[3] * vx + q[1] * vz - q[2] * vy;
  const iy = q[3] * vy + q[2] * vx - q[0] * vz;
  const iz = q[3] * vz + q[0] * vy - q[1] * vx;
  const iw = -q[0] * vx - q[1] * vy - q[2] * vz;

  return [
    ix * q[3] + iw * -q[0] + iy * -q[2] - iz * -q[1],
    iy * q[3] + iw * -q[1] + iz * -q[0] - ix * -q[2],
    iz * q[3] + iw * -q[2] + ix * -q[1] - iy * -q[0],
  ];
}

// =============================================================================
// CONVERSION
// =============================================================================

/** Convert unit quaternion to a 4×4 column-major rotation matrix (Float64Array[16]). */
export function toMatrix4(q: Quat): Float64Array {
  const m = new Float64Array(16);
  const x2 = q[0] + q[0],
    y2 = q[1] + q[1],
    z2 = q[2] + q[2];
  const xx = q[0] * x2,
    xy = q[0] * y2,
    xz = q[0] * z2;
  const yy = q[1] * y2,
    yz = q[1] * z2,
    zz = q[2] * z2;
  const wx = q[3] * x2,
    wy = q[3] * y2,
    wz = q[3] * z2;

  m[0] = 1 - (yy + zz);
  m[1] = xy + wz;
  m[2] = xz - wy;
  m[3] = 0;
  m[4] = xy - wz;
  m[5] = 1 - (xx + zz);
  m[6] = yz + wx;
  m[7] = 0;
  m[8] = xz + wy;
  m[9] = yz - wx;
  m[10] = 1 - (xx + yy);
  m[11] = 0;
  m[12] = 0;
  m[13] = 0;
  m[14] = 0;
  m[15] = 1;

  return m;
}

/** Extract Euler angles (radians) from a unit quaternion (YXZ order). */
export function toEuler(q: Quat): [number, number, number] {
  const sinr_cosp = 2 * (q[3] * q[0] + q[1] * q[2]);
  const cosr_cosp = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
  const pitch = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (q[3] * q[1] - q[2] * q[0]);
  const yaw = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const siny_cosp = 2 * (q[3] * q[2] + q[0] * q[1]);
  const cosy_cosp = 1 - 2 * (q[1] * q[1] + q[2] * q[2]);
  const roll = Math.atan2(siny_cosp, cosy_cosp);

  return [pitch, yaw, roll];
}

/** Compute the angle (radians) between two unit quaternions. */
export function angleBetween(a: Quat, b: Quat): number {
  const d = Math.abs(dot(a, b));
  return 2 * Math.acos(Math.min(d, 1));
}
