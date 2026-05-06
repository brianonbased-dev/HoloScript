/**
 * Lotus Petal Trait
 *
 * Paper-tier marker trait for the lotus seedable artifact. Each of the 42
 * petals (8 + 13 + 21 Fibonacci layout from PhyllotaxisTrait) carries
 * @lotus_petal with a paper_id binding plus the program/layer/spiral_index
 * coordinates. The trait reads the PER-PETAL bloom state (NOT the aggregate)
 * — each petal's state is derived from its bound paper's evidence by
 * derivePetalBloomState (packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts).
 *
 * Visual mapping (per-petal):
 *   sealed   → opacity 0.1, glow off, bind colour to "#220033" (sealed dark purple)
 *   budding  → opacity 0.4, glow at 0.4 intensity, bind colour to "#6633aa"
 *   blooming → opacity 0.8, glow at 0.8 intensity with slow pulse, bind colour to "#9966cc"
 *   full     → opacity 1.0, glow at 1.2 intensity with pulse, bind colour to "#cc66ff"
 *   wilted   → opacity 0.5, glow off, desaturated grey "#666666"
 *
 * Reserved-capacity petals (paper_id = "reserved" or starts with "reserved")
 * are pinned to `sealed` regardless of any signal — they're the future-
 * capacity slots that should not be activated until a real paper binds.
 *
 * Composes with:
 *   - @phyllotaxis (PhyllotaxisTrait) — owns the petal's position
 *   - @bloom_reactive (separate trait, future) — translates this trait's
 *     emitted lotus_petal_visual_changed events into render uniforms
 *   - @glowing — accepts the colour/intensity overrides from this trait
 *
 * Determinism:
 *   - Visual mapping is a pure function of (bloom_state, paper_id flags).
 *   - No Math.random, no wall-clock; pulse speed is a constant per state.
 *   - Per-frame work is null; transitions flow on bloom-state events.
 *
 * Trait name: lotus_petal
 * Category: lotus / paper-tier
 *
 * @version 1.0.0
 * @cites I.007, W.137, D.010 (17-paper suite), task_1778093521547_nx7h
 */

import type { TraitHandler } from './TraitTypes';
import type { LotusAggregateBloomState } from './LotusRootTrait';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Per-petal bloom state — same enum as LotusAggregateBloomState but applied
 * to a single paper's evidence (per the derivePetalBloomState contract).
 * Re-exported so consumers don't need two imports.
 */
export type LotusPetalBloomState = LotusAggregateBloomState;

interface LotusPetalConfig {
  /** Paper identifier (e.g. "trust-by-construction", "snn-neurips"). */
  paper_id: string;
  /** Venue for the paper (informational; not load-bearing). */
  venue: string;
  /** Which Program (1, 2, or 3). */
  program: 1 | 2 | 3;
  /** Which Fibonacci layer (1, 2, or 3 — same as program in the canonical artifact). */
  layer: 1 | 2 | 3;
  /** Continuous spiral index across all 42 petals (0..41). */
  spiral_index: number;
  /** State key for THIS petal — typically `lotus.api.petal_state.${paper_id}`. */
  bloom_state_source: string;
  /** Whether to emit lotus_petal_attached on attach. */
  emit_attach_event: boolean;
}

interface LotusPetalVisual {
  opacity: number;
  glow_intensity: number;
  glow_colour: string;
  pulse_enabled: boolean;
  pulse_speed: number;
}

interface LotusPetalState {
  paper_id: string;
  observed_state: LotusPetalBloomState;
  visual: LotusPetalVisual;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/** True if a paper_id represents a reserved-capacity slot, not a real paper. */
export function isReservedPaperId(paperId: string): boolean {
  if (!paperId) return true;
  const lower = paperId.toLowerCase().trim();
  return (
    lower === 'reserved' ||
    lower.startsWith('reserved') ||
    lower.startsWith('[reserved') ||
    lower === '' ||
    lower === 'tbd'
  );
}

/**
 * Map per-petal bloom_state → visual. Pure; exposed for tests.
 *
 * Visual contract pinned here — the colour palette mirrors the explicit
 * @glowing colours used in garden.seedable.holo so the trait-rendered
 * version matches the hand-authored staged version byte-for-byte at the
 * "sealed" state.
 */
export function deriveLotusPetalVisual(
  state: LotusPetalBloomState,
  paperId: string
): LotusPetalVisual {
  // Reserved-capacity petals are pinned to sealed. This is the project_lotus-
  // genesis-trigger.md contract: future-capacity slots stay dark until a real
  // paper binds. Even if some upstream signal flips them, we override here.
  const effectiveState: LotusPetalBloomState = isReservedPaperId(paperId)
    ? 'sealed'
    : state;

  switch (effectiveState) {
    case 'sealed':
      return {
        opacity: 0.1,
        glow_intensity: 0.1,
        glow_colour: '#220033',
        pulse_enabled: false,
        pulse_speed: 0,
      };
    case 'budding':
      return {
        opacity: 0.4,
        glow_intensity: 0.4,
        glow_colour: '#6633aa',
        pulse_enabled: false,
        pulse_speed: 0,
      };
    case 'blooming':
      return {
        opacity: 0.8,
        glow_intensity: 0.8,
        glow_colour: '#9966cc',
        pulse_enabled: true,
        pulse_speed: 0.5,
      };
    case 'full':
      return {
        opacity: 1.0,
        glow_intensity: 1.2,
        glow_colour: '#cc66ff',
        pulse_enabled: true,
        pulse_speed: 1.0,
      };
    case 'wilted':
      return {
        opacity: 0.5,
        glow_intensity: 0.0,
        glow_colour: '#666666',
        pulse_enabled: false,
        pulse_speed: 0,
      };
    default:
      return {
        opacity: 0.1,
        glow_intensity: 0.1,
        glow_colour: '#220033',
        pulse_enabled: false,
        pulse_speed: 0,
      };
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const lotusPetalHandler: TraitHandler<LotusPetalConfig> = {
  name: 'lotus_petal',

  defaultConfig: {
    paper_id: 'reserved',
    venue: '',
    program: 1,
    layer: 1,
    spiral_index: 0,
    bloom_state_source: 'lotus.api.petal_state.reserved',
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const ctxState = context.getState?.() ?? {};
    const initialBloomRaw = (ctxState[config.bloom_state_source] as
      | LotusPetalBloomState
      | undefined) ?? 'sealed';
    const visual = deriveLotusPetalVisual(initialBloomRaw, config.paper_id);

    const state: LotusPetalState = {
      paper_id: config.paper_id,
      observed_state: initialBloomRaw,
      visual,
    };
    (node as unknown as Record<string, unknown>).__lotusPetalState = state;

    if (config.emit_attach_event) {
      context.emit?.('lotus_petal_attached', {
        node,
        paperId: config.paper_id,
        venue: config.venue,
        program: config.program,
        layer: config.layer,
        spiralIndex: config.spiral_index,
        bloomState: initialBloomRaw,
        visual,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('lotus_petal_detached', { node });
    delete (node as unknown as Record<string, unknown>).__lotusPetalState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Per-frame is the renderer's job — this trait emits visual deltas on
    // bloom-state change events; the @bloom_reactive companion trait
    // translates those to actual render uniforms each frame.
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__lotusPetalState as
      | LotusPetalState
      | undefined;
    if (!state) return;

    if (event.type === 'lotus_petal_state_changed' && event.paperId === config.paper_id) {
      const newState = (event.bloomState as LotusPetalBloomState) ?? 'sealed';
      const visual = deriveLotusPetalVisual(newState, config.paper_id);
      state.observed_state = newState;
      state.visual = visual;

      context.emit?.('lotus_petal_visual_changed', {
        node,
        paperId: config.paper_id,
        program: config.program,
        layer: config.layer,
        spiralIndex: config.spiral_index,
        bloomState: newState,
        visual,
      });
    } else if (event.type === 'lotus_petal_query' && event.paperId === config.paper_id) {
      context.emit?.('lotus_petal_response', {
        queryId: event.queryId,
        node,
        paperId: state.paper_id,
        observedState: state.observed_state,
        visual: state.visual,
      });
    }
  },
};

export default lotusPetalHandler;
