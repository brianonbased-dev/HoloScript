import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelfHealingService } from '../../recovery/SelfHealingService';
import type { IAgentFailure, IRecoveryStrategy, IRecoveryResult } from '../../extensions';

function makeFailure(overrides: Partial<IAgentFailure> = {}): IAgentFailure {
  return {
    id: '',
    agentId: 'agent-A',
    errorType: 'network-timeout',
    message: 'timed out',
    severity: 'medium',
    timestamp: Date.now(),
    context: {},
    ...overrides,
  };
}

function makeStrategy(id: string, handles: IAgentFailure['errorType'][], executeResult: Partial<IRecoveryResult> = {}): IRecoveryStrategy {
  return {
    id,
    handles,
    maxAttempts: 3,
    backoffMs: 0,
    matches: (f) => handles.includes(f.errorType),
    execute: vi.fn().mockResolvedValue({
      success: true,
      strategyUsed: id,
      message: `${id} succeeded`,
      retryRecommended: false,
      nextAction: undefined,
      ...executeResult,
    }),
  };
}

describe('SelfHealingService — Production Tests', () => {
  let svc: SelfHealingService;

  beforeEach(() => {
    svc = new SelfHealingService();
  });

  describe('registerStrategy() / getStrategies()', () => {
    it('registers a strategy', () => {
      svc.registerStrategy(makeStrategy('s1', ['network-timeout']));
      expect(svc.getStrategies().length).toBe(1);
    });

    it('multiple strategies are all registered', () => {
      svc.registerStrategy(makeStrategy('s1', ['network-timeout']));
      svc.registerStrategy(makeStrategy('s2', ['api-rate-limit']));
      expect(svc.getStrategies().length).toBe(2);
    });
  });

  describe('unregisterStrategy()', () => {
    it('removes a registered strategy', () => {
      svc.registerStrategy(makeStrategy('s1', ['network-timeout']));
      svc.unregisterStrategy('s1');
      expect(svc.getStrategies().length).toBe(0);
    });

    it('returns false for non-existent strategy', () => {
      expect(svc.unregisterStrategy('ghost')).toBe(false);
    });
  });

  describe('reportFailure()', () => {
    it('tracks the failure and returns an id', async () => {
      const id = await svc.reportFailure(makeFailure());
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('preserves provided id', async () => {
      const id = await svc.reportFailure(makeFailure({ id: 'explicit-id' }));
      expect(id).toBe('explicit-id');
    });

    it('failure is retrievable via getFailure()', async () => {
      const id = await svc.reportFailure(makeFailure({ id: 'fail-X' }));
      const f = svc.getFailure(id);
      expect(f).toBeDefined();
      expect(f!.errorType).toBe('network-timeout');
    });

    it('appears in getActiveFailures()', async () => {
      await svc.reportFailure(makeFailure({ id: 'fail-Y' }));
      expect(svc.getActiveFailures().some(f => f.id === 'fail-Y')).toBe(true);
    });
  });

  describe('attemptRecovery()', () => {
    it('returns not-found result for unknown failure id', async () => {
      const result = await svc.attemptRecovery('unknown');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not found/i);
    });

    it('returns escalate when no strategy matches', async () => {
      const id = await svc.reportFailure(makeFailure({ errorType: 'type-error' }));
      const result = await svc.attemptRecovery(id);
      expect(result.success).toBe(false);
      expect(result.nextAction).toBe('escalate');
    });

    it('calls matching strategy execute', async () => {
      const strategy = makeStrategy('retry', ['network-timeout']);
      svc.registerStrategy(strategy);
      const id = await svc.reportFailure(makeFailure());
      const result = await svc.attemptRecovery(id);
      expect(result.success).toBe(true);
      expect(strategy.execute).toHaveBeenCalledOnce();
    });

    it('removes failure from active set on success', async () => {
      svc.registerStrategy(makeStrategy('retry', ['network-timeout']));
      const id = await svc.reportFailure(makeFailure({ id: 'resolved' }));
      await svc.attemptRecovery(id);
      expect(svc.getFailure('resolved')).toBeUndefined();
    });

    it('escalates after maxAttempts exceeded', async () => {
      const strategy = makeStrategy('retry', ['network-timeout'], { success: false });
      strategy.maxAttempts = 2;
      svc.registerStrategy(strategy);
      const id = await svc.reportFailure(makeFailure());
      await svc.attemptRecovery(id); // attempt 1
      await svc.attemptRecovery(id); // attempt 2
      const result = await svc.attemptRecovery(id); // attempt 3 — exceeds
      expect(result.success).toBe(false);
      expect(result.nextAction).toBe('escalate');
    });
  });

  describe('getFailurePatterns()', () => {
    it('returns empty array with no failures', () => {
      expect(svc.getFailurePatterns()).toEqual([]);
    });

    it('returns pattern after failure reported', async () => {
      await svc.reportFailure(makeFailure());
      const patterns = svc.getFailurePatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('filters by agentId', async () => {
      await svc.reportFailure(makeFailure({ id: 'f1', agentId: 'agent-A' }));
      await svc.reportFailure(makeFailure({ id: 'f2', agentId: 'agent-B', errorType: 'api-rate-limit' }));
      const agentAPatterns = svc.getFailurePatterns('agent-A');
      expect(agentAPatterns.every(p => p.errorType === 'network-timeout')).toBe(true);
    });
  });

  describe('getSuggestedStrategy()', () => {
    it('returns defined strategy when one matches error type', async () => {
      const strategy = makeStrategy('retry', ['network-timeout']);
      svc.registerStrategy(strategy);
      await svc.reportFailure(makeFailure());
      const suggested = svc.getSuggestedStrategy('network-timeout');
      expect(suggested).toBeDefined();
      expect(suggested!.id).toBe('retry');
    });

    it('returns undefined when no strategy handles the error type', () => {
      expect(svc.getSuggestedStrategy('type-error')).toBeUndefined();
    });
  });

  describe('escalate()', () => {
    it('calls escalationCallback with failureId and reason', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const svcWithCb = new SelfHealingService({ escalationCallback: callback });
      const id = await svcWithCb.reportFailure(makeFailure({ id: 'esc-1' }));
      await svcWithCb.escalate(id, 'too many retries');
      expect(callback).toHaveBeenCalledWith('esc-1', 'too many retries');
    });

    it('does not throw when no escalationCallback configured', async () => {
      const id = await svc.reportFailure(makeFailure({ id: 'esc-2' }));
      await expect(svc.escalate(id, 'reason')).resolves.not.toThrow();
    });

    it('prevents further auto-recovery after escalation', async () => {
      const strategy = makeStrategy('retry', ['network-timeout']);
      svc.registerStrategy(strategy);
      const id = await svc.reportFailure(makeFailure({ id: 'esc-3' }));
      await svc.escalate(id, 'manual intervention needed');
      const result = await svc.attemptRecovery(id);
      // attempts=Infinity >= maxAttempts=3, so will escalate again
      expect(result.nextAction).toBe('escalate');
    });
  });

  describe('clearHistory() / reset()', () => {
    it('clearHistory() clears patterns but not active failures', async () => {
      await svc.reportFailure(makeFailure({ id: 'f1' }));
      svc.clearHistory();
      expect(svc.getFailurePatterns()).toEqual([]);
      // Active failures still tracked
      expect(svc.getFailure('f1')).toBeDefined();
    });

    it('reset() clears everything', async () => {
      svc.registerStrategy(makeStrategy('s1', ['network-timeout']));
      await svc.reportFailure(makeFailure({ id: 'f2' }));
      svc.reset();
      expect(svc.getActiveFailures().length).toBe(0);
      expect(svc.getFailurePatterns().length).toBe(0);
    });
  });
});
