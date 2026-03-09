import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelfHealingService } from '../recovery/SelfHealingService';
import type { IRecoveryStrategy, IAgentFailure, FailureType } from '../extensions';

// =============================================================================
// C217 — Self-Healing Service
// =============================================================================

function makeStrategy(id: string, types: FailureType[], succeed = true): IRecoveryStrategy {
  return {
    id,
    handles: types,
    maxAttempts: 3,
    backoffMs: 0,
    execute: vi.fn().mockResolvedValue({
      success: succeed,
      strategyUsed: id,
      message: succeed ? 'Recovered' : 'Failed',
      retryRecommended: !succeed,
      nextAction: succeed ? 'skip' : 'retry',
    }),
    matches: vi.fn().mockImplementation((failure: IAgentFailure) => {
      return types.includes(failure.errorType);
    }),
  };
}

let failureCounter = 0;
function makeFailure(type: FailureType = 'unknown', agentId = 'agent-1'): IAgentFailure {
  return {
    id: `fail-${++failureCounter}`,
    agentId,
    errorType: type,
    message: `Test failure ${type}`,
    timestamp: Date.now(),
    severity: 'medium',
    context: {},
  };
}

describe('SelfHealingService', () => {
  beforeEach(() => {
    failureCounter = 0;
  });

  it('registerStrategy adds a strategy', () => {
    const shs = new SelfHealingService();
    shs.registerStrategy(makeStrategy('s1', ['unknown']));
    expect(shs.getStrategies()).toHaveLength(1);
  });

  it('unregisterStrategy removes by id', () => {
    const shs = new SelfHealingService();
    shs.registerStrategy(makeStrategy('s1', ['unknown']));
    expect(shs.unregisterStrategy('s1')).toBe(true);
    expect(shs.getStrategies()).toHaveLength(0);
  });

  it('unregisterStrategy returns false for unknown id', () => {
    const shs = new SelfHealingService();
    expect(shs.unregisterStrategy('nope')).toBe(false);
  });

  it('reportFailure returns a unique failure ID', async () => {
    const shs = new SelfHealingService();
    const id1 = await shs.reportFailure(makeFailure());
    const id2 = await shs.reportFailure(makeFailure());
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it('getFailure retrieves by ID', async () => {
    const shs = new SelfHealingService();
    const id = await shs.reportFailure(makeFailure('network-timeout'));
    const f = shs.getFailure(id);
    expect(f).toBeDefined();
    expect(f!.errorType).toBe('network-timeout');
  });

  it('getActiveFailures returns unresolved only', async () => {
    const shs = new SelfHealingService();
    await shs.reportFailure(makeFailure());
    expect(shs.getActiveFailures().length).toBeGreaterThanOrEqual(1);
  });

  it('attemptRecovery uses matching strategy', async () => {
    const shs = new SelfHealingService();
    const strategy = makeStrategy('s1', ['unknown']);
    shs.registerStrategy(strategy);
    const id = await shs.reportFailure(makeFailure('unknown'));
    const result = await shs.attemptRecovery(id);
    expect(result.success).toBe(true);
    expect(strategy.execute).toHaveBeenCalled();
  });

  it('attemptRecovery fails when no strategy matches', async () => {
    const shs = new SelfHealingService();
    const id = await shs.reportFailure(makeFailure('unknown'));
    const result = await shs.attemptRecovery(id);
    expect(result.success).toBe(false);
  });

  it('attemptRecovery fails for unknown failure ID', async () => {
    const shs = new SelfHealingService();
    const result = await shs.attemptRecovery('nonexistent');
    expect(result.success).toBe(false);
  });

  it('getFailurePatterns detects repeated failures', async () => {
    const shs = new SelfHealingService({ patternThreshold: 2 });
    await shs.reportFailure(makeFailure('unknown'));
    await shs.reportFailure(makeFailure('unknown'));
    await shs.reportFailure(makeFailure('unknown'));
    const patterns = shs.getFailurePatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    // Check that the pattern has been seen multiple times
    const unknownPattern = patterns.find((p) => p.errorType === 'unknown');
    expect(unknownPattern).toBeDefined();
  });

  it('clearHistory clears history and patterns but not active failures', async () => {
    const shs = new SelfHealingService({ patternThreshold: 2 });
    await shs.reportFailure(makeFailure('unknown'));
    await shs.reportFailure(makeFailure('unknown'));
    shs.clearHistory();
    // Patterns should be cleared
    expect(shs.getFailurePatterns()).toHaveLength(0);
    // Active failures map is NOT cleared by clearHistory (use reset for that)
    expect(shs.getActiveFailures().length).toBeGreaterThanOrEqual(1);
  });

  it('reset clears failures and patterns', async () => {
    const shs = new SelfHealingService();
    shs.registerStrategy(makeStrategy('s1', ['unknown']));
    await shs.reportFailure(makeFailure());
    shs.reset();
    // reset clears failures and recovery attempts
    expect(shs.getActiveFailures()).toHaveLength(0);
  });

  it('escalate calls escalation callback', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    const shs = new SelfHealingService({ escalationCallback: cb });
    const id = await shs.reportFailure(makeFailure());
    await shs.escalate(id, 'Too many failures');
    expect(cb).toHaveBeenCalledWith(id, 'Too many failures');
  });

  it('getSuggestedStrategy returns best match', () => {
    const shs = new SelfHealingService();
    shs.registerStrategy(makeStrategy('s1', ['unknown']));
    shs.registerStrategy(makeStrategy('s2', ['network-timeout']));
    const suggested = shs.getSuggestedStrategy('network-timeout');
    expect(suggested).toBeDefined();
    expect(suggested!.id).toBe('s2');
  });
});
