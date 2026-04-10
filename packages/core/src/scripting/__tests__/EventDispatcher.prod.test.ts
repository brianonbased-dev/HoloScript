/**
 * EventDispatcher — production test suite
 *
 * Tests: listener registration (on/once/off/offAll), emit, deferred dispatch,
 * priority ordering, propagation stopping, pausing, history, and clear.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventDispatcher } from '../EventDispatcher';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('EventDispatcher: production', () => {
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    dispatcher = new EventDispatcher();
  });

  // ─── on / emit ────────────────────────────────────────────────────────────
  describe('on / emit', () => {
    it('fires a registered listener', () => {
      const spy = vi.fn();
      dispatcher.on('click', spy);
      dispatcher.emit('click');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('passes event data to listener', () => {
      const spy = vi.fn();
      dispatcher.on('move', spy);
      dispatcher.emit('move', { x: 5, y: 10 });
      expect(spy.mock.calls[0][0].data).toEqual({ x: 5, y: 10 });
    });

    it('fires multiple listeners for the same event type', () => {
      const spy1 = vi.fn();
      const spy2 = vi.fn();
      dispatcher.on('click', spy1);
      dispatcher.on('click', spy2);
      dispatcher.emit('click');
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    it('does not fire listener for a different event type', () => {
      const spy = vi.fn();
      dispatcher.on('click', spy);
      dispatcher.emit('hover');
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns a GameEvent with type and timestamp', () => {
      dispatcher.on('fire', vi.fn());
      const event = dispatcher.emit('fire');
      expect(event.type).toBe('fire');
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('retains source in the event', () => {
      const spy = vi.fn();
      dispatcher.on('hit', spy);
      dispatcher.emit('hit', {}, 'weapon-1');
      expect(spy.mock.calls[0][0].source).toBe('weapon-1');
    });
  });

  // ─── Priority ordering ────────────────────────────────────────────────────
  describe('priority ordering', () => {
    it('high priority listener fires before low priority', () => {
      const order: number[] = [];
      dispatcher.on('go', () => order.push(1), 10);
      dispatcher.on('go', () => order.push(2), 1);
      dispatcher.emit('go');
      expect(order).toEqual([1, 2]);
    });

    it('default priority (0) listeners fire in registration order', () => {
      const order: string[] = [];
      dispatcher.on('tick', () => order.push('a'));
      dispatcher.on('tick', () => order.push('b'));
      dispatcher.emit('tick');
      expect(order).toEqual(['a', 'b']);
    });
  });

  // ─── once ─────────────────────────────────────────────────────────────────
  describe('once', () => {
    it('fires the listener exactly once', () => {
      const spy = vi.fn();
      dispatcher.once('trigger', spy);
      dispatcher.emit('trigger');
      dispatcher.emit('trigger');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('removes the once listener after first invocation', () => {
      dispatcher.once('pulse', vi.fn());
      dispatcher.emit('pulse');
      expect(dispatcher.getListenerCount('pulse')).toBe(0);
    });
  });

  // ─── off / offAll ─────────────────────────────────────────────────────────
  describe('off', () => {
    it('removes a listener by id', () => {
      const spy = vi.fn();
      const id = dispatcher.on('click', spy);
      dispatcher.off(id);
      dispatcher.emit('click');
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns true when listener was removed', () => {
      const id = dispatcher.on('x', vi.fn());
      expect(dispatcher.off(id)).toBe(true);
    });

    it('returns false for unknown listener id', () => {
      expect(dispatcher.off('nonexistent')).toBe(false);
    });
  });

  describe('offAll', () => {
    it('removes all listeners for a type', () => {
      dispatcher.on('click', vi.fn());
      dispatcher.on('click', vi.fn());
      dispatcher.offAll('click');
      expect(dispatcher.getListenerCount('click')).toBe(0);
    });

    it('does not affect other event types', () => {
      dispatcher.on('click', vi.fn());
      dispatcher.on('hover', vi.fn());
      dispatcher.offAll('click');
      expect(dispatcher.getListenerCount('hover')).toBe(1);
    });
  });

  // ─── Deferred dispatch ────────────────────────────────────────────────────
  describe('emitDeferred / flushDeferred', () => {
    it('does not fire listener immediately', () => {
      const spy = vi.fn();
      dispatcher.on('deferred', spy);
      dispatcher.emitDeferred('deferred');
      expect(spy).not.toHaveBeenCalled();
    });

    it('fires listener after flushDeferred', () => {
      const spy = vi.fn();
      dispatcher.on('deferred', spy);
      dispatcher.emitDeferred('deferred');
      dispatcher.flushDeferred();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('returns count of flushed events', () => {
      dispatcher.on('d', vi.fn());
      dispatcher.emitDeferred('d');
      dispatcher.emitDeferred('d');
      const count = dispatcher.flushDeferred();
      expect(count).toBe(2);
    });

    it('queues events when paused', () => {
      const spy = vi.fn();
      dispatcher.on('action', spy);
      dispatcher.pause();
      dispatcher.emit('action');
      expect(spy).not.toHaveBeenCalled();
      expect(dispatcher.getQueuedCount()).toBe(1);
    });
  });

  // ─── Pause / Resume ───────────────────────────────────────────────────────
  describe('pause / resume', () => {
    it('isPaused() returns false initially', () => {
      expect(dispatcher.isPaused()).toBe(false);
    });

    it('isPaused() returns true after pause()', () => {
      dispatcher.pause();
      expect(dispatcher.isPaused()).toBe(true);
    });

    it('isPaused() returns false after resume()', () => {
      dispatcher.pause();
      dispatcher.resume();
      expect(dispatcher.isPaused()).toBe(false);
    });
  });

  // ─── Listener count ───────────────────────────────────────────────────────
  describe('getListenerCount', () => {
    it('returns 0 when no listeners', () => {
      expect(dispatcher.getListenerCount()).toBe(0);
    });

    it('returns count for specific type', () => {
      dispatcher.on('click', vi.fn());
      dispatcher.on('click', vi.fn());
      expect(dispatcher.getListenerCount('click')).toBe(2);
    });

    it('returns total across all types', () => {
      dispatcher.on('click', vi.fn());
      dispatcher.on('hover', vi.fn());
      expect(dispatcher.getListenerCount()).toBe(2);
    });
  });

  // ─── History ─────────────────────────────────────────────────────────────
  describe('getEventHistory', () => {
    it('records emitted events', () => {
      dispatcher.emit('tick');
      dispatcher.emit('tick');
      expect(dispatcher.getEventHistory().length).toBe(2);
    });

    it('returns a copy so history is immutable', () => {
      dispatcher.emit('x');
      const h1 = dispatcher.getEventHistory();
      h1.push({ type: 'fake', data: {}, timestamp: 0, propagate: true, handled: false });
      expect(dispatcher.getEventHistory().length).toBe(1);
    });
  });

  // ─── Clear ────────────────────────────────────────────────────────────────
  describe('clear', () => {
    it('removes all listeners and history after clear', () => {
      dispatcher.on('click', vi.fn());
      dispatcher.emit('click');
      dispatcher.clear();
      expect(dispatcher.getListenerCount()).toBe(0);
      expect(dispatcher.getEventHistory().length).toBe(0);
    });
  });
});
