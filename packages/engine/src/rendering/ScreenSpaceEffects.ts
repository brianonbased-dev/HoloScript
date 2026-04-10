/**
 * ScreenSpaceEffects.ts
 *
 * Screen-space post-processing effects (CPU simulation / offline renderer):
 *   - SSAO  (Scalable Ambient Obscurance — hemispherical sampling)
 *   - SSR   (Screen-Space Reflections — linear ray march in projection)
 *   - SSGI  (Screen-Space Global Illumination — short-range bounce)
 *   - TAA   (Temporal Anti-Aliasing — history blend with jitter)
 *   - Motion Blur (velocity-buffer blur)
 *   - DOF   (Depth of Field — circle-of-confusion + gather)
 *   - Chromatic Aberration
 *   - Film Grain
 *   - Vignette
 *
 * All operations work on flat Float32Array pixel buffers (RGBA, linear).
 * No WebGPU / DOM — fully testable in Vitest.
 *
 * @module rendering
 */

// =============================================================================
// SHARED TYPES
// =============================================================================

export type PixelBuffer = Float32Array; // RGBA interleaved, linear

function idx(x: number, y: number, w: number): number {
  return (y * w + x) * 4;
}
function clampI(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sample a pixel with bilinear interpolation (clamped at edges) */
function sampleLinear(
  buf: PixelBuffer,
  fx: number,
  fy: number,
  w: number,
  h: number,
  ch = 0
): number {
  const ix = Math.floor(fx),
    iy = Math.floor(fy);
  const tx = fx - ix,
    ty = fy - iy;
  const x0 = clampI(ix, 0, w - 1),
    x1 = clampI(ix + 1, 0, w - 1);
  const y0 = clampI(iy, 0, h - 1),
    y1 = clampI(iy + 1, 0, h - 1);
  const s00 = buf[idx(x0, y0, w) + ch];
  const s10 = buf[idx(x1, y0, w) + ch];
  const s01 = buf[idx(x0, y1, w) + ch];
  const s11 = buf[idx(x1, y1, w) + ch];
  return lerp(lerp(s00, s10, tx), lerp(s01, s11, tx), ty);
}

// =============================================================================
// SSAO
// =============================================================================

export interface SSAOConfig {
  /** Number of hemisphere samples (default 16) */
  samples: number;
  /** Sampling radius in world units */
  radius: number;
  /** Depth bias to prevent self-occlusion */
  bias: number;
  /** 0–1, power curve for occlusion accumulation */
  power: number;
}

const DEFAULT_SSAO: SSAOConfig = { samples: 16, radius: 0.5, bias: 0.025, power: 2 };

/**
 * Compute SSAO occlusion factor per pixel.
 * @param depth - Float32Array, R channel = linear depth (0–1)
 * @param normals - Float32Array, RGB = world-space normal XYZ
 * @returns Float32Array (R only), occlusion 0 (occluded) to 1 (clear)
 */
export function computeSSAO(
  depth: PixelBuffer,
  normals: PixelBuffer,
  width: number,
  height: number,
  config: Partial<SSAOConfig> = {}
): Float32Array {
  const cfg = { ...DEFAULT_SSAO, ...config };
  const occlusion = new Float32Array(width * height);

  // Pseudo-random sample kernel (uniform hemisphere along +Z in view space)
  const kernel: number[] = [];
  for (let i = 0; i < cfg.samples; i++) {
    const phi = Math.acos(1 - 2 * ((i + 0.5) / cfg.samples));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const scale = (i / cfg.samples) ** 2 * 0.9 + 0.1;
    kernel.push(
      Math.sin(phi) * Math.cos(theta) * scale,
      Math.sin(phi) * Math.sin(theta) * scale,
      Math.cos(phi) * scale
    );
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = depth[idx(x, y, width)];
      if (d >= 1) {
        occlusion[y * width + x] = 1;
        continue;
      } // sky

      let occ = 0;
      for (let s = 0; s < cfg.samples; s++) {
        const sx = x + kernel[s * 3] * cfg.radius * width;
        const sy = y + kernel[s * 3 + 1] * cfg.radius * height;
        const sampleDepth = sampleLinear(depth, sx, sy, width, height, 0);
        const rangeCheck = Math.abs(d - sampleDepth) < cfg.radius ? 1 : 0;
        occ += (sampleDepth <= d - cfg.bias ? 1 : 0) * rangeCheck;
      }

      occlusion[y * width + x] = 1 - Math.pow(occ / cfg.samples, cfg.power);
    }
  }
  return occlusion;
}

// =============================================================================
// SSR
// =============================================================================

export interface SSRConfig {
  /** Max ray march steps */
  steps: number;
  /** Step size in screen pixels */
  stepSize: number;
  /** Max roughness threshold (rougher surfaces skip SSR) */
  maxRoughness: number;
  /** Thickness (depth tolerance) */
  thickness: number;
}

const DEFAULT_SSR: SSRConfig = { steps: 32, stepSize: 2, maxRoughness: 0.4, thickness: 0.05 };

/**
 * Screen-space reflection mask: returns a Float32Array (0–1, R channel)
 * indicating reflection presence at each pixel, plus the reflected UV coords.
 */
export function computeSSR(
  color: PixelBuffer,
  depth: PixelBuffer,
  width: number,
  height: number,
  roughness: Float32Array,
  config: Partial<SSRConfig> = {}
): { mask: Float32Array; uvs: Float32Array } {
  const cfg = { ...DEFAULT_SSR, ...config };
  const mask = new Float32Array(width * height);
  const uvs = new Float32Array(width * height * 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (roughness[i] > cfg.maxRoughness) continue;

      const d = depth[idx(x, y, width)];
      if (d >= 1) continue;

      // Simplified: march along a reflected direction in screen space
      // Real SSR would use view-space normals; here we use a simple up-bounce
      let rx = x,
        ry = y - 1;
      let hit = false;

      for (let s = 0; s < cfg.steps; s++) {
        rx += 0;
        ry -= cfg.stepSize; // simplified vertical march
        const cx = Math.round(rx),
          cy = Math.round(ry);
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) break;

        const sd = depth[idx(cx, cy, width)];
        if (sd < d - cfg.thickness) {
          mask[i] = 1 - roughness[i];
          uvs[i * 2] = cx / width;
          uvs[i * 2 + 1] = cy / height;
          hit = true;
          break;
        }
      }
      if (!hit) mask[i] = 0;
    }
  }
  return { mask, uvs };
}

// =============================================================================
// SSGI
// =============================================================================

export interface SSGIConfig {
  /** Sample count per pixel */
  sampleCount: number;
  /** Sampling radius in pixels */
  radius: number;
  /** Intensity multiplier */
  intensity: number;
}

const DEFAULT_SSGI: SSGIConfig = { sampleCount: 8, radius: 16, intensity: 0.5 };

/**
 * Very short-range GI approximation: samples nearby pixels and
 * bleeds their colour onto the current pixel (one-bounce).
 * Returns a Float32Array (RGBA) indirect irradiance buffer.
 */
export function computeSSGI(
  color: PixelBuffer,
  depth: PixelBuffer,
  width: number,
  height: number,
  config: Partial<SSGIConfig> = {}
): PixelBuffer {
  const cfg = { ...DEFAULT_SSGI, ...config };
  const output = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = depth[idx(x, y, width)];
      let r = 0,
        g = 0,
        b = 0,
        w = 0;

      for (let s = 0; s < cfg.sampleCount; s++) {
        const angle = (s / cfg.sampleCount) * 2 * Math.PI;
        const dist = cfg.radius * ((s + 1) / cfg.sampleCount);
        const sx = x + Math.cos(angle) * dist;
        const sy = y + Math.sin(angle) * dist;

        const sd = sampleLinear(depth, sx, sy, width, height, 0);
        const depthSim = 1 / (1 + Math.abs(d - sd) * 10);

        r += sampleLinear(color, sx, sy, width, height, 0) * depthSim;
        g += sampleLinear(color, sx, sy, width, height, 1) * depthSim;
        b += sampleLinear(color, sx, sy, width, height, 2) * depthSim;
        w += depthSim;
      }

      const base = idx(x, y, width);
      if (w > 0) {
        output[base] = (r / w) * cfg.intensity;
        output[base + 1] = (g / w) * cfg.intensity;
        output[base + 2] = (b / w) * cfg.intensity;
        output[base + 3] = 1;
      }
    }
  }
  return output;
}

// =============================================================================
// TAA
// =============================================================================

export interface TAAConfig {
  /** Feedback (history blend) factor: 0 = no history, 1 = full history */
  feedback: number;
  /** Halton jitter scale in screen pixels */
  jitterScale: number;
}

const DEFAULT_TAA: TAAConfig = { feedback: 0.9, jitterScale: 0.5 };

/** Halton sequence (base 2, base 3 for xy jitter) */
export function haltonJitter(frameIndex: number): [number, number] {
  let x = 0,
    f = 0.5,
    i = frameIndex + 1;
  while (i > 0) {
    x += f * (i % 2);
    i = Math.floor(i / 2);
    f *= 0.5;
  }
  let y = 0;
  f = 1 / 3;
  i = frameIndex + 1;
  while (i > 0) {
    y += f * (i % 3);
    i = Math.floor(i / 3);
    f /= 3;
  }
  return [x - 0.5, y - 0.5];
}

/**
 * Blend current frame with history buffer (TAA).
 * history is modified in-place with each call.
 */
export function blendTAA(
  current: PixelBuffer,
  history: PixelBuffer,
  width: number,
  height: number,
  config: Partial<TAAConfig> = {}
): PixelBuffer {
  const cfg = { ...DEFAULT_TAA, ...config };
  const output = new Float32Array(width * height * 4);

  for (let i = 0; i < width * height * 4; i++) {
    output[i] = lerp(current[i], history[i], cfg.feedback);
  }
  // Update history
  history.set(output);
  return output;
}

// =============================================================================
// MOTION BLUR
// =============================================================================

export interface MotionBlurConfig {
  /** Number of blur samples */
  sampleCount: number;
  /** Max blur length in pixels */
  maxLength: number;
}

const DEFAULT_MOTION_BLUR: MotionBlurConfig = { sampleCount: 8, maxLength: 20 };

/**
 * Apply motion blur using a velocity buffer.
 * @param velocity - Float32Array, RG = velocity XY in pixels/frame
 */
export function applyMotionBlur(
  color: PixelBuffer,
  velocity: PixelBuffer,
  width: number,
  height: number,
  config: Partial<MotionBlurConfig> = {}
): PixelBuffer {
  const cfg = { ...DEFAULT_MOTION_BLUR, ...config };
  const output = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = idx(x, y, width);
      const vx = velocity[pi];
      const vy = velocity[pi + 1];
      const len = Math.sqrt(vx * vx + vy * vy);

      if (len < 0.5) {
        output[pi] = color[pi];
        output[pi + 1] = color[pi + 1];
        output[pi + 2] = color[pi + 2];
        output[pi + 3] = color[pi + 3];
        continue;
      }

      const scale = Math.min(1, cfg.maxLength / len);
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let s = 0; s < cfg.sampleCount; s++) {
        const t = (s / (cfg.sampleCount - 1) - 0.5) * scale;
        const sx = x + vx * t,
          sy = y + vy * t;
        r += sampleLinear(color, sx, sy, width, height, 0);
        g += sampleLinear(color, sx, sy, width, height, 1);
        b += sampleLinear(color, sx, sy, width, height, 2);
        a += sampleLinear(color, sx, sy, width, height, 3);
      }
      const n = cfg.sampleCount;
      output[pi] = r / n;
      output[pi + 1] = g / n;
      output[pi + 2] = b / n;
      output[pi + 3] = a / n;
    }
  }
  return output;
}

// =============================================================================
// DEPTH OF FIELD
// =============================================================================

export interface DOFConfig {
  /** Focal depth (0–1 normalized) */
  focalDepth: number;
  /** Focal range — depths within ±range of focalDepth are sharp */
  focalRange: number;
  /** Max CoC radius in pixels */
  maxRadiusPx: number;
  /** Sample count per pixel */
  sampleCount: number;
}

const DEFAULT_DOF: DOFConfig = {
  focalDepth: 0.5,
  focalRange: 0.1,
  maxRadiusPx: 8,
  sampleCount: 12,
};

/** Compute Circle of Confusion radius for a given depth value */
export function computeCoC(depth: number, config: Partial<DOFConfig> = {}): number {
  const cfg = { ...DEFAULT_DOF, ...config };
  const blur = Math.abs(depth - cfg.focalDepth) - cfg.focalRange;
  return blur <= 0 ? 0 : Math.min(cfg.maxRadiusPx, blur * cfg.maxRadiusPx * 10);
}

/**
 * Apply DOF using a disc gather (CPU approximate bokeh).
 */
export function applyDOF(
  color: PixelBuffer,
  depth: PixelBuffer,
  width: number,
  height: number,
  config: Partial<DOFConfig> = {}
): PixelBuffer {
  const cfg = { ...DEFAULT_DOF, ...config };
  const output = new Float32Array(width * height * 4);

  // Precompute disc samples (Poisson-like)
  const disc: number[] = [];
  for (let s = 0; s < cfg.sampleCount; s++) {
    const phi = (s / cfg.sampleCount) * 2 * Math.PI;
    const r = Math.sqrt((s + 1) / cfg.sampleCount);
    disc.push(Math.cos(phi) * r, Math.sin(phi) * r);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = depth[idx(x, y, width)];
      const coc = computeCoC(d, cfg);

      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let s = 0; s < cfg.sampleCount; s++) {
        const sx = x + disc[s * 2] * coc;
        const sy = y + disc[s * 2 + 1] * coc;
        r += sampleLinear(color, sx, sy, width, height, 0);
        g += sampleLinear(color, sx, sy, width, height, 1);
        b += sampleLinear(color, sx, sy, width, height, 2);
        a += sampleLinear(color, sx, sy, width, height, 3);
      }
      const pi = idx(x, y, width);
      const n = cfg.sampleCount;
      output[pi] = r / n;
      output[pi + 1] = g / n;
      output[pi + 2] = b / n;
      output[pi + 3] = a / n;
    }
  }
  return output;
}

// =============================================================================
// CHROMATIC ABERRATION
// =============================================================================

export interface ChromaticAberrationConfig {
  /** Aberration offset in pixels at the screen edge */
  strength: number;
}

/**
 * Chromatic aberration (RGB channel offset towards edges).
 */
export function applyChromaticAberration(
  color: PixelBuffer,
  width: number,
  height: number,
  config: Partial<ChromaticAberrationConfig> & { strength?: number } = {}
): PixelBuffer {
  const strength = config.strength ?? 2;
  const output = new Float32Array(width * height * 4);
  const cx = width / 2,
    cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx,
        dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = dist * strength;

      const pi = idx(x, y, width);
      output[pi] = sampleLinear(color, x + dx * offset, y + dy * offset, width, height, 0);
      output[pi + 1] = color[pi + 1]; // Green unchanged
      output[pi + 2] = sampleLinear(color, x - dx * offset, y - dy * offset, width, height, 2);
      output[pi + 3] = color[pi + 3];
    }
  }
  return output;
}

// =============================================================================
// FILM GRAIN
// =============================================================================

/**
 * Add film grain noise.
 * @param intensity 0–1, grain strength
 * @param seed Deterministic seed for repeatable grain pattern
 */
export function applyFilmGrain(
  color: PixelBuffer,
  width: number,
  height: number,
  intensity: number,
  seed = 0
): PixelBuffer {
  const output = new Float32Array(color);
  for (let i = 0; i < width * height; i++) {
    // LCG random per pixel
    const rand = (Math.sin((i + seed) * 127.1 + 311.7) * 43758.5453) % 1;
    const grain = (rand - 0.5) * 2 * intensity;
    const pi = i * 4;
    output[pi] = Math.max(0, Math.min(1, color[pi] + grain));
    output[pi + 1] = Math.max(0, Math.min(1, color[pi + 1] + grain));
    output[pi + 2] = Math.max(0, Math.min(1, color[pi + 2] + grain));
    // Alpha untouched
  }
  return output;
}

// =============================================================================
// VIGNETTE
// =============================================================================

/**
 * Apply a radial vignette (darker at corners).
 * @param strength 0–1
 * @param radius 0–1, the point where vignette begins
 */
export function applyVignette(
  color: PixelBuffer,
  width: number,
  height: number,
  strength: number,
  radius = 0.75
): PixelBuffer {
  const output = new Float32Array(color);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x / width - 0.5) * 2;
      const dy = (y / height - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vignetteFactor = 1 - (Math.max(0, dist - radius) / (1 - radius + 1e-6)) * strength;
      const pi = idx(x, y, width);
      output[pi] *= vignetteFactor;
      output[pi + 1] *= vignetteFactor;
      output[pi + 2] *= vignetteFactor;
    }
  }
  return output;
}

