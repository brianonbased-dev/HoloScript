/**
 * Math utilities for HoloScript
 *
 * Vector math, quaternion operations, interpolation, and noise functions.
 */

import type { Vec2, Vec3, Quat, EulerAngles, AABB } from './types.js';
import { vec3, quat } from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const EPSILON = 1e-6;

// =============================================================================
// BASIC MATH
// =============================================================================

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  return (value - a) / (b - a);
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function fract(x: number): number {
  return x - Math.floor(x);
}

export function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

export function step(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}

// =============================================================================
// VEC2 OPERATIONS
// =============================================================================

export const vec2Math = {
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s }),
  div: (a: Vec2, s: number): Vec2 => ({ x: a.x / s, y: a.y / s }),
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  length: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),
  lengthSq: (v: Vec2): number => v.x * v.x + v.y * v.y,
  normalize: (v: Vec2): Vec2 => {
    const len = vec2Math.length(v);
    return len > 0 ? vec2Math.div(v, len) : { x: 0, y: 0 };
  },
  distance: (a: Vec2, b: Vec2): number => vec2Math.length(vec2Math.sub(a, b)),
  lerp: (a: Vec2, b: Vec2, t: number): Vec2 => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  }),
  rotate: (v: Vec2, angle: number): Vec2 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  },
  angle: (v: Vec2): number => Math.atan2(v.y, v.x),
  angleBetween: (a: Vec2, b: Vec2): number => {
    return Math.acos(clamp(vec2Math.dot(vec2Math.normalize(a), vec2Math.normalize(b)), -1, 1));
  },
};

// =============================================================================
// VEC3 OPERATIONS
// =============================================================================

export const vec3Math = {
  zero: (): Vec3 => vec3(0, 0, 0),
  one: (): Vec3 => vec3(1, 1, 1),
  up: (): Vec3 => vec3(0, 1, 0),
  down: (): Vec3 => vec3(0, -1, 0),
  forward: (): Vec3 => vec3(0, 0, -1),
  back: (): Vec3 => vec3(0, 0, 1),
  left: (): Vec3 => vec3(-1, 0, 0),
  right: (): Vec3 => vec3(1, 0, 0),

  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  mul: (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  div: (a: Vec3, s: number): Vec3 => ({ x: a.x / s, y: a.y / s, z: a.z / s }),
  mulVec: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z }),

  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,

  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),

  length: (v: Vec3): number => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
  lengthSq: (v: Vec3): number => v.x * v.x + v.y * v.y + v.z * v.z,

  normalize: (v: Vec3): Vec3 => {
    const len = vec3Math.length(v);
    return len > EPSILON ? vec3Math.div(v, len) : vec3(0, 0, 0);
  },

  distance: (a: Vec3, b: Vec3): number => vec3Math.length(vec3Math.sub(a, b)),
  distanceSq: (a: Vec3, b: Vec3): number => vec3Math.lengthSq(vec3Math.sub(a, b)),

  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  }),

  slerp: (a: Vec3, b: Vec3, t: number): Vec3 => {
    const dot = clamp(vec3Math.dot(a, b), -1, 1);
    const theta = Math.acos(dot) * t;
    const relative = vec3Math.normalize(vec3Math.sub(b, vec3Math.mul(a, dot)));
    return vec3Math.add(vec3Math.mul(a, Math.cos(theta)), vec3Math.mul(relative, Math.sin(theta)));
  },

  negate: (v: Vec3): Vec3 => ({ x: -v.x, y: -v.y, z: -v.z }),

  abs: (v: Vec3): Vec3 => ({ x: Math.abs(v.x), y: Math.abs(v.y), z: Math.abs(v.z) }),

  min: (a: Vec3, b: Vec3): Vec3 => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    z: Math.min(a.z, b.z),
  }),

  max: (a: Vec3, b: Vec3): Vec3 => ({
    x: Math.max(a.x, b.x),
    y: Math.max(a.y, b.y),
    z: Math.max(a.z, b.z),
  }),

  clamp: (v: Vec3, min: Vec3, max: Vec3): Vec3 => ({
    x: clamp(v.x, min.x, max.x),
    y: clamp(v.y, min.y, max.y),
    z: clamp(v.z, min.z, max.z),
  }),

  floor: (v: Vec3): Vec3 => ({
    x: Math.floor(v.x),
    y: Math.floor(v.y),
    z: Math.floor(v.z),
  }),

  ceil: (v: Vec3): Vec3 => ({
    x: Math.ceil(v.x),
    y: Math.ceil(v.y),
    z: Math.ceil(v.z),
  }),

  round: (v: Vec3): Vec3 => ({
    x: Math.round(v.x),
    y: Math.round(v.y),
    z: Math.round(v.z),
  }),

  reflect: (v: Vec3, normal: Vec3): Vec3 => {
    const dot = vec3Math.dot(v, normal);
    return vec3Math.sub(v, vec3Math.mul(normal, 2 * dot));
  },

  project: (v: Vec3, onto: Vec3): Vec3 => {
    const dot = vec3Math.dot(v, onto);
    const lenSq = vec3Math.lengthSq(onto);
    return vec3Math.mul(onto, dot / lenSq);
  },

  angle: (a: Vec3, b: Vec3): number => {
    const dot = vec3Math.dot(vec3Math.normalize(a), vec3Math.normalize(b));
    return Math.acos(clamp(dot, -1, 1));
  },

  equals: (a: Vec3, b: Vec3, epsilon: number = EPSILON): boolean => {
    return (
      Math.abs(a.x - b.x) < epsilon &&
      Math.abs(a.y - b.y) < epsilon &&
      Math.abs(a.z - b.z) < epsilon
    );
  },
};

// =============================================================================
// QUATERNION OPERATIONS
// =============================================================================

export const quatMath = {
  identity: (): Quat => quat(0, 0, 0, 1),

  fromAxisAngle: (axis: Vec3, angle: number): Quat => {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    const normalized = vec3Math.normalize(axis);
    return {
      x: normalized.x * s,
      y: normalized.y * s,
      z: normalized.z * s,
      w: Math.cos(halfAngle),
    };
  },

  fromEuler: (euler: EulerAngles): Quat => {
    const { x, y, z } = euler;
    const c1 = Math.cos(degToRad(x) / 2);
    const c2 = Math.cos(degToRad(y) / 2);
    const c3 = Math.cos(degToRad(z) / 2);
    const s1 = Math.sin(degToRad(x) / 2);
    const s2 = Math.sin(degToRad(y) / 2);
    const s3 = Math.sin(degToRad(z) / 2);

    return {
      x: s1 * c2 * c3 + c1 * s2 * s3,
      y: c1 * s2 * c3 - s1 * c2 * s3,
      z: c1 * c2 * s3 + s1 * s2 * c3,
      w: c1 * c2 * c3 - s1 * s2 * s3,
    };
  },

  toEuler: (q: Quat): EulerAngles => {
    const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
    const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    const x = Math.atan2(sinr_cosp, cosr_cosp);

    const sinp = 2 * (q.w * q.y - q.z * q.x);
    let y: number;
    if (Math.abs(sinp) >= 1) {
      y = (Math.PI / 2) * Math.sign(sinp);
    } else {
      y = Math.asin(sinp);
    }

    const siny_cosp = 2 * (q.w * q.z + q.x * q.y);
    const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
    const z = Math.atan2(siny_cosp, cosy_cosp);

    return {
      x: radToDeg(x),
      y: radToDeg(y),
      z: radToDeg(z),
    };
  },

  multiply: (a: Quat, b: Quat): Quat => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  }),

  conjugate: (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w }),

  inverse: (q: Quat): Quat => {
    const lenSq = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
    return {
      x: -q.x / lenSq,
      y: -q.y / lenSq,
      z: -q.z / lenSq,
      w: q.w / lenSq,
    };
  },

  normalize: (q: Quat): Quat => {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
  },

  dot: (a: Quat, b: Quat): number => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w,

  slerp: (a: Quat, b: Quat, t: number): Quat => {
    let dot = quatMath.dot(a, b);

    // If dot is negative, negate one quaternion to take shorter path
    let bAdjusted = b;
    if (dot < 0) {
      bAdjusted = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
      dot = -dot;
    }

    if (dot > 0.9995) {
      // Linear interpolation for very close quaternions
      return quatMath.normalize({
        x: lerp(a.x, bAdjusted.x, t),
        y: lerp(a.y, bAdjusted.y, t),
        z: lerp(a.z, bAdjusted.z, t),
        w: lerp(a.w, bAdjusted.w, t),
      });
    }

    const theta0 = Math.acos(dot);
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);

    const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    return {
      x: a.x * s0 + bAdjusted.x * s1,
      y: a.y * s0 + bAdjusted.y * s1,
      z: a.z * s0 + bAdjusted.z * s1,
      w: a.w * s0 + bAdjusted.w * s1,
    };
  },

  rotateVec3: (q: Quat, v: Vec3): Vec3 => {
    const qv = { x: q.x, y: q.y, z: q.z };
    const uv = vec3Math.cross(qv, v);
    const uuv = vec3Math.cross(qv, uv);
    return vec3Math.add(v, vec3Math.add(vec3Math.mul(uv, 2 * q.w), vec3Math.mul(uuv, 2)));
  },

  lookAt: (forward: Vec3, up: Vec3 = vec3(0, 1, 0)): Quat => {
    const f = vec3Math.normalize(forward);
    const r = vec3Math.normalize(vec3Math.cross(up, f));
    const u = vec3Math.cross(f, r);

    const trace = r.x + u.y + f.z;
    let q: Quat;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      q = {
        w: 0.25 / s,
        x: (u.z - f.y) * s,
        y: (f.x - r.z) * s,
        z: (r.y - u.x) * s,
      };
    } else if (r.x > u.y && r.x > f.z) {
      const s = 2 * Math.sqrt(1 + r.x - u.y - f.z);
      q = {
        w: (u.z - f.y) / s,
        x: 0.25 * s,
        y: (u.x + r.y) / s,
        z: (f.x + r.z) / s,
      };
    } else if (u.y > f.z) {
      const s = 2 * Math.sqrt(1 + u.y - r.x - f.z);
      q = {
        w: (f.x - r.z) / s,
        x: (u.x + r.y) / s,
        y: 0.25 * s,
        z: (f.y + u.z) / s,
      };
    } else {
      const s = 2 * Math.sqrt(1 + f.z - r.x - u.y);
      q = {
        w: (r.y - u.x) / s,
        x: (f.x + r.z) / s,
        y: (f.y + u.z) / s,
        z: 0.25 * s,
      };
    }

    return quatMath.normalize(q);
  },
};

// =============================================================================
// AABB OPERATIONS
// =============================================================================

export const aabbMath = {
  contains: (aabb: AABB, point: Vec3): boolean => {
    return (
      point.x >= aabb.min.x &&
      point.x <= aabb.max.x &&
      point.y >= aabb.min.y &&
      point.y <= aabb.max.y &&
      point.z >= aabb.min.z &&
      point.z <= aabb.max.z
    );
  },

  intersects: (a: AABB, b: AABB): boolean => {
    return (
      a.min.x <= b.max.x &&
      a.max.x >= b.min.x &&
      a.min.y <= b.max.y &&
      a.max.y >= b.min.y &&
      a.min.z <= b.max.z &&
      a.max.z >= b.min.z
    );
  },

  center: (aabb: AABB): Vec3 => vec3Math.mul(vec3Math.add(aabb.min, aabb.max), 0.5),

  size: (aabb: AABB): Vec3 => vec3Math.sub(aabb.max, aabb.min),

  expand: (aabb: AABB, point: Vec3): AABB => ({
    min: vec3Math.min(aabb.min, point),
    max: vec3Math.max(aabb.max, point),
  }),

  merge: (a: AABB, b: AABB): AABB => ({
    min: vec3Math.min(a.min, b.min),
    max: vec3Math.max(a.max, b.max),
  }),
};

// =============================================================================
// NOISE FUNCTIONS
// =============================================================================

// Simple permutation table for noise
const perm = new Uint8Array(512);
for (let i = 0; i < 256; i++) perm[i] = perm[i + 256] = i;
for (let i = 255; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [perm[i], perm[j]] = [perm[j], perm[i]];
  perm[i + 256] = perm[i];
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export const noise = {
  /**
   * 3D Perlin noise (-1 to 1)
   */
  perlin3d: (x: number, y: number, z: number): number => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const A = perm[X] + Y;
    const AA = perm[A] + Z;
    const AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y;
    const BA = perm[B] + Z;
    const BB = perm[B + 1] + Z;

    return lerp(
      lerp(
        lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
        lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  },

  /**
   * 2D Perlin noise (-1 to 1)
   */
  perlin2d: (x: number, y: number): number => {
    return noise.perlin3d(x, y, 0);
  },

  /**
   * Fractal Brownian Motion (fBm)
   */
  fbm: (
    x: number,
    y: number,
    z: number,
    octaves: number = 6,
    lacunarity: number = 2,
    gain: number = 0.5
  ): number => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * noise.perlin3d(x * frequency, y * frequency, z * frequency);
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxValue;
  },

  /**
   * Simplex-like noise (approximation using perlin)
   */
  simplex: (x: number, y: number): number => {
    return noise.perlin2d(x * 1.2, y * 1.2);
  },

  /**
   * Worley/Cellular noise
   */
  worley: (x: number, y: number, z: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);

    let minDist = Infinity;

    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let k = -1; k <= 1; k++) {
          const cellX = xi + i;
          const cellY = yi + j;
          const cellZ = zi + k;

          // Pseudo-random point in cell
          const hash = perm[(perm[(perm[cellX & 255] + cellY) & 255] + cellZ) & 255];
          const px = cellX + hash / 255;
          const py = cellY + ((hash * 7) % 255) / 255;
          const pz = cellZ + ((hash * 13) % 255) / 255;

          const dist = (x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz);
          minDist = Math.min(minDist, dist);
        }
      }
    }

    return Math.sqrt(minDist);
  },
};

// =============================================================================
// RANDOM
// =============================================================================

export const random = {
  /**
   * Random float between 0 and 1
   */
  float: (): number => Math.random(),

  /**
   * Random float in range [min, max)
   */
  range: (min: number, max: number): number => min + Math.random() * (max - min),

  /**
   * Random integer in range [min, max]
   */
  int: (min: number, max: number): number => Math.floor(min + Math.random() * (max - min + 1)),

  /**
   * Random boolean with probability
   */
  bool: (probability: number = 0.5): boolean => Math.random() < probability,

  /**
   * Random element from array
   */
  pick: <T>(array: T[]): T => array[Math.floor(Math.random() * array.length)],

  /**
   * Shuffle array (Fisher-Yates)
   */
  shuffle: <T>(array: T[]): T[] => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },

  /**
   * Random Vec3 in unit sphere
   */
  insideUnitSphere: (): Vec3 => {
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.cbrt(Math.random());
    return {
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
    };
  },

  /**
   * Random Vec3 on unit sphere surface
   */
  onUnitSphere: (): Vec3 => {
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    return {
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.sin(phi) * Math.sin(theta),
      z: Math.cos(phi),
    };
  },

  /**
   * Random Vec2 in unit circle
   */
  insideUnitCircle: (): Vec2 => {
    const theta = Math.random() * TAU;
    const r = Math.sqrt(Math.random());
    return {
      x: r * Math.cos(theta),
      y: r * Math.sin(theta),
    };
  },

  /**
   * Seeded random number generator
   */
  seeded: (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  },
};
