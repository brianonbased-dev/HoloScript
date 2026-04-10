/**
 * @hololand/react-agent-sdk - Circuit Breaker
 *
 * Circuit breaker implementation with exponential backoff
 * Prevents cascading failures in agent communication
 */

import type { CircuitState, CircuitBreakerStatus, CircuitBreakerConfig } from '../types';

/**
 * Request result for circuit breaker tracking
 */
interface RequestResult {
  success: boolean;
  timestamp: number;
  duration: number;
  error?: Error;
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastError?: Error;
  private nextRetryTime?: number;
  private requests: RequestResult[] = [];
  private config: Required<CircuitBreakerConfig>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? 0.5,
      timeout: config.timeout ?? 60000,
      windowSize: config.windowSize ?? 100,
      minimumRequests: config.minimumRequests ?? 10,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      const now = Date.now();
      if (this.nextRetryTime && now < this.nextRetryTime) {
        throw new Error(
          `Circuit breaker is open. Retry in ${Math.ceil((this.nextRetryTime - now) / 1000)}s`
        );
      }
      // Transition to half-open
      this.state = 'half-open';
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      this.recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.recordFailure(Date.now() - startTime, error as Error);
      throw error;
    }
  }

  /**
   * Record a successful request
   */
  private recordSuccess(duration: number): void {
    this.successCount++;
    this.requests.push({
      success: true,
      timestamp: Date.now(),
      duration,
    });

    // Trim request history
    this.trimRequests();

    // If half-open and success, close the circuit
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failureCount = 0;
      this.nextRetryTime = undefined;
    }
  }

  /**
   * Record a failed request
   */
  private recordFailure(duration: number, error: Error): void {
    this.failureCount++;
    this.lastError = error;
    this.requests.push({
      success: false,
      timestamp: Date.now(),
      duration,
      error,
    });

    // Trim request history
    this.trimRequests();

    // Check if we should open the circuit
    if (this.shouldOpen()) {
      this.open();
    }
  }

  /**
   * Check if circuit should open
   */
  private shouldOpen(): boolean {
    const recentRequests = this.getRecentRequests();

    // Need minimum requests before opening
    if (recentRequests.length < this.config.minimumRequests) {
      return false;
    }

    const failures = recentRequests.filter((r) => !r.success).length;
    const failureRate = failures / recentRequests.length;

    return failureRate >= this.config.threshold;
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = 'open';
    this.nextRetryTime = Date.now() + this.config.timeout;
  }

  /**
   * Get recent requests within window
   */
  private getRecentRequests(): RequestResult[] {
    return this.requests.slice(-this.config.windowSize);
  }

  /**
   * Trim old requests
   */
  private trimRequests(): void {
    if (this.requests.length > this.config.windowSize) {
      this.requests = this.requests.slice(-this.config.windowSize);
    }
  }

  /**
   * Get current status
   */
  getStatus(): CircuitBreakerStatus {
    const recentRequests = this.getRecentRequests();
    const failures = recentRequests.filter((r) => !r.success).length;
    const failureRate = recentRequests.length > 0 ? failures / recentRequests.length : 0;

    const now = Date.now();
    const timeUntilClose =
      this.state === 'open' && this.nextRetryTime
        ? Math.max(0, this.nextRetryTime - now)
        : undefined;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureRate,
      lastError: this.lastError,
      timeUntilClose,
      nextRetryTime: this.nextRetryTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastError = undefined;
    this.nextRetryTime = undefined;
    this.requests = [];
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure rate
   */
  getFailureRate(): number {
    const recentRequests = this.getRecentRequests();
    if (recentRequests.length === 0) return 0;

    const failures = recentRequests.filter((r) => !r.success).length;
    return failures / recentRequests.length;
  }
}

/**
 * Exponential backoff calculator
 */
export class ExponentialBackoff {
  private attempt = 0;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly maxAttempts: number;

  constructor(baseDelay = 1000, maxDelay = 60000, maxAttempts = 5) {
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Get next delay with exponential backoff
   */
  getNextDelay(): number {
    if (this.attempt >= this.maxAttempts) {
      throw new Error('Max retry attempts reached');
    }

    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt), this.maxDelay);

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const finalDelay = Math.max(0, delay + jitter);

    this.attempt++;
    return finalDelay;
  }

  /**
   * Reset attempt counter
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Check if can retry
   */
  canRetry(): boolean {
    return this.attempt < this.maxAttempts;
  }

  /**
   * Get current attempt
   */
  getCurrentAttempt(): number {
    return this.attempt;
  }
}
