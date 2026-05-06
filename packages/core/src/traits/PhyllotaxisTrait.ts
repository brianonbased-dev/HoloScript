/**
 * Phyllotaxis Trait
 *
 * Deterministic golden-angle (Vogel) spiral placement for petal-like layouts.
 * Computes the (x, y, z) position of an indexed element on a phyllotactic
 * spiral as a pure function of (index, seed, layer geometry). Same inputs →
 * byte-for-byte identical output across runs and platforms.
 *
 * The canonical use is the lotus seedable artifact (examples/lotus-flower/
 * garden.seedable.holo): 8 + 13 + 21 = 42 petals on a continuous golden-angle
 * spiral, indexed globally across three Fibonacci-sized concentric layers.
 *
 * Determinism contract:
 *   - Position is computed from petal_index + seed + layer_radii + layer_counts
 *     using only IEEE-754 double-precision arithmetic. No Math.random, no
 *     wall-clock, no platform-dependent randomness.
 *   - Per-petal jitter (when enabled) uses a deterministic SeedHKDF-style
 *     splitmix64 PRNG seeded by (seed XOR petal_index). The hash is computed
 *     in pure 32-bit ops so it matches across V8 / SpiderMonkey / WASM.
 *   - The golden angle is exactly 360 / phi^2 degrees (137.50776405003785°).
 *
 * Trait usage in .holo composition:
 *
 *   object "Petal-0" {
 *     @phyllotaxis {
 *       petal_index: 0
 *       layer_radii: [2.0, 3.4, 4.8]
 *       layer_counts: [8, 13, 21]
 *       seed: env('LOTUS_GENESIS_SEED', '0x0000DEAD')
 *       y_offset: 1.5
 *       jitter: 0.0
 *     }
 *   }
 *
 * Trait name: phyllotaxis
 * Category: layout
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites I.007, W.137 (Frame Drift trait-binding layer), idea-run-11
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Golden ratio φ = (1 + √5) / 2.
 * Computed at module load with full IEEE-754 precision.
 */
const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Golden angle in radians: 2π · (1 - 1/φ) = 2π / φ² ≈ 2.39996322...
 * Equivalent to 137.50776405003785° in degrees.
 *
 * This is the divergence angle that minimises overlap on a Vogel spiral —
 * the same arrangement seen in sunflower seeds, pine cones, and lotus petals.
 */
const GOLDEN_ANGLE_RAD = 2 * Math.PI * (1 - 1 / PHI);

/** Golden angle in degrees, exposed for external verification / docs. */
export const GOLDEN_ANGLE_DEG = (GOLDEN_ANGLE_RAD * 180) / Math.PI;

// =============================================================================
// TYPES
// =============================================================================

interface PhyllotaxisConfig {
  /** Global index of this petal across all layers (0..N-1). */
  petal_index: number;
  /** Radius of each concentric layer, inner → outer. */
  layer_radii: number[];
  /** Petal count per layer; sum should equal total petal count. */
  layer_counts: number[];
  /** Seed string (e.g. '0x0000DEAD' or env('LOTUS_GENESIS_SEED')). Hashed to a 32-bit integer. */
  seed: string;
  /** Vertical offset applied to every petal (Y axis). */
  y_offset: number;
  /** Per-petal jitter magnitude in metres. 0 = pure phyllotaxis. */
  jitter: number;
  /** Optional rotation offset in degrees applied to the whole spiral. */
  rotation_offset_deg: number;
  /** Whether to emit a phyllotaxis_placed event on attach. */
  emit_placement_event: boolean;
}

interface PhyllotaxisState {
  /** The deterministic (x, y, z) position assigned at attach time. */
  position: [number, number, number];
  /** Which layer this petal belongs to (0-indexed). */
  layer_index: number;
  /** Index within its own layer. */
  index_in_layer: number;
  /** Angle on the spiral in radians. */
  angle_rad: number;
  /** Computed seed hash (32-bit). */
  seed_hash: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Hash a seed string to a 32-bit unsigned integer using FNV-1a.
 *
 * Pure 32-bit arithmetic — output is identical on every platform.
 * Strings starting with '0x' are interpreted as hex first; non-hex strings
 * are hashed as UTF-16 code units.
 */
export function hashSeed(seed: string): number {
  // Try hex parse first — '0x0000DEAD' style
  if (typeof seed === 'string' && /^0x[0-9a-fA-F]+$/.test(seed)) {
    // Truncate to 32 bits via BigInt to avoid precision loss on long hex
    const big = BigInt(seed) & 0xffffffffn;
    return Number(big) >>> 0;
  }

  // FNV-1a over UTF-16 code units
  let hash = 0x811c9dc5; // FNV offset basis
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime multiplication via Math.imul to stay in i32
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Splitmix32 — a tiny deterministic PRNG step that takes a 32-bit state
 * and returns a 32-bit pseudo-random value plus the next state.
 *
 * Used to derive per-petal jitter without ever calling Math.random.
 */
function splitmix32(state: number): { value: number; next: number } {
  let z = (state + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  return { value: z, next: (state + 0x9e3779b9) >>> 0 };
}

/** Convert a 32-bit unsigned int to a float in [-1, 1) deterministically. */
function uintToBipolarFloat(u: number): number {
  // Map [0, 2^32) → [-1, 1)
  return (u / 0x80000000) - 1;
}

/**
 * Compute the deterministic (x, y, z) position of petal `petalIndex`.
 *
 * Pure function — exposed so tests can assert byte-for-byte determinism
 * without going through the trait handler lifecycle.
 *
 * Layer assignment: walk layer_counts left → right; petal `i` belongs to
 * the first layer whose cumulative count strictly exceeds `i`.
 */
export function computePhyllotaxisPosition(
  petalIndex: number,
  config: Pick<
    PhyllotaxisConfig,
    'layer_radii' | 'layer_counts' | 'seed' | 'y_offset' | 'jitter' | 'rotation_offset_deg'
  >
): {
  position: [number, number, number];
  layerIndex: number;
  indexInLayer: number;
  angleRad: number;
  seedHash: number;
} {
  const seedHash = hashSeed(config.seed);
  const rotationOffsetRad = ((config.rotation_offset_deg || 0) * Math.PI) / 180;

  // Walk cumulative layer counts to find this petal's layer
  let layerIndex = 0;
  let indexInLayer = petalIndex;
  let cumulative = 0;
  for (let l = 0; l < config.layer_counts.length; l++) {
    const next = cumulative + config.layer_counts[l];
    if (petalIndex < next) {
      layerIndex = l;
      indexInLayer = petalIndex - cumulative;
      break;
    }
    cumulative = next;
    // Past the end → clamp to last layer
    if (l === config.layer_counts.length - 1) {
      layerIndex = l;
      indexInLayer = petalIndex - cumulative;
    }
  }

  const radius =
    config.layer_radii[layerIndex] ?? config.layer_radii[config.layer_radii.length - 1] ?? 1;

  // Continuous spiral: angle uses the GLOBAL petalIndex so layers blend
  // smoothly — exactly the lotus garden.seedable.holo contract.
  const angleRad = petalIndex * GOLDEN_ANGLE_RAD + rotationOffsetRad;

  let x = radius * Math.cos(angleRad);
  let z = radius * Math.sin(angleRad);
  let y = config.y_offset;

  // Deterministic jitter, seeded per-petal
  if (config.jitter > 0) {
    const baseState = (seedHash ^ petalIndex) >>> 0;
    const a = splitmix32(baseState);
    const b = splitmix32(a.value);
    const c = splitmix32(b.value);
    x += uintToBipolarFloat(a.value) * config.jitter;
    y += uintToBipolarFloat(b.value) * config.jitter;
    z += uintToBipolarFloat(c.value) * config.jitter;
  }

  return {
    position: [x, y, z],
    layerIndex,
    indexInLayer,
    angleRad,
    seedHash,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const phyllotaxisHandler: TraitHandler<PhyllotaxisConfig> = {
  name: 'phyllotaxis',

  defaultConfig: {
    petal_index: 0,
    layer_radii: [2.0, 3.4, 4.8],
    layer_counts: [8, 13, 21],
    seed: '0x0000DEAD',
    y_offset: 0,
    jitter: 0,
    rotation_offset_deg: 0,
    emit_placement_event: true,
  },

  onAttach(node, config, context) {
    const computed = computePhyllotaxisPosition(config.petal_index, config);

    const state: PhyllotaxisState = {
      position: computed.position,
      layer_index: computed.layerIndex,
      index_in_layer: computed.indexInLayer,
      angle_rad: computed.angleRad,
      seed_hash: computed.seedHash,
    };
    (node as unknown as Record<string, unknown>).__phyllotaxisState = state;

    // Apply position to the node so downstream traits / renderers see it.
    // We write directly because phyllotaxis is a placement primitive — it
    // OWNS the position field for the lifetime of the node.
    (node as unknown as { position?: [number, number, number] }).position = [
      computed.position[0],
      computed.position[1],
      computed.position[2],
    ];

    if (config.emit_placement_event) {
      context.emit?.('phyllotaxis_placed', {
        node,
        petalIndex: config.petal_index,
        position: computed.position,
        layerIndex: computed.layerIndex,
        indexInLayer: computed.indexInLayer,
        angleRad: computed.angleRad,
        angleDeg: (computed.angleRad * 180) / Math.PI,
        seedHash: computed.seedHash,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('phyllotaxis_unplaced', { node });
    delete (node as unknown as Record<string, unknown>).__phyllotaxisState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Phyllotaxis is a static placement primitive — no per-frame work.
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__phyllotaxisState as
      | PhyllotaxisState
      | undefined;
    if (!state) return;

    if (event.type === 'phyllotaxis_query') {
      context.emit?.('phyllotaxis_response', {
        queryId: event.queryId,
        node,
        position: state.position,
        layerIndex: state.layer_index,
        indexInLayer: state.index_in_layer,
        angleRad: state.angle_rad,
        seedHash: state.seed_hash,
      });
    } else if (event.type === 'phyllotaxis_reseed') {
      // Seed swap — recompute placement (e.g. genesis trigger fires and the
      // seed flips from staged 0x0000DEAD → first-16-bytes(events[0].hash)).
      const newSeed = (event.seed as string) ?? config.seed;
      const computed = computePhyllotaxisPosition(config.petal_index, {
        ...config,
        seed: newSeed,
      });
      state.position = computed.position;
      state.layer_index = computed.layerIndex;
      state.index_in_layer = computed.indexInLayer;
      state.angle_rad = computed.angleRad;
      state.seed_hash = computed.seedHash;

      (node as unknown as { position?: [number, number, number] }).position = [
        computed.position[0],
        computed.position[1],
        computed.position[2],
      ];

      context.emit?.('phyllotaxis_placed', {
        node,
        petalIndex: config.petal_index,
        position: computed.position,
        layerIndex: computed.layerIndex,
        indexInLayer: computed.indexInLayer,
        angleRad: computed.angleRad,
        angleDeg: (computed.angleRad * 180) / Math.PI,
        seedHash: computed.seedHash,
        reseeded: true,
      });
    }
  },
};

export default phyllotaxisHandler;
