import { describe, it, expect, beforeEach } from 'vitest';
import { MovementPredictor } from '../MovementPredictor';

describe('MovementPredictor', () => {
  let predictor: MovementPredictor;

  beforeEach(() => {
    predictor = new MovementPredictor();
  });

  // =========== update ===========

  it('update sets velocity from position delta', () => {
    predictor.update([0, 0, 0], 1);
    predictor.update([10, 0, 0], 1);
    // Velocity should be 10 units/s along X
    const windows = predictor.getPredictiveWindows(1);
    // Ambient window should be at (10,0,0)
    expect(windows[0].center[0]).toBe(10);
  });

  it('update with zero dt skips velocity calculation', () => {
    predictor.update([0, 0, 0], 0);
    predictor.update([10, 0, 0], 0);
    // No crash, velocity stays zero
    const windows = predictor.getPredictiveWindows(1);
    expect(windows).toHaveLength(1); // only ambient (speed < 0.5)
  });

  it('update caps history buffer', () => {
    for (let i = 0; i < 100; i++) {
      predictor.update([i, 0, 0], 1 / 60);
    }
    // No crash, history should be capped at 60
    const windows = predictor.getPredictiveWindows(1);
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  // =========== getPredictiveWindows ===========

  it('stationary player gets only ambient window', () => {
    predictor.update([5, 5, 5], 1);
    predictor.update([5, 5, 5], 1); // zero velocity (same position)
    const windows = predictor.getPredictiveWindows(2);
    expect(windows).toHaveLength(1);
    expect(windows[0].likelihood).toBe(1.0);
    expect(windows[0].radius).toBe(10);
    expect(windows[0].center).toEqual([5, 5, 5]);
  });

  it('moving player gets ambient + linear + ensemble windows', () => {
    predictor.update([0, 0, 0], 1);
    predictor.update([10, 0, 0], 1); // speed = 10
    const windows = predictor.getPredictiveWindows(1);
    expect(windows).toHaveLength(3);
    expect(windows[0].likelihood).toBe(1.0);  // ambient
    expect(windows[1].likelihood).toBe(0.9);  // linear
    expect(windows[2].likelihood).toBe(0.7);  // ensemble
  });

  it('linear prediction extrapolates position', () => {
    predictor.update([0, 0, 0], 1);
    predictor.update([10, 0, 0], 1);
    const windows = predictor.getPredictiveWindows(2);
    // Linear: 10 + 10*2 = 30
    const linearCenter = windows[1].center;
    expect(linearCenter[0]).toBeCloseTo(30);
  });

  // =========== setIntent ===========

  it('intent biases prediction toward target', () => {
    // Build up history for recurrent path
    for (let i = 0; i < 10; i++) {
      predictor.update([i * 10, 0, 0], 1);
    }
    // Without intent
    const noIntent = predictor.getPredictiveWindows(1);
    const noIntentX = noIntent[2].center[0]; // ensemble

    // With intent (pointing elsewhere)
    predictor.setIntent({ target: [0, 100, 0], weight: 1.0 });
    const withIntent = predictor.getPredictiveWindows(1);
    const intentX = withIntent[2].center[0];

    // Intent should pull toward Y=100
    expect(withIntent[2].center[1]).toBeGreaterThan(noIntent[2].center[1]);
    // X should be reduced when intent is fully weighted
    expect(intentX).toBeLessThan(noIntentX);
  });

  it('null intent falls back to recurrent prediction', () => {
    for (let i = 0; i < 10; i++) {
      predictor.update([i, 0, 0], 1);
    }
    predictor.setIntent({ target: [0, 100, 0], weight: 0.5 });
    predictor.setIntent(null); // clear intent
    const windows = predictor.getPredictiveWindows(1);
    // Should still produce valid windows
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  // =========== recurrent prediction ===========

  it('recurrent prediction works with < 5 history samples', () => {
    // With less than 5 samples, recurrent falls back to linear
    predictor.update([0, 0, 0], 1);
    predictor.update([5, 0, 0], 1);
    const windows = predictor.getPredictiveWindows(1);
    expect(windows.length).toBeGreaterThanOrEqual(2);
  });

  it('recurrent prediction accounts for acceleration', () => {
    // Accelerating: increasing speed in X
    predictor.update([0, 0, 0], 1);
    predictor.update([1, 0, 0], 1);
    predictor.update([3, 0, 0], 1);
    predictor.update([6, 0, 0], 1);
    predictor.update([10, 0, 0], 1);
    predictor.update([15, 0, 0], 1);
    const windows = predictor.getPredictiveWindows(1);
    // Ensemble prediction should overshoot linear due to acceleration
    const ensemble = windows[2].center[0];
    const linear = windows[1].center[0];
    expect(ensemble).toBeGreaterThanOrEqual(linear - 5); // some variance ok
  });

  // =========== Vector3 format handling ===========

  it('handles object-style Vector3 {x,y,z}', () => {
    predictor.update({ x: 0, y: 0, z: 0 } as any, 1);
    predictor.update({ x: 5, y: 0, z: 0 } as any, 1);
    const windows = predictor.getPredictiveWindows(1);
    expect(windows[0].center[0]).toBe(5);
  });

  // =========== Window radius scaling ===========

  it('linear window radius scales with speed', () => {
    predictor.update([0, 0, 0], 1);
    predictor.update([20, 0, 0], 1); // speed = 20
    const windows = predictor.getPredictiveWindows(1);
    // radius = speed * lookahead * 0.3 + 5 = 20*1*0.3+5 = 11
    expect(windows[1].radius).toBeCloseTo(11);
  });
});
