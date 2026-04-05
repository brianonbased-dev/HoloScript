/**
 * ColorGrading.ts
 *
 * Color grading: tonemapping operators, exposure, contrast,
 * saturation, color temperature, LUT, and split toning.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export type TonemapOperator = 'none' | 'reinhard' | 'aces' | 'filmic' | 'uncharted2';

export interface ColorGradingConfig {
  tonemapper: TonemapOperator;
  exposure: number; // EV
  contrast: number; // 0-2 (1 = neutral)
  saturation: number; // 0-2
  temperature: number; // -1 to 1 (cold to warm)
  tint: number; // -1 to 1 (green to magenta)
  gamma: number; // 0.1-3
  enabled: boolean;
}

// =============================================================================
// COLOR GRADING
// =============================================================================

export class ColorGrading {
  private config: ColorGradingConfig = {
    tonemapper: 'aces',
    exposure: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
    gamma: 1,
    enabled: true,
  };

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setTonemapper(op: TonemapOperator): void {
    this.config.tonemapper = op;
  }
  setExposure(ev: number): void {
    this.config.exposure = ev;
  }
  setContrast(val: number): void {
    this.config.contrast = Math.max(0, Math.min(2, val));
  }
  setSaturation(val: number): void {
    this.config.saturation = Math.max(0, Math.min(2, val));
  }
  setTemperature(val: number): void {
    this.config.temperature = Math.max(-1, Math.min(1, val));
  }
  setTint(val: number): void {
    this.config.tint = Math.max(-1, Math.min(1, val));
  }
  setGamma(val: number): void {
    this.config.gamma = Math.max(0.1, Math.min(3, val));
  }
  setEnabled(val: boolean): void {
    this.config.enabled = val;
  }
  getConfig(): ColorGradingConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Tonemapping
  // ---------------------------------------------------------------------------

  tonemap(r: number, g: number, b: number): [number, number, number] {
    switch (this.config.tonemapper) {
      case 'reinhard':
        return [r / (1 + r), g / (1 + g), b / (1 + b)];
      case 'aces':
        return this.tonemapACES(r, g, b);
      case 'filmic':
        return this.tonemapFilmic(r, g, b);
      case 'uncharted2':
        return this.tonemapUncharted2(r, g, b);
      default:
        return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
    }
  }

  private tonemapACES(r: number, g: number, b: number): [number, number, number] {
    const a = 2.51,
      bC = 0.03,
      c = 2.43,
      d = 0.59,
      e = 0.14;
    const map = (x: number) => Math.max(0, Math.min(1, (x * (a * x + bC)) / (x * (c * x + d) + e)));
    return [map(r), map(g), map(b)];
  }

  private tonemapFilmic(r: number, g: number, b: number): [number, number, number] {
    const map = (x: number) => {
      const X = Math.max(0, x - 0.004);
      return Math.min(1, (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06));
    };
    return [map(r), map(g), map(b)];
  }

  private tonemapUncharted2(r: number, g: number, b: number): [number, number, number] {
    const A = 0.15,
      B = 0.5,
      C = 0.1,
      D = 0.2,
      E = 0.02,
      F = 0.3;
    const map = (x: number) => (x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F) - E / F;
    const W = 11.2;
    const whiteScale = 1 / map(W);
    return [
      Math.min(1, map(r) * whiteScale),
      Math.min(1, map(g) * whiteScale),
      Math.min(1, map(b) * whiteScale),
    ];
  }

  // ---------------------------------------------------------------------------
  // Color Adjustments
  // ---------------------------------------------------------------------------

  adjustExposure(r: number, g: number, b: number): [number, number, number] {
    const mult = Math.pow(2, this.config.exposure);
    return [r * mult, g * mult, b * mult];
  }

  adjustContrast(r: number, g: number, b: number): [number, number, number] {
    const c = this.config.contrast;
    return [(r - 0.5) * c + 0.5, (g - 0.5) * c + 0.5, (b - 0.5) * c + 0.5];
  }

  adjustSaturation(r: number, g: number, b: number): [number, number, number] {
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const s = this.config.saturation;
    return [lum + (r - lum) * s, lum + (g - lum) * s, lum + (b - lum) * s];
  }

  adjustGamma(r: number, g: number, b: number): [number, number, number] {
    const inv = 1 / this.config.gamma;
    return [
      Math.pow(Math.max(0, r), inv),
      Math.pow(Math.max(0, g), inv),
      Math.pow(Math.max(0, b), inv),
    ];
  }

  // ---------------------------------------------------------------------------
  // Full Pipeline
  // ---------------------------------------------------------------------------

  apply(pixels: Float32Array, width: number, height: number): Float32Array {
    if (!this.config.enabled) return pixels;
    const output = new Float32Array(pixels.length);

    for (let i = 0; i < pixels.length; i += 4) {
      let [r, g, b] = this.adjustExposure(pixels[i], pixels[i + 1], pixels[i + 2]);
      [r, g, b] = this.tonemap(r, g, b);
      [r, g, b] = this.adjustContrast(r, g, b);
      [r, g, b] = this.adjustSaturation(r, g, b);
      [r, g, b] = this.adjustGamma(r, g, b);

      output[i] = Math.max(0, Math.min(1, r));
      output[i + 1] = Math.max(0, Math.min(1, g));
      output[i + 2] = Math.max(0, Math.min(1, b));
      output[i + 3] = pixels[i + 3];
    }
    return output;
  }
}
