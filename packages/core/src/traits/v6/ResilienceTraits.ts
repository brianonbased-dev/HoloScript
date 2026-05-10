/**
 * @holoscript/core v6 Universal Resilience Traits
 *
 * Trait handlers for circuit breakers, retry policies, timeouts,
 * fallbacks, and bulkhead isolation. Cross-compiles to Node.js runtime.
 *
 * @example
 * ```hsplus
 * object "PaymentService" {
 *   @circuit_breaker {
 *     failure_threshold: 5
 *     reset_timeout: 30000
 *     half_open_max: 3
 *   }
 *
 *   @retry {
 *     max_attempts: 3
 *     backoff: "exponential"
 *     base_delay: 1000
 *   }
 *
 *   @timeout {
 *     duration: 5000
 *     fallback: "cachedResponse"
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';
import {
  CircuitBreaker,
  Bulkhead,
  retryWithBackoff,
  withTimeout,
  fallbackChain,
} from '../../resilience/ResiliencePatterns';

// ── Circuit Breaker Trait ──────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Failure count to trip the circuit */
  failure_threshold: number;
  /** Time in open state before half-open (ms) */
  reset_timeout: number;
  /** Max requests in half-open state */
  half_open_max: number;
  /** Sliding window size for failure rate calculation */
  window_size: number;
  /** Failure rate percentage to trip (alternative to count) */
  failure_rate: number;
  /** Fallback handler name */
  fallback: string;
  /** Emit state change events */
  emit_events: boolean;
}

interface CircuitBreakerState {
  breaker: CircuitBreaker;
}

export const circuitBreakerHandler: TraitHandler<CircuitBreakerConfig> = {
  name: 'circuit_breaker',
  defaultConfig: {
    failure_threshold: 5,
    reset_timeout: 30000,
    half_open_max: 3,
    window_size: 10,
    failure_rate: 50,
    fallback: '',
    emit_events: true,
  },
  onAttach(node: HSPlusNode, config: CircuitBreakerConfig, context: TraitContext) {
    const breaker = new CircuitBreaker({
      failureThreshold: config.failure_threshold,
      successThreshold: config.half_open_max,
      resetTimeoutMs: config.reset_timeout,
      windowMs: config.window_size,
    });
    node.__circuitBreakerState = { breaker };
    if (config.emit_events) {
      context.emit?.('circuit_breaker_attached', {
        nodeId: node.id,
        failureThreshold: config.failure_threshold,
        resetTimeout: config.reset_timeout,
      });
    }
  },
  onDetach(node: HSPlusNode, _config: CircuitBreakerConfig, context: TraitContext) {
    const state = node.__circuitBreakerState as CircuitBreakerState | undefined;
    if (!state) return;
    const metrics = state.breaker.getMetrics();
    context.emit?.('circuit_breaker_detached', { nodeId: node.id, metrics });
    delete node.__circuitBreakerState;
  },
};

// ── Retry Trait ────────────────────────────────────────────────────────────────

export type BackoffStrategy = 'fixed' | 'linear' | 'exponential' | 'decorrelated_jitter';

export interface RetryConfig {
  /** Maximum retry attempts */
  max_attempts: number;
  /** Backoff strategy */
  backoff: BackoffStrategy;
  /** Base delay (ms) */
  base_delay: number;
  /** Max delay cap (ms) */
  max_delay: number;
  /** Jitter factor (0.0 - 1.0) */
  jitter: number;
  /** Retryable error codes/types */
  retryable_errors: string[];
  /** Non-retryable error codes/types */
  non_retryable_errors: string[];
}

interface RetryState {
  execute: <T>(fn: () => Promise<T>) => Promise<T>;
}

export const retryHandler: TraitHandler<RetryConfig> = {
  name: 'retry',
  defaultConfig: {
    max_attempts: 3,
    backoff: 'exponential',
    base_delay: 1000,
    max_delay: 30000,
    jitter: 0.1,
    retryable_errors: [],
    non_retryable_errors: [],
  },
  onAttach(node: HSPlusNode, config: RetryConfig, context: TraitContext) {
    const execute = <T>(fn: () => Promise<T>) =>
      retryWithBackoff(fn, {
        maxAttempts: config.max_attempts,
        initialBackoffMs: config.base_delay,
        maxBackoffMs: config.max_delay,
        jitter: config.jitter > 0,
      });
    node.__retryState = { execute };
    context.emit?.('retry_attached', { nodeId: node.id, maxAttempts: config.max_attempts });
  },
  onDetach(node: HSPlusNode, _config: RetryConfig, context: TraitContext) {
    const state = node.__retryState as RetryState | undefined;
    if (!state) return;
    context.emit?.('retry_detached', { nodeId: node.id });
    delete node.__retryState;
  },
};

// ── Timeout Trait ──────────────────────────────────────────────────────────────

export interface TimeoutConfig {
  /** Timeout duration (ms) */
  duration: number;
  /** Fallback handler name on timeout */
  fallback: string;
  /** Cancel underlying operation on timeout */
  cancel_on_timeout: boolean;
}

interface TimeoutState {
  execute: <T>(fn: () => Promise<T>) => Promise<T>;
}

export const timeoutHandler: TraitHandler<TimeoutConfig> = {
  name: 'timeout',
  defaultConfig: {
    duration: 30000,
    fallback: '',
    cancel_on_timeout: true,
  },
  onAttach(node: HSPlusNode, config: TimeoutConfig, context: TraitContext) {
    const execute = <T>(fn: () => Promise<T>) => withTimeout(fn, config.duration);
    node.__timeoutState = { execute };
    context.emit?.('timeout_attached', { nodeId: node.id, duration: config.duration });
  },
  onDetach(node: HSPlusNode, _config: TimeoutConfig, context: TraitContext) {
    const state = node.__timeoutState as TimeoutState | undefined;
    if (!state) return;
    context.emit?.('timeout_detached', { nodeId: node.id });
    delete node.__timeoutState;
  },
};

// ── Fallback Trait ─────────────────────────────────────────────────────────────

export interface FallbackConfig {
  /** Fallback handler name */
  handler: string;
  /** Static fallback value (JSON) */
  static_value: unknown;
  /** Cache last successful response as fallback */
  cache_last_success: boolean;
}

interface FallbackState {
  execute: <T>(strategies: Array<() => Promise<T>>) => Promise<T>;
  cacheLastSuccess: boolean;
}

export const fallbackHandler: TraitHandler<FallbackConfig> = {
  name: 'fallback',
  defaultConfig: {
    handler: '',
    static_value: null,
    cache_last_success: false,
  },
  onAttach(node: HSPlusNode, config: FallbackConfig, context: TraitContext) {
    const execute = <T>(strategies: Array<() => Promise<T>>) => fallbackChain(strategies);
    node.__fallbackState = { execute, cacheLastSuccess: config.cache_last_success };
    context.emit?.('fallback_attached', { nodeId: node.id, handler: config.handler });
  },
  onDetach(node: HSPlusNode, _config: FallbackConfig, context: TraitContext) {
    const state = node.__fallbackState as FallbackState | undefined;
    if (!state) return;
    context.emit?.('fallback_detached', { nodeId: node.id });
    delete node.__fallbackState;
  },
};

// ── Bulkhead Trait ─────────────────────────────────────────────────────────────

export interface BulkheadConfig {
  /** Maximum concurrent executions */
  max_concurrent: number;
  /** Maximum queue size for waiting requests */
  max_queue: number;
  /** Queue timeout (ms) */
  queue_timeout: number;
}

interface BulkheadState {
  bulkhead: Bulkhead;
}

export const bulkheadHandler: TraitHandler<BulkheadConfig> = {
  name: 'bulkhead',
  defaultConfig: {
    max_concurrent: 10,
    max_queue: 100,
    queue_timeout: 5000,
  },
  onAttach(node: HSPlusNode, config: BulkheadConfig, context: TraitContext) {
    const bulkhead = new Bulkhead({
      maxConcurrent: config.max_concurrent,
      queueSize: config.max_queue,
      timeoutMs: config.queue_timeout,
    });
    node.__bulkheadState = { bulkhead };
    context.emit?.('bulkhead_attached', {
      nodeId: node.id,
      maxConcurrent: config.max_concurrent,
      maxQueue: config.max_queue,
    });
  },
  onDetach(node: HSPlusNode, _config: BulkheadConfig, context: TraitContext) {
    const state = node.__bulkheadState as BulkheadState | undefined;
    if (!state) return;
    const metrics = state.bulkhead.getMetrics();
    context.emit?.('bulkhead_detached', { nodeId: node.id, metrics });
    delete node.__bulkheadState;
  },
};
