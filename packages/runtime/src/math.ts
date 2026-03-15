/**
 * @holoscript/runtime - Math Utilities
 *
 * Common math functions for 3D graphics and animation.
 */

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Inverse lerp - get t value from value between a and b
 */
export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return clamp((value - a) / (b - a), 0, 1);
}

/**
 * Remap value from one range to another
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

/**
 * Smooth step interpolation (smoother than lerp)
 */
export function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Smoother step interpolation
 */
export function smootherStep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Convert degrees to radians
 */
export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Get random number between min and max
 */
export function random(min = 0, max = 1): number {
  return min + Math.random() * (max - min);
}

/**
 * Get random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max + 1));
}

/**
 * Get random item from array
 */
export function randomItem<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[randomInt(0, array.length - 1)];
}

/**
 * Shuffle array in place
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Calculate distance between two 2D points
 */
export function distance2D(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate distance between two 3D points
 */
export function distance3D(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Normalize value to 0-1 range
 */
export function normalize(value: number, min: number, max: number): number {
  return (value - min) / (max - min);
}

/**
 * Wrap value to stay within range
 */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

/**
 * Ping pong value between 0 and length
 */
export function pingPong(t: number, length: number): number {
  if (length === 0) return 0;
  t = wrap(t, 0, length * 2);
  return length - Math.abs(t - length);
}

/**
 * Calculate angle between two 2D points in radians
 */
export function angle2D(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

/**
 * Check if value is approximately equal to target
 */
export function approximately(a: number, b: number, epsilon = 0.0001): number | boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Round to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Simple 1D noise function
 */
export function noise1D(x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = xf * xf * (3 - 2 * xf); // smoothstep

  // Simple hash function
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };

  return lerp(hash(xi), hash(xi + 1), u) * 2 - 1;
}

/**
 * Fractal Brownian Motion (fbm) - layered noise
 */
export function fbm(x: number, octaves = 4, lacunarity = 2, persistence = 0.5): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise1D(x * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

// Vec2 utilities
export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = {
  create: (x = 0, y = 0): Vec2 => ({ x, y }),
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s }),
  div: (a: Vec2, s: number): Vec2 => ({ x: a.x / s, y: a.y / s }),
  length: (a: Vec2): number => Math.sqrt(a.x * a.x + a.y * a.y),
  normalize: (a: Vec2): Vec2 => {
    const len = vec2.length(a);
    return len > 0 ? vec2.div(a, len) : { x: 0, y: 0 };
  },
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,
  lerp: (a: Vec2, b: Vec2, t: number): Vec2 => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  }),
};

// Vec3 utilities
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = {
  create: (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z }),
  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  mul: (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  div: (a: Vec3, s: number): Vec3 => ({ x: a.x / s, y: a.y / s, z: a.z / s }),
  length: (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
  normalize: (a: Vec3): Vec3 => {
    const len = vec3.length(a);
    return len > 0 ? vec3.div(a, len) : { x: 0, y: 0, z: 0 };
  },
  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }),
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  }),
};

export default {
  lerp,
  clamp,
  inverseLerp,
  remap,
  smoothStep,
  smootherStep,
  degToRad,
  radToDeg,
  random,
  randomInt,
  randomItem,
  shuffle,
  distance2D,
  distance3D,
  normalize,
  wrap,
  pingPong,
  angle2D,
  approximately,
  roundTo,
  noise1D,
  fbm,
  vec2,
  vec3,
};
