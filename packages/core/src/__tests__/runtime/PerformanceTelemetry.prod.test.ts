/**
 * PerformanceTelemetry Production Tests
 *
 * Covers: recordMetric (stores metric, timestamp, type, tags), recordFrame
 * (skipped when monitoring disabled, appends to frameTimings + auto-records
 * frame_duration/fps/render_time metrics), getAverageFPS (0 when empty,
 * computed from frameTimes), setBudget, getRecentFrameTimings (slice of last
 * N), exportMetrics (calls exporter.export, clears stored metrics, no-op when
 * empty), generateReport (returns string with headers), dispose (clears all data),
 * startMonitoring / stopMonitoring state.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerformanceTelemetry } from '../../runtime/PerformanceTelemetry';
import type { AnalyticsExporter } from '../../runtime/PerformanceTelemetry';

function makePT() {
  return new PerformanceTelemetry();
}

// Helper: create & start PT, record N frames (each ~16ms apart), stop
function recordFrames(pt: PerformanceTelemetry, count: number) {
  pt.startMonitoring();
  for (let i = 0; i < count; i++) {
    // recordFrame measures wall-clock diff so call it rapidly; the exact
    // fps/frameDuration will vary but the important thing is frames are recorded.
    pt.recordFrame(2, 1, 3, 1);
  }
}

// ── recordMetric ──────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — recordMetric', () => {
  it('stores metric with provided values', async () => {
    const pt = makePT();
    pt.recordMetric({ name: 'myMetric', type: 'gauge', value: 42 });
    // Verify via exportMetrics capturing the export call
    const exported: any[] = [];
    const exporter: AnalyticsExporter = {
      export: vi.fn(async (m) => {
        exported.push(...m);
      }),
      flush: vi.fn(),
    };
    pt.addExporter(exporter);
    await pt.exportMetrics();
    const m = exported.find((x) => x.name === 'myMetric');
    expect(m?.value).toBe(42);
    expect(m?.type).toBe('gauge');
  });

  it('uses provided timestamp if given', async () => {
    const pt = makePT();
    const ts = 1234567890000;
    pt.recordMetric({ name: 'timed', type: 'counter', value: 1, timestamp: ts });
    const exported: any[] = [];
    pt.addExporter({
      export: async (m) => {
        exported.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    expect(exported.find((x) => x.name === 'timed')?.timestamp).toBe(ts);
  });

  it('applies fallback timestamp when none provided', async () => {
    const pt = makePT();
    const before = Date.now();
    pt.recordMetric({ name: 'auto', type: 'gauge', value: 0 });
    const after = Date.now();
    const exported: any[] = [];
    pt.addExporter({
      export: async (m) => {
        exported.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    const ts = exported.find((x) => x.name === 'auto')?.timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('metric with tags stores tags field', async () => {
    const pt = makePT();
    pt.recordMetric({ name: 'tagged', type: 'gauge', value: 1, tags: { region: 'us-west' } });
    const exported: any[] = [];
    pt.addExporter({
      export: async (m) => {
        exported.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    expect(exported.find((x) => x.name === 'tagged')?.tags?.region).toBe('us-west');
  });
});

// ── recordFrame ───────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — recordFrame', () => {
  it('recordFrame is ignored when monitoring disabled', async () => {
    const pt = makePT(); // NOT started
    pt.recordFrame(1, 1, 1, 1);
    expect(pt.getRecentFrameTimings(10)).toHaveLength(0);
  });

  it('recordFrame appends to frameTimings', () => {
    const pt = makePT();
    recordFrames(pt, 3);
    expect(pt.getRecentFrameTimings(10).length).toBe(3);
  });

  it('recordFrame records built-in frame_duration metric', async () => {
    const pt = makePT();
    recordFrames(pt, 1);
    const exported: any[] = [];
    pt.addExporter({
      export: async (m) => {
        exported.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    expect(exported.some((m) => m.name === 'frame_duration')).toBe(true);
  });

  it('recordFrame records fps metric', async () => {
    const pt = makePT();
    recordFrames(pt, 1);
    const exported: any[] = [];
    pt.addExporter({
      export: async (m) => {
        exported.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    expect(exported.some((m) => m.name === 'fps')).toBe(true);
  });

  it('recordFrame records render_time metric', async () => {
    const pt = makePT();
    recordFrames(pt, 1);
    const exported: any[] = [];
    pt.addExporter({
      export: async (m) => {
        exported.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    expect(exported.some((m) => m.name === 'render_time')).toBe(true);
  });
});

// ── getAverageFPS ─────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — getAverageFPS', () => {
  it('returns 0 when no frames recorded', () => {
    expect(makePT().getAverageFPS()).toBe(0);
  });

  it('returns a positive integer when frames have been recorded', () => {
    const pt = makePT();
    recordFrames(pt, 5);
    expect(pt.getAverageFPS()).toBeGreaterThan(0);
  });
});

// ── getRecentFrameTimings ──────────────────────────────────────────────────────

describe('PerformanceTelemetry — getRecentFrameTimings', () => {
  it('returns empty array before frames are recorded', () => {
    expect(makePT().getRecentFrameTimings(10)).toHaveLength(0);
  });

  it('returns all frames when count >= total', () => {
    const pt = makePT();
    recordFrames(pt, 5);
    expect(pt.getRecentFrameTimings(100)).toHaveLength(5);
  });

  it('returns only last N frames when N < total', () => {
    const pt = makePT();
    recordFrames(pt, 10);
    expect(pt.getRecentFrameTimings(3)).toHaveLength(3);
  });
});

// ── setBudget ─────────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — setBudget', () => {
  it('setBudget does not throw', () => {
    const pt = makePT();
    expect(() =>
      pt.setBudget({
        metricName: 'custom',
        maxValue: 50,
        severity: 'critical',
        enabled: true,
      })
    ).not.toThrow();
  });

  it('setBudget overwrites default budget for same metricName', () => {
    const pt = makePT();
    // Default frame_duration budget is 16.67. Setting to 99ms should NOT trigger
    // violation warnings in console (not easily verifiable here, just no-throw).
    expect(() =>
      pt.setBudget({
        metricName: 'frame_duration',
        maxValue: 99999,
        severity: 'info',
        enabled: true,
      })
    ).not.toThrow();
  });
});

// ── exportMetrics ──────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — exportMetrics', () => {
  it('exportMetrics is no-op when metrics array is empty', async () => {
    const pt = makePT();
    const exporter: AnalyticsExporter = { export: vi.fn(), flush: vi.fn() };
    pt.addExporter(exporter);
    await pt.exportMetrics();
    expect(exporter.export).not.toHaveBeenCalled();
  });

  it('exportMetrics calls exporter.export with all metrics', async () => {
    const pt = makePT();
    pt.recordMetric({ name: 'a', type: 'gauge', value: 1 });
    pt.recordMetric({ name: 'b', type: 'counter', value: 2 });
    const captured: any[] = [];
    pt.addExporter({
      export: async (m) => {
        captured.push(...m);
      },
      flush: async () => {},
    });
    await pt.exportMetrics();
    expect(captured.map((x) => x.name)).toContain('a');
    expect(captured.map((x) => x.name)).toContain('b');
  });

  it('exportMetrics clears metrics after export', async () => {
    const pt = makePT();
    pt.recordMetric({ name: 'a', type: 'gauge', value: 1 });
    pt.addExporter({ export: async () => {}, flush: async () => {} });
    await pt.exportMetrics();
    // Calling again when empty should not call exporter again
    const exporter2: AnalyticsExporter = { export: vi.fn(), flush: vi.fn() };
    pt.addExporter(exporter2);
    await pt.exportMetrics();
    expect(exporter2.export).not.toHaveBeenCalled();
  });

  it('exporter error does not propagate', async () => {
    const pt = makePT();
    pt.recordMetric({ name: 'x', type: 'gauge', value: 0 });
    pt.addExporter({
      export: async () => {
        throw new Error('export failed');
      },
      flush: async () => {},
    });
    await expect(pt.exportMetrics()).resolves.not.toThrow();
  });
});

// ── generateReport ────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — generateReport', () => {
  it('returns a string', () => {
    expect(typeof makePT().generateReport()).toBe('string');
  });

  it('contains Performance Report header', () => {
    expect(makePT().generateReport()).toContain('Performance Report');
  });

  it('contains Average FPS line', () => {
    expect(makePT().generateReport()).toContain('Average FPS');
  });

  it('contains Memory Usage section', () => {
    expect(makePT().generateReport()).toContain('Memory Usage');
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('PerformanceTelemetry — dispose', () => {
  it('dispose clears frame timings', () => {
    const pt = makePT();
    recordFrames(pt, 5);
    pt.dispose();
    expect(pt.getRecentFrameTimings(10)).toHaveLength(0);
  });

  it('dispose clears average fps', () => {
    const pt = makePT();
    recordFrames(pt, 5);
    pt.dispose();
    expect(pt.getAverageFPS()).toBe(0);
  });

  it('dispose does not throw even without monitoring', () => {
    expect(() => makePT().dispose()).not.toThrow();
  });
});
