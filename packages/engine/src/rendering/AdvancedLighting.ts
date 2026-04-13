/**
 * AdvancedLighting.ts
 *
 * Advanced light types beyond point / directional / spot:
 *   - Area lights: rectangle, disk, tube (LTC approximation)
 *   - IES light profiles (photometric, from .ies tabular data)
 *   - Emissive mesh lights
 *   - Light cookies (projected texture masks)
 *   - Caustic intensity configuration
 *
 * All calculations are CPU-side (uniform / config helpers).
 * No WebGPU — fully testable in Vitest.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };

export type AreaLightShape = 'rectangle' | 'disk' | 'tube';
export type LightType = 'point' | 'spot' | 'directional' | 'area' | 'ies' | 'emissive_mesh';

export interface AreaLightConfig {
  shape: AreaLightShape;
  /** Half-extents for rectangle [w, h], radius for disk, [r, length] for tube */
  size: Vec2;
  /** Two-sided emission */
  twoSided: boolean;
}

export interface IESProfile {
  id: string;
  /** Vertical angles (0–180°) */
  verticalAngles: number[];
  /** Horizontal angles (0–360°) */
  horizontalAngles: number[];
  /** Candela values [horizontal][vertical] */
  candela: number[][];
  /** Maximum candela (for normalisation) */
  maxCandela: number;
}

export interface LightCookie {
  /** Cookie texture width */
  width: number;
  /** Cookie texture height */
  height: number;
  /** RGBA pixel data (Float32Array, linear) */
  pixels: Float32Array;
}

export interface CausticConfig {
  intensity: number;
  sampleCount: number;
  animationSpeed: number; // UV scroll speed
}

export interface AdvancedLight {
  id: string;
  type: LightType;
  position: Vec3;
  direction: Vec3;
  color: [number, number, number];
  intensity: number;
  range: number;
  enabled: boolean;

  // Optional per-type configs
  area?: AreaLightConfig;
  ies?: IESProfile;
  cookie?: LightCookie;
  caustic?: CausticConfig;
  /** Mesh geometry ID for emissive mesh lights */
  meshId?: string;
}

// =============================================================================
// IES PROFILE
// =============================================================================

/**
 * Parse a simplified IES LM-63 candela table.
 * Expects lines: "vertical_angles\nhorizontal_angles\ncandela_values..."
 *
 * For production use this would parse the full IES spec; here we handle
 * the minimal tabular data format used in tests.
 */
export function parseIESProfile(
  id: string,
  vertAngles: number[],
  horizAngles: number[],
  candela: number[][]
): IESProfile {
  let maxCandela = 0;
  for (const row of candela) {
    for (const v of row) if (v > maxCandela) maxCandela = v;
  }
  return { id, verticalAngles: vertAngles, horizontalAngles: horizAngles, candela, maxCandela };
}

/**
 * Sample an IES profile for a given vertical + horizontal angle (degrees).
 * Returns normalised intensity [0–1].
 */
export function sampleIES(profile: IESProfile, vertDeg: number, horizDeg: number): number {
  if (profile.maxCandela === 0) return 0;

  const vAngles = profile.verticalAngles;
  const hAngles = profile.horizontalAngles;

  // Find bracketing vertical index
  let vi = 0;
  while (vi < vAngles.length - 1 && vAngles[vi + 1] < vertDeg) vi++;
  const vt =
    vAngles.length > 1 ? (vertDeg - vAngles[vi]) / (vAngles[vi + 1] - vAngles[vi] + 1e-6) : 0;

  // Find bracketing horizontal index
  let hi = 0;
  while (hi < hAngles.length - 1 && hAngles[hi + 1] < horizDeg) hi++;
  const ht =
    hAngles.length > 1 ? (horizDeg - hAngles[hi]) / (hAngles[hi + 1] - hAngles[hi] + 1e-6) : 0;

  const h1 = Math.min(hi + 1, hAngles.length - 1);
  const v1 = Math.min(vi + 1, vAngles.length - 1);

  // Bilinear interpolation in candela table
  const c00 = profile.candela[hi]?.[vi] ?? 0;
  const c10 = profile.candela[h1]?.[vi] ?? 0;
  const c01 = profile.candela[hi]?.[v1] ?? 0;
  const c11 = profile.candela[h1]?.[v1] ?? 0;

  const c0 = c00 + (c10 - c00) * ht;
  const c1 = c01 + (c11 - c01) * ht;
  const c = c0 + (c1 - c0) * vt;

  return c / profile.maxCandela;
}

// =============================================================================
// AREA LIGHTS (LTC approximation helpers)
// =============================================================================

/**
 * Compute solid angle subtended by a rectangular area light.
 * All positions in world space.
 */
export function rectSolidAngle(
  surfacePos: Vec3,
  lightPos: Vec3,
  right: Vec3,
  up: Vec3,
  halfWidth: number,
  halfHeight: number
): number {
  // Compute corners
  const corners: Vec3[] = [
    {
      x: lightPos.x - right.x * halfWidth - up.x * halfHeight,
      y: lightPos.y - right.y * halfWidth - up.y * halfHeight,
      z: lightPos.z - right.z * halfWidth - up.z * halfHeight,
    },
    {
      x: lightPos.x + right.x * halfWidth - up.x * halfHeight,
      y: lightPos.y + right.y * halfWidth - up.y * halfHeight,
      z: lightPos.z + right.z * halfWidth - up.z * halfHeight,
    },
    {
      x: lightPos.x + right.x * halfWidth + up.x * halfHeight,
      y: lightPos.y + right.y * halfWidth + up.y * halfHeight,
      z: lightPos.z + right.z * halfWidth + up.z * halfHeight,
    },
    {
      x: lightPos.x - right.x * halfWidth + up.x * halfHeight,
      y: lightPos.y - right.y * halfWidth + up.y * halfHeight,
      z: lightPos.z - right.z * halfWidth + up.z * halfHeight,
    },
  ];

  const dirs = corners.map((c) => {
    const d = { x: c.x - surfacePos.x, y: c.y - surfacePos.y, z: c.z - surfacePos.z };
    const len = Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2) || 1;
    return { x: d.x / len, y: d.y / len, z: d.z / len };
  });

  // Van Oosterom–Strackee solid angle formula
  const dot_ = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross_ = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const len_ = (v: Vec3) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);

  let solidAngle = 0;
  for (let i = 0; i < 4; i++) {
    const a = dirs[i],
      b = dirs[(i + 1) % 4];
    const crossV = cross_(a, b);
    const sinTheta = len_(crossV);
    const cosTheta = dot_(a, b);
    solidAngle += Math.atan2(sinTheta, cosTheta);
  }
  return Math.abs(solidAngle);
}

/**
 * Disk area light — solid angle approximation.
 */
export function diskSolidAngle(surfacePos: Vec3, lightPos: Vec3, radius: number): number {
  const dx = lightPos.x - surfacePos.x;
  const dy = lightPos.y - surfacePos.y;
  const dz = lightPos.z - surfacePos.z;
  const dist2 = dx * dx + dy * dy + dz * dz;
  const area = Math.PI * radius * radius;
  return area / (dist2 + area);
}

// =============================================================================
// LIGHT COOKIES
// =============================================================================

/**
 * Build a simple circular light cookie (sharp circular spot).
 */
export function buildCircleCookie(width: number, height: number, edgeSoftness = 0.05): LightCookie {
  const pixels = new Float32Array(width * height * 4);
  const cx = width / 2,
    cy = height / 2,
    r = Math.min(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r;
      const v = 1 - Math.max(0, (d - (1 - edgeSoftness)) / edgeSoftness);
      const pi = (y * width + x) * 4;
      pixels[pi] = pixels[pi + 1] = pixels[pi + 2] = Math.max(0, Math.min(1, v));
      pixels[pi + 3] = 1;
    }
  }
  return { width, height, pixels };
}

/**
 * Sample a light cookie at UV coordinates [0–1].
 * Returns [r, g, b, a].
 */
export function sampleCookie(
  cookie: LightCookie,
  u: number,
  v: number
): [number, number, number, number] {
  const x = Math.round(Math.max(0, Math.min(1, u)) * (cookie.width - 1));
  const y = Math.round(Math.max(0, Math.min(1, v)) * (cookie.height - 1));
  const pi = (y * cookie.width + x) * 4;
  return [cookie.pixels[pi], cookie.pixels[pi + 1], cookie.pixels[pi + 2], cookie.pixels[pi + 3]];
}

// =============================================================================
// LIGHT MANAGER
// =============================================================================

let _lightId = 0;

export class AdvancedLightingManager {
  private lights = new Map<string, AdvancedLight>();

  addLight(config: Partial<AdvancedLight> & { type: LightType }): AdvancedLight {
    const light: AdvancedLight = {
      id: `alight_${_lightId++}`,
      position: {x: 0, y: 5, z: 0},
      direction: { x: 0, y: -1, z: 0 },
      color: [1, 1, 1],
      intensity: 1,
      range: 20,
      enabled: true,
      ...config,
    };
    this.lights.set(light.id, light);
    return light;
  }

  removeLight(id: string): boolean {
    return this.lights.delete(id);
  }
  getLight(id: string): AdvancedLight | undefined {
    return this.lights.get(id);
  }
  getLightCount(): number {
    return this.lights.size;
  }
  getEnabledCount(): number {
    return [...this.lights.values()].filter((l) => l.enabled).length;
  }

  getLightsByType(type: LightType): AdvancedLight[] {
    return [...this.lights.values()].filter((l) => l.type === type);
  }

  /**
   * Set a light cookie on an existing light.
   */
  setCookie(id: string, cookie: LightCookie): void {
    const l = this.lights.get(id);
    if (l) l.cookie = cookie;
  }

  /**
   * Set an IES profile on an existing light.
   */
  setIES(id: string, profile: IESProfile): void {
    const l = this.lights.get(id);
    if (l) l.ies = profile;
  }

  /**
   * Get total emissive power from all enabled emissive mesh lights.
   */
  getTotalEmissivePower(): number {
    return [...this.lights.values()]
      .filter((l) => l.type === 'emissive_mesh' && l.enabled)
      .reduce((sum, l) => sum + (l.intensity * (l.color[0] + l.color[1] + l.color[2])) / 3, 0);
  }

  clear(): void {
    this.lights.clear();
  }
}
