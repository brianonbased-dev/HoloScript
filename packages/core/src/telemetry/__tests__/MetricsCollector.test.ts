import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../MetricsCollector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => { collector = new MetricsCollector(); });

  // Counters
  it('incrementCounter creates and increments', () => {
    collector.incrementCounter('requests');
    expect(collector.getCounterValue('requests')).toBe(1);
  });

  it('incrementCounter with delta', () => {
    collector.incrementCounter('requests', 5);
    expect(collector.getCounterValue('requests')).toBe(5);
  });

  it('incrementCounter accumulates', () => {
    collector.incrementCounter('hits');
    collector.incrementCounter('hits');
    collector.incrementCounter('hits');
    expect(collector.getCounterValue('hits')).toBe(3);
  });

  it('counter with labels tracks separately', () => {
    collector.incrementCounter('req', 1, { method: 'GET' });
    collector.incrementCounter('req', 1, { method: 'POST' });
    expect(collector.getCounterValue('req', { method: 'GET' })).toBe(1);
    expect(collector.getCounterValue('req', { method: 'POST' })).toBe(1);
  });

  // Gauges
  it('setGauge / getGaugeValue', () => {
    collector.setGauge('cpu', 42);
    expect(collector.getGaugeValue('cpu')).toBe(42);
  });

  it('gauge overwrites previous value', () => {
    collector.setGauge('mem', 100);
    collector.setGauge('mem', 200);
    expect(collector.getGaugeValue('mem')).toBe(200);
  });

  // Histograms
  it('recordHistogram and getHistogramStats', () => {
    collector.recordHistogram('latency', 10);
    collector.recordHistogram('latency', 20);
    collector.recordHistogram('latency', 30);
    const stats = collector.getHistogramStats('latency');
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(3);
    expect(stats!.sum).toBe(60);
    expect(stats!.min).toBe(10);
    expect(stats!.max).toBe(30);
    expect(stats!.avg).toBe(20);
  });

  it('histogram percentiles', () => {
    for (let i = 1; i <= 100; i++) collector.recordHistogram('lat', i);
    const stats = collector.getHistogramStats('lat')!;
    expect(stats.p50).toBeGreaterThanOrEqual(49);
    expect(stats.p95).toBeGreaterThanOrEqual(94);
    expect(stats.p99).toBeGreaterThanOrEqual(98);
  });

  it('getHistogramStats returns null for missing metric', () => {
    expect(collector.getHistogramStats('nope')).toBeNull();
  });

  // getAllEntries
  it('getAllEntries returns all metric entries', () => {
    collector.incrementCounter('a');
    collector.setGauge('b', 1);
    collector.recordHistogram('c', 5);
    expect(collector.getAllEntries().length).toBeGreaterThanOrEqual(3);
  });

  // Prometheus format
  it('toPrometheusFormat returns string', () => {
    collector.incrementCounter('http_requests');
    const prom = collector.toPrometheusFormat();
    expect(typeof prom).toBe('string');
    expect(prom).toContain('http_requests');
  });

  // OTLP format
  it('toOTLP returns object', () => {
    collector.incrementCounter('ops');
    const otlp = collector.toOTLP();
    expect(otlp).toBeDefined();
  });

  // Reset
  it('reset clears all metrics', () => {
    collector.incrementCounter('a');
    collector.setGauge('b', 1);
    collector.reset();
    expect(collector.getCounterValue('a')).toBe(0);
    expect(collector.getGaugeValue('b')).toBe(0);
    expect(collector.getAllEntries()).toHaveLength(0);
  });
});
