import { describe, it, expect, vi } from 'vitest';
import {
  RetryRecoveryStrategy,
  SkipRecoveryStrategy,
  EscalateRecoveryStrategy,
  NetworkTimeoutRecovery,
  RateLimitRecovery,
} from '../BaseRecoveryStrategy';
import type { IAgentFailure } from '../AgentExtensionTypes';

function makeFailure(errorType: string = 'network-timeout'): IAgentFailure {
  return {
    errorType: errorType as any,
    message: 'Test failure',
    timestamp: Date.now(),
    agentId: 'agent-1',
    context: {},
  };
}

describe('RecoveryStrategies', () => {
  // ---- RetryRecoveryStrategy ----

  describe('RetryRecoveryStrategy', () => {
    it('matches correct failure type', () => {
      const strategy = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true);
      expect(strategy.matches(makeFailure('network-timeout'))).toBe(true);
      expect(strategy.matches(makeFailure('unknown' as any))).toBe(false);
    });

    it('execute succeeds on first try', async () => {
      const strategy = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true, { maxAttempts: 1, backoffMs: 0 });
      const result = await strategy.execute(makeFailure());
      expect(result.success).toBe(true);
    });

    it('execute retries on failure', async () => {
      let calls = 0;
      const strategy = new RetryRecoveryStrategy('r', ['network-timeout'], async () => {
        calls++;
        return calls >= 2;
      }, { maxAttempts: 3, backoffMs: 0 });
      const result = await strategy.execute(makeFailure());
      expect(result.success).toBe(true);
      expect(calls).toBe(2);
    });

    it('execute fails after max attempts', async () => {
      const strategy = new RetryRecoveryStrategy('r', ['network-timeout'], async () => false, { maxAttempts: 2, backoffMs: 0 });
      const result = await strategy.execute(makeFailure());
      expect(result.success).toBe(false);
      expect(result.message).toContain('2 attempts');
    });
  });

  // ---- SkipRecoveryStrategy ----

  describe('SkipRecoveryStrategy', () => {
    it('always succeeds with skip action', async () => {
      const strategy = new SkipRecoveryStrategy(['api-rate-limit'] as any);
      const result = await strategy.execute(makeFailure('api-rate-limit'));
      expect(result.success).toBe(true);
      expect(result.nextAction).toBe('skip');
    });
  });

  // ---- EscalateRecoveryStrategy ----

  describe('EscalateRecoveryStrategy', () => {
    it('returns failure with escalation target', async () => {
      const strategy = new EscalateRecoveryStrategy(['network-timeout'], 'supervisor');
      const result = await strategy.execute(makeFailure());
      expect(result.success).toBe(false);
      expect(result.message).toContain('supervisor');
      expect(result.nextAction).toBe('escalate');
    });
  });

  // ---- NetworkTimeoutRecovery ----

  describe('NetworkTimeoutRecovery', () => {
    it('handles network-timeout type', () => {
      const strategy = new NetworkTimeoutRecovery(1, 0);
      expect(strategy.matches(makeFailure('network-timeout'))).toBe(true);
    });

    it('execute returns failure (template)', async () => {
      const strategy = new NetworkTimeoutRecovery(1, 0);
      const result = await strategy.execute(makeFailure());
      expect(result.success).toBe(false);
    });
  });

  // ---- RateLimitRecovery ----

  describe('RateLimitRecovery', () => {
    it('handles api-rate-limit type', () => {
      const strategy = new RateLimitRecovery();
      expect(strategy.matches(makeFailure('api-rate-limit'))).toBe(true);
    });
  });
});
