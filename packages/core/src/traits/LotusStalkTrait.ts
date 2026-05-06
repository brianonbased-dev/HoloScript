/**
 * Lotus Stalk Trait
 *
 * Format-tier marker trait for the lotus seedable artifact. Each
 * `Stalk: <format>` node (.hs / .hsplus / .holo / .hs.md) attaches
 * @lotus_stalk with a format identifier. The trait drives stiffness and
 * sway amplitude as a function of aggregate bloom state — early on, the
 * stalk sways loosely (system limber, format settling); as the lotus
 * approaches full bloom the stalk stiffens and steadies (format committed).
 *
 * Visual mapping:
 *   sealed   → max sway, low stiffness (system finding its shape)
 *   budding  → reduced sway, growing stiffness
 *   blooming → small sway, near-stiff
 *   full     → effectively stiff (sway_amplitude → 0)
 *   wilted   → drooping (positive y_droop, sway returns)
 *
 * Composes with @animated:
 *   The stalk node carries @animated { clip: "sway_gentle" } in the
 *   composition. This trait does NOT replace the animation — it MODULATES
 *   it via stalk_sway_modulated events that the animation layer can read
 *   to scale the sway clip's amplitude. Separation of concerns: animation
 *   plays the keyframes, lotus_stalk says "play them at 30% amplitude
 *   today because the lotus is almost full."
 *
 * Determinism:
 *   - Pure mapping from (bloom_state, format) → (stiffness, sway_amplitude,
 *     y_droop). No Math.random, no wall-clock.
 *   - Per-frame work is null; modulation flows via events on bloom-state
 *     change.
 *
 * Trait name: lotus_stalk
 * Category: lotus / format-tier
 *
 * @version 1.0.0
 * @cites I.007, W.137, task_1778093521547_nx7h
 */

import type { TraitHandler } from './TraitTypes';
import type { LotusAggregateBloomState } from './LotusRootTrait';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Format identifier — which file format tier this stalk segment represents.
 * Maps 1:1 to the four Stalk: <format> nodes in garden.seedable.holo.
 */
export type LotusStalkFormat =
  | 'hs'
  | 'hsplus'
  | 'holo'
  | 'hs_md'
  | (string & {});

interface LotusStalkConfig {
  /** Which format this stalk segment represents. */
  format: LotusStalkFormat;
  /** State key on context state — defaults to canonical lotus signal. */
  bloom_state_source: string;
  /** Sway amplitude (radians) when aggregate state is sealed. */
  base_sway_amplitude_rad: number;
  /** Maximum stiffness multiplier (1.0 baseline at sealed; up to this at full). */
  max_stiffness: number;
  /** Y-axis droop (metres) applied when state is wilted. */
  wilt_droop_m: number;
  /** Whether to emit lotus_stalk_attached on attach. */
  emit_attach_event: boolean;
}

interface LotusStalkState {
  format: LotusStalkFormat;
  observed_state: LotusAggregateBloomState;
  current_sway_amplitude: number;
  current_stiffness: number;
  current_y_droop: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Map (bloom_state, format) → (sway, stiffness, y_droop). Pure; exposed
 * for tests so the determinism contract can be pinned without lifecycle.
 *
 * Format adjustments: documentation tier (.hs.md) sways slightly more than
 * runtime tiers because docs are the most-edited format and "limber doc
 * tier" reads as "documentation is alive." Core IR (.hs) is the stiffest
 * baseline — the canonical IR shouldn't visibly wobble.
 */
export function deriveLotusStalkPosture(
  state: LotusAggregateBloomState,
  cfg: Pick<
    LotusStalkConfig,
    'format' | 'base_sway_amplitude_rad' | 'max_stiffness' | 'wilt_droop_m'
  >
): { sway_amplitude: number; stiffness: number; y_droop: number } {
  // Format coefficients: doc tier is most limber, IR tier is stiffest baseline
  const formatSwayMult: Record<string, number> = {
    hs: 0.7, // core IR — stiffest baseline
    hsplus: 0.85,
    holo: 1.0,
    hs_md: 1.15, // docs — most limber
  };
  const swayMult = formatSwayMult[cfg.format] ?? 1.0;

  switch (state) {
    case 'sealed':
      return {
        sway_amplitude: cfg.base_sway_amplitude_rad * swayMult,
        stiffness: 1.0,
        y_droop: 0,
      };
    case 'budding':
      return {
        sway_amplitude: cfg.base_sway_amplitude_rad * swayMult * 0.7,
        stiffness: 1.0 + (cfg.max_stiffness - 1.0) * 0.25,
        y_droop: 0,
      };
    case 'blooming':
      return {
        sway_amplitude: cfg.base_sway_amplitude_rad * swayMult * 0.35,
        stiffness: 1.0 + (cfg.max_stiffness - 1.0) * 0.65,
        y_droop: 0,
      };
    case 'full':
      return {
        sway_amplitude: 0, // effectively stiff
        stiffness: cfg.max_stiffness,
        y_droop: 0,
      };
    case 'wilted':
      return {
        sway_amplitude: cfg.base_sway_amplitude_rad * swayMult * 0.5,
        stiffness: 0.4, // low stiffness — drooping
        y_droop: cfg.wilt_droop_m,
      };
    default:
      return {
        sway_amplitude: cfg.base_sway_amplitude_rad * swayMult,
        stiffness: 1.0,
        y_droop: 0,
      };
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const lotusStalkHandler: TraitHandler<LotusStalkConfig> = {
  name: 'lotus_stalk',

  defaultConfig: {
    format: 'holo',
    bloom_state_source: 'lotus.api.bloom_state',
    base_sway_amplitude_rad: 0.15,
    max_stiffness: 4.0,
    wilt_droop_m: 0.5,
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const ctxState = context.getState?.() ?? {};
    const initialBloomRaw = (ctxState[config.bloom_state_source] as
      | LotusAggregateBloomState
      | undefined) ?? 'sealed';
    const posture = deriveLotusStalkPosture(initialBloomRaw, config);

    const state: LotusStalkState = {
      format: config.format,
      observed_state: initialBloomRaw,
      current_sway_amplitude: posture.sway_amplitude,
      current_stiffness: posture.stiffness,
      current_y_droop: posture.y_droop,
    };
    (node as unknown as Record<string, unknown>).__lotusStalkState = state;

    if (config.emit_attach_event) {
      context.emit?.('lotus_stalk_attached', {
        node,
        format: config.format,
        bloomState: initialBloomRaw,
        swayAmplitude: posture.sway_amplitude,
        stiffness: posture.stiffness,
        yDroop: posture.y_droop,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('lotus_stalk_detached', { node });
    delete (node as unknown as Record<string, unknown>).__lotusStalkState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Posture is event-driven, not per-frame. The @animated trait on the
    // stalk node owns the per-frame sway clip; this trait modulates it.
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__lotusStalkState as
      | LotusStalkState
      | undefined;
    if (!state) return;

    if (event.type === 'lotus_bloom_state_changed') {
      const newState = (event.bloomState as LotusAggregateBloomState) ?? 'sealed';
      const posture = deriveLotusStalkPosture(newState, config);
      state.observed_state = newState;
      state.current_sway_amplitude = posture.sway_amplitude;
      state.current_stiffness = posture.stiffness;
      state.current_y_droop = posture.y_droop;

      context.emit?.('stalk_sway_modulated', {
        node,
        format: config.format,
        bloomState: newState,
        swayAmplitude: posture.sway_amplitude,
        stiffness: posture.stiffness,
        yDroop: posture.y_droop,
      });
    } else if (event.type === 'lotus_stalk_query') {
      context.emit?.('lotus_stalk_response', {
        queryId: event.queryId,
        node,
        format: state.format,
        observedState: state.observed_state,
        swayAmplitude: state.current_sway_amplitude,
        stiffness: state.current_stiffness,
        yDroop: state.current_y_droop,
      });
    }
  },
};

export default lotusStalkHandler;
