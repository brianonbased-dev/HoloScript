/**
 * RetryTrait — v5.1
 *
 * Exponential backoff with integrated circuit breaker for HoloScript
 * compositions. Wraps action execution with retry logic and failure
 * tracking. Circuit opens after consecutive failures, auto-resets
 * after cooldown.
 *
 * Events:
 *  retry:attempt          { actionName, attempt, maxRetries }
 *  retry:success          { actionName, attempt, elapsed }
 *  retry:failure          { actionName, attempt, error }
 *  retry:exhausted        { actionName, totalAttempts }
 *  retry:circuit_open     { consecutiveFailures, resetMs }
 *  retry:circuit_half     { testAttempt }
 *  retry:circuit_close    { recoveredAfterMs }
 *  retry:execute          (command) Execute with retry
 *  retry:action_result    (inbound) Report action result
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type BackoffStrategy = 'exponential' | 'linear' | 'constant';
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface RetryConfig {
  /** Maximum retry attempts */
  max_retries: number;
  /** Base delay between retries in ms */
  base_delay_ms: number;
  /** Maximum delay cap in ms */
  max_delay_ms: number;
  /** Backoff strategy */
  backoff: BackoffStrategy;
  /** Add random jitter to delay (0-1 fraction) */
  jitter: number;
  /** Consecutive failures before circuit opens */
  circuit_threshold: number;
  /** Time before circuit resets from open to half-open (ms) */
  circuit_reset_ms: number;
}

export interface RetryState {
  circuit: CircuitState;
  consecutiveFailures: number;
  circuitOpenedAt: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  pendingActions: Map<
    string,
    {
      actionName: string;
      attempt: number;
      startedAt: number;
    }
  >;
  actionCounter: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function computeDelay(config: RetryConfig, attempt: number): number {
  let delay: number;
  switch (config.backoff) {
    case 'exponential':
      delay = config.base_delay_ms * Math.pow(2, attempt);
      break;
    case 'linear':
      delay = config.base_delay_ms * (attempt + 1);
      break;
    case 'constant':
    default:
      delay = config.base_delay_ms;
      break;
  }

  // Cap at max
  delay = Math.min(delay, config.max_delay_ms);

  // Add jitter
  if (config.jitter > 0) {
    const jitterAmount = delay * config.jitter;
    delay += Math.random() * jitterAmount * 2 - jitterAmount;
  }

  return Math.max(0, Math.round(delay));
}

// =============================================================================
// HANDLER
// =============================================================================

export const retryHandler: TraitHandler<RetryConfig> = {
  name: 'retry',

  defaultConfig: {
    max_retries: 3,
    base_delay_ms: 1000,
    max_delay_ms: 30000,
    backoff: 'exponential',
    jitter: 0.1,
    circuit_threshold: 5,
    circuit_reset_ms: 60000,
  },

  onAttach(node: HSPlusNode, _config: RetryConfig, _context: TraitContext): void {
    const state: RetryState = {
      circuit: 'closed',
      consecutiveFailures: 0,
      circuitOpenedAt: 0,
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      pendingActions: new Map(),
      actionCounter: 0,
    };
    node.__retryState = state;
  },

  onDetach(node: HSPlusNode, _config: RetryConfig, _context: TraitContext): void {
    delete node.__retryState;
  },

  onUpdate(node: HSPlusNode, config: RetryConfig, context: TraitContext, _delta: number): void {
    const state: RetryState | undefined = node.__retryState;
    if (!state) return;

    // Check circuit breaker auto-reset
    if (state.circuit === 'open') {
      const elapsed = Date.now() - state.circuitOpenedAt;
      if (elapsed >= config.circuit_reset_ms) {
        state.circuit = 'half-open';
        context.emit?.('retry:circuit_half', {
          testAttempt: state.totalAttempts + 1,
        });
      }
    }
  },

  onEvent(node: HSPlusNode, config: RetryConfig, context: TraitContext, event: TraitEvent): void {
    const state: RetryState | undefined = node.__retryState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);

    switch (eventType) {
      case 'retry:execute': {
        const actionName = payload.action as string;
        if (!actionName) break;

        // Circuit breaker check
        if (state.circuit === 'open') {
          context.emit?.('retry:failure', {
            actionName,
            attempt: 0,
            error: 'Circuit breaker is OPEN',
          });
          break;
        }

        const retryId = `retry_${state.actionCounter++}`;
        state.pendingActions.set(retryId, {
          actionName,
          attempt: 0,
          startedAt: Date.now(),
        });

        state.totalAttempts++;
        context.emit?.('retry:attempt', {
          retryId,
          actionName,
          attempt: 0,
          maxRetries: config.max_retries,
        });

        // Emit the actual action
        context.emit?.(actionName, {
          ...payload.params,
          __retryId: retryId,
        });
        break;
      }

      case 'retry:action_result': {
        const retryId = payload.retryId as string;
        const success = payload.success as boolean;
        const error = payload.error as string | undefined;

        const pending = state.pendingActions.get(retryId);
        if (!pending) break;

        if (success) {
          // Success — reset circuit
          state.totalSuccesses++;
          state.consecutiveFailures = 0;
          state.pendingActions.delete(retryId);

          if (state.circuit === 'half-open') {
            state.circuit = 'closed';
            context.emit?.('retry:circuit_close', {
              recoveredAfterMs: Date.now() - state.circuitOpenedAt,
            });
          }

          context.emit?.('retry:success', {
            actionName: pending.actionName,
            attempt: pending.attempt,
            elapsed: Date.now() - pending.startedAt,
          });
        } else {
          // Failure
          state.totalFailures++;
          state.consecutiveFailures++;
          pending.attempt++;

          context.emit?.('retry:failure', {
            actionName: pending.actionName,
            attempt: pending.attempt,
            error: error ?? 'unknown',
          });

          // Circuit breaker
          if (state.consecutiveFailures >= config.circuit_threshold) {
            state.circuit = 'open';
            state.circuitOpenedAt = Date.now();
            state.pendingActions.delete(retryId);
            context.emit?.('retry:circuit_open', {
              consecutiveFailures: state.consecutiveFailures,
              resetMs: config.circuit_reset_ms,
            });
            break;
          }

          // Half-open failure → reopen
          if (state.circuit === 'half-open') {
            state.circuit = 'open';
            state.circuitOpenedAt = Date.now();
            state.pendingActions.delete(retryId);
            context.emit?.('retry:circuit_open', {
              consecutiveFailures: state.consecutiveFailures,
              resetMs: config.circuit_reset_ms,
            });
            break;
          }

          // Retry or exhaust
          if (pending.attempt > config.max_retries) {
            state.pendingActions.delete(retryId);
            context.emit?.('retry:exhausted', {
              actionName: pending.actionName,
              totalAttempts: pending.attempt,
            });
          } else {
            const delay = computeDelay(config, pending.attempt - 1);
            state.totalAttempts++;

            setTimeout(() => {
              if (!node.__retryState) return;
              context.emit?.('retry:attempt', {
                retryId,
                actionName: pending.actionName,
                attempt: pending.attempt,
                maxRetries: config.max_retries,
              });
              context.emit?.(pending.actionName, {
                __retryId: retryId,
              });
            }, delay);
          }
        }
        break;
      }

      case 'retry:reset_circuit': {
        state.circuit = 'closed';
        state.consecutiveFailures = 0;
        context.emit?.('retry:circuit_close', { recoveredAfterMs: 0 });
        break;
      }

      case 'retry:get_status': {
        context.emit?.('retry:status', {
          circuit: state.circuit,
          consecutiveFailures: state.consecutiveFailures,
          totalAttempts: state.totalAttempts,
          totalSuccesses: state.totalSuccesses,
          totalFailures: state.totalFailures,
          pending: state.pendingActions.size,
        });
        break;
      }
    }
  },
};

export default retryHandler;
