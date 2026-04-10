import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkTransport } from '../network/NetworkTransport';

// =============================================================================
// C270 — Network Transport
// =============================================================================

describe('NetworkTransport', () => {
  let transport: NetworkTransport;
  beforeEach(() => {
    transport = new NetworkTransport('host1');
  });

  it('getLocalId returns constructor id', () => {
    expect(transport.getLocalId()).toBe('host1');
  });

  it('connect creates connection', () => {
    expect(transport.connect('peer1')).toBe(true);
    expect(transport.getConnectionCount()).toBe(1);
  });

  it('connect rejects duplicate', () => {
    transport.connect('peer1');
    expect(transport.connect('peer1')).toBe(false);
  });

  it('connect enforces maxConnections', () => {
    const t = new NetworkTransport('h', { maxConnections: 1 });
    t.connect('a');
    expect(t.connect('b')).toBe(false);
  });

  it('disconnect removes connection', () => {
    transport.connect('peer1');
    expect(transport.disconnect('peer1')).toBe(true);
    expect(transport.getConnectionCount()).toBe(0);
  });

  it('send delivers message without latency', () => {
    transport.connect('peer1');
    const result = transport.send('peer1', 'chat', { text: 'hi' });
    expect(result).toBe(true);
    expect(transport.getMessageQueue()).toHaveLength(1);
  });

  it('send rejects oversized message', () => {
    const t = new NetworkTransport('h', { maxMessageSize: 5 });
    t.connect('peer1');
    expect(t.send('peer1', 'data', { big: 'x'.repeat(100) })).toBe(false);
  });

  it('send to disconnected peer returns false', () => {
    expect(transport.send('nobody', 'chat', {})).toBe(false);
  });

  it('broadcast sends to all connected', () => {
    transport.connect('a');
    transport.connect('b');
    const count = transport.broadcast('ping', {});
    expect(count).toBe(2);
  });

  it('onMessage handler receives typed messages', () => {
    const handler = vi.fn();
    transport.onMessage('chat', handler);
    transport.connect('peer1');
    transport.send('peer1', 'chat', { text: 'hello' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('wildcard handler receives all messages', () => {
    const handler = vi.fn();
    transport.onMessage('*', handler);
    transport.connect('peer1');
    transport.send('peer1', 'chat', { text: 'a' });
    transport.send('peer1', 'move', { x: 1 });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('delayed messages delivered after update', () => {
    const t = new NetworkTransport('h', { simulatedLatency: 100 });
    t.connect('peer1');
    t.send('peer1', 'chat', { text: 'delayed' });
    expect(t.getMessageQueue()).toHaveLength(0);
    expect(t.getPendingMessageCount()).toBe(1);
    t.update(0.2); // 200ms > 100ms latency
    expect(t.getMessageQueue()).toHaveLength(1);
  });

  it('tracks bytes sent', () => {
    transport.connect('peer1');
    transport.send('peer1', 'data', { value: 42 });
    expect(transport.getTotalBytesSent()).toBeGreaterThan(0);
  });
});
