/**
 * Circuit Breaker Pattern Implementation for HoloScript Export Targets
 *
 * Prevents cascading failures across 25+ export targets (URDF, SDF, Unity, Unreal, WebGPU, etc.)
 * by isolating failures per target and providing graceful degradation.
 *
 * Key Features:
 * - Per-target circuit state tracking (CLOSED, OPEN, HALF_OPEN)
 * - 5 consecutive failures within 10-minute window triggers circuit open
 * - 2-minute timeout before testing recovery (half-open state)
 * - 3 consecutive successes to fully close circuit
 * - Fallback to reference implementation when circuit open
 * - Comprehensive metrics tracking
 *
 * Based on:
 * - Circuit Breaker Pattern (Martin Fowler)
 * - Azure Architecture Center best practices
 * - Resilience4j adaptive patterns
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Circuit states following standard circuit breaker pattern
 */
export enum CircuitState {
  /** Normal operation - all requests pass through */
  CLOSED = 'CLOSED',
  /** Circuit tripped - requests fail fast with fallback */
  OPEN = 'OPEN',
  /** Testing recovery - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Supported HoloScript export targets
 */
export type ExportTarget =
  | 'urdf'        // ROS 2 / Gazebo robotics
  | 'sdf'         // Gazebo simulation
  | 'unity'       // Unity Engine
  | 'unreal'      // Unreal Engine
  | 'godot'       // Godot Engine
  | 'vrchat'      // VRChat SDK
  | 'openxr'      // OpenXR runtime
  | 'android'     // Android XR
  | 'android-xr'  // Android XR (dedicated)
  | 'ios'         // iOS ARKit
  | 'visionos'    // Apple Vision Pro
  | 'ar'          // Generic AR
  | 'babylon'     // Babylon.js
  | 'webgpu'      // WebGPU API
  | 'r3f'         // React Three Fiber
  | 'wasm'        // WebAssembly
  | 'playcanvas'  // PlayCanvas engine
  | 'usd'         // Pixar USD
  | 'usdz'        // USDZ (iOS AR)
  | 'dtdl'        // Azure Digital Twins
  | 'vrr'         // VR Rendering (custom)
  | 'multi-layer' // Multi-layer compositions
  | 'incremental' // Incremental compilation
  | 'state'       // State machine compilation
  | 'trait-composition' // Trait composition
  | 'tsl';        // Trait Shader Language (trait-to-shader)

/**
 * Circuit configuration per target
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time window for counting failures (ms) */
  failureWindow: number;
  /** Timeout before trying half-open (ms) */
  halfOpenTimeout: number;
  /** Number of successes to close circuit */
  successThreshold: number;
  /** Enable fallback to reference implementation */
  enableFallback: boolean;
  /** Custom error handler */
  onError?: (error: Error, target: ExportTarget) => void;
  /** Custom state change handler */
  onStateChange?: (oldState: CircuitState, newState: CircuitState, target: ExportTarget) => void;
}

/**
 * Circuit metrics for monitoring
 */
export interface CircuitMetrics {
  target: ExportTarget;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failedRequests: number;
  successfulRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  circuitOpenTime: number | null;
  circuitCloseTime: number | null;
  timeInDegradedMode: number; // Total time in OPEN state (ms)
  failureRate: number; // Failures per hour
  fallbackInvocations: number;
  lastError: string | null;
}

/**
 * Circuit execution result
 */
export interface CircuitResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  usedFallback: boolean;
  state: CircuitState;
  metrics: CircuitMetrics;
}

/**
 * Failure record for time-windowed tracking
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,           // 5 consecutive failures
  failureWindow: 10 * 60 * 1000, // 10 minutes
  halfOpenTimeout: 2 * 60 * 1000, // 2 minutes
  successThreshold: 3,            // 3 successes to close
  enableFallback: true,
};

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

/**
 * Circuit breaker for a single export target
 */
export class CircuitBreaker<T = any> {
  private state: CircuitState = CircuitState.CLOSED;
  private failureRecords: FailureRecord[] = [];
  private consecutiveSuccesses: number = 0;
  private consecutiveFailures: number = 0;
  private halfOpenStartTime: number | null = null;
  private metrics: CircuitMetrics;
  private config: CircuitBreakerConfig;
  private target: ExportTarget;

  constructor(target: ExportTarget, config: Partial<CircuitBreakerConfig> = {}) {
    this.target = target;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = this.initMetrics();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<R = T>(
    operation: () => Promise<R>,
    fallback?: () => Promise<R>
  ): Promise<CircuitResult<R>> {
    this.metrics.totalRequests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      return await this.handleOpenCircuit(fallback);
    }

    // Execute operation
    try {
      const data = await operation();
      this.recordSuccess();
      return {
        success: true,
        data,
        usedFallback: false,
        state: this.state,
        metrics: this.getMetrics(),
      };
    } catch (error) {
      return await this.handleFailure(error as Error, fallback);
    }
  }

  /**
   * Execute synchronous operation with circuit breaker protection
   */
  executeSync<R = T>(
    operation: () => R,
    fallback?: () => R
  ): CircuitResult<R> {
    this.metrics.totalRequests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      return this.handleOpenCircuitSync(fallback);
    }

    // Execute operation
    try {
      const data = operation();
      this.recordSuccess();
      return {
        success: true,
        data,
        usedFallback: false,
        state: this.state,
        metrics: this.getMetrics(),
      };
    } catch (error) {
      return this.handleFailureSync(error as Error, fallback);
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Auto-transition from OPEN to HALF_OPEN after timeout
    if (
      this.state === CircuitState.OPEN &&
      this.metrics.circuitOpenTime &&
      Date.now() - this.metrics.circuitOpenTime >= this.config.halfOpenTimeout
    ) {
      this.transitionToHalfOpen();
    }
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitMetrics {
    // Calculate failure rate (failures per hour)
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentFailures = this.failureRecords.filter((r) => r.timestamp >= oneHourAgo);
    this.metrics.failureRate = recentFailures.length;

    return { ...this.metrics };
  }

  /**
   * Reset circuit to CLOSED state (manual intervention)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureRecords = [];
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.halfOpenStartTime = null;
    this.metrics.circuitCloseTime = Date.now();
    this.emitStateChange(this.state, CircuitState.CLOSED);
  }

  /**
   * Force circuit to OPEN state (manual intervention)
   */
  forceOpen(): void {
    const oldState = this.state;
    this.state = CircuitState.OPEN;
    this.metrics.circuitOpenTime = Date.now();
    this.emitStateChange(oldState, CircuitState.OPEN);
  }

  // ─── PRIVATE METHODS ────────────────────────────────────────────────────────

  private initMetrics(): CircuitMetrics {
    return {
      target: this.target,
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0,
      totalRequests: 0,
      failedRequests: 0,
      successfulRequests: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      circuitOpenTime: null,
      circuitCloseTime: null,
      timeInDegradedMode: 0,
      failureRate: 0,
      fallbackInvocations: 0,
      lastError: null,
    };
  }

  private recordSuccess(): void {
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.metrics.successCount++;
    this.metrics.successfulRequests++;
    this.metrics.lastSuccessTime = Date.now();

    // Transition from HALF_OPEN to CLOSED if threshold met
    if (
      this.state === CircuitState.HALF_OPEN &&
      this.consecutiveSuccesses >= this.config.successThreshold
    ) {
      this.transitionToClosed();
    }
  }

  private async handleFailure<R>(
    error: Error,
    fallback?: () => Promise<R>
  ): Promise<CircuitResult<R>> {
    this.recordFailure(error);

    // Use fallback if available
    if (this.config.enableFallback && fallback) {
      try {
        const data = await fallback();
        this.metrics.fallbackInvocations++;
        return {
          success: true,
          data,
          usedFallback: true,
          state: this.state,
          metrics: this.getMetrics(),
        };
      } catch (fallbackError) {
        // Fallback also failed
        return {
          success: false,
          error: fallbackError as Error,
          usedFallback: true,
          state: this.state,
          metrics: this.getMetrics(),
        };
      }
    }

    return {
      success: false,
      error,
      usedFallback: false,
      state: this.state,
      metrics: this.getMetrics(),
    };
  }

  private handleFailureSync<R>(error: Error, fallback?: () => R): CircuitResult<R> {
    this.recordFailure(error);

    // Use fallback if available
    if (this.config.enableFallback && fallback) {
      try {
        const data = fallback();
        this.metrics.fallbackInvocations++;
        return {
          success: true,
          data,
          usedFallback: true,
          state: this.state,
          metrics: this.getMetrics(),
        };
      } catch (fallbackError) {
        return {
          success: false,
          error: fallbackError as Error,
          usedFallback: true,
          state: this.state,
          metrics: this.getMetrics(),
        };
      }
    }

    return {
      success: false,
      error,
      usedFallback: false,
      state: this.state,
      metrics: this.getMetrics(),
    };
  }

  private recordFailure(error: Error): void {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.metrics.failureCount++;
    this.metrics.failedRequests++;
    this.metrics.lastFailureTime = Date.now();
    this.metrics.lastError = error.message;

    // Add to failure records
    this.failureRecords.push({
      timestamp: Date.now(),
      error,
    });

    // Clean old failure records outside window
    const cutoff = Date.now() - this.config.failureWindow;
    this.failureRecords = this.failureRecords.filter((r) => r.timestamp >= cutoff);

    // Emit error event
    if (this.config.onError) {
      this.config.onError(error, this.target);
    }

    // Check if circuit should open
    if (this.shouldOpenCircuit()) {
      this.transitionToOpen();
    }
  }

  private shouldOpenCircuit(): boolean {
    // Check consecutive failures
    if (this.consecutiveFailures >= this.config.failureThreshold) {
      return true;
    }

    // Check failures within time window
    const recentFailures = this.failureRecords.filter(
      (r) => Date.now() - r.timestamp <= this.config.failureWindow
    );
    return recentFailures.length >= this.config.failureThreshold;
  }

  private async handleOpenCircuit<R>(fallback?: () => Promise<R>): Promise<CircuitResult<R>> {
    // Update time in degraded mode
    if (this.metrics.circuitOpenTime) {
      this.metrics.timeInDegradedMode += Date.now() - this.metrics.circuitOpenTime;
    }

    // Use fallback if available
    if (this.config.enableFallback && fallback) {
      try {
        const data = await fallback();
        this.metrics.fallbackInvocations++;
        return {
          success: true,
          data,
          usedFallback: true,
          state: CircuitState.OPEN,
          metrics: this.getMetrics(),
        };
      } catch (error) {
        return {
          success: false,
          error: error as Error,
          usedFallback: true,
          state: CircuitState.OPEN,
          metrics: this.getMetrics(),
        };
      }
    }

    // No fallback - fail fast
    return {
      success: false,
      error: new Error(`Circuit breaker OPEN for target: ${this.target}`),
      usedFallback: false,
      state: CircuitState.OPEN,
      metrics: this.getMetrics(),
    };
  }

  private handleOpenCircuitSync<R>(fallback?: () => R): CircuitResult<R> {
    // Update time in degraded mode
    if (this.metrics.circuitOpenTime) {
      this.metrics.timeInDegradedMode += Date.now() - this.metrics.circuitOpenTime;
    }

    // Use fallback if available
    if (this.config.enableFallback && fallback) {
      try {
        const data = fallback();
        this.metrics.fallbackInvocations++;
        return {
          success: true,
          data,
          usedFallback: true,
          state: CircuitState.OPEN,
          metrics: this.getMetrics(),
        };
      } catch (error) {
        return {
          success: false,
          error: error as Error,
          usedFallback: true,
          state: CircuitState.OPEN,
          metrics: this.getMetrics(),
        };
      }
    }

    // No fallback - fail fast
    return {
      success: false,
      error: new Error(`Circuit breaker OPEN for target: ${this.target}`),
      usedFallback: false,
      state: CircuitState.OPEN,
      metrics: this.getMetrics(),
    };
  }

  private transitionToOpen(): void {
    const oldState = this.state;
    this.state = CircuitState.OPEN;
    this.metrics.circuitOpenTime = Date.now();
    this.metrics.state = CircuitState.OPEN;
    this.emitStateChange(oldState, CircuitState.OPEN);
  }

  private transitionToHalfOpen(): void {
    const oldState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenStartTime = Date.now();
    this.consecutiveSuccesses = 0;
    this.metrics.state = CircuitState.HALF_OPEN;
    this.emitStateChange(oldState, CircuitState.HALF_OPEN);
  }

  private transitionToClosed(): void {
    const oldState = this.state;
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.failureRecords = [];
    this.metrics.circuitCloseTime = Date.now();
    this.metrics.state = CircuitState.CLOSED;
    this.emitStateChange(oldState, CircuitState.CLOSED);
  }

  private emitStateChange(oldState: CircuitState, newState: CircuitState): void {
    if (this.config.onStateChange) {
      this.config.onStateChange(oldState, newState, this.target);
    }
  }
}

// =============================================================================
// CIRCUIT BREAKER REGISTRY
// =============================================================================

/**
 * Registry for managing circuit breakers across all export targets
 */
export class CircuitBreakerRegistry {
  private breakers: Map<ExportTarget, CircuitBreaker> = new Map();
  private defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = { ...DEFAULT_CONFIG, ...defaultConfig };
  }

  /**
   * Get or create circuit breaker for target
   */
  getBreaker(target: ExportTarget): CircuitBreaker {
    if (!this.breakers.has(target)) {
      this.breakers.set(target, new CircuitBreaker(target, this.defaultConfig));
    }
    return this.breakers.get(target)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<ExportTarget, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get aggregated metrics across all targets
   */
  getAggregatedMetrics(): {
    totalTargets: number;
    closedCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    totalFailures: number;
    totalSuccesses: number;
    averageFailureRate: number;
    targets: Record<ExportTarget, CircuitMetrics>;
  } {
    const metrics = Array.from(this.breakers.values()).map((b) => b.getMetrics());

    return {
      totalTargets: this.breakers.size,
      closedCircuits: metrics.filter((m) => m.state === CircuitState.CLOSED).length,
      openCircuits: metrics.filter((m) => m.state === CircuitState.OPEN).length,
      halfOpenCircuits: metrics.filter((m) => m.state === CircuitState.HALF_OPEN).length,
      totalFailures: metrics.reduce((sum, m) => sum + m.failureCount, 0),
      totalSuccesses: metrics.reduce((sum, m) => sum + m.successCount, 0),
      averageFailureRate:
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.failureRate, 0) / metrics.length
          : 0,
      targets: Object.fromEntries(metrics.map((m) => [m.target, m])) as Record<
        ExportTarget,
        CircuitMetrics
      >,
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset specific target
   */
  reset(target: ExportTarget): void {
    this.breakers.get(target)?.reset();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default CircuitBreaker;
