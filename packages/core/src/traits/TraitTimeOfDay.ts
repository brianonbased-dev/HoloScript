/**
 * TraitTimeOfDay.ts — Sky-cycle orchestration driver
 *
 * Drives the four named sky phases used in the realistic-forest scene
 * (and any HoloScript composition that uses time_envelope in @ambient,
 * fog ramping, or emissive scaling keyed to time of day):
 *
 *   dawn       → first light, cool blue-pink, fog heavy
 *   golden     → magic hour, warm amber, peak birdsong
 *   dusk       → after-sunset, purple-indigo transition
 *   dark       → full night, deep blue, crickets/fireflies peak
 *
 * Canonical use in realistic-forest.refreshed.holo:
 *
 *   object "ForestTimeDriver" {
 *     @time_of_day {
 *       cycle_duration_minutes: 24
 *       start_phase: "golden"
 *       phases: {
 *         dawn:   { sun_intensity: 0.25, ambient_light: 0.10, fog_density: 0.032, sky_exposure: 0.6 }
 *         golden: { sun_intensity: 0.60, ambient_light: 0.18, fog_density: 0.018, sky_exposure: 1.0 }
 *         dusk:   { sun_intensity: 0.30, ambient_light: 0.14, fog_density: 0.024, sky_exposure: 0.7 }
 *         dark:   { sun_intensity: 0.02, ambient_light: 0.06, fog_density: 0.040, sky_exposure: 0.2 }
 *       }
 *     }
 *   }
 *
 * Downstream trait subscription:
 *   - @ambient  → reads current_phase + phase_t via time_of_day_tick event
 *                 to scale time_envelope volume entries
 *   - skybox    → reads sky_exposure to ramp HDR exposure
 *   - @emissive → reads phase_t + current_phase for bioluminescent scaling
 *   - fog       → reads fog_density from the active phase config
 *
 * Determinism contract:
 *   - All outputs are pure functions of (config, elapsedSeconds).
 *   - No Math.random, no wall-clock reads, no platform-specific timing.
 *   - phase_t ∈ [0, 1]: fraction through the CURRENT phase (0 = just entered, 1 = about to leave).
 *   - Phases cycle in fixed order: dawn → golden → dusk → dark → dawn → …
 *     Each phase occupies exactly 1/4 of cycle_duration_minutes.
 *
 * Trait name: time_of_day
 * Category: environment
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites task_1780979310273_1g8k (A-009 sky-cycle request),
 *        examples/showcase/realistic-forest.refreshed.holo (time_envelope usage),
 *        packages/core/src/traits/BioluminescentTrait.ts (structural pattern)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Phase cycle order — fixed, deterministic. */
export const TIME_OF_DAY_PHASES = ['dawn', 'golden', 'dusk', 'dark'] as const;
export type TimeOfDayPhase = (typeof TIME_OF_DAY_PHASES)[number];

/** Default cycle duration in real-time minutes (24 minutes = fast but perceptible cycle). */
const DEFAULT_CYCLE_DURATION_MINUTES = 24;

/** Default starting phase. */
const DEFAULT_START_PHASE: TimeOfDayPhase = 'golden';

// =============================================================================
// TYPES
// =============================================================================

export interface TimeOfDayPhaseConfig {
  /** Sun/directional light intensity during this phase (0–1). */
  sun_intensity: number;
  /** Ambient scene light intensity (0–1). */
  ambient_light: number;
  /** Volumetric / exponential-height fog density. */
  fog_density: number;
  /** Skybox HDR exposure multiplier (1.0 = neutral). */
  sky_exposure: number;
  /**
   * Optional fog color as CSS hex. When omitted the renderer uses its own
   * default progression (e.g. "#2a3d6b" for dawn, "#4a5a7a" for dusk, "#0a0a1a" for dark).
   */
  fog_color?: string;
  /**
   * Optional ambient light color as CSS hex.
   */
  ambient_color?: string;
}

export interface TimeOfDayConfig {
  /**
   * Real-time minutes for one complete day cycle (all 4 phases).
   * Minimum 0.1 minutes (6 real seconds). Default: 24.
   */
  cycle_duration_minutes: number;

  /**
   * Phase to start the cycle in. Default: 'golden'.
   */
  start_phase: TimeOfDayPhase;

  /**
   * Per-phase override configs. Any missing fields fall back to DEFAULT_PHASE_CONFIGS.
   */
  phases?: Partial<Record<TimeOfDayPhase, Partial<TimeOfDayPhaseConfig>>>;

  /**
   * If true, emit a time_of_day_tick event every onUpdate call.
   * Set to false to reduce event throughput for non-animated scenes.
   * Default: true.
   */
  emit_tick: boolean;

  /**
   * Emit time_of_day_phase_changed when the phase boundary is crossed.
   * Default: true.
   */
  emit_phase_change: boolean;
}

/** Per-frame output snapshot — emitted via time_of_day_tick. */
export interface TimeOfDayOutput {
  /** Currently active phase name. */
  current_phase: TimeOfDayPhase;
  /**
   * Progress through the current phase in [0, 1].
   * 0 = just entered the phase, 1 = about to exit.
   * Downstream time_envelope consumers lerp from the current phase
   * config toward the NEXT phase config using this value.
   */
  phase_t: number;
  /** Interpolated sun_intensity across the current phase transition. */
  sun_intensity: number;
  /** Interpolated ambient_light across the current phase transition. */
  ambient_light: number;
  /** Interpolated fog_density across the current phase transition. */
  fog_density: number;
  /** Interpolated sky_exposure across the current phase transition. */
  sky_exposure: number;
  /** Elapsed real-time seconds since attach. */
  elapsedSeconds: number;
}

// =============================================================================
// DEFAULT PHASE CONFIGS
// =============================================================================

export const DEFAULT_PHASE_CONFIGS: Record<TimeOfDayPhase, TimeOfDayPhaseConfig> = {
  dawn: {
    sun_intensity: 0.25,
    ambient_light: 0.1,
    fog_density: 0.032,
    sky_exposure: 0.6,
    fog_color: '#3a4a7a',
    ambient_color: '#2a3060',
  },
  golden: {
    sun_intensity: 0.6,
    ambient_light: 0.18,
    fog_density: 0.018,
    sky_exposure: 1.0,
    fog_color: '#4a5a7a',
    ambient_color: '#2a3d6b',
  },
  dusk: {
    sun_intensity: 0.3,
    ambient_light: 0.14,
    fog_density: 0.024,
    sky_exposure: 0.7,
    fog_color: '#503060',
    ambient_color: '#3a2850',
  },
  dark: {
    sun_intensity: 0.02,
    ambient_light: 0.06,
    fog_density: 0.04,
    sky_exposure: 0.2,
    fog_color: '#0a0e1e',
    ambient_color: '#080c18',
  },
};

// =============================================================================
// INTERNAL STATE
// =============================================================================

interface TimeOfDayState {
  /** Wall-clock seconds since attach. */
  elapsedSeconds: number;
  /** Most recently resolved phase (for change detection). */
  lastPhase: TimeOfDayPhase;
  /** Index of start_phase in TIME_OF_DAY_PHASES. */
  startPhaseIndex: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Resolve a phase string to a known phase; unknown values fall back to 'golden'
 * for graceful forward-compatibility.
 *
 * Pure function — exposed for tests.
 */
export function resolveTimeOfDayPhase(name: string): TimeOfDayPhase {
  if ((TIME_OF_DAY_PHASES as readonly string[]).includes(name)) {
    return name as TimeOfDayPhase;
  }
  return 'golden';
}

/**
 * Linear interpolation. Pure.
 */
export function lerpTod(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamp x to [0, 1]. Pure.
 */
export function clamp01Tod(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Resolve a full phase config for a given phase, merging user overrides onto
 * the defaults.  Pure.
 */
export function resolvePhaseConfig(
  phase: TimeOfDayPhase,
  overrides: Partial<Record<TimeOfDayPhase, Partial<TimeOfDayPhaseConfig>>> | undefined
): TimeOfDayPhaseConfig {
  const base = DEFAULT_PHASE_CONFIGS[phase];
  const override = overrides?.[phase];
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Derive the current TimeOfDayOutput for given (config, elapsedSeconds, startPhaseIndex).
 *
 * Phase sequencing:
 *   - Each phase occupies exactly 1/4 of cycle_duration_minutes real-time.
 *   - The cycle advances dawn → golden → dusk → dark → dawn → …
 *   - start_phase shifts the initial entry point by startPhaseIndex.
 *   - phase_t ∈ [0, 1) is used to smoothly lerp toward the NEXT phase's
 *     property values, so transitions are continuous across phase boundaries.
 *
 * Pure function — deterministic across V8 / SpiderMonkey / WASM.
 */
export function deriveTimeOfDayOutput(
  config: TimeOfDayConfig,
  elapsedSeconds: number,
  startPhaseIndex: number
): TimeOfDayOutput {
  const cycleDurationSeconds = Math.max(6, config.cycle_duration_minutes * 60);
  const phaseDuration = cycleDurationSeconds / 4;

  // Position within the cycle [0, cycleDurationSeconds)
  const cyclePos = elapsedSeconds % cycleDurationSeconds;
  // Which phase slot (0–3) within the cycle are we in?
  const phaseSlot = Math.floor(cyclePos / phaseDuration);
  // Progress within that slot [0, 1)
  const phase_t = clamp01Tod((cyclePos - phaseSlot * phaseDuration) / phaseDuration);

  // Rotate by start_phase offset (so start_phase is the first phase encountered)
  const currentPhaseIndex = (startPhaseIndex + phaseSlot) % 4;
  const nextPhaseIndex = (currentPhaseIndex + 1) % 4;

  const currentPhase = TIME_OF_DAY_PHASES[currentPhaseIndex];
  const nextPhase = TIME_OF_DAY_PHASES[nextPhaseIndex];

  const currentCfg = resolvePhaseConfig(currentPhase, config.phases);
  const nextCfg = resolvePhaseConfig(nextPhase, config.phases);

  // Smoothstep for a more cinematic transition curve
  const tSmooth = phase_t * phase_t * (3 - 2 * phase_t);

  return {
    current_phase: currentPhase,
    phase_t,
    sun_intensity: lerpTod(currentCfg.sun_intensity, nextCfg.sun_intensity, tSmooth),
    ambient_light: lerpTod(currentCfg.ambient_light, nextCfg.ambient_light, tSmooth),
    fog_density: lerpTod(currentCfg.fog_density, nextCfg.fog_density, tSmooth),
    sky_exposure: lerpTod(currentCfg.sky_exposure, nextCfg.sky_exposure, tSmooth),
    elapsedSeconds,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

function mergeDefaultConfig(config: Partial<TimeOfDayConfig>): TimeOfDayConfig {
  return {
    cycle_duration_minutes: config.cycle_duration_minutes ?? DEFAULT_CYCLE_DURATION_MINUTES,
    start_phase: resolveTimeOfDayPhase(config.start_phase ?? DEFAULT_START_PHASE),
    phases: config.phases,
    emit_tick: config.emit_tick ?? true,
    emit_phase_change: config.emit_phase_change ?? true,
  };
}

export const timeOfDayHandler: TraitHandler<TimeOfDayConfig> = {
  name: 'time_of_day',

  defaultConfig: {
    cycle_duration_minutes: DEFAULT_CYCLE_DURATION_MINUTES,
    start_phase: DEFAULT_START_PHASE,
    emit_tick: true,
    emit_phase_change: true,
  },

  onAttach(node, config, context) {
    const resolved = mergeDefaultConfig(config as Partial<TimeOfDayConfig>);
    const startPhaseIndex = TIME_OF_DAY_PHASES.indexOf(resolved.start_phase);

    const state: TimeOfDayState = {
      elapsedSeconds: 0,
      lastPhase: resolved.start_phase,
      startPhaseIndex: startPhaseIndex < 0 ? 0 : startPhaseIndex,
    };

    (node as unknown as Record<string, unknown>).__timeOfDayState = state;

    // Emit an initial snapshot so downstream traits know their starting values
    // without waiting for the first onUpdate tick.
    const initialOutput = deriveTimeOfDayOutput(resolved, 0, state.startPhaseIndex);
    context.emit?.('time_of_day_attached', { node, ...initialOutput });
  },

  onDetach(node, _config, context) {
    context.emit?.('time_of_day_detached', { node });
    delete (node as unknown as Record<string, unknown>).__timeOfDayState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as unknown as Record<string, unknown>).__timeOfDayState as
      | TimeOfDayState
      | undefined;
    if (!state) return;

    state.elapsedSeconds += delta;

    const resolved = mergeDefaultConfig(config as Partial<TimeOfDayConfig>);
    const output = deriveTimeOfDayOutput(resolved, state.elapsedSeconds, state.startPhaseIndex);

    // Phase-change event — fired when we cross a phase boundary
    if (resolved.emit_phase_change && output.current_phase !== state.lastPhase) {
      const prevPhase = state.lastPhase;
      state.lastPhase = output.current_phase;
      context.emit?.('time_of_day_phase_changed', {
        node,
        previous_phase: prevPhase,
        current_phase: output.current_phase,
        elapsedSeconds: state.elapsedSeconds,
      });
    } else {
      state.lastPhase = output.current_phase;
    }

    // Per-frame tick — downstream traits (ambient, skybox, emissive) consume this
    if (resolved.emit_tick) {
      context.emit?.('time_of_day_tick', { node, ...output });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__timeOfDayState as
      | TimeOfDayState
      | undefined;
    if (!state) return;

    /**
     * time_of_day_query — request a snapshot of the current state on demand.
     * Useful for one-shot reads (e.g. at scene load) without subscribing to ticks.
     */
    if (event.type === 'time_of_day_query') {
      const resolved = mergeDefaultConfig(config as Partial<TimeOfDayConfig>);
      const output = deriveTimeOfDayOutput(resolved, state.elapsedSeconds, state.startPhaseIndex);
      context.emit?.('time_of_day_response', {
        queryId: (event as { queryId?: string }).queryId,
        node,
        ...output,
      });
      return;
    }

    /**
     * time_of_day_seek — jump to a specific elapsed time.
     * Useful for debugging and cinematic previews.
     */
    if (event.type === 'time_of_day_seek') {
      const seekTo = (event as { elapsedSeconds?: number }).elapsedSeconds;
      if (typeof seekTo === 'number' && Number.isFinite(seekTo)) {
        state.elapsedSeconds = Math.max(0, seekTo);
        const resolved = mergeDefaultConfig(config as Partial<TimeOfDayConfig>);
        const output = deriveTimeOfDayOutput(resolved, state.elapsedSeconds, state.startPhaseIndex);
        state.lastPhase = output.current_phase;
        context.emit?.('time_of_day_sought', { node, ...output });
      }
      return;
    }

    /**
     * time_of_day_reset — restart the cycle from t=0 at start_phase.
     */
    if (event.type === 'time_of_day_reset') {
      state.elapsedSeconds = 0;
      const resolved = mergeDefaultConfig(config as Partial<TimeOfDayConfig>);
      state.lastPhase = resolved.start_phase;
      context.emit?.('time_of_day_reset_done', { node, start_phase: resolved.start_phase });
      return;
    }
  },
};
