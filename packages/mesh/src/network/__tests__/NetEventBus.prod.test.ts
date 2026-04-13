/**
 * NetEventBus — Production Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetEventBus, type NetMessage } from '../NetEventBus';

function makeMsg(
  channel: string,
  event: string,
  payload: unknown = {},
  senderId = 'peer-1'
): NetMessage {
  return { channel, event, payload, senderId, timestamp: Date.now(), sequenceId: 0 };
}

describe('NetEventBus — construction', () => {
  it('constructs without arguments', () => {
    expect(() => new NetEventBus()).not.toThrow();
  });
  it('constructs with custom localId and maxBatchSize', () => {
    expect(() => new NetEventBus('server', 64)).not.toThrow();
  });
  it('starts with 0 channels, 0 outbox, 0 inbox', () => {
    const b = new NetEventBus();
    expect(b.getChannelCount()).toBe(0);
    expect(b.getOutboxSize()).toBe(0);
    expect(b.getInboxSize()).toBe(0);
  });
});

describe('NetEventBus — createChannel', () => {
  it('creates and retrieves a channel', () => {
    const b = new NetEventBus();
    const ch = b.createChannel('world');
    expect(ch.id).toBe('world');
    expect(b.getChannelCount()).toBe(1);
  });
  it('defaults reliability to "reliable"', () => {
    const b = new NetEventBus();
    expect(b.createChannel('ch').reliability).toBe('reliable');
  });
  it('respects explicit reliability', () => {
    const b = new NetEventBus();
    expect(b.createChannel('u', 'unreliable').reliability).toBe('unreliable');
    expect(b.createChannel('o', 'ordered').reliability).toBe('ordered');
  });
  it('getChannel returns undefined for unknown id', () => {
    expect(new NetEventBus().getChannel('nope')).toBeUndefined();
  });
  it('new channel has 0 messageCount and 0 bytesTransferred', () => {
    const b = new NetEventBus();
    const ch = b.createChannel('fresh');
    expect(ch.messageCount).toBe(0);
    expect(ch.bytesTransferred).toBe(0);
  });
});

describe('NetEventBus — subscribe', () => {
  it('returns true for known channel', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    expect(b.subscribe('c', 'spawn', () => {})).toBe(true);
  });
  it('returns false for unknown channel', () => {
    const b = new NetEventBus();
    expect(b.subscribe('ghost', 'ev', () => {})).toBe(false);
  });
  it('multiple subscribers per event', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    const calls: number[] = [];
    b.subscribe('c', 'shot', () => calls.push(1));
    b.subscribe('c', 'shot', () => calls.push(2));
    b.receive(makeMsg('c', 'shot'));
    expect(calls).toEqual([1, 2]);
  });
});

describe('NetEventBus — send', () => {
  it('returns false for unknown channel', () => {
    const b = new NetEventBus();
    expect(b.send('ghost', 'ev', {})).toBe(false);
  });
  it('returns true for known channel', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    expect(b.send('c', 'ev', {})).toBe(true);
  });
  it('increments outbox size', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    b.send('c', 'ev', {});
    expect(b.getOutboxSize()).toBe(1);
  });
  it('increments channel.messageCount', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    b.send('c', 'ev', { x: 1 });
    b.send('c', 'ev2', { y: 2 });
    expect(b.getChannel('c')!.messageCount).toBe(2);
  });
  it('increments channel.bytesTransferred by payload size', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    const payload = { value: 123 };
    b.send('c', 'ev', payload);
    expect(b.getChannel('c')!.bytesTransferred).toBe(JSON.stringify(payload).length);
  });
  it('outbox message has auto-incrementing sequenceId', () => {
    const b = new NetEventBus('me');
    b.createChannel('c');
    b.send('c', 'ev1', {});
    b.send('c', 'ev2', {});
    const batch = b.flush();
    expect(batch[0].sequenceId).toBe(0);
    expect(batch[1].sequenceId).toBe(1);
  });
  it('outbox message senderId matches localId', () => {
    const b = new NetEventBus('server-42');
    b.createChannel('c');
    b.send('c', 'ev', {});
    const [msg] = b.flush();
    expect(msg.senderId).toBe('server-42');
  });
});

describe('NetEventBus — receive', () => {
  it('increments inbox size', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    b.receive(makeMsg('c', 'ev'));
    expect(b.getInboxSize()).toBe(1);
  });
  it('dispatches payload to subscriber', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    const received: unknown[] = [];
    b.subscribe('c', 'move', (p) => received.push(p));
    b.receive(makeMsg('c', 'move', { x: 5 }));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ x: 5 });
  });
  it('silently drops message for unknown channel', () => {
    const b = new NetEventBus();
    expect(() => b.receive(makeMsg('ghost', 'ev'))).not.toThrow();
  });
  it('silently drops message for unknown event on known channel', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    expect(() => b.receive(makeMsg('c', 'unknown-event'))).not.toThrow();
  });
  it('isolates handler errors', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    b.subscribe('c', 'ev', () => {
      throw new Error('boom');
    });
    expect(() => b.receive(makeMsg('c', 'ev'))).not.toThrow();
  });
});

describe('NetEventBus — flush', () => {
  it('returns all outbox messages', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    b.send('c', 'e1', {});
    b.send('c', 'e2', {});
    b.send('c', 'e3', {});
    expect(b.flush()).toHaveLength(3);
  });
  it('clears outbox after flush', () => {
    const b = new NetEventBus();
    b.createChannel('c');
    b.send('c', 'ev', {});
    b.flush();
    expect(b.getOutboxSize()).toBe(0);
  });
  it('respects maxBatchSize: first flush returns max, remainder stays', () => {
    const b = new NetEventBus('x', 2);
    b.createChannel('c');
    b.send('c', 'a', {});
    b.send('c', 'b', {});
    b.send('c', 'c', {});
    const first = b.flush();
    expect(first).toHaveLength(2);
    expect(b.getOutboxSize()).toBe(1);
  });
  it('empty flush returns []', () => {
    expect(new NetEventBus().flush()).toEqual([]);
  });
});
