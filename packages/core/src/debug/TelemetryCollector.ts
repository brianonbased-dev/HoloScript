/**
 * Telemetry Collector
 * Sprint 4 Priority 8 - Agent Debugging & Telemetry
 *
 * Collects, buffers, and exports telemetry events from agents.
 */

import { EventEmitter } from 'events';
import { logger } from '../logger';
import type {
  TelemetryEvent,
  TelemetryEventType,
  TelemetrySeverity,
  TraceSpan,
  TraceContext,
  SpanEvent,
  SpanKind,
  SpanStatus,
  TelemetryConfig,
  TelemetryStats,
  AgentTelemetry,
  OTelSpan,
} from './TelemetryTypes';
import { DEFAULT_TELEMETRY_CONFIG } from './TelemetryTypes';

// =============================================================================
// TELEMETRY COLLECTOR
// =============================================================================

/**
 * TelemetryCollector - Collects and manages telemetry events
 */
export class TelemetryCollector extends EventEmitter {
  private config: TelemetryConfig;
  private events: TelemetryEvent[] = [];
  private spans: Map<string, TraceSpan> = new Map();
  private activeSpans: Set<string> = new Set();
  private stats: TelemetryStats;
  private flushTimer?: ReturnType<typeof setInterval>;
  private exportCallbacks: Array<(events: TelemetryEvent[], spans: TraceSpan[]) => Promise<void>> =
    [];

  constructor(config: Partial<TelemetryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };
    this.stats = this.initializeStats();

    if (this.config.enabled && this.config.flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  private initializeStats(): TelemetryStats {
    return {
      totalEvents: 0,
      eventsByType: {} as Record<TelemetryEventType, number>,
      eventsByAgent: {},
      avgLatency: 0,
      totalSpans: 0,
      activeSpans: 0,
      droppedEvents: 0,
      startTime: Date.now(),
      lastEventTime: 0,
    };
  }

  // ===========================================================================
  // EVENT COLLECTION
  // ===========================================================================

  /**
   * Record a telemetry event
   */
  record(event: Omit<TelemetryEvent, 'id' | 'timestamp'>): TelemetryEvent | null {
    if (!this.config.enabled) return null;

    // Check sampling
    if (Math.random() > this.config.samplingRate) return null;

    // Check event type filter
    if (!this.config.captureEvents.includes(event.type)) return null;

    // Check severity filter
    if (!this.shouldCaptureSeverity(event.severity)) return null;

    const telemetryEvent: TelemetryEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    // Buffer event
    if (this.events.length >= this.config.maxBufferSize) {
      this.events.shift(); // Remove oldest
      this.stats.droppedEvents++;
    }
    this.events.push(telemetryEvent);

    // Update stats
    this.updateStats(telemetryEvent);

    this.emit('event', telemetryEvent);
    return telemetryEvent;
  }

  /**
   * Record a convenience event
   */
  recordEvent(
    type: TelemetryEventType,
    agentId: string,
    data: Record<string, unknown> = {},
    severity: TelemetrySeverity = 'info'
  ): TelemetryEvent | null {
    return this.record({ type, agentId, data, severity });
  }

  /**
   * Record an error event
   */
  recordError(agentId: string, error: Error, context?: Record<string, unknown>): TelemetryEvent | null {
    return this.record({
      type: 'error',
      severity: 'error',
      agentId,
      data: {
        error: error.message,
        stack: error.stack,
        ...context,
      },
    });
  }

  private shouldCaptureSeverity(severity: TelemetrySeverity): boolean {
    const levels: TelemetrySeverity[] = ['debug', 'info', 'warn', 'error', 'critical'];
    const minIndex = levels.indexOf(this.config.minSeverity);
    const eventIndex = levels.indexOf(severity);
    return eventIndex >= minIndex;
  }

  private updateStats(event: TelemetryEvent): void {
    this.stats.totalEvents++;
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;
    this.stats.eventsByAgent[event.agentId] = (this.stats.eventsByAgent[event.agentId] || 0) + 1;
    this.stats.lastEventTime = event.timestamp;

    if (event.latency !== undefined) {
      const count = this.stats.totalEvents;
      this.stats.avgLatency =
        (this.stats.avgLatency * (count - 1) + event.latency) / count || event.latency;
    }
  }

  // ===========================================================================
  // TRACING
  // ===========================================================================

  /**
   * Start a new trace span
   */
  startSpan(
    name: string,
    options: {
      parentContext?: TraceContext;
      agentId?: string;
      attributes?: Record<string, unknown>;
      kind?: SpanKind;
    } = {}
  ): TraceSpan {
    const spanId = this.generateSpanId();
    const traceId = options.parentContext?.traceId || this.generateTraceId();

    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: options.parentContext?.spanId,
      traceFlags: 1, // sampled
      baggage: options.parentContext?.baggage || {},
    };

    const span: TraceSpan = {
      id: spanId,
      name,
      context,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      status: 'unset',
      attributes: {
        ...options.attributes,
        'agent.id': options.agentId,
      },
      events: [],
      links: [],
      kind: options.kind || 'internal',
    };

    this.spans.set(spanId, span);
    this.activeSpans.add(spanId);
    this.stats.totalSpans++;
    this.stats.activeSpans = this.activeSpans.size;

    this.emit('spanStart', span);
    return span;
  }

  /**
   * End a trace span
   */
  endSpan(spanId: string, status: SpanStatus = 'ok', statusMessage?: string): TraceSpan {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span not found: ${spanId}`);
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;
    span.statusMessage = statusMessage;

    this.activeSpans.delete(spanId);
    this.stats.activeSpans = this.activeSpans.size;

    this.emit('spanEnd', span);
    return span;
  }

  /**
   * Add an event to a span
   */
  addSpanEvent(spanId: string, name: string, attributes: Record<string, unknown> = {}): void {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span not found: ${spanId}`);
    }

    const event: SpanEvent = {
      name,
      timestamp: Date.now(),
      attributes,
    };

    span.events.push(event);
  }

  /**
   * Set span attributes
   */
  setSpanAttributes(spanId: string, attributes: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span) {
      throw new Error(`Span not found: ${spanId}`);
    }

    Object.assign(span.attributes, attributes);
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get all spans for a trace
   */
  getTraceSpans(traceId: string): TraceSpan[] {
    return Array.from(this.spans.values()).filter((s) => s.context.traceId === traceId);
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get events for an agent
   */
  getAgentEvents(agentId: string, limit?: number): TelemetryEvent[] {
    const events = this.events.filter((e) => e.agentId === agentId);
    return limit ? events.slice(-limit) : events;
  }

  /**
   * Get events by type
   */
  getEventsByType(type: TelemetryEventType, limit?: number): TelemetryEvent[] {
    const events = this.events.filter((e) => e.type === type);
    return limit ? events.slice(-limit) : events;
  }

  /**
   * Get events in time range
   */
  getEventsInRange(startTime: number, endTime: number): TelemetryEvent[] {
    return this.events.filter((e) => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Get recent events
   */
  getRecentEvents(count: number = 100): TelemetryEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Search events by data properties
   */
  searchEvents(predicate: (event: TelemetryEvent) => boolean): TelemetryEvent[] {
    return this.events.filter(predicate);
  }

  /**
   * Get aggregate telemetry for an agent
   */
  getAgentTelemetry(agentId: string): AgentTelemetry[] {
    return this.events
      .filter((e) => e.agentId === agentId)
      .map((event) => ({
        agentId,
        timestamp: event.timestamp,
        event,
        span: this.findSpanForEvent(event),
      }));
  }

  private findSpanForEvent(event: TelemetryEvent): TraceSpan | undefined {
    return Array.from(this.spans.values()).find(
      (s) =>
        s.attributes['agent.id'] === event.agentId &&
        event.timestamp >= s.startTime &&
        (s.endTime === 0 || event.timestamp <= s.endTime)
    );
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get current statistics
   */
  getStats(): TelemetryStats {
    return { ...this.stats, activeSpans: this.activeSpans.size };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  // ===========================================================================
  // EXPORT
  // ===========================================================================

  /**
   * Register an export callback
   */
  onExport(callback: (events: TelemetryEvent[], spans: TraceSpan[]) => Promise<void>): void {
    this.exportCallbacks.push(callback);
  }

  /**
   * Flush buffered events and spans
   */
  async flush(): Promise<void> {
    if (this.events.length === 0 && this.spans.size === 0) return;

    const eventsToExport = [...this.events];
    const completedSpans = Array.from(this.spans.values()).filter((s) => s.endTime > 0);

    for (const callback of this.exportCallbacks) {
      try {
        await callback(eventsToExport, completedSpans);
      } catch (error) {
        logger.error('[TelemetryCollector] Export failed:', { error });
      }
    }

    this.emit('flush', { events: eventsToExport.length, spans: completedSpans.length });

    // Clear exported events
    this.events = [];

    // Remove completed spans (keep active)
    for (const span of completedSpans) {
      this.spans.delete(span.id);
    }
  }

  /**
   * Export spans in OpenTelemetry format
   */
  exportToOTel(): OTelSpan[] {
    return Array.from(this.spans.values())
      .filter((s) => s.endTime > 0)
      .map((span) => this.convertToOTelSpan(span));
  }

  private convertToOTelSpan(span: TraceSpan): OTelSpan {
    const kindMap: Record<SpanKind, number> = {
      internal: 0,
      server: 1,
      client: 2,
      producer: 3,
      consumer: 4,
    };

    const statusMap: Record<SpanStatus, number> = {
      unset: 0,
      ok: 1,
      error: 2,
    };

    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      kind: kindMap[span.kind],
      startTimeUnixNano: (span.startTime * 1_000_000).toString(),
      endTimeUnixNano: (span.endTime * 1_000_000).toString(),
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value:
          typeof value === 'number'
            ? { intValue: value.toString() }
            : { stringValue: String(value) },
      })),
      events: span.events.map((e) => ({
        timeUnixNano: (e.timestamp * 1_000_000).toString(),
        name: e.name,
        attributes: Object.entries(e.attributes).map(([key, value]) => ({
          key,
          value: { stringValue: String(value) },
        })),
      })),
      status: {
        code: statusMap[span.status],
        message: span.statusMessage,
      },
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        logger.error('[TelemetryCollector] Auto-flush failed:', err);
      });
    }, this.config.flushInterval);
  }

  /**
   * Enable or disable telemetry
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (enabled && !this.flushTimer && this.config.flushInterval > 0) {
      this.startFlushTimer();
    } else if (!enabled && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.events = [];
    this.spans.clear();
    this.activeSpans.clear();
    this.resetStats();
  }

  /**
   * Destroy the collector
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.clear();
    this.removeAllListeners();
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private generateId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateSpanId(): string {
    return Math.random().toString(16).substring(2, 18).padStart(16, '0');
  }

  private generateTraceId(): string {
    return (
      Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 18)
    ).padStart(32, '0');
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultCollector: TelemetryCollector | null = null;

/**
 * Get or create the default TelemetryCollector instance
 */
export function getTelemetryCollector(config?: Partial<TelemetryConfig>): TelemetryCollector {
  if (!defaultCollector) {
    defaultCollector = new TelemetryCollector(config);
  }
  return defaultCollector;
}

/**
 * Reset the default collector (mainly for testing)
 */
export function resetTelemetryCollector(): void {
  if (defaultCollector) {
    defaultCollector.destroy();
    defaultCollector = null;
  }
}
