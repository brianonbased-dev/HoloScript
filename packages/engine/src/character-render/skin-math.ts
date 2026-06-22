/**
 * skin-math — minimal column-major 4x4 matrix helpers for the native character
 * render path. Pure math, zero GPU, zero foreign-engine deps — headless-testable.
 *
 * Column-major convention matches the rest of the native render path
 * (`native-render/draw-spec.ts` composeTRS, `native-render/scene-render.ts` mul4):
 * element (row r, col c) is stored at index c*4 + r; translation lives in m[12..14].
 *
 * @module character-render
 */

export type Mat4 = Float32Array;
export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export const IDENTITY4: () => Mat4 = () =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Column-major multiply: out = a * b. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/** Chain-multiply left→right: out = m0 * m1 * … * mn. */
export function multiplyAll(...mats: Mat4[]): Mat4 {
  let acc = IDENTITY4();
  for (const m of mats) acc = multiply(acc, m);
  return acc;
}

export function fromTranslation(x: number, y: number, z: number): Mat4 {
  const m = IDENTITY4();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/** Rotation matrix from a unit quaternion (column-major). */
export function fromQuat(q: Quat): Mat4 {
  const { x, y, z, w } = q;
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
  const m = IDENTITY4();
  m[0] = 1 - (yy + zz);
  m[1] = xy + wz;
  m[2] = xz - wy;
  m[4] = xy - wz;
  m[5] = 1 - (xx + zz);
  m[6] = yz + wx;
  m[8] = xz + wy;
  m[9] = yz - wx;
  m[10] = 1 - (xx + yy);
  return m;
}

/** Compose translation · rotation (T * R). */
export function fromRotationTranslation(q: Quat, t: Vec3): Mat4 {
  return multiply(fromTranslation(t.x, t.y, t.z), fromQuat(q));
}

/** Unit quaternion from axis (need not be normalized) + angle (radians). */
export function quatFromAxisAngle(ax: number, ay: number, az: number, rad: number): Quat {
  const len = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin(rad / 2);
  return { x: (ax / len) * s, y: (ay / len) * s, z: (az / len) * s, w: Math.cos(rad / 2) };
}

export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Hamilton product a·b (apply b, then a — same convention as matrix multiply). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Transform a point (w=1) by a column-major matrix. */
export function transformPoint(m: Mat4, x: number, y: number, z: number): Vec3 {
  return {
    x: m[0] * x + m[4] * y + m[8] * z + m[12],
    y: m[1] * x + m[5] * y + m[9] * z + m[13],
    z: m[2] * x + m[6] * y + m[10] * z + m[14],
  };
}

/** Translation component of a column-major matrix. */
export function getTranslation(m: Mat4): Vec3 {
  return { x: m[12], y: m[13], z: m[14] };
}

/** Full 4x4 inverse (gl-matrix adjugate method). Returns identity if singular. */
export function invert(a: Mat4): Mat4 {
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3];
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7];
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11];
  const a30 = a[12],
    a31 = a[13],
    a32 = a[14],
    a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return IDENTITY4();
  det = 1.0 / det;

  const o = new Float32Array(16);
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
