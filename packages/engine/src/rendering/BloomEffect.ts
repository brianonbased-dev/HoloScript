/**
 * BloomEffect.ts
 *
 * Bloom post-process: threshold extraction, blur passes,
 * soft knee, intensity, and composite blending.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface BloomConfig {
  threshold: number; // Brightness threshold
  softKnee: number; // Smooth transition around threshold
  intensity: number; // Final bloom strength
  radius: number; // Blur radius
  passes: number; // Number of blur iterations
  enabled: boolean;
}

// =============================================================================
// BLOOM EFFECT
// =============================================================================

export class BloomEffect {
  private config: BloomConfig = {
    threshold: 0.8,
    softKnee: 0.5,
    intensity: 1,
    radius: 4,
    passes: 3,
    enabled: true,
  };

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setThreshold(val: number): void {
    this.config.threshold = Math.max(0, val);
  }
  setSoftKnee(val: number): void {
    this.config.softKnee = Math.max(0, Math.min(1, val));
  }
  setIntensity(val: number): void {
    this.config.intensity = Math.max(0, val);
  }
  setRadius(val: number): void {
    this.config.radius = Math.max(1, Math.floor(val));
  }
  setPasses(val: number): void {
    this.config.passes = Math.max(1, Math.floor(val));
  }
  setEnabled(val: boolean): void {
    this.config.enabled = val;
  }
  getConfig(): BloomConfig {
    return { ...this.config };
  }

  // ---------------------------------------------------------------------------
  // Processing Steps
  // ---------------------------------------------------------------------------

  extractBright(pixels: Float32Array, width: number, height: number): Float32Array {
    const output = new Float32Array(pixels.length);
    const threshold = this.config.threshold;
    const knee = this.config.softKnee;

    for (let i = 0; i < pixels.length; i += 4) {
      const luminance = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      let contribution = 0;

      if (knee > 0) {
        const soft = luminance - threshold + knee;
        const s = Math.max(0, Math.min(2 * knee, soft));
        contribution = (s * s) / (4 * knee + 0.0001);
        contribution = Math.max(contribution, luminance - threshold);
        contribution = Math.max(0, contribution);
      } else {
        contribution = Math.max(0, luminance - threshold);
      }

      const scale = contribution > 0 ? contribution / (luminance + 0.0001) : 0;
      output[i] = pixels[i] * scale;
      output[i + 1] = pixels[i + 1] * scale;
      output[i + 2] = pixels[i + 2] * scale;
      output[i + 3] = pixels[i + 3];
    }
    return output;
  }

  blur(pixels: Float32Array, width: number, height: number): Float32Array {
    let buffer = pixels;
    for (let p = 0; p < this.config.passes; p++) {
      buffer = this.blurPass(buffer, width, height);
    }
    return buffer;
  }

  private blurPass(pixels: Float32Array, width: number, height: number): Float32Array {
    const output = new Float32Array(pixels.length);
    const radius = this.config.radius;

    // Simple box blur (horizontal only for performance)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0,
          g = 0,
          b = 0,
          a = 0,
          count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const idx = (y * width + sx) * 4;
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          a += pixels[idx + 3];
          count++;
        }
        const idx = (y * width + x) * 4;
        output[idx] = r / count;
        output[idx + 1] = g / count;
        output[idx + 2] = b / count;
        output[idx + 3] = a / count;
      }
    }
    return output;
  }

  composite(original: Float32Array, bloom: Float32Array): Float32Array {
    const output = new Float32Array(original.length);
    const intensity = this.config.intensity;

    for (let i = 0; i < original.length; i += 4) {
      output[i] = Math.min(1, original[i] + bloom[i] * intensity);
      output[i + 1] = Math.min(1, original[i + 1] + bloom[i + 1] * intensity);
      output[i + 2] = Math.min(1, original[i + 2] + bloom[i + 2] * intensity);
      output[i + 3] = original[i + 3];
    }
    return output;
  }

  // ---------------------------------------------------------------------------
  // Full Pipeline
  // ---------------------------------------------------------------------------

  apply(pixels: Float32Array, width: number, height: number): Float32Array {
    if (!this.config.enabled) return pixels;
    const bright = this.extractBright(pixels, width, height);
    const blurred = this.blur(bright, width, height);
    return this.composite(pixels, blurred);
  }
}

