import { describe, it, expect, beforeEach } from 'vitest';
import { MovementPredictor } from '@holoscript/engine/runtime/MovementPredictor';

describe('MovementPredictor - Phase 19 (Infinite Streaming)', () => {
  let predictor: MovementPredictor;

  beforeEach(() => {
    predictor = new MovementPredictor();
  });

  it('should calculate velocity correctly', () => {
    // Start at [0,0,0]
    predictor.update([0, 0, 0], 0);

    // Move to [10, 0, 10] in 1 second
    predictor.update([10, 0, 10], 1.0);

    const windows = predictor.getPredictiveWindows(1.0);
    const velocityWindow = windows.find((w) => w.likelihood < 1.0);

    expect(velocityWindow).toBeDefined();
    // Prediction should be at [20, 0, 20] (current [10,0,10] + velocity [10,0,10] * 1s)
    expect(velocityWindow?.center[0]).toBeCloseTo(20);
    expect(velocityWindow?.center[2]).toBeCloseTo(20);
  });

  it('should adapt window radius based on speed', () => {
    // Slow movement
    predictor.update([0, 0, 0], 0);
    predictor.update([1, 0, 0], 1.0);
    const slowWindows = predictor.getPredictiveWindows(1.0);
    const slowRadius = slowWindows.find((w) => w.likelihood < 1.0)?.radius ?? 0;

    // Fast movement
    predictor.update([0, 0, 0], 0);
    predictor.update([10, 0, 0], 1.0);
    const fastWindows = predictor.getPredictiveWindows(1.0);
    const fastRadius = fastWindows.find((w) => w.likelihood < 1.0)?.radius ?? 0;

    expect(fastRadius).toBeGreaterThan(slowRadius);
  });

  it('should ignore very slow movement to prevent prediction jitter', () => {
    predictor.update([0, 0, 0], 0);
    predictor.update([0.1, 0, 0], 1.0); // Speed 0.1 < 0.5 threshold

    const windows = predictor.getPredictiveWindows(1.0);
    // Should only have the ambient window (likelihood 1.0)
    expect(windows).toHaveLength(1);
    expect(windows[0].likelihood).toBe(1.0);
  });

  it('should always provide an ambient window around the player', () => {
    predictor.update([5, 5, 5], 0.1);
    const windows = predictor.getPredictiveWindows(1.0);

    expect(windows[0].center).toEqual([5, 5, 5]);
    expect(windows[0].likelihood).toBe(1.0);
  });
});
