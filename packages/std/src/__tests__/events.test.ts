import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events.js';

describe('EventBus', () => {
  describe('on / emit', () => {
    it('calls handler on emit', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      bus.on('test', fn);
      bus.emit('test', 42);
      expect(fn).toHaveBeenCalledWith(42);
    });

    it('calls handler multiple times', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      bus.on('x', fn);
      bus.emit('x');
      bus.emit('x');
      bus.emit('x');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('handles multiple listeners on same event', () => {
      const bus = new EventBus();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      bus.on('e', fn1);
      bus.on('e', fn2);
      bus.emit('e', 'data');
      expect(fn1).toHaveBeenCalledWith('data');
      expect(fn2).toHaveBeenCalledWith('data');
    });

    it('does not call unrelated listeners', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      bus.on('a', fn);
      bus.emit('b');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('calls handler only once', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      bus.once('x', fn);
      bus.emit('x', 1);
      bus.emit('x', 2);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);
    });
  });

  describe('off', () => {
    it('removes a listener', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      bus.on('x', fn);
      bus.off('x', fn);
      bus.emit('x');
      expect(fn).not.toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      const unsub = bus.on('x', fn);
      unsub();
      bus.emit('x');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('onAny', () => {
    it('receives all events', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      bus.onAny(fn);
      bus.emit('a', 1);
      bus.emit('b', 2);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith({ event: 'a', data: 1 });
      expect(fn).toHaveBeenCalledWith({ event: 'b', data: 2 });
    });

    it('returns unsubscribe function', () => {
      const bus = new EventBus();
      const fn = vi.fn();
      const unsub = bus.onAny(fn);
      unsub();
      bus.emit('x');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes all listeners', () => {
      const bus = new EventBus();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      bus.on('a', fn1);
      bus.onAny(fn2);
      bus.clear();
      bus.emit('a');
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('counts specific event listeners', () => {
      const bus = new EventBus();
      bus.on('a', () => {});
      bus.on('a', () => {});
      bus.on('b', () => {});
      expect(bus.listenerCount('a')).toBe(2);
      expect(bus.listenerCount('b')).toBe(1);
      expect(bus.listenerCount('c')).toBe(0);
    });

    it('counts all listeners', () => {
      const bus = new EventBus();
      bus.on('a', () => {});
      bus.on('b', () => {});
      bus.onAny(() => {});
      expect(bus.listenerCount()).toBe(3);
    });

    it('empty bus has 0 listeners', () => {
      expect(new EventBus().listenerCount()).toBe(0);
    });
  });
});
