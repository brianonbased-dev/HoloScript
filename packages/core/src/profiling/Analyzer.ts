/**
 * Performance Analyzer - Generates recommendations and insights from profiling data
 *
 * Analyzes ProfileResults to provide:
 * - Performance bottleneck detection
 * - Optimization recommendations
 * - Trend analysis
 * - Performance budget validation
 */

import type { ProfileResult, ProfileSummary, Hotspot, ProfileCategory } from './Profiler';

export type RecommendationSeverity = 'info' | 'warning' | 'critical';
export type RecommendationCategory = 'rendering' | 'memory' | 'network' | 'code' | 'parsing';

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  title: string;
  message: string;
  action?: string;
  documentation?: string;
  metric?: {
    name: string;
    value: number;
    threshold: number;
    unit: string;
  };
}

export interface PerformanceBudget {
  fps?: number;
  parseTime?: number; // ms
  compileTime?: number; // ms
  memoryLimit?: number; // bytes
  loadTime?: number; // ms
  networkLatency?: number; // ms
}

export interface BudgetViolation {
  metric: string;
  budget: number;
  actual: number;
  unit: string;
  overagePercent: number;
}

export interface TrendData {
  timestamps: number[];
  parseTime: number[];
  compileTime: number[];
  memoryUsage: number[];
  fps?: number[];
}

export interface TrendAnalysis {
  metric: string;
  trend: 'improving' | 'stable' | 'degrading';
  changePercent: number;
  forecast?: number;
}

export interface AnalysisResult {
  profileName: string;
  timestamp: string;
  duration: number;
  recommendations: Recommendation[];
  budgetViolations: BudgetViolation[];
  categoryAnalysis: Record<ProfileCategory, CategoryAnalysis>;
  overallScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface CategoryAnalysis {
  totalTime: number;
  percentage: number;
  mainContributors: Hotspot[];
  status: 'good' | 'warning' | 'critical';
}

// Thresholds for recommendations
const THRESHOLDS = {
  parseTime: { warning: 100, critical: 500 }, // ms
  compileTime: { warning: 200, critical: 1000 }, // ms
  memoryGrowth: { warning: 10 * 1024 * 1024, critical: 50 * 1024 * 1024 }, // 10MB, 50MB
  hotspotPercentage: { warning: 30, critical: 50 }, // % of total time
  categoryDominance: { warning: 60, critical: 80 }, // % of total time
};

/**
 * Performance Analyzer
 */
export class Analyzer {
  private defaultBudget: PerformanceBudget = {
    fps: 60,
    parseTime: 50,
    compileTime: 100,
    memoryLimit: 256 * 1024 * 1024, // 256MB
    loadTime: 2000,
    networkLatency: 100,
  };

  private history: ProfileResult[] = [];
  private maxHistorySize = 100;

  /**
   * Analyze a profile result and generate recommendations
   */
  analyze(profile: ProfileResult, budget?: PerformanceBudget): AnalysisResult {
    const effectiveBudget = { ...this.defaultBudget, ...budget };

    // Add to history for trend analysis
    this.addToHistory(profile);

    const recommendations = this.generateRecommendations(profile, effectiveBudget);
    const budgetViolations = this.checkBudget(profile, effectiveBudget);
    const categoryAnalysis = this.analyzeCategoryBreakdown(profile.summary);

    // Calculate overall score
    const score = this.calculateScore(profile, recommendations, budgetViolations);
    const grade = this.scoreToGrade(score);

    return {
      profileName: profile.name,
      timestamp: new Date().toISOString(),
      duration: profile.duration,
      recommendations,
      budgetViolations,
      categoryAnalysis,
      overallScore: score,
      grade,
    };
  }

  /**
   * Analyze trends over multiple profiles
   */
  analyzeTrends(): TrendAnalysis[] {
    if (this.history.length < 2) {
      return [];
    }

    const trends: TrendAnalysis[] = [];

    // Parse time trend
    const parseTimes = this.history.map((p) => p.summary.categoryBreakdown.parse);
    trends.push(this.calculateTrend('Parse Time', parseTimes));

    // Compile time trend
    const compileTimes = this.history.map((p) => p.summary.categoryBreakdown.compile);
    trends.push(this.calculateTrend('Compile Time', compileTimes));

    // Memory trend
    const memoryPeaks = this.history.map((p) => p.summary.memoryPeak);
    trends.push(this.calculateTrend('Memory Peak', memoryPeaks));

    // Total duration trend
    const durations = this.history.map((p) => p.duration);
    trends.push(this.calculateTrend('Total Duration', durations));

    return trends;
  }

  /**
   * Get historical data for visualization
   */
  getHistoricalData(): TrendData {
    return {
      timestamps: this.history.map((p) => p.startTime),
      parseTime: this.history.map((p) => p.summary.categoryBreakdown.parse),
      compileTime: this.history.map((p) => p.summary.categoryBreakdown.compile),
      memoryUsage: this.history.map((p) => p.summary.memoryPeak),
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Set default performance budget
   */
  setDefaultBudget(budget: Partial<PerformanceBudget>): void {
    this.defaultBudget = { ...this.defaultBudget, ...budget };
  }

  private addToHistory(profile: ProfileResult): void {
    this.history.push(profile);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  private generateRecommendations(
    profile: ProfileResult,
    _budget: PerformanceBudget
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const summary = profile.summary;
    let recommendationId = 1;

    // Check parse time
    if (summary.categoryBreakdown.parse > THRESHOLDS.parseTime.critical) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'critical',
        category: 'parsing',
        title: 'Slow parsing detected',
        message: `Parse time of ${summary.categoryBreakdown.parse.toFixed(2)}ms exceeds critical threshold of ${THRESHOLDS.parseTime.critical}ms.`,
        action: 'Consider using incremental parsing or breaking large files into smaller modules.',
        documentation: 'https://holoscript.net/docs/performance/parsing',
        metric: {
          name: 'Parse Time',
          value: summary.categoryBreakdown.parse,
          threshold: THRESHOLDS.parseTime.critical,
          unit: 'ms',
        },
      });
    } else if (summary.categoryBreakdown.parse > THRESHOLDS.parseTime.warning) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'warning',
        category: 'parsing',
        title: 'Parse time above optimal',
        message: `Parse time of ${summary.categoryBreakdown.parse.toFixed(2)}ms is above the recommended ${THRESHOLDS.parseTime.warning}ms.`,
        action: 'Review large trait definitions and consider lazy loading.',
        metric: {
          name: 'Parse Time',
          value: summary.categoryBreakdown.parse,
          threshold: THRESHOLDS.parseTime.warning,
          unit: 'ms',
        },
      });
    }

    // Check compile time
    if (summary.categoryBreakdown.compile > THRESHOLDS.compileTime.critical) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'critical',
        category: 'code',
        title: 'Slow compilation detected',
        message: `Compile time of ${summary.categoryBreakdown.compile.toFixed(2)}ms exceeds critical threshold.`,
        action: 'Enable incremental compilation. Profile hot paths before optimizing — the Rust/WASM parser is currently slower than the JS parser under V8 (see research/2026-04-19_todo-r2-wasm-bench-results.md).',
        documentation: 'https://holoscript.net/docs/performance/compilation',
        metric: {
          name: 'Compile Time',
          value: summary.categoryBreakdown.compile,
          threshold: THRESHOLDS.compileTime.critical,
          unit: 'ms',
        },
      });
    }

    // Check memory growth
    if (summary.memoryDelta > THRESHOLDS.memoryGrowth.critical) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'critical',
        category: 'memory',
        title: 'Memory leak suspected',
        message: `Memory grew by ${(summary.memoryDelta / 1024 / 1024).toFixed(2)}MB during profiling.`,
        action: 'Check for retained references in traits and dispose resources properly.',
        documentation: 'https://holoscript.net/docs/performance/memory',
        metric: {
          name: 'Memory Growth',
          value: summary.memoryDelta,
          threshold: THRESHOLDS.memoryGrowth.critical,
          unit: 'bytes',
        },
      });
    } else if (summary.memoryDelta > THRESHOLDS.memoryGrowth.warning) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'warning',
        category: 'memory',
        title: 'High memory usage',
        message: `Memory increased by ${(summary.memoryDelta / 1024 / 1024).toFixed(2)}MB.`,
        action: 'Consider using LOD (Level of Detail) for complex scenes.',
        metric: {
          name: 'Memory Growth',
          value: summary.memoryDelta,
          threshold: THRESHOLDS.memoryGrowth.warning,
          unit: 'bytes',
        },
      });
    }

    // Check hotspots
    if (summary.hotspots.length > 0) {
      const topHotspot = summary.hotspots[0];
      if (topHotspot.percentage > THRESHOLDS.hotspotPercentage.critical) {
        recommendations.push({
          id: `rec-${recommendationId++}`,
          severity: 'critical',
          category: 'code',
          title: 'Performance bottleneck detected',
          message: `"${topHotspot.name}" consumes ${topHotspot.percentage.toFixed(1)}% of total time.`,
          action: `Optimize "${topHotspot.name}" - consider caching, memoization, or algorithmic improvements.`,
          metric: {
            name: topHotspot.name,
            value: topHotspot.percentage,
            threshold: THRESHOLDS.hotspotPercentage.critical,
            unit: '%',
          },
        });
      } else if (topHotspot.percentage > THRESHOLDS.hotspotPercentage.warning) {
        recommendations.push({
          id: `rec-${recommendationId++}`,
          severity: 'warning',
          category: 'code',
          title: 'Potential optimization target',
          message: `"${topHotspot.name}" uses ${topHotspot.percentage.toFixed(1)}% of total time.`,
          action: 'Consider optimizing this function if it becomes a bottleneck.',
        });
      }
    }

    // Check for render-heavy profiles
    const renderPercent = (summary.categoryBreakdown.render / profile.duration) * 100;
    if (renderPercent > THRESHOLDS.categoryDominance.critical) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'warning',
        category: 'rendering',
        title: 'Render-bound workload',
        message: `Rendering takes ${renderPercent.toFixed(1)}% of total time.`,
        action: 'Consider using LOD, occlusion culling, or reducing draw calls.',
      });
    }

    // Add positive feedback if no issues
    if (recommendations.length === 0) {
      recommendations.push({
        id: `rec-${recommendationId++}`,
        severity: 'info',
        category: 'code',
        title: 'Performance is excellent',
        message: 'No performance issues detected. Your code is running optimally.',
      });
    }

    return recommendations;
  }

  private checkBudget(profile: ProfileResult, budget: PerformanceBudget): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const summary = profile.summary;

    if (budget.parseTime && summary.categoryBreakdown.parse > budget.parseTime) {
      violations.push({
        metric: 'Parse Time',
        budget: budget.parseTime,
        actual: summary.categoryBreakdown.parse,
        unit: 'ms',
        overagePercent:
          ((summary.categoryBreakdown.parse - budget.parseTime) / budget.parseTime) * 100,
      });
    }

    if (budget.compileTime && summary.categoryBreakdown.compile > budget.compileTime) {
      violations.push({
        metric: 'Compile Time',
        budget: budget.compileTime,
        actual: summary.categoryBreakdown.compile,
        unit: 'ms',
        overagePercent:
          ((summary.categoryBreakdown.compile - budget.compileTime) / budget.compileTime) * 100,
      });
    }

    if (budget.memoryLimit && summary.memoryPeak > budget.memoryLimit) {
      violations.push({
        metric: 'Memory Usage',
        budget: budget.memoryLimit,
        actual: summary.memoryPeak,
        unit: 'bytes',
        overagePercent: ((summary.memoryPeak - budget.memoryLimit) / budget.memoryLimit) * 100,
      });
    }

    if (budget.loadTime && profile.duration > budget.loadTime) {
      violations.push({
        metric: 'Total Duration',
        budget: budget.loadTime,
        actual: profile.duration,
        unit: 'ms',
        overagePercent: ((profile.duration - budget.loadTime) / budget.loadTime) * 100,
      });
    }

    return violations;
  }

  private analyzeCategoryBreakdown(
    summary: ProfileSummary
  ): Record<ProfileCategory, CategoryAnalysis> {
    const totalTime = Object.values(summary.categoryBreakdown).reduce((a, b) => a + b, 0);
    const result: Partial<Record<ProfileCategory, CategoryAnalysis>> = {};

    const categories: ProfileCategory[] = [
      'parse',
      'compile',
      'render',
      'network',
      'memory',
      'user',
      'gc',
    ];

    for (const category of categories) {
      const time = summary.categoryBreakdown[category];
      const percentage = totalTime > 0 ? (time / totalTime) * 100 : 0;

      // Find hotspots for this category
      const contributors = summary.hotspots.filter((h) => {
        const lowerName = h.name.toLowerCase();
        return (
          (category === 'parse' && lowerName.includes('parse')) ||
          (category === 'compile' &&
            (lowerName.includes('compile') || lowerName.includes('generate'))) ||
          (category === 'render' && (lowerName.includes('render') || lowerName.includes('draw'))) ||
          (category === 'network' &&
            (lowerName.includes('network') || lowerName.includes('fetch'))) ||
          (category === 'memory' &&
            (lowerName.includes('memory') || lowerName.includes('alloc'))) ||
          (category === 'gc' && (lowerName.includes('gc') || lowerName.includes('garbage')))
        );
      });

      let status: 'good' | 'warning' | 'critical' = 'good';
      if (percentage > THRESHOLDS.categoryDominance.critical) {
        status = 'critical';
      } else if (percentage > THRESHOLDS.categoryDominance.warning) {
        status = 'warning';
      }

      result[category] = {
        totalTime: time,
        percentage,
        mainContributors: contributors.slice(0, 3),
        status,
      };
    }

    return result as Record<ProfileCategory, CategoryAnalysis>;
  }

  private calculateScore(
    profile: ProfileResult,
    recommendations: Recommendation[],
    violations: BudgetViolation[]
  ): number {
    let score = 100;

    // Deduct for recommendations
    for (const rec of recommendations) {
      if (rec.severity === 'critical') score -= 20;
      else if (rec.severity === 'warning') score -= 10;
    }

    // Deduct for budget violations
    for (const violation of violations) {
      const deduction = Math.min(15, violation.overagePercent / 5);
      score -= deduction;
    }

    return Math.max(0, Math.min(100, score));
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private calculateTrend(metric: string, values: number[]): TrendAnalysis {
    if (values.length < 2) {
      return { metric, trend: 'stable', changePercent: 0 };
    }

    // Simple linear regression for trend
    const n = values.length;
    const xSum = (n * (n - 1)) / 2;
    const xSquaredSum = (n * (n - 1) * (2 * n - 1)) / 6;
    const ySum = values.reduce((a, b) => a + b, 0);
    const xySum = values.reduce((sum, y, i) => sum + i * y, 0);

    const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);

    // Calculate percent change from first to last
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const changePercent = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

    // Forecast next value
    const forecast = lastValue + slope;

    let trend: 'improving' | 'stable' | 'degrading';
    if (changePercent < -5) {
      trend = 'improving';
    } else if (changePercent > 5) {
      trend = 'degrading';
    } else {
      trend = 'stable';
    }

    return { metric, trend, changePercent, forecast: Math.max(0, forecast) };
  }
}

// Singleton instance
export const analyzer = new Analyzer();
