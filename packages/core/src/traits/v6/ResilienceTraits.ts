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
  onAttach(_node: HSPlusNode, _config: CircuitBreakerConfig, _context: TraitContext) {
    // v6 stub: circuit breaker setup
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
  onAttach(_node: HSPlusNode, _config: RetryConfig, _context: TraitContext) {
    // v6 stub: retry policy registration
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

export const timeoutHandler: TraitHandler<TimeoutConfig> = {
  name: 'timeout',
  defaultConfig: {
    duration: 30000,
    fallback: '',
    cancel_on_timeout: true,
  },
  onAttach(_node: HSPlusNode, _config: TimeoutConfig, _context: TraitContext) {
    // v6 stub: timeout wrapper
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

export const fallbackHandler: TraitHandler<FallbackConfig> = {
  name: 'fallback',
  defaultConfig: {
    handler: '',
    static_value: null,
    cache_last_success: false,
  },
  onAttach(_node: HSPlusNode, _config: FallbackConfig, _context: TraitContext) {
    // v6 stub: fallback registration
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

export const bulkheadHandler: TraitHandler<BulkheadConfig> = {
  name: 'bulkhead',
  defaultConfig: {
    max_concurrent: 10,
    max_queue: 100,
    queue_timeout: 5000,
  },
  onAttach(_node: HSPlusNode, _config: BulkheadConfig, _context: TraitContext) {
    // v6 stub: bulkhead semaphore setup
  },
};
