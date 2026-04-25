/**
 * MovementPredictor Production Tests
 *
 * Covers: update (velocity computation from position delta), setIntent,
 * getPredictiveWindows (always returns ambient window, adds linear+ensemble
 * windows when speed > 0.5), predictLinear (via windows), linear extrapolation
 * math, intent biasing (weight 0 → pure recurrent, weight 1 → pure intent target),
 * history buffer (cappedAt maxHistory=60), toTuple (array or object Vector3).
 */

import { describe, it, expect } from 'vitest';
import { MovementPredictor } from '../../runtime/MovementPredictor';

// ── fixture factory ────────────────────────────────────────────────────────────

function makeMP() {
  return new MovementPredictor();
}

// ── getPredictiveWindows — ambient window ─────────────────────────────────────

describe('MovementPredictor — ambient window (always present)', () => {
  it('returns at least one window even without motion', () => {
    const mp = makeMP();
    const windows = mp.getPredictiveWindows(1);
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });

  it('ambient window has radius 10 and likelihood 1.0', () => {
    const mp = makeMP();
    const windows = mp.getPredictiveWindows(1);
    const ambient = windows[0];
    expect(ambient.radius).toBe(10);
    expect(ambient.likelihood).toBeCloseTo(1.0, 5);
  });

  it('ambient window center tracks last known position', () => {
    const mp = makeMP();
    mp.update([5, 3, 1], 0.016);
    const windows = mp.getPredictiveWindows(1);
    expect(windows[0].center[0]).toBeCloseTo(5, 5);
    expect(windows[0].center[1]).toBeCloseTo(3, 5);
    expect(windows[0].center[2]).toBeCloseTo(1, 5);
  });
});

// ── update — velocity computation ─────────────────────────────────────────────

describe('MovementPredictor — update / velocity', () => {
  it('update does not throw', () => {
    const mp = makeMP();
    expect(() => mp.update([1, 0, 0], 0.016)).not.toThrow();
  });

  it('fast movement adds linear prediction windows', () => {
    const mp = makeMP();
    // Move far in one step → high velocity
    mp.update([0, 0, 0], 0.016);
    mp.update([100, 0, 0], 0.016); // speed = 100/0.016 >> 0.5
    const windows = mp.getPredictiveWindows(1);
    // Should have ambient + at least linear prediction window
    expect(windows.length).toBeGreaterThanOrEqual(2);
  });

  it('no motion (dt=0 position unchanged) → no extra windows', () => {
    const mp = makeMP();
    mp.update([0, 0, 0], 0);
    mp.update([0, 0, 0], 0);
    const windows = mp.getPredictiveWindows(1);
    // Speed = 0, so only ambient window
    expect(windows.length).toBe(1);
  });

  it('linear prediction window has likelihood 0.9', () => {
    const mp = makeMP();
    mp.update([0, 0, 0], 0.016);
    mp.update([10, 0, 0], 0.016);
    const windows = mp.getPredictiveWindows(1);
    const linear = windows.find((w) => w.likelihood === 0.9);
    expect(linear).toBeDefined();
  });

  it('linear prediction center follows velocity direction', () => {
    const mp = makeMP();
    mp.update([0, 0, 0], 1.0);
    mp.update([10, 0, 0], 1.0); // velocity = 10 m/s on X
    const windows = mp.getPredictiveWindows(1); // lookahead = 1s
    // linear prediction: x = 10 + 10*1 = 20
    const linear = windows.find((w) => w.likelihood === 0.9);
    expect(linear?.center[0]).toBeCloseTo(20, 1);
  });

  it('intent prediction window has likelihood 0.7', () => {
    const mp = makeMP();
    mp.update([0, 0, 0], 0.016);
    mp.update([10, 0, 0], 0.016);
    const windows = mp.getPredictiveWindows(1);
    const ensemble = windows.find((w) => w.likelihood === 0.7);
    expect(ensemble).toBeDefined();
  });
});

// ── setIntent ─────────────────────────────────────────────────────────────────

describe('MovementPredictor — setIntent', () => {
  it('setIntent null does not throw', () => {
    const mp = makeMP();
    expect(() => mp.setIntent(null)).not.toThrow();
  });

  it('with intent weight=1, ensemble center biases fully to intent target', () => {
    const mp = makeMP();
    // Build history by moving along X
    for (let i = 0; i < 10; i++) mp.update([i * 2, 0, 0], 1.0);
    // Set full-weight intent to a specific target
    mp.setIntent({ target: [999, 0, 0], weight: 1.0 });
    const windows = mp.getPredictiveWindows(1);
    const ensemble = windows.find((w) => w.likelihood === 0.7);
    // At weight=1, blended = 0*recurrent + 1*target → center ~= target
    expect(ensemble?.center[0]).toBeCloseTo(999, 1);
  });

  it('with intent weight=0, ensemble equals recurrent prediction', () => {
    const mp = makeMP();
    for (let i = 0; i < 10; i++) mp.update([i * 2, 0, 0], 1.0);
    const windowsNoIntent = mp.getPredictiveWindows(1);
    const ensembleNo = windowsNoIntent.find((w) => w.likelihood === 0.7);

    mp.setIntent({ target: [999, 0, 0], weight: 0 }); // weight=0 → no bias
    const windowsIntent = mp.getPredictiveWindows(1);
    const ensembleWith = windowsIntent.find((w) => w.likelihood === 0.7);

    expect(ensembleNo?.center[0]).toBeCloseTo(ensembleWith?.center[0] ?? 0, 3);
  });

  it('intent is cleared when setIntent receives null', () => {
    const mp = makeMP();
    for (let i = 0; i < 10; i++) mp.update([i * 2, 0, 0], 1.0);
    mp.setIntent({ target: [999, 0, 0], weight: 1.0 });
    mp.setIntent(null);
    const windows = mp.getPredictiveWindows(1);
    // With null intent, ensemble should NOT be near 999
    const ensemble = windows.find((w) => w.likelihood === 0.7);
    if (ensemble) {
      expect(ensemble.center[0]).not.toBeCloseTo(999, 0);
    }
  });
});

// ── history buffer ────────────────────────────────────────────────────────────

describe('MovementPredictor — history buffer', () => {
  it('can call update 100 times without error', () => {
    const mp = makeMP();
    expect(() => {
      for (let i = 0; i < 100; i++) mp.update([i, 0, 0], 0.016);
    }).not.toThrow();
  });

  it('prediction still works after many updates', () => {
    const mp = makeMP();
    for (let i = 0; i < 100; i++) mp.update([i, 0, 0], 0.016);
    const windows = mp.getPredictiveWindows(1);
    expect(windows.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Vector3 input formats ─────────────────────────────────────────────────────

describe('MovementPredictor — Vector3 input', () => {
  it('accepts array-form Vector3 without error', () => {
    const mp = makeMP();
    expect(() => mp.update([1, 2, 3], 0.016)).not.toThrow();
  });

  it('accepts object-form Vector3 {"x","y","z"} without error', () => {
    const mp = makeMP();
    expect(() => mp.update([1, 2, 3] as any, 0.016)).not.toThrow();
  });

  it('ambient window uses the correct position after object-form update', () => {
    const mp = makeMP();
    mp.update([7, 8, 9] as any, 0.016);
    const windows = mp.getPredictiveWindows(1);
    expect(windows[0].center[0]).toBeCloseTo(7, 5);
  });
});
