/**
 * Generation Analytics & Metrics
 *
 * Tracks and analyzes generation metrics:
 * - Success rates by adapter
 * - Confidence score distributions
 * - Code quality metrics
 * - Performance metrics
 * - User patterns and trends
 */

// =============================================================================
// TYPES
// =============================================================================

export interface GenerationMetrics {
  promptLength: number;
  codeLength: number;
  confidence: number;
  parseSuccess: boolean;
  errorCount: number;
  wasFixed: boolean;
  responseTimeMs: number;
  attemptsNeeded: number;
  adapterName: string;
  timestamp: Date;
  platform?: string;
}

export interface MetricsAggregate {
  totalGenerations: number;
  successRate: number;
  avgConfidence: number;
  avgResponseTime: number;
  avgErrorCount: number;
  avgAttemptsNeeded: number;
  mostCommonAdapter: string;
  mostCommonPlatform: string;
}

export interface AdapterMetrics {
  name: string;
  generationCount: number;
  successRate: number;
  avgConfidence: number;
  avgResponseTime: number;
  bestFor: string[];
  reliabilityScore: number; // 0-1
}

export interface TimeSeriesMetrics {
  timestamp: Date;
  successRate: number;
  avgConfidence: number;
  avgResponseTime: number;
  generationCount: number;
}

// =============================================================================
// ANALYTICS ENGINE
// =============================================================================

export class GenerationAnalytics {
  private metrics: GenerationMetrics[] = [];
  private timeSeriesWindow: number = 3600000; // 1 hour default

  /**
   * Record a generation metric
   */
  recordMetric(metric: GenerationMetrics): void {
    this.metrics.push({
      ...metric,
      timestamp: new Date(),
    });
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): GenerationMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get aggregate metrics
   */
  getAggregateMetrics(): MetricsAggregate {
    if (this.metrics.length === 0) {
      return {
        totalGenerations: 0,
        successRate: 0,
        avgConfidence: 0,
        avgResponseTime: 0,
        avgErrorCount: 0,
        avgAttemptsNeeded: 0,
        mostCommonAdapter: 'N/A',
        mostCommonPlatform: 'N/A',
      };
    }

    const successful = this.metrics.filter((m) => m.parseSuccess);
    const successRate = successful.length / this.metrics.length;

    const avgConfidence =
      this.metrics.reduce((sum, m) => sum + m.confidence, 0) / this.metrics.length;
    const avgResponseTime =
      this.metrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / this.metrics.length;
    const avgErrorCount =
      this.metrics.reduce((sum, m) => sum + m.errorCount, 0) / this.metrics.length;
    const avgAttemptsNeeded =
      this.metrics.reduce((sum, m) => sum + m.attemptsNeeded, 0) / this.metrics.length;

    // Most common adapter
    const adapterCounts = new Map<string, number>();
    this.metrics.forEach((m) => {
      adapterCounts.set(m.adapterName, (adapterCounts.get(m.adapterName) || 0) + 1);
    });
    const mostCommonAdapter =
      Array.from(adapterCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Most common platform
    const platformCounts = new Map<string, number>();
    this.metrics
      .filter((m) => m.platform)
      .forEach((m) => {
        if (m.platform) {
          platformCounts.set(m.platform, (platformCounts.get(m.platform) || 0) + 1);
        }
      });
    const mostCommonPlatform =
      Array.from(platformCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
      totalGenerations: this.metrics.length,
      successRate,
      avgConfidence,
      avgResponseTime,
      avgErrorCount,
      avgAttemptsNeeded,
      mostCommonAdapter,
      mostCommonPlatform,
    };
  }

  /**
   * Get metrics by adapter
   */
  getMetricsByAdapter(adapterName: string): AdapterMetrics {
    const adapterMetrics = this.metrics.filter((m) => m.adapterName === adapterName);

    if (adapterMetrics.length === 0) {
      return {
        name: adapterName,
        generationCount: 0,
        successRate: 0,
        avgConfidence: 0,
        avgResponseTime: 0,
        bestFor: [],
        reliabilityScore: 0,
      };
    }

    const successful = adapterMetrics.filter((m) => m.parseSuccess);
    const successRate = successful.length / adapterMetrics.length;

    const avgConfidence =
      adapterMetrics.reduce((sum, m) => sum + m.confidence, 0) / adapterMetrics.length;
    const avgResponseTime =
      adapterMetrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / adapterMetrics.length;

    // Determine what this adapter is best for
    const bestFor: string[] = [];
    if (successRate > 0.9) bestFor.push('high-accuracy');
    if (avgResponseTime < 2000) bestFor.push('fast');
    if (avgConfidence > 0.85) bestFor.push('confident');

    const reliabilityScore = (successRate + avgConfidence) / 2;

    return {
      name: adapterName,
      generationCount: adapterMetrics.length,
      successRate,
      avgConfidence,
      avgResponseTime,
      bestFor,
      reliabilityScore,
    };
  }

  /**
   * Get all adapter metrics
   */
  getAllAdapterMetrics(): AdapterMetrics[] {
    const adapters = new Set(this.metrics.map((m) => m.adapterName));
    return Array.from(adapters)
      .map((adapter) => this.getMetricsByAdapter(adapter))
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  }

  /**
   * Get confidence distribution
   */
  getConfidenceDistribution(): { range: string; count: number; percentage: number }[] {
    const ranges = [
      { name: '0.0-0.2', min: 0, max: 0.2 },
      { name: '0.2-0.4', min: 0.2, max: 0.4 },
      { name: '0.4-0.6', min: 0.4, max: 0.6 },
      { name: '0.6-0.8', min: 0.6, max: 0.8 },
      { name: '0.8-1.0', min: 0.8, max: 1.0 },
    ];

    const distribution = ranges.map((range) => {
      const count = this.metrics.filter(
        (m) => m.confidence >= range.min && m.confidence <= range.max
      ).length;
      return {
        range: range.name,
        count,
        percentage: (count / this.metrics.length) * 100,
      };
    });

    return distribution.filter((d) => d.count > 0);
  }

  /**
   * Get error patterns
   */
  getErrorPatterns(): { errorType: string; frequency: number; percentage: number }[] {
    const errorCounts = new Map<string, number>();

    this.metrics
      .filter((m) => m.errorCount > 0)
      .forEach((m) => {
        // Error types: parse, validation, timeout, etc.
        const errorType = m.wasFixed ? 'fixed' : 'unresolved';
        errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
      });

    const total = Array.from(errorCounts.values()).reduce((a, b) => a + b, 0);

    return Array.from(errorCounts.entries())
      .map(([errorType, frequency]) => ({
        errorType,
        frequency,
        percentage: (frequency / total) * 100,
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get response time distribution
   */
  getResponseTimeDistribution(): { range: string; count: number; percentage: number }[] {
    if (this.metrics.length === 0) return [];

    const maxTime = Math.max(...this.metrics.map((m) => m.responseTimeMs));
    const ranges = [
      { name: '0-500ms', min: 0, max: 500 },
      { name: '500ms-1s', min: 500, max: 1000 },
      { name: '1s-2s', min: 1000, max: 2000 },
      { name: '2s-5s', min: 2000, max: 5000 },
      { name: '5s+', min: 5000, max: maxTime + 1 },
    ];

    const distribution = ranges.map((range) => {
      const count = this.metrics.filter(
        (m) => m.responseTimeMs >= range.min && m.responseTimeMs <= range.max
      ).length;
      return {
        range: range.name,
        count,
        percentage: (count / this.metrics.length) * 100,
      };
    });

    return distribution.filter((d) => d.count > 0);
  }

  /**
   * Get time series metrics for a window
   */
  getTimeSeries(windowMs?: number): TimeSeriesMetrics[] {
    const window = windowMs || this.timeSeriesWindow;
    const now = Date.now();
    const cutoff = now - window;

    const relevantMetrics = this.metrics.filter((m) => m.timestamp.getTime() >= cutoff);

    if (relevantMetrics.length === 0) {
      return [];
    }

    // Group by 5-minute intervals
    const intervals = new Map<number, GenerationMetrics[]>();
    const intervalDuration = 5 * 60 * 1000; // 5 minutes

    relevantMetrics.forEach((m) => {
      const intervalStart = Math.floor(m.timestamp.getTime() / intervalDuration) * intervalDuration;
      if (!intervals.has(intervalStart)) {
        intervals.set(intervalStart, []);
      }
      intervals.get(intervalStart)!.push(m);
    });

    const timeSeries = Array.from(intervals.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, metrics]) => {
        const successful = metrics.filter((m) => m.parseSuccess);
        return {
          timestamp: new Date(timestamp),
          successRate: successful.length / metrics.length,
          avgConfidence: metrics.reduce((sum, m) => sum + m.confidence, 0) / metrics.length,
          avgResponseTime: metrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / metrics.length,
          generationCount: metrics.length,
        };
      });

    return timeSeries;
  }

  /**
   * Get recommendations based on metrics
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const aggregate = this.getAggregateMetrics();

    if (aggregate.successRate < 0.8) {
      recommendations.push(
        'Success rate is below 80%. Consider adjusting confidence thresholds or improving prompts.'
      );
    }

    if (aggregate.avgConfidence < 0.7) {
      recommendations.push(
        'Average confidence is low. Try using high-performing adapters like Anthropic or OpenAI.'
      );
    }

    if (aggregate.avgResponseTime > 5000) {
      recommendations.push(
        'Response times are slow. Consider using a cache to reduce redundant API calls.'
      );
    }

    if (aggregate.avgErrorCount > 1 && aggregate.avgAttemptsNeeded > 2) {
      recommendations.push('High error counts. Improving prompts or using auto-fix could help.');
    }

    const allAdapters = this.getAllAdapterMetrics();
    if (allAdapters.length > 1) {
      const best = allAdapters[0];
      const worst = allAdapters[allAdapters.length - 1];
      if (best.reliabilityScore > worst.reliabilityScore + 0.2) {
        recommendations.push(
          `${best.name} performs significantly better than ${worst.name}. Consider using it preferentially.`
        );
      }
    }

    return recommendations;
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    return JSON.stringify(
      {
        aggregate: this.getAggregateMetrics(),
        adapters: this.getAllAdapterMetrics(),
        confidenceDistribution: this.getConfidenceDistribution(),
        responseTimeDistribution: this.getResponseTimeDistribution(),
        errorPatterns: this.getErrorPatterns(),
        recommendations: this.getRecommendations(),
        exportedAt: new Date(),
      },
      null,
      2
    );
  }

  /**
   * Create a detailed report
   */
  generateReport(): string {
    const aggregate = this.getAggregateMetrics();
    const adapters = this.getAllAdapterMetrics();
    const confidenceDistribution = this.getConfidenceDistribution();
    const responseTimeDistribution = this.getResponseTimeDistribution();
    const recommendations = this.getRecommendations();

    let report = 'GENERATION ANALYTICS REPORT\n';
    report += '='.repeat(50) + '\n\n';

    report += 'SUMMARY\n';
    report += '-'.repeat(50) + '\n';
    report += `Total Generations: ${aggregate.totalGenerations}\n`;
    report += `Success Rate: ${(aggregate.successRate * 100).toFixed(1)}%\n`;
    report += `Avg Confidence: ${aggregate.avgConfidence.toFixed(2)}\n`;
    report += `Avg Response Time: ${aggregate.avgResponseTime.toFixed(0)}ms\n`;
    report += `Most Used Adapter: ${aggregate.mostCommonAdapter}\n\n`;

    report += 'ADAPTER PERFORMANCE\n';
    report += '-'.repeat(50) + '\n';
    adapters.forEach((adapter) => {
      report += `${adapter.name}:\n`;
      report += `  Generations: ${adapter.generationCount}\n`;
      report += `  Success Rate: ${(adapter.successRate * 100).toFixed(1)}%\n`;
      report += `  Reliability: ${(adapter.reliabilityScore * 100).toFixed(0)}%\n`;
      report += `  Avg Response: ${adapter.avgResponseTime.toFixed(0)}ms\n`;
      if (adapter.bestFor.length > 0) {
        report += `  Best For: ${adapter.bestFor.join(', ')}\n`;
      }
      report += '\n';
    });

    report += 'CONFIDENCE DISTRIBUTION\n';
    report += '-'.repeat(50) + '\n';
    confidenceDistribution.forEach((dist) => {
      report += `${dist.range}: ${dist.percentage.toFixed(1)}% (${dist.count})\n`;
    });
    report += '\n';

    report += 'RESPONSE TIME DISTRIBUTION\n';
    report += '-'.repeat(50) + '\n';
    responseTimeDistribution.forEach((dist) => {
      report += `${dist.range}: ${dist.percentage.toFixed(1)}% (${dist.count})\n`;
    });
    report += '\n';

    if (recommendations.length > 0) {
      report += 'RECOMMENDATIONS\n';
      report += '-'.repeat(50) + '\n';
      recommendations.forEach((rec, i) => {
        report += `${i + 1}. ${rec}\n`;
      });
    }

    return report;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Quick analytics creation
 */
export function createAnalytics(): GenerationAnalytics {
  return new GenerationAnalytics();
}
