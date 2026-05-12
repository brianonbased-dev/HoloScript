/**
 * DropTableTrait — @drop_table
 *
 * Weighted loot / outcome picker. Each entry has a base `weight`; entries
 * tagged with `rareModifier` get their weight scaled by `1 + (luckBonus *
 * rareModifier)` when `respectLuck` is on and the caller passes a `luckBonus`
 * in the roll payload.
 *
 * Design anchor:
 *   research/2026-05-12_difficulty-and-luck-p-vs-np.md §W.507 (Kolmogorov: luck
 *   = program length; drawing from a weighted distribution is a finite-Kolmogorov
 *   approximation of Solomonoff's universal prior). Also §W.502 — the trait
 *   uses a seeded xorshift PRNG so a future derandomization layer can replay any
 *   roll deterministically.
 *
 * Composition wedge with @luck:
 *   No runtime coupling. The caller composes @luck and @drop_table by reading
 *   `luckBonus` out of a `luck:roll_result` (or any other source) and passing
 *   it into the `drop_table:roll` payload. This keeps the two traits
 *   independently testable — see scoping doc §3.
 *
 * Events (in):
 *   - `drop_table:roll`  payload { rollId?: string, luckBonus?: number, seed?: number }
 *
 * Events (out):
 *   - `drop_table:ready`   emitted on attach (echoes table summary)
 *   - `drop_table:result`  emitted in response to roll
 *   - `drop_table:empty`   emitted if a roll is attempted against an empty entries list
 *
 * @version 0.1.0
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface DropTableEntry {
  /** Item identifier returned to caller on a match. */
  itemId: string;
  /** Base weight. Must be `> 0` to contribute. Zero / negative are skipped. */
  weight: number;
  /** Optional rare-shift coefficient. When `respectLuck` and `luckBonus` are
   *  both active, this entry's effective weight scales by `(1 + luckBonus * rareModifier)`. */
  rareModifier?: number;
}

export interface DropTableConfig {
  /** Routing tag. */
  tableId: string;
  /** Ordered entry list. */
  entries: DropTableEntry[];
  /** When true, apply `luckBonus * rareModifier` scaling. Default false. */
  respectLuck?: boolean;
}

export interface DropTableState {
  /** xorshift32 state — seeded from config or roll payload. */
  rngState: number;
  /** Number of rolls performed since attach. */
  rollCount: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/** xorshift32 step — same mixing primitive as @luck (intentional). */
function xorshift32(state: { rngState: number }): number {
  let x = state.rngState | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x | 0;
  return x >>> 0;
}

/**
 * Compute the effective weight for an entry given the active `luckBonus`.
 * Pure. Negative results are clamped to 0 (can't have a negative weight).
 */
export function effectiveWeight(
  entry: DropTableEntry,
  luckBonus: number,
  respectLuck: boolean
): number {
  if (!Number.isFinite(entry.weight) || entry.weight <= 0) return 0;
  if (!respectLuck) return entry.weight;
  const rm = typeof entry.rareModifier === 'number' && Number.isFinite(entry.rareModifier)
    ? entry.rareModifier
    : 0;
  if (rm === 0) return entry.weight;
  const scaled = entry.weight * (1 + luckBonus * rm);
  return scaled > 0 ? scaled : 0;
}

/**
 * Pick an entry from `entries` by cumulative weight given a roll in `[0, 1)`.
 * Returns `null` if total weight is `0`. Pure, deterministic.
 *
 * Exported so tests can exercise the weighted pick without event plumbing or
 * the PRNG seed dance.
 */
export function pickByWeight(
  entries: readonly DropTableEntry[],
  draw: number,
  luckBonus: number,
  respectLuck: boolean
): { entry: DropTableEntry; weightUsed: number; totalWeight: number } | null {
  let total = 0;
  for (const e of entries) total += effectiveWeight(e, luckBonus, respectLuck);
  if (total <= 0) return null;
  const target = draw * total;
  let acc = 0;
  for (const e of entries) {
    const w = effectiveWeight(e, luckBonus, respectLuck);
    if (w <= 0) continue;
    acc += w;
    if (target < acc) {
      return { entry: e, weightUsed: w, totalWeight: total };
    }
  }
  // Floating-point fallthrough — return the last contributing entry.
  for (let i = entries.length - 1; i >= 0; i--) {
    const w = effectiveWeight(entries[i], luckBonus, respectLuck);
    if (w > 0) return { entry: entries[i], weightUsed: w, totalWeight: total };
  }
  return null;
}

// =============================================================================
// INTERNALS
// =============================================================================

function getState(node: HSPlusNode): DropTableState | undefined {
  return node.__dropTableState as DropTableState | undefined;
}

function initState(node: HSPlusNode, seed: number): DropTableState {
  const safeSeed = (seed | 0) === 0 ? 1 : seed | 0;
  const state: DropTableState = { rngState: safeSeed, rollCount: 0 };
  node.__dropTableState = state;
  return state;
}

// =============================================================================
// HANDLER
// =============================================================================

export const dropTableHandler: TraitHandler<DropTableConfig> = {
  name: 'drop_table',

  defaultConfig: {
    tableId: 'unnamed-table',
    entries: [],
    respectLuck: false,
  },

  onAttach(node, config, context) {
    initState(node, 1);
    let totalWeight = 0;
    for (const e of config.entries) {
      if (Number.isFinite(e.weight) && e.weight > 0) totalWeight += e.weight;
    }
    context.emit?.('drop_table:ready', {
      node,
      tableId: config.tableId,
      entryCount: config.entries.length,
      totalWeight,
      respectLuck: config.respectLuck === true,
    });
  },

  onDetach(node) {
    delete node.__dropTableState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'drop_table:roll') {
      const payload = extractPayload(event);

      if (!Array.isArray(config.entries) || config.entries.length === 0) {
        context.emit?.('drop_table:empty', {
          rollId: payload.rollId,
          tableId: config.tableId,
        });
        return;
      }

      // Optional per-roll seed override — allows callers to derandomize a roll
      // chain by pinning the seed explicitly (W.502 derandomization debt).
      if (typeof payload.seed === 'number' && payload.seed !== 0) {
        state.rngState = payload.seed | 0;
      }

      const luckBonus = typeof payload.luckBonus === 'number' && !Number.isNaN(payload.luckBonus)
        ? payload.luckBonus
        : 0;
      const respectLuck = config.respectLuck === true;

      state.rollCount += 1;
      const raw = xorshift32(state);
      const draw = (raw >>> 0) / 0x1_0000_0000;
      const result = pickByWeight(config.entries, draw, luckBonus, respectLuck);

      if (!result) {
        context.emit?.('drop_table:empty', {
          rollId: payload.rollId,
          tableId: config.tableId,
          reason: 'all-weights-zero',
        });
        return;
      }

      context.emit?.('drop_table:result', {
        rollId: payload.rollId,
        tableId: config.tableId,
        itemId: result.entry.itemId,
        weightUsed: result.weightUsed,
        totalWeight: result.totalWeight,
        draw,
        luckBonus,
        respectLuck,
        rollCount: state.rollCount,
      });
      return;
    }
  },
};

export default dropTableHandler;
