/**
 * TraceWaterfallRenderer tests — v5.9 "Developer Portal"
 */

import { describe, it, expect } from 'vitest';
import { TraceWaterfallRenderer } from '../TraceWaterfallRenderer';
import type { TraceSpan } from '../TelemetryTypes';

function makeSpan(overrides: Partial<TraceSpan> & { traceId?: string; spanId?: string; parentSpanId?: string } = {}): TraceSpan {
  const { traceId, spanId, parentSpanId, ...rest } = overrides;
  const resolvedSpanId = spanId ?? `span-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: resolvedSpanId,
    name: 'test-span',
    context: {
      traceId: traceId ?? 'trace-1',
      spanId: resolvedSpanId,
      parentSpanId,
      traceFlags: 1,
      baggage: {},
    },
    kind: 'internal',
    startTime: 1000,
    endTime: 2000,
    duration: 0,
    status: 'ok',
    attributes: {},
    events: [],
    links: [],
    ...rest,
  } as TraceSpan;
}

describe('TraceWaterfallRenderer', () => {
  const renderer = new TraceWaterfallRenderer();

  // ===========================================================================
  // EMPTY INPUT
  // ===========================================================================

  describe('empty input', () => {
    it('returns empty waterfall for no spans', () => {
      const result = renderer.render([]);
      expect(result.traceId).toBe('');
      expect(result.spanCount).toBe(0);
      expect(result.rows).toHaveLength(0);
      expect(result.totalDuration).toBe(0);
    });
  });

  // ===========================================================================
  // SINGLE SPAN
  // ===========================================================================

  describe('single span', () => {
    it('renders a single root span', () => {
      const span = makeSpan({ spanId: 's1', startTime: 100, endTime: 200 });
      const result = renderer.render([span]);

      expect(result.traceId).toBe('trace-1');
      expect(result.spanCount).toBe(1);
      expect(result.totalDuration).toBe(100);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].depth).toBe(0);
      expect(result.rows[0].duration).toBe(100);
      expect(result.rows[0].barLeft).toBe(0);
      expect(result.rows[0].barWidth).toBe(1);
    });
  });

  // ===========================================================================
  // PARENT-CHILD HIERARCHY
  // ===========================================================================

  describe('hierarchy', () => {
    it('nests child spans under parent', () => {
      const parent = makeSpan({ spanId: 'p1', startTime: 100, endTime: 500 });
      const child = makeSpan({ spanId: 'c1', parentSpanId: 'p1', startTime: 150, endTime: 300 });
      const result = renderer.render([parent, child]);

      expect(result.spanCount).toBe(2);
      expect(result.rows[0].spanId).toBe('p1');
      expect(result.rows[0].depth).toBe(0);
      expect(result.rows[1].spanId).toBe('c1');
      expect(result.rows[1].depth).toBe(1);
      expect(result.rows[0].children).toContain('c1');
    });

    it('handles deep nesting', () => {
      const spans = [
        makeSpan({ spanId: 'l0', startTime: 0, endTime: 1000 }),
        makeSpan({ spanId: 'l1', parentSpanId: 'l0', startTime: 100, endTime: 900 }),
        makeSpan({ spanId: 'l2', parentSpanId: 'l1', startTime: 200, endTime: 800 }),
        makeSpan({ spanId: 'l3', parentSpanId: 'l2', startTime: 300, endTime: 700 }),
      ];
      const result = renderer.render(spans);

      expect(result.rows).toHaveLength(4);
      expect(result.rows[3].depth).toBe(3);
      expect(result.summary.maxDepth).toBe(3);
    });

    it('sorts children by start time', () => {
      const parent = makeSpan({ spanId: 'p', startTime: 0, endTime: 100 });
      const child2 = makeSpan({
        spanId: 'c2',
        parentSpanId: 'p',
        startTime: 50,
        endTime: 80,
        name: 'second',
      });
      const child1 = makeSpan({
        spanId: 'c1',
        parentSpanId: 'p',
        startTime: 10,
        endTime: 40,
        name: 'first',
      });

      // Pass in wrong order
      const result = renderer.render([parent, child2, child1]);
      expect(result.rows[1].name).toBe('first');
      expect(result.rows[2].name).toBe('second');
    });
  });

  // ===========================================================================
  // AGENT COLORING
  // ===========================================================================

  describe('agent colors', () => {
    it('assigns different colors per agent', () => {
      const spans = [
        makeSpan({
          spanId: 'a',
          startTime: 0,
          endTime: 100,
          attributes: { agentId: 'agent-alpha' },
        }),
        makeSpan({
          spanId: 'b',
          startTime: 50,
          endTime: 150,
          attributes: { agentId: 'agent-beta' },
        }),
      ];
      const result = renderer.render(spans);

      expect(result.agentCount).toBe(2);
      expect(result.agentColors['agent-alpha']).toBeDefined();
      expect(result.agentColors['agent-beta']).toBeDefined();
      expect(result.agentColors['agent-alpha']).not.toBe(result.agentColors['agent-beta']);
    });

    it('uses error color for error spans', () => {
      const span = makeSpan({ spanId: 'e', status: 'error', attributes: { agentId: 'agent-a' } });
      const result = renderer.render([span]);
      expect(result.rows[0].color).toBe('#ff6b6b');
    });
  });

  // ===========================================================================
  // BAR POSITIONING
  // ===========================================================================

  describe('bar positioning', () => {
    it('calculates correct bar positions', () => {
      const spans = [
        makeSpan({ spanId: 'a', startTime: 0, endTime: 100 }),
        makeSpan({ spanId: 'b', startTime: 50, endTime: 150 }),
      ];
      const result = renderer.render(spans);

      // Total duration = 150
      expect(result.rows[0].barLeft).toBeCloseTo(0);
      expect(result.rows[0].barWidth).toBeCloseTo(100 / 150);
      expect(result.rows[1].barLeft).toBeCloseTo(50 / 150);
      expect(result.rows[1].barWidth).toBeCloseTo(100 / 150);
    });
  });

  // ===========================================================================
  // CRITICAL PATH
  // ===========================================================================

  describe('critical path', () => {
    it('finds longest chain', () => {
      const spans = [
        makeSpan({ spanId: 'root', startTime: 0, endTime: 1000 }),
        makeSpan({ spanId: 'fast', parentSpanId: 'root', startTime: 0, endTime: 100 }),
        makeSpan({ spanId: 'slow', parentSpanId: 'root', startTime: 0, endTime: 800 }),
        makeSpan({ spanId: 'slowest', parentSpanId: 'slow', startTime: 100, endTime: 700 }),
      ];
      const result = renderer.render(spans);

      expect(result.criticalPath).toContain('root');
      expect(result.criticalPath).toContain('slow');
      expect(result.criticalPath).toContain('slowest');
      expect(result.criticalPath).not.toContain('fast');
    });
  });

  // ===========================================================================
  // SUMMARY
  // ===========================================================================

  describe('summary', () => {
    it('calculates summary statistics', () => {
      const spans = [
        makeSpan({ spanId: 'a', name: 'op-a', startTime: 0, endTime: 300, status: 'ok' }),
        makeSpan({ spanId: 'b', name: 'op-b', startTime: 50, endTime: 100, status: 'error' }),
        makeSpan({ spanId: 'c', name: 'op-c', startTime: 200, endTime: 500, status: 'ok' }),
      ];
      const result = renderer.render(spans);

      expect(result.summary.totalSpans).toBe(3);
      expect(result.summary.errorSpans).toBe(1);
      // op-a and op-c both have duration 300; reduce picks first
      expect(result.summary.longestSpan.name).toBe('op-a');
      expect(result.summary.longestSpan.duration).toBe(300);
      expect(result.summary.avgDuration).toBeCloseTo((300 + 50 + 300) / 3);
    });
  });

  // ===========================================================================
  // MULTIPLE TRACES
  // ===========================================================================

  describe('renderMultiple', () => {
    it('groups spans by trace ID', () => {
      const spans = [
        makeSpan({ traceId: 't1', spanId: 'a', startTime: 0, endTime: 100 }),
        makeSpan({ traceId: 't2', spanId: 'b', startTime: 0, endTime: 200 }),
        makeSpan({ traceId: 't1', spanId: 'c', parentSpanId: 'a', startTime: 10, endTime: 50 }),
      ];
      const results = renderer.renderMultiple(spans);

      expect(results).toHaveLength(2);
      expect(results[0].traceId).toBe('t1');
      expect(results[0].spanCount).toBe(2);
      expect(results[1].traceId).toBe('t2');
      expect(results[1].spanCount).toBe(1);
    });
  });

  // ===========================================================================
  // MIN DURATION FILTER
  // ===========================================================================

  describe('minDuration filter', () => {
    it('filters out short spans', () => {
      const filtered = new TraceWaterfallRenderer({ minDuration: 50 });
      const spans = [
        makeSpan({ spanId: 'long', startTime: 0, endTime: 200 }),
        makeSpan({ spanId: 'short', startTime: 10, endTime: 20 }),
      ];
      const result = filtered.render(spans);

      expect(result.spanCount).toBe(1);
      expect(result.rows[0].spanId).toBe('long');
    });
  });

  // ===========================================================================
  // SPAN EVENTS
  // ===========================================================================

  describe('span events', () => {
    it('includes span events in rows', () => {
      const span = makeSpan({
        spanId: 'e1',
        events: [{ name: 'error', timestamp: 1500, attributes: { message: 'timeout' } }],
      });
      const result = renderer.render([span]);

      expect(result.rows[0].events).toHaveLength(1);
      expect(result.rows[0].events![0].name).toBe('error');
    });
  });
});
