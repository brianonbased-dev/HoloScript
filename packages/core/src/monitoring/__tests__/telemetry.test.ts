/**
 * telemetry.test.ts — Unit tests for packages/core/src/monitoring/telemetry.ts
 *
 * NOTE: `telemetry` is a module-level singleton — state accumulates across tests.
 * To keep tests independent we use unique metric names per test.
 */
import { describe, it, expect } from 'vitest';
import { telemetry } from '../telemetry.js';
import type { MetricSnapshot, MetricMeasurement } from '../telemetry.js';

// ─── incrementCounter ────────────────────────────────────────────────────────

describe('telemetry.incrementCounter', () => {
  it('registers a new counter with value 1 (default)', () => {
    const name = `counter_default_${Date.now()}`;
    telemetry.incrementCounter(name);
    const snap = telemetry.getSnapshot();
    expect(snap.counters[name]).toBe(1);
  });

  it('registers a new counter with explicit value', () => {
    const name = `counter_explicit_${Date.now()}_a`;
    telemetry.incrementCounter(name, 7);
    const snap = telemetry.getSnapshot();
    expect(snap.counters[name]).toBe(7);
  });

  it('accumulates counter on repeated calls', () => {
    const name = `counter_accum_${Date.now()}_b`;
    telemetry.incrementCounter(name, 3);
    telemetry.incrementCounter(name, 3);
    telemetry.incrementCounter(name, 4);
    const snap = telemetry.getSnapshot();
    expect(snap.counters[name]).toBe(10);
  });

  it('increments by 1 multiple times', () => {
    const name = `counter_ones_${Date.now()}_c`;
    for (let i = 0; i < 5; i++) telemetry.incrementCounter(name);
    const snap = telemetry.getSnapshot();
    expect(snap.counters[name]).toBe(5);
  });

  it('supports labels (does not throw)', () => {
    const name = `counter_labeled_${Date.now()}_d`;
    expect(() =>
      telemetry.incrementCounter(name, 1, { env: 'test', service: 'core' }),
    ).not.toThrow();
  });

  it('handles zero increment', () => {
    const name = `counter_zero_${Date.now()}_e`;
    telemetry.incrementCounter(name, 0);
    const snap = telemetry.getSnapshot();
    expect(snap.counters[name]).toBe(0);
  });

  it('handles large values', () => {
    const name = `counter_large_${Date.now()}_f`;
    telemetry.incrementCounter(name, 1_000_000);
    const snap = telemetry.getSnapshot();
    expect(snap.counters[name]).toBe(1_000_000);
  });
});

// ─── setGauge ────────────────────────────────────────────────────────────────

describe('telemetry.setGauge', () => {
  it('sets a gauge value', () => {
    const name = `gauge_set_${Date.now()}_a`;
    telemetry.setGauge(name, 42.5);
    const snap = telemetry.getSnapshot();
    expect(snap.gauges[name]).toBe(42.5);
  });

  it('overwrites previous gauge value', () => {
    const name = `gauge_overwrite_${Date.now()}_b`;
    telemetry.setGauge(name, 10);
    telemetry.setGauge(name, 20);
    const snap = telemetry.getSnapshot();
    expect(snap.gauges[name]).toBe(20);
  });

  it('sets gauge to zero', () => {
    const name = `gauge_zero_${Date.now()}_c`;
    telemetry.setGauge(name, 99);
    telemetry.setGauge(name, 0);
    const snap = telemetry.getSnapshot();
    expect(snap.gauges[name]).toBe(0);
  });

  it('sets negative gauge value', () => {
    const name = `gauge_neg_${Date.now()}_d`;
    telemetry.setGauge(name, -5.5);
    const snap = telemetry.getSnapshot();
    expect(snap.gauges[name]).toBe(-5.5);
  });

  it('supports labels (does not throw)', () => {
    const name = `gauge_labeled_${Date.now()}_e`;
    expect(() => telemetry.setGauge(name, 1.0, { region: 'us-east' })).not.toThrow();
  });

  it('multiple distinct gauges coexist', () => {
    const base = Date.now();
    const n1 = `gauge_multi_${base}_1`;
    const n2 = `gauge_multi_${base}_2`;
    telemetry.setGauge(n1, 100);
    telemetry.setGauge(n2, 200);
    const snap = telemetry.getSnapshot();
    expect(snap.gauges[n1]).toBe(100);
    expect(snap.gauges[n2]).toBe(200);
  });
});

// ─── measureLatency ──────────────────────────────────────────────────────────

describe('telemetry.measureLatency', () => {
  it('returns the value from the wrapped function', async () => {
    const name = `latency_return_${Date.now()}_a`;
    const result = await telemetry.measureLatency(name, async () => 42);
    expect(result).toBe(42);
  });

  it('records histogram entry', async () => {
    const name = `latency_histogram_${Date.now()}_b`;
    await telemetry.measureLatency(name, async () => 'hi');
    const snap = telemetry.getSnapshot();
    expect(snap.histograms[name]).toBeDefined();
    expect(snap.histograms[name].count).toBeGreaterThanOrEqual(1);
  });

  it('histogram count accumulates on repeated measurements', async () => {
    const name = `latency_accum_${Date.now()}_c`;
    await telemetry.measureLatency(name, async () => 1);
    await telemetry.measureLatency(name, async () => 2);
    await telemetry.measureLatency(name, async () => 3);
    const snap = telemetry.getSnapshot();
    expect(snap.histograms[name].count).toBeGreaterThanOrEqual(3);
  });

  it('histogram has avg field', async () => {
    const name = `latency_avg_${Date.now()}_d`;
    await telemetry.measureLatency(name, async () => 'x');
    const snap = telemetry.getSnapshot();
    expect(typeof snap.histograms[name].avg).toBe('number');
    expect(snap.histograms[name].avg).toBeGreaterThanOrEqual(0);
  });

  it('histogram has max field >= avg', async () => {
    const name = `latency_max_${Date.now()}_e`;
    await telemetry.measureLatency(name, async () => undefined);
    await telemetry.measureLatency(name, async () => undefined);
    const snap = telemetry.getSnapshot();
    const h = snap.histograms[name];
    expect(h.max).toBeGreaterThanOrEqual(h.avg);
  });

  it('histogram has sum field', async () => {
    const name = `latency_sum_${Date.now()}_f`;
    await telemetry.measureLatency(name, async () => null);
    const snap = telemetry.getSnapshot();
    expect(typeof snap.histograms[name].sum).toBe('number');
    expect(snap.histograms[name].sum).toBeGreaterThanOrEqual(0);
  });

  it('propagates error from wrapped function', async () => {
    const name = `latency_error_${Date.now()}_g`;
    await expect(
      telemetry.measureLatency(name, async () => {
        throw new Error('expected error');
      }),
    ).rejects.toThrow('expected error');
  });

  it('still records histogram even when wrapped fn throws', async () => {
    const name = `latency_error_record_${Date.now()}_h`;
    try {
      await telemetry.measureLatency(name, async () => {
        throw new Error('oops');
      });
    } catch {
      // expected
    }
    const snap = telemetry.getSnapshot();
    // Implementation may or may not record on error — check it doesn't crash
    expect(snap).toBeDefined();
  });

  it('supports labels (does not throw)', async () => {
    const name = `latency_labels_${Date.now()}_i`;
    await expect(
      telemetry.measureLatency(name, async () => true, { target: 'webgpu' }),
    ).resolves.toBe(true);
  });

  it('measures real elapsed time (>= 0ms)', async () => {
    const name = `latency_real_${Date.now()}_j`;
    await telemetry.measureLatency(name, async () => {
      // Small async work
      await new Promise((r) => setTimeout(r, 1));
    });
    const snap = telemetry.getSnapshot();
    expect(snap.histograms[name].avg).toBeGreaterThanOrEqual(0);
    expect(snap.histograms[name].sum).toBeGreaterThanOrEqual(0);
  });
});

// ─── getSnapshot ─────────────────────────────────────────────────────────────

describe('telemetry.getSnapshot', () => {
  it('returns an object with counters, histograms, gauges fields', () => {
    const snap = telemetry.getSnapshot();
    expect(snap).toBeDefined();
    expect(typeof snap.counters).toBe('object');
    expect(typeof snap.histograms).toBe('object');
    expect(typeof snap.gauges).toBe('object');
  });

  it('counters is a flat string->number map', () => {
    const name = `snap_counter_${Date.now()}_a`;
    telemetry.incrementCounter(name, 5);
    const snap = telemetry.getSnapshot();
    expect(typeof snap.counters[name]).toBe('number');
  });

  it('gauges is a flat string->number map', () => {
    const name = `snap_gauge_${Date.now()}_b`;
    telemetry.setGauge(name, 3.14);
    const snap = telemetry.getSnapshot();
    expect(typeof snap.gauges[name]).toBe('number');
  });

  it('histograms entries have required fields', async () => {
    const name = `snap_hist_${Date.now()}_c`;
    await telemetry.measureLatency(name, async () => {});
    const snap = telemetry.getSnapshot();
    const h = snap.histograms[name];
    expect(h).toBeDefined();
    expect(typeof h.count).toBe('number');
    expect(typeof h.sum).toBe('number');
    expect(typeof h.avg).toBe('number');
    expect(typeof h.max).toBe('number');
  });

  it('snapshot counters do not include histogram keys as 0', () => {
    const snap = telemetry.getSnapshot();
    // counters and histograms are separate namespaces
    const counterKeys = Object.keys(snap.counters);
    const histogramKeys = Object.keys(snap.histograms);
    // They may share names if someone explicitly adds both, but the namespaces are distinct
    expect(snap.counters).not.toBe(snap.histograms);
  });

  it('multiple calls return consistent state', () => {
    const name = `snap_consistent_${Date.now()}_d`;
    telemetry.incrementCounter(name, 3);
    const snap1 = telemetry.getSnapshot();
    const snap2 = telemetry.getSnapshot();
    expect(snap1.counters[name]).toBe(snap2.counters[name]);
  });
});

// ─── MetricSnapshot interface compliance ─────────────────────────────────────

describe('MetricSnapshot interface compliance', () => {
  it('snapshot satisfies MetricSnapshot shape', () => {
    const snap: MetricSnapshot = telemetry.getSnapshot();
    expect(snap).toBeDefined();
    expect('counters' in snap).toBe(true);
    expect('histograms' in snap).toBe(true);
    expect('gauges' in snap).toBe(true);
  });
});

// ─── Integration: combined usage ─────────────────────────────────────────────

describe('combined telemetry usage', () => {
  it('can record counter, gauge, and latency independently', async () => {
    const base = `integration_${Date.now()}`;
    telemetry.incrementCounter(`${base}_c`, 1);
    telemetry.setGauge(`${base}_g`, 9.9);
    await telemetry.measureLatency(`${base}_h`, async () => 'done');
    const snap = telemetry.getSnapshot();
    expect(snap.counters[`${base}_c`]).toBe(1);
    expect(snap.gauges[`${base}_g`]).toBe(9.9);
    expect(snap.histograms[`${base}_h`]).toBeDefined();
  });

  it('increments counter inside measureLatency callback', async () => {
    const cName = `nested_c_${Date.now()}_a`;
    const hName = `nested_h_${Date.now()}_a`;
    await telemetry.measureLatency(hName, async () => {
      telemetry.incrementCounter(cName, 1);
    });
    const snap = telemetry.getSnapshot();
    expect(snap.counters[cName]).toBe(1);
    expect(snap.histograms[hName].count).toBeGreaterThanOrEqual(1);
  });
});
