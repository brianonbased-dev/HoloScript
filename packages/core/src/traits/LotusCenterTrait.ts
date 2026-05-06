/**
 * Lotus Center Trait
 *
 * Center-tier marker trait for the lotus seedable artifact. Carries the
 * pre-genesis "Dumb Glass" placeholder mesh and tracks readiness for the
 * Phase 2 SDF-body swap (paper P3-CENTER "rendering as contracted
 * synthesis"). Pre-genesis: low-glow placeholder mesh, slow rotation.
 * Post-genesis: emits center_ready_for_sdf_body so the renderer knows it
 * may swap to ShaderTrait + ComputeShaderTrait wiring.
 *
 * STAGED-vs-LIVE swap:
 *   Per project_lotus-genesis-trigger.md / I.007, the center body does NOT
 *   transform until ALL 16 papers reach `full` AND the genesis seed swap
 *   has fired. This trait does NOT decide that — it READS the trigger via
 *   lotus_genesis_fired events, gates the SDF readiness, and emits a
 *   single irreversible center_ready_for_sdf_body when both conditions
 *   align. The actual SDF rendering is a separate trait family.
 *
 * Visual mapping:
 *   pre-genesis (any aggregate state)   → placeholder_intensity, slow rotate
 *   post-genesis + aggregate < full     → still placeholder (genesis fired
 *                                          but petals not all full — defensive
 *                                          guard against premature swap)
 *   post-genesis + aggregate == full    → emit center_ready_for_sdf_body once,
 *                                          then placeholder_intensity transitions
 *                                          to mature_intensity (light-column
 *                                          handover happens via @lotus_genesis_trigger,
 *                                          not here)
 *
 * Determinism:
 *   - Single irreversible state machine: pre-genesis → ready (one transition).
 *   - No Math.random, no wall-clock; readiness flows on event.
 *   - Per-frame work is null.
 *
 * Trait name: lotus_center
 * Category: lotus / center-tier
 *
 * @version 1.0.0
 * @cites I.007, W.137, project_lotus-genesis-trigger.md, task_1778093521547_nx7h
 */

import type { TraitHandler } from './TraitTypes';
import type { LotusAggregateBloomState } from './LotusRootTrait';

// =============================================================================
// TYPES
// =============================================================================

/** Center body lifecycle phase — strictly increasing. */
export type LotusCenterPhase = 'pre_genesis' | 'genesis_fired_pending' | 'sdf_ready';

interface LotusCenterConfig {
  /** State key for aggregate bloom state. */
  bloom_state_source: string;
  /** State key reporting whether genesis fired (boolean). */
  genesis_fired_source: string;
  /** Glow intensity while pre-genesis (Dumb Glass placeholder). */
  placeholder_intensity: number;
  /** Glow intensity once SDF body activates. */
  mature_intensity: number;
  /** Whether to emit lotus_center_attached on attach. */
  emit_attach_event: boolean;
}

interface LotusCenterState {
  phase: LotusCenterPhase;
  observed_bloom_state: LotusAggregateBloomState;
  observed_genesis_fired: boolean;
  current_intensity: number;
  /** Set true exactly once when transitioning into sdf_ready. */
  sdf_ready_emitted: boolean;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Derive (phase, intensity) from inputs. Pure; exposed for tests.
 *
 * Phase precedence:
 *   - !genesis_fired                       → pre_genesis
 *   - genesis_fired && bloom != 'full'     → genesis_fired_pending (defensive
 *                                              guard — genesis cannot be
 *                                              acknowledged for swap until
 *                                              all 16 petals are full)
 *   - genesis_fired && bloom == 'full'     → sdf_ready
 */
export function deriveLotusCenterPhase(
  bloomState: LotusAggregateBloomState,
  genesisFired: boolean,
  cfg: Pick<LotusCenterConfig, 'placeholder_intensity' | 'mature_intensity'>
): { phase: LotusCenterPhase; intensity: number } {
  if (!genesisFired) {
    return { phase: 'pre_genesis', intensity: cfg.placeholder_intensity };
  }
  if (bloomState !== 'full') {
    // Defensive: genesis fire was observed but the petals do NOT all read
    // full. Hold position. This protects against premature genesis fires
    // (manual flip, test fixture, race condition).
    return {
      phase: 'genesis_fired_pending',
      intensity: cfg.placeholder_intensity,
    };
  }
  return { phase: 'sdf_ready', intensity: cfg.mature_intensity };
}

// =============================================================================
// HANDLER
// =============================================================================

export const lotusCenterHandler: TraitHandler<LotusCenterConfig> = {
  name: 'lotus_center',

  defaultConfig: {
    bloom_state_source: 'lotus.api.bloom_state',
    genesis_fired_source: 'lotus.api.genesis_fired',
    placeholder_intensity: 0.3,
    mature_intensity: 1.5,
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const ctxState = context.getState?.() ?? {};
    const initialBloom = (ctxState[config.bloom_state_source] as
      | LotusAggregateBloomState
      | undefined) ?? 'sealed';
    const initialGenesis = Boolean(ctxState[config.genesis_fired_source]);

    const derived = deriveLotusCenterPhase(initialBloom, initialGenesis, config);

    const state: LotusCenterState = {
      phase: derived.phase,
      observed_bloom_state: initialBloom,
      observed_genesis_fired: initialGenesis,
      current_intensity: derived.intensity,
      sdf_ready_emitted: false,
    };
    (node as unknown as Record<string, unknown>).__lotusCenterState = state;

    if (config.emit_attach_event) {
      context.emit?.('lotus_center_attached', {
        node,
        phase: derived.phase,
        bloomState: initialBloom,
        genesisFired: initialGenesis,
        intensity: derived.intensity,
      });
    }

    // If we somehow attach already in sdf_ready (e.g. mid-cycle reattach),
    // emit the readiness event exactly once.
    if (derived.phase === 'sdf_ready' && !state.sdf_ready_emitted) {
      state.sdf_ready_emitted = true;
      context.emit?.('center_ready_for_sdf_body', {
        node,
        intensity: derived.intensity,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('lotus_center_detached', { node });
    delete (node as unknown as Record<string, unknown>).__lotusCenterState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Slow rotation is owned by the @animated trait on the node. This trait
    // does not do per-frame work — phase transitions flow on events.
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__lotusCenterState as
      | LotusCenterState
      | undefined;
    if (!state) return;

    let recompute = false;
    if (event.type === 'lotus_bloom_state_changed') {
      state.observed_bloom_state =
        (event.bloomState as LotusAggregateBloomState) ?? state.observed_bloom_state;
      recompute = true;
    } else if (event.type === 'lotus_genesis_fired') {
      state.observed_genesis_fired = true;
      recompute = true;
    } else if (event.type === 'lotus_center_query') {
      context.emit?.('lotus_center_response', {
        queryId: event.queryId,
        node,
        phase: state.phase,
        bloomState: state.observed_bloom_state,
        genesisFired: state.observed_genesis_fired,
        intensity: state.current_intensity,
        sdfReadyEmitted: state.sdf_ready_emitted,
      });
      return;
    }

    if (!recompute) return;

    const derived = deriveLotusCenterPhase(
      state.observed_bloom_state,
      state.observed_genesis_fired,
      config
    );
    const phaseChanged = derived.phase !== state.phase;
    const intensityChanged = derived.intensity !== state.current_intensity;
    state.phase = derived.phase;
    state.current_intensity = derived.intensity;

    if (phaseChanged || intensityChanged) {
      context.emit?.('lotus_center_phase_changed', {
        node,
        phase: derived.phase,
        bloomState: state.observed_bloom_state,
        genesisFired: state.observed_genesis_fired,
        intensity: derived.intensity,
      });
    }

    // Fire the SDF readiness event ONCE on the first transition into sdf_ready.
    if (derived.phase === 'sdf_ready' && !state.sdf_ready_emitted) {
      state.sdf_ready_emitted = true;
      context.emit?.('center_ready_for_sdf_body', {
        node,
        intensity: derived.intensity,
      });
    }
  },
};

export default lotusCenterHandler;
