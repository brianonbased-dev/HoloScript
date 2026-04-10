/**
 * SubsurfaceScattering.ts
 *
 * Subsurface scattering (SSS) implementation:
 *   - Burley/Christensen normalized diffusion profile
 *   - Multi-channel RGB scatter radii (skin: R large, G medium, B small)
 *   - Multi-layer SSS (epidermis / dermis)
 *   - Thin-slab transmission approximation
 *   - Thickness map sampling (Float32Array or constant)
 *   - Separable SSS blur kernel (screen-space blur weights via Gaussian sum)
 *   - Pre-built material profiles (skin, wax, jade, marble, leaves)
 *
 * No WebGPU — fully CPU-testable in Vitest.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type RGB = [number, number, number];

export type SSSModel = 'burley' | 'christensen' | 'separable_sss';

export interface SSSLayer {
  /** Weight of this layer (0–1, sum of all layers should ≤ 1) */
  weight: number;
  /** Per-channel (R, G, B) scattering radius in world units */
  scatterRadius: RGB;
  /** Base scatter color (tint) */
  color: RGB;
}

export interface SSSConfig {
  model: SSSModel;
  /** Diffusion radius falloff shape (1 = linear, 2 = quadratic like Burley) */
  falloffPower: number;
  /** Transmission (0 = opaque, 1 = fully transparent thin slab) */
  transmission: number;
  /** Constant thickness if no thickness map provided (0–1) */
  thickness: number;
  layers: SSSLayer[];
}

const DEFAULT_SSS: SSSConfig = {
  model: 'burley',
  falloffPower: 2,
  transmission: 0.1,
  thickness: 0.5,
  layers: [{ weight: 1, scatterRadius: [1, 0.4, 0.1], color: [1, 0.8, 0.6] }],
};

// =============================================================================
// BURLEY PROFILE
// =============================================================================

/**
 * Burley normalized diffusion profile: R(r) = A/r * (e^(-r/d) + e^(-r/(3d)))
 * Returns relative diffusion weight at distance r for a given mean free path d.
 *
 * Reference: Burley 2015, "Extending the Disney BRDF to a BSDF with Integrated Subsurface Scattering"
 */
export function burleyProfile(r: number, d: number, A = 1): number {
  if (r <= 0 || d <= 0) return A;
  const inv = 1 / (r * d + 1e-6);
  return (A * (Math.exp(-r / d) + Math.exp(-r / (3 * d))) * inv * 0.25) / Math.PI;
}

/**
 * Sample Burley profile across R, G, B channels.
 * scatterRadius = mean free path per channel.
 */
export function burleyProfileRGB(r: number, scatterRadius: RGB): RGB {
  return [
    burleyProfile(r, scatterRadius[0]),
    burleyProfile(r, scatterRadius[1]),
    burleyProfile(r, scatterRadius[2]),
  ];
}

// =============================================================================
// CHRISTENSEN PROFILE
// =============================================================================

/**
 * Christensen–Burley profile (fitted polynomial, cheaper to evaluate).
 * From "An Approximate Reflectance Profile for Efficient Subsurface Scattering"
 *
 * R(r) = (e^(-A*r/d) + e^(-A*r/(3d))) * A / (8πd)
 */
export function christensenProfile(r: number, d: number, A = 0.93): number {
  if (d <= 0) return 0;
  return ((Math.exp((-A * r) / d) + Math.exp((-A * r) / (3 * d))) * A) / (8 * Math.PI * d + 1e-6);
}

// =============================================================================
// SEPARABLE SSS BLUR KERNEL
// =============================================================================

/**
 * Gaussian sum blur weights (Jimenez 2012 Separable SSS).
 * Returns N weight-variance pairs [{ weight, variance }] per channel.
 *
 * The kernel width is controlled by scatterRadius.
 */
export function buildSeparableSSSKernel(
  scatterRadius: RGB,
  numGaussians = 6
): Array<{ weight: number; stddev: RGB }> {
  const kernel: Array<{ weight: number; stddev: RGB }> = [];
  for (let i = 0; i < numGaussians; i++) {
    const t = (i + 1) / numGaussians;
    kernel.push({
      weight: (1 / numGaussians) * Math.exp(-t),
      stddev: [scatterRadius[0] * t, scatterRadius[1] * t, scatterRadius[2] * t],
    });
  }
  return kernel;
}

/**
 * Evaluate a separable Gaussian blur at offset x (signed, in world units).
 * Returns RGB weight.
 */
export function evalSeparableKernel(
  kernel: Array<{ weight: number; stddev: RGB }>,
  x: number
): RGB {
  let r = 0,
    g = 0,
    b = 0;
  for (const { weight, stddev } of kernel) {
    r += weight * gaussianAt(x, stddev[0]);
    g += weight * gaussianAt(x, stddev[1]);
    b += weight * gaussianAt(x, stddev[2]);
  }
  return [r, g, b];
}

function gaussianAt(x: number, sigma: number): number {
  if (sigma <= 0) return x === 0 ? 1 : 0;
  return Math.exp(-(x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
}

// =============================================================================
// TRANSMISSION
// =============================================================================

/**
 * Thin-slab transmission amount using Beer-Lambert approximation.
 * thickness: 0 = thin (high transmission), 1 = thick (low transmission).
 * Returns transmission factor [0, 1].
 */
export function thinSlabTransmission(
  thickness: number,
  config: Pick<SSSConfig, 'transmission' | 'layers'>
): RGB {
  const result: RGB = [0, 0, 0];
  for (const layer of config.layers) {
    const t = config.transmission * (1 - thickness) * layer.weight;
    for (let ch = 0; ch < 3; ch++) {
      result[ch] += t * layer.color[ch] * Math.exp(-thickness / (layer.scatterRadius[ch] + 1e-6));
    }
  }
  return result;
}

// =============================================================================
// SSS MATERIAL
// =============================================================================

export class SSSMaterial {
  private config: SSSConfig;

  constructor(config: Partial<SSSConfig> = {}) {
    this.config = {
      ...DEFAULT_SSS,
      ...config,
      layers: config.layers ?? DEFAULT_SSS.layers,
    };
  }

  getConfig(): Readonly<SSSConfig> {
    return { ...this.config };
  }
  setModel(model: SSSModel): void {
    this.config.model = model;
  }
  setTransmission(t: number): void {
    this.config.transmission = Math.max(0, Math.min(1, t));
  }
  setThickness(t: number): void {
    this.config.thickness = Math.max(0, Math.min(1, t));
  }
  addLayer(layer: SSSLayer): void {
    this.config.layers.push(layer);
  }
  getLayerCount(): number {
    return this.config.layers.length;
  }

  /**
   * Evaluate SSS diffusion at a surface point for a given light exit radius.
   * r: distance between light entry and exit point on the surface.
   */
  evaluate(r: number): RGB {
    const result: RGB = [0, 0, 0];
    for (const layer of this.config.layers) {
      let channelResult: RGB;
      if (this.config.model === 'christensen') {
        channelResult = [
          christensenProfile(r, layer.scatterRadius[0]) * layer.color[0] * layer.weight,
          christensenProfile(r, layer.scatterRadius[1]) * layer.color[1] * layer.weight,
          christensenProfile(r, layer.scatterRadius[2]) * layer.color[2] * layer.weight,
        ];
      } else {
        const burley = burleyProfileRGB(r, layer.scatterRadius);
        channelResult = [
          burley[0] * layer.color[0] * layer.weight,
          burley[1] * layer.color[1] * layer.weight,
          burley[2] * layer.color[2] * layer.weight,
        ];
      }
      result[0] += channelResult[0];
      result[1] += channelResult[1];
      result[2] += channelResult[2];
    }
    return result;
  }

  /** Evaluate thin-slab transmission at the material's configured thickness */
  getTransmission(thicknessOverride?: number): RGB {
    const t = thicknessOverride ?? this.config.thickness;
    return thinSlabTransmission(t, this.config);
  }

  /** Get Separable SSS kernel for this material (first layer) */
  getKernel(numGaussians = 6): ReturnType<typeof buildSeparableSSSKernel> {
    const first = this.config.layers[0];
    return buildSeparableSSSKernel(first.scatterRadius, numGaussians);
  }
}

// =============================================================================
// PRESET PROFILES
// =============================================================================

export const SSS_PRESETS = {
  /** Human skin: epidermis (yellow tint) + dermis (red) */
  humanSkin: (): SSSMaterial =>
    new SSSMaterial({
      model: 'burley',
      transmission: 0.05,
      thickness: 0.3,
      layers: [
        { weight: 0.3, scatterRadius: [0.4, 0.2, 0.05], color: [0.95, 0.85, 0.6] }, // epidermis
        { weight: 0.7, scatterRadius: [2.5, 0.8, 0.15], color: [1.0, 0.4, 0.25] }, // dermis
      ],
    }),

  /** Wax candle (high SSS, warm light transmission) */
  wax: (): SSSMaterial =>
    new SSSMaterial({
      model: 'burley',
      transmission: 0.4,
      thickness: 0.6,
      layers: [{ weight: 1, scatterRadius: [3, 2, 1], color: [1, 0.95, 0.7] }],
    }),

  /** Jade gemstone (cool, dense SSS) */
  jade: (): SSSMaterial =>
    new SSSMaterial({
      model: 'christensen',
      transmission: 0.15,
      thickness: 0.7,
      layers: [{ weight: 1, scatterRadius: [0.5, 1.2, 0.4], color: [0.3, 0.7, 0.4] }],
    }),

  /** Marble (dense, RGB-balanced) */
  marble: (): SSSMaterial =>
    new SSSMaterial({
      model: 'burley',
      transmission: 0.1,
      thickness: 0.8,
      layers: [{ weight: 1, scatterRadius: [0.8, 0.8, 0.7], color: [0.95, 0.93, 0.9] }],
    }),

  /** Leaf / plant (very thin, high transmission) */
  leaf: (): SSSMaterial =>
    new SSSMaterial({
      model: 'separable_sss',
      transmission: 0.6,
      thickness: 0.1,
      layers: [{ weight: 1, scatterRadius: [0.3, 0.8, 0.2], color: [0.3, 0.7, 0.15] }],
    }),
};

