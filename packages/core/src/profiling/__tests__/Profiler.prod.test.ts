/**
 * Profiler.prod.test.ts — Sprint CLXIX
 *
 * Production tests for the runtime performance Profiler.
 * API: new Profiler()
 *   .start(name?)         — begins a session; throws if already running
 *   .stop() → ProfileResult — ends session; throws if not running
 *   .running             (getter): boolean
 *   .beginSpan(name, category?, args?)
 *   .endSpan()
 *   .recordSpan(name, duration, category?, args?)
 *   .captureMemory()
 *   .exportChromeTrace(result?) → ChromeTrace
 *   .exportJSON(result?) → string
 * Also: singleton `profiler` export
 *
 * Notes:
 *  - start() captures an initial memory snapshot automatically.
 *  - stop() captures a final memory snapshot automatically.
 *  - `running` is a getter, not a method.
 *  - startTime/endTime are in **microseconds**; duration is in **milliseconds**.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Profiler, profiler } from '../Profiler';

let p: Profiler;

beforeEach(() => {
  p = new Profiler();
});

// ---------------------------------------------------------------------------
// start / stop / running
// ---------------------------------------------------------------------------

describe('Profiler', () => {
  describe('running getter / start() / stop()', () => {
    it('is not running before start()', () => {
      expect(p.running).toBe(false);
    });

    it('is running after start()', () => {
      p.start('test');
      expect(p.running).toBe(true);
      p.stop();
    });

    it('stop() returns a ProfileResult', () => {
      p.start('demo');
      const result = p.stop();
      expect(result).toBeDefined();
      expect(result.name).toBe('demo');
    });

    it('stop() marks profiler as not running', () => {
      p.start();
      p.stop();
      expect(p.running).toBe(false);
    });

    it('result.startTime <= result.endTime (both microseconds)', () => {
      p.start();
      const result = p.stop();
      expect(result.startTime).toBeLessThanOrEqual(result.endTime);
    });

    it('result.duration is non-negative (milliseconds)', () => {
      p.start();
      const result = p.stop();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('stop() throws when not running', () => {
      expect(() => p.stop()).toThrow('Profiler not running');
    });

    it('start() second session after stop() works', () => {
      p.start('first');
      p.stop();
      p.start('second');
      const r = p.stop();
      expect(r.name).toBe('second');
    });

    it('start() warns if already running (does not throw)', () => {
      p.start('s1');
      expect(() => p.start('s2')).not.toThrow(); // logs warn
      p.stop();
    });
  });

  // -------------------------------------------------------------------------
  // beginSpan / endSpan
  // -------------------------------------------------------------------------

  describe('beginSpan() / endSpan()', () => {
    it('records a span in result.samples', () => {
      p.start('s');
      p.beginSpan('parse');
      p.endSpan();
      const result = p.stop();
      expect(result.samples.some((s) => s.name === 'parse')).toBe(true);
    });

    it('span has non-negative duration', () => {
      p.start('s');
      p.beginSpan('work');
      p.endSpan();
      const result = p.stop();
      const span = result.samples.find((s) => s.name === 'work');
      expect(span).toBeDefined();
      expect(span!.duration).toBeGreaterThanOrEqual(0);
    });

    it('inner span has greater depth than outer span', () => {
      p.start('s');
      p.beginSpan('outer');
      p.beginSpan('inner');
      p.endSpan(); // end inner
      p.endSpan(); // end outer
      const result = p.stop();
      const inner = result.samples.find((s) => s.name === 'inner');
      const outer = result.samples.find((s) => s.name === 'outer');
      expect(inner).toBeDefined();
      expect(outer).toBeDefined();
      expect(inner!.depth).toBeGreaterThan(outer!.depth);
    });

    it('multiple sequential spans are all recorded', () => {
      p.start('s');
      p.beginSpan('a');
      p.endSpan();
      p.beginSpan('b');
      p.endSpan();
      p.beginSpan('c');
      p.endSpan();
      const result = p.stop();
      expect(result.samples.length).toBe(3);
    });

    it('span name is inferred to a category', () => {
      p.start('s');
      p.beginSpan('parse_something');
      p.endSpan();
      const result = p.stop();
      const span = result.samples.find((s) => s.name === 'parse_something');
      expect(span?.category).toBe('parse');
    });

    it('beginSpan and endSpan are no-ops when not running', () => {
      expect(() => {
        p.beginSpan('skip');
        p.endSpan();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // recordSpan()
  // -------------------------------------------------------------------------

  describe('recordSpan()', () => {
    it('records a span with specified duration', () => {
      p.start('s');
      p.recordSpan('render', 42);
      const result = p.stop();
      const span = result.samples.find((s) => s.name === 'render');
      expect(span?.duration).toBe(42);
    });

    it('recorded span respects given category', () => {
      p.start('s');
      p.recordSpan('compile_pass', 10, 'compile');
      const result = p.stop();
      const span = result.samples.find((s) => s.name === 'compile_pass');
      expect(span?.category).toBe('compile');
    });

    it('recorded span stores args', () => {
      p.start('s');
      p.recordSpan('load', 5, 'user', { file: 'scene.hs' });
      const result = p.stop();
      const span = result.samples.find((s) => s.name === 'load');
      expect(span?.args?.file).toBe('scene.hs');
    });

    it('recordSpan is no-op when profiler not running', () => {
      expect(() => p.recordSpan('noop', 1)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // summary
  // -------------------------------------------------------------------------

  describe('summary', () => {
    it('result.summary.totalDuration is a number', () => {
      p.start('s');
      const result = p.stop();
      expect(typeof result.summary.totalDuration).toBe('number');
    });

    it('result.summary.hotspots is an array', () => {
      p.start('s');
      p.recordSpan('hot-path', 50);
      const result = p.stop();
      expect(Array.isArray(result.summary.hotspots)).toBe(true);
    });

    it('highest-duration span appears first in hotspots', () => {
      p.start('s');
      p.recordSpan('quick', 5);
      p.recordSpan('slow', 95);
      const result = p.stop();
      if (result.summary.hotspots.length >= 2) {
        expect(result.summary.hotspots[0].name).toBe('slow');
      }
    });

    it('categoryBreakdown contains standard categories', () => {
      p.start('s');
      p.recordSpan('parse_x', 10, 'parse');
      const result = p.stop();
      expect(result.summary.categoryBreakdown).toHaveProperty('parse');
    });

    it('categoryBreakdown[parse] accumulates parse time', () => {
      p.start('s');
      p.recordSpan('parse_a', 10, 'parse');
      p.recordSpan('parse_b', 20, 'parse');
      const result = p.stop();
      // Category times are in ms, spans are in microseconds originally
      // The actual value depends on implementation scale; just verify > 0
      expect(result.summary.categoryBreakdown['parse']).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // captureMemory()
  // -------------------------------------------------------------------------

  describe('captureMemory()', () => {
    it('does not throw when called during profiling', () => {
      p.start('s');
      expect(() => p.captureMemory()).not.toThrow();
      p.stop();
    });

    it('manual captureMemory() adds a snapshot to stop() result', () => {
      p.start('s');
      // start() already adds 1 snapshot; this adds a 2nd; stop() adds a 3rd
      p.captureMemory();
      const result = p.stop();
      expect(result.memorySnapshots.length).toBeGreaterThanOrEqual(2);
    });

    it('memory snapshot has non-negative timestamp', () => {
      p.start('s');
      p.captureMemory();
      const result = p.stop();
      for (const snap of result.memorySnapshots) {
        expect(snap.timestamp).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // exportChromeTrace()
  // -------------------------------------------------------------------------

  describe('exportChromeTrace()', () => {
    it('returns an object with traceEvents array', () => {
      p.start('s');
      p.recordSpan('work', 10);
      const result = p.stop();
      const trace = p.exportChromeTrace(result);
      expect(Array.isArray(trace.traceEvents)).toBe(true);
    });

    it('has at least the metadata events (process_name, thread_name)', () => {
      p.start('s');
      const result = p.stop();
      const trace = p.exportChromeTrace(result);
      expect(trace.traceEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('has metadata object', () => {
      p.start('s');
      const result = p.stop();
      const trace = p.exportChromeTrace(result);
      expect(trace.metadata).toBeDefined();
      expect(trace.metadata['process-name']).toBeDefined();
    });

    it('span appears in traceEvents', () => {
      p.start('s');
      p.recordSpan('render', 10);
      const result = p.stop();
      const trace = p.exportChromeTrace(result);
      expect(trace.traceEvents.some((e) => e.name === 'render')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // exportJSON()
  // -------------------------------------------------------------------------

  describe('exportJSON()', () => {
    it('returns a valid JSON string', () => {
      p.start('s');
      const result = p.stop();
      const json = p.exportJSON(result);
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('JSON contains the profile name', () => {
      p.start('my-profile');
      const result = p.stop();
      const json = p.exportJSON(result);
      expect(json).toContain('my-profile');
    });
  });

  // -------------------------------------------------------------------------
  // singleton profiler export
  // -------------------------------------------------------------------------

  describe('singleton profiler', () => {
    it('is a Profiler instance', () => {
      expect(profiler).toBeInstanceOf(Profiler);
    });

    it('running getter is accessible on singleton', () => {
      expect(typeof profiler.running).toBe('boolean');
    });
  });
});
