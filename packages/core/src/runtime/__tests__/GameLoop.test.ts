/**
 * GameLoop Tests
 *
 * Tests the GameLoop standalone: construction, start/stop/pause/resume,
 * fixed-timestep callbacks, frame counter advancement, targetFps option,
 * and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '../../runtime/GameLoop';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance real timers to allow setInterval callbacks to fire. */
async function tick(ms = 20): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('GameLoop — construction', () => {
  it('is not running by default', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    expect(gl.isRunning).toBe(false);
    expect(gl.isPaused).toBe(false);
  });

  it('starts with frame = 0', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    expect(gl.frame).toBe(0);
  });

  it('accepts tickIntervalMs option', () => {
    // Should not throw
    const gl = new GameLoop({ onUpdate: vi.fn(), tickIntervalMs: 32 });
    expect(gl.isRunning).toBe(false);
  });

  it('accepts targetFps option', () => {
    const gl = new GameLoop({ onUpdate: vi.fn(), targetFps: 30 });
    expect(gl.isRunning).toBe(false);
  });

  it('targetFps takes precedence over tickIntervalMs', async () => {
    // 30fps = 33ms interval; if tickIntervalMs=5 were used we'd get many more ticks
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, targetFps: 30, tickIntervalMs: 5 });
    gl.start();
    await tick(100);
    gl.stop();
    // With 33ms interval over 100ms, we'd expect ~3 calls at most
    // With 5ms interval we'd get ~20 calls. So checking it's on the low side.
    expect(onUpdate.mock.calls.length).toBeLessThan(10);
  });

  it('defaults to 16ms interval when neither option provided', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate });
    gl.start();
    await tick(100);
    gl.stop();
    // 100ms / 16ms ~ 6 ticks max
    expect(onUpdate.mock.calls.length).toBeLessThanOrEqual(8);
    expect(onUpdate.mock.calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------

describe('GameLoop — start / stop', () => {
  it('start() sets isRunning = true', () => {
    const gl = new GameLoop({ onUpdate: vi.fn(), targetFps: 60 });
    gl.start();
    expect(gl.isRunning).toBe(true);
    gl.stop();
  });

  it('stop() sets isRunning = false', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    gl.start();
    gl.stop();
    expect(gl.isRunning).toBe(false);
  });

  it('calling stop() when not started does not throw', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    expect(() => gl.stop()).not.toThrow();
  });

  it('calling start() twice does not create duplicate loops', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, tickIntervalMs: 5 });
    gl.start();
    gl.start(); // should be a no-op
    expect(gl.isRunning).toBe(true);
    await tick(50);
    gl.stop();
    // If duplicate loops were created, we'd see double the expected calls
    const callCount = onUpdate.mock.calls.length;
    // Roughly 50/5 = 10 calls, definitely not 20
    expect(callCount).toBeLessThan(20);
  });

  it('stop() clears isPaused', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    gl.start();
    gl.pause();
    gl.stop();
    expect(gl.isPaused).toBe(false);
  });

  it('onUpdate is not called after stop()', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, tickIntervalMs: 5 });
    gl.start();
    await tick(20);
    const callsAtStop = onUpdate.mock.calls.length;
    gl.stop();
    await tick(30);
    expect(onUpdate.mock.calls.length).toBe(callsAtStop);
  });

  it('can be restarted after stop', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, tickIntervalMs: 5 });
    gl.start();
    await tick(20);
    gl.stop();
    const callsAfterFirstRun = onUpdate.mock.calls.length;

    gl.start();
    await tick(20);
    gl.stop();
    expect(onUpdate.mock.calls.length).toBeGreaterThan(callsAfterFirstRun);
  });
});

// ---------------------------------------------------------------------------
// pause / resume
// ---------------------------------------------------------------------------

describe('GameLoop — pause / resume', () => {
  it('pause() sets isPaused = true without stopping the loop', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    gl.start();
    gl.pause();
    expect(gl.isRunning).toBe(true);
    expect(gl.isPaused).toBe(true);
    gl.stop();
  });

  it('resume() clears isPaused', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    gl.start();
    gl.pause();
    gl.resume();
    expect(gl.isPaused).toBe(false);
    gl.stop();
  });

  it('pause() can be called when not running (no throw)', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    expect(() => gl.pause()).not.toThrow();
  });

  it('resume() can be called when not paused (no throw)', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    expect(() => gl.resume()).not.toThrow();
  });

  it('frame counter does not advance while paused', async () => {
    const gl = new GameLoop({ onUpdate: vi.fn(), tickIntervalMs: 5 });
    gl.start();
    await tick(30);
    gl.pause();
    const frameAtPause = gl.frame;
    await tick(30);
    expect(gl.frame).toBe(frameAtPause);
    gl.stop();
  });

  it('frame counter resumes advancing after unpause', async () => {
    const gl = new GameLoop({ onUpdate: vi.fn(), tickIntervalMs: 5 });
    gl.start();
    await tick(20);
    gl.pause();
    const frameAtPause = gl.frame;
    await tick(20);
    gl.resume();
    await tick(30);
    gl.stop();
    expect(gl.frame).toBeGreaterThan(frameAtPause);
  });
});

// ---------------------------------------------------------------------------
// onUpdate callback
// ---------------------------------------------------------------------------

describe('GameLoop — onUpdate callback', () => {
  it('calls onUpdate with a positive delta when running', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, tickIntervalMs: 10 });
    gl.start();
    await tick(50);
    gl.stop();
    expect(onUpdate).toHaveBeenCalled();
    // delta should be positive number
    const [delta] = onUpdate.mock.calls[0];
    expect(typeof delta).toBe('number');
    expect(delta).toBeGreaterThan(0);
  });

  it('does NOT call onUpdate when paused', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, tickIntervalMs: 5 });
    gl.start();
    gl.pause();
    const callsBefore = onUpdate.mock.calls.length;
    await tick(30);
    const callsAfter = onUpdate.mock.calls.length;
    gl.stop();
    expect(callsAfter).toBe(callsBefore);
  });

  it('advances frame counter on each update', async () => {
    const gl = new GameLoop({ onUpdate: vi.fn(), tickIntervalMs: 5 });
    gl.start();
    await tick(50);
    gl.stop();
    expect(gl.frame).toBeGreaterThan(0);
  });

  it('delta is roughly equal to interval between ticks', async () => {
    const deltas: number[] = [];
    const gl = new GameLoop({
      onUpdate: (dt) => deltas.push(dt),
      tickIntervalMs: 10,
    });
    gl.start();
    await tick(80);
    gl.stop();
    // Each delta should be roughly 10ms (allow some variance for scheduling)
    for (const d of deltas) {
      expect(d).toBeGreaterThan(0);
      // Allow generous tolerance: between 1ms and 100ms
      expect(d).toBeLessThan(100);
    }
  });

  it('frame count matches the number of onUpdate calls', async () => {
    const onUpdate = vi.fn();
    const gl = new GameLoop({ onUpdate, tickIntervalMs: 5 });
    gl.start();
    await tick(60);
    gl.stop();
    expect(gl.frame).toBe(onUpdate.mock.calls.length);
  });
});
