/**
 * GossipProtocol Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GossipProtocol, AntiEntropySync } from '../GossipProtocol';

describe('GossipProtocol', () => {
  let protocol: GossipProtocol;

  beforeEach(() => {
    protocol = new GossipProtocol('node-1');
  });

  afterEach(() => {
    protocol.stop();
    vi.restoreAllMocks();
  });

  describe('lifecycle', () => {
    it('should start the protocol', () => {
      protocol.start();
      expect(protocol.isRunning()).toBe(true);
    });

    it('should stop the protocol', () => {
      protocol.start();
      protocol.stop();
      expect(protocol.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      protocol.start();
      protocol.start(); // Should not throw
      expect(protocol.isRunning()).toBe(true);
    });
  });

  describe('peer management', () => {
    it('should add a peer', () => {
      protocol.addPeer('peer-1', 'localhost:3001');

      const peer = protocol.getPeer('peer-1');
      expect(peer).toBeDefined();
      expect(peer?.address).toBe('localhost:3001');
    });

    it('should not add self as peer', () => {
      protocol.addPeer('node-1', 'localhost:3001');

      expect(protocol.getAllPeers().length).toBe(0);
    });

    it('should remove a peer', () => {
      protocol.addPeer('peer-1', 'localhost:3001');

      const removed = protocol.removePeer('peer-1');

      expect(removed).toBe(true);
      expect(protocol.getPeer('peer-1')).toBeUndefined();
    });

    it('should get active peers', () => {
      protocol.addPeer('peer-1', 'addr1');
      protocol.addPeer('peer-2', 'addr2');

      const peer2 = protocol.getPeer('peer-2')!;
      peer2.isActive = false;

      const active = protocol.getActivePeers();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('peer-1');
    });

    it('should store peer metadata', () => {
      protocol.addPeer('peer-1', 'addr1', { region: 'us-west' });

      const peer = protocol.getPeer('peer-1');
      expect(peer?.metadata?.region).toBe('us-west');
    });
  });

  describe('publishing', () => {
    it('should publish a message', () => {
      const msgId = protocol.publish({ data: 'test' });

      expect(msgId).toContain('gossip-');
      expect(msgId).toContain('node-1');
    });

    it('should emit locally on publish', () => {
      const handler = vi.fn();
      protocol.subscribe('data', handler);

      protocol.publish({ data: 'test' });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should publish with custom type', () => {
      const handler = vi.fn();
      protocol.subscribe('custom', handler);

      protocol.publish({ x: 1 }, 'custom');

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].type).toBe('custom');
    });

    it('should track sent messages', () => {
      protocol.publish({ data: 1 });
      protocol.publish({ data: 2 });

      const stats = protocol.getStats();
      expect(stats.messagesSent).toBe(2);
    });
  });

  describe('receiving', () => {
    it('should receive a message', async () => {
      const handler = vi.fn();
      protocol.subscribe('data', handler);
      protocol.addPeer('peer-1', 'addr');

      const received = await protocol.receive(
        {
          id: 'msg-1',
          originId: 'peer-1',
          content: { data: 'incoming' },
          type: 'data',
          version: 1,
          createdAt: Date.now(),
          ttl: 30000,
          hops: 0,
          path: ['peer-1'],
        },
        'peer-1'
      );

      expect(received).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should ignore duplicate messages', async () => {
      const handler = vi.fn();
      protocol.subscribe('data', handler);
      protocol.addPeer('peer-1', 'addr');

      const msg = {
        id: 'msg-dup',
        originId: 'peer-1',
        content: { data: 'x' },
        type: 'data' as const,
        version: 1,
        createdAt: Date.now(),
        ttl: 30000,
        hops: 0,
        path: ['peer-1'],
      };

      await protocol.receive(msg, 'peer-1');
      const secondReceive = await protocol.receive(msg, 'peer-1');

      expect(secondReceive).toBe(false);
      expect(handler).toHaveBeenCalledOnce();

      const stats = protocol.getStats();
      expect(stats.duplicatesIgnored).toBe(1);
    });

    it('should drop expired messages', async () => {
      const handler = vi.fn();
      protocol.subscribe('data', handler);

      const received = await protocol.receive(
        {
          id: 'msg-exp',
          originId: 'peer-1',
          content: {},
          type: 'data',
          version: 1,
          createdAt: Date.now() - 60000,
          ttl: 30000, // Already expired
          hops: 0,
          path: ['peer-1'],
        },
        'peer-1'
      );

      expect(received).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should drop messages over hop limit', async () => {
      const protocol10 = new GossipProtocol('node', { maxHops: 10 });
      const handler = vi.fn();
      protocol10.subscribe('data', handler);

      const received = await protocol10.receive(
        {
          id: 'msg-hops',
          originId: 'origin',
          content: {},
          type: 'data',
          version: 1,
          createdAt: Date.now(),
          ttl: 30000,
          hops: 15, // Over limit
          path: Array(15).fill('node'),
        },
        'peer-1'
      );

      expect(received).toBe(false);
      expect(handler).not.toHaveBeenCalled();
      protocol10.stop();
    });

    it('should update peer last seen', async () => {
      protocol.addPeer('peer-1', 'addr');
      const before = protocol.getPeer('peer-1')!.lastSeen;

      await new Promise((r) => setTimeout(r, 10));

      await protocol.receive(
        {
          id: 'msg-update',
          originId: 'peer-1',
          content: {},
          type: 'data',
          version: 1,
          createdAt: Date.now(),
          ttl: 30000,
          hops: 0,
          path: ['peer-1'],
        },
        'peer-1'
      );

      const after = protocol.getPeer('peer-1')!.lastSeen;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('subscription', () => {
    it('should subscribe to specific type', () => {
      const handler = vi.fn();
      protocol.subscribe('heartbeat', handler);

      protocol.publish({}, 'data');
      protocol.publish({}, 'heartbeat');

      expect(handler).toHaveBeenCalledOnce();
    });

    it('should support wildcard subscription', () => {
      const handler = vi.fn();
      protocol.subscribe('*', handler);

      protocol.publish({}, 'data');
      protocol.publish({}, 'heartbeat');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe', () => {
      const handler = vi.fn();
      const unsub = protocol.subscribe('data', handler);

      unsub();
      protocol.publish({}, 'data');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat and membership', () => {
    it('should publish heartbeat', () => {
      const handler = vi.fn();
      protocol.subscribe('heartbeat', handler);

      const msgId = protocol.publishHeartbeat({ status: 'ok' });

      expect(msgId).toBeDefined();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should publish membership change', () => {
      const handler = vi.fn();
      protocol.subscribe('membership', handler);

      protocol.publishMembership('join', { group: 'swarm-1' });

      expect(handler).toHaveBeenCalledOnce();
      const msg = handler.mock.calls[0][0];
      expect(msg.content.action).toBe('join');
    });
  });

  describe('gossip round', () => {
    it('should perform gossip round', async () => {
      protocol.start(); // Must be running
      protocol.addPeer('peer-1', 'addr1');
      protocol.addPeer('peer-2', 'addr2');

      protocol.publish({ data: 'test' });

      await protocol.gossipRound();

      const stats = protocol.getStats();
      expect(stats.gossipRounds).toBe(1);
    });

    it('should not gossip when stopped', async () => {
      protocol.publish({ data: 'test' });

      await protocol.gossipRound();

      // Gossip round should be skipped
      expect(protocol.isRunning()).toBe(false);
    });
  });

  describe('peer selector', () => {
    it('should use custom peer selector', () => {
      const customSelector = vi.fn().mockImplementation((peers) => [peers[0]]);
      protocol.setPeerSelector(customSelector);

      protocol.addPeer('peer-1', 'addr1');
      protocol.addPeer('peer-2', 'addr2');
      protocol.start();
      protocol.publish({ data: 'x' });

      // Will be called on gossip round
      protocol.gossipRound();

      expect(customSelector).toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    it('should return stats', () => {
      protocol.addPeer('peer-1', 'addr');

      const stats = protocol.getStats();

      expect(stats.peerCount).toBe(1);
      expect(stats.messagesSent).toBe(0);
    });

    it('should reset stats', () => {
      protocol.publish({ data: 'x' });
      protocol.resetStats();

      const stats = protocol.getStats();
      expect(stats.messagesSent).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should return config', () => {
      const config = protocol.getConfig();

      expect(config.fanout).toBeDefined();
      expect(config.maxTTL).toBeDefined();
    });
  });
});

describe('AntiEntropySync', () => {
  let protocol: GossipProtocol;
  let sync: AntiEntropySync;

  beforeEach(() => {
    protocol = new GossipProtocol('node-sync');
    sync = new AntiEntropySync('node-sync', protocol);
  });

  afterEach(() => {
    protocol.stop();
  });

  describe('set and get', () => {
    it('should set and get a value', () => {
      sync.set('key1', { value: 42 });

      const result = sync.get('key1');

      expect(result).toEqual({ value: 42 });
    });

    it('should return undefined for unknown keys', () => {
      expect(sync.get('unknown')).toBeUndefined();
    });

    it('should list all keys', () => {
      sync.set('a', 1);
      sync.set('b', 2);

      const keys = sync.keys();

      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });
  });

  describe('gossip sync', () => {
    it('should publish on set', async () => {
      const handler = vi.fn();
      protocol.subscribe('data', handler);

      sync.set('key1', 'value');

      // Wait for async handlers to complete
      await new Promise((r) => setTimeout(r, 10));

      // GossipProtocol.publish calls emitToHandlers which calls handler(message, from)
      expect(handler).toHaveBeenCalledOnce();
      const msg = handler.mock.calls[0][0];
      expect(msg.content.key).toBe('key1');
      expect(msg.content.value).toBe('value');
    });
  });

  describe('snapshot', () => {
    it('should get snapshot of all data', () => {
      sync.set('x', 1);
      sync.set('y', 2);

      const snapshot = sync.getSnapshot();

      expect(snapshot.get('x')).toBe(1);
      expect(snapshot.get('y')).toBe(2);
    });
  });
});
