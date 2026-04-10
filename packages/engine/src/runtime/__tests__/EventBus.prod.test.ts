/**
 * GlobalEventBus Production Tests
 *
 * NOTE: GlobalEventBus is a singleton â€” each test suite clears its handlers
 * using bus.clear() in beforeEach to avoid cross-test contamination.
 *
 * Covers: getInstance (singleton identity), on (registers handler, returns
 * unsubscribe fn), off (removes handler, cleans up empty event entries),
 * emit (calls all handlers, passes data, no-listener no-throw), getEvents,
 * clear (removes all handlers), async handlers (all awaited via emit).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalEventBus } from '../EventBus';

// Always work with a fresh-state singleton
function getBus() {
  const bus = GlobalEventBus.getInstance();
  bus.clear();
  return bus;
}

// â”€â”€ singleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GlobalEventBus â€” singleton', () => {
  it('getInstance always returns the same object', () => {
    const a = GlobalEventBus.getInstance();
    const b = GlobalEventBus.getInstance();
    expect(a).toBe(b);
  });
});

// â”€â”€ on / off â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GlobalEventBus â€” on / off', () => {
  it('on registers a handler that receives emit data', async () => {
    const bus = getBus();
    const fn = vi.fn();
    bus.on('click', fn);
    await bus.emit('click', 'hello' as any);
    expect(fn).toHaveBeenCalledWith('hello');
  });

  it('on returns an unsubscribe function', async () => {
    const bus = getBus();
    const fn = vi.fn();
    const unsub = bus.on('click', fn);
    unsub();
    await bus.emit('click', 'data' as any);
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple handlers on same event all get called', async () => {
    const bus = getBus();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('move', fn1);
    bus.on('move', fn2);
    await bus.emit('move');
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('off removes a specific handler', async () => {
    const bus = getBus();
    const fn = vi.fn();
    bus.on('attack', fn);
    bus.off('attack', fn);
    await bus.emit('attack');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off cleans up empty event entries', () => {
    const bus = getBus();
    const fn = vi.fn();
    bus.on('jump', fn);
    bus.off('jump', fn);
    expect(bus.getEvents()).not.toContain('jump');
  });

  it('handlers for different events stay independent', async () => {
    const bus = getBus();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('eventA', fn1);
    bus.on('eventB', fn2);
    await bus.emit('eventA');
    expect(fn1).toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });
});

// â”€â”€ emit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GlobalEventBus â€” emit', () => {
  it('emit with no listeners does not throw', async () => {
    const bus = getBus();
    await expect(bus.emit('noListeners')).resolves.not.toThrow();
  });

  it('emit passes data to handler', async () => {
    const bus = getBus();
    const received: any[] = [];
    bus.on('data', (d) => {
      received.push(d);
    });
    await bus.emit('data', { x: 42 } as any);
    expect(received[0]).toEqual({ x: 42 });
  });

  it('emit waits for async handlers to complete', async () => {
    const bus = getBus();
    const log: string[] = [];
    bus.on('tick', async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
      log.push('done');
    });
    await bus.emit('tick');
    expect(log).toContain('done');
  });

  it('throwing handler does not prevent other handlers from running', async () => {
    const bus = getBus();
    const fn2 = vi.fn();
    bus.on('crash', () => {
      throw new Error('boom');
    });
    bus.on('crash', fn2);
    await expect(bus.emit('crash')).resolves.not.toThrow();
    expect(fn2).toHaveBeenCalled();
  });
});

// â”€â”€ getEvents / clear â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GlobalEventBus â€” getEvents / clear', () => {
  it('getEvents returns array of registered event names', () => {
    const bus = getBus();
    bus.on('a', vi.fn());
    bus.on('b', vi.fn());
    const events = bus.getEvents();
    expect(events).toContain('a');
    expect(events).toContain('b');
  });

  it('clear removes all handlers', async () => {
    const bus = getBus();
    const fn = vi.fn();
    bus.on('test', fn);
    bus.clear();
    await bus.emit('test');
    expect(fn).not.toHaveBeenCalled();
    expect(bus.getEvents()).toHaveLength(0);
  });
});
