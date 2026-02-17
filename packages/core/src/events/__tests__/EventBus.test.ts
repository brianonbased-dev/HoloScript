/**
 * EventBus Unit Tests
 *
 * Tests pub/sub event system: on/off, once, priority ordering,
 * wildcard subscriptions, event history, pause/resume.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, getSharedEventBus, setSharedEventBus } from '../EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on / emit', () => {
    it('should call listener when event is emitted', () => {
      const cb = vi.fn();
      bus.on('test', cb);
      bus.emit('test', { value: 42 });
      expect(cb).toHaveBeenCalledWith({ value: 42 });
    });

    it('should support multiple listeners on same event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      bus.on('evt', cb1);
      bus.on('evt', cb2);
      bus.emit('evt', 'data');
      expect(cb1).toHaveBeenCalledWith('data');
      expect(cb2).toHaveBeenCalledWith('data');
    });

    it('should not call listeners for different events', () => {
      const cb = vi.fn();
      bus.on('a', cb);
      bus.emit('b', 'data');
      expect(cb).not.toHaveBeenCalled();
    });

    it('should emit without data', () => {
      const cb = vi.fn();
      bus.on('ping', cb);
      bus.emit('ping');
      expect(cb).toHaveBeenCalledWith(undefined);
    });
  });

  describe('off', () => {
    it('should remove a listener by ID', () => {
      const cb = vi.fn();
      const id = bus.on('test', cb);
      bus.off(id);
      bus.emit('test');
      expect(cb).not.toHaveBeenCalled();
    });

    it('should only remove the targeted listener', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const id1 = bus.on('test', cb1);
      bus.on('test', cb2);
      bus.off(id1);
      bus.emit('test');
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  describe('offAll', () => {
    it('should remove all listeners for an event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      bus.on('test', cb1);
      bus.on('test', cb2);
      bus.offAll('test');
      bus.emit('test');
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('should fire listener only once', () => {
      const cb = vi.fn();
      bus.once('one-shot', cb);
      bus.emit('one-shot', 'first');
      bus.emit('one-shot', 'second');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('first');
    });
  });

  describe('priority ordering', () => {
    it('should call higher priority listeners first', () => {
      const order: string[] = [];
      bus.on('test', () => order.push('low'), 0);
      bus.on('test', () => order.push('high'), 10);
      bus.on('test', () => order.push('mid'), 5);
      bus.emit('test');
      expect(order).toEqual(['high', 'mid', 'low']);
    });
  });

  describe('wildcard listeners', () => {
    it('should receive all events via * subscription', () => {
      const cb = vi.fn();
      bus.on('*', cb);
      bus.emit('alpha', 'a');
      bus.emit('beta', 'b');
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledWith({ event: 'alpha', data: 'a' });
      expect(cb).toHaveBeenCalledWith({ event: 'beta', data: 'b' });
    });
  });

  describe('event history', () => {
    it('should record emitted events', () => {
      bus.emit('a', 1);
      bus.emit('b', 2);
      const history = bus.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].event).toBe('a');
      expect(history[1].event).toBe('b');
    });

    it('should cap history at max size', () => {
      for (let i = 0; i < 150; i++) {
        bus.emit('flood', i);
      }
      expect(bus.getHistory().length).toBeLessThanOrEqual(100);
    });
  });

  describe('setPaused', () => {
    it('should suppress events when paused', () => {
      const cb = vi.fn();
      bus.on('test', cb);
      bus.setPaused(true);
      bus.emit('test');
      expect(cb).not.toHaveBeenCalled();
    });

    it('should resume emitting after unpause', () => {
      const cb = vi.fn();
      bus.on('test', cb);
      bus.setPaused(true);
      bus.emit('test');
      bus.setPaused(false);
      bus.emit('test');
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all listeners and history', () => {
      bus.on('a', vi.fn());
      bus.emit('a');
      bus.clear();
      expect(bus.listenerCount('a')).toBe(0);
      expect(bus.getHistory()).toHaveLength(0);
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      bus.on('x', vi.fn());
      bus.on('x', vi.fn());
      bus.on('y', vi.fn());
      expect(bus.listenerCount('x')).toBe(2);
      expect(bus.listenerCount('y')).toBe(1);
      expect(bus.listenerCount('z')).toBe(0);
    });
  });

  describe('getSharedEventBus / setSharedEventBus', () => {
    it('should return a singleton bus', () => {
      const bus1 = getSharedEventBus();
      const bus2 = getSharedEventBus();
      expect(bus1).toBe(bus2);
    });

    it('should allow replacing the shared bus', () => {
      const custom = new EventBus();
      setSharedEventBus(custom);
      expect(getSharedEventBus()).toBe(custom);
    });
  });
});
