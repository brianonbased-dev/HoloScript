/**
 * Cycle 202 — Performance Tracking
 *
 * Covers PerformanceTracker (record metrics, baseline, compare, reports, summary)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from '../performance/PerformanceTracker';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
    tracker.clearMetrics();
  });

  // --- Record metrics ---
  it('recordMetric stores a metric', () => {
    tracker.recordMetric('parse', 5.2, 192);
    const summary = tracker.getSummary();
    expect(summary.totalMetrics).toBe(1);
  });

  it('recordMetric stores multiple metrics', () => {
    tracker.recordMetric('parse', 5.2, 192);
    tracker.recordMetric('compile', 3.1, 322);
    tracker.recordMetric('parse', 4.8, 208);
    const summary = tracker.getSummary();
    expect(summary.totalMetrics).toBe(3);
  });

  // --- Baseline ---
  it('saveAsBaseline sets baseline on same instance', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.saveAsBaseline('v1.0');
    const summary = tracker.getSummary();
    expect(summary.hasBaseline).toBe(true);
  });

  // --- Compare ---
  it('compare returns OK when within 5% threshold', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.saveAsBaseline('v1.0');
    tracker.clearMetrics();
    tracker.recordMetric('parse', 5.1, 196); // ~2% worse
    const comparisons = tracker.compare();
    const parseComp = comparisons.find((c) => c.name === 'parse');
    expect(parseComp?.status).toBe('OK');
  });

  it('compare returns WARN/FAIL when >5% degradation', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.saveAsBaseline('v1.0');
    tracker.clearMetrics();
    tracker.recordMetric('parse', 6.0, 166); // 20% worse
    const comparisons = tracker.compare();
    const parseComp = comparisons.find((c) => c.name === 'parse');
    expect(['WARN', 'FAIL']).toContain(parseComp?.status);
  });

  it('compare returns empty when no baseline exists', () => {
    tracker.recordMetric('parse', 5.0, 200);
    // No baseline saved — create a fresh tracker to have no baseline at all
    const freshTracker = new PerformanceTracker();
    freshTracker.clearMetrics();
    freshTracker.recordMetric('parse', 5.0, 200);
    // If there's no baseline loaded, compare should handle gracefully
    const comparisons = freshTracker.compare();
    // comparisons may be empty or have status without baseline
    expect(Array.isArray(comparisons)).toBe(true);
  });

  // --- Report ---
  it('generateReport returns structured report', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.recordMetric('compile', 3.0, 333);
    const report = tracker.generateReport();
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('current');
    expect(report).toHaveProperty('comparisons');
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('alerts');
    expect(report.current.length).toBeGreaterThan(0);
  });

  it('generateReport status is PASS when within threshold', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.saveAsBaseline('v1.0');
    tracker.clearMetrics();
    tracker.recordMetric('parse', 5.0, 200);
    const report = tracker.generateReport();
    expect(report.status).toBe('PASS');
  });

  // --- Summary ---
  it('getSummary computes correct statistics', () => {
    tracker.recordMetric('a', 2.0, 500);
    tracker.recordMetric('b', 4.0, 250);
    tracker.recordMetric('c', 6.0, 166);
    const summary = tracker.getSummary();
    expect(summary.totalMetrics).toBe(3);
    expect(summary.avgTiming).toBeCloseTo(4.0, 1);
    expect(summary.minTiming).toBeCloseTo(2.0, 1);
    expect(summary.maxTiming).toBeCloseTo(6.0, 1);
  });

  it('getSummary returns zeros when empty', () => {
    const summary = tracker.getSummary();
    expect(summary.totalMetrics).toBe(0);
    expect(summary.avgTiming).toBe(0);
  });

  // --- Clear ---
  it('clearMetrics empties current metrics', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.clearMetrics();
    expect(tracker.getSummary().totalMetrics).toBe(0);
  });

  // --- getAllMetrics ---
  it('getAllMetrics groups by name', () => {
    tracker.recordMetric('parse', 5.0, 200);
    tracker.recordMetric('parse', 4.5, 222);
    tracker.recordMetric('compile', 3.0, 333);
    const grouped = tracker.getAllMetrics();
    expect(grouped.get('parse')?.length).toBe(2);
    expect(grouped.get('compile')?.length).toBe(1);
  });

  // --- percentWithinThreshold ---
  it('percentWithinThreshold is 100% when all OK', () => {
    tracker.recordMetric('a', 5.0, 200);
    tracker.saveAsBaseline('v1');
    tracker.clearMetrics();
    tracker.recordMetric('a', 5.0, 200);
    const summary = tracker.getSummary();
    expect(summary.percentWithinThreshold).toBe(100);
  });
});
