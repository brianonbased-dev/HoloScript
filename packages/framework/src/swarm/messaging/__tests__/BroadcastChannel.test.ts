/**
 * BroadcastChannel Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BroadcastChannel, ChannelManager } from '../BroadcastChannel';

describe('BroadcastChannel', () => {
  let channel: BroadcastChannel;

  beforeEach(() => {
    channel = new BroadcastChannel('ch-1', 'test-channel');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('subscription', () => {
    it('should subscribe an agent', () => {
      const handler = vi.fn();
      const subId = channel.subscribe('agent-1', handler);

      expect(subId).toBeDefined();
      expect(channel.isSubscribed('agent-1')).toBe(true);
    });

    it('should unsubscribe an agent', () => {
      const handler = vi.fn();
      const subId = channel.subscribe('agent-1', handler);

      const removed = channel.unsubscribe(subId);

      expect(removed).toBe(true);
      expect(channel.getSubscriberCount()).toBe(0);
    });

    it('should support role-based subscription', () => {
      const handler = vi.fn();
      channel.subscribe('agent-1', handler, { role: 'publisher' });
      channel.subscribe('agent-2', handler, { role: 'subscriber' });

      const subs = channel.getSubscribers();
      expect(subs.find((s) => s.agentId === 'agent-1')?.role).toBe('publisher');
      expect(subs.find((s) => s.agentId === 'agent-2')?.role).toBe('subscriber');
    });

    it('should enforce maxSubscribers', () => {
      const smallChannel = new BroadcastChannel('ch-1', 'small', { maxSubscribers: 2 });

      smallChannel.subscribe('a1', vi.fn());
      smallChannel.subscribe('a2', vi.fn());

      expect(() => smallChannel.subscribe('a3', vi.fn())).toThrow(/maximum subscribers/);
    });
  });

  describe('broadcast', () => {
    it('should deliver to all subscribers', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      channel.subscribe('agent-1', handler1);
      channel.subscribe('agent-2', handler2);

      await channel.broadcast('sender', { data: 'test' });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should not deliver to publisher-only subscribers', async () => {
      const pubHandler = vi.fn();
      const subHandler = vi.fn();

      channel.subscribe('publisher', pubHandler, { role: 'publisher' });
      channel.subscribe('subscriber', subHandler, { role: 'subscriber' });

      await channel.broadcast('sender', { data: 'test' });

      expect(pubHandler).not.toHaveBeenCalled();
      expect(subHandler).toHaveBeenCalledOnce();
    });

    it('should return message ID', async () => {
      channel.subscribe('a1', vi.fn());
      const msgId = await channel.broadcast('sender', { data: 'test' });

      expect(msgId).toContain('msg-');
    });

    it('should include metadata', async () => {
      const handler = vi.fn();
      channel.subscribe('agent-1', handler);

      await channel.broadcast('sender', { data: 'x' }, { metadata: { priority: 'high' } });

      expect(handler.mock.calls[0][0].metadata).toEqual({ priority: 'high' });
    });
  });

  describe('direct messages', () => {
    it('should send to specific agent', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      channel.subscribe('agent-1', handler1);
      channel.subscribe('agent-2', handler2);

      await channel.sendDirect('sender', 'agent-2', { data: 'private' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should return null if target not found', async () => {
      channel.subscribe('agent-1', vi.fn());

      const result = await channel.sendDirect('sender', 'unknown', { data: 'x' });

      expect(result).toBeNull();
    });
  });

  describe('acknowledgments', () => {
    it('should track pending acks', async () => {
      const ackChannel = new BroadcastChannel('ack-ch', 'ack-test', { requireAck: true });

      ackChannel.subscribe('agent-1', vi.fn());
      ackChannel.subscribe('agent-2', vi.fn());

      const msgId = await ackChannel.broadcast('sender', { data: 'x' });

      const pending = ackChannel.getPendingAcks(msgId);
      expect(pending).toContain('agent-1');
      expect(pending).toContain('agent-2');
    });

    it('should remove ack when acknowledged', async () => {
      const ackChannel = new BroadcastChannel('ack-ch', 'ack-test', { requireAck: true });

      ackChannel.subscribe('agent-1', vi.fn());

      const msgId = await ackChannel.broadcast('sender', { data: 'x' });
      ackChannel.acknowledge(msgId, 'agent-1');

      expect(ackChannel.isFullyAcknowledged(msgId)).toBe(true);
    });
  });

  describe('history', () => {
    it('should maintain message history', async () => {
      channel.subscribe('a1', vi.fn());

      await channel.broadcast('s', { msg: 1 });
      await channel.broadcast('s', { msg: 2 });

      const history = channel.getHistory();
      expect(history.length).toBe(2);
    });

    it('should limit history size', async () => {
      const smallHistory = new BroadcastChannel('ch', 'small', { historySize: 2 });
      smallHistory.subscribe('a1', vi.fn());

      await smallHistory.broadcast('s', { msg: 1 });
      await smallHistory.broadcast('s', { msg: 2 });
      await smallHistory.broadcast('s', { msg: 3 });

      const history = smallHistory.getHistory();
      expect(history.length).toBe(2);
    });

    it('should filter history by senderId', async () => {
      channel.subscribe('a1', vi.fn());

      await channel.broadcast('s1', { data: 1 });
      await channel.broadcast('s2', { data: 2 });

      const history = channel.getHistory({ senderId: 's1' });
      expect(history.length).toBe(1);
      expect(history[0].senderId).toBe('s1');
    });

    it('should replay history to subscriber', async () => {
      const handler1 = vi.fn();
      channel.subscribe('a1', handler1);

      await channel.broadcast('s', { msg: 1 });
      await channel.broadcast('s', { msg: 2 });

      const newHandler = vi.fn();
      const newSubId = channel.subscribe('a2', newHandler);

      const replayed = await channel.replayHistory(newSubId);

      expect(replayed).toBe(2);
      expect(newHandler).toHaveBeenCalledTimes(2);
    });

    it('should not replay when replay disabled', async () => {
      const noReplay = new BroadcastChannel('ch', 'no-replay', { allowReplay: false });
      noReplay.subscribe('a1', vi.fn());
      await noReplay.broadcast('s', { msg: 1 });

      const handler = vi.fn();
      const subId = noReplay.subscribe('a2', handler);

      const replayed = await noReplay.replayHistory(subId);

      expect(replayed).toBe(0);
    });

    it('should clear history', async () => {
      channel.subscribe('a1', vi.fn());
      await channel.broadcast('s', { msg: 1 });

      channel.clearHistory();

      expect(channel.getHistory().length).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return stats', async () => {
      channel.subscribe('a1', vi.fn());
      await channel.broadcast('s', { msg: 1 });

      const stats = channel.getStats();

      expect(stats.subscriberCount).toBe(1);
      expect(stats.historySize).toBe(1);
    });
  });
});

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe('channel management', () => {
    it('should create a channel', () => {
      const channel = manager.createChannel('test-channel');

      expect(channel.name).toBe('test-channel');
      expect(manager.getChannelCount()).toBe(1);
    });

    it('should get channel by ID', () => {
      const channel = manager.createChannel('test');

      const found = manager.getChannel(channel.id);

      expect(found).toBe(channel);
    });

    it('should get channel by name', () => {
      manager.createChannel('my-channel');

      const found = manager.getChannelByName('my-channel');

      expect(found?.name).toBe('my-channel');
    });

    it('should delete a channel', () => {
      const channel = manager.createChannel('test');

      const deleted = manager.deleteChannel(channel.id);

      expect(deleted).toBe(true);
      expect(manager.getChannelCount()).toBe(0);
    });

    it('should list all channels', () => {
      manager.createChannel('ch1');
      manager.createChannel('ch2');

      const channels = manager.getAllChannels();

      expect(channels.length).toBe(2);
    });
  });

  describe('agent subscription', () => {
    it('should subscribe agent to channel', () => {
      const channel = manager.createChannel('test');

      const subId = manager.subscribeAgent('agent-1', channel.id, vi.fn());

      expect(subId).toBeDefined();
      expect(channel.isSubscribed('agent-1')).toBe(true);
    });

    it('should track agent channels', () => {
      const ch1 = manager.createChannel('ch1');
      const ch2 = manager.createChannel('ch2');

      manager.subscribeAgent('agent-1', ch1.id, vi.fn());
      manager.subscribeAgent('agent-1', ch2.id, vi.fn());

      const agentChannels = manager.getAgentChannels('agent-1');

      expect(agentChannels.length).toBe(2);
    });

    it('should throw if channel not found', () => {
      expect(() => manager.subscribeAgent('a', 'unknown', vi.fn())).toThrow(/not found/);
    });
  });

  describe('multicast', () => {
    it('should broadcast to multiple channels', async () => {
      const ch1 = manager.createChannel('ch1');
      const ch2 = manager.createChannel('ch2');

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      ch1.subscribe('a1', handler1);
      ch2.subscribe('a2', handler2);

      const results = await manager.multicast([ch1.id, ch2.id], 'sender', { data: 'multi' });

      expect(results.size).toBe(2);
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });
  });
});
