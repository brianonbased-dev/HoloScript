/**
 * SwarmMetrics Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SwarmMetrics } from '../SwarmMetrics';

describe('SwarmMetrics', () => {
  let metrics: SwarmMetrics;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    metrics = new SwarmMetrics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('counter metrics', () => {
    it('should register a counter metric', () => {
      metrics.register({
        name: 'request_count',
        type: 'counter',
        description: 'Total requests',
        unit: 'requests',
      });

      expect(metrics.getCounter('request_count')).toBe(0);
    });

    it('should increment counter', () => {
      metrics.register({ name: 'requests', type: 'counter', description: 'Requests' });

      metrics.increment('requests');
      expect(metrics.getCounter('requests')).toBe(1);

      metrics.increment('requests', 5);
      expect(metrics.getCounter('requests')).toBe(6);
    });

    it('should track counters incrementally', () => {
      metrics.register({ name: 'http_requests', type: 'counter', description: 'HTTP requests' });

      metrics.increment('http_requests', 1);
      metrics.increment('http_requests', 2);
      metrics.increment('http_requests', 1);

      // All increments add to the same counter
      expect(metrics.getCounter('http_requests')).toBe(4);
    });

    it('should allow negative increments', () => {
      metrics.register({ name: 'count', type: 'counter', description: 'Count' });

      metrics.increment('count', 10);
      metrics.increment('count', -5);

      expect(metrics.getCounter('count')).toBe(5);
    });
  });

  describe('gauge metrics', () => {
    it('should set gauge value', () => {
      metrics.register({ name: 'temperature', type: 'gauge', description: 'Temperature' });

      metrics.setGauge('temperature', 72.5);
      expect(metrics.getGauge('temperature')).toBe(72.5);

      metrics.setGauge('temperature', 68.0);
      expect(metrics.getGauge('temperature')).toBe(68.0);
    });

    it('should track gauge history', () => {
      metrics.register({ name: 'cpu_usage', type: 'gauge', description: 'CPU usage' });

      metrics.setGauge('cpu_usage', 0.45);
      metrics.setGauge('cpu_usage', 0.62);

      // getGauge returns the most recent value
      expect(metrics.getGauge('cpu_usage')).toBe(0.62);

      // History contains both values
      const history = metrics.getGaugeHistory('cpu_usage');
      expect(history).toHaveLength(2);
      expect(history[0].value).toBe(0.45);
      expect(history[1].value).toBe(0.62);
    });

    it('should allow negative gauge values', () => {
      metrics.register({ name: 'offset', type: 'gauge', description: 'Offset' });

      metrics.setGauge('offset', -10);
      expect(metrics.getGauge('offset')).toBe(-10);
    });
  });

  describe('histogram metrics', () => {
    it('should observe histogram values', () => {
      metrics.register({
        name: 'response_time',
        type: 'histogram',
        description: 'Response time',
      });
      metrics.setHistogramBoundaries('response_time', [0.1, 0.5, 1, 2, 5]);

      metrics.observeHistogram('response_time', 0.3);
      metrics.observeHistogram('response_time', 0.8);
      metrics.observeHistogram('response_time', 1.5);

      const histogram = metrics.getHistogram('response_time');
      expect(histogram).toBeDefined();
      expect(histogram!.count).toBe(3);
      expect(histogram!.sum).toBeCloseTo(2.6);
    });

    it('should distribute values into buckets', () => {
      metrics.register({
        name: 'latency',
        type: 'histogram',
        description: 'Latency',
      });
      metrics.setHistogramBoundaries('latency', [10, 50, 100, 500]);

      metrics.observeHistogram('latency', 5); // <=10
      metrics.observeHistogram('latency', 25); // <=50
      metrics.observeHistogram('latency', 75); // <=100
      metrics.observeHistogram('latency', 200); // <=500
      metrics.observeHistogram('latency', 600); // >500 (Inf bucket)

      const histogram = metrics.getHistogram('latency');
      expect(histogram!.count).toBe(5);
      // Counts: [<=10, <=50, <=100, <=500, +Inf]
      expect(histogram!.counts[0]).toBe(1); // <=10
      expect(histogram!.counts[1]).toBe(1); // <=50
      expect(histogram!.counts[2]).toBe(1); // <=100
      expect(histogram!.counts[3]).toBe(1); // <=500
      expect(histogram!.counts[4]).toBe(1); // +Inf
    });

    it('should accumulate histogram observations', () => {
      metrics.register({
        name: 'request_duration',
        type: 'histogram',
        description: 'Request duration',
      });
      metrics.setHistogramBoundaries('request_duration', [0.1, 0.5, 1]);

      metrics.observeHistogram('request_duration', 0.3);
      metrics.observeHistogram('request_duration', 0.8);
      metrics.observeHistogram('request_duration', 0.2);

      const histogram = metrics.getHistogram('request_duration');
      expect(histogram!.count).toBe(3);
      expect(histogram!.sum).toBeCloseTo(1.3);
    });
  });

  describe('summary metrics', () => {
    it('should calculate percentiles', () => {
      metrics.register({ name: 'request_size', type: 'summary', description: 'Request size' });

      // Add 100 observations: 1-100
      for (let i = 1; i <= 100; i++) {
        metrics.observeSummary('request_size', i);
      }

      const summary = metrics.getSummary('request_size');
      expect(summary).toBeDefined();
      expect(summary!.count).toBe(100);
      // Floor-based percentile calculation
      expect(summary!.p50).toBe(51); // floor(100 * 0.5) = 50, sorted[50] = 51
      expect(summary!.p90).toBe(91); // floor(100 * 0.9) = 90, sorted[90] = 91
      expect(summary!.p99).toBe(100); // floor(100 * 0.99) = 99, sorted[99] = 100
    });

    it('should accumulate summary observations', () => {
      metrics.register({ name: 'response_size', type: 'summary', description: 'Response size' });

      for (let i = 1; i <= 50; i++) {
        metrics.observeSummary('response_size', i);
      }
      for (let i = 100; i <= 150; i++) {
        metrics.observeSummary('response_size', i);
      }

      const summary = metrics.getSummary('response_size');
      expect(summary!.count).toBe(101);
    });

    it('should handle single observation', () => {
      metrics.register({ name: 'single', type: 'summary', description: 'Single' });

      metrics.observeSummary('single', 42);

      const summary = metrics.getSummary('single');
      expect(summary!.count).toBe(1);
      expect(summary!.p50).toBe(42);
      expect(summary!.p99).toBe(42);
    });
  });

  describe('getStats', () => {
    it('should return stats for all metric types', () => {
      metrics.register({ name: 'counter1', type: 'counter', description: 'Counter' });
      metrics.register({ name: 'gauge1', type: 'gauge', description: 'Gauge' });
      metrics.register({
        name: 'hist1',
        type: 'histogram',
        description: 'Histogram',
      });
      metrics.register({ name: 'summary1', type: 'summary', description: 'Summary' });

      metrics.increment('counter1', 5);
      metrics.setGauge('gauge1', 42);
      metrics.observeHistogram('hist1', 25);
      metrics.observeSummary('summary1', 100);

      const counterStats = metrics.getStats('counter1');
      expect(counterStats).toBeDefined();
      expect(counterStats!.currentValue).toBe(5);
      expect(counterStats!.type).toBe('counter');

      const gaugeStats = metrics.getStats('gauge1');
      expect(gaugeStats).toBeDefined();
      expect(gaugeStats!.currentValue).toBe(42);

      const histStats = metrics.getStats('hist1');
      expect(histStats).toBeDefined();
      expect(histStats!.count).toBe(1);

      const summaryStats = metrics.getStats('summary1');
      expect(summaryStats).toBeDefined();
      expect(summaryStats!.count).toBe(1);
    });

    it('should return undefined for unregistered metric', () => {
      expect(metrics.getStats('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllStats', () => {
    it('should return all metrics', () => {
      metrics.register({ name: 'a', type: 'counter', description: 'A' });
      metrics.register({ name: 'b', type: 'gauge', description: 'B' });

      metrics.increment('a');
      metrics.setGauge('b', 10);

      const all = metrics.getAllStats();
      expect(Object.keys(all).length).toBeGreaterThanOrEqual(2);
      expect(all['a']).toBeDefined();
      expect(all['b']).toBeDefined();
    });
  });

  describe('Prometheus export', () => {
    it('should export counter in Prometheus format', () => {
      metrics.register({
        name: 'http_requests_total',
        type: 'counter',
        description: 'Total HTTP requests',
      });
      metrics.increment('http_requests_total', 42);

      const output = metrics.toPrometheus();
      expect(output).toContain('# HELP http_requests_total Total HTTP requests');
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('http_requests_total 42');
    });

    it('should export gauge in Prometheus format', () => {
      metrics.register({
        name: 'memory_usage_bytes',
        type: 'gauge',
        description: 'Memory usage in bytes',
      });
      metrics.setGauge('memory_usage_bytes', 1024000);

      const output = metrics.toPrometheus();
      expect(output).toContain('# TYPE memory_usage_bytes gauge');
      expect(output).toContain('memory_usage_bytes 1024000');
    });

    it('should export histogram with buckets', () => {
      metrics.register({
        name: 'response_time_seconds',
        type: 'histogram',
        description: 'Response time in seconds',
      });
      metrics.setHistogramBoundaries('response_time_seconds', [0.1, 0.5, 1]);
      metrics.observeHistogram('response_time_seconds', 0.3);
      metrics.observeHistogram('response_time_seconds', 0.8);

      const output = metrics.toPrometheus();
      expect(output).toContain('# TYPE response_time_seconds histogram');
      expect(output).toContain('response_time_seconds_bucket{le="0.1"}');
      expect(output).toContain('response_time_seconds_bucket{le="+Inf"}');
      expect(output).toContain('response_time_seconds_sum');
      expect(output).toContain('response_time_seconds_count 2');
    });

    it('should export summary with quantiles', () => {
      metrics.register({
        name: 'request_duration',
        type: 'summary',
        description: 'Request duration',
      });
      for (let i = 1; i <= 100; i++) {
        metrics.observeSummary('request_duration', i);
      }

      const output = metrics.toPrometheus();
      expect(output).toContain('# TYPE request_duration summary');
      expect(output).toContain('request_duration{quantile="0.5"}');
      expect(output).toContain('request_duration{quantile="0.99"}');
      expect(output).toContain('request_duration_count 100');
    });

    it('should export multiple metrics', () => {
      metrics.register({ name: 'requests', type: 'counter', description: 'Requests' });
      metrics.increment('requests', 10);

      const output = metrics.toPrometheus();
      expect(output).toContain('requests 10');
    });
  });

  describe('reset', () => {
    it('should reset a single metric', () => {
      metrics.register({ name: 'test', type: 'counter', description: 'Test' });
      metrics.increment('test', 100);

      metrics.reset('test');

      // After reset, counter is back to 0
      expect(metrics.getCounter('test')).toBe(0);
    });

    it('should reset all metrics', () => {
      metrics.register({ name: 'a', type: 'counter', description: 'A' });
      metrics.register({ name: 'b', type: 'counter', description: 'B' });
      metrics.increment('a', 10);
      metrics.increment('b', 20);

      metrics.resetAll();

      expect(metrics.getCounter('a')).toBe(0);
      expect(metrics.getCounter('b')).toBe(0);
    });
  });

  describe('retention and limits', () => {
    it('should respect maxSamples for summary', () => {
      const limitedMetrics = new SwarmMetrics({ maxSamples: 10 });
      limitedMetrics.register({ name: 'test', type: 'summary', description: 'Test' });

      // Add 20 samples
      for (let i = 0; i < 20; i++) {
        limitedMetrics.observeSummary('test', i);
      }

      const summary = limitedMetrics.getSummary('test');
      // Only keeps last 10 samples
      expect(summary!.count).toBe(10);
    });
  });
});
