/**
 * Lotus Root Trait
 *
 * Substrate-tier marker trait for the lotus seedable artifact
 * (examples/lotus-flower/garden.seedable.holo). Each `Root: <substrate>` node
 * (Parser, Multi-target Compiler, Provenance Semiring) attaches @lotus_root
 * with a substrate identifier. The trait reads `lotus.api.bloom_state` from
 * upstream evidence and drives sub-emissive pulse intensity in early
 * lifecycle stages — when most petals are still `sealed`, the root pulses
 * brighter to communicate "infrastructure is alive, content is on the way."
 *
 * BloomState dependency:
 *   The 5-state lifecycle (`sealed | budding | blooming | full | wilted`) is
 *   defined in packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts.
 *   This trait does NOT recompute bloom state — it READS the aggregate state
 *   from the runtime context (set by the lotus orchestrator) and maps it to
 *   visual signals. Separation of concerns per W.GOLD.001 (architecture
 *   beats alignment): derivation is one module, visual mapping is another.
 *
 * Determinism:
 *   - Pure mapping from (bloom_state, substrate_id) → emissive params.
 *   - No Math.random, no wall-clock; pulse phase is event-driven not frame-
 *     driven so the trait does no per-frame onUpdate work.
 *
 * Trait usage in .holo composition:
 *
 *   object "Root: Parser" {
 *     @lotus_root {
 *       substrate: "parser"
 *       bloom_state_source: "lotus.api.bloom_state"
 *       early_pulse_intensity: 0.8
 *       mature_intensity: 0.4
 *     }
 *   }
 *
 * Trait name: lotus_root
 * Category: lotus / substrate-tier
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites I.007, W.137 (Frame Drift trait-binding layer), task_1778093521547_nx7h
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Aggregate bloom-state of the whole lotus, as observed by the substrate.
 * Mirrors the per-petal BloomState enum from
 * packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts but applied
 * to the whole composition (e.g. "blooming" = at least one petal is blooming
 * but none are full). The lotus orchestrator computes this and stamps it
 * onto context state where this trait reads it.
 */
export type LotusAggregateBloomState =
  | 'sealed'
  | 'budding'
  | 'blooming'
  | 'full'
  | 'wilted';

/**
 * Substrate identifier — which infrastructure tier this root represents.
 * Maps 1:1 to the three Root: <name> nodes in garden.seedable.holo.
 */
export type LotusRootSubstrate =
  | 'parser'
  | 'multi_target_compiler'
  | 'provenance_semiring'
  | (string & {}); // open for future substrates

interface LotusRootConfig {
  /** Which substrate this root represents (drives sub-emissive accent colour). */
  substrate: LotusRootSubstrate;
  /** State key on context state — defaults to canonical lotus signal. */
  bloom_state_source: string;
  /** Emissive intensity when aggregate state is sealed/budding (early life). */
  early_pulse_intensity: number;
  /** Emissive intensity when aggregate state is full (mature life). */
  mature_intensity: number;
  /** Pulse speed (Hz) for the early stages. */
  early_pulse_speed: number;
  /** Whether to emit lotus_root_attached on attach (analytics / wiring tap). */
  emit_attach_event: boolean;
}

interface LotusRootState {
  substrate: LotusRootSubstrate;
  /** Last bloom state observed via lotus_bloom_state_changed event. */
  observed_state: LotusAggregateBloomState;
  /** Currently-applied emissive intensity. */
  current_intensity: number;
  /** Currently-applied pulse speed (0 = no pulse). */
  current_pulse_speed: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Map (bloom_state, substrate) → (intensity, pulse_speed). Pure function;
 * exposed for tests so the visual contract can be pinned without going
 * through trait lifecycle.
 *
 * Visual contract:
 *   sealed   → early_pulse_intensity, slow steady pulse (substrate alive,
 *              waiting). Provenance Semiring pulses brighter.
 *   budding  → 0.85 × early_pulse_intensity, normal pulse.
 *   blooming → 0.60 × early_pulse_intensity, slowing down.
 *   full     → mature_intensity, no pulse (just steady glow).
 *   wilted   → 0.20 × early_pulse_intensity, no pulse, dim.
 */
export function deriveLotusRootEmissive(
  state: LotusAggregateBloomState,
  cfg: Pick<
    LotusRootConfig,
    'substrate' | 'early_pulse_intensity' | 'mature_intensity' | 'early_pulse_speed'
  >
): { intensity: number; pulse_speed: number } {
  // Provenance Semiring is the trust-anchor — keep it brighter than the others
  // in early life so users see "the chain is alive."
  const substrateBoost = cfg.substrate === 'provenance_semiring' ? 1.25 : 1.0;

  switch (state) {
    case 'sealed':
      return {
        intensity: cfg.early_pulse_intensity * substrateBoost,
        pulse_speed: cfg.early_pulse_speed,
      };
    case 'budding':
      return {
        intensity: cfg.early_pulse_intensity * 0.85 * substrateBoost,
        pulse_speed: cfg.early_pulse_speed * 0.9,
      };
    case 'blooming':
      return {
        intensity: cfg.early_pulse_intensity * 0.6 * substrateBoost,
        pulse_speed: cfg.early_pulse_speed * 0.6,
      };
    case 'full':
      return {
        intensity: cfg.mature_intensity * substrateBoost,
        pulse_speed: 0,
      };
    case 'wilted':
      return {
        intensity: cfg.early_pulse_intensity * 0.2,
        pulse_speed: 0,
      };
    default:
      // Defensive — unknown state behaves like sealed
      return {
        intensity: cfg.early_pulse_intensity,
        pulse_speed: cfg.early_pulse_speed,
      };
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const lotusRootHandler: TraitHandler<LotusRootConfig> = {
  name: 'lotus_root',

  defaultConfig: {
    substrate: 'parser',
    bloom_state_source: 'lotus.api.bloom_state',
    early_pulse_intensity: 0.8,
    mature_intensity: 0.4,
    early_pulse_speed: 0.5,
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    // Read initial bloom state from context — defaults to 'sealed' before any
    // orchestrator update fires. The lotus orchestrator is responsible for
    // pushing 'lotus.api.bloom_state' into setState before mounting; this
    // trait is a read-only consumer.
    const ctxState = context.getState?.() ?? {};
    const initialBloomRaw = (ctxState[config.bloom_state_source] as
      | LotusAggregateBloomState
      | undefined) ?? 'sealed';
    const emissive = deriveLotusRootEmissive(initialBloomRaw, config);

    const state: LotusRootState = {
      substrate: config.substrate,
      observed_state: initialBloomRaw,
      current_intensity: emissive.intensity,
      current_pulse_speed: emissive.pulse_speed,
    };
    (node as unknown as Record<string, unknown>).__lotusRootState = state;

    if (config.emit_attach_event) {
      context.emit?.('lotus_root_attached', {
        node,
        substrate: config.substrate,
        bloomState: initialBloomRaw,
        intensity: emissive.intensity,
        pulseSpeed: emissive.pulse_speed,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('lotus_root_detached', { node });
    delete (node as unknown as Record<string, unknown>).__lotusRootState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Pure marker trait — no per-frame work. Visual updates flow via
    // lotus_bloom_state_changed events handled in onEvent.
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__lotusRootState as
      | LotusRootState
      | undefined;
    if (!state) return;

    if (event.type === 'lotus_bloom_state_changed') {
      const newState = (event.bloomState as LotusAggregateBloomState) ?? 'sealed';
      const emissive = deriveLotusRootEmissive(newState, config);
      state.observed_state = newState;
      state.current_intensity = emissive.intensity;
      state.current_pulse_speed = emissive.pulse_speed;

      context.emit?.('lotus_root_emissive_changed', {
        node,
        substrate: config.substrate,
        bloomState: newState,
        intensity: emissive.intensity,
        pulseSpeed: emissive.pulse_speed,
      });
    } else if (event.type === 'lotus_root_query') {
      context.emit?.('lotus_root_response', {
        queryId: event.queryId,
        node,
        substrate: state.substrate,
        observedState: state.observed_state,
        intensity: state.current_intensity,
        pulseSpeed: state.current_pulse_speed,
      });
    }
  },
};

export default lotusRootHandler;
