/**
 * NoiseGenerator.ts
 *
 * Procedural noise generation: Perlin, Simplex-like value noise,
 * Fractal Brownian Motion, domain warping, and ridged multifractal.
 *
 * @module procedural
 */

// =============================================================================
// TYPES
// =============================================================================

export interface NoiseConfig {
  seed: number;
  octaves: number;
  lacunarity: number;     // Frequency multiplier per octave (default: 2.0)
  gain: number;           // Amplitude multiplier per octave (default: 0.5)
  scale: number;          // Base frequency scale
}

export type NoiseType = 'value' | 'perlin' | 'ridged' | 'warped' | 'worley';

// =============================================================================
// NOISE GENERATOR
// =============================================================================

const DEFAULT_CONFIG: NoiseConfig = {
  seed: 42,
  octaves: 6,
  lacunarity: 2.0,
  gain: 0.5,
  scale: 0.01,
};

export class NoiseGenerator {
  private config: NoiseConfig;
  private perm: Uint8Array;

  constructor(config: Partial<NoiseConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.perm = this.buildPermutationTable(this.config.seed);
  }

  // ---------------------------------------------------------------------------
  // Base Noise
  // ---------------------------------------------------------------------------

  /**
   * 2D value noise (smooth random values at integer lattice).
   */
  value2D(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const sx = this.fade(fx);
    const sy = this.fade(fy);

    const n00 = this.hash2D(ix, iy);
    const n10 = this.hash2D(ix + 1, iy);
    const n01 = this.hash2D(ix, iy + 1);
    const n11 = this.hash2D(ix + 1, iy + 1);

    return this.lerp(
      this.lerp(n00, n10, sx),
      this.lerp(n01, n11, sx),
      sy
    );
  }

  /**
   * 2D gradient noise (Perlin-like).
   */
  perlin2D(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const u = this.fade(fx);
    const v = this.fade(fy);

    const g00 = this.grad2D(this.permAt(ix, iy), fx, fy);
    const g10 = this.grad2D(this.permAt(ix + 1, iy), fx - 1, fy);
    const g01 = this.grad2D(this.permAt(ix, iy + 1), fx, fy - 1);
    const g11 = this.grad2D(this.permAt(ix + 1, iy + 1), fx - 1, fy - 1);

    return this.lerp(
      this.lerp(g00, g10, u),
      this.lerp(g01, g11, u),
      v
    ) * 0.5 + 0.5; // Normalize to [0, 1]
  }

  /**
   * 3D value noise.
   */
  value3D(x: number, y: number, z: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;

    const sx = this.fade(fx);
    const sy = this.fade(fy);
    const sz = this.fade(fz);

    const n000 = this.hash3D(ix, iy, iz);
    const n100 = this.hash3D(ix + 1, iy, iz);
    const n010 = this.hash3D(ix, iy + 1, iz);
    const n110 = this.hash3D(ix + 1, iy + 1, iz);
    const n001 = this.hash3D(ix, iy, iz + 1);
    const n101 = this.hash3D(ix + 1, iy, iz + 1);
    const n011 = this.hash3D(ix, iy + 1, iz + 1);
    const n111 = this.hash3D(ix + 1, iy + 1, iz + 1);

    return this.lerp(
      this.lerp(this.lerp(n000, n100, sx), this.lerp(n010, n110, sx), sy),
      this.lerp(this.lerp(n001, n101, sx), this.lerp(n011, n111, sx), sy),
      sz
    );
  }

  /**
   * Worley (cellular) noise — distance to nearest feature point.
   */
  worley2D(x: number, y: number, density: number = 1): number {
    let minDist = Infinity;
    const ix = Math.floor(x);
    const iy = Math.floor(y);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = ix + dx;
        const cy = iy + dy;
        // Deterministic point from cell
        const hash = this.perm[((cx & 255) + this.perm[(cy & 255)]) & 511];
        const px = cx + (hash / 255) * density;
        const py = cy + (this.perm[(hash + 1) & 511] / 255) * density;
        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (dist < minDist) minDist = dist;
      }
    }
    return Math.min(1, minDist);
  }

  // ---------------------------------------------------------------------------
  // Fractal Noise
  // ---------------------------------------------------------------------------

  /**
   * Fractal Brownian Motion (FBM) — layered octaves of noise.
   */
  fbm2D(x: number, y: number, type: 'value' | 'perlin' = 'value'): number {
    const { octaves, lacunarity, gain, scale } = this.config;
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      const n = type === 'perlin'
        ? this.perlin2D(x * frequency, y * frequency)
        : this.value2D(x * frequency, y * frequency);
      value += n * amplitude;
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }

  /**
   * Ridged multifractal noise — sharp ridges from inverted absolute values.
   */
  ridged2D(x: number, y: number): number {
    const { octaves, lacunarity, gain, scale } = this.config;
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let weight = 1;

    for (let i = 0; i < octaves; i++) {
      let n = this.perlin2D(x * frequency, y * frequency);
      n = 1 - Math.abs(n * 2 - 1); // Ridge
      n = n * n * weight;
      weight = Math.min(1, n);

      value += n * amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return value;
  }

  /**
   * Domain-warped noise — distorts input coordinates for organic shapes.
   */
  warped2D(x: number, y: number, warpStrength: number = 4): number {
    const { scale } = this.config;

    // First pass: compute warp offsets
    const qx = this.fbm2D(x, y);
    const qy = this.fbm2D(x + 5.2, y + 1.3);

    // Second pass: warp the coordinates
    return this.fbm2D(
      x + qx * warpStrength / scale,
      y + qy * warpStrength / scale
    );
  }

  // ---------------------------------------------------------------------------
  // Multi-purpose Sample
  // ---------------------------------------------------------------------------

  /**
   * Sample noise at a point using the specified type.
   */
  sample2D(x: number, y: number, type: NoiseType = 'value'): number {
    switch (type) {
      case 'value': return this.fbm2D(x, y, 'value');
      case 'perlin': return this.fbm2D(x, y, 'perlin');
      case 'ridged': return this.ridged2D(x, y);
      case 'warped': return this.warped2D(x, y);
      case 'worley': return this.worley2D(x, y);
    }
  }

  /**
   * Generate a 2D noise map.
   */
  generateMap(width: number, height: number, type: NoiseType = 'value'): Float32Array {
    const map = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        map[y * width + x] = this.sample2D(x, y, type);
      }
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setSeed(seed: number): void {
    this.config.seed = seed;
    this.perm = this.buildPermutationTable(seed);
  }

  setConfig(config: Partial<NoiseConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.seed !== undefined) {
      this.perm = this.buildPermutationTable(config.seed);
    }
  }

  getConfig(): NoiseConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Internal Utilities
  // ---------------------------------------------------------------------------

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10); // Improved Perlin fade
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private hash2D(x: number, y: number): number {
    const idx = (this.perm[(x & 255)] + y) & 255;
    return this.perm[idx] / 255;
  }

  private hash3D(x: number, y: number, z: number): number {
    const idx = (this.perm[(this.perm[(x & 255)] + y) & 255] + z) & 255;
    return this.perm[idx] / 255;
  }

  private permAt(x: number, y: number): number {
    return this.perm[(this.perm[(x & 255)] + y) & 255];
  }

  private grad2D(hash: number, x: number, y: number): number {
    const h = hash & 3;
    switch (h) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      default: return 0;
    }
  }

  private buildPermutationTable(seed: number): Uint8Array {
    const table = new Uint8Array(512);
    // Initialize with values 0-255
    for (let i = 0; i < 256; i++) table[i] = i;

    // Fisher-Yates shuffle with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [table[i], table[j]] = [table[j], table[i]];
    }

    // Duplicate for overflow
    for (let i = 0; i < 256; i++) table[i + 256] = table[i];

    return table;
  }
}
