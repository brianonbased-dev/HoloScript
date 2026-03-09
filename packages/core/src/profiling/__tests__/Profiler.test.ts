import { describe, it, expect, beforeEach } from 'vitest';
import { Profiler } from '../Profiler';

describe('Profiler', () => {
  let profiler: Profiler;

  beforeEach(() => {
    profiler = new Profiler();
  });

  // ---------------------------------------------------------------------------
  // Start / Stop
  // ---------------------------------------------------------------------------

  it('starts not running', () => {
    expect(profiler.running).toBe(false);
  });

  it('start sets running state', () => {
    profiler.start('test-session');
    expect(profiler.running).toBe(true);
  });

  it('stop returns a ProfileResult', () => {
    profiler.start('test-session');
    const result = profiler.stop();
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('samples');
    expect(result).toHaveProperty('summary');
    expect(profiler.running).toBe(false);
  });

  it('stop result has positive duration', () => {
    profiler.start();
    profiler.beginSpan('work');
    profiler.endSpan();
    const result = profiler.stop();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // Spans
  // ---------------------------------------------------------------------------

  it('beginSpan/endSpan records a sample', () => {
    profiler.start();
    profiler.beginSpan('parse');
    profiler.endSpan();
    const result = profiler.stop();
    expect(result.samples.length).toBeGreaterThanOrEqual(1);
    expect(result.samples[0].name).toBe('parse');
  });

  it('nested spans track depth', () => {
    profiler.start();
    profiler.beginSpan('outer');
    profiler.beginSpan('inner');
    profiler.endSpan();
    profiler.endSpan();
    const result = profiler.stop();
    const inner = result.samples.find((s) => s.name === 'inner');
    expect(inner).toBeDefined();
    expect(inner!.depth).toBeGreaterThan(0);
  });

  it('recordSpan adds complete span', () => {
    profiler.start();
    profiler.recordSpan('async-op', 50, 'io');
    const result = profiler.stop();
    expect(result.samples.some((s) => s.name === 'async-op')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  it('summary has category breakdown', () => {
    profiler.start();
    profiler.beginSpan('parse', 'parse');
    profiler.endSpan();
    profiler.beginSpan('compile', 'compile');
    profiler.endSpan();
    const result = profiler.stop();
    expect(result.summary.categoryBreakdown).toBeDefined();
  });

  it('summary identifies hotspots', () => {
    profiler.start();
    profiler.recordSpan('heavy-work', 100, 'user');
    profiler.recordSpan('light-work', 1, 'user');
    const result = profiler.stop();
    expect(result.summary.hotspots.length).toBeGreaterThan(0);
    expect(result.summary.hotspots[0].name).toBe('heavy-work');
  });

  // ---------------------------------------------------------------------------
  // Chrome Trace Export
  // ---------------------------------------------------------------------------

  it('exportChromeTrace returns trace format', () => {
    profiler.start();
    profiler.beginSpan('work');
    profiler.endSpan();
    const result = profiler.stop();
    const trace = profiler.exportChromeTrace(result);
    expect(trace).toHaveProperty('traceEvents');
    expect(Array.isArray(trace.traceEvents)).toBe(true);
    expect(trace.traceEvents.length).toBeGreaterThan(0);
  });

  it('exportJSON returns string', () => {
    profiler.start();
    profiler.recordSpan('op', 10);
    const result = profiler.stop();
    const json = profiler.exportJSON(result);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('samples');
  });

  // ---------------------------------------------------------------------------
  // Category Inference
  // ---------------------------------------------------------------------------

  it('infers parse category from name', () => {
    profiler.start();
    profiler.beginSpan('parse-tokens');
    profiler.endSpan();
    const result = profiler.stop();
    expect(result.samples[0].category).toBe('parse');
  });
});
