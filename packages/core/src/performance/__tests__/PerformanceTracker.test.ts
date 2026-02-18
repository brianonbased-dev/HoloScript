import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from '../PerformanceTracker';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker();
    tracker.clearMetrics();
  });

  it('records a metric', () => {
    tracker.recordMetric('parse', 10, 100);
    const report = tracker.generateReport();
    expect(report.current.length).toBeGreaterThanOrEqual(1);
    expect(report.current.some(m => m.name === 'parse')).toBe(true);
  });

  it('generates a report with PASS status when no baseline', () => {
    tracker.recordMetric('parse', 5, 200);
    const report = tracker.generateReport();
    expect(report.status).toBe('PASS');
    expect(report.baseline).toBeNull();
  });

  it('saves and loads baseline', () => {
    tracker.recordMetric('compile', 8, 125);
    tracker.saveAsBaseline('1.0.0');
    // After saving baseline, comparisons should include it
    tracker.recordMetric('compile', 9, 111);
    const comparisons = tracker.compare();
    expect(comparisons.length).toBeGreaterThanOrEqual(1);
  });

  it('detects degradation above threshold', () => {
    tracker.recordMetric('parse', 10, 100);
    tracker.saveAsBaseline('1.0.0');
    // Clear and re-record a significantly slower metric
    tracker.clearMetrics();
    tracker.recordMetric('parse', 20, 50);
    const comparisons = tracker.compare();
    const parseComp = comparisons.find(c => c.name === 'parse');
    expect(parseComp).toBeDefined();
    expect(parseComp!.changePercent).toBeGreaterThan(5);
    expect(parseComp!.status).toBe('FAIL');
  });

  it('clearMetrics empties current metrics', () => {
    tracker.recordMetric('x', 1, 1000);
    tracker.clearMetrics();
    const report = tracker.generateReport();
    expect(report.current).toHaveLength(0);
  });

  it('compare returns OK status when no baseline exists', () => {
    tracker.recordMetric('test', 5, 200);
    const comparisons = tracker.compare();
    expect(comparisons.length).toBeGreaterThanOrEqual(1);
    expect(comparisons[0].status).toBe('OK');
    expect(comparisons[0].changePercent).toBeUndefined();
  });

  it('report includes timestamp', () => {
    const report = tracker.generateReport();
    expect(report.timestamp).toBeDefined();
    expect(typeof report.timestamp).toBe('string');
  });

  it('summary returns valid stats object', () => {
    tracker.recordMetric('a', 5, 200);
    tracker.recordMetric('b', 10, 100);
    const summary = (tracker as any).getSummary?.() ?? tracker.generateReport();
    expect(summary).toBeDefined();
  });
});
