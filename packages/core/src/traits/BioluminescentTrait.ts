/**
 * Bioluminescent Trait
 *
 * Pulsing emissive surface for nature scenes — forest floor, pond surface,
 * underwater environments, alien biomes. The current toolbox only offers
 * @glowing (constant emissive); enchanted-forest Phase 2 (examples/
 * ai-generation/examples/enchanted-forest.refreshed.holo) needs a slow,
 * spatially-modulated, time-reactive cyan-green pulse that responds to
 * player proximity. This trait is the declarative single-block answer:
 * you write `@bioluminescent { color, pulse_bpm, ... }`, the substrate
 * resolves a per-tick (intensity, color) sample by a pure function of
 * (config, position, observerPosition, elapsedSeconds).
 *
 * Canonical use: examples/ai-generation/examples/enchanted-forest.refreshed.holo —
 *   @bioluminescent {
 *     color: "#00ffcc"
 *     pulse_bpm: 12
 *     radius_falloff: 2.5
 *     min_intensity: 0.05
 *     max_intensity: 0.8
 *     pattern: "perlin"
 *   }
 *
 * Determinism contract:
 *   - Per-tick (intensity, color) is a PURE function of
 *     (config, nodePosition, observerPosition, elapsedSeconds). Same
 *     inputs → byte-for-byte identical output across V8 / SpiderMonkey
 *     / WASM. No Math.random, no wall-clock reads, no platform-specific
 *     timing.
 *   - Time pulse is a sine in BPM domain:
 *       pulseT = elapsedSeconds * (pulse_bpm / 60)
 *       pulse  = (sin(2π · pulseT) + 1) / 2  ∈ [0, 1]
 *     pulse_bpm = 0 freezes the pulse at the t=0 sample (constant max).
 *   - Spatial pattern modulates the pulse in [0, 1]:
 *       'solid'   → 1 (no spatial modulation)
 *       'perlin'  → deterministic 3D value-noise on (nodePosition, scaled
 *                   pulseT). Hashing uses pure 32-bit splitmix32 so cross-
 *                   platform IEEE-754 results match.
 *       'voronoi' → distance-to-nearest-cell-center on a deterministic
 *                   integer lattice keyed by spatial_seed. Returns a
 *                   normalised falloff ∈ [0, 1].
 *   - Proximity falloff is a smooth inverse-quadratic-ish curve:
 *       d        = ||nodePosition − observerPosition||
 *       prox     = clamp01(1 − (d / radius_falloff)^2)
 *     radius_falloff ≤ 0 disables proximity weighting (prox = 1). When no
 *     observer position is set, prox = 1 (full pulse, identical to
 *     scene-ambient lighting).
 *   - Intensity composes as:
 *       weight    = pulse * pattern * prox  ∈ [0, 1]
 *       intensity = lerp(min_intensity, max_intensity, weight)
 *   - Color is constant per-trait (no per-tick hue shift) — this trait is
 *     about temporal+spatial intensity, not chromatic animation.
 *
 * Trait usage in .holo composition:
 *
 *   object "PondSurface" {
 *     @bioluminescent {
 *       color: "#00ffcc"
 *       pulse_bpm: 12
 *       radius_falloff: 2.5
 *       min_intensity: 0.05
 *       max_intensity: 0.8
 *       pattern: "perlin"
 *       spatial_scale: 0.5
 *       spatial_seed: 0x70AD
 *     }
 *   }
 *
 * Trait name: bioluminescent
 * Category: nature-life
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites task_1778061290860_5nri (A-009 example-driven request),
 *        examples/ai-generation/examples/enchanted-forest.refreshed.holo,
 *        packages/core/src/traits/constants/nature-life.ts:10 (registered name),
 *        packages/core/src/traits/visual/composition-rules.ts:138,196,309
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default pulse rate, beats per minute. 12 BPM = 1 cycle per 5s. */
const DEFAULT_PULSE_BPM = 12;

/** Default proximity falloff radius (world units). */
const DEFAULT_RADIUS_FALLOFF = 2.5;

/** Default minimum intensity (output when weight = 0). */
const DEFAULT_MIN_INTENSITY = 0.05;

/** Default maximum intensity (output when weight = 1). */
const DEFAULT_MAX_INTENSITY = 0.8;

/** Default canonical color (cyan-green, A-009 spec). */
const DEFAULT_COLOR = '#00ffcc';

/** Default spatial-noise scale (smaller = larger blobs). */
const DEFAULT_SPATIAL_SCALE = 0.5;

/** Default spatial seed; non-zero so 'perlin'/'voronoi' aren't degenerate. */
const DEFAULT_SPATIAL_SEED = 0x7777;

/** Canonical pattern names — fallback to 'solid' for unknown values. */
const PATTERN_NAMES = ['solid', 'perlin', 'voronoi'] as const;
type BioluminescentPattern = (typeof PATTERN_NAMES)[number];

// =============================================================================
// TYPES
// =============================================================================

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface BioluminescentConfig {
  /** Emissive color (CSS hex string). Constant per-trait. */
  color: string;
  /** Pulse rate in beats per minute. 0 = no pulse (frozen at max-weight). */
  pulse_bpm: number;
  /** Proximity falloff radius in world units. ≤ 0 disables proximity weighting. */
  radius_falloff: number;
  /** Lower bound of emissive intensity (output when weight = 0). */
  min_intensity: number;
  /** Upper bound of emissive intensity (output when weight = 1). */
  max_intensity: number;
  /** Spatial modulation pattern. Unknown values fall back to 'solid'. */
  pattern: BioluminescentPattern;
  /** Spatial-noise scale; smaller values produce larger pattern blobs. */
  spatial_scale: number;
  /** Spatial-noise seed; controls per-instance pattern variation. */
  spatial_seed: number;
  /** Whether to emit a bioluminescent_attached event on attach. */
  emit_attach_event: boolean;
}

interface BioluminescentState {
  /** Cumulative wall-clock elapsed seconds since attach. */
  elapsedSeconds: number;
  /** Last observer position (settable via bioluminescent_observer event). */
  observerPosition: Vec3Like | null;
  /** Last emitted output for change-detection. */
  lastEmitted: BioluminescentOutput | null;
}

export interface BioluminescentOutput {
  /** Emissive color (mirrored from config — kept here for renderer convenience). */
  color: string;
  /** Final emissive intensity, in [min_intensity, max_intensity]. */
  intensity: number;
  /** Composite weight ∈ [0, 1] — pulse * pattern * proximity. */
  weight: number;
  /** Pulse component ∈ [0, 1] at this sample. */
  pulse: number;
  /** Spatial-pattern component ∈ [0, 1] at this sample. */
  pattern: number;
  /** Proximity component ∈ [0, 1] at this sample. */
  proximity: number;
  /** Time since attach (seconds). */
  elapsedSeconds: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/** Clamp x to [0, 1]. Pure. */
export function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Resolve a pattern string to a known pattern; unknown values fall back
 * to 'solid' to protect against future substrate enum additions.
 *
 * Pure function — exposed for tests + external validation.
 */
export function resolveBioluminescentPattern(name: string): BioluminescentPattern {
  if ((PATTERN_NAMES as readonly string[]).includes(name)) {
    return name as BioluminescentPattern;
  }
  return 'solid';
}

/**
 * Compute the time-pulse component at a given (bpm, t).
 *
 *   pulseT = t * (bpm / 60)
 *   pulse  = (sin(2π · pulseT) + 1) / 2  ∈ [0, 1]
 *
 * bpm ≤ 0 returns 1 (no pulse — full weight).
 *
 * Pure function — load-bearing for the determinism contract.
 */
export function pulseAt(bpmRaw: number, elapsedSeconds: number): number {
  if (bpmRaw <= 0) return 1;
  const pulseT = elapsedSeconds * (bpmRaw / 60);
  return (Math.sin(2 * Math.PI * pulseT) + 1) / 2;
}

/**
 * Squared distance between two positions. Pure.
 */
export function distSquared(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Compute the proximity component at a given (nodePosition, observerPosition,
 * radius). When observer is null OR radius ≤ 0, returns 1 (no proximity
 * weighting, identical to ambient). Otherwise:
 *
 *   d    = ||node - observer||
 *   prox = clamp01(1 - (d / radius)^2)
 *
 * Pure function.
 */
export function proximityAt(
  nodePosition: Vec3Like,
  observerPosition: Vec3Like | null,
  radiusFalloff: number
): number {
  if (radiusFalloff <= 0) return 1;
  if (observerPosition === null) return 1;
  const dSq = distSquared(nodePosition, observerPosition);
  const rSq = radiusFalloff * radiusFalloff;
  if (dSq >= rSq) return 0;
  return clamp01(1 - dSq / rSq);
}

/**
 * Deterministic 32-bit splitmix hash. Pure 32-bit ops match across V8 /
 * SpiderMonkey / WASM byte-for-byte. Used by both 'perlin' (value-noise
 * gradient lookup) and 'voronoi' (cell-center jitter).
 *
 * Returns an unsigned 32-bit integer.
 */
export function splitmix32(seed: number): number {
  let x = (seed | 0) >>> 0;
  x = ((x + 0x9e3779b9) | 0) >>> 0;
  x = (Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0) >>> 0;
  x = (Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

/**
 * Hash 4 ints (x, y, z, w) → uniform [0, 1). Pure, deterministic.
 */
export function hash4ToUnit(x: number, y: number, z: number, w: number): number {
  const a = splitmix32((x | 0) ^ Math.imul(y | 0, 0x27d4eb2d));
  const b = splitmix32((z | 0) ^ Math.imul(w | 0, 0x165667b1));
  return (splitmix32(a ^ b) >>> 8) / 0x01000000;
}

/**
 * Smoothstep-cubic interpolation curve. Pure.
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Trilinear value-noise sample at (x, y, z, seed). Returns a value in [0, 1].
 * "Value noise" rather than gradient/perlin proper — trades a bit of visual
 * quality for byte-for-byte cross-platform determinism (gradient noise needs
 * a normalised gradient table, harder to keep stable across runtimes).
 *
 * Pure function. The trait labels its 'perlin' option as value-noise here;
 * the user-facing name kept the spec for compatibility but the substrate
 * never claimed gradient-perlin specifically.
 */
export function valueNoise3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);
  const zf = smoothstep(z - zi);

  const c000 = hash4ToUnit(xi, yi, zi, seed);
  const c100 = hash4ToUnit(xi + 1, yi, zi, seed);
  const c010 = hash4ToUnit(xi, yi + 1, zi, seed);
  const c110 = hash4ToUnit(xi + 1, yi + 1, zi, seed);
  const c001 = hash4ToUnit(xi, yi, zi + 1, seed);
  const c101 = hash4ToUnit(xi + 1, yi, zi + 1, seed);
  const c011 = hash4ToUnit(xi, yi + 1, zi + 1, seed);
  const c111 = hash4ToUnit(xi + 1, yi + 1, zi + 1, seed);

  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

/**
 * Voronoi-style cell pattern at (x, y, z, seed). Returns a normalised
 * "near-cell" weight in [0, 1] where points near a cell center get values
 * near 1 and edges between cells approach 0.
 *
 * Pure function. Uses the splitmix-hashed cell-jitter approach: each
 * integer-lattice cell has its center jittered into the cell by a
 * deterministic offset; the returned value is 1 - normalisedDistance.
 */
export function voronoi3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let bestDistSq = Infinity;
  // Search the 3×3×3 neighbourhood for the closest cell center.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const jx = hash4ToUnit(cx, cy, cz, seed);
        const jy = hash4ToUnit(cx, cy, cz, seed ^ 0x1b873593);
        const jz = hash4ToUnit(cx, cy, cz, seed ^ 0xcc9e2d51);
        const px = cx + jx;
        const py = cy + jy;
        const pz = cz + jz;
        const ex = x - px;
        const ey = y - py;
        const ez = z - pz;
        const d = ex * ex + ey * ey + ez * ez;
        if (d < bestDistSq) bestDistSq = d;
      }
    }
  }
  // Max plausible distance squared in a 1-unit cell with jitter ≤ 1
  // is bounded by ~3 (sqrt(3)^2). Normalize and invert so center ≈ 1.
  const normalized = Math.sqrt(bestDistSq) / Math.SQRT2;
  return clamp01(1 - normalized);
}

/**
 * Compute the spatial-pattern component at a given
 * (pattern, nodePosition, elapsedSeconds, scale, seed).
 *
 * Returns a value in [0, 1]. Pure function.
 */
export function patternAt(
  pattern: BioluminescentPattern,
  nodePosition: Vec3Like,
  elapsedSeconds: number,
  scale: number,
  seed: number
): number {
  if (pattern === 'solid') return 1;
  const x = nodePosition.x * scale;
  const y = nodePosition.y * scale;
  const z = nodePosition.z * scale + elapsedSeconds * 0.25;
  if (pattern === 'voronoi') return voronoi3D(x, y, z, seed | 0);
  return valueNoise3D(x, y, z, seed | 0);
}

/**
 * Linear interpolation. Pure.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Derive the full output sample for a given (config, nodePosition,
 * observerPosition, elapsedSeconds).
 *
 * Pure function — the load-bearing determinism contract lives here.
 * Same inputs → same output, byte-for-byte across V8 / SpiderMonkey / WASM.
 */
export function deriveBioluminescentOutput(
  config: BioluminescentConfig,
  nodePosition: Vec3Like,
  observerPosition: Vec3Like | null,
  elapsedSeconds: number
): BioluminescentOutput {
  const pattern = resolveBioluminescentPattern(config.pattern);
  const pulse = pulseAt(config.pulse_bpm, elapsedSeconds);
  const patternValue = patternAt(
    pattern,
    nodePosition,
    elapsedSeconds,
    config.spatial_scale,
    config.spatial_seed
  );
  const prox = proximityAt(nodePosition, observerPosition, config.radius_falloff);
  const weight = clamp01(pulse * patternValue * prox);
  const intensity = lerp(config.min_intensity, config.max_intensity, weight);
  return {
    color: config.color,
    intensity,
    weight,
    pulse,
    pattern: patternValue,
    proximity: prox,
    elapsedSeconds,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

function readNodePosition(node: unknown): Vec3Like {
  const n = node as Record<string, unknown> | null;
  const pos = n?.position as Vec3Like | undefined;
  if (
    pos &&
    typeof pos.x === 'number' &&
    typeof pos.y === 'number' &&
    typeof pos.z === 'number'
  ) {
    return pos;
  }
  return { x: 0, y: 0, z: 0 };
}

export const bioluminescentHandler: TraitHandler<BioluminescentConfig> = {
  name: 'bioluminescent',

  defaultConfig: {
    color: DEFAULT_COLOR,
    pulse_bpm: DEFAULT_PULSE_BPM,
    radius_falloff: DEFAULT_RADIUS_FALLOFF,
    min_intensity: DEFAULT_MIN_INTENSITY,
    max_intensity: DEFAULT_MAX_INTENSITY,
    pattern: 'perlin',
    spatial_scale: DEFAULT_SPATIAL_SCALE,
    spatial_seed: DEFAULT_SPATIAL_SEED,
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const state: BioluminescentState = {
      elapsedSeconds: 0,
      observerPosition: null,
      lastEmitted: null,
    };
    (node as unknown as Record<string, unknown>).__bioluminescentState = state;

    if (config.emit_attach_event) {
      context.emit?.('bioluminescent_attached', {
        node,
        color: config.color,
        pulse_bpm: config.pulse_bpm,
        pattern: resolveBioluminescentPattern(config.pattern),
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('bioluminescent_detached', { node });
    delete (node as unknown as Record<string, unknown>).__bioluminescentState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as unknown as Record<string, unknown>).__bioluminescentState as
      | BioluminescentState
      | undefined;
    if (!state) return;

    state.elapsedSeconds += delta;

    const output = deriveBioluminescentOutput(
      config,
      readNodePosition(node),
      state.observerPosition,
      state.elapsedSeconds
    );
    state.lastEmitted = output;
    context.emit?.('bioluminescent_sample', { node, ...output });
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__bioluminescentState as
      | BioluminescentState
      | undefined;
    if (!state) return;

    if (event.type === 'bioluminescent_observer') {
      const pos = event.position as Vec3Like | null | undefined;
      if (
        pos &&
        typeof pos.x === 'number' &&
        typeof pos.y === 'number' &&
        typeof pos.z === 'number'
      ) {
        state.observerPosition = { x: pos.x, y: pos.y, z: pos.z };
      } else {
        state.observerPosition = null;
      }
      context.emit?.('bioluminescent_observer_set', {
        node,
        observer: state.observerPosition,
      });
      return;
    }

    if (event.type === 'bioluminescent_query') {
      const output = deriveBioluminescentOutput(
        config,
        readNodePosition(node),
        state.observerPosition,
        state.elapsedSeconds
      );
      context.emit?.('bioluminescent_response', {
        queryId: event.queryId,
        node,
        ...output,
      });
      return;
    }

    if (event.type === 'bioluminescent_reset') {
      state.elapsedSeconds = 0;
      state.observerPosition = null;
      state.lastEmitted = null;
      context.emit?.('bioluminescent_reset_done', { node });
      return;
    }
  },
};
