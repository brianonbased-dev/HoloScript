/**
 * Pattern Learner
 *
 * Analyzes failure history to detect patterns and suggest strategies.
 */

import type { IAgentFailure, FailureType, FailurePattern } from '../extensions';

export interface PatternLearnerConfig {
  windowSize: number; // Number of recent failures to analyze
  frequencyThreshold: number; // Min occurrences to consider a pattern
  timeWindowMs: number; // Time window for recent patterns
}

const DEFAULT_CONFIG: PatternLearnerConfig = {
  windowSize: 100,
  frequencyThreshold: 3,
  timeWindowMs: 3600000, // 1 hour
};

export interface PatternAnalysis {
  topPatterns: FailurePattern[];
  recentTrend: 'increasing' | 'stable' | 'decreasing';
  suggestedActions: string[];
  healthScore: number; // 0-100
}

/**
 * Learns failure patterns from history
 */
export class PatternLearner {
  private config: PatternLearnerConfig;
  private failureHistory: IAgentFailure[] = [];
  private strategySuccessRates: Map<string, { successes: number; total: number }> = new Map();

  constructor(config: Partial<PatternLearnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a failure for pattern learning
   */
  recordFailure(failure: IAgentFailure): void {
    this.failureHistory.push(failure);

    // Trim to window size
    if (this.failureHistory.length > this.config.windowSize) {
      this.failureHistory = this.failureHistory.slice(-this.config.windowSize);
    }
  }

  /**
   * Record strategy outcome for learning
   */
  recordStrategyOutcome(strategyId: string, success: boolean): void {
    const stats = this.strategySuccessRates.get(strategyId) ?? { successes: 0, total: 0 };
    stats.total++;
    if (success) {
      stats.successes++;
    }
    this.strategySuccessRates.set(strategyId, stats);
  }

  /**
   * Detect failure patterns in history
   */
  detectPatterns(): FailurePattern[] {
    const now = Date.now();
    const recentFailures = this.failureHistory.filter(
      (f) => now - f.timestamp < this.config.timeWindowMs
    );

    // Group by error type
    const grouped = new Map<FailureType, IAgentFailure[]>();
    for (const failure of recentFailures) {
      const existing = grouped.get(failure.errorType) ?? [];
      existing.push(failure);
      grouped.set(failure.errorType, existing);
    }

    // Convert to patterns
    const patterns: FailurePattern[] = [];
    for (const [errorType, failures] of grouped) {
      if (failures.length >= this.config.frequencyThreshold) {
        const bestStrategy = this.findBestStrategy(errorType);
        patterns.push({
          pattern: `${errorType}:recurring`,
          errorType,
          frequency: failures.length,
          lastSeen: Math.max(...failures.map((f) => f.timestamp)),
          suggestedStrategy: bestStrategy,
          successRate: this.getStrategySuccessRate(bestStrategy),
        });
      }
    }

    // Sort by frequency (most common first)
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Analyze patterns and provide recommendations
   */
  analyze(): PatternAnalysis {
    const patterns = this.detectPatterns();
    const trend = this.calculateTrend();
    const healthScore = this.calculateHealthScore();

    const suggestedActions: string[] = [];

    // Generate suggestions based on patterns
    for (const pattern of patterns.slice(0, 3)) {
      if (pattern.successRate < 0.5) {
        suggestedActions.push(
          `Review strategy for ${pattern.errorType} (only ${Math.round(pattern.successRate * 100)}% success)`
        );
      }
      if (pattern.frequency >= 5) {
        suggestedActions.push(
          `Investigate root cause of ${pattern.errorType} (${pattern.frequency} occurrences)`
        );
      }
    }

    if (trend === 'increasing') {
      suggestedActions.push('System health degrading - consider scaling or manual intervention');
    }

    if (healthScore < 50) {
      suggestedActions.push('Low health score - review system stability');
    }

    return {
      topPatterns: patterns,
      recentTrend: trend,
      suggestedActions,
      healthScore,
    };
  }

  /**
   * Get suggested strategy for error type based on historical success
   */
  getSuggestedStrategy(errorType: FailureType): string | undefined {
    return this.findBestStrategy(errorType);
  }

  /**
   * Clear learning history
   */
  reset(): void {
    this.failureHistory = [];
    this.strategySuccessRates.clear();
  }

  // Private methods

  private findBestStrategy(errorType: FailureType): string {
    // Map error types to typical strategies
    const strategyMap: Record<FailureType, string> = {
      'network-timeout': 'network-retry',
      'api-rate-limit': 'circuit-breaker',
      'invalid-input': '',
      'storage-error': 'fallback-cache',
      'ai-service-error': 'circuit-breaker',
      'dependency-error': 'circuit-breaker',
      'memory-error': '',
      'type-error': '',
      'permission-error': '',
      unknown: '',
    };

    const defaultStrategy = strategyMap[errorType] || '';

    // Check if we have success data that suggests a different strategy
    let bestRate = this.getStrategySuccessRate(defaultStrategy);
    let bestStrategy = defaultStrategy;

    for (const [strategyId, stats] of this.strategySuccessRates) {
      if (stats.total >= 3) {
        // Minimum sample size
        const rate = stats.successes / stats.total;
        if (rate > bestRate) {
          bestRate = rate;
          bestStrategy = strategyId;
        }
      }
    }

    return bestStrategy;
  }

  private getStrategySuccessRate(strategyId: string): number {
    if (!strategyId) return 0;
    const stats = this.strategySuccessRates.get(strategyId);
    if (!stats || stats.total === 0) return 0.5; // Default 50%
    return stats.successes / stats.total;
  }

  private calculateTrend(): 'increasing' | 'stable' | 'decreasing' {
    if (this.failureHistory.length < 10) {
      return 'stable';
    }

    const now = Date.now();
    const halfWindow = this.config.timeWindowMs / 2;

    const recentCount = this.failureHistory.filter((f) => now - f.timestamp < halfWindow).length;

    const olderCount = this.failureHistory.filter(
      (f) => now - f.timestamp >= halfWindow && now - f.timestamp < this.config.timeWindowMs
    ).length;

    if (recentCount > olderCount * 1.5) {
      return 'increasing';
    } else if (recentCount < olderCount * 0.5) {
      return 'decreasing';
    }
    return 'stable';
  }

  private calculateHealthScore(): number {
    const now = Date.now();
    const recentFailures = this.failureHistory.filter(
      (f) => now - f.timestamp < this.config.timeWindowMs
    );

    if (recentFailures.length === 0) {
      return 100;
    }

    // Calculate score based on:
    // 1. Failure frequency (fewer = better)
    // 2. Severity distribution (lower severity = better)
    // 3. Recovery success rates

    // Frequency penalty
    const frequencyScore = Math.max(0, 100 - recentFailures.length * 5);

    // Severity penalty
    const severityCounts = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const failure of recentFailures) {
      severityCounts[failure.severity]++;
    }
    const severityPenalty =
      severityCounts.critical * 20 +
      severityCounts.high * 10 +
      severityCounts.medium * 5 +
      severityCounts.low * 1;
    const severityScore = Math.max(0, 100 - severityPenalty);

    // Average success rate
    let totalRate = 0;
    let rateCount = 0;
    for (const stats of this.strategySuccessRates.values()) {
      if (stats.total > 0) {
        totalRate += stats.successes / stats.total;
        rateCount++;
      }
    }
    const avgSuccessRate = rateCount > 0 ? totalRate / rateCount : 0.5;
    const successScore = avgSuccessRate * 100;

    // Weighted average
    return Math.round(frequencyScore * 0.3 + severityScore * 0.3 + successScore * 0.4);
  }
}
