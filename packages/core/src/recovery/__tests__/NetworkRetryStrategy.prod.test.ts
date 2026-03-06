import { describe, it, expect, vi } from 'vitest';
import { NetworkRetryStrategy } from '../../recovery/strategies/NetworkRetryStrategy';
import type { IAgentFailure } from '../../extensions';

function makeFailure(errorType: IAgentFailure['errorType'] = 'network-timeout'): IAgentFailure {
  return {
    agentId: 'agent-1',
    errorType,
    errorMessage: 'Connection timed out',
    timestamp: Date.now(),
    context: {},
  };
}

describe('NetworkRetryStrategy — Production Tests', () => {

  describe('identity', () => {
    it('has correct id', () => {
      expect(new NetworkRetryStrategy().id).toBe('network-retry');
    });

    it('handles network-timeout and api-rate-limit', () => {
      const s = new NetworkRetryStrategy();
      expect(s.handles).toContain('network-timeout');
      expect(s.handles).toContain('api-rate-limit');
    });
  });

  describe('matches()', () => {
    it('matches network-timeout', () => {
      const s = new NetworkRetryStrategy();
      expect(s.matches(makeFailure('network-timeout'))).toBe(true);
    });

    it('matches api-rate-limit', () => {
      const s = new NetworkRetryStrategy();
      expect(s.matches(makeFailure('api-rate-limit'))).toBe(true);
    });

    it('does not match ai-service-error', () => {
      const s = new NetworkRetryStrategy();
      expect(s.matches(makeFailure('ai-service-error'))).toBe(false);
    });
  });

  describe('getBackoffForAttempt()', () => {
    it('returns baseBackoffMs * 2^0 for attempt 0', () => {
      const s = new NetworkRetryStrategy({ baseBackoffMs: 1000 });
      expect(s.getBackoffForAttempt(0)).toBe(1000);
    });

    it('doubles each attempt', () => {
      const s = new NetworkRetryStrategy({ baseBackoffMs: 500 });
      expect(s.getBackoffForAttempt(1)).toBe(1000);
      expect(s.getBackoffForAttempt(2)).toBe(2000);
    });

    it('is capped at maxBackoffMs', () => {
      const s = new NetworkRetryStrategy({ baseBackoffMs: 1000, maxBackoffMs: 3000 });
      expect(s.getBackoffForAttempt(10)).toBe(3000);
    });

    it('applies custom maxBackoffMs', () => {
      const s = new NetworkRetryStrategy({ baseBackoffMs: 500, maxBackoffMs: 1500 });
      expect(s.getBackoffForAttempt(3)).toBeLessThanOrEqual(1500);
    });
  });

  describe('execute() — no callback (default signal)', () => {
    it('returns retryRecommended: true without callback', async () => {
      const s = new NetworkRetryStrategy();
      const result = await s.execute(makeFailure());
      expect(result.retryRecommended).toBe(true);
      expect(result.strategyUsed).toBe('network-retry');
      expect(result.nextAction).toBe('retry');
    });
  });

  describe('execute() — with callback', () => {
    it('returns success: true when callback resolves true', async () => {
      const s = new NetworkRetryStrategy();
      s.setRetryCallback(async () => true);
      const result = await s.execute(makeFailure());
      expect(result.success).toBe(true);
      expect(result.retryRecommended).toBe(false);
      expect(result.nextAction).toBeUndefined();
    });

    it('returns success: false when callback resolves false', async () => {
      const s = new NetworkRetryStrategy();
      s.setRetryCallback(async () => false);
      const result = await s.execute(makeFailure());
      expect(result.success).toBe(false);
      expect(result.retryRecommended).toBe(true);
    });

    it('returns success: false and message when callback throws', async () => {
      const s = new NetworkRetryStrategy();
      s.setRetryCallback(async () => { throw new Error('timeout again'); });
      const result = await s.execute(makeFailure());
      expect(result.success).toBe(false);
      expect(result.message).toContain('timeout again');
    });
  });

  describe('config defaults', () => {
    it('sets maxAttempts to config value', () => {
      const s = new NetworkRetryStrategy({ maxAttempts: 5 });
      expect(s.maxAttempts).toBe(5);
    });

    it('sets backoffMs to baseBackoffMs', () => {
      const s = new NetworkRetryStrategy({ baseBackoffMs: 2000 });
      expect(s.backoffMs).toBe(2000);
    });
  });
});
