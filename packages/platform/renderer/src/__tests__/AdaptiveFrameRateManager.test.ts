import { describe, it, expect } from 'vitest';
import {
  AdaptiveFrameRateManager,
  DEFAULT_THRESHOLDS,
} from '../AdaptiveFrameRateManager';

describe('AdaptiveFrameRateManager', () => {
  it('starts in cool state', () => {
    const mgr = new AdaptiveFrameRateManager();
    expect(mgr.getThermalState()).toBe('cool');
  });

  it('stays cool when frame times are below warm threshold', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 10; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.warmFrameTimeMs - 1, 0);
    }
    expect(mgr.getThermalState()).toBe('cool');
  });

  it('transitions to warm when average frame time exceeds warm threshold', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.warmFrameTimeMs + 1, 0);
    }
    expect(mgr.getThermalState()).toBe('warm');
  });

  it('transitions to hot when average frame time exceeds hot threshold', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }
    expect(mgr.getThermalState()).toBe('hot');
  });

  it('transitions to critical when average frame time exceeds critical threshold', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.criticalFrameTimeMs + 1, 0);
    }
    expect(mgr.getThermalState()).toBe('critical');
  });

  it('transitions to warm based on dropped frames', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(10, i < 2 ? DEFAULT_THRESHOLDS.warmDroppedFrames : 0);
    }
    expect(mgr.getThermalState()).toBe('warm');
  });

  it('transitions to critical based on dropped frames alone', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(10, DEFAULT_THRESHOLDS.criticalDroppedFrames);
    }
    expect(mgr.getThermalState()).toBe('critical');
  });

  it('does not transition on a single outlier frame', () => {
    const mgr = new AdaptiveFrameRateManager();
    for (let i = 0; i < 5; i++) {
      mgr.recordFrame(10, 0);
    }
    mgr.recordFrame(DEFAULT_THRESHOLDS.criticalFrameTimeMs + 10, 0);
    expect(mgr.getThermalState()).toBe('cool');
  });

  it('notifies listeners on state change', () => {
    const mgr = new AdaptiveFrameRateManager();
    const changes: Array<{ state: string; previous: string }> = [];
    const unsub = mgr.onStateChange((state, previous) => {
      changes.push({ state, previous });
    });

    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }

    expect(changes.length).toBe(1);
    expect(changes[0].previous).toBe('cool');
    expect(changes[0].state).toBe('hot');

    unsub();
  });

  it('does not notify after unsubscribe', () => {
    const mgr = new AdaptiveFrameRateManager();
    let count = 0;
    const unsub = mgr.onStateChange(() => {
      count++;
    });
    unsub();

    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }

    expect(count).toBe(0);
  });

  it('allows custom thresholds', () => {
    const mgr = new AdaptiveFrameRateManager({
      thresholds: { warmFrameTimeMs: 15 },
    });
    for (let i = 0; i < 6; i++) {
      mgr.recordFrame(16, 0);
    }
    expect(mgr.getThermalState()).toBe('warm');
  });

  it('does not notify when state stays the same', () => {
    const mgr = new AdaptiveFrameRateManager();
    let count = 0;
    mgr.onStateChange(() => {
      count++;
    });

    for (let i = 0; i < 12; i++) {
      mgr.recordFrame(DEFAULT_THRESHOLDS.hotFrameTimeMs + 1, 0);
    }

    expect(count).toBe(1);
  });
});
