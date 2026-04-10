/**
 * SwarmEventBus — Production Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { SwarmEventBus } from '../SwarmEventBus';

function make(cfg = {}) {
  return new SwarmEventBus(cfg);
}

describe('SwarmEventBus — construction', () => {
  it('constructs without args', () => expect(() => make()).not.toThrow());
  it('default maxQueueSize=10000', () => expect(make().getConfig().maxQueueSize).toBe(10000));
  it('default asyncProcessing=true', () => expect(make().getConfig().asyncProcessing).toBe(true));
  it('initial stats all zero', () => {
    const s = make().getStats();
    expect(s.eventsPublished).toBe(0);
    expect(s.eventsDelivered).toBe(0);
  });
});

describe('SwarmEventBus — publish', () => {
  it('returns event id string', () => {
    const bus = make();
    const id = bus.publish('test', 'src', {});
    expect(typeof id).toBe('string');
    expect(id.startsWith('evt-')).toBe(true);
  });
  it('increments eventsPublished', () => {
    const bus = make();
    bus.publish('test', 'src', {});
    expect(bus.getStats().eventsPublished).toBe(1);
  });
  it('drops to dead letter when queue full', () => {
    const bus = make({ maxQueueSize: 1, asyncProcessing: false });
    bus.publish('a', 'src', {}); // fills queue
    bus.publish('b', 'src', {}); // dropped to dead letter
    expect(bus.getDeadLetterQueue()).toHaveLength(1);
    expect(bus.getStats().eventsDropped).toBe(1);
  });
  it('priority ordering: critical before normal', () => {
    const bus = make({ asyncProcessing: false });
    bus.publish('normal', 'src', {}, { priority: 'normal' });
    bus.publish('critical', 'src', {}, { priority: 'critical' });
    const pending = bus.getPendingEvents();
    expect(pending[0].priority).toBe('critical');
  });
});

describe('SwarmEventBus — subscribe / unsubscribe', () => {
  it('subscribe returns subscription id', () => {
    const bus = make();
    const id = bus.subscribe('test', () => {});
    expect(id.startsWith('sub-')).toBe(true);
  });
  it('unsubscribe removes subscription', () => {
    const bus = make();
    const id = bus.subscribe('test', () => {});
    expect(bus.unsubscribe(id)).toBe(true);
    expect(bus.getStats().subscriptions).toBe(0);
  });
  it('unsubscribe unknown returns false', () => {
    expect(make().unsubscribe('ghost')).toBe(false);
  });
  it('clearSubscriptions removes all', () => {
    const bus = make();
    bus.subscribe('a', () => {});
    bus.subscribe('b', () => {});
    bus.clearSubscriptions();
    expect(bus.getStats().subscriptions).toBe(0);
  });
  it('once subscription auto-removed after delivery', async () => {
    const bus = make({ asyncProcessing: false });
    bus.once('test', () => {});
    bus.publish('test', 'src', {});
    await bus.processQueue();
    expect(bus.getStats().subscriptions).toBe(0);
  });
});

describe('SwarmEventBus — emit (synchronous)', () => {
  it('delivers synchronously to matching subscriber', () => {
    let received: unknown[] = [];
    const bus = make();
    bus.subscribe('evt.ping', (e) => {
      received.push(e.payload);
    });
    bus.emit('evt.ping', 'src', { val: 42 });
    expect(received).toHaveLength(1);
    expect((received[0] as any).val).toBe(42);
  });
  it('does not deliver to non-matching subscriber', () => {
    let received: unknown[] = [];
    const bus = make();
    bus.subscribe('other', (e) => {
      received.push(e.payload);
    });
    bus.emit('evt.ping', 'src', {});
    expect(received).toHaveLength(0);
  });
  it('wildcard pattern matches', () => {
    let received: unknown[] = [];
    const bus = make();
    bus.subscribe('swarm.*', (e) => {
      received.push(e.payload);
    });
    bus.emit('swarm.joined', 'src', {});
    bus.emit('swarm.left', 'src', {});
    expect(received).toHaveLength(2);
  });
  it('regex pattern matches', () => {
    let received: unknown[] = [];
    const bus = make();
    bus.subscribe(/^agent\./, (e) => {
      received.push(e.payload);
    });
    bus.emit('agent.spawn', 'src', {});
    bus.emit('agent.destroy', 'src', {});
    bus.emit('other.event', 'src', {});
    expect(received).toHaveLength(2);
  });
  it('exact match only', () => {
    let received: unknown[] = [];
    const bus = make();
    bus.subscribe('exact', (e) => {
      received.push(e.payload);
    });
    bus.emit('exact.extended', 'src', {});
    expect(received).toHaveLength(0);
  });
});

describe('SwarmEventBus — processQueue', () => {
  it('delivers events to subscribers', async () => {
    let received: unknown[] = [];
    const bus = make({ asyncProcessing: false });
    bus.subscribe('greet', (e) => {
      received.push(e.payload);
    });
    bus.publish('greet', 'src', 'hello');
    await bus.processQueue();
    expect(received).toHaveLength(1);
  });
  it('skips expired TTL events', async () => {
    let received: unknown[] = [];
    const bus = make({ asyncProcessing: false, defaultTTL: 1 });
    bus.subscribe('late', (e) => {
      received.push(e.payload);
    });
    bus.publish('late', 'src', {}, { ttl: 1 });
    await new Promise((r) => setTimeout(r, 5)); // let TTL expire
    await bus.processQueue();
    expect(received).toHaveLength(0);
    expect(bus.getStats().eventsDropped).toBeGreaterThan(0);
  });
  it('increments eventsDelivered', async () => {
    const bus = make({ asyncProcessing: false });
    bus.subscribe('x', () => {});
    bus.publish('x', 'src', {});
    await bus.processQueue();
    expect(bus.getStats().eventsDelivered).toBe(1);
  });
  it('unmatched event goes to dead letter', async () => {
    const bus = make({ asyncProcessing: false, enableDeadLetter: true });
    bus.publish('unmatched', 'src', {});
    await bus.processQueue();
    expect(bus.getDeadLetterQueue()).toHaveLength(1);
  });
});

describe('SwarmEventBus — dead letter / replay', () => {
  it('clearDeadLetterQueue returns and empties', async () => {
    const bus = make({ asyncProcessing: false });
    bus.publish('x', 'src', {});
    await bus.processQueue(); // unmatched → DLQ
    const dead = bus.clearDeadLetterQueue();
    expect(dead).toHaveLength(1);
    expect(bus.getDeadLetterQueue()).toHaveLength(0);
  });
  it('replayDeadLetters re-enqueues and delivers', async () => {
    let received: unknown[] = [];
    const bus = make({ asyncProcessing: false });
    bus.publish('retry', 'src', 'payload');
    await bus.processQueue(); // to DLQ
    bus.subscribe('retry', (e) => {
      received.push(e.payload);
    });
    bus.replayDeadLetters();
    await bus.processQueue();
    expect(received).toContain('payload');
  });
});

describe('SwarmEventBus — stats / resetStats / setConfig', () => {
  it('resetStats zeroes published/delivered/dropped', () => {
    const bus = make({ asyncProcessing: false });
    bus.publish('x', 'src', {});
    bus.resetStats();
    expect(bus.getStats().eventsPublished).toBe(0);
    expect(bus.getStats().eventsDelivered).toBe(0);
  });
  it('setConfig partial update', () => {
    const bus = make({ maxQueueSize: 100 });
    bus.setConfig({ maxQueueSize: 500 });
    expect(bus.getConfig().maxQueueSize).toBe(500);
  });
});
