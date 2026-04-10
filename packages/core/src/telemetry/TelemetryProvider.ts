/**
 * TelemetryProvider — Main OpenTelemetry integration for HoloScript.
 *
 * Provides span-based tracing, metric recording, and OTLP export for
 * monitoring parse, compile, runtime, and network operations.
 *
 * Features:
 * - Distributed tracing with trace/span ID generation
 * - Configurable sampling (sampleRate 0..1)
 * - Automatic parser/compiler instrumentation wrappers
 * - EventEmitter notifications for span:end and metric:record
 * - OTLP JSON export to /v1/traces and /v1/metrics endpoints
 * - Prometheus text format export
 *
 * @module telemetry/TelemetryProvider
 */

import { EventEmitter } from 'events';
import { SpanFactory, generateTraceId, generateSpanId } from './SpanFactory';
import { MetricsCollector } from './MetricsCollector';
import type { MetricEntry } from './MetricsCollector';

// ---------------------------------------------------------------------------
// Public interfaces (re-exported from types.ts for backward compatibility)
// ---------------------------------------------------------------------------

export type { TelemetryConfig, SpanEvent, Span, Metric } from './types';

import type { TelemetryConfig, SpanEvent, Span, Metric } from './types';

// ---------------------------------------------------------------------------
// No-op span (returned when sampling decides not to trace)
// ---------------------------------------------------------------------------

const NOOP_SPAN: Span = {
  name: '',
  startTime: 0,
  attributes: {},
  status: 'unset',
  events: [],
  traceId: '',
  spanId: '',
  end() {
    /* noop */
  },
  setAttribute() {
    /* noop */
  },
  addEvent() {
    /* noop */
  },
};

// ---------------------------------------------------------------------------
// HoloScriptTelemetry class
// ---------------------------------------------------------------------------

export class HoloScriptTelemetry extends EventEmitter {
  private readonly config: TelemetryConfig;
  private readonly spans: Span[] = [];
  private readonly completedSpans: Span[] = [];
  private readonly spanFactory: SpanFactory;
  private readonly metricsCollector: MetricsCollector;

  constructor(config: TelemetryConfig) {
    super();
    this.config = {
      enabled: true,
      ...config,
    };
    this.spanFactory = new SpanFactory();
    this.metricsCollector = new MetricsCollector();
  }

  // -----------------------------------------------------------------------
  // Configuration helpers
  // -----------------------------------------------------------------------

  get enabled(): boolean {
    return this.config.enabled !== false;
  }

  get sampleRate(): number {
    return this.config.sampleRate;
  }

  private shouldSample(): boolean {
    if (!this.enabled) return false;
    return Math.random() < this.config.sampleRate;
  }

  // -----------------------------------------------------------------------
  // Span management
  // -----------------------------------------------------------------------

  /**
   * Start a new span. Returns a no-op span when sampling decides not to
   * trace this request.
   */
  startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
    parentSpan?: Span
  ): Span {
    if (!this.shouldSample()) return NOOP_SPAN;

    const traceId = parentSpan ? parentSpan.traceId : generateTraceId();
    const parentSpanId = parentSpan ? parentSpan.spanId : undefined;
    const spanId = generateSpanId();
    const events: SpanEvent[] = [];
    const attrs: Record<string, string | number | boolean> = {
      ...this.config.customAttributes,
      ...attributes,
    };

    const self = this;
    const span: Span = {
      name,
      startTime: Date.now(),
      endTime: undefined,
      attributes: attrs,
      status: 'unset',
      events,
      traceId,
      spanId,
      parentSpanId,

      end(status?: 'ok' | 'error') {
        span.endTime = Date.now();
        if (status) {
          span.status = status;
        } else if (span.status === 'unset') {
          span.status = 'ok';
        }
        // Move from active to completed
        const idx = self.spans.indexOf(span);
        if (idx !== -1) self.spans.splice(idx, 1);
        self.completedSpans.push(span);
        self.emit('span:end', span);
      },

      setAttribute(key: string, value: string | number | boolean) {
        span.attributes[key] = value;
      },

      addEvent(eventName: string, eventAttributes?: Record<string, string | number | boolean>) {
        events.push({
          name: eventName,
          timestamp: Date.now(),
          attributes: eventAttributes,
        });
      },
    };

    this.spans.push(span);
    return span;
  }

  // -----------------------------------------------------------------------
  // Metric recording helpers
  // -----------------------------------------------------------------------

  /**
   * Record a parse duration (histogram, milliseconds).
   */
  recordParseTime(duration: number, fileType: string): void {
    this.metricsCollector.recordHistogram('holoscript.parse.duration', duration, {
      file_type: fileType,
    });
    this.emitMetric('holoscript.parse.duration', 'histogram', duration, { file_type: fileType });
  }

  /**
   * Record a compile duration (histogram, milliseconds).
   */
  recordCompileTime(duration: number, target: string): void {
    this.metricsCollector.recordHistogram('holoscript.compile.duration', duration, {
      target,
    });
    this.emitMetric('holoscript.compile.duration', 'histogram', duration, { target });
  }

  /**
   * Record an error occurrence (counter).
   */
  recordError(error: Error | string, context: string): void {
    const message = error instanceof Error ? error.message : error;
    this.metricsCollector.incrementCounter('holoscript.errors', 1, {
      context,
      message: message.slice(0, 128),
    });
    this.emitMetric('holoscript.errors', 'counter', 1, { context });
  }

  /**
   * Record the object count for a composition (gauge).
   */
  recordObjectCount(count: number, composition: string): void {
    this.metricsCollector.setGauge('holoscript.objects.count', count, {
      composition,
    });
    this.emitMetric('holoscript.objects.count', 'gauge', count, { composition });
  }

  /**
   * Record a trait usage occurrence (counter).
   */
  recordTraitUsage(traitName: string): void {
    this.metricsCollector.incrementCounter('holoscript.trait.usage', 1, {
      trait: traitName,
    });
    this.emitMetric('holoscript.trait.usage', 'counter', 1, { trait: traitName });
  }

  /**
   * Record a cache hit (counter).
   */
  recordCacheHit(cacheType: string): void {
    this.metricsCollector.incrementCounter('holoscript.cache.hit', 1, {
      cache_type: cacheType,
    });
    this.emitMetric('holoscript.cache.hit', 'counter', 1, { cache_type: cacheType });
  }

  /**
   * Record a cache miss (counter).
   */
  recordCacheMiss(cacheType: string): void {
    this.metricsCollector.incrementCounter('holoscript.cache.miss', 1, {
      cache_type: cacheType,
    });
    this.emitMetric('holoscript.cache.miss', 'counter', 1, { cache_type: cacheType });
  }

  // -----------------------------------------------------------------------
  // Retrieval
  // -----------------------------------------------------------------------

  /**
   * Return all recorded metric entries.
   */
  getMetrics(): MetricEntry[] {
    return this.metricsCollector.getAllEntries();
  }

  /**
   * Return all completed spans.
   */
  getTraces(): Span[] {
    return [...this.completedSpans];
  }

  /**
   * Get the underlying MetricsCollector (for direct access / Prometheus export).
   */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  /**
   * Flush traces and metrics to the configured OTLP endpoint.
   * POSTs to {endpoint}/v1/traces and {endpoint}/v1/metrics.
   *
   * Returns true if both exports succeed, false otherwise.
   * If `fetch` is not available (e.g., older Node) the flush is skipped.
   */
  async flush(): Promise<boolean> {
    if (!this.enabled) return false;

    const endpoint = this.config.endpoint.replace(/\/$/, '');
    const fetchFn = typeof fetch === 'function' ? fetch : undefined;
    if (!fetchFn) return false;

    const tracesPayload = this.buildOTLPTraces();
    const metricsPayload = this.metricsCollector.toOTLP(this.config.serviceName);

    try {
      const [tracesRes, metricsRes] = await Promise.all([
        fetchFn(`${endpoint}/v1/traces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tracesPayload),
        }),
        fetchFn(`${endpoint}/v1/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metricsPayload),
        }),
      ]);

      // Clear completed spans after successful export
      if (tracesRes.ok) {
        this.completedSpans.length = 0;
      }

      return tracesRes.ok && metricsRes.ok;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Instrumentation wrappers
  // -----------------------------------------------------------------------

  /**
   * Instrument a parser object by wrapping its `parse()` method to
   * automatically create spans and record parse time metrics.
   */
  instrumentParser<T extends { parse: (...args: unknown[]) => unknown }>(parser: T): T {
    if (!this.config.enabledInstrumentations.includes('parse')) return parser;

    const original = parser.parse.bind(parser);
    const self = this;

    parser.parse = function instrumentedParse(...args: unknown[]) {
      const span = self.startSpan('holoscript.parse', {
        'parse.input_length': typeof args[0] === 'string' ? args[0].length : 0,
      });

      const start = Date.now();
      try {
        const result = original(...args);
        const duration = Date.now() - start;
        self.recordParseTime(duration, 'hsplus');
        span.setAttribute('parse.duration_ms', duration);
        span.end('ok');
        return result;
      } catch (err) {
        const duration = Date.now() - start;
        self.recordParseTime(duration, 'hsplus');
        self.recordError(err instanceof Error ? err : new Error(String(err)), 'parse');
        span.setAttribute('error.message', err instanceof Error ? err.message : String(err));
        span.end('error');
        throw err;
      }
    } as T['parse'];

    return parser;
  }

  /**
   * Instrument a compiler object by wrapping its `compile()` method to
   * automatically create spans and record compile time metrics.
   */
  instrumentCompiler<T extends { compile: (...args: unknown[]) => unknown }>(compiler: T): T {
    if (!this.config.enabledInstrumentations.includes('compile')) return compiler;

    const original = compiler.compile.bind(compiler);
    const self = this;

    compiler.compile = function instrumentedCompile(...args: unknown[]) {
      const span = self.startSpan('holoscript.compile');
      const start = Date.now();

      try {
        const result = original(...args);

        // Handle async compilation
        if (result instanceof Promise) {
          return result
            .then((value: unknown) => {
              const duration = Date.now() - start;
              self.recordCompileTime(duration, 'r3f');
              span.setAttribute('compile.duration_ms', duration);
              span.end('ok');
              return value;
            })
            .catch((err: unknown) => {
              const duration = Date.now() - start;
              self.recordCompileTime(duration, 'r3f');
              self.recordError(err instanceof Error ? err : new Error(String(err)), 'compile');
              span.end('error');
              throw err;
            });
        }

        const duration = Date.now() - start;
        self.recordCompileTime(duration, 'r3f');
        span.setAttribute('compile.duration_ms', duration);
        span.end('ok');
        return result;
      } catch (err) {
        const duration = Date.now() - start;
        self.recordCompileTime(duration, 'r3f');
        self.recordError(err instanceof Error ? err : new Error(String(err)), 'compile');
        span.setAttribute('error.message', err instanceof Error ? err.message : String(err));
        span.end('error');
        throw err;
      }
    } as T['compile'];

    return compiler;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private emitMetric(
    name: string,
    type: 'counter' | 'histogram' | 'gauge',
    value: number,
    labels: Record<string, string>
  ): void {
    const metric: Metric = { name, type, value, labels, timestamp: Date.now() };
    this.emit('metric:record', metric);
  }

  private buildOTLPTraces(): object {
    const spans = this.completedSpans.map((s) => ({
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId: s.parentSpanId ?? '',
      name: s.name,
      kind: 1, // INTERNAL
      startTimeUnixNano: String(s.startTime * 1_000_000),
      endTimeUnixNano: String((s.endTime ?? s.startTime) * 1_000_000),
      attributes: Object.entries(s.attributes).map(([k, v]) => ({
        key: k,
        value:
          typeof v === 'string'
            ? { stringValue: v }
            : typeof v === 'number'
              ? { intValue: v }
              : { boolValue: v },
      })),
      status: {
        code: s.status === 'ok' ? 1 : s.status === 'error' ? 2 : 0,
      },
      events: s.events.map((e) => ({
        name: e.name,
        timeUnixNano: String(e.timestamp * 1_000_000),
        attributes: e.attributes
          ? Object.entries(e.attributes).map(([k, v]) => ({
              key: k,
              value:
                typeof v === 'string'
                  ? { stringValue: v }
                  : typeof v === 'number'
                    ? { intValue: v }
                    : { boolValue: v },
            }))
          : [],
      })),
    }));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.config.serviceName },
              },
              ...(this.config.customAttributes
                ? Object.entries(this.config.customAttributes).map(([k, v]) => ({
                    key: k,
                    value: { stringValue: v },
                  }))
                : []),
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'holoscript-telemetry', version: '1.0.0' },
              spans,
            },
          ],
        },
      ],
    };
  }
}
