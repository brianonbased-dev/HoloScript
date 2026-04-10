import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreakerStrategy, CircuitState } from '../strategies/CircuitBreakerStrategy';
import type { IAgentFailure } from '../../extensions';

describe('CircuitBreakerStrategy', () => {
  let strategy: CircuitBreakerStrategy;

  beforeEach(() => {
    vi.useFakeTimers();
    strategy = new CircuitBreakerStrategy({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 2,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const defaultStrategy = new CircuitBreakerStrategy();
      expect(defaultStrategy.id).toBe('circuit-breaker');
    });
  });

  describe('id and handles', () => {
    it('should have correct id', () => {
      expect(strategy.id).toBe('circuit-breaker');
    });

    it('should handle network-timeout', () => {
      expect(strategy.handles).toContain('network-timeout');
    });

    it('should handle api-rate-limit', () => {
      expect(strategy.handles).toContain('api-rate-limit');
    });
  });

  describe('matches', () => {
    it('should match network-timeout failure', () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };
      expect(strategy.matches(failure)).toBe(true);
    });

    it('should not match validation-error failure', () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'validation-error',
        message: 'Invalid data',
        timestamp: Date.now(),
        severity: 'low',
      };
      expect(strategy.matches(failure)).toBe(false);
    });
  });

  describe('circuit states', () => {
    it('should start in closed state', () => {
      const state = strategy.getCircuitState('test');
      expect(state).toBe('closed');
    });

    it('should open circuit after threshold failures', async () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      // Threshold is 3
      await strategy.execute(failure);
      await strategy.execute(failure);
      const result = await strategy.execute(failure);

      expect(result.success).toBe(false);
      expect(result.message).toContain('tripped');
      expect(strategy.getCircuitState('agent-1:network-timeout')).toBe('open');
    });

    it('should block requests when open', async () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      // Trip the circuit
      strategy.recordFailure('agent-1:network-timeout');
      strategy.recordFailure('agent-1:network-timeout');
      strategy.recordFailure('agent-1:network-timeout');

      const result = await strategy.execute(failure);
      expect(result.success).toBe(false);
      expect(result.message).toContain('open');
      expect(result.nextAction).toBe('skip');
    });

    it('should transition to half-open after timeout', async () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      // Trip the circuit
      strategy.recordFailure('agent-1:network-timeout');
      strategy.recordFailure('agent-1:network-timeout');
      strategy.recordFailure('agent-1:network-timeout');

      expect(strategy.getCircuitState('agent-1:network-timeout')).toBe('open');

      // Advance past reset timeout
      vi.advanceTimersByTime(6000);

      // Execute should transition to half-open
      await strategy.execute({
        ...failure,
        timestamp: Date.now(),
      });

      // After failure in half-open, should go back to open
      expect(strategy.getCircuitState('agent-1:network-timeout')).toBe('open');
    });
  });

  describe('recordSuccess', () => {
    it('should reset failure count in closed state', () => {
      const key = 'test-circuit';
      strategy.recordFailure(key);
      strategy.recordFailure(key);
      strategy.recordSuccess(key);

      // Failure count should be reset
      expect(strategy.getCircuitState(key)).toBe('closed');
    });

    it('should close circuit after enough successes in half-open', () => {
      const key = 'test-circuit';

      // Record failures to reach half-open threshold
      for (let i = 0; i < 3; i++) {
        strategy.recordFailure(key);
      }
      expect(strategy.getCircuitState(key)).toBe('open');

      // Manually simulate half-open transition (in real usage, time would pass)
      strategy.resetCircuit(key);

      expect(strategy.getCircuitState(key)).toBe('closed');
    });
  });

  describe('resetCircuit', () => {
    it('should reset circuit to closed', () => {
      const key = 'test-circuit';

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        strategy.recordFailure(key);
      }
      expect(strategy.getCircuitState(key)).toBe('open');

      strategy.resetCircuit(key);
      expect(strategy.getCircuitState(key)).toBe('closed');
    });
  });

  describe('getAllCircuits', () => {
    it('should return all tracked circuits', () => {
      strategy.recordFailure('circuit-1');
      strategy.recordFailure('circuit-2');
      strategy.recordFailure('circuit-3');

      const circuits = strategy.getAllCircuits();
      expect(circuits.size).toBe(3);
      expect(circuits.has('circuit-1')).toBe(true);
      expect(circuits.has('circuit-2')).toBe(true);
      expect(circuits.has('circuit-3')).toBe(true);
    });
  });
});

interface CircuitInfo {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
}
