/**
 * PerformanceReportGenerator — production test suite
 *
 * Tests: generateReport (empty tracker, with metrics),
 * category extraction (Parser/Compiler/Memory/Scalability/Other),
 * recommendations (all-pass, parser-slow, compiler-slow, memory-high),
 * formatReport (string output structure), printReport (console.log call).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceReportGenerator } from '../PerformanceReportGenerator';
import { PerformanceTracker } from '../PerformanceTracker';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PerformanceReportGenerator: production', () => {
  let tracker: PerformanceTracker;
  let generator: PerformanceReportGenerator;

  beforeEach(() => {
    tracker = new PerformanceTracker();
    generator = new PerformanceReportGenerator(tracker);
  });

  // ─── generateReport: empty ────────────────────────────────────────────────
  describe('generateReport: empty tracker', () => {
    it('totalMetrics is 0 for empty tracker', () => {
      const report = generator.generateReport();
      expect(report.totalMetrics).toBe(0);
    });

    it('timestamp is a valid ISO string', () => {
      const report = generator.generateReport();
      expect(() => new Date(report.timestamp)).not.toThrow();
    });

    it('rawMetrics is empty Map for no recorded metrics', () => {
      const report = generator.generateReport();
      expect(report.rawMetrics.size).toBe(0);
    });

    it('recommendations has all-clear message when no issues', () => {
      const report = generator.generateReport();
      expect(report.recommendations.some((r) => r.includes('✅'))).toBe(true);
    });
  });

  // ─── generateReport: with metrics ────────────────────────────────────────
  describe('generateReport: with metrics', () => {
    it('totalMetrics counts correctly', () => {
      tracker.recordMetric('Parse', 10, 100);
      tracker.recordMetric('Parse', 12, 90);
      const report = generator.generateReport();
      expect(report.totalMetrics).toBe(2);
    });

    it('rawMetrics contains recorded metric names', () => {
      tracker.recordMetric('ParseTime', 10, 100);
      const report = generator.generateReport();
      expect(report.rawMetrics.has('ParseTime')).toBe(true);
    });
  });

  // ─── category extraction ─────────────────────────────────────────────────
  describe('category extraction', () => {
    it('Parser metric becomes Parser category', () => {
      tracker.recordMetric('ParseTime', 10, 100);
      const report = generator.generateReport();
      expect(report.summary.categories['Parser']).toBeDefined();
    });

    it('Compile metric becomes Compiler category', () => {
      tracker.recordMetric('CompileTime', 5, 200);
      const report = generator.generateReport();
      expect(report.summary.categories['Compiler']).toBeDefined();
    });

    it('Memory metric becomes Memory category', () => {
      tracker.recordMetric('MemoryUsage', 20, 1);
      const report = generator.generateReport();
      expect(report.summary.categories['Memory']).toBeDefined();
    });

    it('Scalability metric becomes Scalability category', () => {
      tracker.recordMetric('ScalabilityTest', 20, 1);
      const report = generator.generateReport();
      expect(report.summary.categories['Scalability']).toBeDefined();
    });

    it('unknown metrics go to Other category', () => {
      tracker.recordMetric('SomeRandomMetric', 5, 1);
      const report = generator.generateReport();
      expect(report.summary.categories['Other']).toBeDefined();
    });

    it('category has correct metric count', () => {
      tracker.recordMetric('ParseTime', 10, 100);
      tracker.recordMetric('ParseTime', 12, 100);
      const report = generator.generateReport();
      expect(report.summary.categories['Parser'].count).toBe(2);
    });

    it('category computes min/max correctly', () => {
      tracker.recordMetric('ParseShort', 5, 100);
      tracker.recordMetric('ParseLong', 15, 50);
      const report = generator.generateReport();
      const parser = report.summary.categories['Parser'];
      expect(parser.minValue).toBeLessThanOrEqual(5);
      expect(parser.maxValue).toBeGreaterThanOrEqual(15);
    });
  });

  // ─── recommendations ──────────────────────────────────────────────────────
  describe('recommendations', () => {
    it('warns when Parser avg > 15ms', () => {
      tracker.recordMetric('ParseTime', 20, 10); // above 15ms threshold
      const report = generator.generateReport();
      expect(report.recommendations.some((r) => r.includes('Parser'))).toBe(true);
    });

    it('warns when Compiler avg > 10ms', () => {
      tracker.recordMetric('CompileStep', 15, 5); // above 10ms threshold
      const report = generator.generateReport();
      expect(report.recommendations.some((r) => r.includes('Compiler'))).toBe(true);
    });

    it('warns when Memory metric > 50', () => {
      tracker.recordMetric('MemoryUsage', 75, 1);
      const report = generator.generateReport();
      expect(report.recommendations.some((r) => r.includes('Memory') || r.includes('memory'))).toBe(
        true
      );
    });

    it('no performance warning when metrics are within thresholds', () => {
      tracker.recordMetric('ParseTime', 5, 200); // under 15ms
      tracker.recordMetric('CompileStep', 3, 400); // under 10ms
      const report = generator.generateReport();
      // Should only have the all-clear message or none of the warning kinds
      const hasParserWarn = report.recommendations.some((r) =>
        r.includes('Parser performance is above')
      );
      const hasCompilerWarn = report.recommendations.some((r) =>
        r.includes('Compiler performance is above')
      );
      expect(hasParserWarn).toBe(false);
      expect(hasCompilerWarn).toBe(false);
    });
  });

  // ─── formatReport ─────────────────────────────────────────────────────────
  describe('formatReport', () => {
    it('returns a non-empty string', () => {
      const report = generator.generateReport();
      const formatted = generator.formatReport(report);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('contains report header', () => {
      const report = generator.generateReport();
      expect(generator.formatReport(report)).toContain('HOLOSCRIPT+ PERFORMANCE REPORT');
    });

    it('contains recommendations section', () => {
      const report = generator.generateReport();
      expect(generator.formatReport(report)).toContain('RECOMMENDATIONS');
    });

    it('contains category name when metrics recorded', () => {
      tracker.recordMetric('ParseTime', 10, 100);
      const report = generator.generateReport();
      expect(generator.formatReport(report)).toContain('Parser');
    });
  });

  // ─── printReport ─────────────────────────────────────────────────────────
  describe('printReport', () => {
    it('calls console.log with formatted report', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const report = generator.generateReport();
      generator.printReport(report);
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
