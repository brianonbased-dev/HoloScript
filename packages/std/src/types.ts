/**
 * Core Types for HoloScript
 *
 * Fundamental spatial and graphical types used throughout the language.
 */

// =============================================================================
// VECTOR TYPES
// =============================================================================

/**
 * 2D Vector
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 3D Vector - The fundamental spatial type
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 4D Vector
 */
export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

// Array representations
export type Vec2Array = [number, number];
export type Vec3Array = [number, number, number];
export type Vec4Array = [number, number, number, number];

// =============================================================================
// QUATERNION
// =============================================================================

/**
 * Quaternion for rotation representation
 */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type QuatArray = [number, number, number, number];

// =============================================================================
// TRANSFORM
// =============================================================================

/**
 * Complete 3D transform
 */
export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/**
 * Euler angles (in degrees)
 */
export interface EulerAngles {
  x: number; // pitch
  y: number; // yaw
  z: number; // roll
}

// =============================================================================
// COLOR
// =============================================================================

/**
 * RGB Color (0-1 range)
 */
export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

/**
 * RGBA Color (0-1 range)
 */
export interface ColorRGBA extends ColorRGB {
  a: number;
}

/**
 * HSL Color
 */
export interface ColorHSL {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

/**
 * Color can be represented multiple ways
 */
export type Color = string | ColorRGB | ColorRGBA | ColorHSL | number;

// =============================================================================
// BOUNDS
// =============================================================================

/**
 * Axis-Aligned Bounding Box
 */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

/**
 * Bounding Sphere
 */
export interface BoundingSphere {
  center: Vec3;
  radius: number;
}

// =============================================================================
// RAY
// =============================================================================

/**
 * Ray for raycasting
 */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/**
 * Raycast hit result
 */
export interface RaycastHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
  objectId?: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Nullable type helper
 */
export type Nullable<T> = T | null;

/**
 * Optional type helper
 */
export type Optional<T> = T | undefined;

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a Vec2
 */
export function vec2(x: number = 0, y: number = 0): Vec2 {
  return { x, y };
}

/**
 * Create a Vec3
 */
export function vec3(x: number = 0, y: number = 0, z: number = 0): Vec3 {
  return { x, y, z };
}

/**
 * Create a Vec4
 */
export function vec4(x: number = 0, y: number = 0, z: number = 0, w: number = 0): Vec4 {
  return { x, y, z, w };
}

/**
 * Create a Quaternion (identity by default)
 */
export function quat(x: number = 0, y: number = 0, z: number = 0, w: number = 1): Quat {
  return { x, y, z, w };
}

/**
 * Create a Transform
 */
export function transform(
  position: Vec3 = vec3(),
  rotation: Quat = quat(),
  scale: Vec3 = vec3(1, 1, 1)
): Transform {
  return { position, rotation, scale };
}

/**
 * Create an RGB color
 */
export function rgb(r: number, g: number, b: number): ColorRGB {
  return { r, g, b };
}

/**
 * Create an RGBA color
 */
export function rgba(r: number, g: number, b: number, a: number = 1): ColorRGBA {
  return { r, g, b, a };
}

/**
 * Create an HSL color
 */
export function hsl(h: number, s: number, l: number): ColorHSL {
  return { h, s, l };
}

/**
 * Create an AABB
 */
export function aabb(min: Vec3 = vec3(), max: Vec3 = vec3()): AABB {
  return { min, max };
}

/**
 * Create a Ray
 */
export function ray(origin: Vec3, direction: Vec3): Ray {
  return { origin, direction };
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert Vec3 to array
 */
export function vec3ToArray(v: Vec3): Vec3Array {
  return [v.x, v.y, v.z];
}

/**
 * Convert array to Vec3
 */
export function arrayToVec3(arr: Vec3Array | number[]): Vec3 {
  return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0 };
}

/**
 * Convert Quat to array
 */
export function quatToArray(q: Quat): QuatArray {
  return [q.x, q.y, q.z, q.w];
}

/**
 * Convert array to Quat
 */
export function arrayToQuat(arr: QuatArray | number[]): Quat {
  return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0, w: arr[3] ?? 1 };
}

/**
 * Parse color from various formats
 */
export function parseColor(color: Color): ColorRGBA {
  if (typeof color === 'string') {
    // Hex color
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16) / 255,
          g: parseInt(hex[1] + hex[1], 16) / 255,
          b: parseInt(hex[2] + hex[2], 16) / 255,
          a: 1,
        };
      } else if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16) / 255,
          g: parseInt(hex.slice(2, 4), 16) / 255,
          b: parseInt(hex.slice(4, 6), 16) / 255,
          a: 1,
        };
      } else if (hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16) / 255,
          g: parseInt(hex.slice(2, 4), 16) / 255,
          b: parseInt(hex.slice(4, 6), 16) / 255,
          a: parseInt(hex.slice(6, 8), 16) / 255,
        };
      }
    }
    // Named colors (basic support)
    const namedColors: Record<string, ColorRGBA> = {
      white: { r: 1, g: 1, b: 1, a: 1 },
      black: { r: 0, g: 0, b: 0, a: 1 },
      red: { r: 1, g: 0, b: 0, a: 1 },
      green: { r: 0, g: 1, b: 0, a: 1 },
      blue: { r: 0, g: 0, b: 1, a: 1 },
      yellow: { r: 1, g: 1, b: 0, a: 1 },
      cyan: { r: 0, g: 1, b: 1, a: 1 },
      magenta: { r: 1, g: 0, b: 1, a: 1 },
    };
    return namedColors[color.toLowerCase()] || { r: 1, g: 1, b: 1, a: 1 };
  }

  if (typeof color === 'number') {
    // Integer color (0xRRGGBB)
    return {
      r: ((color >> 16) & 0xff) / 255,
      g: ((color >> 8) & 0xff) / 255,
      b: (color & 0xff) / 255,
      a: 1,
    };
  }

  if ('h' in color) {
    // HSL to RGB conversion
    const { h, s, l } = color;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;

    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    return { r: r + m, g: g + m, b: b + m, a: 1 };
  }

  if ('a' in color) {
    return color;
  }

  return { ...color, a: 1 };
}

/**
 * Color to hex string
 */
export function colorToHex(color: ColorRGB | ColorRGBA): string {
  const r = Math.round(color.r * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(color.g * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(color.b * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

// =============================================================================
// TRAIT DEFINITIONS
// =============================================================================

export interface TraitDefinition {
  name: string;
  description?: string;
  type?: string;
  params?: Record<string, any>;
  parameters?: Record<string, any>;
  validator?: (params: Record<string, any>) => boolean;
  validation?: any;
}
