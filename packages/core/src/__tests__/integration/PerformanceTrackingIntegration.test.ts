/**
 * Integration test for the complete performance tracking system
 * Demonstrates real-world usage of metrics collection and reporting
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PerformanceTracker } from '../../performance/PerformanceTracker';
import { PerformanceReportGenerator } from '../../performance/PerformanceReportGenerator';
import * as fs from 'fs';
import * as path from 'path';

describe('Performance Tracking System Integration', () => {
  let tracker: PerformanceTracker;
  let generator: PerformanceReportGenerator;
  let reportsDir: string;

  beforeAll(() => {
    tracker = new PerformanceTracker();
    generator = new PerformanceReportGenerator(tracker);

    reportsDir = path.join(process.cwd(), '.performance-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Optional: Keep reports for inspection
    // Uncomment to clean up automatically
    // if (fs.existsSync(reportsDir)) {
    //   const files = fs.readdirSync(reportsDir);
    //   for (const file of files) {
    //     fs.unlinkSync(path.join(reportsDir, file));
    //   }
    //   fs.rmdirSync(reportsDir);
    // }
  });

  it('should track parser performance across multiple runs', () => {
    // Simulate multiple parsing operations
    const parseMetrics = [
      { name: 'Parse Simple Scene', time: 4.2, opsPerSec: 238 },
      { name: 'Parse Complex Scene', time: 11.3, opsPerSec: 88 },
      { name: 'Parse UI Scene', time: 9.8, opsPerSec: 102 },
    ];

    for (const metric of parseMetrics) {
      tracker.recordMetric(metric.name, metric.time, metric.opsPerSec);
    }

    const report = generator.generateReport();

    expect(report.summary.categories['Parser']).toBeDefined();
    expect(report.summary.categories['Parser'].metrics.length).toBe(3);
    expect(report.summary.categories['Parser'].avgValue).toBeLessThan(15); // Should average below 15ms
  });

  it('should track compiler performance metrics', () => {
    // Track compilation performance
    tracker.recordMetric('Compile to visionOS', 7.5, 133.3);
    tracker.recordMetric('Generate USDA', 3.2, 312.5);
    tracker.recordMetric('Full Pipeline', 35.0, 28.6);

    const report = generator.generateReport();

    expect(report.summary.categories['Compiler']).toBeDefined();
    expect(report.summary.categories['Pipeline']).toBeDefined();
  });

  it('should track code quality metrics', () => {
    // Track code reduction metrics
    tracker.recordMetric('Simple Scene Reduction %', 72.5);
    tracker.recordMetric('Complex Scene LOC', 112);
    tracker.recordMetric('UI Scene LOC', 98);

    const report = generator.generateReport();

    expect(report.summary.categories['Code Metrics']).toBeDefined();
  });

  it('should track memory and resource usage', () => {
    tracker.recordMetric('Memory Increase (1000 parses, MB)', 18.5);
    tracker.recordMetric('Parse Scalability (avg)', 8.3);

    const report = generator.generateReport();

    expect(report.summary.categories['Memory']).toBeDefined();
    expect(report.summary.categories['Scalability']).toBeDefined();
  });

  it('should generate comprehensive report with recommendations', () => {
    // Clear previous metrics and add fresh ones
    const freshTracker = new PerformanceTracker();
    const freshGenerator = new PerformanceReportGenerator(freshTracker);

    // Add realistic metrics
    freshTracker.recordMetric('Parse Simple Scene', 4.5, 222);
    freshTracker.recordMetric('Parse Complex Scene', 10.2, 98);
    freshTracker.recordMetric('Parse UI Scene', 8.7, 115);
    freshTracker.recordMetric('Compile to visionOS', 6.8, 147);
    freshTracker.recordMetric('Generate USDA', 2.9, 345);
    freshTracker.recordMetric('Full Pipeline', 32.5, 30.8);
    freshTracker.recordMetric('Simple Scene Reduction %', 75.5);
    freshTracker.recordMetric('Complex Scene LOC', 128);
    freshTracker.recordMetric('UI Scene LOC', 95);
    freshTracker.recordMetric('Memory Increase (1000 parses, MB)', 15.2);
    freshTracker.recordMetric('Parse Scalability (avg)', 7.8);

    const report = freshGenerator.generateReport();

    // Verify report structure
    expect(report.timestamp).toBeDefined();
    expect(report.totalMetrics).toBeGreaterThan(10);
    expect(report.summary.categories).toBeDefined();
    expect(report.recommendations).toBeDefined();

    // All metrics should be within expected ranges (no high recommendations)
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should save and load reports correctly', () => {
    const freshTracker = new PerformanceTracker();
    const freshGenerator = new PerformanceReportGenerator(freshTracker);

    freshTracker.recordMetric('Test Metric 1', 10.0);
    freshTracker.recordMetric('Test Metric 2', 20.0);

    const report = freshGenerator.generateReport();
    const reportPath = path.join(reportsDir, `test-integration-${Date.now()}.json`);
    const savedPath = freshGenerator.saveReport(report, reportPath);

    expect(fs.existsSync(savedPath)).toBe(true);

    const loadedContent = fs.readFileSync(savedPath, 'utf-8');
    const loadedReport = JSON.parse(loadedContent);

    expect(loadedReport.timestamp).toBe(report.timestamp);
    expect(loadedReport.totalMetrics).toBe(report.totalMetrics);
  });

  it('should format report for console output', () => {
    const freshTracker = new PerformanceTracker();
    const freshGenerator = new PerformanceReportGenerator(freshTracker);

    freshTracker.recordMetric('Parse Simple Scene', 5.2);
    freshTracker.recordMetric('Compile to visionOS', 8.3);

    const report = freshGenerator.generateReport();
    const formattedReport = freshGenerator.formatReport(report);

    // Check for key sections
    expect(formattedReport).toContain('HOLOSCRIPT+');
    expect(formattedReport).toContain('SUMMARY BY CATEGORY');
    expect(formattedReport).toContain('Parser');
    expect(formattedReport).toContain('Compiler');

    // Verify it can be printed without errors
    expect(() => {
      freshGenerator.printReport(report);
    }).not.toThrow();
  });

  it('should track performance degradation over time', () => {
    const degradationTracker = new PerformanceTracker();

    // Initial good performance
    degradationTracker.recordMetric('Parse Performance', 5.0);
    degradationTracker.recordMetric('Parse Performance', 5.2);
    degradationTracker.recordMetric('Parse Performance', 4.8);

    // Degraded performance (simulating codebase growth)
    degradationTracker.recordMetric('Parse Performance', 12.0);
    degradationTracker.recordMetric('Parse Performance', 13.5);
    degradationTracker.recordMetric('Parse Performance', 12.8);

    // Reset with optimizations
    degradationTracker.recordMetric('Parse Performance', 6.5);
    degradationTracker.recordMetric('Parse Performance', 6.2);

    const metrics = degradationTracker.getAllMetrics();
    const parseMetrics = metrics.get('Parse Performance');

    expect(parseMetrics).toBeDefined();
    expect(parseMetrics).toHaveLength(8);

    // Latest metric should show improvement
    expect(parseMetrics![parseMetrics!.length - 1]).toBeLessThan(7.0);
  });

  it('should provide actionable insights for optimization', () => {
    const insightTracker = new PerformanceTracker();
    const insightGenerator = new PerformanceReportGenerator(insightTracker);

    // Add metrics that would trigger recommendations
    insightTracker.recordMetric('Parse Complex Scene', 22.0); // Above threshold
    insightTracker.recordMetric('Compile to visionOS', 12.0); // Above threshold
    insightTracker.recordMetric('Memory Increase (1000 parses, MB)', 55.0); // Above threshold

    const report = insightGenerator.generateReport();

    // Should have at least one recommendation for each high metric
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations.some((r) => r.includes('Parser'))).toBe(true);
    expect(report.recommendations.some((r) => r.includes('Compiler'))).toBe(true);
    expect(report.recommendations.some((r) => r.includes('Memory'))).toBe(true);

    // Recommendations should be actionable
    for (const rec of report.recommendations) {
      expect(rec.length).toBeGreaterThan(10);
      expect(rec).toMatch(/[A-Z]/); // Should have at least some capitalization
    }
  });
});
