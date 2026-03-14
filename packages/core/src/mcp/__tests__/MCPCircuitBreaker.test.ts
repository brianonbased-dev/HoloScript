/**
 * MCPCircuitBreaker.test.ts — Unit tests for MCP resilience wrapper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPCircuitBreaker } from '../MCPCircuitBreaker';
import { CircuitBreakerState } from '../../resilience/ResiliencePatterns';

describe('MCPCircuitBreaker', () => {
  let mcpCB: MCPCircuitBreaker;

  beforeEach(() => {
    mcpCB = new MCPCircuitBreaker({
      failureThreshold: 3,
      successThreshold: 1,
      resetTimeoutMs: 1000,
      windowMs: 5000,
      baseUrl: 'http://localhost:9999',
    });
  });

  it('starts in CLOSED state', () => {
    expect(mcpCB.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('isAvailable returns true when closed', () => {
    expect(mcpCB.isAvailable()).toBe(true);
  });

  it('getMetrics returns initial metrics', () => {
    const metrics = mcpCB.getMetrics();
    expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
    expect(metrics.totalFailures).toBe(0);
    expect(metrics.totalRequests).toBe(0);
  });

  it('callTool returns error on network failure', async () => {
    // Mock fetch to reject
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await mcpCB.callTool('test-tool', { input: 'hello' }, 2000);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');

    globalThis.fetch = originalFetch;
  });

  it('callTool returns success on valid response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'parsed' }),
    });

    const result = await mcpCB.callTool('parse_holo', { code: 'object "a" {}' });

    expect(result.success).toBe(true);
    expect(result.content).toEqual({ result: 'parsed' });
    expect(result.circuitState).toBe(CircuitBreakerState.CLOSED);

    globalThis.fetch = originalFetch;
  });

  it('circuit opens after threshold failures', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'));

    // Trigger 3 failures (threshold)
    for (let i = 0; i < 3; i++) {
      await mcpCB.callTool('fail-tool', {}, 500);
    }

    expect(mcpCB.getState()).toBe(CircuitBreakerState.OPEN);
    expect(mcpCB.isAvailable()).toBe(false);

    globalThis.fetch = originalFetch;
  });
});
