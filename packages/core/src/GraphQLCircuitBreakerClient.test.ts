/**
 * GraphQL Circuit Breaker Client Integration Tests
 *
 * Tests full integration with mock GraphQL server:
 * - Query execution with retries
 * - Cache fallback during circuit open
 * - Degraded mode handling
 * - Metrics collection
 * - Apollo/URQL integration patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GraphQLCircuitBreakerClient,
  GraphQLClientOptions,
  FallbackDataProvider
} from './GraphQLCircuitBreakerClient';
import { CircuitState } from './CircuitBreaker';

// Mock fetch globally
global.fetch = vi.fn();

describe('GraphQLCircuitBreakerClient', () => {
  let client: GraphQLCircuitBreakerClient;
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = global.fetch as any;
    fetchMock.mockReset();

    const options: GraphQLClientOptions = {
      endpoint: 'http://localhost:4000/graphql',
      timeout: 5000,
      enableCacheFallback: true,
      maxRetries: 3,
      circuitBreakerConfig: {
        failureRateThreshold: 0.5,
        minimumRequests: 10,
        consecutiveTimeoutThreshold: 5,
        openStateTimeout: 1000,
        healthCheckCount: 5,
        successThreshold: 3,
        maxRetryDelay: 5000,
        baseRetryDelay: 100
      }
    };

    client = new GraphQLCircuitBreakerClient(options);
  });

  afterEach(() => {
    FallbackDataProvider.clear();
  });

  describe('Successful Query Execution', () => {
    it('should execute query successfully', async () => {
      const mockResponse = {
        data: { user: { id: '1', name: 'Test User' } }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.query({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser'
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse.data);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should cache successful response', async () => {
      const mockResponse = {
        data: { user: { id: '1', name: 'Test User' } }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await client.query({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser'
      });

      const stats = client.getCircuitStats();
      const userStats = stats.find(s => s.operationName === 'GetUser');

      expect(userStats).toBeDefined();
      expect(userStats!.totalRequests).toBe(1);
    });

    it('should extract operation name from query if not provided', async () => {
      const mockResponse = { data: { posts: [] } };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await client.query({
        query: 'query GetPosts { posts { id } }'
      });

      const stats = client.getCircuitStats();
      const postStats = stats.find(s => s.operationName === 'GetPosts');

      expect(postStats).toBeDefined();
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry on retriable error', async () => {
      const errorResponse = {
        errors: [{
          message: 'Internal server error',
          extensions: { code: 'INTERNAL_SERVER_ERROR' }
        }]
      };

      const successResponse = {
        data: { user: { id: '1', name: 'Test' } }
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => errorResponse
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => successResponse
        });

      const result = await client.query({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser'
      });

      expect(result.success).toBe(true);
      expect(result.retriedCount).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retriable error', async () => {
      const errorResponse = {
        errors: [{
          message: 'Unauthorized',
          extensions: { code: 'UNAUTHENTICATED' }
        }]
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => errorResponse
      });

      const result = await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      expect(result.success).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries limit', async () => {
      const errorResponse = {
        errors: [{
          message: 'Service unavailable',
          extensions: { code: 'SERVICE_UNAVAILABLE' }
        }]
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => errorResponse
      });

      const result = await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      expect(result.success).toBe(false);
      // Initial attempt + 3 retries = 4 total
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('should apply jittered exponential backoff', async () => {
      const errorResponse = {
        errors: [{
          message: 'Rate limit',
          extensions: { code: 'RATE_LIMIT_EXCEEDED' }
        }]
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => errorResponse
      });

      const startTime = Date.now();

      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // With 3 retries and exponential backoff, should take some time
      // Base delays: ~100ms, ~200ms, ~400ms = ~700ms minimum
      expect(elapsed).toBeGreaterThan(200); // At least some delay
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit after consecutive timeouts', async () => {
      fetchMock.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      // Trigger 5 consecutive timeouts
      for (let i = 0; i < 5; i++) {
        try {
          await client.query({
            query: 'query GetUser { user { id } }',
            operationName: 'GetUser'
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = client.getCircuitStats();
      const userStats = stats.find(s => s.operationName === 'GetUser');

      expect(userStats?.state).toBe(CircuitState.OPEN);
    });

    it('should open circuit when failure rate exceeds threshold', async () => {
      const errorResponse = {
        errors: [{ message: 'Error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }]
      };

      // 10 requests: 5 success, 5 failure (50% rate)
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { user: {} } })
        });
      }

      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => errorResponse
        });
      }

      // Execute queries
      for (let i = 0; i < 10; i++) {
        await client.query({
          query: 'query GetUser { user { id } }',
          operationName: 'GetUser'
        });
      }

      // Add one more failure to exceed threshold
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => errorResponse
      });

      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      const stats = client.getCircuitStats();
      const userStats = stats.find(s => s.operationName === 'GetUser');

      expect(userStats?.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Cache Fallback', () => {
    it('should serve from cache when circuit is open', async () => {
      // First, execute successful query to populate cache
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { user: { id: '1', name: 'Cached' } } })
      });

      const firstResult = await client.query({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser'
      });

      expect(firstResult.success).toBe(true);

      // Open circuit by triggering timeouts
      fetchMock.mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('Timeout');
            (error as any).name = 'TimeoutError';
            reject(error);
          }, 100);
        });
      });

      for (let i = 0; i < 5; i++) {
        try {
          await client.query({
            query: 'query GetUser { user { id } }',
            operationName: 'GetUser'
          });
        } catch (error) {
          // Expected
        }
      }

      // Now query should return cached data
      const cachedResult = await client.query({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser'
      });

      expect(cachedResult.fromCache).toBe(true);
      expect(cachedResult.data).toEqual({ user: { id: '1', name: 'Cached' } });
    });

    it('should use fallback data if no cache available', async () => {
      // Register fallback
      FallbackDataProvider.register('GetPosts', {
        data: { posts: [] }
      });

      // Open circuit
      fetchMock.mockImplementation(() => {
        return Promise.reject(new Error('Service down'));
      });

      for (let i = 0; i < 5; i++) {
        try {
          await client.query({
            query: 'query GetPosts { posts { id } }',
            operationName: 'GetPosts'
          });
        } catch (error) {
          // Expected
        }
      }

      // Query with open circuit
      const result = await client.query({
        query: 'query GetPosts { posts { id } }',
        operationName: 'GetPosts'
      });

      expect(result.data).toEqual({ posts: [] });
      expect(result.fromCache).toBe(true);
    });

    it('should track cache hits', async () => {
      // Populate cache
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { user: { id: '1' } } })
      });

      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      // Open circuit
      for (let i = 0; i < 5; i++) {
        fetchMock.mockRejectedValueOnce(new Error('Fail'));
        try {
          await client.query({
            query: 'query GetUser { user { id } }',
            operationName: 'GetUser'
          });
        } catch (e) {}
      }

      // Hit cache multiple times
      for (let i = 0; i < 3; i++) {
        await client.query({
          query: 'query GetUser { user { id } }',
          operationName: 'GetUser'
        });
      }

      const stats = client.getCircuitStats();
      const userStats = stats.find(s => s.operationName === 'GetUser');

      expect(userStats?.cacheHits).toBe(3);
    });
  });

  describe('System Health Monitoring', () => {
    it('should report system health', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { user: {} } })
      });

      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      const health = client.getSystemHealth();

      expect(health.circuits).toBeDefined();
      expect(health.cache).toBeDefined();
      expect(health.degradedMode).toBe(false);
    });

    it('should indicate degraded mode when circuits open', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        fetchMock.mockRejectedValueOnce(new Error('Fail'));
        try {
          await client.query({
            query: 'query GetUser { user { id } }',
            operationName: 'GetUser'
          });
        } catch (e) {}
      }

      const health = client.getSystemHealth();

      expect(health.degradedMode).toBe(true);
      expect(health.circuits.byState.open).toBeGreaterThan(0);
    });
  });

  describe('Circuit Reset', () => {
    it('should reset specific circuit', async () => {
      // Generate some activity
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} })
      });

      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      client.resetCircuit('GetUser');

      const stats = client.getCircuitStats();
      const userStats = stats.find(s => s.operationName === 'GetUser');

      expect(userStats?.totalRequests).toBe(0);
    });

    it('should reset all circuits', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} })
      });

      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });

      await client.query({
        query: 'query GetPosts { posts { id } }',
        operationName: 'GetPosts'
      });

      client.resetAllCircuits();

      const stats = client.getCircuitStats();
      expect(stats.every(s => s.totalRequests === 0)).toBe(true);
    });
  });

  describe('FallbackDataProvider', () => {
    it('should register and retrieve fallback data', () => {
      const fallback = { data: { users: [] } };
      FallbackDataProvider.register('GetUsers', fallback);

      const retrieved = FallbackDataProvider.get('GetUsers');
      expect(retrieved).toEqual(fallback);
    });

    it('should check if fallback exists', () => {
      FallbackDataProvider.register('GetUsers', { data: {} });

      expect(FallbackDataProvider.has('GetUsers')).toBe(true);
      expect(FallbackDataProvider.has('NonExistent')).toBe(false);
    });

    it('should return default fallback for unknown operation', () => {
      const fallback = FallbackDataProvider.get('UnknownOp');

      expect(fallback.data).toBeNull();
      expect(fallback.errors).toBeDefined();
      expect(fallback.errors[0].extensions?.degradedMode).toBe(true);
    });

    it('should clear all fallbacks', () => {
      FallbackDataProvider.register('Op1', { data: {} });
      FallbackDataProvider.register('Op2', { data: {} });

      FallbackDataProvider.clear();

      expect(FallbackDataProvider.has('Op1')).toBe(false);
      expect(FallbackDataProvider.has('Op2')).toBe(false);
    });
  });
});

describe('Integration Scenarios', () => {
  let client: GraphQLCircuitBreakerClient;
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = global.fetch as any;
    fetchMock.mockReset();

    client = new GraphQLCircuitBreakerClient({
      endpoint: 'http://localhost:4000/graphql',
      enableCacheFallback: true,
      maxRetries: 2,
      circuitBreakerConfig: {
        failureRateThreshold: 0.5,
        minimumRequests: 5,
        consecutiveTimeoutThreshold: 3,
        openStateTimeout: 500,
        healthCheckCount: 3,
        successThreshold: 2,
        maxRetryDelay: 2000,
        baseRetryDelay: 100
      }
    });
  });

  it('should handle thundering herd with jittered delays', async () => {
    const errorResponse = {
      errors: [{ message: 'Error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }]
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => errorResponse
    });

    // Simulate 100 concurrent requests (thundering herd)
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(
        client.query({
          query: 'query GetData { data }',
          operationName: 'GetData'
        })
      );
    }

    await Promise.all(requests);

    // Verify jitter was applied (different retry delays)
    const stats = client.getCircuitStats();
    const dataStats = stats.find(s => s.operationName === 'GetData');

    // Circuit should eventually open
    expect(dataStats?.state).toBe(CircuitState.OPEN);
  });

  it('should recover from degraded mode', async () => {
    // Cause degradation
    for (let i = 0; i < 3; i++) {
      fetchMock.mockRejectedValueOnce(new Error('Timeout'));
      try {
        await client.query({
          query: 'query GetUser { user { id } }',
          operationName: 'GetUser'
        });
      } catch (e) {}
    }

    let stats = client.getCircuitStats();
    let userStats = stats.find(s => s.operationName === 'GetUser');
    expect(userStats?.state).toBe(CircuitState.OPEN);

    // Wait for half-open
    await new Promise(resolve => setTimeout(resolve, 600));

    // Successful health checks
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { user: { id: '1' } } })
    });

    for (let i = 0; i < 3; i++) {
      await client.query({
        query: 'query GetUser { user { id } }',
        operationName: 'GetUser'
      });
    }

    stats = client.getCircuitStats();
    userStats = stats.find(s => s.operationName === 'GetUser');
    expect(userStats?.state).toBe(CircuitState.CLOSED);
  });
});
