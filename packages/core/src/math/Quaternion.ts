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
  [index: number]: number;
}

type QuatLike = Quat | [number, number, number, number];

function qx(q: QuatLike): number { return (q as Quat).x ?? (q as [number, number, number, number])[0] ?? 0; }
function qy(q: QuatLike): number { return (q as Quat).y ?? (q as [number, number, number, number])[1] ?? 0; }
function qz(q: QuatLike): number { return (q as Quat).z ?? (q as [number, number, number, number])[2] ?? 0; }
function qw(q: QuatLike): number { return (q as Quat).w ?? (q as [number, number, number, number])[3] ?? 1; }

function asQuat(x: number, y: number, z: number, w: number): Quat {
  const q = { x, y, z, w } as Quat;
  Object.defineProperty(q, '0', { value: x, enumerable: false });
  Object.defineProperty(q, '1', { value: y, enumerable: false });
  Object.defineProperty(q, '2', { value: z, enumerable: false });
  Object.defineProperty(q, '3', { value: w, enumerable: false });
  return q;
}

// =============================================================================
// CONSTRUCTION
// =============================================================================

/** Identity quaternion (no rotation). */
export function identity(): Quat {
  return asQuat(0, 0, 0, 1);
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

  return asQuat(
    sp * cy * cr + cp * sy * sr,
    cp * sy * cr - sp * cy * sr,
    cp * cy * sr - sp * sy * cr,
    cp * cy * cr + sp * sy * sr
  );
}

/** Build a quaternion from axis (unit vec) and angle (radians). */
export function fromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return asQuat(ax * s, ay * s, az * s, Math.cos(half));
}

// =============================================================================
// OPERATIONS
// =============================================================================

/** Hamilton product: q1 * q2 (non-commutative). */
export function multiply(a: QuatLike, b: QuatLike): Quat {
  const ax = qx(a), ay = qy(a), az = qz(a), aw = qw(a);
  const bx = qx(b), by = qy(b), bz = qz(b), bw = qw(b);
  return asQuat(
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  );
}

/** Conjugate (inverse for unit quaternions). */
export function conjugate(q: QuatLike): Quat {
  return asQuat(-qx(q), -qy(q), -qz(q), qw(q));
}

/** Normalize to unit length. */
export function normalize(q: QuatLike): Quat {
  const x = qx(q), y = qy(q), z = qz(q), w = qw(q);
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (len < 1e-10) return identity();
  const inv = 1 / len;
  return asQuat(x * inv, y * inv, z * inv, w * inv);
}

/** Dot product of two quaternions. */
export function dot(a: QuatLike, b: QuatLike): number {
  return qx(a) * qx(b) + qy(a) * qy(b) + qz(a) * qz(b) + qw(a) * qw(b);
}

/**
 * Spherical Linear Interpolation.
 * Interpolates along the shortest arc. `t` in [0, 1].
 */
export function slerp(a: QuatLike, b: QuatLike, t: number): Quat {
  let d = dot(a, b);

  // Ensure shortest path
  let bx = qx(b),
    by = qy(b),
    bz = qz(b),
    bw = qw(b);
  if (d < 0) {
    d = -d;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  // If very close, fall back to linear interpolation
  if (d > 0.9995) {
    return normalize(asQuat(
      qx(a) + (bx - qx(a)) * t,
      qy(a) + (by - qy(a)) * t,
      qz(a) + (bz - qz(a)) * t,
      qw(a) + (bw - qw(a)) * t
    ));
  }

  const theta0 = Math.acos(d);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s0 = Math.cos(theta) - (d * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return asQuat(
    qx(a) * s0 + bx * s1,
    qy(a) * s0 + by * s1,
    qz(a) * s0 + bz * s1,
    qw(a) * s0 + bw * s1
  );
}

/** Rotate a 3D vector by a unit quaternion. */
export function rotateVec3(
  q: QuatLike,
  vx: number,
  vy: number,
  vz: number
): { x: number; y: number; z: number; [index: number]: number } {
  const x = qx(q), y = qy(q), z = qz(q), w = qw(q);
  // q * v * q⁻¹  (optimized)
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;

  const rx = ix * w + iw * -x + iy * -z - iz * -y;
  const ry = iy * w + iw * -y + iz * -x - ix * -z;
  const rz = iz * w + iw * -z + ix * -y - iy * -x;
  const v = { x: rx, y: ry, z: rz } as { x: number; y: number; z: number; [index: number]: number };
  Object.defineProperty(v, '0', { value: rx, enumerable: false });
  Object.defineProperty(v, '1', { value: ry, enumerable: false });
  Object.defineProperty(v, '2', { value: rz, enumerable: false });
  return v;
}

// =============================================================================
// CONVERSION
// =============================================================================

/** Convert unit quaternion to a 4×4 column-major rotation matrix (Float64Array[16]). */
export function toMatrix4(q: QuatLike): Float64Array {
  const m = new Float64Array(16);
  const x = qx(q), y = qy(q), z = qz(q), w = qw(q);
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;

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
export function toEuler(q: QuatLike): { pitch: number; yaw: number; roll: number; [index: number]: number } {
  const x = qx(q), y = qy(q), z = qz(q), w = qw(q);
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const pitch = Math.atan2(sinr_cosp, cosr_cosp);

  const sinp = 2 * (w * y - z * x);
  const yaw = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const roll = Math.atan2(siny_cosp, cosy_cosp);

  const e = { pitch, yaw, roll } as { pitch: number; yaw: number; roll: number; [index: number]: number };
  Object.defineProperty(e, '0', { value: pitch, enumerable: false });
  Object.defineProperty(e, '1', { value: yaw, enumerable: false });
  Object.defineProperty(e, '2', { value: roll, enumerable: false });
  return e;
}

/** Compute the angle (radians) between two unit quaternions. */
export function angleBetween(a: QuatLike, b: QuatLike): number {
  const d = Math.abs(dot(a, b));
  return 2 * Math.acos(Math.min(d, 1));
}
