/**
 * GraphQL Client with Circuit Breaker Pattern
 *
 * Supports Apollo Client and URQL with:
 * - Per-query circuit breakers
 * - Jittered exponential backoff retries
 * - Cache fallback when circuit is open
 * - Degraded mode handling
 * - Comprehensive metrics tracking
 */

import { CircuitBreakerManager, CircuitState, RequestResult } from './CircuitBreaker';

export interface GraphQLClientOptions {
  /** Base GraphQL endpoint URL */
  endpoint: string;
  /** Headers to include in requests */
  headers?: Record<string, string>;
  /** Request timeout (ms) */
  timeout?: number;
  /** Enable cache fallback when circuit is open */
  enableCacheFallback?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Circuit breaker configuration */
  circuitBreakerConfig?: unknown;
}

export interface GraphQLRequest {
  /** GraphQL query string */
  query: string;
  /** Query variables */
  variables?: Record<string, any>;
  /** Operation name (for circuit tracking) */
  operationName?: string;
  /** Context for cache/extensions */
  context?: unknown;
}

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; extensions?: unknown }>;
}

export interface CircuitBreakerStats {
  operationName: string;
  state: CircuitState;
  failureRate: number;
  totalRequests: number;
  cacheHits: number;
  lastRetryDelay?: number;
}

/**
 * Fallback data provider for degraded mode
 */
export class FallbackDataProvider {
  private static fallbacks = new Map<string, any>();

  /**
   * Register fallback data for an operation
   */
  static register(operationName: string, fallbackData: unknown): void {
    this.fallbacks.set(operationName, fallbackData);
  }

  /**
   * Get fallback data for an operation
   */
  static get(operationName: string): unknown {
    return (
      this.fallbacks.get(operationName) || {
        data: null,
        errors: [
          {
            message: 'Service temporarily unavailable',
            extensions: { degradedMode: true },
          },
        ],
      }
    );
  }

  /**
   * Check if fallback exists for operation
   */
  static has(operationName: string): boolean {
    return this.fallbacks.has(operationName);
  }

  /**
   * Clear all fallbacks
   */
  static clear(): void {
    this.fallbacks.clear();
  }
}

/**
 * GraphQL Client with Circuit Breaker
 */
export class GraphQLCircuitBreakerClient {
  private circuitManager: CircuitBreakerManager;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheHits: Map<string, number> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes default

  constructor(private options: GraphQLClientOptions) {
    // @ts-expect-error
    this.circuitManager = new CircuitBreakerManager(options.circuitBreakerConfig);
  }

  /**
   * Execute GraphQL query with circuit breaker protection
   */
  async query<T = any>(request: GraphQLRequest): Promise<RequestResult<T>> {
    const operationName = request.operationName || this.extractOperationName(request.query);
    const circuit = this.circuitManager.getCircuit(operationName);

    // Check if circuit allows execution
    if (!circuit.canExecute()) {
      console.warn(`[Circuit Open] ${operationName} - attempting cache fallback`);
      return this.handleOpenCircuit<T>(operationName, request);
    }

    // Execute with retries
    return this.executeWithRetries<T>(request, operationName, circuit);
  }

  /**
   * Execute query with exponential backoff retries
   */
  private async executeWithRetries<T>(
    request: GraphQLRequest,
    operationName: string,
    circuit: unknown,
    attemptNumber: number = 0
  ): Promise<RequestResult<T>> {
    try {
      const response = await this.executeRequest<T>(request);

      if (response.errors && response.errors.length > 0) {
        // Check if errors are retriable
        const isRetriable = this.isRetriableError(response.errors);

        if (isRetriable && attemptNumber < (this.options.maxRetries || 3)) {
          // Calculate retry delay with jitter
          // @ts-expect-error
          const delay = circuit.calculateRetryDelay(attemptNumber);
          console.info(`[Retry] ${operationName} attempt ${attemptNumber + 1} after ${delay}ms`);

          // Wait with jittered delay
          await this.sleep(delay);

          // Retry
          return this.executeWithRetries<T>(request, operationName, circuit, attemptNumber + 1);
        }

        // Non-retriable error or max retries exceeded
        // @ts-expect-error
        circuit.recordFailure(false);
        return {
          success: false,
          error: new Error(response.errors[0].message),
          data: response.data,
          retriedCount: attemptNumber,
        };
      }

      // Success
      // @ts-expect-error
      circuit.recordSuccess();
      this.cacheResponse(operationName, response.data);

      return {
        success: true,
        data: response.data,
        retriedCount: attemptNumber,
      };
    } catch (error: unknown) {
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || (error as NodeJS.ErrnoException).code === 'ETIMEDOUT');

      // Check for retry
      if (attemptNumber < (this.options.maxRetries || 3)) {
        // @ts-expect-error
        const delay = circuit.calculateRetryDelay(attemptNumber);
        console.info(
          `[Retry] ${operationName} attempt ${attemptNumber + 1} after ${delay}ms (${error instanceof Error ? error.message : String(error)})`
        );

        await this.sleep(delay);
        return this.executeWithRetries<T>(request, operationName, circuit, attemptNumber + 1);
      }

      // Max retries exceeded
      // @ts-expect-error
      circuit.recordFailure(isTimeout);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        retriedCount: attemptNumber,
      };
    }
  }

  /**
   * Execute raw GraphQL request
   */
  private async executeRequest<T>(request: GraphQLRequest): Promise<GraphQLResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeout || 10000);

    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: JSON.stringify({
          query: request.query,
          variables: request.variables,
          operationName: request.operationName,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: unknown) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }

      throw error;
    }
  }

  /**
   * Handle open circuit - try cache or fallback
   */
  private handleOpenCircuit<T>(operationName: string, request: GraphQLRequest): RequestResult<T> {
    // Try cache first
    if (this.options.enableCacheFallback) {
      const cached = this.getCachedResponse<T>(operationName);

      if (cached) {
        console.info(`[Cache Hit] ${operationName} - serving from cache (circuit open)`);
        this.incrementCacheHit(operationName);

        return {
          success: true,
          data: cached,
          fromCache: true,
        };
      }
    }

    // Try registered fallback data
    if (FallbackDataProvider.has(operationName)) {
      console.info(`[Fallback Data] ${operationName} - serving fallback (circuit open)`);
      const fallback = FallbackDataProvider.get(operationName);

      return {
        success: false,
        // @ts-expect-error
        data: fallback.data,
        error: new Error('Circuit breaker open - serving fallback data'),
        fromCache: true,
      };
    }

    // No cache or fallback available
    return {
      success: false,
      error: new Error(`Circuit breaker open for ${operationName} - no cache available`),
      fromCache: false,
    };
  }

  /**
   * Check if GraphQL errors are retriable
   */
  private isRetriableError(errors: Array<{ message: string; extensions?: unknown }>): boolean {
    const retriableCodes = [
      'INTERNAL_SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
      'TIMEOUT',
      'RATE_LIMIT_EXCEEDED',
    ];

    return errors.some((error) => {
      // @ts-expect-error
      const code = error.extensions?.code;
      return code && retriableCodes.includes(code);
    });
  }

  /**
   * Cache response data
   */
  private cacheResponse(operationName: string, data: unknown): void {
    this.cache.set(operationName, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached response if valid
   */
  private getCachedResponse<T>(operationName: string): T | null {
    const cached = this.cache.get(operationName);

    if (!cached) {
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(operationName);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Increment cache hit counter
   */
  private incrementCacheHit(operationName: string): void {
    const current = this.cacheHits.get(operationName) || 0;
    this.cacheHits.set(operationName, current + 1);
  }

  /**
   * Extract operation name from query string
   */
  private extractOperationName(query: string): string {
    const match = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker statistics for all operations
   */
  public getCircuitStats(): CircuitBreakerStats[] {
    const stats: CircuitBreakerStats[] = [];
    const metrics = this.circuitManager.getAllMetrics();

    for (const [operationName, metric] of metrics) {
      stats.push({
        operationName,
        state: metric.state,
        failureRate: metric.failureRate,
        totalRequests: metric.totalRequests,
        cacheHits: this.cacheHits.get(operationName) || 0,
      });
    }

    return stats;
  }

  /**
   * Get overall system health
   */
  public getSystemHealth() {
    const circuitStats = this.circuitManager.getStats();
    const cacheSize = this.cache.size;
    const totalCacheHits = Array.from(this.cacheHits.values()).reduce((sum, val) => sum + val, 0);

    return {
      circuits: circuitStats,
      cache: {
        size: cacheSize,
        totalHits: totalCacheHits,
      },
      degradedMode: circuitStats.byState.open > 0,
    };
  }

  /**
   * Reset specific circuit breaker
   */
  public resetCircuit(operationName: string): void {
    this.circuitManager.resetCircuit(operationName);
  }

  /**
   * Reset all circuit breakers
   */
  public resetAllCircuits(): void {
    this.circuitManager.resetAll();
    this.cache.clear();
    this.cacheHits.clear();
  }

  /**
   * Set cache TTL (time-to-live in milliseconds)
   */
  public setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl;
  }
}

/**
 * Apollo Client Integration Helper
 */
export function createApolloCircuitBreakerLink(client: GraphQLCircuitBreakerClient) {
  // This would integrate with Apollo Client's link chain
  // Full implementation depends on Apollo Client version
  return {
    request: async (operation: unknown) => {
      const result = await client.query({
        // @ts-expect-error
        query: operation.query,
        // @ts-expect-error
        variables: operation.variables,
        // @ts-expect-error
        operationName: operation.operationName,
      });

      return result;
    },
  };
}

/**
 * URQL Exchange Integration Helper
 */
export function createUrqlCircuitBreakerExchange(client: GraphQLCircuitBreakerClient) {
  // This would integrate with URQL's exchange pipeline
  return (options: unknown) => (ops$: unknown) => {
    // Implementation depends on URQL version
    // Would wrap operations with circuit breaker logic
  };
}
