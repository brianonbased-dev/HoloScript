/**
 * Self-Healing Service
 *
 * Implements ISelfHealingService for automatic failure recovery.
 * Features pattern learning, strategy dispatch, and escalation.
 */

import type {
  ISelfHealingService,
  IRecoveryStrategy,
  IAgentFailure,
  IRecoveryResult,
  FailurePattern,
  FailureType,
} from '../extensions';

export interface SelfHealingConfig {
  maxHistorySize: number;
  patternThreshold: number;
  escalationCallback?: (failureId: string, reason: string) => Promise<void>;
}

const DEFAULT_CONFIG: SelfHealingConfig = {
  maxHistorySize: 1000,
  patternThreshold: 3,
};

/**
 * Self-healing service with pattern learning and automatic recovery
 */
export class SelfHealingService implements ISelfHealingService {
  private config: SelfHealingConfig;
  private strategies: Map<string, IRecoveryStrategy> = new Map();
  private failures: Map<string, IAgentFailure> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private failureHistory: IAgentFailure[] = [];
  private patterns: Map<string, FailurePattern> = new Map();

  constructor(config: Partial<SelfHealingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: IRecoveryStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  /**
   * Unregister a strategy
   */
  unregisterStrategy(strategyId: string): boolean {
    return this.strategies.delete(strategyId);
  }

  /**
   * Get registered strategies
   */
  getStrategies(): IRecoveryStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Report a failure for tracking and potential recovery
   */
  async reportFailure(failure: IAgentFailure): Promise<string> {
    // Ensure failure has an ID
    const failureWithId: IAgentFailure = {
      ...failure,
      id: failure.id || this.generateId(),
      timestamp: failure.timestamp || Date.now(),
    };

    this.failures.set(failureWithId.id, failureWithId);
    this.recoveryAttempts.set(failureWithId.id, 0);

    // Track in history
    this.addToHistory(failureWithId);

    // Update patterns
    this.updatePatterns(failureWithId);

    return failureWithId.id;
  }

  /**
   * Attempt automatic recovery for a failure
   */
  async attemptRecovery(failureId: string): Promise<IRecoveryResult> {
    const failure = this.failures.get(failureId);

    if (!failure) {
      return {
        success: false,
        strategyUsed: 'none',
        message: `Failure ${failureId} not found`,
        retryRecommended: false,
        nextAction: 'skip',
      };
    }

    // Find matching strategy
    const strategy = this.findMatchingStrategy(failure);

    if (!strategy) {
      return {
        success: false,
        strategyUsed: 'none',
        message: `No strategy found for ${failure.errorType}`,
        retryRecommended: false,
        nextAction: 'escalate',
      };
    }

    // Check attempt count
    const attempts = this.recoveryAttempts.get(failureId) ?? 0;
    if (attempts >= strategy.maxAttempts) {
      return {
        success: false,
        strategyUsed: strategy.id,
        message: `Max recovery attempts (${strategy.maxAttempts}) exceeded`,
        retryRecommended: false,
        nextAction: 'escalate',
      };
    }

    // Apply backoff if not first attempt
    if (attempts > 0 && strategy.backoffMs > 0) {
      const backoff = strategy.backoffMs * Math.pow(2, attempts - 1);
      await this.sleep(backoff);
    }

    // Execute recovery
    this.recoveryAttempts.set(failureId, attempts + 1);

    try {
      const result = await strategy.execute(failure);

      // Update pattern success rate
      this.updatePatternSuccessRate(failure.errorType, result.success);

      // Clean up on success
      if (result.success) {
        this.failures.delete(failureId);
        this.recoveryAttempts.delete(failureId);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        strategyUsed: strategy.id,
        message: error instanceof Error ? error.message : 'Recovery failed',
        retryRecommended: attempts + 1 < strategy.maxAttempts,
        nextAction: attempts + 1 < strategy.maxAttempts ? 'retry' : 'escalate',
      };
    }
  }

  /**
   * Get failure patterns for analysis
   */
  getFailurePatterns(agentId?: string): FailurePattern[] {
    const allPatterns = Array.from(this.patterns.values());

    if (!agentId) {
      return allPatterns;
    }

    // Filter patterns that apply to specific agent
    return allPatterns.filter((pattern) => {
      const relevantFailures = this.failureHistory.filter(
        (f) => f.agentId === agentId && f.errorType === pattern.errorType
      );
      return relevantFailures.length > 0;
    });
  }

  /**
   * Escalate failure to supervisor/human
   */
  async escalate(failureId: string, reason: string): Promise<void> {
    const failure = this.failures.get(failureId);

    if (this.config.escalationCallback) {
      await this.config.escalationCallback(failureId, reason);
    }

    // Mark as escalated (don't delete, but prevent further auto-recovery)
    if (failure) {
      this.recoveryAttempts.set(failureId, Infinity);
    }
  }

  /**
   * Get a specific failure by ID
   */
  getFailure(failureId: string): IAgentFailure | undefined {
    return this.failures.get(failureId);
  }

  /**
   * Get all active (unresolved) failures
   */
  getActiveFailures(): IAgentFailure[] {
    return Array.from(this.failures.values());
  }

  /**
   * Get suggested strategy for a failure type
   */
  getSuggestedStrategy(errorType: FailureType): IRecoveryStrategy | undefined {
    const pattern = this.patterns.get(errorType);

    if (pattern?.suggestedStrategy) {
      return this.strategies.get(pattern.suggestedStrategy);
    }

    // Return first matching strategy
    for (const strategy of this.strategies.values()) {
      if (strategy.handles.includes(errorType)) {
        return strategy;
      }
    }

    return undefined;
  }

  /**
   * Clear failure history
   */
  clearHistory(): void {
    this.failureHistory = [];
    this.patterns.clear();
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.failures.clear();
    this.recoveryAttempts.clear();
    this.failureHistory = [];
    this.patterns.clear();
  }

  // Private methods

  private findMatchingStrategy(failure: IAgentFailure): IRecoveryStrategy | undefined {
    // First check for pattern-suggested strategy
    const pattern = this.patterns.get(failure.errorType);
    if (pattern?.suggestedStrategy) {
      const suggested = this.strategies.get(pattern.suggestedStrategy);
      if (suggested?.matches(failure)) {
        return suggested;
      }
    }

    // Find best matching strategy by success rate
    let bestStrategy: IRecoveryStrategy | undefined;
    let bestSuccessRate = -1;

    for (const strategy of this.strategies.values()) {
      if (strategy.matches(failure)) {
        const patternsForStrategy = Array.from(this.patterns.values()).filter(
          (p) => p.suggestedStrategy === strategy.id
        );

        const avgSuccessRate =
          patternsForStrategy.length > 0
            ? patternsForStrategy.reduce((sum, p) => sum + p.successRate, 0) /
              patternsForStrategy.length
            : 0.5; // Default to 50% if no history

        if (avgSuccessRate > bestSuccessRate) {
          bestSuccessRate = avgSuccessRate;
          bestStrategy = strategy;
        }
      }
    }

    return bestStrategy;
  }

  private addToHistory(failure: IAgentFailure): void {
    this.failureHistory.push(failure);

    // Trim history if needed
    if (this.failureHistory.length > this.config.maxHistorySize) {
      this.failureHistory = this.failureHistory.slice(-this.config.maxHistorySize);
    }
  }

  private updatePatterns(failure: IAgentFailure): void {
    const key = failure.errorType;
    const existing = this.patterns.get(key);

    if (existing) {
      existing.frequency++;
      existing.lastSeen = failure.timestamp;
    } else {
      // Create new pattern
      const suggestedStrategy = this.findStrategyForType(failure.errorType);

      this.patterns.set(key, {
        pattern: `${failure.errorType}:${failure.agentId}`,
        errorType: failure.errorType,
        frequency: 1,
        lastSeen: failure.timestamp,
        suggestedStrategy: suggestedStrategy?.id ?? '',
        successRate: 0.5, // Start at 50%
      });
    }
  }

  private updatePatternSuccessRate(errorType: FailureType, success: boolean): void {
    const pattern = this.patterns.get(errorType);

    if (pattern) {
      // Exponential moving average
      const alpha = 0.3;
      pattern.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * pattern.successRate;
    }
  }

  private findStrategyForType(errorType: FailureType): IRecoveryStrategy | undefined {
    for (const strategy of this.strategies.values()) {
      if (strategy.handles.includes(errorType)) {
        return strategy;
      }
    }
    return undefined;
  }

  private generateId(): string {
    return `failure-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
