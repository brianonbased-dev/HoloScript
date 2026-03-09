import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GestureRecognizer } from '../GestureRecognizer';
import type { GestureEvent } from '../GestureRecognizer';

describe('GestureRecognizer', () => {
  let gr: GestureRecognizer;
  let events: GestureEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    gr = new GestureRecognizer();
    events = [];
    gr.on(['tap', 'doubleTap', 'swipe', 'pinch', 'longPress'], (e) => events.push(e));
  });

  // ---------------------------------------------------------------------------
  // Tap
  // ---------------------------------------------------------------------------

  it('detects tap gesture', () => {
    gr.touchStart(0, 50, 50);
    vi.advanceTimersByTime(100);
    gr.touchEnd(0, 52, 52);
    const taps = events.filter((e) => e.type === 'tap');
    expect(taps.length).toBeGreaterThanOrEqual(1);
  });

  it('tap records history', () => {
    gr.touchStart(0, 10, 10);
    vi.advanceTimersByTime(50);
    gr.touchEnd(0, 10, 10);
    expect(gr.getGestureHistory().length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Swipe
  // ---------------------------------------------------------------------------

  it('detects swipe right', () => {
    gr.touchStart(0, 0, 100);
    vi.advanceTimersByTime(50);
    gr.touchMove(0, 100, 100);
    vi.advanceTimersByTime(50);
    gr.touchEnd(0, 200, 100);
    const swipes = events.filter((e) => e.type === 'swipe');
    expect(swipes.length).toBeGreaterThanOrEqual(1);
    if (swipes.length > 0) {
      expect(swipes[0].direction).toBe('right');
    }
  });

  it('detects swipe up', () => {
    gr.touchStart(0, 100, 200);
    vi.advanceTimersByTime(50);
    gr.touchMove(0, 100, 50);
    vi.advanceTimersByTime(50);
    gr.touchEnd(0, 100, 0);
    const swipes = events.filter((e) => e.type === 'swipe');
    expect(swipes.length).toBeGreaterThanOrEqual(1);
    if (swipes.length > 0) {
      expect(swipes[0].direction).toBe('up');
    }
  });

  // ---------------------------------------------------------------------------
  // Long Press
  // ---------------------------------------------------------------------------

  it('detects long press', () => {
    gr.touchStart(0, 50, 50);
    vi.advanceTimersByTime(600); // > 500ms default
    const presses = events.filter((e) => e.type === 'longPress');
    expect(presses.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Pinch
  // ---------------------------------------------------------------------------

  it('active touch count tracks fingers', () => {
    gr.touchStart(0, 50, 50);
    gr.touchStart(1, 100, 100);
    expect(gr.getActiveTouchCount()).toBe(2);
  });

  it('detects pinch gesture', () => {
    gr.touchStart(0, 100, 100);
    gr.touchStart(1, 200, 100);
    vi.advanceTimersByTime(10);
    // Spread apart
    gr.touchMove(0, 50, 100);
    gr.touchMove(1, 250, 100);
    const pinches = events.filter((e) => e.type === 'pinch');
    expect(pinches.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // ---------------------------------------------------------------------------

  it('on returns subscription id', () => {
    const id = gr.on('tap', () => {});
    expect(typeof id).toBe('string');
  });

  it('off removes subscription', () => {
    const collected: GestureEvent[] = [];
    const id = gr.on('tap', (e) => collected.push(e));
    gr.off(id);
    gr.touchStart(0, 10, 10);
    vi.advanceTimersByTime(50);
    gr.touchEnd(0, 10, 10);
    expect(collected).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  it('getConfig returns defaults', () => {
    const cfg = gr.getConfig();
    expect(cfg.tapMaxDuration).toBe(300);
    expect(cfg.longPressMinDuration).toBe(500);
  });

  it('setConfig updates config', () => {
    gr.setConfig({ tapMaxDuration: 200 });
    expect(gr.getConfig().tapMaxDuration).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  it('getRecentGestures limits count', () => {
    for (let i = 0; i < 5; i++) {
      gr.touchStart(0, 10, 10);
      vi.advanceTimersByTime(50);
      gr.touchEnd(0, 10, 10);
      vi.advanceTimersByTime(500); // avoid double-tap window
    }
    const recent = gr.getRecentGestures(2);
    expect(recent.length).toBeLessThanOrEqual(2);
  });

  it('clearHistory empties gesture log', () => {
    gr.touchStart(0, 10, 10);
    vi.advanceTimersByTime(50);
    gr.touchEnd(0, 10, 10);
    gr.clearHistory();
    expect(gr.getGestureHistory()).toHaveLength(0);
  });
});
