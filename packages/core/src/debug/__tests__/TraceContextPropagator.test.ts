/**
 * TraceContextPropagator tests — v5.6 "Observable Platform"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TraceContextPropagator,
  getTraceContextPropagator,
  resetTraceContextPropagator,
} from '../TraceContextPropagator';
import type { TraceContext } from '../TelemetryTypes';

// =============================================================================
// FIXTURES
// =============================================================================

function makeTestContext(overrides: Partial<TraceContext> = {}): TraceContext {
  return {
    traceId: '0af7651916cd43dd8448eb211c80319c',
    spanId: '00f067aa0ba902b7',
    traceFlags: 1,
    baggage: {},
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('TraceContextPropagator', () => {
  let propagator: TraceContextPropagator;

  beforeEach(() => {
    propagator = new TraceContextPropagator();
    resetTraceContextPropagator();
  });

  // ===========================================================================
  // INJECT
  // ===========================================================================

  describe('inject', () => {
    it('produces a valid traceparent header', () => {
      const ctx = makeTestContext();
      const headers = propagator.inject(ctx);

      expect(headers.traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01');
    });

    it('encodes traceFlags correctly', () => {
      const unsampled = makeTestContext({ traceFlags: 0 });
      expect(propagator.inject(unsampled).traceparent).toMatch(/-00$/);

      const sampled = makeTestContext({ traceFlags: 1 });
      expect(propagator.inject(sampled).traceparent).toMatch(/-01$/);
    });

    it('includes tracestate from baggage', () => {
      const ctx = makeTestContext({
        baggage: { holoscript: 'v5.6', agent: 'sensor-01' },
      });
      const headers = propagator.inject(ctx);

      expect(headers.tracestate).toBeDefined();
      expect(headers.tracestate).toContain('holoscript=v5.6');
      expect(headers.tracestate).toContain('agent=sensor-01');
    });

    it('omits tracestate when baggage is empty', () => {
      const ctx = makeTestContext({ baggage: {} });
      const headers = propagator.inject(ctx);

      expect(headers.tracestate).toBeUndefined();
    });

    it('pads short IDs to required length', () => {
      const ctx = makeTestContext({ traceId: 'abc', spanId: 'def' });
      const headers = propagator.inject(ctx);

      // traceId padded to 32 chars, spanId padded to 16 chars
      expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    });
  });

  // ===========================================================================
  // EXTRACT
  // ===========================================================================

  describe('extract', () => {
    it('extracts a valid traceparent', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
      };

      const ctx = propagator.extract(headers);

      expect(ctx).not.toBeNull();
      expect(ctx!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(ctx!.spanId).toBe('00f067aa0ba902b7');
      expect(ctx!.traceFlags).toBe(1);
    });

    it('extracts tracestate into baggage', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
        tracestate: 'holoscript=v5.6,agent=sensor-01',
      };

      const ctx = propagator.extract(headers);

      expect(ctx!.baggage).toEqual({
        holoscript: 'v5.6',
        agent: 'sensor-01',
      });
    });

    it('returns null for missing traceparent', () => {
      expect(propagator.extract({})).toBeNull();
      expect(propagator.extract({ 'x-custom': 'value' })).toBeNull();
    });

    it('returns null for invalid traceparent format', () => {
      expect(propagator.extract({ traceparent: 'invalid' })).toBeNull();
      expect(propagator.extract({ traceparent: '00-abc-def-01' })).toBeNull(); // Too short
      expect(
        propagator.extract({ traceparent: '00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01' })
      ).toBeNull(); // All-zero traceId
    });

    it('handles case-insensitive header names', () => {
      const headers = {
        Traceparent: '00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
        Tracestate: 'key=val',
      };

      const ctx = propagator.extract(headers);
      expect(ctx).not.toBeNull();
      expect(ctx!.baggage).toEqual({ key: 'val' });
    });
  });

  // ===========================================================================
  // ROUND TRIP
  // ===========================================================================

  describe('inject → extract round trip', () => {
    it('preserves trace context across inject/extract', () => {
      const original = makeTestContext({
        baggage: { env: 'production', region: 'us-east' },
      });

      const headers = propagator.inject(original);
      const extracted = propagator.extract(headers);

      expect(extracted).not.toBeNull();
      expect(extracted!.traceId).toBe(original.traceId);
      expect(extracted!.spanId).toBe(original.spanId);
      expect(extracted!.traceFlags).toBe(original.traceFlags);
      expect(extracted!.baggage).toEqual(original.baggage);
    });
  });

  // ===========================================================================
  // CHILD CONTEXT
  // ===========================================================================

  describe('createChildContext', () => {
    it('creates a child with same traceId and new spanId', () => {
      const parent = makeTestContext();
      const child = propagator.createChildContext(parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.traceFlags).toBe(parent.traceFlags);
    });

    it('copies baggage to child', () => {
      const parent = makeTestContext({ baggage: { tenant: 'acme' } });
      const child = propagator.createChildContext(parent);

      expect(child.baggage).toEqual({ tenant: 'acme' });
      // Verify it's a copy, not a reference
      child.baggage['extra'] = 'value';
      expect(parent.baggage['extra']).toBeUndefined();
    });
  });

  // ===========================================================================
  // HEADER INJECTION HELPER
  // ===========================================================================

  describe('injectIntoHeaders', () => {
    it('merges trace headers with existing headers', () => {
      const existing = { 'Content-Type': 'application/json', Authorization: 'Bearer token' };
      const ctx = makeTestContext();

      const merged = propagator.injectIntoHeaders(existing, ctx);

      expect(merged['Content-Type']).toBe('application/json');
      expect(merged['Authorization']).toBe('Bearer token');
      expect(merged['traceparent']).toMatch(/^00-/);
    });
  });

  // ===========================================================================
  // PARSE HELPERS
  // ===========================================================================

  describe('parseTraceparent', () => {
    it('rejects all-zero span ID', () => {
      const result = propagator.parseTraceparent(
        '00-0af7651916cd43dd8448eb211c80319c-' + '0'.repeat(16) + '-01'
      );
      expect(result).toBeNull();
    });

    it('rejects non-hex characters', () => {
      expect(
        propagator.parseTraceparent('00-uuuu' + '0'.repeat(28) + '-' + '1'.repeat(16) + '-01')
      ).toBeNull();
    });
  });

  describe('parseTracestate', () => {
    it('parses comma-separated key=value pairs', () => {
      const entries = propagator.parseTracestate('a=1,b=2,c=3');
      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual({ key: 'a', value: '1' });
    });

    it('handles empty string', () => {
      expect(propagator.parseTracestate('')).toHaveLength(0);
      expect(propagator.parseTracestate('  ')).toHaveLength(0);
    });

    it('skips malformed entries', () => {
      const entries = propagator.parseTracestate('a=1,invalid,b=2');
      expect(entries).toHaveLength(2);
    });
  });

  // ===========================================================================
  // SAMPLING CHECK
  // ===========================================================================

  describe('isSampled', () => {
    it('returns true when sampled flag is set', () => {
      expect(propagator.isSampled(makeTestContext({ traceFlags: 1 }))).toBe(true);
      expect(propagator.isSampled(makeTestContext({ traceFlags: 3 }))).toBe(true); // bit 0 set
    });

    it('returns false when sampled flag is not set', () => {
      expect(propagator.isSampled(makeTestContext({ traceFlags: 0 }))).toBe(false);
      expect(propagator.isSampled(makeTestContext({ traceFlags: 2 }))).toBe(false); // bit 0 not set
    });
  });

  // ===========================================================================
  // SINGLETON
  // ===========================================================================

  describe('singleton', () => {
    it('returns the same instance', () => {
      const a = getTraceContextPropagator();
      const b = getTraceContextPropagator();
      expect(a).toBe(b);
    });

    it('resets on resetTraceContextPropagator', () => {
      const a = getTraceContextPropagator();
      resetTraceContextPropagator();
      const b = getTraceContextPropagator();
      expect(a).not.toBe(b);
    });
  });
});
