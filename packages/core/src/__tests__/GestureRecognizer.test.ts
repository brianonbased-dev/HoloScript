import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GestureRecognizer } from '../input/GestureRecognizer';

// =============================================================================
// C246 — Gesture Recognizer
// =============================================================================

describe('GestureRecognizer', () => {
  let gr: GestureRecognizer;
  beforeEach(() => {
    gr = new GestureRecognizer();
  });

  it('default config has expected thresholds', () => {
    const c = gr.getConfig();
    expect(c.tapMaxDuration).toBe(300);
    expect(c.swipeMinDistance).toBe(50);
  });

  it('setConfig overrides partial config', () => {
    gr.setConfig({ tapMaxDuration: 500 });
    expect(gr.getConfig().tapMaxDuration).toBe(500);
  });

  it('on subscribes and returns subscription id', () => {
    const id = gr.on('tap', vi.fn());
    expect(typeof id).toBe('string');
  });

  it('off removes subscription', () => {
    const cb = vi.fn();
    const id = gr.on('tap', cb);
    gr.off(id);
    // Quick tap: start + end within maxDuration and maxDistance
    gr.touchStart(0, 100, 100);
    gr.touchEnd(0, 100, 100);
    expect(cb).not.toHaveBeenCalled();
  });

  it('tap fires for quick touch-and-release', () => {
    const cb = vi.fn();
    gr.on('tap', cb);
    gr.touchStart(0, 50, 50);
    gr.touchEnd(0, 51, 51);
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].type).toBe('tap');
  });

  it('swipe fires for long fast drag', () => {
    const cb = vi.fn();
    gr.on('swipe', cb);
    gr.touchStart(0, 0, 0);
    gr.touchMove(0, 200, 0);
    gr.touchEnd(0, 200, 0);
    expect(cb).toHaveBeenCalled();
    const evt = cb.mock.calls[0][0];
    expect(evt.type).toBe('swipe');
    expect(evt.direction).toBe('right');
  });

  it('getActiveTouchCount tracks active touches', () => {
    expect(gr.getActiveTouchCount()).toBe(0);
    gr.touchStart(0, 10, 10);
    expect(gr.getActiveTouchCount()).toBe(1);
    gr.touchEnd(0, 10, 10);
    expect(gr.getActiveTouchCount()).toBe(0);
  });

  it('gesture history records events', () => {
    gr.on('tap', vi.fn()); // need listener for emit
    gr.touchStart(0, 0, 0);
    gr.touchEnd(0, 0, 0);
    expect(gr.getGestureHistory().length).toBeGreaterThanOrEqual(1);
  });

  it('getRecentGestures limits results', () => {
    gr.on('tap', vi.fn());
    for (let i = 0; i < 5; i++) {
      gr.touchStart(0, 0, 0);
      gr.touchEnd(0, 0, 0);
    }
    expect(gr.getRecentGestures(2)).toHaveLength(2);
  });

  it('clearHistory empties history', () => {
    gr.on('tap', vi.fn());
    gr.touchStart(0, 0, 0);
    gr.touchEnd(0, 0, 0);
    gr.clearHistory();
    expect(gr.getGestureHistory()).toHaveLength(0);
  });

  it('on with array subscribes to multiple types', () => {
    const cb = vi.fn();
    gr.on(['tap', 'swipe'], cb);
    gr.touchStart(0, 0, 0);
    gr.touchEnd(0, 0, 0);
    expect(cb).toHaveBeenCalled();
  });

  it('swipe up detects correctly', () => {
    const cb = vi.fn();
    gr.on('swipe', cb);
    gr.touchStart(0, 100, 200);
    gr.touchMove(0, 100, 0);
    gr.touchEnd(0, 100, 0);
    expect(cb).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].direction).toBe('up');
  });
});
