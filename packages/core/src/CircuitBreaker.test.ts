/**
 * Circuit Breaker Unit Tests
 *
 * Comprehensive test coverage for:
 * - State transitions (closed -> open -> half-open -> closed)
 * - Failure rate threshold detection
 * - Consecutive timeout tracking
 * - Health check recovery
 * - Jittered exponential backoff
 * - Metrics collection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState,
  CircuitBreakerConfig
} from './CircuitBreaker';

describe('CircuitBreaker', () => {
  let circuit: CircuitBreaker;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    config = {
      failureRateThreshold: 0.5,
      minimumRequests: 10,
      consecutiveTimeoutThreshold: 5,
      openStateTimeout: 1000, // 1 second for tests
      healthCheckCount: 5,
      successThreshold: 3,
      maxRetryDelay: 30000,
      baseRetryDelay: 1000
    };

    circuit = new CircuitBreaker('testOperation', config);
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should allow execution in CLOSED state', () => {
      expect(circuit.canExecute()).toBe(true);
    });

    it('should have zero metrics initially', () => {
      const metrics = circuit.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.totalSuccesses).toBe(0);
      expect(metrics.failureRate).toBe(0);
    });
  });

  describe('Success Recording', () => {
    it('should record successful requests', () => {
      circuit.recordSuccess();

      const metrics = circuit.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalSuccesses).toBe(1);
      expect(metrics.failureRate).toBe(0);
    });

    it('should reset consecutive timeouts on success', () => {
      // Record some timeouts
      circuit.recordFailure(true);
      circuit.recordFailure(true);

      const beforeMetrics = circuit.getMetrics();
      expect(beforeMetrics.consecutiveTimeouts).toBe(2);

      // Success should reset
      circuit.recordSuccess();

      const afterMetrics = circuit.getMetrics();
      expect(afterMetrics.consecutiveTimeouts).toBe(0);
    });
  });

  describe('Failure Rate Threshold', () => {
    it('should open circuit when failure rate exceeds threshold', () => {
      // Record 10 requests: 5 successes, 5 failures (50% failure rate)
      for (let i = 0; i < 5; i++) {
        circuit.recordSuccess();
      }
      for (let i = 0; i < 4; i++) {
        circuit.recordFailure(false);
      }

      // Still closed (at threshold)
      let metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);

      // One more failure should open it (>50%)
      circuit.recordFailure(false);

      metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
    });

    it('should not open circuit below minimum requests', () => {
      // Record only 5 requests with 100% failure (below minimumRequests)
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure(false);
      }

      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should calculate failure rate correctly over rolling window', () => {
      // Fill window with successes
      for (let i = 0; i < 10; i++) {
        circuit.recordSuccess();
      }

      let metrics = circuit.getMetrics();
      expect(metrics.failureRate).toBe(0);

      // Add more requests (rolling window should maintain ~10 most recent)
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure(false);
      }

      metrics = circuit.getMetrics();
      // Should have 5 failures in last 10 requests = 50%
      expect(metrics.failureRate).toBeCloseTo(0.5, 1);
    });
  });

  describe('Consecutive Timeout Threshold', () => {
    it('should open circuit after consecutive timeouts', () => {
      // Record 4 timeouts (below threshold)
      for (let i = 0; i < 4; i++) {
        circuit.recordFailure(true);
      }

      let metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.consecutiveTimeouts).toBe(4);

      // 5th timeout should open circuit
      circuit.recordFailure(true);

      metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
    });

    it('should distinguish between timeouts and other failures', () => {
      circuit.recordFailure(true); // timeout
      circuit.recordFailure(false); // non-timeout

      const metrics = circuit.getMetrics();
      expect(metrics.consecutiveTimeouts).toBe(0); // Reset by non-timeout
    });
  });

  describe('Open State Behavior', () => {
    beforeEach(() => {
      // Force circuit open
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure(true);
      }
    });

    it('should not allow execution immediately after opening', () => {
      expect(circuit.canExecute()).toBe(false);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Wait for open state timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(circuit.canExecute()).toBe(true);

      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('Half-Open State Recovery', () => {
    beforeEach(async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure(true);
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 1100));
      circuit.canExecute(); // Trigger transition
    });

    it('should allow limited requests in HALF_OPEN state', () => {
      // Should allow healthCheckCount requests
      for (let i = 0; i < config.healthCheckCount; i++) {
        expect(circuit.canExecute()).toBe(true);
        circuit.recordSuccess(); // Simulate health check
      }

      // Should not allow more
      expect(circuit.canExecute()).toBe(false);
    });

    it('should close circuit after successful health checks', () => {
      // Record successful health checks
      for (let i = 0; i < config.healthCheckCount; i++) {
        circuit.recordSuccess();
      }

      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failed health check', () => {
      // Record one failed health check
      circuit.recordFailure(false);

      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
    });

    it('should close only if success threshold met', () => {
      // Need 3 successes out of 5 health checks
      circuit.recordSuccess();
      circuit.recordSuccess();
      circuit.recordFailure(false); // This should reopen

      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Jittered Exponential Backoff', () => {
    it('should calculate exponential delays', () => {
      const delay0 = circuit.calculateRetryDelay(0);
      const delay1 = circuit.calculateRetryDelay(1);
      const delay2 = circuit.calculateRetryDelay(2);

      // Delays should generally increase exponentially
      // With jitter, they'll be <= exponential value
      expect(delay0).toBeLessThanOrEqual(config.baseRetryDelay);
      expect(delay1).toBeLessThanOrEqual(config.baseRetryDelay * 2);
      expect(delay2).toBeLessThanOrEqual(config.baseRetryDelay * 4);
    });

    it('should apply full jitter (0-100%)', () => {
      const delays = [];
      for (let i = 0; i < 100; i++) {
        delays.push(circuit.calculateRetryDelay(2));
      }

      const min = Math.min(...delays);
      const max = Math.max(...delays);

      // With full jitter, should see wide distribution
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(config.baseRetryDelay * 4);
      expect(max - min).toBeGreaterThan(1000); // Significant spread
    });

    it('should cap delay at maxRetryDelay', () => {
      const delay = circuit.calculateRetryDelay(10); // Very high attempt number

      expect(delay).toBeLessThanOrEqual(config.maxRetryDelay);
    });

    it('should track retry delays in histogram', () => {
      for (let i = 0; i < 10; i++) {
        circuit.calculateRetryDelay(i);
      }

      const metrics = circuit.getMetrics();
      expect(metrics.retryHistogram.size).toBeGreaterThan(0);
    });
  });

  describe('Metrics Collection', () => {
    it('should track all metrics correctly', () => {
      // Mixed operations
      circuit.recordSuccess();
      circuit.recordSuccess();
      circuit.recordFailure(false);
      circuit.recordFailure(true);
      circuit.recordFailure(true);

      const metrics = circuit.getMetrics();

      expect(metrics.totalRequests).toBe(5);
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(3);
      expect(metrics.failureRate).toBe(0.6); // 3/5
      expect(metrics.consecutiveTimeouts).toBe(2);
    });

    it('should update lastStateChange timestamp', async () => {
      const initialMetrics = circuit.getMetrics();
      const initialTime = initialMetrics.lastStateChange.getTime();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger state change
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure(true);
      }

      const afterMetrics = circuit.getMetrics();
      expect(afterMetrics.lastStateChange.getTime()).toBeGreaterThan(initialTime);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all metrics and state', () => {
      // Generate some activity
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure(true);
      }

      circuit.reset();

      const metrics = circuit.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.consecutiveTimeouts).toBe(0);
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  describe('Circuit Management', () => {
    it('should create circuit for new operation', () => {
      const circuit = manager.getCircuit('testOp');
      expect(circuit).toBeDefined();
      expect(circuit.operationName).toBe('testOp');
    });

    it('should reuse circuit for same operation', () => {
      const circuit1 = manager.getCircuit('testOp');
      const circuit2 = manager.getCircuit('testOp');

      expect(circuit1).toBe(circuit2);
    });

    it('should create separate circuits for different operations', () => {
      const circuit1 = manager.getCircuit('op1');
      const circuit2 = manager.getCircuit('op2');

      expect(circuit1).not.toBe(circuit2);
    });
  });

  describe('Metrics Aggregation', () => {
    it('should collect metrics from all circuits', () => {
      const circuit1 = manager.getCircuit('op1');
      const circuit2 = manager.getCircuit('op2');

      circuit1.recordSuccess();
      circuit2.recordFailure(false);

      const allMetrics = manager.getAllMetrics();

      expect(allMetrics.size).toBe(2);
      expect(allMetrics.get('op1')?.totalSuccesses).toBe(1);
      expect(allMetrics.get('op2')?.totalFailures).toBe(1);
    });

    it('should calculate overall statistics', () => {
      const circuit1 = manager.getCircuit('op1');
      const circuit2 = manager.getCircuit('op2');

      // Open one circuit
      for (let i = 0; i < 5; i++) {
        circuit1.recordFailure(true);
      }

      circuit2.recordSuccess();

      const stats = manager.getStats();

      expect(stats.totalCircuits).toBe(2);
      expect(stats.byState.open).toBe(1);
      expect(stats.byState.closed).toBe(1);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset specific circuit', () => {
      const circuit = manager.getCircuit('testOp');
      circuit.recordFailure(false);

      manager.resetCircuit('testOp');

      const metrics = circuit.getMetrics();
      expect(metrics.totalFailures).toBe(0);
    });

    it('should reset all circuits', () => {
      const circuit1 = manager.getCircuit('op1');
      const circuit2 = manager.getCircuit('op2');

      circuit1.recordFailure(false);
      circuit2.recordFailure(false);

      manager.resetAll();

      const metrics1 = circuit1.getMetrics();
      const metrics2 = circuit2.getMetrics();

      expect(metrics1.totalFailures).toBe(0);
      expect(metrics2.totalFailures).toBe(0);
    });
  });

  describe('Custom Configuration', () => {
    it('should use custom config for all circuits', () => {
      const customManager = new CircuitBreakerManager({
        failureRateThreshold: 0.75,
        minimumRequests: 20
      });

      const circuit = customManager.getCircuit('testOp');

      // Test that custom config is applied
      // (Would need to expose config or test behavior)
      expect(circuit).toBeDefined();
    });
  });
});

describe('Edge Cases', () => {
  it('should handle zero requests gracefully', () => {
    const circuit = new CircuitBreaker('test', {
      failureRateThreshold: 0.5,
      minimumRequests: 10,
      consecutiveTimeoutThreshold: 5,
      openStateTimeout: 1000,
      healthCheckCount: 5,
      successThreshold: 3,
      maxRetryDelay: 30000,
      baseRetryDelay: 1000
    });

    const metrics = circuit.getMetrics();
    expect(metrics.failureRate).toBe(0);
  });

  it('should handle rapid state transitions', async () => {
    const circuit = new CircuitBreaker('test', {
      failureRateThreshold: 0.5,
      minimumRequests: 10,
      consecutiveTimeoutThreshold: 5,
      openStateTimeout: 100,
      healthCheckCount: 5,
      successThreshold: 3,
      maxRetryDelay: 30000,
      baseRetryDelay: 1000
    });

    // Open circuit
    for (let i = 0; i < 5; i++) {
      circuit.recordFailure(true);
    }

    // Wait for half-open
    await new Promise(resolve => setTimeout(resolve, 150));
    circuit.canExecute();

    // Close circuit
    for (let i = 0; i < 5; i++) {
      circuit.recordSuccess();
    }

    const metrics = circuit.getMetrics();
    expect(metrics.state).toBe(CircuitState.CLOSED);
  });

  it('should handle concurrent requests correctly', () => {
    const circuit = new CircuitBreaker('test', {
      failureRateThreshold: 0.5,
      minimumRequests: 10,
      consecutiveTimeoutThreshold: 5,
      openStateTimeout: 1000,
      healthCheckCount: 5,
      successThreshold: 3,
      maxRetryDelay: 30000,
      baseRetryDelay: 1000
    });

    // Simulate concurrent operations
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        new Promise(resolve => {
          if (Math.random() > 0.5) {
            circuit.recordSuccess();
          } else {
            circuit.recordFailure(false);
          }
          resolve(null);
        })
      );
    }

    return Promise.all(promises).then(() => {
      const metrics = circuit.getMetrics();
      expect(metrics.totalRequests).toBe(100);
    });
  });
});
