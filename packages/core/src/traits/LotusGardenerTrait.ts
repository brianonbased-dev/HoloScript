/**
 * Lotus Gardener Trait
 *
 * Tending/maintenance trait for "Brittney" (the gardener mesh) in the lotus
 * seedable artifact. The gardener trait schedules emissive pulses and
 * water-droplet emitter triggers on a deterministic interval that is
 * MODULATED by aggregate bloom state — when the lotus is sealed/budding,
 * the gardener is busiest (more droplets, brighter pulses); when the lotus
 * is full, the gardener idles (rare slow pulses). Wilted state pushes the
 * gardener into emergency mode (fast urgent pulses).
 *
 * Composition:
 *   Brittney's mesh node carries @animated { clip: "idle_gardener" }. This
 *   trait does NOT replace that animation — it INSERTS pulse events on a
 *   schedule the renderer can drive its own emissive layer with, and
 *   triggers droplet emitters owned by the @gpu_particle layer.
 *
 * Determinism:
 *   - Pulse schedule is a deterministic function of (bloom_state, accumulated
 *     time-since-last-pulse). The trait DOES use onUpdate (delta-driven
 *     scheduling) but never reads wall-clock and never calls Math.random —
 *     all randomness is splitmix32 keyed by an integer pulse counter.
 *   - The droplet payload (count, lifetime variance) is a pure function of
 *     bloom_state.
 *
 * Trait name: lotus_gardener
 * Category: lotus / tending
 *
 * @version 1.0.0
 * @cites I.007, W.137, task_1778093521547_nx7h
 */

import type { TraitHandler } from './TraitTypes';
import type { LotusAggregateBloomState } from './LotusRootTrait';

// =============================================================================
// TYPES
// =============================================================================

interface LotusGardenerConfig {
  /** State key for aggregate bloom state. */
  bloom_state_source: string;
  /** Base interval (seconds) between pulses when state is `sealed`. */
  base_pulse_interval_s: number;
  /** Base intensity for emissive pulses (1.0 reference). */
  base_pulse_intensity: number;
  /** Base droplet count per pulse. */
  base_droplet_count: number;
  /** Whether to emit lotus_gardener_attached on attach. */
  emit_attach_event: boolean;
  /** Seed string for deterministic pulse-counter randomness. */
  seed: string;
}

interface LotusGardenerSchedule {
  /** Time-multiplier applied to base_pulse_interval_s. <1 = busier. */
  interval_mult: number;
  /** Intensity multiplier applied to base_pulse_intensity. */
  intensity_mult: number;
  /** Droplet-count multiplier applied to base_droplet_count. */
  droplet_mult: number;
  /** True if the gardener is in emergency tending (wilted). */
  emergency_mode: boolean;
}

interface LotusGardenerState {
  observed_state: LotusAggregateBloomState;
  schedule: LotusGardenerSchedule;
  /** Seconds since the last pulse fired. */
  time_since_last_pulse: number;
  /** Monotonic pulse counter — drives splitmix32 jitter. */
  pulse_counter: number;
  /** Cached seed hash. */
  seed_hash: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/** Hash a seed string to a 32-bit unsigned integer (FNV-1a; matches PhyllotaxisTrait). */
export function hashGardenerSeed(seed: string): number {
  if (typeof seed === 'string' && /^0x[0-9a-fA-F]+$/.test(seed)) {
    const big = BigInt(seed) & 0xffffffffn;
    return Number(big) >>> 0;
  }
  let hash = 0x811c9dc5;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Splitmix32 step (matches PhyllotaxisTrait). */
function splitmix32(state: number): number {
  let z = (state + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  z = (z ^ (z >>> 15)) >>> 0;
  return z;
}

/**
 * Derive the gardener's schedule from aggregate bloom state. Pure.
 *
 * Tending intensity model:
 *   sealed   → busiest (1.0 interval, 1.0 intensity, 1.0 droplets)
 *   budding  → still busy (1.2 interval, 1.0 intensity, 0.85 droplets)
 *   blooming → calmer (1.8 interval, 0.85 intensity, 0.6 droplets)
 *   full     → idle (4.0 interval, 0.6 intensity, 0.3 droplets)
 *   wilted   → emergency (0.5 interval, 1.5 intensity, 1.5 droplets, urgent flag)
 */
export function deriveLotusGardenerSchedule(
  state: LotusAggregateBloomState
): LotusGardenerSchedule {
  switch (state) {
    case 'sealed':
      return {
        interval_mult: 1.0,
        intensity_mult: 1.0,
        droplet_mult: 1.0,
        emergency_mode: false,
      };
    case 'budding':
      return {
        interval_mult: 1.2,
        intensity_mult: 1.0,
        droplet_mult: 0.85,
        emergency_mode: false,
      };
    case 'blooming':
      return {
        interval_mult: 1.8,
        intensity_mult: 0.85,
        droplet_mult: 0.6,
        emergency_mode: false,
      };
    case 'full':
      return {
        interval_mult: 4.0,
        intensity_mult: 0.6,
        droplet_mult: 0.3,
        emergency_mode: false,
      };
    case 'wilted':
      return {
        interval_mult: 0.5,
        intensity_mult: 1.5,
        droplet_mult: 1.5,
        emergency_mode: true,
      };
    default:
      return {
        interval_mult: 1.0,
        intensity_mult: 1.0,
        droplet_mult: 1.0,
        emergency_mode: false,
      };
  }
}

/**
 * Compute the deterministic per-pulse jitter triple in [-1, 1).
 * Pure function of (seed_hash, pulse_counter). Exposed for tests.
 */
export function gardenerPulseJitter(
  seedHash: number,
  pulseCounter: number
): { interval_jitter: number; intensity_jitter: number; droplet_jitter: number } {
  const baseState = (seedHash ^ pulseCounter) >>> 0;
  const a = splitmix32(baseState);
  const b = splitmix32(a);
  const c = splitmix32(b);
  return {
    interval_jitter: a / 0x80000000 - 1,
    intensity_jitter: b / 0x80000000 - 1,
    droplet_jitter: c / 0x80000000 - 1,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const lotusGardenerHandler: TraitHandler<LotusGardenerConfig> = {
  name: 'lotus_gardener',

  defaultConfig: {
    bloom_state_source: 'lotus.api.bloom_state',
    base_pulse_interval_s: 5.0,
    base_pulse_intensity: 0.7,
    base_droplet_count: 8,
    emit_attach_event: true,
    seed: '0x0000DEAD',
  },

  onAttach(node, config, context) {
    const ctxState = context.getState?.() ?? {};
    const initialBloom = (ctxState[config.bloom_state_source] as
      | LotusAggregateBloomState
      | undefined) ?? 'sealed';
    const schedule = deriveLotusGardenerSchedule(initialBloom);
    const seedHash = hashGardenerSeed(config.seed);

    const state: LotusGardenerState = {
      observed_state: initialBloom,
      schedule,
      time_since_last_pulse: 0,
      pulse_counter: 0,
      seed_hash: seedHash,
    };
    (node as unknown as Record<string, unknown>).__lotusGardenerState = state;

    if (config.emit_attach_event) {
      context.emit?.('lotus_gardener_attached', {
        node,
        bloomState: initialBloom,
        schedule,
        seedHash,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('lotus_gardener_detached', { node });
    delete (node as unknown as Record<string, unknown>).__lotusGardenerState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as unknown as Record<string, unknown>).__lotusGardenerState as
      | LotusGardenerState
      | undefined;
    if (!state) return;
    if (typeof delta !== 'number' || delta < 0) return; // defensive

    state.time_since_last_pulse += delta;

    const effectiveInterval = config.base_pulse_interval_s * state.schedule.interval_mult;
    if (state.time_since_last_pulse < effectiveInterval) return;

    // Time to fire a pulse. Compute deterministic jitter from pulse_counter.
    const jitter = gardenerPulseJitter(state.seed_hash, state.pulse_counter);
    // Interval jitter is consumed implicitly by the next pulse (we just zero
    // the timer here). Intensity / droplet jitter scale ±20%.
    const intensity =
      config.base_pulse_intensity *
      state.schedule.intensity_mult *
      (1 + jitter.intensity_jitter * 0.2);
    const droplet_count = Math.max(
      1,
      Math.round(
        config.base_droplet_count *
          state.schedule.droplet_mult *
          (1 + jitter.droplet_jitter * 0.2)
      )
    );

    state.pulse_counter += 1;
    state.time_since_last_pulse = 0;

    context.emit?.('gardener_pulse', {
      node,
      pulseCounter: state.pulse_counter,
      bloomState: state.observed_state,
      intensity,
      emergency: state.schedule.emergency_mode,
    });
    context.emit?.('gardener_droplet_burst', {
      node,
      pulseCounter: state.pulse_counter,
      count: droplet_count,
      bloomState: state.observed_state,
    });
  },

  onEvent(node, _config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__lotusGardenerState as
      | LotusGardenerState
      | undefined;
    if (!state) return;

    if (event.type === 'lotus_bloom_state_changed') {
      const newState = (event.bloomState as LotusAggregateBloomState) ?? 'sealed';
      const newSchedule = deriveLotusGardenerSchedule(newState);
      state.observed_state = newState;
      state.schedule = newSchedule;
      // Reset the pulse timer so a state change doesn't bunch pulses
      // immediately after.
      state.time_since_last_pulse = 0;

      context.emit?.('lotus_gardener_schedule_changed', {
        node,
        bloomState: newState,
        schedule: newSchedule,
      });
    } else if (event.type === 'lotus_gardener_query') {
      context.emit?.('lotus_gardener_response', {
        queryId: event.queryId,
        node,
        bloomState: state.observed_state,
        schedule: state.schedule,
        pulseCounter: state.pulse_counter,
        timeSinceLastPulse: state.time_since_last_pulse,
        seedHash: state.seed_hash,
      });
    }
  },
};

export default lotusGardenerHandler;
