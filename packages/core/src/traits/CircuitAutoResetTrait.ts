/**
 * CircuitAutoResetTrait — Wisdom/Gotcha Atom #6
 *
 * Exponential backoff retry with circuit breaker pattern.
 * Auto-resets after cooldown and successful probe.
 *
 * Gotcha guarded: Silent retries can mask persistent failures and create cascading outages.
 *
 * Events emitted:
 *  circuit_auto_initialized  { node, backoff_base, max_attempts }
 *  circuit_open              { node, failureCount, lastError }
 *  circuit_retry             { node, attempt, delayMs }
 *  circuit_reset             { node, totalRetries, downtime }
 *  circuit_auto_error        { node, error }
 *
 * @see proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitAutoResetConfig {
  /** Base delay multiplier for exponential backoff (>= 1, in seconds) */
  backoff_base: number;
  /** Max retry attempts before opening circuit (>= 1) */
  max_attempts: number;
  /** Cooldown period before half-open probe (ms) */
  cooldown_ms: number;
  /** Max backoff cap (ms) to prevent infinite waits */
  max_backoff_ms: number;
}

interface CircuitAutoResetState {
  initialized: boolean;
  state: CircuitState;
  failureCount: number;
  retryCount: number;
  lastFailureAt: number;
  lastError: string | null;
  openedAt: number;
  totalDowntime: number;
  elapsed: number;
  nextRetryAt: number;
}

type CircuitNode = HSPlusNode & {
  __circuitAutoResetState?: CircuitAutoResetState;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitAutoResetConfig = {
  backoff_base: 2,
  max_attempts: 5,
  cooldown_ms: 30_000,
  max_backoff_ms: 300_000, // 5 minutes
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeBackoff(base: number, attempt: number, maxMs: number): number {
  const delayMs = Math.pow(base, attempt) * 1000;
  return Math.min(delayMs, maxMs);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const circuitAutoResetHandler: TraitHandler<CircuitAutoResetConfig> = {
  name: 'circuit_auto_reset',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: CircuitAutoResetConfig, context: TraitContext): void {
    const cNode = node as CircuitNode;

    // Validate config
    if (config.backoff_base < 1) {
      context.emit('circuit_auto_error', {
        node,
        error: `backoff_base must be >= 1, got ${config.backoff_base}`,
      });
      return;
    }
    if (config.max_attempts < 1) {
      context.emit('circuit_auto_error', {
        node,
        error: `max_attempts must be >= 1, got ${config.max_attempts}`,
      });
      return;
    }

    const state: CircuitAutoResetState = {
      initialized: true,
      state: 'closed',
      failureCount: 0,
      retryCount: 0,
      lastFailureAt: 0,
      lastError: null,
      openedAt: 0,
      totalDowntime: 0,
      elapsed: 0,
      nextRetryAt: 0,
    };
    cNode.__circuitAutoResetState = state;

    context.emit('circuit_auto_initialized', {
      node,
      backoff_base: config.backoff_base,
      max_attempts: config.max_attempts,
    });
  },

  onDetach(node: HSPlusNode): void {
    delete (node as CircuitNode).__circuitAutoResetState;
  },

  onUpdate(node: HSPlusNode, config: CircuitAutoResetConfig, context: TraitContext, delta: number): void {
    const cNode = node as CircuitNode;
    const state = cNode.__circuitAutoResetState;
    if (!state?.initialized) return;

    if (state.state === 'open') {
      const now = Date.now();
      // Check if cooldown has elapsed → transition to half-open
      if (now >= state.nextRetryAt) {
        state.state = 'half-open';

        context.emit('circuit_retry', {
          node,
          attempt: state.retryCount + 1,
          delayMs: now - state.openedAt,
        });
      }
    }
  },

  onEvent(node: HSPlusNode, config: CircuitAutoResetConfig, context: TraitContext, event: { type: string; [key: string]: unknown }): void {
    const cNode = node as CircuitNode;
    const state = cNode.__circuitAutoResetState;
    if (!state?.initialized) return;

    if (event.type === 'circuit_failure') {
      const now = Date.now();
      const errorMsg = (event.error as string) || 'unknown failure';

      state.failureCount++;
      state.lastFailureAt = now;
      state.lastError = errorMsg;

      if (state.failureCount >= config.max_attempts && state.state === 'closed') {
        // Open the circuit
        state.state = 'open';
        state.openedAt = now;
        state.retryCount++;
        state.nextRetryAt = now + computeBackoff(config.backoff_base, state.retryCount, config.max_backoff_ms);

        context.emit('circuit_open', {
          node,
          failureCount: state.failureCount,
          lastError: errorMsg,
          nextRetryAt: state.nextRetryAt,
        });
      } else if (state.state === 'half-open') {
        // Probe failed → re-open with increased backoff
        state.state = 'open';
        state.retryCount++;
        state.nextRetryAt = now + computeBackoff(config.backoff_base, state.retryCount, config.max_backoff_ms);

        context.emit('circuit_open', {
          node,
          failureCount: state.failureCount,
          lastError: errorMsg,
          nextRetryAt: state.nextRetryAt,
          reOpened: true,
        });
      }
    }

    if (event.type === 'circuit_success') {
      if (state.state === 'half-open') {
        // Probe succeeded → reset circuit
        const downtime = Date.now() - state.openedAt;
        state.totalDowntime += downtime;

        context.emit('circuit_reset', {
          node,
          totalRetries: state.retryCount,
          downtime,
          totalDowntime: state.totalDowntime,
        });

        state.state = 'closed';
        state.failureCount = 0;
        state.retryCount = 0;
        state.lastError = null;
        state.openedAt = 0;
        state.nextRetryAt = 0;
      } else if (state.state === 'closed') {
        // Success in closed state: reset failure count (sliding window reset)
        state.failureCount = 0;
      }
    }
  },
};
