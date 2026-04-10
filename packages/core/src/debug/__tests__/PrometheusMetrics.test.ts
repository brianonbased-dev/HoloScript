/**
 * PrometheusMetricsRegistry tests — v5.6 "Observable Platform"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrometheusMetricsRegistry,
  getPrometheusMetrics,
  resetPrometheusMetrics,
} from '../PrometheusMetrics';
import { TelemetryCollector } from '../TelemetryCollector';

describe('PrometheusMetricsRegistry', () => {
  let registry: PrometheusMetricsRegistry;

  beforeEach(() => {
    registry = new PrometheusMetricsRegistry('test');
    resetPrometheusMetrics();
  });

  // ===========================================================================
  // COUNTERS
  // ===========================================================================

  describe('counters', () => {
    it('registers and increments a counter', () => {
      registry.registerCounter('requests_total', 'Total HTTP requests');
      registry.incCounter('requests_total');
      registry.incCounter('requests_total');

      expect(registry.getValue('requests_total')).toBe(2);
    });

    it('supports labels on counters', () => {
      registry.registerCounter('requests_total', 'Total requests');
      registry.incCounter('requests_total', { method: 'GET' }, 5);
      registry.incCounter('requests_total', { method: 'POST' }, 3);

      expect(registry.getValue('requests_total', { method: 'GET' })).toBe(5);
      expect(registry.getValue('requests_total', { method: 'POST' })).toBe(3);
    });

    it('increments by custom amount', () => {
      registry.registerCounter('bytes_total', 'Total bytes');
      registry.incCounter('bytes_total', {}, 1024);
      registry.incCounter('bytes_total', {}, 512);

      expect(registry.getValue('bytes_total')).toBe(1536);
    });

    it('ignores increment on unregistered metric', () => {
      registry.incCounter('nonexistent');
      expect(registry.getValue('nonexistent')).toBeUndefined();
    });
  });

  // ===========================================================================
  // GAUGES
  // ===========================================================================

  describe('gauges', () => {
    it('registers and sets a gauge', () => {
      registry.registerGauge('temperature', 'Current temperature');
      registry.setGauge('temperature', 22.5);

      expect(registry.getValue('temperature')).toBe(22.5);
    });

    it('increments and decrements a gauge', () => {
      registry.registerGauge('active_connections', 'Active connections');
      registry.incGauge('active_connections');
      registry.incGauge('active_connections');
      registry.decGauge('active_connections');

      expect(registry.getValue('active_connections')).toBe(1);
    });

    it('supports labels on gauges', () => {
      registry.registerGauge('queue_size', 'Queue size');
      registry.setGauge('queue_size', 10, { queue: 'high' });
      registry.setGauge('queue_size', 5, { queue: 'low' });

      expect(registry.getValue('queue_size', { queue: 'high' })).toBe(10);
      expect(registry.getValue('queue_size', { queue: 'low' })).toBe(5);
    });
  });

  // ===========================================================================
  // HISTOGRAMS
  // ===========================================================================

  describe('histograms', () => {
    it('registers and observes values', () => {
      registry.registerHistogram('latency_ms', 'Request latency', [10, 50, 100, 500]);
      registry.observe('latency_ms', 25);
      registry.observe('latency_ms', 75);
      registry.observe('latency_ms', 150);

      const data = registry.getHistogram('latency_ms');
      expect(data).toBeDefined();
      expect(data!.count).toBe(3);
      expect(data!.sum).toBe(250);

      // Bucket counts: [10]=0, [50]=1, [100]=2, [500]=3, [+Inf]=3
      expect(data!.bucketCounts[0]).toBe(0); // <= 10
      expect(data!.bucketCounts[1]).toBe(1); // <= 50
      expect(data!.bucketCounts[2]).toBe(2); // <= 100
      expect(data!.bucketCounts[3]).toBe(3); // <= 500
      expect(data!.bucketCounts[4]).toBe(3); // +Inf
    });

    it('supports labels on histograms', () => {
      registry.registerHistogram('duration', 'Duration', [10, 100]);
      registry.observe('duration', 5, { method: 'GET' });
      registry.observe('duration', 50, { method: 'POST' });

      const getHist = registry.getHistogram('duration', { method: 'GET' });
      expect(getHist!.count).toBe(1);

      const postHist = registry.getHistogram('duration', { method: 'POST' });
      expect(postHist!.count).toBe(1);
    });

    it('sorts buckets automatically', () => {
      registry.registerHistogram('unsorted', 'Test', [100, 10, 50]);
      registry.observe('unsorted', 25);

      const data = registry.getHistogram('unsorted');
      // Buckets should be sorted: [10, 50, 100]
      // 25 is <= 50 and <= 100 but not <= 10
      expect(data!.bucketCounts[0]).toBe(0); // <= 10
      expect(data!.bucketCounts[1]).toBe(1); // <= 50
      expect(data!.bucketCounts[2]).toBe(1); // <= 100
    });
  });

  // ===========================================================================
  // PROMETHEUS TEXT FORMAT
  // ===========================================================================

  describe('toPrometheusText', () => {
    it('produces valid Prometheus exposition text for counters', () => {
      registry.registerCounter('http_requests_total', 'Total HTTP requests');
      registry.incCounter('http_requests_total', { method: 'GET' }, 42);

      const text = registry.toPrometheusText();

      expect(text).toContain('# HELP test_http_requests_total Total HTTP requests');
      expect(text).toContain('# TYPE test_http_requests_total counter');
      expect(text).toContain('test_http_requests_total{method="GET"} 42');
    });

    it('produces valid Prometheus exposition text for histograms', () => {
      registry.registerHistogram('response_time', 'Response time', [10, 100]);
      registry.observe('response_time', 5);
      registry.observe('response_time', 50);

      const text = registry.toPrometheusText();

      expect(text).toContain('# TYPE test_response_time histogram');
      expect(text).toContain('test_response_time_bucket{le="10"} 1');
      expect(text).toContain('test_response_time_bucket{le="100"} 2');
      expect(text).toContain('test_response_time_bucket{le="+Inf"} 2');
      expect(text).toContain('test_response_time_sum 55');
      expect(text).toContain('test_response_time_count 2');
    });

    it('escapes special characters in label values', () => {
      registry.registerCounter('test_metric', 'Test');
      registry.incCounter('test_metric', { path: '/api/v1/"test"' });

      const text = registry.toPrometheusText();
      expect(text).toContain('path="/api/v1/\\"test\\""');
    });
  });

  // ===========================================================================
  // METRIC NAMES
  // ===========================================================================

  it('lists all registered metric names', () => {
    registry.registerCounter('a', 'A');
    registry.registerGauge('b', 'B');
    registry.registerHistogram('c', 'C');

    const names = registry.getMetricNames();
    expect(names).toContain('test_a');
    expect(names).toContain('test_b');
    expect(names).toContain('test_c');
  });

  // ===========================================================================
  // RESET
  // ===========================================================================

  it('resets all metrics', () => {
    registry.registerCounter('x', 'X');
    registry.incCounter('x', {}, 100);
    registry.reset();

    expect(registry.getMetricNames()).toHaveLength(0);
  });

  // ===========================================================================
  // TELEMETRY INTEGRATION
  // ===========================================================================

  describe('linkTelemetry', () => {
    it('auto-records metrics from TelemetryCollector events', () => {
      const collector = new TelemetryCollector({ enabled: true, flushInterval: 0 });
      registry.linkTelemetry(collector);

      // Start and end a span
      const span = collector.startSpan('test-op', { agentId: 'agent-1' });
      collector.endSpan(span.id, 'ok');

      // Check that metrics were recorded
      expect(registry.getValue('spans_total')).toBe(1);
      // active_spans should be 0 (started then ended)
      expect(registry.getValue('active_spans')).toBe(0);

      collector.destroy();
    });

    it('tracks delegation events', () => {
      const collector = new TelemetryCollector({ enabled: true, flushInterval: 0 });
      registry.linkTelemetry(collector);

      collector.record({
        type: 'task_completed',
        severity: 'info',
        agentId: 'agent-1',
        data: {},
      });

      collector.record({
        type: 'task_failed',
        severity: 'error',
        agentId: 'agent-2',
        data: {},
      });

      expect(registry.getValue('delegation_total', { status: 'completed' })).toBe(1);
      expect(registry.getValue('delegation_total', { status: 'failed' })).toBe(1);
      expect(registry.getValue('delegation_errors_total', { agent: 'agent-2' })).toBe(1);

      collector.destroy();
    });
  });

  // ===========================================================================
  // SINGLETON
  // ===========================================================================

  describe('singleton', () => {
    it('returns the same instance', () => {
      const a = getPrometheusMetrics();
      const b = getPrometheusMetrics();
      expect(a).toBe(b);
    });

    it('resets on resetPrometheusMetrics', () => {
      const a = getPrometheusMetrics();
      resetPrometheusMetrics();
      const b = getPrometheusMetrics();
      expect(a).not.toBe(b);
    });
  });
});
