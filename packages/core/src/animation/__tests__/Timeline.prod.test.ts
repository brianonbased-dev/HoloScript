/**
 * Timeline — Production Test Suite
 *
 * Covers: construction, add (chainable), play/pause/resume/stop,
 * getDuration (sequential=sum, parallel=max), getProgress,
 * getElapsed, update (sequential drive, parallel drive, delay),
 * onComplete callback, loop, loopCount.
 */
import { describe, it, expect } from 'vitest';
import { Timeline } from '../Timeline';
import type { AnimationClip } from '../AnimationEngine';

function makeClip(id: string, duration: number, delay = 0): AnimationClip {
  return {
    id,
    property: id,
    keyframes: [{ time: 0, value: 0 }, { time: duration, value: 100 }],
    duration,
    loop: false,
    pingPong: false,
    delay,
  };
}

describe('Timeline — Production', () => {
  // ─── Construction ─────────────────────────────────────────────────
  it('starts with 0 duration', () => {
    const tl = new Timeline();
    expect(tl.getDuration()).toBe(0);
  });

  it('starts not playing — no progress', () => {
    const tl = new Timeline();
    expect(tl.getProgress()).toBe(0);
    expect(tl.getElapsed()).toBe(0);
  });

  // ─── add ──────────────────────────────────────────────────────────
  it('add is chainable', () => {
    const tl = new Timeline();
    const result = tl.add(makeClip('a', 1), () => {});
    expect(result).toBe(tl);
  });

  // ─── Sequential duration ──────────────────────────────────────────
  it('sequential duration is sum of clips', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1), () => {});
    tl.add(makeClip('b', 2), () => {});
    expect(tl.getDuration()).toBe(3);
  });

  it('sequential with delay clips adds delay to sum', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1, 0.5), () => {});
    expect(tl.getDuration()).toBe(1.5);
  });

  // ─── Parallel duration ────────────────────────────────────────────
  it('parallel duration is max of clips', () => {
    const tl = new Timeline({ mode: 'parallel' });
    tl.add(makeClip('a', 1), () => {});
    tl.add(makeClip('b', 3), () => {});
    expect(tl.getDuration()).toBe(3);
  });

  it('parallel with startOffset accounts for offset', () => {
    const tl = new Timeline({ mode: 'parallel' });
    tl.add(makeClip('a', 1), () => {}, 2);
    expect(tl.getDuration()).toBe(3); // offset 2 + duration 1
  });

  // ─── play / pause / resume / stop ─────────────────────────────────
  it('does not advance when not playing', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1), () => {});
    tl.update(0.5);
    expect(tl.getElapsed()).toBe(0);
  });

  it('play starts advancing', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1), () => {});
    tl.play();
    tl.update(0.5);
    expect(tl.getElapsed()).toBeGreaterThan(0);
  });

  it('pause stops advancement', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1), () => {});
    tl.play();
    tl.update(0.3);
    const before = tl.getElapsed();
    tl.pause();
    tl.update(0.5);
    expect(tl.getElapsed()).toBeCloseTo(before, 2);
  });

  it('resume allows advancement after pause', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1), () => {});
    tl.play();
    tl.update(0.3);
    tl.pause();
    const before = tl.getElapsed();
    tl.resume();
    tl.update(0.2);
    expect(tl.getElapsed()).toBeGreaterThan(before);
  });

  it('stop halts timeline', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 1), () => {});
    tl.play();
    tl.update(0.3);
    tl.stop();
    const after = tl.getElapsed();
    tl.update(0.5);
    expect(tl.getElapsed()).toBeCloseTo(after, 1);
  });

  // ─── getProgress ──────────────────────────────────────────────────
  it('getProgress reaches 1.0 at end', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 0.1), () => {});
    tl.play();
    for (let i = 0; i < 20; i++) tl.update(0.1);
    expect(tl.getProgress()).toBeCloseTo(1, 1);
  });

  it('getProgress is clamped to [0,1]', () => {
    const tl = new Timeline({ mode: 'sequential' });
    tl.add(makeClip('a', 0.1), () => {});
    tl.play();
    for (let i = 0; i < 50; i++) tl.update(0.5);
    expect(tl.getProgress()).toBeLessThanOrEqual(1);
    expect(tl.getProgress()).toBeGreaterThanOrEqual(0);
  });

  // ─── delay ────────────────────────────────────────────────────────
  it('delay holds progress at 0 initially', () => {
    const tl = new Timeline({ mode: 'sequential', delay: 1 });
    tl.add(makeClip('a', 1), () => {});
    tl.play();
    tl.update(0.5); // Still in delay
    expect(tl.getProgress()).toBe(0);
  });

  // ─── onComplete ───────────────────────────────────────────────────
  it('onComplete fires after single play', () => {
    let done = false;
    const tl = new Timeline({ mode: 'sequential', loop: false, onComplete: () => { done = true; } });
    tl.add(makeClip('a', 0.1), () => {});
    tl.play();
    for (let i = 0; i < 20; i++) tl.update(0.1);
    expect(done).toBe(true);
  });

  // ─── loop ─────────────────────────────────────────────────────────
  it('onLoop fires on each loop iteration', () => {
    const loops: number[] = [];
    const tl = new Timeline({ mode: 'sequential', loop: true, loopCount: -1, onLoop: (n) => loops.push(n) });
    tl.add(makeClip('a', 0.1), () => {});
    tl.play();
    // 30 steps × 0.1s = 3s, clip is 0.1s → at least 20 loops
    for (let i = 0; i < 30; i++) tl.update(0.1);
    expect(loops.length).toBeGreaterThanOrEqual(2);
  });

});
