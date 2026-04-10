/**
 * TimeoutGuardTrait — v5.1
 *
 * Configurable operation timeout wrapper for HoloScript compositions.
 * Wraps action execution with a timeout — if the result doesn't arrive
 * within the configured duration, emits a timeout event and optionally
 * triggers a fallback action.
 *
 * Events:
 *  timeout_guard:started     { guardId, action, timeout_ms }
 *  timeout_guard:completed   { guardId, action, elapsed }
 *  timeout_guard:timed_out   { guardId, action, timeout_ms, elapsed }
 *  timeout_guard:fallback    { guardId, action, fallbackAction }
 *  timeout_guard:execute     (command) Guard an action with timeout
 *  timeout_guard:result      (inbound) Report action completion
 *  timeout_guard:cancel      (command) Cancel a pending guard
 *  timeout_guard:get_status  (command) Get guard status
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface TimeoutGuardConfig {
  /** Default timeout in ms */
  default_timeout_ms: number;
  /** Default fallback action to emit on timeout (empty = no fallback) */
  default_fallback_action: string;
  /** Maximum concurrent guarded operations */
  max_concurrent: number;
}

interface GuardedOperation {
  guardId: string;
  action: string;
  startedAt: number;
  timeout_ms: number;
  fallbackAction: string;
  timer: ReturnType<typeof setTimeout>;
}

export interface TimeoutGuardState {
  operations: Map<string, GuardedOperation>;
  totalStarted: number;
  totalCompleted: number;
  totalTimedOut: number;
  guardCounter: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const timeoutGuardHandler: TraitHandler<TimeoutGuardConfig> = {
  name: 'timeout_guard',

  defaultConfig: {
    default_timeout_ms: 30000,
    default_fallback_action: '',
    max_concurrent: 20,
  },

  onAttach(node: HSPlusNode, _config: TimeoutGuardConfig, _context: TraitContext): void {
    const state: TimeoutGuardState = {
      operations: new Map(),
      totalStarted: 0,
      totalCompleted: 0,
      totalTimedOut: 0,
      guardCounter: 0,
    };
    (node as any).__timeoutGuardState = state;
  },

  onDetach(node: HSPlusNode, _config: TimeoutGuardConfig, _context: TraitContext): void {
    const state: TimeoutGuardState | undefined = (node as any).__timeoutGuardState;
    if (state) {
      for (const [, op] of state.operations) {
        clearTimeout(op.timer);
      }
      state.operations.clear();
    }
    delete (node as any).__timeoutGuardState;
  },

  onUpdate(
    _node: HSPlusNode,
    _config: TimeoutGuardConfig,
    _context: TraitContext,
    _delta: number
  ): void {
    // Timer-driven, no per-frame work
  },

  onEvent(
    node: HSPlusNode,
    config: TimeoutGuardConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state: TimeoutGuardState | undefined = (node as any).__timeoutGuardState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);

    switch (eventType) {
      case 'timeout_guard:execute': {
        const action = payload.action as string;
        if (!action) break;

        if (state.operations.size >= config.max_concurrent) {
          context.emit?.('timeout_guard:timed_out', {
            guardId: '',
            action,
            timeout_ms: 0,
            elapsed: 0,
            error: 'Max concurrent operations reached',
          });
          break;
        }

        const guardId = `tg_${state.guardCounter++}`;
        const timeout_ms = (payload.timeout_ms as number) ?? config.default_timeout_ms;
        const fallbackAction =
          (payload.fallback_action as string) ?? config.default_fallback_action;

        const timer = setTimeout(() => {
          const op = state.operations.get(guardId);
          if (!op) return;

          state.operations.delete(guardId);
          state.totalTimedOut++;

          context.emit?.('timeout_guard:timed_out', {
            guardId,
            action: op.action,
            timeout_ms: op.timeout_ms,
            elapsed: Date.now() - op.startedAt,
          });

          // Trigger fallback if configured
          if (op.fallbackAction) {
            context.emit?.('timeout_guard:fallback', {
              guardId,
              action: op.action,
              fallbackAction: op.fallbackAction,
            });
            context.emit?.(op.fallbackAction, {
              __timeoutGuardId: guardId,
              originalAction: op.action,
            });
          }
        }, timeout_ms);

        const op: GuardedOperation = {
          guardId,
          action,
          startedAt: Date.now(),
          timeout_ms,
          fallbackAction,
          timer,
        };
        state.operations.set(guardId, op);
        state.totalStarted++;

        context.emit?.('timeout_guard:started', {
          guardId,
          action,
          timeout_ms,
        });

        // Forward the action
        context.emit?.(action, {
          ...payload.params,
          __timeoutGuardId: guardId,
        });
        break;
      }

      case 'timeout_guard:result': {
        const guardId = payload.guardId as string;
        const op = state.operations.get(guardId);
        if (!op) break;

        clearTimeout(op.timer);
        state.operations.delete(guardId);
        state.totalCompleted++;

        context.emit?.('timeout_guard:completed', {
          guardId,
          action: op.action,
          elapsed: Date.now() - op.startedAt,
        });
        break;
      }

      case 'timeout_guard:cancel': {
        const guardId = payload.guardId as string;
        const op = state.operations.get(guardId);
        if (op) {
          clearTimeout(op.timer);
          state.operations.delete(guardId);
        }
        break;
      }

      case 'timeout_guard:get_status': {
        context.emit?.('timeout_guard:status', {
          active: state.operations.size,
          totalStarted: state.totalStarted,
          totalCompleted: state.totalCompleted,
          totalTimedOut: state.totalTimedOut,
          operations: Array.from(state.operations.values()).map((op) => ({
            guardId: op.guardId,
            action: op.action,
            elapsed: Date.now() - op.startedAt,
            timeout_ms: op.timeout_ms,
          })),
        });
        break;
      }
    }
  },
};

export default timeoutGuardHandler;
