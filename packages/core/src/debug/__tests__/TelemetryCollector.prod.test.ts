/**
 * TelemetryCollector — production test suite
 *
 * Tests event recording, tracing spans, agent queries,
 * statistics, flush lifecycle, and singleton utilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryCollector, getTelemetryCollector, resetTelemetryCollector } from '../TelemetryCollector';
import { DEFAULT_TELEMETRY_CONFIG } from '../TelemetryTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a collector with sampling 1.0, all events enabled, no flush timer */
function makeCollector(): TelemetryCollector {
  return new TelemetryCollector({
    enabled: true,
    samplingRate: 1.0,
    flushInterval: 0,       // no background timer
    maxBufferSize: 1000,
    minSeverity: 'debug',
    captureEvents: ['lifecycle', 'performance', 'error', 'decision', 'memory', 'network', 'custom'],
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('TelemetryCollector: production', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    collector = makeCollector();
  });

  afterEach(() => {
    collector.destroy();
    resetTelemetryCollector();
  });

  // ─── Event Recording ────────────────────────────────────────────────────
  describe('record / recordEvent', () => {
    it('records an event and returns it', () => {
      const evt = collector.recordEvent('lifecycle', 'agent-1');
      expect(evt).not.toBeNull();
      expect(evt!.type).toBe('lifecycle');
      expect(evt!.agentId).toBe('agent-1');
    });

    it('assigned event gets id and timestamp', () => {
      const evt = collector.recordEvent('performance', 'agent-1');
      expect(evt!.id).toBeTruthy();
      expect(evt!.timestamp).toBeGreaterThan(0);
    });

    it('returns null when collector is disabled', () => {
      collector.setEnabled(false);
      const evt = collector.recordEvent('lifecycle', 'agent-1');
      expect(evt).toBeNull();
    });

    it('increments totalEvents in stats', () => {
      collector.recordEvent('lifecycle', 'agent-1');
      collector.recordEvent('lifecycle', 'agent-1');
      expect(collector.getStats().totalEvents).toBe(2);
    });

    it('tracks events per type', () => {
      collector.recordEvent('lifecycle', 'a');
      collector.recordEvent('error', 'a');
      collector.recordEvent('error', 'a');
      const stats = collector.getStats();
      expect(stats.eventsByType['lifecycle']).toBe(1);
      expect(stats.eventsByType['error']).toBe(2);
    });

    it('tracks events per agent', () => {
      collector.recordEvent('lifecycle', 'a1');
      collector.recordEvent('lifecycle', 'a1');
      collector.recordEvent('lifecycle', 'a2');
      const stats = collector.getStats();
      expect(stats.eventsByAgent['a1']).toBe(2);
      expect(stats.eventsByAgent['a2']).toBe(1);
    });
  });

  // ─── Error Recording ────────────────────────────────────────────────────
  describe('recordError', () => {
    it('records error event with error data', () => {
      const err = new Error('test failure');
      const evt = collector.recordError('agent-1', err);
      expect(evt).not.toBeNull();
      expect(evt!.type).toBe('error');
      expect(evt!.severity).toBe('error');
      expect(evt!.data['error']).toBe('test failure');
    });

    it('includes context in error event data', () => {
      const evt = collector.recordError('agent-1', new Error('fail'), { ctx: 'value' });
      expect(evt!.data['ctx']).toBe('value');
    });
  });

  // ─── Queries ────────────────────────────────────────────────────────────
  describe('getAgentEvents', () => {
    it('returns only events for the specified agent', () => {
      collector.recordEvent('lifecycle', 'a1');
      collector.recordEvent('lifecycle', 'a2');
      const events = collector.getAgentEvents('a1');
      expect(events).toHaveLength(1);
      expect(events[0].agentId).toBe('a1');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) collector.recordEvent('lifecycle', 'agent-x');
      const events = collector.getAgentEvents('agent-x', 3);
      expect(events).toHaveLength(3);
    });
  });

  describe('getEventsByType', () => {
    it('filters by event type', () => {
      collector.recordEvent('lifecycle', 'a');
      collector.recordEvent('performance', 'a');
      const perfEvents = collector.getEventsByType('performance');
      expect(perfEvents).toHaveLength(1);
      expect(perfEvents[0].type).toBe('performance');
    });
  });

  describe('getRecentEvents', () => {
    it('returns most recent N events', () => {
      for (let i = 0; i < 10; i++) collector.recordEvent('lifecycle', `a${i}`);
      const recent = collector.getRecentEvents(5);
      expect(recent).toHaveLength(5);
    });
  });

  describe('searchEvents', () => {
    it('filters by predicate', () => {
      collector.recordEvent('lifecycle', 'a', { score: 42 });
      collector.recordEvent('lifecycle', 'b', { score: 10 });
      const found = collector.searchEvents(e => e.data['score'] === 42);
      expect(found).toHaveLength(1);
      expect(found[0].agentId).toBe('a');
    });
  });

  // ─── Tracing / Spans ────────────────────────────────────────────────────
  describe('startSpan / endSpan', () => {
    it('creates a span with a unique id', () => {
      const span = collector.startSpan('myOp');
      expect(span.id).toBeTruthy();
      expect(span.name).toBe('myOp');
    });

    it('span starts in unset status', () => {
      const span = collector.startSpan('op');
      expect(span.status).toBe('unset');
    });

    it('endSpan sets endTime and duration', () => {
      const span = collector.startSpan('op');
      const ended = collector.endSpan(span.id);
      expect(ended.endTime).toBeGreaterThan(0);
      expect(ended.duration).toBeGreaterThanOrEqual(0);
    });

    it('endSpan sets status', () => {
      const span = collector.startSpan('op');
      const ended = collector.endSpan(span.id, 'ok');
      expect(ended.status).toBe('ok');
    });

    it('endSpan throws for unknown span id', () => {
      expect(() => collector.endSpan('nonexistent')).toThrow('Span not found');
    });

    it('active span count increases and decreases', () => {
      const span = collector.startSpan('op');
      expect(collector.getStats().activeSpans).toBe(1);
      collector.endSpan(span.id);
      expect(collector.getStats().activeSpans).toBe(0);
    });

    it('child span receives parent trace id', () => {
      const parent = collector.startSpan('parent');
      const child = collector.startSpan('child', {
        parentContext: parent.context,
      });
      expect(child.context.traceId).toBe(parent.context.traceId);
    });

    it('getTraceSpans returns all spans for a trace', () => {
      const parent = collector.startSpan('parent');
      collector.startSpan('child', { parentContext: parent.context });
      const spans = collector.getTraceSpans(parent.context.traceId);
      expect(spans.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('addSpanEvent', () => {
    it('adds event to span', () => {
      const span = collector.startSpan('op');
      collector.addSpanEvent(span.id, 'checkpoint', { x: 1 });
      const retrieved = collector.getSpan(span.id);
      expect(retrieved!.events).toHaveLength(1);
      expect(retrieved!.events[0].name).toBe('checkpoint');
    });

    it('throws for unknown span', () => {
      expect(() => collector.addSpanEvent('bad', 'event')).toThrow('Span not found');
    });
  });

  describe('setSpanAttributes', () => {
    it('merges attributes into span', () => {
      const span = collector.startSpan('op', { attributes: { a: 1 } });
      collector.setSpanAttributes(span.id, { b: 2 });
      const s = collector.getSpan(span.id)!;
      expect(s.attributes['a']).toBe(1);
      expect(s.attributes['b']).toBe(2);
    });
  });

  // ─── Statistics & Reset ──────────────────────────────────────────────────
  describe('getStats / resetStats', () => {
    it('stats start at zero', () => {
      const stats = collector.getStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalSpans).toBe(0);
    });

    it('resetStats clears all counters', () => {
      collector.recordEvent('lifecycle', 'a');
      collector.startSpan('op');
      collector.resetStats();
      const stats = collector.getStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalSpans).toBe(0);
    });
  });

  // ─── Flush ───────────────────────────────────────────────────────────────
  describe('flush', () => {
    it('calls export callbacks with events and completed spans', async () => {
      collector.recordEvent('lifecycle', 'a');
      const span = collector.startSpan('op');
      collector.endSpan(span.id);

      const captured: { events: any[]; spans: any[] } = { events: [], spans: [] };
      collector.onExport(async (evts, spans) => {
        captured.events = evts;
        captured.spans = spans;
      });

      await collector.flush();

      expect(captured.events).toHaveLength(1);
      expect(captured.spans).toHaveLength(1);
    });

    it('clears events after flush', async () => {
      collector.recordEvent('lifecycle', 'a');
      await collector.flush();
      expect(collector.getRecentEvents(100)).toHaveLength(0);
    });

    it('does not call callbacks when buffer is empty', async () => {
      const spy = vi.fn().mockResolvedValue(undefined);
      collector.onExport(spy);
      await collector.flush();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── Clear / Destroy ─────────────────────────────────────────────────────
  describe('clear', () => {
    it('removes all events, spans, and resets stats', () => {
      collector.recordEvent('lifecycle', 'a');
      collector.startSpan('op');
      collector.clear();
      expect(collector.getStats().totalEvents).toBe(0);
      expect(collector.getRecentEvents(100)).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('clears all data', () => {
      collector.recordEvent('lifecycle', 'a');
      collector.destroy();
      // No throw expected; collector is cleaned up
      expect(collector.getStats().totalEvents).toBe(0);
    });
  });

  // ─── Singleton ─────────────────────────────────────────────────────────
  describe('getTelemetryCollector / resetTelemetryCollector', () => {
    it('returns the same instance on multiple calls', () => {
      const a = getTelemetryCollector();
      const b = getTelemetryCollector();
      expect(a).toBe(b);
    });

    it('returns a new instance after reset', () => {
      const a = getTelemetryCollector();
      resetTelemetryCollector();
      const b = getTelemetryCollector();
      expect(a).not.toBe(b);
    });
  });
});
