/**
 * EncounterTrait — @encounter
 *
 * Trigger registry. Couples a named encounter to one of four condition shapes
 * (proximity, interaction, time, agent-state) and gates re-firing via a cooldown.
 *
 * Design anchor:
 *   research/2026-05-12_difficulty-and-luck-p-vs-np.md §W.503 (phase boundaries
 *   — encounters are where the difficulty boundary actually meets a participant).
 *   The trait does not decide whether the condition is *met* — it accepts an
 *   `encounter:check` event with `{ conditionMet: boolean }` and emits
 *   `encounter:fire` if the cooldown has expired.
 *
 * Composition:
 *   Independent of @stat / @luck / @drop_table at the trait level. The
 *   wedge is that the caller of `encounter:check` can fold in stat / luck
 *   reads to compute `conditionMet`, and a fired encounter can chain into a
 *   `drop_table:roll`.
 *
 * Events (in):
 *   - `encounter:check`  payload { conditionMet: boolean, now?: number, data?: unknown }
 *   - `encounter:reset`  payload {}                                         — clear lastFire timestamp
 *
 * Events (out):
 *   - `encounter:ready`     emitted on attach
 *   - `encounter:fire`      emitted when conditionMet && cooldown elapsed
 *   - `encounter:suppressed` emitted when conditionMet but cooldown still active
 *
 * @version 0.1.0
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type EncounterTriggerType = 'proximity' | 'interaction' | 'time' | 'state';

export interface EncounterConfig {
  /** Unique encounter id (routing tag). */
  encounterId: string;
  /** Which trigger family this encounter belongs to. */
  triggerType: EncounterTriggerType;
  /** Minimum gap between fires, in milliseconds. `0` means "no cooldown — always fires". */
  cooldownMs?: number;
}

export interface EncounterState {
  /** Timestamp of last fire. `-Infinity` means never fired. */
  lastFireTimestamp: number;
  /** Number of times this encounter has fired since attach. */
  fireCount: number;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Decide whether a check at `now` should fire given the previous fire time
 * and the cooldown. Pure / deterministic. Exported for direct unit testing.
 *
 * Notes:
 *   - `cooldown === 0` always fires (caller asked for no gating).
 *   - `cooldown < 0` is treated as `0` (defensive — never blocks).
 */
export function shouldFire(now: number, lastFire: number, cooldownMs: number): boolean {
  const cd = cooldownMs > 0 ? cooldownMs : 0;
  if (cd === 0) return true;
  if (!Number.isFinite(lastFire)) return true;
  return now - lastFire >= cd;
}

// =============================================================================
// INTERNALS
// =============================================================================

function getState(node: HSPlusNode): EncounterState | undefined {
  return node.__encounterState as EncounterState | undefined;
}

function initState(node: HSPlusNode): EncounterState {
  const state: EncounterState = {
    lastFireTimestamp: Number.NEGATIVE_INFINITY,
    fireCount: 0,
  };
  node.__encounterState = state;
  return state;
}

// =============================================================================
// HANDLER
// =============================================================================

export const encounterHandler: TraitHandler<EncounterConfig> = {
  name: 'encounter',

  defaultConfig: {
    encounterId: 'unnamed-encounter',
    triggerType: 'interaction',
    cooldownMs: 0,
  },

  onAttach(node, config, context) {
    initState(node);
    context.emit?.('encounter:ready', {
      node,
      encounterId: config.encounterId,
      triggerType: config.triggerType,
      cooldownMs: config.cooldownMs ?? 0,
    });
  },

  onDetach(node) {
    delete node.__encounterState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'encounter:check') {
      const payload = extractPayload(event);
      const conditionMet = payload.conditionMet === true;
      if (!conditionMet) return; // FALSE → silent; caller can probe via separate event if needed
      const now = typeof payload.now === 'number' ? payload.now : Date.now();
      const cd = typeof config.cooldownMs === 'number' ? config.cooldownMs : 0;

      if (!shouldFire(now, state.lastFireTimestamp, cd)) {
        context.emit?.('encounter:suppressed', {
          encounterId: config.encounterId,
          now,
          lastFireTimestamp: state.lastFireTimestamp,
          cooldownMs: cd,
          remainingMs: cd - (now - state.lastFireTimestamp),
        });
        return;
      }

      state.lastFireTimestamp = now;
      state.fireCount += 1;
      context.emit?.('encounter:fire', {
        encounterId: config.encounterId,
        triggerType: config.triggerType,
        firedAt: now,
        fireCount: state.fireCount,
        data: payload.data,
      });
      return;
    }

    if (event.type === 'encounter:reset') {
      state.lastFireTimestamp = Number.NEGATIVE_INFINITY;
      context.emit?.('encounter:reset_ack', {
        encounterId: config.encounterId,
        fireCount: state.fireCount,
      });
      return;
    }
  },
};

export default encounterHandler;
