/**
 * Sprint 6 — GameLoop Tests
 *
 * Tests the GameLoop standalone: start/stop/pause, fixed-timestep callbacks,
 * frame counter advancement, and clean shutdown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '../../runtime/GameLoop';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance real timers a bit to allow rAF-like scheduling in Node (fake timers). */
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
});

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------

describe('GameLoop — start / stop', () => {
  it('start() sets isRunning = true', async () => {
    const gl = new GameLoop({ onUpdate: vi.fn(), targetFps: 60 });
    gl.start();
    expect(gl.isRunning).toBe(true);
    gl.stop();
  });

  it('stop() sets isRunning = false', async () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    gl.start();
    gl.stop();
    expect(gl.isRunning).toBe(false);
  });

  it('calling stop() when not started does not throw', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    expect(() => gl.stop()).not.toThrow();
  });

  it('calling start() twice does not create duplicate loops', () => {
    const gl = new GameLoop({ onUpdate: vi.fn() });
    gl.start();
    gl.start(); // should be a no-op
    expect(gl.isRunning).toBe(true);
    gl.stop();
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
});
