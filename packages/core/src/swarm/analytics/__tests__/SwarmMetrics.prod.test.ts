/**
 * SwarmMetrics — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { SwarmMetrics } from '../SwarmMetrics';

function make(cfg = {}) { return new SwarmMetrics(cfg); }

describe('SwarmMetrics — construction', () => {
  it('constructs without args', () => expect(() => make()).not.toThrow());
  it('custom retentionPeriod', () => expect(() => make({ retentionPeriod: 60000 })).not.toThrow());
});

describe('SwarmMetrics — counter', () => {
  it('registers counter at 0', () => {
    const m = make(); m.register({ name: 'c', type: 'counter', description: 'test' });
    expect(m.getCounter('c')).toBe(0);
  });
  it('increment by 1', () => {
    const m = make(); m.register({ name: 'c', type: 'counter', description: 'test' });
    m.increment('c'); expect(m.getCounter('c')).toBe(1);
  });
  it('increment by value', () => {
    const m = make(); m.register({ name: 'c', type: 'counter', description: 'test' });
    m.increment('c', 5); expect(m.getCounter('c')).toBe(5);
  });
  it('accumulates multiple increments', () => {
    const m = make(); m.register({ name: 'c', type: 'counter', description: 'test' });
    m.increment('c', 3); m.increment('c', 4); expect(m.getCounter('c')).toBe(7);
  });
  it('unregistered counter returns 0', () => {
    expect(make().getCounter('ghost')).toBe(0);
  });
  it('reset counter to 0', () => {
    const m = make(); m.register({ name: 'c', type: 'counter', description: 'test' });
    m.increment('c', 10); m.reset('c');
    expect(m.getCounter('c')).toBe(0);
  });
  it('getStats counter: min=max=avg=value', () => {
    const m = make(); m.register({ name: 'c', type: 'counter', description: 'test' });
    m.increment('c', 7);
    const s = m.getStats('c')!;
    expect(s.currentValue).toBe(7); expect(s.min).toBe(7); expect(s.max).toBe(7);
  });
});

describe('SwarmMetrics — gauge', () => {
  it('setGauge stores value', () => {
    const m = make(); m.register({ name: 'g', type: 'gauge', description: 'test' });
    m.setGauge('g', 42); expect(m.getGauge('g')).toBe(42);
  });
  it('getGauge returns latest value', () => {
    const m = make(); m.register({ name: 'g', type: 'gauge', description: 'test' });
    m.setGauge('g', 10); m.setGauge('g', 20); expect(m.getGauge('g')).toBe(20);
  });
  it('getGauge undefined for no values', () => {
    const m = make(); m.register({ name: 'g', type: 'gauge', description: 'test' });
    expect(m.getGauge('g')).toBeUndefined();
  });
  it('getGaugeHistory returns all values', () => {
    const m = make(); m.register({ name: 'g', type: 'gauge', description: 'test' });
    m.setGauge('g', 1); m.setGauge('g', 2); m.setGauge('g', 3);
    expect(m.getGaugeHistory('g')).toHaveLength(3);
  });
  it('getStats gauge: min/max/avg correct', () => {
    const m = make(); m.register({ name: 'g', type: 'gauge', description: 'test' });
    m.setGauge('g', 10); m.setGauge('g', 20); m.setGauge('g', 30);
    const s = m.getStats('g')!;
    expect(s.min).toBe(10); expect(s.max).toBe(30); expect(s.avg).toBe(20);
  });
  it('reset gauge clears values', () => {
    const m = make(); m.register({ name: 'g', type: 'gauge', description: 'test' });
    m.setGauge('g', 99); m.reset('g');
    expect(m.getGauge('g')).toBeUndefined();
  });
});

describe('SwarmMetrics — histogram', () => {
  it('observeHistogram adds to count', () => {
    const m = make(); m.register({ name: 'h', type: 'histogram', description: 'test' });
    m.observeHistogram('h', 5); m.observeHistogram('h', 10);
    expect(m.getHistogram('h')!.count).toBe(2);
  });
  it('sum accumulates correctly', () => {
    const m = make(); m.register({ name: 'h', type: 'histogram', description: 'test' });
    m.observeHistogram('h', 3); m.observeHistogram('h', 7);
    expect(m.getHistogram('h')!.sum).toBe(10);
  });
  it('setHistogramBoundaries updates buckets', () => {
    const m = make(); m.register({ name: 'h', type: 'histogram', description: 'test' });
    m.setHistogramBoundaries('h', [1, 5, 10]);
    expect(m.getHistogram('h')!.boundaries).toHaveLength(3);
  });
  it('values bucketed correctly', () => {
    const m = make(); m.register({ name: 'h', type: 'histogram', description: 'test' });
    m.setHistogramBoundaries('h', [1, 5, 10]);
    m.observeHistogram('h', 3); // in bucket [1,5]
    const hist = m.getHistogram('h')!;
    expect(hist.counts[1]).toBe(1); // boundary index 1 = le=5
  });
  it('getStats histogram: avg = sum/count', () => {
    const m = make(); m.register({ name: 'h', type: 'histogram', description: 'test' });
    m.observeHistogram('h', 4); m.observeHistogram('h', 6);
    expect(m.getStats('h')!.avg).toBe(5);
  });
  it('reset histogram clears', () => {
    const m = make(); m.register({ name: 'h', type: 'histogram', description: 'test' });
    m.observeHistogram('h', 5); m.reset('h');
    expect(m.getHistogram('h')!.count).toBe(0);
  });
});

describe('SwarmMetrics — summary', () => {
  it('observeSummary stores values', () => {
    const m = make(); m.register({ name: 's', type: 'summary', description: 'test' });
    m.observeSummary('s', 10); m.observeSummary('s', 20);
    expect(m.getSummary('s')!.count).toBe(2);
  });
  it('getSummary percentiles correct', () => {
    const m = make(); m.register({ name: 's', type: 'summary', description: 'test' });
    for (let i = 1; i <= 100; i++) m.observeSummary('s', i);
    const p = m.getSummary('s')!;
    expect(p.p50).toBeGreaterThanOrEqual(50);
    expect(p.p99).toBeGreaterThanOrEqual(99);
  });
  it('getSummary undefined for no observations', () => {
    const m = make(); m.register({ name: 's', type: 'summary', description: 'test' });
    expect(m.getSummary('s')).toBeUndefined();
  });
  it('getStats summary: min/max/avg', () => {
    const m = make(); m.register({ name: 's', type: 'summary', description: 'test' });
    m.observeSummary('s', 2); m.observeSummary('s', 4); m.observeSummary('s', 6);
    const s = m.getStats('s')!;
    expect(s.min).toBe(2); expect(s.max).toBe(6); expect(s.avg).toBe(4);
  });
  it('maxSamples trims oldest', () => {
    const m = make({ maxSamples: 3 });
    m.register({ name: 's', type: 'summary', description: 'test' });
    for (let i = 0; i < 5; i++) m.observeSummary('s', i);
    expect(m.getSummary('s')!.count).toBe(3);
  });
});

describe('SwarmMetrics — getRegistered / getAllStats / resetAll', () => {
  it('getRegistered returns all defs', () => {
    const m = make();
    m.register({ name: 'c', type: 'counter', description: 'a' });
    m.register({ name: 'g', type: 'gauge', description: 'b' });
    expect(m.getRegistered()).toHaveLength(2);
  });
  it('getAllStats returns stats for all', () => {
    const m = make();
    m.register({ name: 'c', type: 'counter', description: 'test' });
    m.register({ name: 'g', type: 'gauge', description: 'test' });
    m.increment('c', 5); m.setGauge('g', 3);
    const all = m.getAllStats();
    expect(all['c'].currentValue).toBe(5);
  });
  it('resetAll resets every metric', () => {
    const m = make();
    m.register({ name: 'c', type: 'counter', description: 'test' });
    m.increment('c', 100); m.resetAll();
    expect(m.getCounter('c')).toBe(0);
  });
  it('getStats undefined for unregistered', () => {
    expect(make().getStats('ghost')).toBeUndefined();
  });
});

describe('SwarmMetrics — toPrometheus', () => {
  it('counter exported', () => {
    const m = make();
    m.register({ name: 'req_total', type: 'counter', description: 'Requests' });
    m.increment('req_total', 7);
    const prom = m.toPrometheus();
    expect(prom).toContain('req_total 7');
    expect(prom).toContain('# HELP req_total Requests');
  });
  it('gauge exported', () => {
    const m = make();
    m.register({ name: 'mem_bytes', type: 'gauge', description: 'Memory' });
    m.setGauge('mem_bytes', 512);
    expect(m.toPrometheus()).toContain('mem_bytes 512');
  });
  it('histogram buckets exported', () => {
    const m = make();
    m.register({ name: 'latency', type: 'histogram', description: 'Latency' });
    m.observeHistogram('latency', 0.3);
    const prom = m.toPrometheus();
    expect(prom).toContain('latency_bucket');
    expect(prom).toContain('latency_sum');
    expect(prom).toContain('latency_count');
  });
  it('summary quantiles exported', () => {
    const m = make();
    m.register({ name: 'resp', type: 'summary', description: 'Response' });
    for (let i = 1; i <= 20; i++) m.observeSummary('resp', i);
    const prom = m.toPrometheus();
    expect(prom).toContain('quantile="0.5"');
    expect(prom).toContain('quantile="0.99"');
  });
});
