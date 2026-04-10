/**
 * PerformanceTracker — production test suite
 *
 * Tests: recordMetric, compare (with/without baseline), generateReport,
 * saveAsBaseline, getSummary, getAllMetrics, clearMetrics.
 *
 * Uses the in-memory storage backend (default in test/Node environment).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from '../PerformanceTracker';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PerformanceTracker: production', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
  });

  // ─── recordMetric ─────────────────────────────────────────────────────────
  describe('recordMetric', () => {
    it('records a single metric', () => {
      tracker.recordMetric('parse', 10, 1000);
      const summary = tracker.getSummary();
      expect(summary.totalMetrics).toBe(1);
    });

    it('records multiple metrics', () => {
      tracker.recordMetric('parse', 10, 1000);
      tracker.recordMetric('compile', 5, 2000);
      expect(tracker.getSummary().totalMetrics).toBe(2);
    });

    it('getAllMetrics groups by name', () => {
      tracker.recordMetric('parse', 10, 1000);
      tracker.recordMetric('parse', 12, 950);
      tracker.recordMetric('compile', 5, 2000);
      const grouped = tracker.getAllMetrics();
      expect(grouped.get('parse')).toHaveLength(2);
      expect(grouped.get('compile')).toHaveLength(1);
    });

    it('grouped timings contain correct values', () => {
      tracker.recordMetric('lex', 8, 500);
      tracker.recordMetric('lex', 9, 480);
      const timings = tracker.getAllMetrics().get('lex')!;
      expect(timings).toContain(8);
      expect(timings).toContain(9);
    });
  });

  // ─── getSummary ──────────────────────────────────────────────────────────
  describe('getSummary', () => {
    it('returns zeros on empty tracker', () => {
      const s = tracker.getSummary();
      expect(s.totalMetrics).toBe(0);
      expect(s.avgTiming).toBe(0);
      expect(s.minTiming).toBe(0);
      expect(s.maxTiming).toBe(0);
    });

    it('computes correct avgTiming', () => {
      tracker.recordMetric('a', 10, 100);
      tracker.recordMetric('b', 20, 50);
      expect(tracker.getSummary().avgTiming).toBe(15);
    });

    it('computes correct minTiming and maxTiming', () => {
      tracker.recordMetric('a', 5, 100);
      tracker.recordMetric('b', 50, 10);
      tracker.recordMetric('c', 25, 40);
      const { minTiming, maxTiming } = tracker.getSummary();
      expect(minTiming).toBe(5);
      expect(maxTiming).toBe(50);
    });

    it('hasBaseline is false initially', () => {
      expect(tracker.getSummary().hasBaseline).toBe(false);
    });

    it('hasBaseline is true after saveAsBaseline', () => {
      tracker.recordMetric('a', 10, 100);
      tracker.saveAsBaseline('v1');
      expect(tracker.getSummary().hasBaseline).toBe(true);
    });
  });

  // ─── compare ─────────────────────────────────────────────────────────────
  describe('compare', () => {
    it('returns empty array when no metrics', () => {
      expect(tracker.compare()).toEqual([]);
    });

    it('returns OK status when no baseline exists', () => {
      tracker.recordMetric('parse', 10, 1000);
      const comps = tracker.compare();
      expect(comps[0].status).toBe('OK');
      expect(comps[0].baseline).toBeUndefined();
    });

    it('returns OK when timing matches baseline', () => {
      tracker.recordMetric('parse', 10, 1000);
      tracker.saveAsBaseline('v1');
      tracker.clearMetrics();
      tracker.recordMetric('parse', 10, 1000); // same
      const comps = tracker.compare();
      expect(comps[0].status).toBe('OK');
      expect(comps[0].changePercent).toBe(0);
    });

    it('returns FAIL when metric degrades > 5%', () => {
      tracker.recordMetric('parse', 100, 10);
      tracker.saveAsBaseline('v1');
      tracker.clearMetrics();
      tracker.recordMetric('parse', 110, 9); // 10% slower
      const comps = tracker.compare();
      expect(comps[0].status).toBe('FAIL');
    });

    it('returns WARN when metric degrades 2.5–5%', () => {
      tracker.recordMetric('parse', 100, 10);
      tracker.saveAsBaseline('v1');
      tracker.clearMetrics();
      tracker.recordMetric('parse', 104, 9); // 4% slower
      const comps = tracker.compare();
      expect(comps[0].status).toBe('WARN');
    });

    it('returns OK when metric improves', () => {
      tracker.recordMetric('parse', 100, 10);
      tracker.saveAsBaseline('v1');
      tracker.clearMetrics();
      tracker.recordMetric('parse', 80, 12); // faster
      const comps = tracker.compare();
      expect(comps[0].status).toBe('OK');
      expect(comps[0].changePercent).toBeLessThan(0);
    });
  });

  // ─── generateReport ──────────────────────────────────────────────────────
  describe('generateReport', () => {
    it('report has PASS status with no degradations', () => {
      tracker.recordMetric('lex', 10, 1000);
      const report = tracker.generateReport();
      expect(report.status).toBe('PASS');
      expect(report.alerts).toHaveLength(0);
    });

    it('report has FAIL status with degraded metric', () => {
      tracker.recordMetric('lex', 100, 10);
      tracker.saveAsBaseline('v1');
      tracker.clearMetrics();
      tracker.recordMetric('lex', 130, 8);
      const report = tracker.generateReport();
      expect(report.status).toBe('FAIL');
      expect(report.alerts.length).toBeGreaterThan(0);
    });

    it('report contains current metrics', () => {
      tracker.recordMetric('a', 10, 100);
      const report = tracker.generateReport();
      expect(report.current.length).toBe(1);
      expect(report.current[0].name).toBe('a');
    });

    it('report has null baseline when none saved', () => {
      const report = tracker.generateReport();
      expect(report.baseline).toBeNull();
    });

    it('report.timestamp is valid ISO string', () => {
      const report = tracker.generateReport();
      expect(() => new Date(report.timestamp)).not.toThrow();
    });
  });

  // ─── saveAsBaseline ───────────────────────────────────────────────────────
  describe('saveAsBaseline', () => {
    it('saves with a custom version label', () => {
      tracker.recordMetric('a', 10, 100);
      tracker.saveAsBaseline('v2.1.0');
      const report = tracker.generateReport();
      expect(report.baseline?.version).toBe('v2.1.0');
    });

    it('persists all current metrics into baseline', () => {
      tracker.recordMetric('a', 10, 100);
      tracker.recordMetric('b', 20, 50);
      tracker.saveAsBaseline('v1');
      const report = tracker.generateReport();
      expect(Object.keys(report.baseline!.metrics)).toContain('a');
      expect(Object.keys(report.baseline!.metrics)).toContain('b');
    });
  });

  // ─── clearMetrics ────────────────────────────────────────────────────────
  describe('clearMetrics', () => {
    it('empties the current metrics', () => {
      tracker.recordMetric('lex', 10, 100);
      tracker.clearMetrics();
      expect(tracker.getSummary().totalMetrics).toBe(0);
    });

    it('does not affect baseline when clearing', () => {
      tracker.recordMetric('lex', 10, 100);
      tracker.saveAsBaseline('v1');
      tracker.clearMetrics();
      expect(tracker.getSummary().hasBaseline).toBe(true);
    });
  });
});
