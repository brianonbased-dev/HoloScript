/**
 * WorldHeartbeatTrait — Wisdom/Gotcha Atom #5
 *
 * Global pulse emitter for distributed system synchronization.
 * Provisions redundant emitters to avoid single-point-of-failure behavior.
 *
 * Gotcha guarded: Single heartbeat emitter failure desynchronizes world services.
 *
 * Events emitted:
 *  heartbeat_initialized  { node, interval_ms, redundancy }
 *  heartbeat_tick         { node, sequence, emitterId, timestamp }
 *  heartbeat_failover     { node, failedEmitter, newPrimary }
 *  heartbeat_error        { node, error }
 *
 * @see proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorldHeartbeatConfig {
  /** Heartbeat interval in milliseconds (>= 100) */
  interval_ms: number;
  /** Number of redundant emitters (>= 1) */
  redundancy: number;
  /** Enable failover detection (missed beats before failover) */
  failover_threshold: number;
}

interface EmitterState {
  id: string;
  active: boolean;
  lastTickAt: number;
  missedBeats: number;
}

interface HeartbeatState {
  initialized: boolean;
  sequence: number;
  primaryEmitter: string;
  emitters: EmitterState[];
  lastTickAt: number;
  elapsed: number;
}

type HeartbeatNode = HSPlusNode & {
  __worldHeartbeatState?: HeartbeatState;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WorldHeartbeatConfig = {
  interval_ms: 1000,
  redundancy: 2,
  failover_threshold: 3,
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export const worldHeartbeatHandler: TraitHandler<WorldHeartbeatConfig> = {
  name: 'world_heartbeat',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: WorldHeartbeatConfig, context: TraitContext): void {
    const hbNode = node as HeartbeatNode;

    // Validate config
    if (config.interval_ms < 100) {
      context.emit('heartbeat_error', {
        node,
        error: `interval_ms must be >= 100, got ${config.interval_ms}`,
      });
      return;
    }
    if (config.redundancy < 1) {
      context.emit('heartbeat_error', {
        node,
        error: `redundancy must be >= 1, got ${config.redundancy}`,
      });
      return;
    }

    // Gotcha: single redundancy in distributed targets
    if (config.redundancy === 1 && node.traits?.has('networked')) {
      context.emit('heartbeat_error', {
        node,
        warning: 'redundancy=1 on a networked object. A single emitter failure will desynchronize world services.',
      });
    }

    const emitters: EmitterState[] = [];
    for (let i = 0; i < config.redundancy; i++) {
      emitters.push({
        id: `emitter-${i}`,
        active: i === 0, // Primary emitter is active, standby otherwise
        lastTickAt: Date.now(),
        missedBeats: 0,
      });
    }

    const state: HeartbeatState = {
      initialized: true,
      sequence: 0,
      primaryEmitter: emitters[0].id,
      emitters,
      lastTickAt: Date.now(),
      elapsed: 0,
    };
    hbNode.__worldHeartbeatState = state;

    context.emit('heartbeat_initialized', {
      node,
      interval_ms: config.interval_ms,
      redundancy: config.redundancy,
    });
  },

  onDetach(node: HSPlusNode): void {
    delete (node as HeartbeatNode).__worldHeartbeatState;
  },

  onUpdate(node: HSPlusNode, config: WorldHeartbeatConfig, context: TraitContext, delta: number): void {
    const hbNode = node as HeartbeatNode;
    const state = hbNode.__worldHeartbeatState;
    if (!state?.initialized) return;

    state.elapsed += delta * 1000; // delta is in seconds, interval is in ms

    if (state.elapsed >= config.interval_ms) {
      state.elapsed -= config.interval_ms;
      state.sequence++;
      state.lastTickAt = Date.now();

      // Find primary emitter
      const primary = state.emitters.find(e => e.id === state.primaryEmitter);
      if (primary) {
        primary.lastTickAt = state.lastTickAt;
        primary.missedBeats = 0;
      }

      context.emit('heartbeat_tick', {
        node,
        sequence: state.sequence,
        emitterId: state.primaryEmitter,
        timestamp: state.lastTickAt,
      });
    }
  },

  onEvent(node: HSPlusNode, config: WorldHeartbeatConfig, context: TraitContext, event: { type: string; [key: string]: unknown }): void {
    const hbNode = node as HeartbeatNode;
    const state = hbNode.__worldHeartbeatState;
    if (!state?.initialized) return;

    if (event.type === 'heartbeat_emitter_failure') {
      const failedId = event.emitterId as string;
      const failed = state.emitters.find(e => e.id === failedId);
      if (!failed) return;

      failed.active = false;
      failed.missedBeats++;

      // Failover if primary failed and threshold exceeded
      if (failedId === state.primaryEmitter && failed.missedBeats >= config.failover_threshold) {
        const standby = state.emitters.find(e => e.id !== failedId && e.active !== false);
        if (standby) {
          standby.active = true;
          state.primaryEmitter = standby.id;

          context.emit('heartbeat_failover', {
            node,
            failedEmitter: failedId,
            newPrimary: standby.id,
            sequence: state.sequence,
          });
        } else {
          context.emit('heartbeat_error', {
            node,
            error: `All emitters failed. No standby available for failover.`,
          });
        }
      }
    }
  },
};
