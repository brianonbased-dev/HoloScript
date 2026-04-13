import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkTransport } from '@holoscript/core';

describe('NetworkTransport', () => {
  let transport: NetworkTransport;

  beforeEach(() => {
    transport = new NetworkTransport('local');
  });

  // Connection
  it('connect adds peer', () => {
    expect(transport.connect('peer1')).toBe(true);
    expect(transport.getConnectionCount()).toBe(1);
  });

  it('connect duplicate returns false', () => {
    transport.connect('peer1');
    expect(transport.connect('peer1')).toBe(false);
  });

  it('connect respects maxConnections', () => {
    const t = new NetworkTransport('local', { maxConnections: 1 });
    t.connect('a');
    expect(t.connect('b')).toBe(false);
  });

  it('disconnect removes peer', () => {
    transport.connect('peer1');
    expect(transport.disconnect('peer1')).toBe(true);
    expect(transport.getConnectionCount()).toBe(0);
  });

  it('disconnect unknown returns false', () => {
    expect(transport.disconnect('nope')).toBe(false);
  });

  it('getConnectedPeers lists peers', () => {
    transport.connect('a');
    transport.connect('b');
    expect(transport.getConnectedPeers()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  // Messaging
  it('send to connected peer succeeds', () => {
    transport.connect('peer1');
    expect(transport.send('peer1', 'chat', { msg: 'hi' })).toBe(true);
  });

  it('send to disconnected peer fails', () => {
    expect(transport.send('nobody', 'chat', {})).toBe(false);
  });

  it('send respects maxMessageSize', () => {
    const t = new NetworkTransport('local', { maxMessageSize: 5 });
    t.connect('peer1');
    expect(t.send('peer1', 'chat', { data: 'this is way too long for the limit' })).toBe(false);
  });

  it('send without latency delivers immediately to queue', () => {
    transport.connect('peer1');
    transport.send('peer1', 'chat', { msg: 'hi' });
    expect(transport.getMessageQueue().length).toBe(1);
  });

  it('send with latency delays delivery', () => {
    const t = new NetworkTransport('local', { simulatedLatency: 100 });
    t.connect('peer1');
    t.send('peer1', 'chat', { msg: 'delayed' });
    expect(t.getMessageQueue().length).toBe(0);
    expect(t.getPendingMessageCount()).toBe(1);
  });

  // Broadcast
  it('broadcast sends to all peers', () => {
    transport.connect('a');
    transport.connect('b');
    const sent = transport.broadcast('event', { type: 'explosion' });
    expect(sent).toBe(2);
  });

  // Message handlers
  it('onMessage fires for matching type', () => {
    let received = false;
    transport.onMessage('chat', () => {
      received = true;
    });
    transport.connect('peer1');
    transport.send('peer1', 'chat', { msg: 'hi' });
    expect(received).toBe(true);
  });

  it('offMessage removes handler', () => {
    let count = 0;
    transport.onMessage('chat', () => {
      count++;
    });
    transport.connect('peer1');
    transport.send('peer1', 'chat', {});
    transport.offMessage('chat');
    transport.send('peer1', 'chat', {});
    expect(count).toBe(1);
  });

  // Update processes delayed messages
  it('update delivers delayed messages after time', () => {
    const t = new NetworkTransport('local', { simulatedLatency: 50 });
    t.connect('peer1');
    t.send('peer1', 'chat', { msg: 'delayed' });
    t.update(0.1); // 100ms
    expect(t.getMessageQueue().length).toBe(1);
  });

  // Bandwidth tracking
  it('tracks bytes sent and received', () => {
    transport.connect('peer1');
    transport.send('peer1', 'chat', { msg: 'hello' });
    expect(transport.getTotalBytesSent()).toBeGreaterThan(0);
    expect(transport.getTotalBytesReceived()).toBeGreaterThan(0);
  });

  // Utility
  it('clearMessageQueue empties queue', () => {
    transport.connect('peer1');
    transport.send('peer1', 'chat', {});
    transport.clearMessageQueue();
    expect(transport.getMessageQueue().length).toBe(0);
  });

  it('getLocalId returns id', () => {
    expect(transport.getLocalId()).toBe('local');
  });

  it('mode defaults to client', () => {
    expect(transport.getMode()).toBe('client');
  });

  it('setMode changes mode', () => {
    transport.setMode('server');
    expect(transport.getMode()).toBe('server');
  });
});
