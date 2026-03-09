/**
 * Circuit Breaker Pattern Implementation for GraphQL Client
 *
 * Features:
 * - Per-query granular circuit tracking
 * - Jittered exponential backoff for retries
 * - Failure rate and consecutive timeout tracking
 * - Health check-based recovery
 * - Comprehensive metrics collection
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing fast
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

export interface CircuitBreakerConfig {
  /** Failure rate threshold to open circuit (0-1) */
  failureRateThreshold: number;
  /** Minimum requests before calculating failure rate */
  minimumRequests: number;
  /** Consecutive timeouts to open circuit */
  consecutiveTimeoutThreshold: number;
  /** Time to wait before attempting recovery (ms) */
  openStateTimeout: number;
  /** Number of health checks in half-open state */
  healthCheckCount: number;
  /** Successful health checks needed to close circuit */
  successThreshold: number;
  /** Maximum retry delay (ms) */
  maxRetryDelay: number;
  /** Base retry delay (ms) */
  baseRetryDelay: number;
}

export interface CircuitMetrics {
  state: CircuitState;
  failureRate: number;
  consecutiveTimeouts: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  cacheHits: number;
  lastStateChange: Date;
  retryHistogram: Map<number, number>; // delay -> count
}

export interface RequestResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  fromCache?: boolean;
  retriedCount?: number;
}

/**
 * Circuit Breaker for a single GraphQL query operation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private requestCount: number = 0;
  private consecutiveTimeouts: number = 0;
  private lastStateChange: Date = new Date();
  private openStateTimer?: NodeJS.Timeout;
  private healthCheckResults: boolean[] = [];
  private retryHistogram: Map<number, number> = new Map();

  // Rolling window for failure rate calculation (last N requests)
  private requestResults: boolean[] = [];

  constructor(
    public readonly operationName: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  /**
   * Get current circuit metrics
   */
  public getMetrics(): CircuitMetrics {
    return {
      state: this.state,
      failureRate: this.calculateFailureRate(),
      consecutiveTimeouts: this.consecutiveTimeouts,
      totalRequests: this.requestCount,
      totalFailures: this.failureCount,
      totalSuccesses: this.successCount,
      cacheHits: 0, // Tracked externally
      lastStateChange: this.lastStateChange,
      retryHistogram: new Map(this.retryHistogram),
    };
  }

  /**
   * Check if request should be allowed
   */
  public canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if enough time has passed to attempt recovery
      const timeSinceOpen = Date.now() - this.lastStateChange.getTime();
      if (timeSinceOpen >= this.config.openStateTimeout) {
        this.transitionToHalfOpen();
        return true;
      }
      return false;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Allow limited requests for health checking
      return this.healthCheckResults.length < this.config.healthCheckCount;
    }

    return false;
  }

  /**
   * Record successful request
   */
  public recordSuccess(): void {
    this.requestCount++;
    this.successCount++;
    this.consecutiveTimeouts = 0;
    this.recordResult(true);

    if (this.state === CircuitState.HALF_OPEN) {
      this.healthCheckResults.push(true);
      this.checkHealthCheckCompletion();
    }
  }

  /**
   * Record failed request
   */
  public recordFailure(isTimeout: boolean = false): void {
    this.requestCount++;
    this.failureCount++;
    this.recordResult(false);

    if (isTimeout) {
      this.consecutiveTimeouts++;

      // Check consecutive timeout threshold
      if (this.consecutiveTimeouts >= this.config.consecutiveTimeoutThreshold) {
        this.transitionToOpen('consecutive timeouts');
        return;
      }
    } else {
      this.consecutiveTimeouts = 0;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.healthCheckResults.push(false);
      this.transitionToOpen('health check failed');
      return;
    }

    // Check failure rate threshold
    if (this.state === CircuitState.CLOSED && this.requestCount >= this.config.minimumRequests) {
      const failureRate = this.calculateFailureRate();
      if (failureRate >= this.config.failureRateThreshold) {
        this.transitionToOpen('failure rate threshold exceeded');
      }
    }
  }

  /**
   * Calculate jittered exponential backoff delay
   * Full jitter: random value between 0 and exponential delay
   */
  public calculateRetryDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * 2^attemptNumber
    const exponentialDelay = this.config.baseRetryDelay * Math.pow(2, attemptNumber);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxRetryDelay);

    // Full jitter: random value between 0 and cappedDelay
    const jitteredDelay = Math.random() * cappedDelay;

    // Track in histogram (rounded to nearest second)
    const delayKey = Math.round(jitteredDelay / 1000);
    this.retryHistogram.set(delayKey, (this.retryHistogram.get(delayKey) || 0) + 1);

    return jitteredDelay;
  }

  /**
   * Reset circuit breaker to initial state
   */
  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.consecutiveTimeouts = 0;
    this.requestResults = [];
    this.healthCheckResults = [];
    this.lastStateChange = new Date();

    if (this.openStateTimer) {
      clearTimeout(this.openStateTimer);
      this.openStateTimer = undefined;
    }
  }

  /**
   * Private: Calculate current failure rate
   */
  private calculateFailureRate(): number {
    if (this.requestResults.length === 0) {
      return 0;
    }

    const failures = this.requestResults.filter((success) => !success).length;
    return failures / this.requestResults.length;
  }

  /**
   * Private: Record request result in rolling window
   */
  private recordResult(success: boolean): void {
    this.requestResults.push(success);

    // Keep only last minimumRequests for failure rate calculation
    if (this.requestResults.length > this.config.minimumRequests) {
      this.requestResults.shift();
    }
  }

  /**
   * Private: Transition to OPEN state
   */
  private transitionToOpen(reason: string): void {
    console.warn(`[CircuitBreaker] ${this.operationName} opening: ${reason}`);

    this.state = CircuitState.OPEN;
    this.lastStateChange = new Date();
    this.healthCheckResults = [];

    // Schedule automatic half-open attempt
    if (this.openStateTimer) {
      clearTimeout(this.openStateTimer);
    }
  }

  /**
   * Private: Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    console.info(`[CircuitBreaker] ${this.operationName} entering half-open state`);

    this.state = CircuitState.HALF_OPEN;
    this.lastStateChange = new Date();
    this.healthCheckResults = [];
  }

  /**
   * Private: Check if health checks are complete
   */
  private checkHealthCheckCompletion(): void {
    if (this.healthCheckResults.length < this.config.healthCheckCount) {
      return;
    }

    const successCount = this.healthCheckResults.filter((result) => result).length;

    if (successCount >= this.config.successThreshold) {
      this.transitionToClosed();
    } else {
      this.transitionToOpen('insufficient successful health checks');
    }
  }

  /**
   * Private: Transition to CLOSED state
   */
  private transitionToClosed(): void {
    console.info(`[CircuitBreaker] ${this.operationName} closing (recovered)`);

    this.state = CircuitState.CLOSED;
    this.lastStateChange = new Date();
    this.healthCheckResults = [];

    // Don't reset failure counts - keep for metrics
    // but clear rolling window for fresh start
    this.requestResults = [];
    this.consecutiveTimeouts = 0;
  }
}

/**
 * Circuit Breaker Manager - maintains per-query circuit breakers
 */
export class CircuitBreakerManager {
  private circuits: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.defaultConfig = {
      failureRateThreshold: 0.5, // 50% failure rate
      minimumRequests: 10, // Over 10 requests
      consecutiveTimeoutThreshold: 5, // OR 5 consecutive timeouts
      openStateTimeout: 30000, // 30 seconds before half-open
      healthCheckCount: 5, // 5 health check queries
      successThreshold: 3, // 3 must succeed
      maxRetryDelay: 30000, // 30 second max delay
      baseRetryDelay: 1000, // 1 second base delay
      ...config,
    };
  }

  /**
   * Get or create circuit breaker for operation
   */
  public getCircuit(operationName: string): CircuitBreaker {
    if (!this.circuits.has(operationName)) {
      this.circuits.set(operationName, new CircuitBreaker(operationName, this.defaultConfig));
    }

    return this.circuits.get(operationName)!;
  }

  /**
   * Get all circuit metrics
   */
  public getAllMetrics(): Map<string, CircuitMetrics> {
    const metrics = new Map<string, CircuitMetrics>();

    for (const [operationName, circuit] of this.circuits) {
      metrics.set(operationName, circuit.getMetrics());
    }

    return metrics;
  }

  /**
   * Reset specific circuit
   */
  public resetCircuit(operationName: string): void {
    const circuit = this.circuits.get(operationName);
    if (circuit) {
      circuit.reset();
    }
  }

  /**
   * Reset all circuits
   */
  public resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }

  /**
   * Get circuit breaker statistics
   */
  public getStats() {
    const stats = {
      totalCircuits: this.circuits.size,
      byState: {
        closed: 0,
        open: 0,
        halfOpen: 0,
      },
      totalRequests: 0,
      totalFailures: 0,
      overallFailureRate: 0,
    };

    for (const circuit of this.circuits.values()) {
      const metrics = circuit.getMetrics();

      if (metrics.state === CircuitState.CLOSED) stats.byState.closed++;
      else if (metrics.state === CircuitState.OPEN) stats.byState.open++;
      else if (metrics.state === CircuitState.HALF_OPEN) stats.byState.halfOpen++;

      stats.totalRequests += metrics.totalRequests;
      stats.totalFailures += metrics.totalFailures;
    }

    if (stats.totalRequests > 0) {
      stats.overallFailureRate = stats.totalFailures / stats.totalRequests;
    }

    return stats;
  }
}
