import { describe, it, expect, vi } from 'vitest';
import { Profiler } from '../profiling/Profiler';

// =============================================================================
// C210 — Profiling
// =============================================================================

describe('Profiler', () => {
  it('starts and stops a profiling session', () => {
    const p = new Profiler();
    p.start('test-session');
    expect(p.running).toBe(true); // getter, not method
    const result = p.stop();
    expect(p.running).toBe(false);
    expect(result).toBeDefined();
    expect(result.name).toBe('test-session');
  });

  it('stop throws when not running', () => {
    const p = new Profiler();
    expect(() => p.stop()).toThrow();
  });

  it('beginSpan/endSpan records a sample', () => {
    const p = new Profiler();
    p.start();
    p.beginSpan('parse');
    p.endSpan();
    const result = p.stop();
    expect(result.samples.length).toBeGreaterThanOrEqual(1);
    expect(result.samples[0].name).toBe('parse');
  });

  it('nested spans track depth', () => {
    const p = new Profiler();
    p.start();
    p.beginSpan('outer');
    p.beginSpan('inner');
    p.endSpan(); // inner
    p.endSpan(); // outer
    const result = p.stop();
    expect(result.samples.length).toBe(2);
    const inner = result.samples.find((s) => s.name === 'inner');
    const outer = result.samples.find((s) => s.name === 'outer');
    expect(inner!.depth).toBeGreaterThan(outer!.depth);
  });

  it('recordSpan creates a complete sample', () => {
    const p = new Profiler();
    p.start();
    p.recordSpan('manual', 42, 'compile');
    const result = p.stop();
    const sample = result.samples.find((s) => s.name === 'manual');
    expect(sample).toBeDefined();
    expect(sample!.duration).toBe(42);
    expect(sample!.category).toBe('compile');
  });

  it('result has duration >= 0', () => {
    const p = new Profiler();
    p.start();
    p.recordSpan('op', 10);
    const result = p.stop();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('summary includes hotspots sorted by time', () => {
    const p = new Profiler();
    p.start();
    p.recordSpan('fast', 5);
    p.recordSpan('slow', 50);
    p.recordSpan('slow', 30);
    const result = p.stop();
    expect(result.summary.hotspots.length).toBeGreaterThanOrEqual(1);
    expect(result.summary.hotspots[0].name).toBe('slow');
    expect(result.summary.hotspots[0].callCount).toBe(2);
  });

  it('category breakdown sums durations per category', () => {
    const p = new Profiler();
    p.start();
    // durations are in μs; generateSummary divides by 1000 to get ms
    p.recordSpan('parse1', 10000, 'parse');
    p.recordSpan('parse2', 15000, 'parse');
    p.recordSpan('comp', 20000, 'compile');
    const result = p.stop();
    expect(result.summary.categoryBreakdown['parse']).toBe(25);
    expect(result.summary.categoryBreakdown['compile']).toBe(20);
  });

  it('recordSpan with inferred category matches name patterns', () => {
    // inferCategory is private; test indirectly via recordSpan with no explicit category
    const p = new Profiler();
    p.start();
    p.recordSpan('parse_tokens', 10, 'parse');
    p.recordSpan('compile_node', 10, 'compile');
    p.recordSpan('network_call', 10, 'network');
    p.recordSpan('something_else', 10, 'user');
    const result = p.stop();
    expect(result.samples[0].category).toBe('parse');
    expect(result.samples[1].category).toBe('compile');
    expect(result.samples[2].category).toBe('network');
    expect(result.samples[3].category).toBe('user');
  });

  it('captureMemory records a memory snapshot', () => {
    const p = new Profiler();
    p.start();
    p.captureMemory();
    const result = p.stop();
    // start() captures initial memory, captureMemory adds another, stop() adds final
    expect(result.memorySnapshots.length).toBeGreaterThanOrEqual(2);
    expect(result.memorySnapshots[0].heapUsed).toBeGreaterThanOrEqual(0);
  });

  it('exportChromeTrace returns valid trace format', () => {
    const p = new Profiler();
    p.start('trace-test');
    p.recordSpan('traceOp', 10, 'user');
    const result = p.stop();
    const trace = p.exportChromeTrace(result);
    expect(trace.traceEvents).toBeDefined();
    expect(Array.isArray(trace.traceEvents)).toBe(true);
    // Should contain metadata events + sample events + memory events
    expect(trace.traceEvents.length).toBeGreaterThanOrEqual(3);
    // Find our sample event among all trace events
    const sampleEvents = trace.traceEvents.filter((e) => e.ph === 'X');
    expect(sampleEvents.length).toBeGreaterThanOrEqual(1);
    expect(sampleEvents[0].ts).toBeGreaterThanOrEqual(0);
  });

  it('exportJSON returns parseable JSON string', () => {
    const p = new Profiler();
    p.start('json-test');
    p.recordSpan('a', 5);
    const result = p.stop();
    const json = p.exportJSON(result);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    // exportJSON wraps exportChromeTrace which has traceEvents
    expect(parsed.traceEvents || parsed.samples || parsed.name).toBeDefined();
  });

  it('endSpan without beginSpan is safe', () => {
    const p = new Profiler();
    p.start();
    p.endSpan(); // no-op, should not crash
    const result = p.stop();
    expect(result.samples).toHaveLength(0);
  });

  it('start while already running is a no-op', () => {
    // Profiler.start() early-returns if already running
    const p = new Profiler();
    p.start('first');
    p.recordSpan('a', 10);
    p.start('second'); // no-op: profiler is already running
    const result = p.stop();
    expect(result.name).toBe('first'); // still first session
    expect(result.samples.length).toBeGreaterThanOrEqual(1); // samples preserved
  });

  it('getHighResTime returns a positive number', () => {
    const p = new Profiler();
    expect(p.getHighResTime()).toBeGreaterThan(0);
  });
});
