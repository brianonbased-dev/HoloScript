import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PerformanceTracker } from '../../performance/PerformanceTracker';
import { PerformanceReportGenerator } from '../../performance/PerformanceReportGenerator';
import * as fs from 'fs';
import * as path from 'path';

describe('PerformanceReportGenerator', () => {
  let tracker: PerformanceTracker;
  let generator: PerformanceReportGenerator;
  let tempDir: string;

  beforeAll(() => {
    tracker = new PerformanceTracker();
    generator = new PerformanceReportGenerator(tracker);

    // Create temp directory for report files
    tempDir = path.join(process.cwd(), 'temp-reports');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  it('should generate report with collected metrics', () => {
    // Record some test metrics
    tracker.recordMetric('Parse Simple Scene', 5.2, 192.3);
    tracker.recordMetric('Parse Complex Scene', 12.5, 80.0);
    tracker.recordMetric('Compile to visionOS', 8.3, 120.5);
    tracker.recordMetric('Generate USDA', 3.8, 263.2);
    tracker.recordMetric('Simple Scene Reduction %', 65.0);
    tracker.recordMetric('Memory Increase (1000 parses, MB)', 12.5);

    const report = generator.generateReport();

    expect(report).toBeDefined();
    expect(report.timestamp).toBeDefined();
    expect(report.totalMetrics).toBeGreaterThan(0);
    expect(report.summary.categories).toBeDefined();
    expect(report.recommendations).toBeDefined();
  });

  it('should organize metrics by category', () => {
    const tracker2 = new PerformanceTracker();
    const generator2 = new PerformanceReportGenerator(tracker2);

    // Add metrics from different categories
    tracker2.recordMetric('Parse Simple Scene', 5.2);
    tracker2.recordMetric('Parse Complex Scene', 12.5);
    tracker2.recordMetric('Compile to visionOS', 8.3);
    tracker2.recordMetric('Simple Scene Reduction %', 65.0);
    tracker2.recordMetric('Memory Increase (1000 parses, MB)', 12.5);

    const report = generator2.generateReport();

    // Check that categories exist
    expect(report.summary.categories['Parser']).toBeDefined();
    expect(report.summary.categories['Compiler']).toBeDefined();
    expect(report.summary.categories['Code Metrics']).toBeDefined();
    expect(report.summary.categories['Memory']).toBeDefined();
  });

  it('should generate recommendations based on performance', () => {
    const tracker3 = new PerformanceTracker();
    const generator3 = new PerformanceReportGenerator(tracker3);

    // Record metrics that would trigger recommendations
    tracker3.recordMetric('Parse Simple Scene', 20.0); // Above 15ms threshold
    tracker3.recordMetric('Memory Increase (1000 parses, MB)', 60.0); // Above 50MB threshold

    const report = generator3.generateReport();

    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations.some((rec) => rec.includes('Parser'))).toBe(true);
    expect(report.recommendations.some((rec) => rec.includes('Memory'))).toBe(true);
  });

  it('should save report to file', () => {
    const tracker4 = new PerformanceTracker();
    const generator4 = new PerformanceReportGenerator(tracker4);

    tracker4.recordMetric('Parse Simple Scene', 5.2);
    tracker4.recordMetric('Compile to visionOS', 8.3);

    const report = generator4.generateReport();
    const outputPath = path.join(tempDir, 'test-report.json');
    const savedPath = generator4.saveReport(report, outputPath);

    expect(fs.existsSync(savedPath)).toBe(true);

    const fileContent = fs.readFileSync(savedPath, 'utf-8');
    const fileData = JSON.parse(fileContent);

    expect(fileData.timestamp).toBe(report.timestamp);
    expect(fileData.totalMetrics).toBe(report.totalMetrics);
    expect(fileData.summary).toBeDefined();
    expect(fileData.recommendations).toBeDefined();
  });

  it('should format report as human-readable string', () => {
    const tracker5 = new PerformanceTracker();
    const generator5 = new PerformanceReportGenerator(tracker5);

    tracker5.recordMetric('Parse Simple Scene', 5.2);
    tracker5.recordMetric('Parse Complex Scene', 12.5);
    tracker5.recordMetric('Compile to visionOS', 8.3);

    const report = generator5.generateReport();
    const formatted = generator5.formatReport(report);

    expect(formatted).toContain('HOLOSCRIPT+ PERFORMANCE REPORT');
    expect(formatted).toContain('SUMMARY BY CATEGORY');
    expect(formatted).toContain('RECOMMENDATIONS');
    expect(formatted).toContain('Parse Simple Scene');
    expect(formatted).toContain('Compile to visionOS');
  });

  it('should print report to console', () => {
    const tracker6 = new PerformanceTracker();
    const generator6 = new PerformanceReportGenerator(tracker6);

    tracker6.recordMetric('Parse Simple Scene', 5.2);

    const report = generator6.generateReport();

    // Just ensure it doesn't throw
    expect(() => {
      generator6.printReport(report);
    }).not.toThrow();
  });

  it('should handle empty metrics gracefully', () => {
    const tracker7 = new PerformanceTracker();
    const generator7 = new PerformanceReportGenerator(tracker7);

    const report = generator7.generateReport();

    expect(report.timestamp).toBeDefined();
    expect(report.totalMetrics).toBe(0);
    expect(report.recommendations).toBeDefined();
  });

  it('should calculate aggregated statistics correctly', () => {
    const tracker8 = new PerformanceTracker();
    const generator8 = new PerformanceReportGenerator(tracker8);

    // Record multiple values for same metric
    tracker8.recordMetric('Parse Simple Scene', 5.0);
    tracker8.recordMetric('Parse Simple Scene', 6.0);
    tracker8.recordMetric('Parse Simple Scene', 4.0);

    const report = generator8.generateReport();

    // Check that Parser category has correct stats
    const parserCategory = report.summary.categories['Parser'];
    expect(parserCategory).toBeDefined();
    expect(parserCategory.count).toBe(3);
    expect(parserCategory.minValue).toBe(4.0);
    expect(parserCategory.maxValue).toBe(6.0);
    // Average of 5, 6, 4 = 5.0
    expect(parserCategory.avgValue).toBeCloseTo(5.0, 1);
  });
});
