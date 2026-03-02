import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger before importing EventBus
vi.mock('../../logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { GlobalEventBus, eventBus } from '../EventBus';

describe('GlobalEventBus', () => {
  let bus: GlobalEventBus;

  beforeEach(() => {
    bus = GlobalEventBus.getInstance();
    bus.clear();
  });

  // =========== Singleton ===========

  describe('singleton', () => {
    it('getInstance returns the same instance', () => {
      const a = GlobalEventBus.getInstance();
      const b = GlobalEventBus.getInstance();
      expect(a).toBe(b);
    });

    it('eventBus convenience export is the singleton', () => {
      expect(eventBus).toBe(GlobalEventBus.getInstance());
    });
  });

  // =========== on / emit ===========

  describe('on / emit', () => {
    it('on registers a handler that fires on emit', async () => {
      const handler = vi.fn();
      bus.on('test', handler);
      await bus.emit('test', 42);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(42);
    });

    it('multiple handlers fire for same event', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.on('evt', h1);
      bus.on('evt', h2);
      await bus.emit('evt', 'data');
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });

    it('emit with no handlers is a no-op', async () => {
      await expect(bus.emit('unknown')).resolves.toBeUndefined();
    });

    it('emit with undefined data', async () => {
      const handler = vi.fn();
      bus.on('test', handler);
      await bus.emit('test');
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('handlers for different events are independent', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.on('a', h1);
      bus.on('b', h2);
      await bus.emit('a');
      expect(h1).toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    it('passes various data types through emit', async () => {
      const handler = vi.fn();
      bus.on('data', handler);

      await bus.emit('data', 'string');
      expect(handler).toHaveBeenLastCalledWith('string');

      await bus.emit('data', 123);
      expect(handler).toHaveBeenLastCalledWith(123);

      await bus.emit('data', { key: 'value' });
      expect(handler).toHaveBeenLastCalledWith({ key: 'value' });

      await bus.emit('data', [1, 2, 3]);
      expect(handler).toHaveBeenLastCalledWith([1, 2, 3]);

      await bus.emit('data', null);
      expect(handler).toHaveBeenLastCalledWith(null);

      await bus.emit('data', true);
      expect(handler).toHaveBeenLastCalledWith(true);
    });

    it('same handler can be registered only once per event (Set behavior)', async () => {
      const handler = vi.fn();
      bus.on('test', handler);
      bus.on('test', handler); // duplicate add — Set ignores it
      await bus.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('same handler can be registered on different events', async () => {
      const handler = vi.fn();
      bus.on('a', handler);
      bus.on('b', handler);
      await bus.emit('a', 'from-a');
      await bus.emit('b', 'from-b');
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('from-a');
      expect(handler).toHaveBeenCalledWith('from-b');
    });

    it('emit returns a promise that resolves after all handlers complete', async () => {
      const order: number[] = [];
      bus.on('seq', async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
      });
      bus.on('seq', () => {
        order.push(2);
      });

      await bus.emit('seq');
      expect(order).toContain(1);
      expect(order).toContain(2);
    });

    it('emit for event with empty handler set (after all handlers removed) is a no-op', async () => {
      const handler = vi.fn();
      bus.on('evt', handler);
      bus.off('evt', handler);
      // Event key is cleaned up, so this should be a no-op
      await expect(bus.emit('evt')).resolves.toBeUndefined();
    });
  });

  // =========== off ===========

  describe('off', () => {
    it('off removes a handler', async () => {
      const handler = vi.fn();
      bus.on('test', handler);
      bus.off('test', handler);
      await bus.emit('test');
      expect(handler).not.toHaveBeenCalled();
    });

    it('off cleans up event key when last handler removed', () => {
      const handler = vi.fn();
      bus.on('test', handler);
      expect(bus.getEvents()).toContain('test');
      bus.off('test', handler);
      expect(bus.getEvents()).not.toContain('test');
    });

    it('off with unknown event does not throw', () => {
      const handler = vi.fn();
      expect(() => bus.off('nonexistent', handler)).not.toThrow();
    });

    it('off with unknown handler for existing event does not throw', async () => {
      bus.on('test', vi.fn());
      expect(() => bus.off('test', vi.fn())).not.toThrow();
    });

    it('off only removes the specified handler, others remain', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.on('test', h1);
      bus.on('test', h2);
      bus.off('test', h1);
      await bus.emit('test');
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  // =========== unsubscribe function ===========

  describe('unsubscribe function', () => {
    it('on returns unsubscribe function', async () => {
      const handler = vi.fn();
      const unsub = bus.on('test', handler);
      unsub();
      await bus.emit('test');
      expect(handler).not.toHaveBeenCalled();
    });

    it('calling unsubscribe multiple times does not throw', () => {
      const handler = vi.fn();
      const unsub = bus.on('test', handler);
      unsub();
      expect(() => unsub()).not.toThrow();
    });

    it('unsubscribe only removes the target handler', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub1 = bus.on('test', h1);
      bus.on('test', h2);
      unsub1();
      await bus.emit('test');
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  // =========== clear ===========

  describe('clear', () => {
    it('clear removes all handlers', async () => {
      const handler = vi.fn();
      bus.on('a', handler);
      bus.on('b', handler);
      bus.clear();
      await bus.emit('a');
      await bus.emit('b');
      expect(handler).not.toHaveBeenCalled();
      expect(bus.getEvents()).toHaveLength(0);
    });

    it('clear on empty bus does not throw', () => {
      expect(() => bus.clear()).not.toThrow();
    });

    it('new handlers can be added after clear', async () => {
      bus.on('x', vi.fn());
      bus.clear();
      const handler = vi.fn();
      bus.on('y', handler);
      await bus.emit('y', 'data');
      expect(handler).toHaveBeenCalledWith('data');
    });
  });

  // =========== getEvents ===========

  describe('getEvents', () => {
    it('getEvents returns registered event names', () => {
      bus.on('click', vi.fn());
      bus.on('hover', vi.fn());
      const events = bus.getEvents();
      expect(events).toContain('click');
      expect(events).toContain('hover');
      expect(events).toHaveLength(2);
    });

    it('getEvents returns empty array when no events registered', () => {
      expect(bus.getEvents()).toEqual([]);
    });

    it('getEvents does not include events whose handlers were all removed', () => {
      const handler = vi.fn();
      bus.on('temp', handler);
      bus.off('temp', handler);
      expect(bus.getEvents()).not.toContain('temp');
    });
  });

  // =========== async handlers ===========

  describe('async handlers', () => {
    it('handles async handlers', async () => {
      const order: number[] = [];
      bus.on('async', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      });
      bus.on('async', () => {
        order.push(2);
      });
      await bus.emit('async');
      expect(order).toContain(1);
      expect(order).toContain(2);
    });

    it('emit resolves after all async handlers settle', async () => {
      let resolved = false;
      bus.on('wait', async () => {
        await new Promise((r) => setTimeout(r, 30));
        resolved = true;
      });
      await bus.emit('wait');
      expect(resolved).toBe(true);
    });
  });

  // =========== error handling in handlers ===========

  describe('error handling', () => {
    it('handler errors do not break other handlers', async () => {
      const good = vi.fn();
      bus.on('test', () => {
        throw new Error('boom');
      });
      bus.on('test', good);
      await bus.emit('test');
      expect(good).toHaveBeenCalled();
    });

    it('error in first handler still allows second handler to receive data', async () => {
      const received: unknown[] = [];
      bus.on('test', () => {
        throw new Error('fail');
      });
      bus.on('test', (data) => {
        received.push(data);
      });
      await bus.emit('test', 'payload');
      expect(received).toEqual(['payload']);
    });

    it('multiple errors are handled independently', async () => {
      const good = vi.fn();
      bus.on('test', () => {
        throw new Error('error1');
      });
      bus.on('test', () => {
        throw new Error('error2');
      });
      bus.on('test', good);
      await bus.emit('test');
      expect(good).toHaveBeenCalledTimes(1);
    });
  });
});
