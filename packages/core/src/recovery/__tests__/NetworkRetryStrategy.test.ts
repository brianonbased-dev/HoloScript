import { describe, it, expect, vi } from 'vitest';
import { NetworkRetryStrategy } from '../strategies/NetworkRetryStrategy';
import type { IAgentFailure } from '../../extensions';

describe('NetworkRetryStrategy', () => {
  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const strategy = new NetworkRetryStrategy();
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.backoffMs).toBe(1000);
    });

    it('should use provided config', () => {
      const strategy = new NetworkRetryStrategy({
        maxAttempts: 5,
        baseBackoffMs: 2000,
        maxBackoffMs: 60000,
      });
      expect(strategy.maxAttempts).toBe(5);
      expect(strategy.backoffMs).toBe(2000);
    });
  });

  describe('id and handles', () => {
    it('should have correct id', () => {
      const strategy = new NetworkRetryStrategy();
      expect(strategy.id).toBe('network-retry');
    });

    it('should handle network-timeout', () => {
      const strategy = new NetworkRetryStrategy();
      expect(strategy.handles).toContain('network-timeout');
    });

    it('should handle api-rate-limit', () => {
      const strategy = new NetworkRetryStrategy();
      expect(strategy.handles).toContain('api-rate-limit');
    });
  });

  describe('matches', () => {
    it('should match network-timeout failure', () => {
      const strategy = new NetworkRetryStrategy();
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

    it('should not match memory-error failure', () => {
      const strategy = new NetworkRetryStrategy();
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'memory-error',
        message: 'Out of memory',
        timestamp: Date.now(),
        severity: 'high',
      };
      expect(strategy.matches(failure)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should return retry recommendation when no callback', async () => {
      const strategy = new NetworkRetryStrategy();
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      const result = await strategy.execute(failure);

      expect(result.strategyUsed).toBe('network-retry');
      expect(result.retryRecommended).toBe(true);
      expect(result.nextAction).toBe('retry');
    });

    it('should use retry callback when set', async () => {
      const strategy = new NetworkRetryStrategy();
      const mockCallback = vi.fn().mockResolvedValue(true);
      strategy.setRetryCallback(mockCallback);

      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      const result = await strategy.execute(failure);

      expect(mockCallback).toHaveBeenCalledWith(failure);
      expect(result.success).toBe(true);
      expect(result.strategyUsed).toBe('network-retry');
    });

    it('should handle callback failure', async () => {
      const strategy = new NetworkRetryStrategy();
      const mockCallback = vi.fn().mockRejectedValue(new Error('Network error'));
      strategy.setRetryCallback(mockCallback);

      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      const result = await strategy.execute(failure);

      expect(result.success).toBe(false);
      expect(result.retryRecommended).toBe(true);
      expect(result.message).toContain('Network error');
    });
  });

  describe('getBackoffForAttempt', () => {
    it('should calculate exponential backoff', () => {
      const strategy = new NetworkRetryStrategy({
        baseBackoffMs: 1000,
        maxBackoffMs: 30000,
        maxAttempts: 5,
      });

      expect(strategy.getBackoffForAttempt(0)).toBe(1000);
      expect(strategy.getBackoffForAttempt(1)).toBe(2000);
      expect(strategy.getBackoffForAttempt(2)).toBe(4000);
      expect(strategy.getBackoffForAttempt(3)).toBe(8000);
    });

    it('should cap at maxBackoffMs', () => {
      const strategy = new NetworkRetryStrategy({
        baseBackoffMs: 1000,
        maxBackoffMs: 5000,
        maxAttempts: 5,
      });

      // 1000 * 2^5 = 32000, should be capped at 5000
      expect(strategy.getBackoffForAttempt(5)).toBe(5000);
    });
  });
});
