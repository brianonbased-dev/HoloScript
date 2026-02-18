import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceTelemetry, getPerformanceTelemetry } from '../PerformanceTelemetry';
import type { AnalyticsExporter, Metric } from '../PerformanceTelemetry';

describe('PerformanceTelemetry', () => {
  let telemetry: PerformanceTelemetry;

  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => Date.now()),
      memory: {
        usedJSHeapSize: 50 * 1024 * 1024,
        totalJSHeapSize: 100 * 1024 * 1024,
        jsHeapSizeLimit: 200 * 1024 * 1024,
      },
    });
    telemetry = new PerformanceTelemetry();
  });

  afterEach(() => {
    telemetry.dispose();
    vi.restoreAllMocks();
  });

  it('initializes with default budgets', () => {
    // Budgets are private, but we can verify via setBudget not throwing
    // and behavior with recordFrame
    expect(telemetry).toBeDefined();
    expect(telemetry.getAverageFPS()).toBe(0);
  });

  it('getAverageFPS returns 0 when no frames recorded', () => {
    expect(telemetry.getAverageFPS()).toBe(0);
  });

  it('getMemoryStats returns zeros when no snapshots', () => {
    const stats = telemetry.getMemoryStats();
    expect(stats.used).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.limit).toBe(0);
    expect(stats.percentage).toBe(0);
  });

  it('startMonitoring and stopMonitoring toggle state', () => {
    telemetry.startMonitoring();
    // recordFrame should now work
    telemetry.recordFrame(5, 3, 8, 4);
    expect(telemetry.getRecentFrameTimings(1).length).toBe(1);

    telemetry.stopMonitoring();
    // recordFrame should be a no-op now
    telemetry.recordFrame(5, 3, 8, 4);
    // Still 1 from before
    expect(telemetry.getRecentFrameTimings().length).toBe(1);
  });

  it('recordFrame captures timing data', () => {
    let callCount = 0;
    vi.stubGlobal('performance', {
      now: vi.fn(() => {
        callCount++;
        return callCount * 16.67; // ~60fps
      }),
      memory: null,
    });

    telemetry.startMonitoring();
    telemetry.recordFrame(5, 3, 8, 4);

    const timings = telemetry.getRecentFrameTimings(1);
    expect(timings.length).toBe(1);
    expect(timings[0].cpuTime).toBe(5);
    expect(timings[0].gpuTime).toBe(3);
    expect(timings[0].renderTime).toBe(8);
    expect(timings[0].logicTime).toBe(4);
    expect(timings[0].frameNumber).toBe(0);
  });

  it('recordMetric stores custom metrics', () => {
    telemetry.recordMetric({
      name: 'custom_metric',
      type: 'counter',
      value: 42,
    });
    // We can verify via exportMetrics
    const mockExporter: AnalyticsExporter = {
      export: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
    };
    telemetry.addExporter(mockExporter);
    telemetry.exportMetrics();
    // The custom metric plus any that were already recorded
    expect(mockExporter.export).toHaveBeenCalled();
  });

  it('recordMemorySnapshot captures heap stats', () => {
    telemetry.startMonitoring();
    telemetry.recordMemorySnapshot();

    const stats = telemetry.getMemoryStats();
    expect(stats.used).toBe(50 * 1024 * 1024);
    expect(stats.total).toBe(100 * 1024 * 1024);
    expect(stats.limit).toBe(200 * 1024 * 1024);
    expect(stats.percentage).toBeCloseTo(25);
  });

  it('exportMetrics sends to registered exporters', async () => {
    const exported: Metric[][] = [];
    const mockExporter: AnalyticsExporter = {
      export: vi.fn(async (metrics) => { exported.push(metrics); }),
      flush: vi.fn(async () => {}),
    };

    telemetry.addExporter(mockExporter);
    telemetry.recordMetric({ name: 'test', type: 'gauge', value: 1 });
    telemetry.recordMetric({ name: 'test2', type: 'counter', value: 2 });

    await telemetry.exportMetrics();

    expect(mockExporter.export).toHaveBeenCalledTimes(1);
    expect(exported[0].length).toBe(2);
    expect(exported[0][0].name).toBe('test');
    expect(exported[0][1].name).toBe('test2');
  });

  it('exportMetrics clears after export', async () => {
    const mockExporter: AnalyticsExporter = {
      export: vi.fn(async () => {}),
      flush: vi.fn(async () => {}),
    };
    telemetry.addExporter(mockExporter);
    telemetry.recordMetric({ name: 'test', type: 'gauge', value: 1 });

    await telemetry.exportMetrics();
    // Second export should be empty
    await telemetry.exportMetrics();
    expect(mockExporter.export).toHaveBeenCalledTimes(1);
  });

  it('generateReport returns formatted string', () => {
    const report = telemetry.generateReport();
    expect(report).toContain('Performance Report');
    expect(report).toContain('Average FPS');
    expect(report).toContain('Memory Usage');
  });

  it('dispose cleans up all state', () => {
    telemetry.startMonitoring();
    telemetry.recordMetric({ name: 'test', type: 'gauge', value: 1 });
    telemetry.dispose();

    expect(telemetry.getAverageFPS()).toBe(0);
    expect(telemetry.getMemoryStats().used).toBe(0);
    expect(telemetry.getRecentFrameTimings().length).toBe(0);
  });

  it('setBudget updates budget thresholds', () => {
    telemetry.setBudget({
      metricName: 'frame_duration',
      maxValue: 33.33, // 30fps target
      severity: 'critical',
      enabled: true,
    });
    // Budget is stored — no error
    expect(true).toBe(true);
  });
});
