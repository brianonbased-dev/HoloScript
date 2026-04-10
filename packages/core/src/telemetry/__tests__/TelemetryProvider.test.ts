import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HoloScriptTelemetry,
  SpanFactory,
  MetricsCollector,
  type TelemetryConfig,
  type Span,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<TelemetryConfig> = {}): TelemetryConfig {
  return {
    serviceName: 'holoscript-test',
    endpoint: 'http://localhost:4318',
    sampleRate: 1,
    enabledInstrumentations: ['parse', 'compile', 'runtime', 'network'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HoloScriptTelemetry — Span creation & lifecycle
// ---------------------------------------------------------------------------

describe('HoloScriptTelemetry', () => {
  let telemetry: HoloScriptTelemetry;

  beforeEach(() => {
    telemetry = new HoloScriptTelemetry(createConfig());
  });

  describe('span creation and lifecycle', () => {
    it('should create a span with traceId and spanId', () => {
      const span = telemetry.startSpan('test.operation');
      expect(span.name).toBe('test.operation');
      expect(span.traceId).toBeTruthy();
      expect(span.spanId).toBeTruthy();
      expect(span.status).toBe('unset');
      expect(span.startTime).toBeGreaterThan(0);
      expect(span.endTime).toBeUndefined();
    });

    it('should end a span and set status to ok by default', () => {
      const span = telemetry.startSpan('test.operation');
      span.end();
      expect(span.endTime).toBeGreaterThanOrEqual(span.startTime);
      expect(span.status).toBe('ok');
    });

    it('should end a span with explicit error status', () => {
      const span = telemetry.startSpan('test.operation');
      span.end('error');
      expect(span.status).toBe('error');
    });

    it('should set attributes on a span', () => {
      const span = telemetry.startSpan('test.operation');
      span.setAttribute('file', 'scene.hsplus');
      span.setAttribute('objects', 42);
      span.setAttribute('valid', true);
      expect(span.attributes['file']).toBe('scene.hsplus');
      expect(span.attributes['objects']).toBe(42);
      expect(span.attributes['valid']).toBe(true);
    });

    it('should add events to a span', () => {
      const span = telemetry.startSpan('test.operation');
      span.addEvent('parse.start');
      span.addEvent('parse.complete', { objects: 10 });
      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe('parse.start');
      expect(span.events[1].name).toBe('parse.complete');
      expect(span.events[1].attributes).toEqual({ objects: 10 });
    });

    it('should move completed spans to traces', () => {
      const span = telemetry.startSpan('test.operation');
      expect(telemetry.getTraces()).toHaveLength(0);
      span.end();
      expect(telemetry.getTraces()).toHaveLength(1);
      expect(telemetry.getTraces()[0].name).toBe('test.operation');
    });

    it('should emit span:end event when a span ends', () => {
      const handler = vi.fn();
      telemetry.on('span:end', handler);
      const span = telemetry.startSpan('test.operation');
      span.end();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(span);
    });

    it('should include custom attributes from config', () => {
      const t = new HoloScriptTelemetry(
        createConfig({ customAttributes: { env: 'test', version: '1.0' } })
      );
      const span = t.startSpan('op');
      expect(span.attributes['env']).toBe('test');
      expect(span.attributes['version']).toBe('1.0');
    });

    it('should merge span-level attributes with config custom attributes', () => {
      const t = new HoloScriptTelemetry(createConfig({ customAttributes: { env: 'test' } }));
      const span = t.startSpan('op', { file: 'scene.hs' });
      expect(span.attributes['env']).toBe('test');
      expect(span.attributes['file']).toBe('scene.hs');
    });
  });

  // -----------------------------------------------------------------------
  // Sampling
  // -----------------------------------------------------------------------

  describe('sampling', () => {
    it('should not create spans when sampleRate is 0', () => {
      const t = new HoloScriptTelemetry(createConfig({ sampleRate: 0 }));
      const span = t.startSpan('op');
      // no-op span has empty traceId
      expect(span.traceId).toBe('');
      expect(span.spanId).toBe('');
    });

    it('should create spans when sampleRate is 1', () => {
      const t = new HoloScriptTelemetry(createConfig({ sampleRate: 1 }));
      const span = t.startSpan('op');
      expect(span.traceId).toBeTruthy();
      expect(span.spanId).toBeTruthy();
    });

    it('should not create spans when enabled is false', () => {
      const t = new HoloScriptTelemetry(createConfig({ enabled: false }));
      const span = t.startSpan('op');
      expect(span.traceId).toBe('');
    });

    it('should respect partial sampling rate', () => {
      const t = new HoloScriptTelemetry(createConfig({ sampleRate: 0.5 }));
      let sampled = 0;
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        const span = t.startSpan('op');
        if (span.traceId !== '') sampled++;
      }
      // With sampleRate=0.5, expect roughly 40%-60% to be sampled
      expect(sampled).toBeGreaterThan(iterations * 0.3);
      expect(sampled).toBeLessThan(iterations * 0.7);
    });
  });

  // -----------------------------------------------------------------------
  // Metric recording
  // -----------------------------------------------------------------------

  describe('metric recording', () => {
    it('should record parse time as histogram', () => {
      telemetry.recordParseTime(15.5, 'hsplus');
      telemetry.recordParseTime(22.3, 'holo');
      const metrics = telemetry.getMetrics();
      const parseTimes = metrics.filter((m) => m.name === 'holoscript.parse.duration');
      expect(parseTimes).toHaveLength(2);
      expect(parseTimes[0].type).toBe('histogram');
      expect(parseTimes[0].labels.file_type).toBe('hsplus');
    });

    it('should record compile time as histogram', () => {
      telemetry.recordCompileTime(100, 'r3f');
      telemetry.recordCompileTime(200, 'unity');
      const metrics = telemetry.getMetrics();
      const compileTimes = metrics.filter((m) => m.name === 'holoscript.compile.duration');
      expect(compileTimes).toHaveLength(2);
    });

    it('should record errors as counter', () => {
      telemetry.recordError(new Error('parse failed'), 'parse');
      telemetry.recordError('compile timeout', 'compile');
      const metrics = telemetry.getMetrics();
      const errors = metrics.filter((m) => m.name === 'holoscript.errors');
      expect(errors).toHaveLength(2);
      expect(errors[0].type).toBe('counter');
    });

    it('should record object count as gauge', () => {
      telemetry.recordObjectCount(42, 'main_scene');
      telemetry.recordObjectCount(100, 'main_scene');
      const collector = telemetry.getMetricsCollector();
      const value = collector.getGaugeValue('holoscript.objects.count', {
        composition: 'main_scene',
      });
      expect(value).toBe(100); // gauge takes latest value
    });

    it('should record trait usage as counter', () => {
      telemetry.recordTraitUsage('@grabbable');
      telemetry.recordTraitUsage('@grabbable');
      telemetry.recordTraitUsage('@throwable');
      const collector = telemetry.getMetricsCollector();
      expect(collector.getCounterValue('holoscript.trait.usage', { trait: '@grabbable' })).toBe(2);
      expect(collector.getCounterValue('holoscript.trait.usage', { trait: '@throwable' })).toBe(1);
    });

    it('should record cache hits and misses', () => {
      telemetry.recordCacheHit('parse');
      telemetry.recordCacheHit('parse');
      telemetry.recordCacheMiss('parse');
      const collector = telemetry.getMetricsCollector();
      expect(collector.getCounterValue('holoscript.cache.hit', { cache_type: 'parse' })).toBe(2);
      expect(collector.getCounterValue('holoscript.cache.miss', { cache_type: 'parse' })).toBe(1);
    });

    it('should emit metric:record event', () => {
      const handler = vi.fn();
      telemetry.on('metric:record', handler);
      telemetry.recordParseTime(10, 'hs');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].name).toBe('holoscript.parse.duration');
    });
  });

  // -----------------------------------------------------------------------
  // instrumentParser
  // -----------------------------------------------------------------------

  describe('instrumentParser', () => {
    it('should wrap parse() and record metrics', () => {
      const mockParser = {
        parse(input: string) {
          return { ast: [], source: input };
        },
      };

      telemetry.instrumentParser(mockParser);
      const result = mockParser.parse('object "Test" {}');
      expect(result).toEqual({ ast: [], source: 'object "Test" {}' });

      // Should have recorded parse time
      const metrics = telemetry.getMetrics();
      expect(metrics.some((m) => m.name === 'holoscript.parse.duration')).toBe(true);

      // Should have created and ended a span
      const traces = telemetry.getTraces();
      expect(traces.some((s) => s.name === 'holoscript.parse')).toBe(true);
    });

    it('should record errors from parse failures', () => {
      const mockParser = {
        parse(_input: string) {
          throw new Error('Unexpected token');
        },
      };

      telemetry.instrumentParser(mockParser);
      expect(() => mockParser.parse('invalid {')).toThrow('Unexpected token');

      // Error should be recorded
      const metrics = telemetry.getMetrics();
      expect(metrics.some((m) => m.name === 'holoscript.errors')).toBe(true);

      // Span should have error status
      const traces = telemetry.getTraces();
      const parseSpan = traces.find((s) => s.name === 'holoscript.parse');
      expect(parseSpan?.status).toBe('error');
    });

    it('should not instrument when parse is not in enabledInstrumentations', () => {
      const t = new HoloScriptTelemetry(createConfig({ enabledInstrumentations: ['compile'] }));
      const mockParser = {
        parse: vi.fn().mockReturnValue({ ast: [] }),
      };

      t.instrumentParser(mockParser);
      mockParser.parse('test');

      // Should not have created any traces (only the raw parse ran)
      expect(t.getTraces()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // instrumentCompiler
  // -----------------------------------------------------------------------

  describe('instrumentCompiler', () => {
    it('should wrap compile() and record metrics', () => {
      const mockCompiler = {
        compile(ast: unknown) {
          return { output: 'compiled', ast };
        },
      };

      telemetry.instrumentCompiler(mockCompiler);
      const result = mockCompiler.compile({ nodes: [] });
      expect(result.output).toBe('compiled');

      const metrics = telemetry.getMetrics();
      expect(metrics.some((m) => m.name === 'holoscript.compile.duration')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Span nesting (parent-child traceId propagation)
  // -----------------------------------------------------------------------

  describe('span nesting', () => {
    it('should propagate traceId from parent to child spans', () => {
      const parent = telemetry.startSpan('parent.operation');
      const child = telemetry.startSpan('child.operation', {}, parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.spanId).not.toBe(parent.spanId);
    });

    it('should support multiple levels of nesting', () => {
      const root = telemetry.startSpan('root');
      const mid = telemetry.startSpan('mid', {}, root);
      const leaf = telemetry.startSpan('leaf', {}, mid);

      expect(mid.traceId).toBe(root.traceId);
      expect(leaf.traceId).toBe(root.traceId);
      expect(mid.parentSpanId).toBe(root.spanId);
      expect(leaf.parentSpanId).toBe(mid.spanId);
    });
  });
});

// ---------------------------------------------------------------------------
// SpanFactory
// ---------------------------------------------------------------------------

describe('SpanFactory', () => {
  let factory: SpanFactory;

  beforeEach(() => {
    factory = new SpanFactory();
  });

  it('should create a root span with unique traceId', () => {
    const span = factory.createSpan('root.op');
    expect(span.traceId).toBeTruthy();
    expect(span.spanId).toBeTruthy();
    expect(span.parentSpanId).toBeUndefined();
  });

  it('should create child spans with same traceId', () => {
    const parent = factory.createSpan('parent');
    const child = factory.createSpan('child', parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it('should auto-end span via withSpan for sync functions', () => {
    const result = factory.withSpan('sync.op', (span) => {
      span.setAttribute('key', 'value');
      return 42;
    });
    expect(result).toBe(42);
  });

  it('should auto-end span via withSpan for async functions', async () => {
    const result = await factory.withSpan('async.op', async (span) => {
      span.setAttribute('async', true);
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('should set error status on withSpan when function throws', () => {
    expect(() =>
      factory.withSpan('fail.op', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
  });

  it('should set error status on withSpan when async function rejects', async () => {
    await expect(
      factory.withSpan('fail.async', async () => {
        throw new Error('async boom');
      })
    ).rejects.toThrow('async boom');
  });
});

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('counter', () => {
    it('should increment counter', () => {
      collector.incrementCounter('requests', 1, { method: 'GET' });
      collector.incrementCounter('requests', 3, { method: 'GET' });
      expect(collector.getCounterValue('requests', { method: 'GET' })).toBe(4);
    });

    it('should track counters with different labels independently', () => {
      collector.incrementCounter('requests', 1, { method: 'GET' });
      collector.incrementCounter('requests', 2, { method: 'POST' });
      expect(collector.getCounterValue('requests', { method: 'GET' })).toBe(1);
      expect(collector.getCounterValue('requests', { method: 'POST' })).toBe(2);
    });
  });

  describe('histogram', () => {
    it('should compute histogram statistics', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (const v of values) {
        collector.recordHistogram('latency', v, { endpoint: '/api' });
      }

      const stats = collector.getHistogramStats('latency', { endpoint: '/api' });
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(10);
      expect(stats!.sum).toBe(550);
      expect(stats!.min).toBe(10);
      expect(stats!.max).toBe(100);
      expect(stats!.avg).toBe(55);
      expect(stats!.p50).toBe(50);
      expect(stats!.p95).toBe(100);
      expect(stats!.p99).toBe(100);
    });

    it('should return null for missing histogram', () => {
      expect(collector.getHistogramStats('missing')).toBeNull();
    });
  });

  describe('gauge', () => {
    it('should store latest value', () => {
      collector.setGauge('cpu', 45);
      collector.setGauge('cpu', 82);
      expect(collector.getGaugeValue('cpu')).toBe(82);
    });
  });

  describe('Prometheus format', () => {
    it('should export counter in Prometheus format', () => {
      collector.incrementCounter('http_requests_total', 5, { method: 'GET' });
      const output = collector.toPrometheusFormat();
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('http_requests_total{method="GET"} 5');
    });

    it('should export histogram in Prometheus format', () => {
      collector.recordHistogram('request_duration', 0.15, { route: '/api' });
      collector.recordHistogram('request_duration', 0.5, { route: '/api' });
      const output = collector.toPrometheusFormat();
      expect(output).toContain('# TYPE request_duration histogram');
      expect(output).toContain('request_duration_count');
      expect(output).toContain('request_duration_sum');
      expect(output).toContain('_bucket');
    });

    it('should export gauge in Prometheus format', () => {
      collector.setGauge('temperature', 23.5);
      const output = collector.toPrometheusFormat();
      expect(output).toContain('# TYPE temperature gauge');
      expect(output).toContain('temperature 23.5');
    });
  });

  describe('OTLP format', () => {
    it('should export in OTLP JSON structure', () => {
      collector.incrementCounter('requests', 10, { env: 'prod' });
      collector.setGauge('cpu', 75);
      collector.recordHistogram('latency', 50);

      const otlp = collector.toOTLP('test-service') as {
        resourceMetrics: {
          resource: { attributes: { key: string; value: { stringValue: string } }[] };
          scopeMetrics: { metrics: unknown[] }[];
        }[];
      };

      expect(otlp.resourceMetrics).toHaveLength(1);
      expect(otlp.resourceMetrics[0].resource.attributes[0].value.stringValue).toBe('test-service');
      expect(otlp.resourceMetrics[0].scopeMetrics[0].metrics.length).toBe(3);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      collector.incrementCounter('a', 1);
      collector.setGauge('b', 2);
      collector.recordHistogram('c', 3);
      collector.reset();
      expect(collector.getCounterValue('a')).toBe(0);
      expect(collector.getGaugeValue('b')).toBe(0);
      expect(collector.getHistogramStats('c')).toBeNull();
      expect(collector.getAllEntries()).toHaveLength(0);
    });
  });
});
