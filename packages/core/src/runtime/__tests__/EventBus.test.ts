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

import { GlobalEventBus } from '../EventBus';

describe('GlobalEventBus', () => {
  let bus: GlobalEventBus;

  beforeEach(() => {
    bus = GlobalEventBus.getInstance();
    bus.clear();
  });

  // =========== Singleton ===========

  it('getInstance returns the same instance', () => {
    const a = GlobalEventBus.getInstance();
    const b = GlobalEventBus.getInstance();
    expect(a).toBe(b);
  });

  // =========== on / emit ===========

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

  // =========== off ===========

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

  // =========== unsubscribe function ===========

  it('on returns unsubscribe function', async () => {
    const handler = vi.fn();
    const unsub = bus.on('test', handler);
    unsub();
    await bus.emit('test');
    expect(handler).not.toHaveBeenCalled();
  });

  // =========== clear ===========

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

  // =========== getEvents ===========

  it('getEvents returns registered event names', () => {
    bus.on('click', vi.fn());
    bus.on('hover', vi.fn());
    const events = bus.getEvents();
    expect(events).toContain('click');
    expect(events).toContain('hover');
    expect(events).toHaveLength(2);
  });

  // =========== async handlers ===========

  it('handles async handlers', async () => {
    const order: number[] = [];
    bus.on('async', async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push(1);
    });
    bus.on('async', () => { order.push(2); });
    await bus.emit('async');
    expect(order).toContain(1);
    expect(order).toContain(2);
  });

  // =========== error handling in handlers ===========

  it('handler errors do not break other handlers', async () => {
    const good = vi.fn();
    bus.on('test', () => { throw new Error('boom'); });
    bus.on('test', good);
    await bus.emit('test');
    expect(good).toHaveBeenCalled();
  });
});
