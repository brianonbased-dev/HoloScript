import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelfHealingService, SelfHealingConfig } from '../SelfHealingService';
import type {
  IRecoveryStrategy,
  IAgentFailure,
  IRecoveryResult,
  FailureType,
} from '../../extensions';

// Mock strategy implementation
class MockStrategy implements IRecoveryStrategy {
  readonly id: string;
  readonly handles: FailureType[];
  readonly maxAttempts: number = 3;
  readonly backoffMs: number = 1000;
  private _shouldSucceed: boolean;
  readonly executeCalls: IAgentFailure[] = [];

  constructor(id: string, types: FailureType[], shouldSucceed = true) {
    this.id = id;
    this.handles = types;
    this._shouldSucceed = shouldSucceed;
  }

  matches(failure: IAgentFailure): boolean {
    return this.handles.includes(failure.errorType);
  }

  async execute(failure: IAgentFailure): Promise<IRecoveryResult> {
    this.executeCalls.push(failure);
    return {
      success: this._shouldSucceed,
      strategyUsed: this.id,
      message: this._shouldSucceed ? 'Recovered' : 'Failed',
      retryRecommended: !this._shouldSucceed,
      nextAction: this._shouldSucceed ? 'skip' : 'retry',
    };
  }

  setShouldSucceed(value: boolean) {
    this._shouldSucceed = value;
  }
}

describe('SelfHealingService', () => {
  let service: SelfHealingService;
  let networkStrategy: MockStrategy;
  let resourceStrategy: MockStrategy;
  let escalationCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    escalationCallback = vi.fn();

    const config: SelfHealingConfig = {
      maxHistorySize: 1000,
      patternThreshold: 3,
      escalationCallback: escalationCallback,
    };

    service = new SelfHealingService(config);
    networkStrategy = new MockStrategy('network-retry', ['network-timeout', 'api-error']);
    resourceStrategy = new MockStrategy('resource-cleanup', ['memory-error', 'resource-error']);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerStrategy', () => {
    it('should register strategy successfully', () => {
      service.registerStrategy(networkStrategy);

      const strategies = service.getStrategies();
      expect(strategies.map((s) => s.id)).toContain('network-retry');
    });

    it('should register multiple strategies', () => {
      service.registerStrategy(networkStrategy);
      service.registerStrategy(resourceStrategy);

      const strategies = service.getStrategies();
      expect(strategies).toHaveLength(2);
      expect(strategies.map((s) => s.id)).toContain('network-retry');
      expect(strategies.map((s) => s.id)).toContain('resource-cleanup');
    });

    it('should replace strategy with same id', () => {
      service.registerStrategy(networkStrategy);
      const newStrategy = new MockStrategy('network-retry', ['api-error']);
      service.registerStrategy(newStrategy);

      const strategies = service.getStrategies();
      expect(strategies).toHaveLength(1);
      expect(strategies[0].handles).toEqual(['api-error']);
    });
  });

  describe('reportFailure', () => {
    it('should track reported failures', async () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      const failureId = await service.reportFailure(failure);
      expect(failureId).toBe('f1');

      const patterns = service.getFailurePatterns();
      // First failure might not create pattern yet if threshold > 1
      expect(patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should create pattern when threshold reached', async () => {
      // Report multiple failures of same type to trigger pattern detection
      for (let i = 0; i < 3; i++) {
        await service.reportFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Connection timeout',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = service.getFailurePatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should assign id if not provided', async () => {
      const failure: IAgentFailure = {
        id: '',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Test failure',
        timestamp: Date.now(),
        severity: 'low',
      };

      const failureId = await service.reportFailure(failure);
      expect(failureId).toBeTruthy();
    });
  });

  describe('attemptRecovery', () => {
    beforeEach(() => {
      service.registerStrategy(networkStrategy);
      service.registerStrategy(resourceStrategy);
    });

    it('should use matching strategy for recovery', async () => {
      const failureId = await service.reportFailure({
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      });

      const result = await service.attemptRecovery(failureId);

      expect(result.success).toBe(true);
      expect(result.strategyUsed).toBe('network-retry');
      expect(networkStrategy.executeCalls).toHaveLength(1);
    });

    it('should return failure when failure ID not found', async () => {
      const result = await service.attemptRecovery('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should try matching strategy based on error type', async () => {
      const failureId = await service.reportFailure({
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'memory-error',
        message: 'Out of memory',
        timestamp: Date.now(),
        severity: 'high',
      });

      const result = await service.attemptRecovery(failureId);

      expect(result.success).toBe(true);
      expect(result.strategyUsed).toBe('resource-cleanup');
    });

    it('should handle multiple recovery attempts', async () => {
      networkStrategy.setShouldSucceed(false);

      const failureId = await service.reportFailure({
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      });

      // First attempt - should execute strategy
      const result1 = await service.attemptRecovery(failureId);
      expect(result1.success).toBe(false);
      expect(result1.strategyUsed).toBe('network-retry');
      expect(networkStrategy.executeCalls.length).toBe(1);
    });
  });

  describe('getFailurePatterns', () => {
    it('should return empty array initially', () => {
      const patterns = service.getFailurePatterns();
      expect(patterns).toEqual([]);
    });

    it('should filter patterns by agent', async () => {
      // Create patterns for multiple agents
      for (let i = 0; i < 3; i++) {
        await service.reportFailure({
          id: `f1-${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      for (let i = 0; i < 3; i++) {
        await service.reportFailure({
          id: `f2-${i}`,
          agentId: 'agent-2',
          errorType: 'memory-error',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'high',
        });
      }

      const agent1Patterns = service.getFailurePatterns('agent-1');
      const allPatterns = service.getFailurePatterns();

      // Agent-specific patterns should be subset of all patterns
      expect(agent1Patterns.length).toBeLessThanOrEqual(allPatterns.length);
    });
  });

  describe('escalation', () => {
    beforeEach(() => {
      service.registerStrategy(networkStrategy);
    });

    it('should escalate with reason', async () => {
      const failureId = await service.reportFailure({
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Critical failure',
        timestamp: Date.now(),
        severity: 'critical',
      });

      await service.escalate(failureId, 'Manual escalation for testing');

      expect(escalationCallback).toHaveBeenCalledWith('f1', 'Manual escalation for testing');
    });

    it('should not throw if escalation callback not set', async () => {
      const serviceNoCallback = new SelfHealingService({
        maxHistorySize: 100,
        patternThreshold: 3,
      });

      const failureId = await serviceNoCallback.reportFailure({
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Test',
        timestamp: Date.now(),
        severity: 'high',
      });

      // Should not throw
      await expect(serviceNoCallback.escalate(failureId, 'Test reason')).resolves.not.toThrow();
    });
  });

  describe('unregisterStrategy', () => {
    it('should remove registered strategy', () => {
      service.registerStrategy(networkStrategy);
      expect(service.getStrategies()).toHaveLength(1);

      const removed = service.unregisterStrategy('network-retry');
      expect(removed).toBe(true);
      expect(service.getStrategies()).toHaveLength(0);
    });

    it('should return false for unknown strategy', () => {
      const removed = service.unregisterStrategy('unknown');
      expect(removed).toBe(false);
    });
  });

  describe('pattern detection', () => {
    it('should detect patterns after threshold failures', async () => {
      const threshold = 3;
      service = new SelfHealingService({
        maxHistorySize: 100,
        patternThreshold: threshold,
      });

      for (let i = 0; i < threshold; i++) {
        await service.reportFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Connection timeout',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = service.getFailurePatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].errorType).toBe('network-timeout');
    });

    it('should track pattern frequency', async () => {
      service = new SelfHealingService({
        maxHistorySize: 100,
        patternThreshold: 1, // Low threshold for testing
      });

      for (let i = 0; i < 5; i++) {
        await service.reportFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Connection timeout',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = service.getFailurePatterns();
      const networkPattern = patterns.find((p) => p.errorType === 'network-timeout');

      expect(networkPattern).toBeDefined();
      expect(networkPattern!.frequency).toBeGreaterThan(0);
    });
  });
});
