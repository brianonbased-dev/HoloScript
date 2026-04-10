/**
 * BaseRecoveryStrategy — Production Tests
 */
import { describe, it, expect } from 'vitest';
import {
  RetryRecoveryStrategy,
  SkipRecoveryStrategy,
  EscalateRecoveryStrategy,
  NetworkTimeoutRecovery,
  RateLimitRecovery,
} from '../BaseRecoveryStrategy';
import type { IAgentFailure } from '../AgentExtensionTypes';

function makeFailure(errorType = 'network-timeout' as const): IAgentFailure {
  return {
    errorType,
    message: 'test failure',
    timestamp: Date.now(),
    agentId: 'test-agent',
    taskId: 'task-1',
    retryCount: 0,
  };
}

describe('RetryRecoveryStrategy — construction', () => {
  it('id, handles, maxAttempts stored correctly', () => {
    const s = new RetryRecoveryStrategy('retry-a', ['network-timeout'], async () => true);
    expect(s.id).toBe('retry-a');
    expect(s.handles).toContain('network-timeout');
    expect(s.maxAttempts).toBe(3);
  });
  it('defaults: maxAttempts=3, backoffMs=1000', () => {
    const s = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true);
    expect(s.maxAttempts).toBe(3);
    expect(s.backoffMs).toBe(1000);
  });
  it('respects custom maxAttempts and backoffMs', () => {
    const s = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true, {
      maxAttempts: 1,
      backoffMs: 0,
    });
    expect(s.maxAttempts).toBe(1);
    expect(s.backoffMs).toBe(0);
  });
});

describe('RetryRecoveryStrategy — matches()', () => {
  it('returns true for matching failure type', () => {
    const s = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true);
    expect(s.matches(makeFailure('network-timeout'))).toBe(true);
  });
  it('returns false for non-matching failure type', () => {
    const s = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true);
    expect(s.matches(makeFailure('api-rate-limit'))).toBe(false);
  });
});

describe('RetryRecoveryStrategy — execute()', () => {
  it('succeeds on first try', async () => {
    const s = new RetryRecoveryStrategy('r', ['network-timeout'], async () => true, {
      maxAttempts: 3,
      backoffMs: 0,
    });
    const result = await s.execute(makeFailure());
    expect(result.success).toBe(true);
    expect(result.strategyUsed).toBe('r');
  });
  it('returns success=false after all attempts fail', async () => {
    const s = new RetryRecoveryStrategy('r', ['network-timeout'], async () => false, {
      maxAttempts: 2,
      backoffMs: 0,
    });
    const result = await s.execute(makeFailure());
    expect(result.success).toBe(false);
    expect(result.nextAction).toBe('escalate');
  });
  it('succeeds on second attempt', async () => {
    let calls = 0;
    const s = new RetryRecoveryStrategy(
      'r',
      ['network-timeout'],
      async () => {
        calls++;
        return calls >= 2;
      },
      { maxAttempts: 3, backoffMs: 0 }
    );
    const result = await s.execute(makeFailure());
    expect(result.success).toBe(true);
    expect(calls).toBe(2);
  });
});

describe('SkipRecoveryStrategy', () => {
  it('constructs with id=skip', () => {
    const s = new SkipRecoveryStrategy(['network-timeout']);
    expect(s.id).toBe('skip');
    expect(s.maxAttempts).toBe(1);
  });
  it('execute always returns success=true', async () => {
    const s = new SkipRecoveryStrategy(['network-timeout']);
    const r = await s.execute(makeFailure());
    expect(r.success).toBe(true);
    expect(r.strategyUsed).toBe('skip');
    expect(r.nextAction).toBe('skip');
  });
  it('matches failure types in handles array', () => {
    const s = new SkipRecoveryStrategy(['api-rate-limit', 'network-timeout']);
    expect(s.matches(makeFailure('api-rate-limit'))).toBe(true);
  });
});

describe('EscalateRecoveryStrategy', () => {
  it('constructs with id=escalate', () => {
    const s = new EscalateRecoveryStrategy(['network-timeout'], 'manager');
    expect(s.id).toBe('escalate');
  });
  it('execute returns success=false, nextAction=escalate', async () => {
    const s = new EscalateRecoveryStrategy(['network-timeout'], 'human-operator');
    const r = await s.execute(makeFailure());
    expect(r.success).toBe(false);
    expect(r.nextAction).toBe('escalate');
    expect(r.message).toContain('human-operator');
  });
  it('message contains errorType', async () => {
    const s = new EscalateRecoveryStrategy(['api-rate-limit'], 'ops');
    const r = await s.execute(makeFailure('api-rate-limit'));
    expect(r.message).toContain('api-rate-limit');
  });
});

describe('NetworkTimeoutRecovery', () => {
  it('constructs with id=network-timeout-recovery', () => {
    const s = new NetworkTimeoutRecovery();
    expect(s.id).toBe('network-timeout-recovery');
    expect(s.handles).toContain('network-timeout');
  });
  it('default maxAttempts=3', () => {
    expect(new NetworkTimeoutRecovery().maxAttempts).toBe(3);
  });
  it('custom maxAttempts / backoffMs', () => {
    const s = new NetworkTimeoutRecovery(2, 500);
    expect(s.maxAttempts).toBe(2);
    expect(s.backoffMs).toBe(500);
  });
  it('execute returns success=false (template — needs override)', async () => {
    const s = new NetworkTimeoutRecovery(1, 0);
    const r = await s.execute(makeFailure());
    expect(r.success).toBe(false);
  });
});

describe('RateLimitRecovery', () => {
  it('constructs with id=rate-limit-recovery', () => {
    const s = new RateLimitRecovery();
    expect(s.id).toBe('rate-limit-recovery');
    expect(s.handles).toContain('api-rate-limit');
  });
  it('maxAttempts=5 (more retries for rate limits)', () => {
    expect(new RateLimitRecovery().maxAttempts).toBe(5);
  });
  it('backoffMs=10000 (long back-off appropriate for rate limits)', () => {
    // execute() uses real delay — verified via property only to avoid 30s timeout
    expect(new RateLimitRecovery().backoffMs).toBe(10000);
  });
  it('matches api-rate-limit failures', () => {
    const s = new RateLimitRecovery();
    expect(s.matches(makeFailure('api-rate-limit'))).toBe(true);
    expect(s.matches(makeFailure('network-timeout'))).toBe(false);
  });
});
