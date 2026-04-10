/**
 * CircuitBreakerTrait — v5.1
 *
 * Standalone circuit breaker pattern for HoloScript compositions.
 * Three states: closed (normal), open (blocking), half-open (testing).
 * Tracks failure/success rates with sliding window metrics.
 *
 * Unlike RetryTrait's integrated circuit breaker, this is a standalone
 * guard that can protect any action across the composition.
 *
 * Events:
 *  circuit_breaker:opened      { failureCount, failureRate, window }
 *  circuit_breaker:half_opened { testAfterMs }
 *  circuit_breaker:closed      { recoveredAfterMs, successCount }
 *  circuit_breaker:rejected    { action, state, remainingMs }
 *  circuit_breaker:success     { action, elapsed }
 *  circuit_breaker:failure     { action, error }
 *  circuit_breaker:execute     (command) Guard an action
 *  circuit_breaker:result      (inbound) Report action result
 *  circuit_breaker:reset       (command) Force reset to closed
 *  circuit_breaker:get_status  (command) Get circuit state
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type CBState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Failure count threshold to open circuit */
  failure_threshold: number;
  /** Time window for counting failures (ms) */
  window_ms: number;
  /** Time before transitioning from open to half-open (ms) */
  reset_timeout_ms: number;
  /** Number of successful test requests to close from half-open */
  success_threshold: number;
  /** Optional: failure rate threshold (0-1) instead of count */
  failure_rate_threshold: number;
  /** Minimum requests before rate threshold applies */
  min_requests: number;
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
}

export interface CircuitBreakerState {
  state: CBState;
  openedAt: number;
  halfOpenSuccesses: number;
  requestLog: RequestRecord[];
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  pendingActions: Map<string, { action: string; startedAt: number }>;
  actionCounter: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const circuitBreakerHandler: TraitHandler<CircuitBreakerConfig> = {
  name: 'circuit_breaker',

  defaultConfig: {
    failure_threshold: 5,
    window_ms: 60000,
    reset_timeout_ms: 30000,
    success_threshold: 2,
    failure_rate_threshold: 0,
    min_requests: 10,
  },

  onAttach(node: HSPlusNode, _config: CircuitBreakerConfig, _context: TraitContext): void {
    const state: CircuitBreakerState = {
      state: 'closed',
      openedAt: 0,
      halfOpenSuccesses: 0,
      requestLog: [],
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      pendingActions: new Map(),
      actionCounter: 0,
    };
    node.__circuitBreakerState = state;
  },

  onDetach(node: HSPlusNode, _config: CircuitBreakerConfig, _context: TraitContext): void {
    delete node.__circuitBreakerState;
  },

  onUpdate(
    node: HSPlusNode,
    config: CircuitBreakerConfig,
    context: TraitContext,
    _delta: number
  ): void {
    // @ts-expect-error
    const state: CircuitBreakerState | undefined = node.__circuitBreakerState;
    if (!state) return;

    // Auto-transition from open → half-open
    if (state.state === 'open') {
      const elapsed = Date.now() - state.openedAt;
      if (elapsed >= config.reset_timeout_ms) {
        state.state = 'half-open';
        state.halfOpenSuccesses = 0;
        context.emit?.('circuit_breaker:half_opened', {
          testAfterMs: elapsed,
        });
      }
    }

    // Prune old request log entries outside window
    const cutoff = Date.now() - config.window_ms;
    state.requestLog = state.requestLog.filter((r) => r.timestamp >= cutoff);
  },

  onEvent(
    node: HSPlusNode,
    config: CircuitBreakerConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    // @ts-expect-error
    const state: CircuitBreakerState | undefined = node.__circuitBreakerState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);

    switch (eventType) {
      case 'circuit_breaker:execute': {
        const action = payload.action as string;
        if (!action) break;

        // Check circuit state
        if (state.state === 'open') {
          const remainingMs = Math.max(0, config.reset_timeout_ms - (Date.now() - state.openedAt));
          context.emit?.('circuit_breaker:rejected', {
            action,
            state: 'open',
            remainingMs,
          });
          break;
        }

        const cbId = `cb_${state.actionCounter++}`;
        state.pendingActions.set(cbId, { action, startedAt: Date.now() });
        state.totalRequests++;

        // Forward the action
        context.emit?.(action, {
          ...payload.params,
          __circuitBreakerId: cbId,
        });
        break;
      }

      case 'circuit_breaker:result': {
        const cbId = payload.cbId as string;
        const success = payload.success as boolean;
        const error = payload.error as string | undefined;
        const pending = state.pendingActions.get(cbId);
        if (!pending) break;

        const elapsed = Date.now() - pending.startedAt;
        state.pendingActions.delete(cbId);

        state.requestLog.push({ timestamp: Date.now(), success });

        if (success) {
          state.totalSuccesses++;
          context.emit?.('circuit_breaker:success', {
            action: pending.action,
            elapsed,
          });

          if (state.state === 'half-open') {
            state.halfOpenSuccesses++;
            if (state.halfOpenSuccesses >= config.success_threshold) {
              state.state = 'closed';
              context.emit?.('circuit_breaker:closed', {
                recoveredAfterMs: Date.now() - state.openedAt,
                successCount: state.halfOpenSuccesses,
              });
            }
          }
        } else {
          state.totalFailures++;
          context.emit?.('circuit_breaker:failure', {
            action: pending.action,
            error: error ?? 'unknown',
          });

          // Half-open failure → reopen
          if (state.state === 'half-open') {
            openCircuit(state, config, context);
            break;
          }

          // Check thresholds
          if (shouldOpen(state, config)) {
            openCircuit(state, config, context);
          }
        }
        break;
      }

      case 'circuit_breaker:reset': {
        state.state = 'closed';
        state.halfOpenSuccesses = 0;
        state.requestLog = [];
        context.emit?.('circuit_breaker:closed', {
          recoveredAfterMs: 0,
          successCount: 0,
        });
        break;
      }

      case 'circuit_breaker:get_status': {
        const windowFailures = state.requestLog.filter((r) => !r.success).length;
        const windowTotal = state.requestLog.length;
        context.emit?.('circuit_breaker:status', {
          state: state.state,
          totalRequests: state.totalRequests,
          totalSuccesses: state.totalSuccesses,
          totalFailures: state.totalFailures,
          windowFailures,
          windowTotal,
          failureRate: windowTotal > 0 ? windowFailures / windowTotal : 0,
          pending: state.pendingActions.size,
        });
        break;
      }
    }
  },
};

function shouldOpen(state: CircuitBreakerState, config: CircuitBreakerConfig): boolean {
  const windowFailures = state.requestLog.filter((r) => !r.success).length;

  // Count-based threshold
  if (windowFailures >= config.failure_threshold) return true;

  // Rate-based threshold
  if (config.failure_rate_threshold > 0 && state.requestLog.length >= config.min_requests) {
    const rate = windowFailures / state.requestLog.length;
    if (rate >= config.failure_rate_threshold) return true;
  }

  return false;
}

function openCircuit(
  state: CircuitBreakerState,
  config: CircuitBreakerConfig,
  context: TraitContext
): void {
  state.state = 'open';
  state.openedAt = Date.now();
  const windowFailures = state.requestLog.filter((r) => !r.success).length;
  const failureRate = state.requestLog.length > 0 ? windowFailures / state.requestLog.length : 0;

  context.emit?.('circuit_breaker:opened', {
    failureCount: windowFailures,
    failureRate,
    window: config.window_ms,
  });
}

export default circuitBreakerHandler;
