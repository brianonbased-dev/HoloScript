import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timeline } from '@holoscript/engine/animation/Timeline';
import type { AnimationClip } from '@holoscript/engine/animation/AnimationEngine';

// =============================================================================
// C297 — Timeline
// =============================================================================

function clip(id: string, duration: number, delay = 0): AnimationClip {
  return {
    id,
    property: 'value',
    keyframes: [
      { time: 0, value: 0 },
      { time: 1, value: 1 },
    ],
    duration,
    loop: false,
    pingPong: false,
    delay,
  };
}

describe('Timeline', () => {
  it('computes sequential duration correctly', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(clip('a', 1), () => {});
    tl.add(clip('b', 2), () => {});
    expect(tl.getDuration()).toBe(3);
  });

  it('computes parallel duration correctly', () => {
    const tl = new Timeline({ mode: 'parallel' });
    tl.add(clip('a', 1), () => {}, 0);
    tl.add(clip('b', 2), () => {}, 0.5);
    expect(tl.getDuration()).toBe(2.5);
  });

  it('add returns self for chaining', () => {
    const tl = new Timeline();
    const ret = tl.add(clip('a', 1), () => {});
    expect(ret).toBe(tl);
  });

  it('play/pause/resume control playback', () => {
    const tl = new Timeline();
    tl.add(clip('a', 1), () => {});
    tl.play();
    expect(tl.getElapsed()).toBe(0);
    tl.update(0.5);
    tl.pause();
    const e = tl.getElapsed();
    tl.update(0.5);
    expect(tl.getElapsed()).toBeCloseTo(e); // paused → no change
    tl.resume();
    tl.update(0.1);
    expect(tl.getElapsed()).toBeGreaterThan(e);
  });

  it('stop halts playback', () => {
    const tl = new Timeline();
    tl.add(clip('a', 1), () => {});
    tl.play();
    tl.update(0.5);
    tl.stop();
    const e = tl.getElapsed();
    tl.update(0.5);
    expect(tl.getElapsed()).toBeCloseTo(e);
  });

  it('fires onComplete when timeline finishes', () => {
    const cb = vi.fn();
    const tl = new Timeline({ mode: 'sequential', onComplete: cb });
    tl.add(clip('a', 0.1), () => {});
    tl.play();
    tl.update(0.2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('loops and fires onLoop', () => {
    const onLoop = vi.fn();
    const tl = new Timeline({ mode: 'sequential', loop: true, loopCount: 2, onLoop });
    tl.add(clip('a', 0.1), () => {});
    tl.play();
    tl.update(0.2); // first loop completes
    expect(onLoop).toHaveBeenCalled();
  });

  it('getProgress returns 0 to 1', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(clip('a', 1), () => {});
    tl.play();
    expect(tl.getProgress()).toBe(0);
    tl.update(0.5);
    expect(tl.getProgress()).toBeCloseTo(0.5);
  });

  it('delay postpones playback start', () => {
    const tl = new Timeline({ delay: 0.5 });
    tl.add(clip('a', 1), () => {});
    tl.play();
    tl.update(0.3); // still in delay
    expect(tl.getElapsed()).toBe(0);
    tl.update(0.4); // now playing
    expect(tl.getElapsed()).toBeGreaterThan(0);
  });

  it('empty timeline has zero duration', () => {
    const tl = new Timeline();
    expect(tl.getDuration()).toBe(0);
  });
});
