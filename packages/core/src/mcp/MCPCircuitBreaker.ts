/**
 * MCPCircuitBreaker — Resilient MCP tool calls with circuit breaker
 *
 * Wraps MCP server requests with the CircuitBreaker pattern from
 * ResiliencePatterns.ts. Prevents cascading failures when the MCP server
 * is down or unresponsive.
 *
 * Usage:
 *   const mcpCB = new MCPCircuitBreaker({ failureThreshold: 3 });
 *   const result = await mcpCB.callTool('holotest', { code: '...' });
 */

import {
  CircuitBreaker,
  CircuitBreakerState,
  retryWithBackoff,
  withTimeout,
  type CircuitBreakerConfig,
} from '../resilience/ResiliencePatterns';

export interface MCPToolCallOptions {
  /** Tool name to call */
  tool: string;
  /** Arguments to pass to the tool */
  args: Record<string, unknown>;
  /** Timeout per call in ms (default: 15000) */
  timeoutMs?: number;
}

export interface MCPToolResult {
  success: boolean;
  content?: unknown;
  error?: string;
  circuitState: CircuitBreakerState;
}

export class MCPCircuitBreaker {
  private breaker: CircuitBreaker;
  private baseUrl: string;

  constructor(
    config: Partial<CircuitBreakerConfig> & { baseUrl?: string } = {}
  ) {
    this.breaker = new CircuitBreaker({
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      resetTimeoutMs: config.resetTimeoutMs ?? 30000,
      windowMs: config.windowMs ?? 60000,
    });
    this.baseUrl = config.baseUrl ?? 'http://localhost:3000';
  }

  /**
   * Call an MCP tool with circuit breaker protection + retry + timeout
   */
  async callTool(tool: string, args: Record<string, unknown>, timeoutMs = 15000): Promise<MCPToolResult> {
    try {
      const result = await this.breaker.execute(async () => {
        return retryWithBackoff(async () => {
          const response = await withTimeout(
            fetch(`${this.baseUrl}/api/mcp/tools/${tool}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ arguments: args }),
            }),
            timeoutMs
          );

          if (!response.ok) {
            throw new Error(`MCP tool ${tool} failed: ${response.status} ${response.statusText}`);
          }

          return response.json();
        }, {
          maxAttempts: 2,
          initialBackoffMs: 500,
          maxBackoffMs: 3000,
        });
      });

      return {
        success: true,
        content: result,
        circuitState: this.breaker.getState(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        circuitState: this.breaker.getState(),
      };
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.breaker.getState();
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics() {
    return this.breaker.getMetrics();
  }

  /**
   * Check if MCP server is available (circuit not open)
   */
  isAvailable(): boolean {
    return this.breaker.getState() !== CircuitBreakerState.OPEN;
  }
}

/**
 * Singleton factory for the default MCP circuit breaker
 */
let defaultInstance: MCPCircuitBreaker | null = null;

export function getMCPCircuitBreaker(config?: Partial<CircuitBreakerConfig> & { baseUrl?: string }): MCPCircuitBreaker {
  if (!defaultInstance) {
    defaultInstance = new MCPCircuitBreaker(config);
  }
  return defaultInstance;
}
