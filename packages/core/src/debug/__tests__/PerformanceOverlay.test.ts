import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceOverlay } from '../PerformanceOverlay';

describe('PerformanceOverlay', () => {
  let overlay: PerformanceOverlay;

  beforeEach(() => {
    overlay = new PerformanceOverlay({ targetFPS: 60 });
  });

  it('constructs with default config', () => {
    const config = overlay.getConfig();
    expect(config.targetFPS).toBe(60);
    expect(config.showFPS).toBe(true);
    expect(config.maxSamples).toBe(120);
  });

  it('recordFrame adds samples', () => {
    overlay.recordFrame(16.67, 100, 50000, 256);
    expect(overlay.getSampleCount()).toBe(1);
  });

  it('getAverageFPS computes average', () => {
    overlay.recordFrame(16.67, 100, 50000, 256); // ~60fps
    overlay.recordFrame(16.67, 100, 50000, 256);
    const avg = overlay.getAverageFPS();
    expect(avg).toBeCloseTo(59.98, 0);
  });

  it('getAverageFPS returns 0 with no samples', () => {
    expect(overlay.getAverageFPS()).toBe(0);
  });

  it('get1PercentLow returns lowest FPS', () => {
    // Need at least 10 samples
    for (let i = 0; i < 9; i++) overlay.recordFrame(16.67, 100, 50000, 256);
    overlay.recordFrame(33.33, 100, 50000, 256); // ~30fps spike
    const low = overlay.get1PercentLow();
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(60);
  });

  it('getCurrentMemory returns last sample memory', () => {
    overlay.recordFrame(16.67, 100, 50000, 512);
    expect(overlay.getCurrentMemory()).toBe(512);
  });

  it('getCurrentMemory returns 0 with no samples', () => {
    expect(overlay.getCurrentMemory()).toBe(0);
  });

  it('isBelowTarget detects low FPS', () => {
    overlay.recordFrame(33.33, 100, 50000, 256); // ~30fps < 60 target
    expect(overlay.isBelowTarget()).toBe(true);
  });

  it('getFrameGraph returns delta times', () => {
    overlay.recordFrame(16.67, 100, 50000, 256);
    overlay.recordFrame(16.67, 100, 50000, 256);
    const graph = overlay.getFrameGraph();
    expect(graph.length).toBe(2);
    expect(graph[0]).toBeCloseTo(16.67);
  });

  it('toggle visibility', () => {
    expect(overlay.isVisible()).toBe(true);
    overlay.toggle();
    expect(overlay.isVisible()).toBe(false);
    overlay.toggle();
    expect(overlay.isVisible()).toBe(true);
  });

  it('respects maxSamples cap', () => {
    const small = new PerformanceOverlay({ maxSamples: 5 });
    for (let i = 0; i < 10; i++) small.recordFrame(16.67, 100, 50000, 256);
    expect(small.getSampleCount()).toBe(5);
  });
});
