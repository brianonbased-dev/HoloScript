import { describe, it, expect } from 'vitest';
import { HololandRenderer } from '../HololandRenderer';
import { AdaptiveFrameRateManager, DEFAULT_THRESHOLDS } from '../AdaptiveFrameRateManager';
import { QualityManager, DEFAULT_QUALITY_POLICY } from '../QualityManager';

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
});
