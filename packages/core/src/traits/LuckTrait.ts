/**
 * LuckTrait — @luck
 *
 * RNG modifier — shifts the threshold of a probabilistic check.
 *
 * Design anchor:
 *   research/2026-05-12_difficulty-and-luck-p-vs-np.md §W.502 (randomness is a
 *   placeholder for derandomization debt). @luck's contract is to make the
 *   randomness explicit and seeded, so a future derandomized solver can replay
 *   it deterministically. Every roll is reproducible from `(seed, callsSoFar)`.
 *
 * Composition with @drop_table:
 *   The luck-bonus shape (additive shift to threshold) generalises to any
 *   weighted decision. @drop_table reads `luckBonus` from its event payload so
 *   a caller can compose @luck and @drop_table without a runtime dependency
 *   between the two traits.
 *
 * Events (in):
 *   - `luck:roll`  payload { threshold: number, rollId?: string }
 *
 * Events (out):
 *   - `luck:ready`        emitted on attach (reports active seed)
 *   - `luck:roll_result`  emitted in response to roll
 *
 * @version 0.1.0
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface LuckConfig {
  /** Base success probability in `[0, 1]` (gets compared against a roll). */
  baseChance: number;
  /** Additive shift applied to the threshold each roll. Positive = luckier. */
  luckBonus?: number;
  /** PRNG seed. Defaults to `1`. Seed `0` is treated as `1` (xorshift forbids 0 state). */
  seed?: number;
}

export interface LuckState {
  /** Current xorshift32 state. */
  rngState: number;
  /** Number of rolls performed since attach. */
  rollCount: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * One step of xorshift32. Returns a uint32 and updates `state.rngState` in-place.
 * Pure-ish (mutates state object only). Self-contained — no external RNG.
 */
function xorshift32(state: { rngState: number }): number {
  let x = state.rngState | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x | 0;
  // Map to uint32 by zero-fill shift.
  return x >>> 0;
}

/**
 * Draw a deterministic float in `[0, 1)` from a seed counter pair.
 * Exported pure helper so callers can reproduce a roll without an attached trait.
 */
export function seededRand01(seed: number, counter: number): number {
  // Mix seed and counter through one xorshift32 step each, then combine.
  const state = { rngState: (seed | 0) === 0 ? 1 : seed | 0 };
  // Advance `counter` times so the same (seed, counter) pair always yields the same draw.
  for (let i = 0; i <= counter; i++) xorshift32(state);
  // Map the final uint32 to [0, 1).
  return (state.rngState >>> 0) / 0x1_0000_0000;
}

/**
 * Compute the modified threshold for a roll. Pure. Clamped to `[0, 1]`.
 * `baseChance` is the underlying chance; `luckBonus` shifts it upward (more likely).
 */
export function modifiedThreshold(baseChance: number, luckBonus: number): number {
  const t = baseChance + luckBonus;
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

// =============================================================================
// INTERNALS
// =============================================================================

function getState(node: HSPlusNode): LuckState | undefined {
  return node.__luckState as LuckState | undefined;
}

function initState(node: HSPlusNode, config: LuckConfig): LuckState {
  const seed = typeof config.seed === 'number' && config.seed !== 0 ? config.seed | 0 : 1;
  const state: LuckState = { rngState: seed, rollCount: 0 };
  node.__luckState = state;
  return state;
}

// =============================================================================
// HANDLER
// =============================================================================

export const luckHandler: TraitHandler<LuckConfig> = {
  name: 'luck',

  defaultConfig: {
    baseChance: 0.5,
    luckBonus: 0,
    seed: 1,
  },

  onAttach(node, config, context) {
    const state = initState(node, config);
    context.emit?.('luck:ready', {
      node,
      seed: state.rngState,
      luckBonus: config.luckBonus ?? 0,
    });
  },

  onDetach(node) {
    delete node.__luckState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'luck:roll') {
      const payload = extractPayload(event);
      const rawThreshold = typeof payload.threshold === 'number' && !Number.isNaN(payload.threshold)
        ? payload.threshold
        : config.baseChance;
      const luckBonus = typeof config.luckBonus === 'number' ? config.luckBonus : 0;
      const finalThreshold = modifiedThreshold(rawThreshold, luckBonus);
      // Advance PRNG and draw.
      state.rollCount += 1;
      const raw = xorshift32(state);
      const roll = (raw >>> 0) / 0x1_0000_0000;
      const outcome = roll < finalThreshold;

      context.emit?.('luck:roll_result', {
        rollId: payload.rollId,
        outcome,
        roll,
        baseThreshold: rawThreshold,
        modifiedThreshold: finalThreshold,
        luckBonus,
        rollCount: state.rollCount,
      });
      return;
    }
  },
};

export default luckHandler;
