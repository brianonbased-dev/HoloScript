import { describe, it, expect } from 'vitest';
import { CircuitBreakerStrategy } from '../../recovery/strategies/CircuitBreakerStrategy';
import type { IAgentFailure } from '../../extensions';

function makeFailure(
  agentId = 'agent-1',
  errorType: IAgentFailure['errorType'] = 'network-timeout'
): IAgentFailure {
  return {
    agentId,
    errorType,
    errorMessage: 'Test failure',
    timestamp: Date.now(),
    context: {},
  };
}

describe('CircuitBreakerStrategy — Production Tests', () => {
  describe('identity', () => {
    it('has correct id', () => {
      expect(new CircuitBreakerStrategy().id).toBe('circuit-breaker');
    });

    it('maxAttempts is 1 (circuit decides, not retry loop)', () => {
      expect(new CircuitBreakerStrategy().maxAttempts).toBe(1);
    });

    it('handles network-timeout, api-rate-limit, ai-service-error, dependency-error', () => {
      const s = new CircuitBreakerStrategy();
      expect(s.handles).toContain('network-timeout');
      expect(s.handles).toContain('api-rate-limit');
      expect(s.handles).toContain('ai-service-error');
      expect(s.handles).toContain('dependency-error');
    });
  });

  describe('matches()', () => {
    it('matches network-timeout', () => {
      expect(new CircuitBreakerStrategy().matches(makeFailure())).toBe(true);
    });

    it('does not match unknown type', () => {
      // task-timeout is not in handles
      const s = new CircuitBreakerStrategy();
      expect(s.matches(makeFailure('a1', 'task-timeout' as any))).toBe(false);
    });
  });

  describe('closed → open transition', () => {
    it('starts with closed state', () => {
      const s = new CircuitBreakerStrategy({ failureThreshold: 3 });
      expect(s.getCircuitState('agent-1:network-timeout')).toBe('closed');
    });

    it('remains closed below threshold', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 3,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2,
      });
      const f = makeFailure();
      await s.execute(f);
      await s.execute(f);
      expect(s.getCircuitState('agent-1:network-timeout')).toBe('closed');
    });

    it('trips to open at threshold', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 3,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2,
      });
      const f = makeFailure();
      await s.execute(f);
      await s.execute(f);
      const result = await s.execute(f);
      expect(s.getCircuitState('agent-1:network-timeout')).toBe('open');
      expect(result.retryRecommended).toBe(false);
      expect(result.nextAction).toBe('skip');
    });

    it('emits correct message when circuit trips', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 1,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2,
      });
      const result = await s.execute(makeFailure());
      expect(result.message).toContain('tripped');
    });
  });

  describe('open → half-open transition', () => {
    it('transitions to half-open after resetTimeout elapses', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 1,
        resetTimeoutMs: 0,
        halfOpenMaxAttempts: 2,
      });
      await s.execute(makeFailure()); // trip open
      const f = makeFailure();
      const result = await s.execute(f); // should half-open and then fail
      // Circuit was half-open, failure re-opens it
      expect(s.getCircuitState('agent-1:network-timeout')).toBe('open');
      expect(result.retryRecommended).toBe(false);
    });

    it('blocks (skip) when circuit is open and timeout not elapsed', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 2,
      });
      await s.execute(makeFailure()); // trip
      const result = await s.execute(makeFailure()); // blocked
      expect(result.nextAction).toBe('skip');
      expect(result.message).toContain('Circuit open');
    });
  });

  describe('recordSuccess() / recordFailure()', () => {
    it('recordFailure opens circuit at threshold', () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 2,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2,
      });
      const key = 'service-a:network-timeout';
      s.recordFailure(key);
      expect(s.getCircuitState(key)).toBe('closed');
      s.recordFailure(key);
      expect(s.getCircuitState(key)).toBe('open');
    });

    it('recordSuccess resets failure count in closed state', () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 3,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2,
      });
      const key = 'service-b:network-timeout';
      s.recordFailure(key);
      s.recordSuccess(key);
      s.recordFailure(key);
      // Should still be closed (resetted)
      expect(s.getCircuitState(key)).toBe('closed');
    });
  });

  describe('resetCircuit()', () => {
    it('resets circuit to closed', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 2,
      });
      await s.execute(makeFailure()); // open
      s.resetCircuit('agent-1:network-timeout');
      expect(s.getCircuitState('agent-1:network-timeout')).toBe('closed');
    });
  });

  describe('getAllCircuits()', () => {
    it('returns empty map when no circuits touched', () => {
      expect(new CircuitBreakerStrategy().getAllCircuits().size).toBe(0);
    });

    it('contains circuits for each unique agent+errorType key', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        halfOpenMaxAttempts: 2,
      });
      await s.execute(makeFailure('agent-1'));
      await s.execute(makeFailure('agent-2'));
      expect(s.getAllCircuits().size).toBe(2);
    });
  });

  describe('isolated circuits per agent', () => {
    it('does not affect other agents circuits', async () => {
      const s = new CircuitBreakerStrategy({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenMaxAttempts: 2,
      });
      await s.execute(makeFailure('agent-1')); // trip agent-1
      expect(s.getCircuitState('agent-1:network-timeout')).toBe('open');
      expect(s.getCircuitState('agent-2:network-timeout')).toBe('closed');
    });
  });
});
