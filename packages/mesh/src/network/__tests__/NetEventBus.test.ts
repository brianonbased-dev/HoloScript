import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetEventBus } from '../NetEventBus';

describe('NetEventBus', () => {
  let bus: NetEventBus;

  beforeEach(() => {
    bus = new NetEventBus('player1', 16);
  });

  // ---------------------------------------------------------------------------
  // Channel Management
  // ---------------------------------------------------------------------------

  it('creates a channel', () => {
    const ch = bus.createChannel('reliable', 'reliable');
    expect(ch.id).toBe('reliable');
    expect(ch.reliability).toBe('reliable');
    expect(bus.getChannelCount()).toBe(1);
  });

  it('getChannel returns undefined for unknown', () => {
    expect(bus.getChannel('nope')).toBeUndefined();
  });

  it('creates unreliable channel', () => {
    const ch = bus.createChannel('fast', 'unreliable');
    expect(ch.reliability).toBe('unreliable');
  });

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  it('subscribe to channel event returns true', () => {
    bus.createChannel('ch1');
    expect(bus.subscribe('ch1', 'move', vi.fn())).toBe(true);
  });

  it('subscribe returns false for unknown channel', () => {
    expect(bus.subscribe('nope', 'evt', vi.fn())).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  it('send queues message in outbox', () => {
    bus.createChannel('ch1');
    expect(bus.send('ch1', 'attack', { dmg: 10 })).toBe(true);
    expect(bus.getOutboxSize()).toBe(1);
  });

  it('send returns false for unknown channel', () => {
    expect(bus.send('nope', 'evt', {})).toBe(false);
  });

  it('send increments channel message count', () => {
    bus.createChannel('ch1');
    bus.send('ch1', 'a', {});
    bus.send('ch1', 'b', {});
    expect(bus.getChannel('ch1')!.messageCount).toBe(2);
  });

  it('send tracks bytes transferred', () => {
    bus.createChannel('ch1');
    bus.send('ch1', 'data', { big: 'payload' });
    expect(bus.getChannel('ch1')!.bytesTransferred).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Receive
  // ---------------------------------------------------------------------------

  it('receive dispatches to subscribed handlers', () => {
    const handler = vi.fn();
    bus.createChannel('ch1');
    bus.subscribe('ch1', 'chat', handler);
    bus.receive({
      channel: 'ch1',
      event: 'chat',
      payload: { text: 'hello' },
      senderId: 'player2',
      timestamp: Date.now(),
      sequenceId: 0,
    });
    expect(handler).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('receive ignores events with no handlers', () => {
    bus.createChannel('ch1');
    // Should not throw
    bus.receive({
      channel: 'ch1',
      event: 'unknown',
      payload: {},
      senderId: 'player2',
      timestamp: Date.now(),
      sequenceId: 0,
    });
  });

  it('receive tracks inbox size', () => {
    bus.createChannel('ch1');
    bus.receive({
      channel: 'ch1',
      event: 'a',
      payload: {},
      senderId: 'p2',
      timestamp: Date.now(),
      sequenceId: 0,
    });
    expect(bus.getInboxSize()).toBe(1);
  });

  it('multiple handlers for same event all fire', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.createChannel('ch1');
    bus.subscribe('ch1', 'hit', h1);
    bus.subscribe('ch1', 'hit', h2);
    bus.receive({
      channel: 'ch1',
      event: 'hit',
      payload: { dmg: 5 },
      senderId: 'p2',
      timestamp: Date.now(),
      sequenceId: 0,
    });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Flush
  // ---------------------------------------------------------------------------

  it('flush returns queued messages', () => {
    bus.createChannel('ch1');
    bus.send('ch1', 'a', 1);
    bus.send('ch1', 'b', 2);
    const batch = bus.flush();
    expect(batch).toHaveLength(2);
    expect(bus.getOutboxSize()).toBe(0);
  });

  it('flush respects maxBatchSize', () => {
    const smallBus = new NetEventBus('p1', 2);
    smallBus.createChannel('ch');
    smallBus.send('ch', 'a', 1);
    smallBus.send('ch', 'b', 2);
    smallBus.send('ch', 'c', 3);
    const batch = smallBus.flush();
    expect(batch).toHaveLength(2);
    expect(smallBus.getOutboxSize()).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Send-Receive round-trip
  // ---------------------------------------------------------------------------

  it('full send → flush → receive loop', () => {
    const handler = vi.fn();
    bus.createChannel('ch1');
    bus.subscribe('ch1', 'sync', handler);
    bus.send('ch1', 'sync', { pos: { x: 1, y: 2 } });
    const batch = bus.flush();
    // Simulate network delivery
    for (const msg of batch) bus.receive(msg);
    expect(handler).toHaveBeenCalledWith({ pos: { x: 1, y: 2 } });
  });
});
