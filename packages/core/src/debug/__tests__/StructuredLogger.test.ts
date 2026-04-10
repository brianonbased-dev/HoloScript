/**
 * StructuredLogger tests — v5.6 "Observable Platform"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StructuredLogger,
  JsonArraySink,
  getStructuredLogger,
  resetStructuredLogger,
} from '../StructuredLogger';
import type { TraceContext } from '../TelemetryTypes';
import type { LogEntry } from '../StructuredLogger';

// =============================================================================
// FIXTURES
// =============================================================================

function makeTraceContext(): TraceContext {
  return {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    traceFlags: 1,
    baggage: {},
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let sink: JsonArraySink;

  beforeEach(() => {
    resetStructuredLogger();
    sink = new JsonArraySink();
    logger = new StructuredLogger({
      serviceName: 'test-service',
      minLevel: 'debug',
      sinkType: 'custom',
      customSink: sink,
    });
  });

  // ===========================================================================
  // BASIC LOGGING
  // ===========================================================================

  it('logs a debug message', () => {
    logger.debug('test debug message');
    const entries = sink.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('debug');
    expect(entries[0].message).toBe('test debug message');
    expect(entries[0].service).toBe('test-service');
  });

  it('logs at all levels', () => {
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.fatal('f');

    const entries = sink.getEntries();
    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error', 'fatal']);
  });

  it('includes structured attributes', () => {
    logger.info('request completed', { method: 'GET', status: 200, durationMs: 42 });

    const entry = sink.getEntries()[0];
    expect(entry.attributes.method).toBe('GET');
    expect(entry.attributes.status).toBe(200);
    expect(entry.attributes.durationMs).toBe(42);
  });

  it('includes ISO timestamp', () => {
    logger.info('test');
    const entry = sink.getEntries()[0];
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ===========================================================================
  // LEVEL FILTERING
  // ===========================================================================

  it('filters messages below minimum level', () => {
    const warnLogger = new StructuredLogger({
      minLevel: 'warn',
      sinkType: 'custom',
      customSink: sink,
    });

    warnLogger.debug('should not appear');
    warnLogger.info('should not appear');
    warnLogger.warn('should appear');
    warnLogger.error('should appear');

    expect(sink.getEntries()).toHaveLength(2);
  });

  it('allows changing min level at runtime', () => {
    logger.setMinLevel('error');
    logger.info('filtered out');
    logger.error('visible');

    expect(sink.getEntries()).toHaveLength(1);
    expect(sink.getEntries()[0].level).toBe('error');
  });

  // ===========================================================================
  // TRACE CORRELATION
  // ===========================================================================

  it('includes trace context in log entries', () => {
    const ctx = makeTraceContext();
    logger.setTraceContext(ctx);

    logger.info('traced message');

    const entry = sink.getEntries()[0];
    expect(entry.traceId).toBe(ctx.traceId);
    expect(entry.spanId).toBe(ctx.spanId);
  });

  it('omits trace fields when no context is set', () => {
    logger.info('untraced message');

    const entry = sink.getEntries()[0];
    expect(entry.traceId).toBeUndefined();
    expect(entry.spanId).toBeUndefined();
  });

  it('withTraceContext scopes context and restores', () => {
    const ctx = makeTraceContext();

    logger.info('before');
    logger.withTraceContext(ctx, () => {
      logger.info('during');
    });
    logger.info('after');

    const entries = sink.getEntries();
    expect(entries[0].traceId).toBeUndefined();
    expect(entries[1].traceId).toBe(ctx.traceId);
    expect(entries[2].traceId).toBeUndefined();
  });

  it('getTraceContext returns current context', () => {
    expect(logger.getTraceContext()).toBeNull();

    const ctx = makeTraceContext();
    logger.setTraceContext(ctx);
    expect(logger.getTraceContext()).toBe(ctx);

    logger.setTraceContext(null);
    expect(logger.getTraceContext()).toBeNull();
  });

  // ===========================================================================
  // CHILD LOGGER
  // ===========================================================================

  it('child logger merges default attributes', () => {
    const child = logger.child({ component: 'auth', version: '1.0' });

    child.info('login attempt', { userId: 'user-123' });

    const entry = sink.getEntries()[0];
    expect(entry.attributes.component).toBe('auth');
    expect(entry.attributes.version).toBe('1.0');
    expect(entry.attributes.userId).toBe('user-123');
  });

  it('child logger call-site attributes override defaults', () => {
    const child = logger.child({ env: 'dev' });
    child.info('test', { env: 'prod' });

    expect(sink.getEntries()[0].attributes.env).toBe('prod');
  });

  // ===========================================================================
  // SINKS
  // ===========================================================================

  it('noop sink discards all entries', () => {
    const noopLogger = new StructuredLogger({ sinkType: 'noop', minLevel: 'debug' });
    noopLogger.info('discarded');
    // No way to check — just ensure it doesn't throw
  });

  it('console sink writes to console', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleLogger = new StructuredLogger({ sinkType: 'console', minLevel: 'debug' });

    consoleLogger.info('hello console');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = consoleSpy.mock.calls[0][0] as string;
    expect(logged).toContain('hello console');

    consoleSpy.mockRestore();
  });

  it('JsonArraySink respects maxEntries', () => {
    const smallSink = new JsonArraySink(3);
    const smallLogger = new StructuredLogger({
      sinkType: 'custom',
      customSink: smallSink,
      minLevel: 'debug',
    });

    smallLogger.info('1');
    smallLogger.info('2');
    smallLogger.info('3');
    smallLogger.info('4');

    const entries = smallSink.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].message).toBe('2'); // Oldest entry evicted
  });

  it('JsonArraySink.clear() empties entries', () => {
    sink.write({ timestamp: '', level: 'info', message: 'x', service: 'test', attributes: {} });
    expect(sink.getEntries()).toHaveLength(1);
    sink.clear();
    expect(sink.getEntries()).toHaveLength(0);
  });

  // ===========================================================================
  // SINGLETON
  // ===========================================================================

  describe('singleton', () => {
    it('returns the same instance', () => {
      const a = getStructuredLogger();
      const b = getStructuredLogger();
      expect(a).toBe(b);
    });

    it('resets on resetStructuredLogger', () => {
      const a = getStructuredLogger();
      resetStructuredLogger();
      const b = getStructuredLogger();
      expect(a).not.toBe(b);
    });
  });

  // ===========================================================================
  // FLUSH
  // ===========================================================================

  it('flush calls sink.flush when available', () => {
    const flushSpy = vi.fn();
    const flushSink = { write: () => {}, flush: flushSpy };
    const flushLogger = new StructuredLogger({
      sinkType: 'custom',
      customSink: flushSink,
    });

    flushLogger.flush();
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('getSink returns the active sink', () => {
    expect(logger.getSink()).toBe(sink);
  });
});
