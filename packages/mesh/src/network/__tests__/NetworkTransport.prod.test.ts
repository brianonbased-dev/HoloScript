/**
 * NetworkTransport — production test suite
 *
 * Tests: connect/disconnect, send/broadcast, message queue,
 * message handlers (onMessage/offMessage), wildcard handlers,
 * latency simulation via update(), size limits, max connections,
 * and bandwidth tracking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NetworkTransport } from '@holoscript/core';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('NetworkTransport: production', () => {
  let transport: NetworkTransport;

  beforeEach(() => {
    // Zero latency, no packet loss for deterministic tests
    transport = new NetworkTransport('server-1', {
      simulatedLatency: 0,
      simulatedJitter: 0,
      simulatedPacketLoss: 0,
    });
  });

  // ─── connect / disconnect ─────────────────────────────────────────────────
  describe('connect / disconnect', () => {
    it('starts with 0 connections', () => {
      expect(transport.getConnectionCount()).toBe(0);
    });

    it('connects a new peer', () => {
      expect(transport.connect('peer-1')).toBe(true);
      expect(transport.getConnectionCount()).toBe(1);
    });

    it('does not connect the same peer twice', () => {
      transport.connect('peer-1');
      expect(transport.connect('peer-1')).toBe(false);
    });

    it('getConnectedPeers returns peer ids', () => {
      transport.connect('peer-1');
      transport.connect('peer-2');
      expect(transport.getConnectedPeers()).toContain('peer-1');
      expect(transport.getConnectedPeers()).toContain('peer-2');
    });

    it('getConnection returns info for connected peer', () => {
      transport.connect('peer-1');
      const info = transport.getConnection('peer-1');
      expect(info).toBeDefined();
      expect(info!.state).toBe('connected');
    });

    it('getConnection returns undefined for unknown peer', () => {
      expect(transport.getConnection('ghost')).toBeUndefined();
    });

    it('disconnect removes the peer', () => {
      transport.connect('peer-1');
      transport.disconnect('peer-1');
      expect(transport.getConnectionCount()).toBe(0);
    });

    it('disconnect returns false for unknown peer', () => {
      expect(transport.disconnect('ghost')).toBe(false);
    });
  });

  // ─── maxConnections ────────────────────────────────────────────────────────
  describe('maxConnections', () => {
    it('rejects connections when at capacity', () => {
      const t = new NetworkTransport('s', { maxConnections: 2 });
      t.connect('p1');
      t.connect('p2');
      expect(t.connect('p3')).toBe(false);
    });
  });

  // ─── send ─────────────────────────────────────────────────────────────────
  describe('send', () => {
    it('returns false for disconnected peer', () => {
      expect(transport.send('unknown', 'greet', {})).toBe(false);
    });

    it('delivers message to queue immediately (no latency)', () => {
      transport.connect('peer-1');
      transport.send('peer-1', 'greet', { text: 'hello' });
      expect(transport.getMessageQueue().length).toBe(1);
    });

    it('message has correct type and payload', () => {
      transport.connect('peer-1');
      transport.send('peer-1', 'pos', { x: 1, y: 2 });
      const msg = transport.getMessageQueue()[0];
      expect(msg.type).toBe('pos');
      expect(msg.payload).toEqual({ x: 1, y: 2 });
    });

    it('senderId is localId', () => {
      transport.connect('peer-1');
      transport.send('peer-1', 'ping', {});
      expect(transport.getMessageQueue()[0].senderId).toBe('server-1');
    });

    it('rejects message exceeding maxMessageSize', () => {
      const t = new NetworkTransport('s', { maxMessageSize: 5 });
      t.connect('p1');
      const result = t.send('p1', 'big', { data: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
      expect(result).toBe(false);
    });
  });

  // ─── broadcast ────────────────────────────────────────────────────────────
  describe('broadcast', () => {
    it('sends to all connected peers', () => {
      transport.connect('a');
      transport.connect('b');
      transport.connect('c');
      const sent = transport.broadcast('hello', { v: 1 });
      expect(sent).toBe(3);
    });

    it('returns 0 when no peers connected', () => {
      expect(transport.broadcast('hi', {})).toBe(0);
    });
  });

  // ─── message handlers ─────────────────────────────────────────────────────
  describe('onMessage / offMessage', () => {
    it('handler is called on matching message type', () => {
      const fn = vi.fn();
      transport.onMessage('greet', fn);
      transport.connect('peer-1');
      transport.send('peer-1', 'greet', {});
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('handler receives the NetworkMessage', () => {
      let received: any;
      transport.onMessage('data', (msg) => {
        received = msg;
      });
      transport.connect('c1');
      transport.send('c1', 'data', { n: 42 });
      expect(received.payload.n).toBe(42);
    });

    it('wildcard (*) handler receives all messages', () => {
      const fn = vi.fn();
      transport.onMessage('*', fn);
      transport.connect('p1');
      transport.send('p1', 'a', {});
      transport.send('p1', 'b', {});
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('offMessage removes handlers', () => {
      const fn = vi.fn();
      transport.onMessage('ping', fn);
      transport.offMessage('ping');
      transport.connect('p1');
      transport.send('p1', 'ping', {});
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // ─── latency simulation ───────────────────────────────────────────────────
  describe('latency simulation via update()', () => {
    it('message queued with latency is not delivered immediately', () => {
      const t = new NetworkTransport('s', { simulatedLatency: 100, simulatedJitter: 0 });
      t.connect('p1');
      t.send('p1', 'msg', {});
      expect(t.getMessageQueue().length).toBe(0);
      expect(t.getPendingMessageCount()).toBe(1);
    });

    it('message is delivered after enough update() time passes', () => {
      const t = new NetworkTransport('s', { simulatedLatency: 100, simulatedJitter: 0 });
      t.connect('p1');
      t.send('p1', 'msg', {});
      t.update(0.2); // 200ms elapsed
      expect(t.getMessageQueue().length).toBe(1);
    });
  });

  // ─── message queue management ────────────────────────────────────────────
  describe('clearMessageQueue / getMessageQueue', () => {
    it('clearMessageQueue empties the queue', () => {
      transport.connect('p1');
      transport.send('p1', 'x', {});
      transport.clearMessageQueue();
      expect(transport.getMessageQueue().length).toBe(0);
    });
  });

  // ─── bandwidth tracking ───────────────────────────────────────────────────
  describe('bandwidth tracking', () => {
    it('tracks bytes sent', () => {
      transport.connect('p1');
      transport.send('p1', 'msg', { data: 'hello' });
      expect(transport.getTotalBytesSent()).toBeGreaterThan(0);
    });

    it('tracks bytes received', () => {
      transport.connect('p1');
      transport.send('p1', 'msg', { data: 'hello' });
      expect(transport.getTotalBytesReceived()).toBeGreaterThan(0);
    });
  });

  // ─── mode / localId ──────────────────────────────────────────────────────
  describe('getLocalId / getMode / setMode', () => {
    it('getLocalId returns constructor id', () => {
      expect(transport.getLocalId()).toBe('server-1');
    });

    it('default mode is client', () => {
      expect(transport.getMode()).toBe('client');
    });

    it('setMode updates the mode', () => {
      transport.setMode('server');
      expect(transport.getMode()).toBe('server');
    });
  });
});
