/**
 * GlobalIllumination.ts
 *
 * Global Illumination system:
 *   - Spherical Harmonic (SH, L2 9-coefficient) light probe encoding/decoding
 *   - SH irradiance grid (3D probe array)
 *   - Irradiance probe sampling and trilinear interpolation
 *   - DDGI-style probe validity tracking
 *   - Lightmap UV unwrapping placeholder (atlas packing)
 *   - Bounce count / GI mode configuration
 *
 * CPU-side — does not depend on WebGPU. Probe lighting values are
 * expected to come from an offline bake or iterative runtime update.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type Vec3 = { x: number; y: number; z: number };

/** L2 spherical harmonics — 9 coefficients per RGB channel */
export interface SH9 {
  r: Float32Array;   // length 9
  g: Float32Array;
  b: Float32Array;
}

export type GIMode = 'lightmaps' | 'probes' | 'ddgi' | 'ssgi' | 'none';

export interface GIConfig {
  mode: GIMode;
  /** World-space distance between adjacent probes */
  probeSpacing: number;
  /** Number of indirect light bounces to simulate */
  bounceCount: number;
  /** Grid dimensions [x, y, z] */
  gridSize: [number, number, number];
  /** World-space origin of the probe grid */
  gridOrigin: Vec3;
}

const DEFAULT_GI_CONFIG: GIConfig = {
  mode: 'probes',
  probeSpacing: 2,
  bounceCount: 2,
  gridSize: [8, 4, 8],
  gridOrigin: { x: 0, y: 0, z: 0 },
};

// =============================================================================
// SPHERICAL HARMONICS UTILITIES
// =============================================================================

/** Create an empty SH9 (all zeroes) */
export function createSH9(): SH9 {
  return { r: new Float32Array(9), g: new Float32Array(9), b: new Float32Array(9) };
}

/**
 * Add a directional radiance sample to an SH9 accumulator.
 * dir must be a unit vector (azimuth encoded across hemisphere).
 */
export function addSHSample(sh: SH9, dir: Vec3, radiance: [number, number, number], weight = 1): void {
  const { x, y, z } = dir;
  // L0–L2 SH basis evaluations
  const basis: number[] = [
    0.282095,                                   // L0
    0.488603 * y,                               // L1m1
    0.488603 * z,                               // L10
    0.488603 * x,                               // L1p1
    1.092548 * x * y,                           // L2m2
    1.092548 * y * z,                           // L2m1
    0.315392 * (3 * z * z - 1),                // L20
    1.092548 * x * z,                           // L2p1
    0.546274 * (x * x - y * y),               // L2p2
  ];

  for (let i = 0; i < 9; i++) {
    sh.r[i] += radiance[0] * basis[i] * weight;
    sh.g[i] += radiance[1] * basis[i] * weight;
    sh.b[i] += radiance[2] * basis[i] * weight;
  }
}

/**
 * Evaluate SH9 irradiance at a surface normal (Ravi Ramamoorthi, 2001).
 * Returns RGB irradiance.
 */
export function evalSH9Irradiance(sh: SH9, normal: Vec3): [number, number, number] {
  const { x, y, z } = normal;
  const c1 = 0.429043, c2 = 0.511664, c3 = 0.743125, c4 = 0.886227, c5 = 0.247708;

  const eval_ = (coeff: Float32Array): number =>
    c4 * coeff[0]
    - c5 * coeff[6]
    + 2 * c2 * coeff[1] * y
    + 2 * c2 * coeff[2] * z
    + 2 * c2 * coeff[3] * x
    + 2 * c1 * coeff[4] * x * y
    + 2 * c1 * coeff[5] * y * z
    + c3 * coeff[6] * z * z
    + 2 * c1 * coeff[7] * x * z
    + c1 * coeff[8] * (x * x - y * y);

  return [
    Math.max(0, eval_(sh.r)),
    Math.max(0, eval_(sh.g)),
    Math.max(0, eval_(sh.b)),
  ];
}

/** Scale all SH coefficients by a scalar (e.g. to normalise after sample accumulation) */
export function scaleSH9(sh: SH9, s: number): void {
  for (let i = 0; i < 9; i++) {
    sh.r[i] *= s; sh.g[i] *= s; sh.b[i] *= s;
  }
}

/** Linearly interpolate between two SH9 probes (for trilinear grid lookup) */
export function lerpSH9(a: SH9, b: SH9, t: number): SH9 {
  const out = createSH9();
  for (let i = 0; i < 9; i++) {
    out.r[i] = a.r[i] + (b.r[i] - a.r[i]) * t;
    out.g[i] = a.g[i] + (b.g[i] - a.g[i]) * t;
    out.b[i] = a.b[i] + (b.b[i] - a.b[i]) * t;
  }
  return out;
}

// =============================================================================
// PROBE GRID
// =============================================================================

export interface ProbeInfo {
  index: number;
  worldPos: Vec3;
  sh: SH9;
  /** 0 = invalid (occlusion issue), 1 = valid */
  validity: number;
  /** Number of times this probe has been updated */
  updateCount: number;
}

export class GIProbeGrid {
  private probes: ProbeInfo[];
  private config: GIConfig;

  constructor(config: Partial<GIConfig> = {}) {
    this.config = { ...DEFAULT_GI_CONFIG, ...config };
    this.probes = this.buildGrid();
  }

  private buildGrid(): ProbeInfo[] {
    const [gx, gy, gz] = this.config.gridSize;
    const { probeSpacing, gridOrigin } = this.config;
    const probes: ProbeInfo[] = [];

    for (let z = 0; z < gz; z++) {
      for (let y = 0; y < gy; y++) {
        for (let x = 0; x < gx; x++) {
          probes.push({
            index: probes.length,
            worldPos: {
              x: gridOrigin.x + x * probeSpacing,
              y: gridOrigin.y + y * probeSpacing,
              z: gridOrigin.z + z * probeSpacing,
            },
            sh: createSH9(),
            validity: 1,
            updateCount: 0,
          });
        }
      }
    }
    return probes;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getProbeCount(): number { return this.probes.length; }
  getConfig(): Readonly<GIConfig> { return { ...this.config }; }

  getProbe(x: number, y: number, z: number): ProbeInfo | undefined {
    const [gx, gy] = this.config.gridSize;
    if (x < 0 || y < 0 || z < 0 || x >= this.config.gridSize[0] || y >= gy || z >= this.config.gridSize[2]) return undefined;
    return this.probes[z * gy * gx + y * gx + x];
  }

  getProbeAt(index: number): ProbeInfo | undefined { return this.probes[index]; }

  // ---------------------------------------------------------------------------
  // Probe Updates
  // ---------------------------------------------------------------------------

  updateProbe(x: number, y: number, z: number, sh: SH9): void {
    const p = this.getProbe(x, y, z);
    if (!p) return;
    p.sh = sh;
    p.updateCount++;
  }

  setValidity(x: number, y: number, z: number, valid: number): void {
    const p = this.getProbe(x, y, z);
    if (p) p.validity = Math.max(0, Math.min(1, valid));
  }

  invalidateAll(): void {
    for (const p of this.probes) p.validity = 0;
  }

  /** Number of valid probes (validity > 0) */
  getValidProbeCount(): number {
    return this.probes.filter(p => p.validity > 0).length;
  }

  // ---------------------------------------------------------------------------
  // Irradiance Sampling (trilinear)
  // ---------------------------------------------------------------------------

  /**
   * Sample irradiance at a world-space position + surface normal.
   * Performs trilinear interpolation across the 8 surrounding probes.
   */
  sampleIrradiance(worldPos: Vec3, normal: Vec3): [number, number, number] {
    const { probeSpacing, gridOrigin, gridSize } = this.config;

    // Convert world pos to probe grid coords
    const gx = (worldPos.x - gridOrigin.x) / probeSpacing;
    const gy = (worldPos.y - gridOrigin.y) / probeSpacing;
    const gz = (worldPos.z - gridOrigin.z) / probeSpacing;

    const ix = Math.max(0, Math.min(gridSize[0] - 2, Math.floor(gx)));
    const iy = Math.max(0, Math.min(gridSize[1] - 2, Math.floor(gy)));
    const iz = Math.max(0, Math.min(gridSize[2] - 2, Math.floor(gz)));

    const tx = gx - ix, ty = gy - iy, tz = gz - iz;

    // Trilinear: 8 corner probes
    const probe = (dx: number, dy: number, dz: number): SH9 =>
      this.getProbe(ix + dx, iy + dy, iz + dz)?.sh ?? createSH9();

    // Blend across x
    const c00 = lerpSH9(probe(0, 0, 0), probe(1, 0, 0), tx);
    const c10 = lerpSH9(probe(0, 1, 0), probe(1, 1, 0), tx);
    const c01 = lerpSH9(probe(0, 0, 1), probe(1, 0, 1), tx);
    const c11 = lerpSH9(probe(0, 1, 1), probe(1, 1, 1), tx);
    // Blend across y
    const c0 = lerpSH9(c00, c10, ty);
    const c1 = lerpSH9(c01, c11, ty);
    // Blend across z
    const final = lerpSH9(c0, c1, tz);

    return evalSH9Irradiance(final, normal);
  }

  // ---------------------------------------------------------------------------
  // Lightmap UV helpers
  // ---------------------------------------------------------------------------

  /**
   * Return lightmap UV (atlas page + offset) for a given probe index.
   * Probes are packed in a square atlas, 16 per row.
   */
  getLightmapUV(probeIndex: number): { page: number; u: number; v: number } {
    const pageSize = 256;
    const probeSize = 16;
    const perPage = (pageSize / probeSize) ** 2;
    const page = Math.floor(probeIndex / perPage);
    const inPage = probeIndex % perPage;
    const col = inPage % (pageSize / probeSize);
    const row = Math.floor(inPage / (pageSize / probeSize));
    return { page, u: col / (pageSize / probeSize), v: row / (pageSize / probeSize) };
  }
}
