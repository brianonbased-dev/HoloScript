/**
 * StatTrait — @stat
 *
 * Attribute carrier for HoloLand (and any HoloScript scene-graph node that needs
 * a named numeric attribute). Tracks a base value, optional clamping bounds,
 * and an ordered modifier stack. The effective value is `base + sum(modifiers)`
 * clamped to `[min, max]` when those are set.
 *
 * Design anchor:
 *   research/2026-05-12_difficulty-and-luck-p-vs-np.md §W.503 (difficulty lives
 *   at phase boundaries — the *attribute* is what defines where on the boundary
 *   a participant sits; @stat is the substrate the rest of the family reads).
 *
 * Composition:
 *   @stat is independent. @luck, @encounter, @drop_table do NOT read @stat
 *   directly; consumers wire them by passing stat values into event payloads.
 *
 * Events (in):
 *   - `stat:set`     payload { value: number }                — replace base value
 *   - `stat:modify`  payload { source: string, delta: number } — push a modifier
 *   - `stat:query`   payload { queryId?: string }              — request a snapshot
 *
 * Events (out):
 *   - `stat:ready`       emitted on attach
 *   - `stat:changed`     emitted on set/modify with new effective value
 *   - `stat:value`       emitted in response to query
 *
 * @version 0.1.0
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface StatModifier {
  /** Source tag — how a consumer identifies / revokes a modifier. */
  source: string;
  /** Additive offset applied to the base value. */
  delta: number;
}

export interface StatConfig {
  /** Attribute name (e.g. `'strength'`, `'agility'`). */
  name: string;
  /** Base / unmodified value. */
  value: number;
  /** Optional lower clamp on effective value. */
  min?: number;
  /** Optional upper clamp on effective value. */
  max?: number;
  /** Initial modifier stack (default: empty). */
  modifiers?: StatModifier[];
}

export interface StatState {
  /** Current base value (mutated by `stat:set`). */
  baseValue: number;
  /** Mutable modifier stack. */
  modifiers: StatModifier[];
  /** Last computed effective value (cache). */
  lastEffective: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Apply modifier stack to a base value, then clamp to `[min, max]` when set.
 * Pure, deterministic, exported for direct unit testing.
 */
export function applyStatModifiers(
  base: number,
  modifiers: readonly StatModifier[],
  min?: number,
  max?: number
): number {
  let sum = base;
  for (const m of modifiers) sum += m.delta;
  if (typeof min === 'number' && sum < min) sum = min;
  if (typeof max === 'number' && sum > max) sum = max;
  return sum;
}

// =============================================================================
// INTERNALS
// =============================================================================

function getState(node: HSPlusNode): StatState | undefined {
  return node.__statState as StatState | undefined;
}

function initState(node: HSPlusNode, config: StatConfig): StatState {
  const state: StatState = {
    baseValue: config.value,
    modifiers: Array.isArray(config.modifiers) ? [...config.modifiers] : [],
    lastEffective: applyStatModifiers(
      config.value,
      config.modifiers ?? [],
      config.min,
      config.max
    ),
  };
  node.__statState = state;
  return state;
}

function recompute(state: StatState, config: StatConfig): number {
  state.lastEffective = applyStatModifiers(state.baseValue, state.modifiers, config.min, config.max);
  return state.lastEffective;
}

// =============================================================================
// HANDLER
// =============================================================================

export const statHandler: TraitHandler<StatConfig> = {
  name: 'stat',

  defaultConfig: {
    name: 'value',
    value: 0,
    modifiers: [],
  },

  onAttach(node, config, context) {
    const state = initState(node, config);
    context.emit?.('stat:ready', {
      node,
      name: config.name,
      baseValue: state.baseValue,
      effective: state.lastEffective,
      min: config.min,
      max: config.max,
    });
  },

  onDetach(node) {
    delete node.__statState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'stat:set') {
      const payload = extractPayload(event);
      const raw = payload.value;
      if (typeof raw !== 'number' || Number.isNaN(raw)) return;
      state.baseValue = raw;
      const effective = recompute(state, config);
      context.emit?.('stat:changed', {
        name: config.name,
        baseValue: state.baseValue,
        effective,
        cause: 'set',
      });
      return;
    }

    if (event.type === 'stat:modify') {
      const payload = extractPayload(event);
      const source = typeof payload.source === 'string' ? payload.source : '';
      const delta = typeof payload.delta === 'number' && !Number.isNaN(payload.delta)
        ? payload.delta
        : NaN;
      if (!source || Number.isNaN(delta)) return;
      state.modifiers.push({ source, delta });
      const effective = recompute(state, config);
      context.emit?.('stat:changed', {
        name: config.name,
        baseValue: state.baseValue,
        effective,
        cause: 'modify',
        modifier: { source, delta },
      });
      return;
    }

    if (event.type === 'stat:query') {
      const payload = extractPayload(event);
      const effective = recompute(state, config);
      context.emit?.('stat:value', {
        queryId: payload.queryId,
        name: config.name,
        baseValue: state.baseValue,
        effective,
        modifiers: [...state.modifiers],
      });
      return;
    }
  },
};

export default statHandler;
