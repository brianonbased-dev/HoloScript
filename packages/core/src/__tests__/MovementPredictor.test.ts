import { describe, it, expect, beforeEach } from 'vitest';
import { MovementPredictor } from '@holoscript/engine/runtime/MovementPredictor';
import { Vector3 } from '../types/HoloScriptPlus';

describe('MovementPredictor', () => {
  let predictor: MovementPredictor;

  beforeEach(() => {
    predictor = new MovementPredictor();
  });

  it('should generate an ambient window around the current position', () => {
    predictor.update([10, 0, 10], 0.1);
    const windows = predictor.getPredictiveWindows(1);

    expect(windows.length).toBeGreaterThanOrEqual(1);
    expect(windows[0].center).toEqual([10, 0, 10]);
    expect(windows[0].radius).toBe(10);
    expect(windows[0].likelihood).toBe(1.0);
  });

  it('should predict a linear path (Tier 1)', () => {
    // Move from 0,0,0 to 1,0,0 in 0.1s (Velocity: 10,0,0)
    predictor.update([0, 0, 0], 0);
    predictor.update([1, 0, 0], 0.1);

    const windows = predictor.getPredictiveWindows(1.0); // Lookahead 1s

    // Window 1: Ambient (1,0,0)
    // Window 2: Linear (1 + 10*1.0, 0, 0) = (11, 0, 0)
    expect(windows.length).toBeGreaterThanOrEqual(2);
    expect(windows[1].center[0]).toBeCloseTo(11);
    expect(windows[1].likelihood).toBe(0.9);
  });

  it('should detect a curved path and apply recurrent biasing (Tier 2)', () => {
    // Simulate a path with acceleration (curvature)
    // p0: (-4,0,0), p1: (-2,0,0), p2: (0,0,0), p3: (1,1,0), p4: (2,3,0)
    predictor.update([-4, 0, 0], 1);
    predictor.update([-2, 0, 0], 1);
    predictor.update([0, 0, 0], 1);
    predictor.update([1, 1, 0], 1);
    predictor.update([2, 3, 0], 1);

    const lookahead = 1.0;
    const windows = predictor.getPredictiveWindows(lookahead);

    expect(windows.length).toBe(3);
    const linearCenter = windows[1].center;
    const curvedCenter = windows[2].center;

    // Linear at t=1 would be (2+1, 3+2) = (3, 5, 0)
    // Curved with Bezier (acc = 0, 1) should be higher in Y
    expect(curvedCenter[1]).toBeGreaterThan(linearCenter[1]);
  });

  it('should bias prediction towards an intent target (Tier 3)', () => {
    // Moving along X axis
    predictor.update([0, 0, 0], 0);
    predictor.update([1, 0, 0], 0.1);

    const target: Vector3 = [5, 0, 10]; // Target is "off to the side"
    predictor.setIntent({ target, weight: 0.5 });

    const windows = predictor.getPredictiveWindows(1.0);
    const intentCenter = windows[2].center;

    // Without intent, linear/curved prediction for 1s would be [11, 0, 0]
    // With 0.5 weight towards [5, 0, 10], it should be biased towards Z=10
    expect(intentCenter[2]).toBeGreaterThan(0);
    expect(intentCenter[0]).toBeLessThan(11);
  });
});
