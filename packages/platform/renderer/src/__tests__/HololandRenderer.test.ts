import { describe, it, expect, vi } from 'vitest';
import { HololandRenderer } from '../HololandRenderer';
import { AdaptiveFrameRateManager, DEFAULT_THRESHOLDS } from '../AdaptiveFrameRateManager';
import { QualityManager, DEFAULT_QUALITY_POLICY } from '../QualityManager';
import { InferencePriorityScheduler } from '../RenderInferenceSeparation';
import { VRPerformanceBudget } from '../VRPerformanceBudget';

describe('HololandRenderer', () => {
  it('constructs with default managers', () => {
    const renderer = new HololandRenderer();
    expect(renderer.adaptive).toBeInstanceOf(AdaptiveFrameRateManager);
    expect(renderer.quality).toBeInstanceOf(QualityManager);
    expect(renderer.getThermalState()).toBe('cool');
  });

  it('wires adaptive state changes into quality policy', () => {
    const renderer = new HololandRenderer();
    for (let i = 0; i < 6; i++) {
      renderer.update(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }
    expect(renderer.getThermalState()).toBe('hot');
    expect(renderer.quality.getCurrentState()).toBe('hot');
    expect(renderer.quality.getGaussianBudget().maxSplats).toBe(
      DEFAULT_QUALITY_POLICY.hot.gaussian.maxSplats
    );
  });

  it('allows injecting preconfigured managers', () => {
    const adaptive = new AdaptiveFrameRateManager({ thresholds: { warmFrameTimeMs: 12 } });
    const quality = new QualityManager({
      cool: { ...DEFAULT_QUALITY_POLICY.cool, gaussian: { maxSplats: 2_000_000, maxMemoryMB: 1024 } },
    });
    const renderer = new HololandRenderer({ adaptiveFrameRate: adaptive, qualityManager: quality });
    expect(renderer.adaptive).toBe(adaptive);
    expect(renderer.quality).toBe(quality);
  });

  it('stops updating after dispose', () => {
    const adaptive = new AdaptiveFrameRateManager();
    let calls = 0;
    adaptive.onStateChange(() => {
      calls++;
    });
    const renderer = new HololandRenderer({ adaptiveFrameRate: adaptive });
    renderer.dispose();

    for (let i = 0; i < 6; i++) {
      renderer.update(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }

    expect(calls).toBe(0);
    expect(renderer.getThermalState()).toBe('cool');
  });

  it('handles multiple state transitions', () => {
    const renderer = new HololandRenderer();

    // Ramp up to hot
    for (let i = 0; i < 6; i++) {
      renderer.update(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }
    expect(renderer.quality.getCurrentState()).toBe('hot');

    // Cool back down
    for (let i = 0; i < 6; i++) {
      renderer.update(10, 0);
    }
    expect(renderer.quality.getCurrentState()).toBe('cool');
    expect(renderer.quality.shouldShedFeature('shadows')).toBe(false);
  });

  it('passes dropped frames to adaptive manager', () => {
    const adaptive = new AdaptiveFrameRateManager();
    const renderer = new HololandRenderer({ adaptiveFrameRate: adaptive });
    for (let i = 0; i < 6; i++) {
      renderer.update(10, DEFAULT_THRESHOLDS.criticalDroppedFrames);
    }
    expect(renderer.getThermalState()).toBe('critical');
    expect(renderer.quality.getCurrentState()).toBe('critical');
  });

  /* ---- render-inference separation (task_1778299058189_bskr) ---- */

  it('constructs with default inference scheduler', () => {
    const renderer = new HololandRenderer();
    expect(renderer.inference).toBeInstanceOf(InferencePriorityScheduler);
  });

  it('allows injecting a custom inference scheduler', () => {
    const custom = new InferencePriorityScheduler();
    const renderer = new HololandRenderer({ inferenceScheduler: custom });
    expect(renderer.inference).toBe(custom);
  });

  it('ticks inference scheduler on every update', () => {
    const scheduler = new InferencePriorityScheduler();
    const tickSpy = vi.spyOn(scheduler, 'tick');
    const renderer = new HololandRenderer({ inferenceScheduler: scheduler });

    renderer.update(16, 0);
    renderer.update(16, 0);
    expect(tickSpy).toHaveBeenCalledTimes(2);

    tickSpy.mockRestore();
  });

  it('drains inference results after update', () => {
    const scheduler = new InferencePriorityScheduler();
    const renderer = new HololandRenderer({ inferenceScheduler: scheduler });

    scheduler.schedule({
      id: 't1',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => 123,
    });

    renderer.update(16, 0);
    const results = renderer.drainInferenceResults();
    expect(results.length).toBe(1);
    expect(results[0].output).toBe(123);
  });

  it('exposes inference metrics', () => {
    const renderer = new HololandRenderer();
    const metrics = renderer.getInferenceMetrics();
    expect(typeof metrics.queueDepth).toBe('number');
    expect(typeof metrics.inFlight).toBe('number');
    expect(typeof metrics.completed).toBe('number');
    expect(typeof metrics.dropped).toBe('number');
    expect(typeof metrics.averageLatencyMs).toBe('number');
    expect(typeof metrics.deadlineMissRate).toBe('number');
  });

  it('clears inference queue on dispose', () => {
    const scheduler = new InferencePriorityScheduler();
    const clearSpy = vi.spyOn(scheduler, 'clear');
    const renderer = new HololandRenderer({ inferenceScheduler: scheduler });

    renderer.dispose();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it('stops ticking inference after dispose', () => {
    const scheduler = new InferencePriorityScheduler();
    const tickSpy = vi.spyOn(scheduler, 'tick');
    const renderer = new HololandRenderer({ inferenceScheduler: scheduler });

    renderer.dispose();
    renderer.update(16, 0);
    expect(tickSpy).not.toHaveBeenCalled();
    tickSpy.mockRestore();
  });

  /* ---- VRPerformanceBudget (task_1778299058189_tmcs) ---- */

  it('constructs with default performance budget', () => {
    const renderer = new HololandRenderer();
    expect(renderer.budget).toBeInstanceOf(VRPerformanceBudget);
  });

  it('allows injecting a custom performance budget', () => {
    const custom = new VRPerformanceBudget({ targetFrameTimeMs: 11.11 });
    const renderer = new HololandRenderer({ performanceBudget: custom });
    expect(renderer.budget).toBe(custom);
  });

  it('produces a budget report after update', () => {
    const renderer = new HololandRenderer();
    renderer.update(10, 0);
    const report = renderer.getBudgetReport();
    expect(report).not.toBeNull();
    expect(report!.frameTimeMs).toBe(10);
    expect(report!.categories.length).toBe(4);
  });

  it('records render usage in budget report', () => {
    const renderer = new HololandRenderer();
    renderer.update(8, 0);
    const report = renderer.getBudgetReport()!;
    const renderCat = report.categories.find((c) => c.category === 'render')!;
    expect(renderCat.usedMs).toBe(8);
  });

  it('returns null budget report before first update', () => {
    const renderer = new HololandRenderer();
    expect(renderer.getBudgetReport()).toBeNull();
  });
});
