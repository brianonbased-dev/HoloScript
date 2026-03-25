/**
 * @holoscript/core - Structured Logger
 *
 * JSON-formatted log entries with W3C trace correlation (traceId, spanId).
 * Supports multiple sinks: console (dev), json-file (prod), noop (test).
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import type { TraceContext } from './TelemetryTypes';

// =============================================================================
// TYPES
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogSinkType = 'console' | 'json-array' | 'noop' | 'custom';

export interface LogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Log severity level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Trace correlation (optional) */
  traceId?: string;
  /** Span correlation (optional) */
  spanId?: string;
  /** Service name */
  service: string;
  /** Structured metadata */
  attributes: Record<string, unknown>;
}

export interface LogSink {
  /** Write a log entry */
  write(entry: LogEntry): void;
  /** Flush any buffered entries */
  flush?(): void;
}

export interface StructuredLoggerConfig {
  /** Service name (default 'holoscript') */
  serviceName?: string;
  /** Minimum log level (default 'info') */
  minLevel?: LogLevel;
  /** Log sink type (default 'console') */
  sinkType?: LogSinkType;
  /** Custom sink implementation (when sinkType is 'custom') */
  customSink?: LogSink;
}

// =============================================================================
// LEVEL ORDERING
// =============================================================================

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// =============================================================================
// BUILT-IN SINKS
// =============================================================================

class ConsoleSink implements LogSink {
  write(entry: LogEntry): void {
    const line = JSON.stringify(entry);
    switch (entry.level) {
      case 'debug':
        console.debug(line);
        break;
      case 'info':
        console.info(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
      case 'fatal':
        console.error(line);
        break;
    }
  }
}

/**
 * In-memory JSON array sink. Useful for testing and prod log collection.
 */
export class JsonArraySink implements LogSink {
  private entries: LogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 10_000) {
    this.maxEntries = maxEntries;
  }

  write(entry: LogEntry): void {
    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
    this.entries.push(entry);
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

class NoopSink implements LogSink {
  write(): void {
    // intentionally empty
  }
}

// =============================================================================
// STRUCTURED LOGGER
// =============================================================================

export class StructuredLogger {
  private sink: LogSink;
  private serviceName: string;
  private minLevel: LogLevel;
  private activeTraceContext: TraceContext | null = null;

  constructor(config: StructuredLoggerConfig = {}) {
    this.serviceName = config.serviceName ?? 'holoscript';
    this.minLevel = config.minLevel ?? 'info';

    switch (config.sinkType ?? 'console') {
      case 'json-array':
        this.sink = new JsonArraySink();
        break;
      case 'noop':
        this.sink = new NoopSink();
        break;
      case 'custom':
        this.sink = config.customSink ?? new NoopSink();
        break;
      default:
        this.sink = new ConsoleSink();
        break;
    }
  }

  // ===========================================================================
  // LOG METHODS
  // ===========================================================================

  debug(message: string, attributes: Record<string, unknown> = {}): void {
    this.log('debug', message, attributes);
  }

  info(message: string, attributes: Record<string, unknown> = {}): void {
    this.log('info', message, attributes);
  }

  warn(message: string, attributes: Record<string, unknown> = {}): void {
    this.log('warn', message, attributes);
  }

  error(message: string, attributes: Record<string, unknown> = {}): void {
    this.log('error', message, attributes);
  }

  fatal(message: string, attributes: Record<string, unknown> = {}): void {
    this.log('fatal', message, attributes);
  }

  // ===========================================================================
  // CORE LOG
  // ===========================================================================

  /**
   * Write a structured log entry.
   */
  log(level: LogLevel, message: string, attributes: Record<string, unknown> = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      attributes,
    };

    // Add trace correlation if available
    if (this.activeTraceContext) {
      entry.traceId = this.activeTraceContext.traceId;
      entry.spanId = this.activeTraceContext.spanId;
    }

    this.sink.write(entry);
  }

  // ===========================================================================
  // TRACE CORRELATION
  // ===========================================================================

  /**
   * Set the active trace context for log correlation.
   * All subsequent logs will include the trace/span IDs.
   */
  setTraceContext(context: TraceContext | null): void {
    this.activeTraceContext = context;
  }

  /**
   * Get the active trace context.
   */
  getTraceContext(): TraceContext | null {
    return this.activeTraceContext;
  }

  /**
   * Execute a function with trace context set, then restore previous context.
   */
  withTraceContext<T>(context: TraceContext, fn: () => T): T {
    const prev = this.activeTraceContext;
    this.activeTraceContext = context;
    try {
      return fn();
    } finally {
      this.activeTraceContext = prev;
    }
  }

  // ===========================================================================
  // CHILD LOGGER
  // ===========================================================================

  /**
   * Create a child logger with additional default attributes.
   */
  child(defaultAttributes: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, defaultAttributes);
  }

  // ===========================================================================
  // SINK ACCESS
  // ===========================================================================

  /**
   * Get the underlying sink (useful for JsonArraySink.getEntries()).
   */
  getSink(): LogSink {
    return this.sink;
  }

  /**
   * Flush the sink if it supports flushing.
   */
  flush(): void {
    this.sink.flush?.();
  }

  /**
   * Update minimum log level.
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

// =============================================================================
// CHILD LOGGER
// =============================================================================

export class ChildLogger {
  constructor(
    private parent: StructuredLogger,
    private defaultAttributes: Record<string, unknown>
  ) {}

  debug(message: string, attributes: Record<string, unknown> = {}): void {
    this.parent.debug(message, { ...this.defaultAttributes, ...attributes });
  }

  info(message: string, attributes: Record<string, unknown> = {}): void {
    this.parent.info(message, { ...this.defaultAttributes, ...attributes });
  }

  warn(message: string, attributes: Record<string, unknown> = {}): void {
    this.parent.warn(message, { ...this.defaultAttributes, ...attributes });
  }

  error(message: string, attributes: Record<string, unknown> = {}): void {
    this.parent.error(message, { ...this.defaultAttributes, ...attributes });
  }

  fatal(message: string, attributes: Record<string, unknown> = {}): void {
    this.parent.fatal(message, { ...this.defaultAttributes, ...attributes });
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultLogger: StructuredLogger | null = null;

/**
 * Get or create the default StructuredLogger instance.
 */
export function getStructuredLogger(config?: StructuredLoggerConfig): StructuredLogger {
  if (!defaultLogger) {
    defaultLogger = new StructuredLogger(config);
  }
  return defaultLogger;
}

/**
 * Reset the default logger (for testing).
 */
export function resetStructuredLogger(): void {
  defaultLogger = null;
}
