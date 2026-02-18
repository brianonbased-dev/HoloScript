/**
 * UIEventRouter Production Tests
 *
 * Event routing: on/emit, handler invocation, propagation stop, focus/blur,
 * hover/hoverEnd, click simulation, event log.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIEventRouter } from '../UIEventRouter';

describe('UIEventRouter — Production', () => {
  let router: UIEventRouter;

  beforeEach(() => {
    router = new UIEventRouter();
  });

  describe('on / emit', () => {
    it('invokes handler on emit', () => {
      const handler = vi.fn();
      router.on('btn1', 'click', handler);
      router.emit('btn1', 'click');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('passes event with correct type and target', () => {
      const handler = vi.fn();
      router.on('btn1', 'click', handler);
      router.emit('btn1', 'click', 50, 60);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe('click');
      expect(event.targetId).toBe('btn1');
      expect(event.x).toBe(50);
      expect(event.y).toBe(60);
    });

    it('does not fire handler for different event type', () => {
      const handler = vi.fn();
      router.on('btn1', 'click', handler);
      router.emit('btn1', 'hover');
      expect(handler).not.toHaveBeenCalled();
    });

    it('stops propagation when requested', () => {
      const h1 = vi.fn((e: any) => { e.propagationStopped = true; });
      const h2 = vi.fn();
      router.on('btn1', 'click', h1);
      router.on('btn1', 'click', h2);
      router.emit('btn1', 'click');
      expect(h1).toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });
  });

  describe('setFocus', () => {
    it('sets focused widget', () => {
      router.setFocus('input1');
      expect(router.getFocused()).toBe('input1');
    });

    it('blurs previous widget', () => {
      const blurHandler = vi.fn();
      router.on('input1', 'blur', blurHandler);
      router.setFocus('input1');
      router.setFocus('input2');
      expect(blurHandler).toHaveBeenCalled();
      expect(router.getFocused()).toBe('input2');
    });
  });

  describe('setHover', () => {
    it('sets hovered widget', () => {
      router.setHover('card1');
      expect(router.getHovered()).toBe('card1');
    });

    it('emits hoverEnd on previous', () => {
      const hoverEndHandler = vi.fn();
      router.on('card1', 'hoverEnd', hoverEndHandler);
      router.setHover('card1');
      router.setHover('card2');
      expect(hoverEndHandler).toHaveBeenCalled();
    });

    it('handles null hover', () => {
      router.setHover('card1');
      router.setHover(null);
      expect(router.getHovered()).toBeNull();
    });
  });

  describe('click', () => {
    it('emits pointerDown + pointerUp + click', () => {
      const events: string[] = [];
      router.on('btn1', 'pointerDown', () => events.push('pointerDown'));
      router.on('btn1', 'pointerUp', () => events.push('pointerUp'));
      router.on('btn1', 'click', () => events.push('click'));
      router.click('btn1', 10, 20);
      expect(events).toEqual(['pointerDown', 'pointerUp', 'click']);
    });
  });

  describe('event log', () => {
    it('logs events', () => {
      router.emit('btn1', 'click');
      expect(router.getEventLog()).toHaveLength(1);
    });

    it('clearLog empties log', () => {
      router.emit('btn1', 'click');
      router.clearLog();
      expect(router.getEventLog()).toEqual([]);
    });
  });
});
