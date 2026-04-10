/**
 * PerformanceReportGenerator
 * Generates comprehensive performance reports from collected metrics
 */

import { PerformanceTracker } from './PerformanceTracker';
import * as fs from 'fs';
import * as path from 'path';

export interface PerformanceReport {
  timestamp: string;
  totalMetrics: number;
  summary: {
    categories: {
      [category: string]: {
        count: number;
        avgValue: number;
        minValue: number;
        maxValue: number;
        metrics: Array<{
          name: string;
          value: number;
          unit: string;
        }>;
      };
    };
  };
  recommendations: string[];
  rawMetrics: Map<string, number[]>;
}

/**
 * Generator for performance reports
 */
export class PerformanceReportGenerator {
  constructor(private tracker: PerformanceTracker) {}

  /**
   * Generate a comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const metrics = this.tracker.getAllMetrics();
    const categories = this.organizeMetricsbyCategory(metrics);
    const recommendations = this.generateRecommendations(categories);

    return {
      timestamp: new Date().toISOString(),
      totalMetrics: Array.from(metrics.values() as IterableIterator<number[]>).reduce(
        (sum, values) => sum + values.length,
        0
      ),
      summary: {
        categories,
      },
      recommendations,
      rawMetrics: metrics,
    };
  }

  /**
   * Organize metrics by category (e.g., Parser, Compiler, etc.)
   */
  private organizeMetricsbyCategory(metrics: Map<string, number[]>) {
    const categories: {
      [category: string]: {
        count: number;
        avgValue: number;
        minValue: number;
        maxValue: number;
        metrics: Array<{
          name: string;
          value: number;
          unit: string;
        }>;
      };
    } = {};

    for (const [name, values] of metrics.entries()) {
      const category = this.extractCategory(name);
      if (!categories[category]) {
        categories[category] = {
          count: 0,
          avgValue: 0,
          minValue: Number.MAX_VALUE,
          maxValue: Number.MIN_VALUE,
          metrics: [],
        };
      }

      const latestValue = values[values.length - 1];
      const avg = values.reduce((a, b) => a + b) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      categories[category].count += values.length;
      categories[category].metrics.push({
        name,
        value: latestValue,
        unit: this.getMetricUnit(name),
      });

      // Update aggregate stats
      categories[category].avgValue += avg;
      if (min < categories[category].minValue) {
        categories[category].minValue = min;
      }
      if (max > categories[category].maxValue) {
        categories[category].maxValue = max;
      }
    }

    // Finalize aggregates
    for (const category of Object.values(categories)) {
      if (category.metrics.length > 0) {
        category.avgValue /= category.metrics.length;
      }
    }

    return categories;
  }

  /**
   * Extract category from metric name
   */
  private extractCategory(name: string): string {
    // Try to match common patterns (order matters - check specific before general)
    if (name.includes('Scalability')) return 'Scalability';
    if (name.includes('Memory')) return 'Memory';
    if (name.includes('Parse')) return 'Parser';
    if (name.includes('Compile') || name.includes('Generate')) return 'Compiler';
    if (name.includes('Reduction') || name.includes('LOC')) return 'Code Metrics';
    if (name.includes('Pipeline')) return 'Pipeline';
    return 'Other';
  }

  /**
   * Get the appropriate unit for a metric
   */
  private getMetricUnit(name: string): string {
    if (name.includes('Memory')) return 'MB';
    if (name.includes('ops/sec') || name.includes('opsPerSecond')) return 'ops/sec';
    if (name.includes('LOC') || name.includes('Reduction')) return 'lines/percent';
    if (name.includes('Scalability')) return 'ms';
    return 'ms';
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(categories: {
    [key: string]: {
      count: number;
      avgValue: number;
      minValue: number;
      maxValue: number;
      metrics: Array<{ name: string; value: number; unit: string }>;
    };
  }): string[] {
    const recommendations: string[] = [];

    // Check parser performance
    if (categories['Parser']) {
      const parserAvg = categories['Parser'].avgValue;
      if (parserAvg > 15) {
        recommendations.push(
          '⚠️  Parser performance is above target (15ms). Consider optimizing tokenization or AST generation.'
        );
      }
    }

    // Check compiler performance
    if (categories['Compiler']) {
      const compilerAvg = categories['Compiler'].avgValue;
      if (compilerAvg > 10) {
        recommendations.push(
          '⚠️  Compiler performance is above target (10ms). Consider caching or parallelizing code generation.'
        );
      }
    }

    // Check memory usage
    if (categories['Memory']) {
      const memoryMetrics = categories['Memory'].metrics;
      for (const metric of memoryMetrics) {
        if (metric.value > 50) {
          recommendations.push(
            `⚠️  Memory usage for ${metric.name} is high (${metric.value.toFixed(2)}${metric.unit}). Consider implementing object pooling or lazy loading.`
          );
        }
      }
    }

    // Check code reduction
    if (categories['Code Metrics']) {
      const reductionMetrics = categories['Code Metrics'].metrics.filter((m) =>
        m.name.includes('Reduction')
      );
      for (const metric of reductionMetrics) {
        if (metric.value < 50) {
          recommendations.push(
            `ℹ️  Code reduction is below target (${metric.value.toFixed(1)}%). Consider simplifying syntax or adding more abstractions.`
          );
        }
      }
    }

    // Check scalability
    if (categories['Scalability']) {
      const scalabilityAvg = categories['Scalability'].avgValue;
      if (scalabilityAvg > 25) {
        recommendations.push(
          '⚠️  Parse time shows high variance with complexity. Consider profiling to identify bottlenecks.'
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All metrics are within target ranges!');
    }

    return recommendations;
  }

  /**
   * Save report to file
   */
  saveReport(report: PerformanceReport, outputPath?: string): string {
    const filename = outputPath || `performance-report-${Date.now()}.json`;
    const fullPath = path.resolve(filename);

    const reportData = {
      timestamp: report.timestamp,
      totalMetrics: report.totalMetrics,
      summary: report.summary,
      recommendations: report.recommendations,
    };

    fs.writeFileSync(fullPath, JSON.stringify(reportData, null, 2));
    return fullPath;
  }

  /**
   * Generate a human-readable report string
   */
  formatReport(report: PerformanceReport): string {
    const lines: string[] = [];

    lines.push('═'.repeat(80));
    lines.push('HOLOSCRIPT+ PERFORMANCE REPORT');
    lines.push('═'.repeat(80));
    lines.push(`Generated: ${report.timestamp}`);
    lines.push(`Total Metrics Collected: ${report.totalMetrics}`);
    lines.push('');

    // Summary by category
    lines.push('SUMMARY BY CATEGORY');
    lines.push('─'.repeat(80));

    for (const [category, data] of Object.entries(report.summary.categories)) {
      lines.push(`\n${category}`);
      lines.push(`  Metric Count: ${data.count}`);
      lines.push(`  Average Value: ${data.avgValue.toFixed(3)}`);
      lines.push(`  Min: ${data.minValue.toFixed(3)}`);
      lines.push(`  Max: ${data.maxValue.toFixed(3)}`);

      for (const metric of data.metrics) {
        lines.push(`  • ${metric.name}: ${metric.value.toFixed(3)}${metric.unit}`);
      }
    }

    // Recommendations
    lines.push('\n' + '─'.repeat(80));
    lines.push('RECOMMENDATIONS');
    lines.push('─'.repeat(80));

    for (const rec of report.recommendations) {
      lines.push(rec);
    }

    lines.push('\n' + '═'.repeat(80));

    return lines.join('\n');
  }

  /**
   * Print formatted report to console
   */
  printReport(report: PerformanceReport): void {
    console.info(this.formatReport(report));
  }
}
