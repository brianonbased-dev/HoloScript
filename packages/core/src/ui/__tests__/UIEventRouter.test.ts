/**
 * UIEventRouter Unit Tests
 *
 * Tests event routing, handler registration, focus/hover state,
 * click simulation, propagation stopping, and event log.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIEventRouter, type UIEvent } from '../UIEventRouter';

describe('UIEventRouter', () => {
  let router: UIEventRouter;

  beforeEach(() => {
    router = new UIEventRouter();
  });

  describe('on / emit', () => {
    it('should call handler when event is emitted', () => {
      const handler = vi.fn();
      router.on('btn1', 'click', handler);
      router.emit('btn1', 'click');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'click',
        targetId: 'btn1',
      }));
    });

    it('should not call handler for different widget', () => {
      const handler = vi.fn();
      router.on('btn1', 'click', handler);
      router.emit('btn2', 'click');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should not call handler for different event type', () => {
      const handler = vi.fn();
      router.on('btn1', 'click', handler);
      router.emit('btn1', 'hover');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers on same widget/type', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      router.on('btn1', 'click', h1);
      router.on('btn1', 'click', h2);
      router.emit('btn1', 'click');
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    it('should pass coordinates and value', () => {
      const handler = vi.fn();
      router.on('slider1', 'valueChange', handler);
      router.emit('slider1', 'valueChange', 10, 20, 0.5);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        x: 10,
        y: 20,
        value: 0.5,
      }));
    });
  });

  describe('propagation stopping', () => {
    it('should stop calling handlers after propagation is stopped', () => {
      const h1 = vi.fn((e: UIEvent) => { e.propagationStopped = true; });
      const h2 = vi.fn();
      router.on('btn1', 'click', h1);
      router.on('btn1', 'click', h2);
      router.emit('btn1', 'click');
      expect(h1).toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });
  });

  describe('setFocus', () => {
    it('should set focused widget', () => {
      router.setFocus('input1');
      expect(router.getFocused()).toBe('input1');
    });

    it('should emit blur on previous focus and focus on new', () => {
      const blurHandler = vi.fn();
      const focusHandler = vi.fn();
      router.on('input1', 'blur', blurHandler);
      router.on('input2', 'focus', focusHandler);

      router.setFocus('input1');
      router.setFocus('input2');

      expect(blurHandler).toHaveBeenCalled();
      expect(focusHandler).toHaveBeenCalled();
    });
  });

  describe('setHover', () => {
    it('should update hovered widget', () => {
      router.setHover('panel1');
      expect(router.getHovered()).toBe('panel1');
    });

    it('should emit hoverEnd on previous and hover on new', () => {
      const hoverEndHandler = vi.fn();
      const hoverHandler = vi.fn();
      router.on('panel1', 'hoverEnd', hoverEndHandler);
      router.on('panel2', 'hover', hoverHandler);

      router.setHover('panel1');
      router.setHover('panel2');

      expect(hoverEndHandler).toHaveBeenCalled();
      expect(hoverHandler).toHaveBeenCalled();
    });

    it('should clear hover when set to null', () => {
      router.setHover('panel1');
      router.setHover(null);
      expect(router.getHovered()).toBeNull();
    });
  });

  describe('click', () => {
    it('should emit pointerDown, pointerUp, then click', () => {
      const events: string[] = [];
      router.on('btn1', 'pointerDown', () => events.push('pointerDown'));
      router.on('btn1', 'pointerUp', () => events.push('pointerUp'));
      router.on('btn1', 'click', () => events.push('click'));

      router.click('btn1', 5, 10);

      expect(events).toEqual(['pointerDown', 'pointerUp', 'click']);
    });

    it('should return the click event', () => {
      const event = router.click('btn1');
      expect(event.type).toBe('click');
      expect(event.targetId).toBe('btn1');
    });
  });

  describe('event log', () => {
    it('should record emitted events', () => {
      router.emit('a', 'click');
      router.emit('b', 'hover');
      const log = router.getEventLog();
      expect(log).toHaveLength(2);
      expect(log[0].targetId).toBe('a');
      expect(log[1].targetId).toBe('b');
    });

    it('should clear event log', () => {
      router.emit('a', 'click');
      router.clearLog();
      expect(router.getEventLog()).toHaveLength(0);
    });

    it('should cap log at max size', () => {
      for (let i = 0; i < 150; i++) {
        router.emit('w', 'click');
      }
      expect(router.getEventLog().length).toBeLessThanOrEqual(100);
    });
  });
});
