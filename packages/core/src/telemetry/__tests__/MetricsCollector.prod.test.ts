/**
 * MetricsCollector — Production Test Suite (corrected)
 *
 * Covers: counter increment, labelled counters, histogram stats (all percentiles),
 * gauge set/overwrite, getAllEntries, Prometheus text format, OTLP JSON export, reset.
 *
 * Key API facts (verified against source):
 *  - getGaugeValue() returns 0 (not null) for unknown gauge
 *  - toPrometheusFormat() returns '' when no metrics
 *  - toOTLP() always returns { resourceMetrics } (not { resourceSpans })
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../MetricsCollector';

describe('MetricsCollector — Production', () => {
  let mc: MetricsCollector;

  beforeEach(() => {
    mc = new MetricsCollector();
  });

  // ─── Counter ──────────────────────────────────────────────────────────────

  it('incrementCounter default delta=1', () => {
    mc.incrementCounter('requests');
    expect(mc.getCounterValue('requests')).toBe(1);
  });

  it('incrementCounter accumulates multiple calls', () => {
    mc.incrementCounter('requests');
    mc.incrementCounter('requests');
    mc.incrementCounter('requests', 5);
    expect(mc.getCounterValue('requests')).toBe(7);
  });

  it('incrementCounter with labels creates separate series', () => {
    mc.incrementCounter('http_requests', 1, { method: 'GET' });
    mc.incrementCounter('http_requests', 3, { method: 'POST' });
    expect(mc.getCounterValue('http_requests', { method: 'GET' })).toBe(1);
    expect(mc.getCounterValue('http_requests', { method: 'POST' })).toBe(3);
  });

  it('getCounterValue returns 0 for unknown metric', () => {
    expect(mc.getCounterValue('unknown')).toBe(0);
  });

  it('incrementCounter with negative delta decrements', () => {
    mc.incrementCounter('balance', 10);
    mc.incrementCounter('balance', -3);
    expect(mc.getCounterValue('balance')).toBe(7);
  });

  // ─── Histogram ────────────────────────────────────────────────────────────

  it('recordHistogram and getHistogramStats count', () => {
    mc.recordHistogram('latency', 100);
    mc.recordHistogram('latency', 200);
    mc.recordHistogram('latency', 150);
    const stats = mc.getHistogramStats('latency');
    expect(stats).not.toBeNull();
    expect(stats!.count).toBe(3);
  });

  it('histogram stats: sum, min, max', () => {
    mc.recordHistogram('latency', 10);
    mc.recordHistogram('latency', 50);
    mc.recordHistogram('latency', 90);
    const stats = mc.getHistogramStats('latency')!;
    expect(stats.sum).toBe(150);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(90);
  });

  it('histogram stats: avg', () => {
    mc.recordHistogram('resp', 20);
    mc.recordHistogram('resp', 80);
    const stats = mc.getHistogramStats('resp')!;
    expect(stats.avg).toBe(50);
  });

  it('histogram stats: p50 (median) approximately correct', () => {
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((v) => mc.recordHistogram('vals', v));
    const stats = mc.getHistogramStats('vals')!;
    expect(stats.p50).toBeGreaterThanOrEqual(5);
    expect(stats.p50).toBeLessThanOrEqual(6);
  });

  it('histogram stats: p95', () => {
    for (let i = 1; i <= 100; i++) mc.recordHistogram('data', i);
    const stats = mc.getHistogramStats('data')!;
    expect(stats.p95).toBeGreaterThanOrEqual(94);
    expect(stats.p95).toBeLessThanOrEqual(96);
  });

  it('histogram stats: p99', () => {
    for (let i = 1; i <= 100; i++) mc.recordHistogram('data', i);
    const stats = mc.getHistogramStats('data')!;
    expect(stats.p99).toBeGreaterThanOrEqual(98);
    expect(stats.p99).toBeLessThanOrEqual(100);
  });

  it('getHistogramStats returns null for unknown metric', () => {
    expect(mc.getHistogramStats('ghost')).toBeNull();
  });

  it('histogram with labels keeps separate series', () => {
    mc.recordHistogram('db_query', 50, { query: 'select' });
    mc.recordHistogram('db_query', 200, { query: 'insert' });
    expect(mc.getHistogramStats('db_query', { query: 'select' })!.count).toBe(1);
    expect(mc.getHistogramStats('db_query', { query: 'insert' })!.count).toBe(1);
  });

  // ─── Gauge ────────────────────────────────────────────────────────────────

  it('setGauge stores value', () => {
    mc.setGauge('active_users', 42);
    expect(mc.getGaugeValue('active_users')).toBe(42);
  });

  it('setGauge overwrites previous value', () => {
    mc.setGauge('connections', 10);
    mc.setGauge('connections', 5);
    expect(mc.getGaugeValue('connections')).toBe(5);
  });

  it('getGaugeValue returns 0 for unknown gauge', () => {
    // Source: getGaugeValue returns 0 when not set (not null)
    expect(mc.getGaugeValue('unknown_gauge')).toBe(0);
  });

  it('setGauge with labels keeps separate series', () => {
    mc.setGauge('heap_bytes', 1000, { env: 'prod' });
    mc.setGauge('heap_bytes', 500, { env: 'dev' });
    expect(mc.getGaugeValue('heap_bytes', { env: 'prod' })).toBe(1000);
    expect(mc.getGaugeValue('heap_bytes', { env: 'dev' })).toBe(500);
  });

  // ─── getAllEntries ─────────────────────────────────────────────────────────

  it('getAllEntries returns all recorded metrics', () => {
    mc.incrementCounter('cnt');
    mc.recordHistogram('hist', 1);
    mc.setGauge('gauge', 9);
    const entries = mc.getAllEntries();
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it('getAllEntries returns a copy — mutation does not affect internal state', () => {
    mc.incrementCounter('x');
    const entries1 = mc.getAllEntries();
    entries1.length = 0;
    expect(mc.getAllEntries().length).toBeGreaterThan(0);
  });

  it('getAllEntries returns empty array on fresh instance', () => {
    expect(mc.getAllEntries()).toHaveLength(0);
  });

  // ─── Prometheus Format ────────────────────────────────────────────────────

  it('toPrometheusFormat emits TYPE line for counter', () => {
    mc.incrementCounter('page_views');
    const prom = mc.toPrometheusFormat();
    expect(prom).toContain('# TYPE page_views counter');
  });

  it('toPrometheusFormat emits value for counter', () => {
    mc.incrementCounter('hits', 5);
    const prom = mc.toPrometheusFormat();
    expect(prom).toContain('hits');
    expect(prom).toContain('5');
  });

  it('toPrometheusFormat emits TYPE line for gauge', () => {
    mc.setGauge('memory_mb', 256);
    const prom = mc.toPrometheusFormat();
    expect(prom).toContain('# TYPE memory_mb gauge');
    expect(prom).toContain('256');
  });

  it('toPrometheusFormat encodes labels in {k="v"} format', () => {
    mc.incrementCounter('reqs', 1, { method: 'GET', status: '200' });
    const prom = mc.toPrometheusFormat();
    expect(prom).toContain('method="GET"');
    expect(prom).toContain('status="200"');
  });

  it('toPrometheusFormat histogram emits _count and _sum', () => {
    mc.recordHistogram('request_duration_ms', 100);
    mc.recordHistogram('request_duration_ms', 200);
    const prom = mc.toPrometheusFormat();
    expect(prom).toContain('request_duration_ms_count 2');
    expect(prom).toContain('request_duration_ms_sum 300');
  });

  it('toPrometheusFormat returns empty string when no metrics', () => {
    expect(mc.toPrometheusFormat()).toBe('');
  });

  // ─── OTLP Format ──────────────────────────────────────────────────────────

  it('toOTLP returns resourceMetrics array', () => {
    mc.incrementCounter('hits');
    const otlp = mc.toOTLP() as any;
    expect(otlp.resourceMetrics).toBeDefined();
    expect(Array.isArray(otlp.resourceMetrics)).toBe(true);
  });

  it('toOTLP includes service name in resource attributes', () => {
    mc.incrementCounter('hits');
    const otlp = mc.toOTLP('my-service') as any;
    const raw = JSON.stringify(otlp);
    expect(raw).toContain('my-service');
  });

  it('toOTLP counter isMonotonic=true', () => {
    mc.incrementCounter('calls', 5);
    const otlp = mc.toOTLP() as any;
    const metrics = otlp.resourceMetrics[0]?.scopeMetrics[0]?.metrics;
    const metric = metrics?.find((m: any) => m.name === 'calls');
    expect(metric?.sum?.isMonotonic).toBe(true);
  });

  it('toOTLP histogram has bucketCounts array', () => {
    mc.recordHistogram('latency', 10);
    mc.recordHistogram('latency', 50);
    const otlp = mc.toOTLP() as any;
    const metrics = otlp.resourceMetrics[0]?.scopeMetrics[0]?.metrics;
    const metric = metrics?.find((m: any) => m.name === 'latency');
    expect(metric?.histogram?.dataPoints[0]?.bucketCounts).toBeDefined();
  });

  // ─── Reset ────────────────────────────────────────────────────────────────

  it('reset clears counter', () => {
    mc.incrementCounter('a');
    mc.reset();
    expect(mc.getCounterValue('a')).toBe(0);
  });

  it('reset clears gauge (returns 0)', () => {
    mc.setGauge('b', 10);
    mc.reset();
    expect(mc.getGaugeValue('b')).toBe(0);
  });

  it('reset clears histograms', () => {
    mc.recordHistogram('c', 5);
    mc.reset();
    expect(mc.getHistogramStats('c')).toBeNull();
  });

  it('reset clears getAllEntries', () => {
    mc.incrementCounter('x');
    mc.reset();
    expect(mc.getAllEntries()).toHaveLength(0);
  });

  it('reset is idempotent — can reset twice', () => {
    mc.incrementCounter('x');
    mc.reset();
    expect(() => mc.reset()).not.toThrow();
    expect(mc.getAllEntries()).toHaveLength(0);
  });
});
