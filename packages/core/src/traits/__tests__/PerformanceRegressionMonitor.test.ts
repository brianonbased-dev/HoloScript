import { describe, it, expect, beforeEach } from 'vitest';
import {
  PerformanceRegressionMonitor,
  PERF_REGRESSION_DEFAULTS,
} from '../PerformanceRegressionMonitor';

describe('PerformanceRegressionMonitor', () => {
  let monitor: PerformanceRegressionMonitor;

  beforeEach(() => {
    monitor = new PerformanceRegressionMonitor();
  });

  it('starts in normal state', () => {
    const state = monitor.getState();
    expect(state.isRegressed).toBe(false);
  });

  it('exports PERF_REGRESSION_DEFAULTS with expected fields', () => {
    expect(PERF_REGRESSION_DEFAULTS).toMatchObject({
      thresholdMs: 9.0,
      consecutiveFrames: 5,
      recoveryFrames: 30,
      recoveryThresholdMs: 7.0,
      enabled: true,
    });
  });

  it('accepts custom config', () => {
    const custom = new PerformanceRegressionMonitor({
      thresholdMs: 20,
      consecutiveFrames: 3,
    });
    expect(custom).toBeDefined();
    const state = custom.getState();
    expect(state.isRegressed).toBe(false);
  });

  it('tick updates rolling average', () => {
    monitor.tick(5); // good frame
    const state = monitor.getState();
    expect(state).toBeDefined();
  });

  it('transitions to regressed after consecutive slow frames', () => {
    // Feed frames above threshold (9ms) for consecutiveFrames (5) times
    for (let i = 0; i < 5; i++) {
      monitor.tick(15); // slow
    }
    const state = monitor.getState();
    expect(state.isRegressed).toBe(true);
  });

  it('forceRegress sets mode to regressed', () => {
    monitor.forceRegress();
    expect(monitor.getState().isRegressed).toBe(true);
  });

  it('forceRecover sets mode to normal', () => {
    monitor.forceRegress();
    monitor.forceRecover();
    expect(monitor.getState().isRegressed).toBe(false);
  });

  it('reset clears accumulated frame data', () => {
    for (let i = 0; i < 5; i++) monitor.tick(15);
    monitor.reset();
    expect(monitor.getState().isRegressed).toBe(false);
  });

  it('returns state object from tick()', () => {
    const result = monitor.tick(8);
    expect(result).toBeDefined();
    expect(typeof result.isRegressed).toBe('boolean');
  });

  it('recovers after sufficient fast frames when regressed', () => {
    monitor.forceRegress();
    // Feed recoveryFrames (30) frames at recoveryThresholdMs (7) or below
    for (let i = 0; i < 30; i++) {
      monitor.tick(5); // fast
    }
    const state = monitor.getState();
    expect(state.isRegressed).toBe(false);
  });

  it('disabled monitor never regresses', () => {
    const disabled = new PerformanceRegressionMonitor({ enabled: false });
    for (let i = 0; i < 10; i++) {
      disabled.tick(100); // very slow
    }
    expect(disabled.getState().isRegressed).toBe(false);
  });
});
