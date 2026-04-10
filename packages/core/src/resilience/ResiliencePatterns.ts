/**
 * Resilience & Error Recovery Patterns for HoloScript
 *
 * Provides production-grade error handling, recovery, and resilience patterns
 * for distributed networked VR/AR applications.
 *
 * Patterns included:
 * - Circuit breaker for API/service failures
 * - Exponential backoff with jitter
 * - Graceful degradation
 * - Fallback chains
 * - Bulkhead pattern for isolation
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export enum CircuitBreakerState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit */
  failureThreshold: number;

  /** Success threshold to close circuit from half-open state */
  successThreshold: number;

  /** Time to wait before transitioning to half-open (ms) */
  resetTimeoutMs: number;

  /** Rolling window size for tracking failures (ms) */
  windowMs: number;

  /** Function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
}

export interface RetryConfig {
  /** Maximum number of attempts */
  maxAttempts: number;

  /** Initial backoff in ms */
  initialBackoffMs: number;

  /** Maximum backoff in ms */
  maxBackoffMs: number;

  /** Backoff multiplier */
  multiplier: number;

  /** Add random jitter to backoff */
  jitter: boolean;

  /** Function to determine if error should be retried */
  isRetryable?: (error: Error, attempt: number) => boolean;
}

export interface BulkheadConfig {
  /** Maximum concurrent operations */
  maxConcurrent: number;

  /** Queue size for pending operations */
  queueSize: number;

  /** Timeout for queued operations (ms) */
  timeoutMs: number;
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by failing fast when a service is down.
 * Transitions through states: CLOSED → OPEN → HALF_OPEN → CLOSED
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private failures: Array<{ timestamp: number; error: Error }> = [];
  private config: Required<CircuitBreakerConfig>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 60000, // 1 minute
      windowMs: 30000, // 30 seconds
      isRetryable: (err) => err instanceof Error,
      ...config,
    };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - (this.lastFailureTime || 0) > this.config.resetTimeoutMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN. Retry after ${this.config.resetTimeoutMs}ms`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.failures = this.failures.filter((f) => Date.now() - f.timestamp < this.config.windowMs);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
      }
    }
  }

  private onFailure(error: Error): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.failures.push({ timestamp: Date.now(), error });

    // Remove old failures outside window
    this.failures = this.failures.filter((f) => Date.now() - f.timestamp < this.config.windowMs);

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      console.error(`Circuit breaker OPEN after ${this.failureCount} failures: ${error.message}`);
    }
  }

  get currentState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get current circuit breaker state (accessor method)
   */
  getState(): CircuitBreakerState {
    if (
      this.state === CircuitBreakerState.OPEN &&
      Date.now() - (this.lastFailureTime || 0) > this.config.resetTimeoutMs
    ) {
      return CircuitBreakerState.HALF_OPEN;
    }
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics() {
    return {
      state: this.state,
      totalFailures: this.failureCount,
      totalSuccesses: this.successCount,
      lastFailureTime: this.lastFailureTime,
      totalRequests: this.failureCount + this.successCount,
    };
  }
}

// =============================================================================
// RETRY WITH BACKOFF
// =============================================================================

/**
 * Retry with exponential backoff and jitter
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg: Required<RetryConfig> = {
    maxAttempts: 3,
    initialBackoffMs: 100,
    maxBackoffMs: 10000,
    multiplier: 2,
    jitter: true,
    isRetryable: (err, attempt) => attempt < cfg.maxAttempts,
    ...config,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!cfg.isRetryable(lastError, attempt)) {
        throw lastError;
      }

      if (attempt < cfg.maxAttempts) {
        const backoff = Math.min(
          cfg.initialBackoffMs * Math.pow(cfg.multiplier, attempt - 1),
          cfg.maxBackoffMs
        );

        const jitteredBackoff = cfg.jitter ? backoff * (0.5 + Math.random() * 0.5) : backoff;

        console.warn(
          `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${Math.round(jitteredBackoff)}ms`
        );

        await sleep(jitteredBackoff);
      }
    }
  }

  throw lastError || new Error('Max retry attempts exceeded');
}

// =============================================================================
// BULKHEAD PATTERN
// =============================================================================

/**
 * Bulkhead Pattern for resource isolation
 *
 * Limits concurrent operations to prevent resource exhaustion.
 */
export class Bulkhead {
  private running = 0;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];
  private config: Required<BulkheadConfig>;

  constructor(config: Partial<BulkheadConfig> = {}) {
    this.config = {
      maxConcurrent: 10,
      queueSize: 100,
      timeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Execute function within bulkhead
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.config.queueSize) {
      throw new Error('Bulkhead queue full - too many pending operations');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(new Error('Bulkhead operation timeout'));
      }, this.config.timeoutMs);

      this.queue.push({
        fn,
        // @ts-expect-error
        resolve,
        reject,
        timeoutId,
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.running < this.config.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.running++;

      item
        .fn()
        .then((result) => {
          clearTimeout(item.timeoutId);
          item.resolve(result);
        })
        .catch((error) => {
          clearTimeout(item.timeoutId);
          item.reject(error);
        })
        .finally(() => {
          this.running--;
          this.processQueue();
        });
    }
  }

  get stats() {
    return {
      running: this.running,
      queued: this.queue.length,
    };
  }

  /**
   * Get bulkhead state (accessor method)
   */
  getState() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
    };
  }

  /**
   * Get bulkhead metrics
   */
  getMetrics() {
    return {
      running: this.running,
      queued: this.queue.length,
      utilizationPercent: (this.running / this.config.maxConcurrent) * 100,
      queueUtilizationPercent: (this.queue.length / this.config.queueSize) * 100,
    };
  }
}

// =============================================================================
// FALLBACK CHAIN
// =============================================================================

/**
 * Try multiple strategies in order until one succeeds
 */
export async function fallbackChain<T>(strategies: Array<() => Promise<T>>): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await strategies[i]();
      return result;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Strategy ${i + 1} failed: ${lastError.message}`);
    }
  }

  throw lastError || new Error('All fallback strategies failed');
}

// =============================================================================
// GRACEFUL DEGRADATION
// =============================================================================

/**
 * Graceful degradation function
 *
 * Tries to execute at full capability, falls back to degraded mode on failure
 */
export async function gracefulDegrade<T>(config: {
  full: () => Promise<T>;
  degraded: () => Promise<T>;
  onDegraded?: () => void;
}): Promise<T> {
  try {
    return await config.full();
  } catch (error) {
    console.warn('Full operation failed, degrading to fallback:', error);
    config.onDegraded?.();
    return config.degraded();
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Sleep helper for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Timeout helper
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}
