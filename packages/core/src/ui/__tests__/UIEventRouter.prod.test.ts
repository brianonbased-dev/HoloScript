/**
 * UIEventRouter.prod.test.ts — Sprint CLXX
 *
 * Production tests for the UIEventRouter event dispatch system.
 * API: new UIEventRouter()
 *   .on(widgetId, type, handler) → void
 *   .emit(targetId, type, x?, y?, value?) → UIEvent
 *   .setFocus(widgetId)          → void (emits blur on prior, focus on new)
 *   .setHover(widgetId | null)   → void (emits hoverEnd on prior, hover on new)
 *   .click(widgetId, x?, y?)     → UIEvent (emits pointerDown, pointerUp, click)
 *   .getFocused()                → string | null
 *   .getHovered()                → string | null
 *   .getEventLog()               → UIEvent[]
 *   .clearLog()                  → void
 *
 * UIEventType: 'click' | 'hover' | 'hoverEnd' | 'focus' | 'blur' |
 *              'pointerDown' | 'pointerUp' | 'pointerMove' | 'valueChange'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIEventRouter } from '../UIEventRouter';

let router: UIEventRouter;

beforeEach(() => {
  router = new UIEventRouter();
});

describe('UIEventRouter', () => {
  // -------------------------------------------------------------------------
  // on() / emit()
  // -------------------------------------------------------------------------

  describe('on() / emit()', () => {
    it('registered handler is called on matching event', () => {
      const cb = vi.fn();
      router.on('btn', 'click', cb);
      router.emit('btn', 'click');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('handler is NOT called for different widget', () => {
      const cb = vi.fn();
      router.on('btn', 'click', cb);
      router.emit('other', 'click');
      expect(cb).not.toHaveBeenCalled();
    });

    it('handler is NOT called for different event type', () => {
      const cb = vi.fn();
      router.on('btn', 'click', cb);
      router.emit('btn', 'hover');
      expect(cb).not.toHaveBeenCalled();
    });

    it('emit() returns a UIEvent with correct type and targetId', () => {
      const event = router.emit('btn', 'click');
      expect(event.type).toBe('click');
      expect(event.targetId).toBe('btn');
    });

    it('emit() includes x and y when provided', () => {
      const event = router.emit('btn', 'pointerDown', 10, 20);
      expect(event.x).toBe(10);
      expect(event.y).toBe(20);
    });

    it('emit() includes value when provided', () => {
      const event = router.emit('slider', 'valueChange', undefined, undefined, 0.75);
      expect(event.value).toBe(0.75);
    });

    it('emit() event has timestamp', () => {
      const event = router.emit('btn', 'click');
      expect(typeof event.timestamp).toBe('number');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('multiple handlers on same widget/type all fire', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      router.on('btn', 'click', cb1);
      router.on('btn', 'click', cb2);
      router.emit('btn', 'click');
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('propagationStopped starts as false', () => {
      const event = router.emit('btn', 'click');
      expect(event.propagationStopped).toBe(false);
    });

    it('handler can stop propagation (later handlers not called)', () => {
      const cb2 = vi.fn();
      router.on('btn', 'click', (e) => {
        e.propagationStopped = true;
      });
      router.on('btn', 'click', cb2);
      router.emit('btn', 'click');
      expect(cb2).not.toHaveBeenCalled();
    });

    it('emitting to widget with no handlers does not throw', () => {
      expect(() => router.emit('ghost', 'click')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // setFocus / getFocused
  // -------------------------------------------------------------------------

  describe('setFocus() / getFocused()', () => {
    it('getFocused() returns null initially', () => {
      expect(router.getFocused()).toBeNull();
    });

    it('setFocus() updates focused widget', () => {
      router.setFocus('input1');
      expect(router.getFocused()).toBe('input1');
    });

    it('setFocus() emits a focus event on the new widget', () => {
      const cb = vi.fn();
      router.on('input1', 'focus', cb);
      router.setFocus('input1');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('setFocus() emits blur on previous focused widget', () => {
      const blurCb = vi.fn();
      router.on('input1', 'blur', blurCb);
      router.setFocus('input1');
      router.setFocus('input2');
      expect(blurCb).toHaveBeenCalledTimes(1);
    });

    it('setFocus() same widget twice: no redundant blur', () => {
      const blurCb = vi.fn();
      router.on('input1', 'blur', blurCb);
      router.setFocus('input1');
      router.setFocus('input1'); // same focus
      expect(blurCb).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setHover / getHovered
  // -------------------------------------------------------------------------

  describe('setHover() / getHovered()', () => {
    it('getHovered() returns null initially', () => {
      expect(router.getHovered()).toBeNull();
    });

    it('setHover() updates hovered widget', () => {
      router.setHover('card');
      expect(router.getHovered()).toBe('card');
    });

    it('setHover() emits hover event on new widget', () => {
      const cb = vi.fn();
      router.on('card', 'hover', cb);
      router.setHover('card');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('setHover() emits hoverEnd on previous widget', () => {
      const cb = vi.fn();
      router.on('card1', 'hoverEnd', cb);
      router.setHover('card1');
      router.setHover('card2');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('setHover(null) clears hovered widget', () => {
      router.setHover('card');
      router.setHover(null);
      expect(router.getHovered()).toBeNull();
    });

    it('setHover(null) emits hoverEnd on previously hovered widget', () => {
      const cb = vi.fn();
      router.on('card', 'hoverEnd', cb);
      router.setHover('card');
      router.setHover(null);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // click()
  // -------------------------------------------------------------------------

  describe('click()', () => {
    it('emits pointerDown, pointerUp, click in sequence', () => {
      const events: string[] = [];
      router.on('btn', 'pointerDown', () => events.push('down'));
      router.on('btn', 'pointerUp', () => events.push('up'));
      router.on('btn', 'click', () => events.push('click'));
      router.click('btn');
      expect(events).toEqual(['down', 'up', 'click']);
    });

    it('returns the click UIEvent', () => {
      const event = router.click('btn');
      expect(event.type).toBe('click');
      expect(event.targetId).toBe('btn');
    });

    it('passes x and y to all three emitted events', () => {
      const coords: Array<[number | undefined, number | undefined]> = [];
      router.on('btn', 'pointerDown', (e) => coords.push([e.x, e.y]));
      router.on('btn', 'pointerUp', (e) => coords.push([e.x, e.y]));
      router.on('btn', 'click', (e) => coords.push([e.x, e.y]));
      router.click('btn', 5, 10);
      expect(coords).toEqual([
        [5, 10],
        [5, 10],
        [5, 10],
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Event log
  // -------------------------------------------------------------------------

  describe('getEventLog() / clearLog()', () => {
    it('getEventLog() is empty initially', () => {
      expect(router.getEventLog()).toEqual([]);
    });

    it('each emit() appends to the log', () => {
      router.emit('a', 'click');
      router.emit('b', 'hover');
      expect(router.getEventLog().length).toBe(2);
    });

    it('getEventLog() returns a copy', () => {
      router.emit('a', 'click');
      const log = router.getEventLog();
      log.pop();
      expect(router.getEventLog().length).toBe(1);
    });

    it('clearLog() empties the log', () => {
      router.emit('a', 'click');
      router.clearLog();
      expect(router.getEventLog().length).toBe(0);
    });

    it('click() logs 3 events (pointerDown + pointerUp + click)', () => {
      router.click('btn');
      expect(router.getEventLog().length).toBe(3);
    });

    it('log entries contain correct event types', () => {
      router.emit('a', 'click');
      router.emit('b', 'hover');
      const types = router.getEventLog().map((e) => e.type);
      expect(types).toContain('click');
      expect(types).toContain('hover');
    });
  });
});
