/**
 * BloomReactive Trait
 *
 * Declarative bloom-state-driven mesh + emissive animation. Maps a
 * 5-stage bloom enum (sealed/budding/blooming/full/wilted) to a single
 * semantic block of (emissive, scale, pulse) outputs, replacing the
 * 2-trait combo of @animated keyframes + a separate @glowing block
 * that the lotus-garden refresh currently has to author by hand.
 *
 * Canonical use: examples/lotus-flower/garden.refreshed.holo —
 *   @bloom_reactive {
 *     state: lotus.api.bloom_state
 *     sealed:   { emissive: 0.1,  scale: 0.9 }
 *     budding:  { emissive: 0.4,  scale: 0.95 }
 *     blooming: { emissive: 1.2,  scale: 1.0,  pulse: true }
 *     full:     { emissive: 2.5,  scale: 1.05, pulse_fast: true }
 *     wilted:   { emissive: 0.05, scale: 0.85 }
 *   }
 *
 * Determinism contract:
 *   - Per-tick (emissive, scale) is a PURE function of
 *     (currentState, elapsedSeconds, stageConfig). Same inputs →
 *     byte-for-byte identical output across runs and platforms.
 *   - State changes arrive via `lotus_bloom_state_changed` events
 *     (emitted by LotusRootTrait + LotusCenterTrait). The trait holds
 *     `observed_state` and rebases pulse-phase to elapsedSeconds at
 *     the change instant, so a stage swap is monotonic — the new
 *     stage's first sample is its base emissive value, not whatever
 *     phase the previous stage's pulse was at.
 *   - Pulse modulation is a sine: emissive(t) = base * (1 + amp * sin(2π·f·(t - t0))).
 *     `pulse: true`        → freq = pulse_hz_slow (default 0.5 Hz)
 *     `pulse_fast: true`   → freq = pulse_hz_fast (default 2.0 Hz)
 *     Both flags off       → freq = 0, emissive = base (constant).
 *     Both flags on        → pulse_fast wins (single canonical freq per
 *                            stage; no compounding).
 *   - Pulse amplitude defaults to 0.25 (i.e. ±25% around base) and is
 *     stage-overridable via `pulse_amplitude` in any stage block.
 *   - Unknown bloom_state values fall back to the `sealed` stage —
 *     this protects against substrate emitting future enum variants.
 *
 * State source binding (`state` field):
 *   - The trait listens for `lotus_bloom_state_changed` events whose
 *     `bloomState` field carries the new enum value.
 *   - It does NOT poll context state on every tick — the substrate
 *     (lotus orchestrator / LotusRoot) is the single source of truth
 *     and emits the change event when the aggregate transitions.
 *   - On attach, the trait's `initial_state` (default 'sealed') is
 *     used until the first event arrives; this matches the LotusRoot
 *     behaviour and avoids a mid-bloom flash on substrate boot.
 *
 * Trait usage in .holo composition:
 *
 *   object "LotusPetal-0" {
 *     @bloom_reactive {
 *       state: lotus.api.bloom_state
 *       initial_state: 'sealed'
 *       sealed:   { emissive: 0.1,  scale: 0.9 }
 *       budding:  { emissive: 0.4,  scale: 0.95 }
 *       blooming: { emissive: 1.2,  scale: 1.0,  pulse: true }
 *       full:     { emissive: 2.5,  scale: 1.05, pulse_fast: true }
 *       wilted:   { emissive: 0.05, scale: 0.85 }
 *     }
 *   }
 *
 * Trait name: bloom_reactive
 * Category: nature-life
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites task_1778061290860_wxh8 (A-009 example-driven request),
 *        examples/lotus-flower/garden.refreshed.holo,
 *        LotusRootTrait (lotus_bloom_state_changed event),
 *        LotusCenterTrait (bloom_state observation pattern)
 */

import type { TraitHandler } from './TraitTypes';
import type { LotusAggregateBloomState } from './LotusRootTrait';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default pulse frequency for `pulse: true` (slow). 0.5 Hz = 1 cycle per 2s. */
const DEFAULT_PULSE_HZ_SLOW = 0.5;

/** Default pulse frequency for `pulse_fast: true`. 2.0 Hz = 1 cycle per 0.5s. */
const DEFAULT_PULSE_HZ_FAST = 2.0;

/** Default pulse amplitude (fraction of base emissive). 0.25 = ±25%. */
const DEFAULT_PULSE_AMPLITUDE = 0.25;

/** Canonical bloom stages, in lifecycle order. Used for fallback + iteration. */
const BLOOM_STAGES: readonly LotusAggregateBloomState[] = [
  'sealed',
  'budding',
  'blooming',
  'full',
  'wilted',
] as const;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Per-stage output spec. All fields are optional except emissive/scale —
 * they default per the constants above.
 */
export interface BloomStageConfig {
  /** Base emissive intensity at this stage. Required. */
  emissive: number;
  /** Mesh uniform scale multiplier at this stage. Required. */
  scale: number;
  /** If true, modulate emissive at pulse_hz_slow. Default false. */
  pulse?: boolean;
  /** If true, modulate emissive at pulse_hz_fast (overrides `pulse`). Default false. */
  pulse_fast?: boolean;
  /** Override pulse amplitude for this stage. Default DEFAULT_PULSE_AMPLITUDE. */
  pulse_amplitude?: number;
}

export interface BloomReactiveConfig {
  /** State key string (e.g. 'lotus.api.bloom_state'). Documentary; substrate emits the change event. */
  state: string;
  /** Initial bloom state used before the first event arrives. */
  initial_state: LotusAggregateBloomState;
  /** Stage configs. Any stage omitted from the author block falls back to the trait default. */
  sealed: BloomStageConfig;
  budding: BloomStageConfig;
  blooming: BloomStageConfig;
  full: BloomStageConfig;
  wilted: BloomStageConfig;
  /** Slow pulse frequency in Hz. Default 0.5. */
  pulse_hz_slow: number;
  /** Fast pulse frequency in Hz. Default 2.0. */
  pulse_hz_fast: number;
  /** Whether to emit a bloom_reactive_attached event on attach. */
  emit_attach_event: boolean;
}

interface BloomReactiveState {
  /** Currently observed bloom stage. */
  observedState: LotusAggregateBloomState;
  /** Cumulative wall-clock elapsed seconds since attach. */
  elapsedSeconds: number;
  /** elapsedSeconds at the last state transition. Used to rebase pulse phase. */
  stageEnteredAt: number;
  /** Last emitted output, for change-detection on transition. */
  lastEmitted: BloomReactiveOutput | null;
}

export interface BloomReactiveOutput {
  /** Current bloom stage. */
  state: LotusAggregateBloomState;
  /** Current emissive intensity (after pulse modulation). */
  emissive: number;
  /** Current mesh scale (constant per stage; not modulated). */
  scale: number;
  /** Pulse frequency in Hz active at this sample (0 = no pulse). */
  pulseHz: number;
  /** Time since stage entry (drives the pulse phase). */
  stageElapsedSeconds: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Resolve a bloom-state string to a known stage; unknown values fall back
 * to 'sealed' to protect against future substrate enum additions.
 *
 * Pure function — exposed for tests + external validation.
 */
export function resolveBloomStage(
  state: string | LotusAggregateBloomState
): LotusAggregateBloomState {
  if ((BLOOM_STAGES as readonly string[]).includes(state)) {
    return state as LotusAggregateBloomState;
  }
  return 'sealed';
}

/**
 * Pick the canonical pulse frequency from stage flags.
 *
 * Resolution order (pure):
 *   - pulse_fast: true   → fast frequency
 *   - pulse: true        → slow frequency
 *   - neither            → 0 (no modulation)
 *
 * `pulse_fast` always wins over `pulse` when both are set, so a single
 * canonical frequency is in effect per stage — pulse rates do not
 * compound or beat against each other.
 */
export function resolvePulseHz(
  stage: BloomStageConfig,
  slowHz: number,
  fastHz: number
): number {
  if (stage.pulse_fast) return fastHz;
  if (stage.pulse) return slowHz;
  return 0;
}

/**
 * Compute the emissive intensity at a given (base, amplitude, freq, time).
 *
 * Pure function — drives the full pulse modulation. Exposed so tests can
 * pin determinism without going through the trait handler lifecycle.
 *
 *   emissive(t) = base * (1 + amp * sin(2π · freq · t))
 *
 * When freq = 0, this reduces to `base` exactly (sin(0) = 0). When amp = 0
 * the same holds. Both branches are byte-for-byte stable across runs.
 */
export function emissiveAt(
  base: number,
  amplitude: number,
  freqHz: number,
  stageElapsedSeconds: number
): number {
  if (freqHz <= 0 || amplitude === 0) return base;
  return base * (1 + amplitude * Math.sin(2 * Math.PI * freqHz * stageElapsedSeconds));
}

/**
 * Derive the full output sample for a given (state, stage configs, time).
 *
 * Pure function — the load-bearing determinism contract lives here.
 * Same inputs → same output, byte-for-byte across V8 / SpiderMonkey / WASM.
 */
export function deriveBloomReactiveOutput(
  state: LotusAggregateBloomState,
  stageConfig: BloomStageConfig,
  stageElapsedSeconds: number,
  slowHz: number,
  fastHz: number
): BloomReactiveOutput {
  const pulseHz = resolvePulseHz(stageConfig, slowHz, fastHz);
  const amplitude = stageConfig.pulse_amplitude ?? DEFAULT_PULSE_AMPLITUDE;
  const emissive = emissiveAt(stageConfig.emissive, amplitude, pulseHz, stageElapsedSeconds);
  return {
    state,
    emissive,
    scale: stageConfig.scale,
    pulseHz,
    stageElapsedSeconds,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const bloomReactiveHandler: TraitHandler<BloomReactiveConfig> = {
  name: 'bloom_reactive',

  defaultConfig: {
    state: 'lotus.api.bloom_state',
    initial_state: 'sealed',
    sealed: { emissive: 0.1, scale: 0.9 },
    budding: { emissive: 0.4, scale: 0.95 },
    blooming: { emissive: 1.2, scale: 1.0, pulse: true },
    full: { emissive: 2.5, scale: 1.05, pulse_fast: true },
    wilted: { emissive: 0.05, scale: 0.85 },
    pulse_hz_slow: DEFAULT_PULSE_HZ_SLOW,
    pulse_hz_fast: DEFAULT_PULSE_HZ_FAST,
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const initialStage = resolveBloomStage(config.initial_state);
    const state: BloomReactiveState = {
      observedState: initialStage,
      elapsedSeconds: 0,
      stageEnteredAt: 0,
      lastEmitted: null,
    };
    (node as unknown as Record<string, unknown>).__bloomReactiveState = state;

    if (config.emit_attach_event) {
      context.emit?.('bloom_reactive_attached', {
        node,
        initialState: initialStage,
        stateSource: config.state,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('bloom_reactive_detached', { node });
    delete (node as unknown as Record<string, unknown>).__bloomReactiveState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as unknown as Record<string, unknown>).__bloomReactiveState as
      | BloomReactiveState
      | undefined;
    if (!state) return;

    state.elapsedSeconds += delta;

    const stageConfig = config[state.observedState];
    const stageElapsed = state.elapsedSeconds - state.stageEnteredAt;
    const output = deriveBloomReactiveOutput(
      state.observedState,
      stageConfig,
      stageElapsed,
      config.pulse_hz_slow,
      config.pulse_hz_fast
    );

    state.lastEmitted = output;
    context.emit?.('bloom_reactive_sample', { node, ...output });
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__bloomReactiveState as
      | BloomReactiveState
      | undefined;
    if (!state) return;

    if (event.type === 'lotus_bloom_state_changed') {
      const incoming = (event.bloomState as LotusAggregateBloomState) ?? state.observedState;
      const newStage = resolveBloomStage(incoming);
      if (newStage !== state.observedState) {
        const previous = state.observedState;
        state.observedState = newStage;
        // Rebase pulse phase: the new stage's t=0 is right now. This makes
        // a stage transition's first sample equal the new stage's BASE
        // emissive (sin(0) = 0), which is the spec.
        state.stageEnteredAt = state.elapsedSeconds;
        context.emit?.('bloom_reactive_stage_changed', {
          node,
          previousStage: previous,
          newStage,
          atElapsedSeconds: state.elapsedSeconds,
        });
      }
      return;
    }

    if (event.type === 'bloom_reactive_query') {
      const stageConfig = config[state.observedState];
      const stageElapsed = state.elapsedSeconds - state.stageEnteredAt;
      const output = deriveBloomReactiveOutput(
        state.observedState,
        stageConfig,
        stageElapsed,
        config.pulse_hz_slow,
        config.pulse_hz_fast
      );
      context.emit?.('bloom_reactive_response', {
        queryId: event.queryId,
        node,
        ...output,
      });
      return;
    }

    if (event.type === 'bloom_reactive_reset') {
      state.elapsedSeconds = 0;
      state.stageEnteredAt = 0;
      state.observedState = resolveBloomStage(config.initial_state);
      state.lastEmitted = null;
      context.emit?.('bloom_reactive_reset_done', { node });
      return;
    }
  },
};
