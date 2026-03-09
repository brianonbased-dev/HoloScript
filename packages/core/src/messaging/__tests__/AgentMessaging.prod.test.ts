/**
 * AgentMessaging Production Tests
 * Sprint CLIII - Secure agent messaging system
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentMessaging } from '../AgentMessaging';
import { ChannelManager } from '../ChannelManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessaging(agentId: string, cm: ChannelManager) {
  return new AgentMessaging(agentId, cm, {
    maxRetries: 2,
    retryDelay: 50,
    messageTimeout: 1000,
    autoAck: true,
    maxQueueSize: 10,
  });
}

describe('AgentMessaging', () => {
  let cm: ChannelManager;
  let alice: AgentMessaging;
  let bob: AgentMessaging;
  let channelId: string;

  beforeEach(() => {
    cm = new ChannelManager();
    alice = makeMessaging('alice', cm);
    bob = makeMessaging('bob', cm);

    // Create a channel where both are members
    const ch = alice.createChannel(['bob'], { encryption: 'none' });
    channelId = ch.id;
  });

  // -------------------------------------------------------------------------
  // Channel operations
  // -------------------------------------------------------------------------

  describe('createChannel', () => {
    it('creates a channel and returns it', () => {
      const ch = alice.createChannel(['carol'], { encryption: 'none' });
      expect(ch.ownerId).toBe('alice');
      expect(ch.participants).toContain('carol');
    });
  });

  describe('joinChannel', () => {
    it('allows joining an open channel', () => {
      const ch = alice.createChannel([], { encryption: 'none' });
      cm.updateChannel(ch.id, 'alice', { isOpen: true });
      expect(bob.joinChannel(ch.id)).toBe(true);
    });
  });

  describe('leaveChannel', () => {
    it('allows leaving a channel', () => {
      expect(bob.leaveChannel(channelId)).toBe(true);
    });
  });

  describe('getChannels', () => {
    it('returns channels the agent is in', () => {
      const channels = alice.getChannels();
      const ids = channels.map((c) => c.id);
      expect(ids).toContain(channelId);
    });
  });

  // -------------------------------------------------------------------------
  // send
  // -------------------------------------------------------------------------

  describe('send', () => {
    it('returns a message with correct fields', () => {
      const msg = alice.send(channelId, 'bob', 'chat', { text: 'hello' });
      expect(msg).not.toBeNull();
      expect(msg!.senderId).toBe('alice');
      expect(msg!.recipientId).toBe('bob');
      expect(msg!.type).toBe('chat');
      expect(msg!.channelId).toBe(channelId);
    });

    it('emits message:sent', () => {
      const listener = vi.fn();
      alice.on('message:sent', listener);
      alice.send(channelId, 'bob', 'ping', {});
      expect(listener).toHaveBeenCalledOnce();
    });

    it('emits error event for unknown channel', () => {
      const errors: any[] = [];
      alice.on('error', (e) => errors.push(e));
      const result = alice.send('ghost-channel', 'bob', 'ping', {});
      expect(result).toBeNull();
      expect(errors[0]?.error).toMatch(/channel/i);
    });

    it('emits error when sender is not a member', () => {
      const carol = makeMessaging('carol', cm);
      const errors: any[] = [];
      carol.on('error', (e) => errors.push(e));
      const result = carol.send(channelId, 'bob', 'ping', {});
      expect(result).toBeNull();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('emits error when recipient is not in channel', () => {
      const errors: any[] = [];
      alice.on('error', (e) => errors.push(e));
      const result = alice.send(channelId, 'carol-not-in-channel', 'ping', {});
      expect(result).toBeNull();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('tracks pending messages', () => {
      alice.send(channelId, 'bob', 'chat', { text: 'hi' });
      expect(alice.getPendingCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // broadcast
  // -------------------------------------------------------------------------

  describe('broadcast', () => {
    it('returns a broadcast message with recipients', () => {
      const bcast = alice.broadcast(channelId, 'announce', { text: 'hello all' });
      expect(bcast).not.toBeNull();
      expect(bcast!.recipients).toContain('bob');
      expect(bcast!.recipients).not.toContain('alice'); // sender excluded
    });

    it('emits message:broadcast', () => {
      const listener = vi.fn();
      alice.on('message:broadcast', listener);
      alice.broadcast(channelId, 'event', {});
      expect(listener).toHaveBeenCalledOnce();
    });

    it('emits error for unknown channel on broadcast', () => {
      const errors: any[] = [];
      alice.on('error', (e) => errors.push(e));
      const result = alice.broadcast('ghost', 'event', {});
      expect(result).toBeNull();
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // reply
  // -------------------------------------------------------------------------

  describe('reply', () => {
    it('sends a reply to the original sender', () => {
      const original = alice.send(channelId, 'bob', 'question', { q: 'what?' });
      const reply = bob.reply(original as any, 'answer', { a: '42' });
      expect(reply).not.toBeNull();
      expect(reply!.recipientId).toBe('alice');
    });
  });

  // -------------------------------------------------------------------------
  // subscribe / subscribeToType
  // -------------------------------------------------------------------------

  describe('subscribe', () => {
    it('invokes handler when handleMessage called', () => {
      const handler = vi.fn();
      alice.subscribe(channelId, handler);

      const msg = {
        id: 'msg1',
        channelId,
        senderId: 'bob',
        recipientId: 'alice',
        type: 'chat',
        payload: { text: 'hi' },
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };

      alice.handleMessage(msg);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returned unsubscribe function stops delivery', () => {
      const handler = vi.fn();
      const unsub = alice.subscribe(channelId, handler);
      unsub();

      const msg = {
        id: 'msg2',
        channelId,
        senderId: 'bob',
        recipientId: 'alice',
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };

      alice.handleMessage(msg);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToType', () => {
    it('only invokes handler for matching type', () => {
      const handler = vi.fn();
      alice.subscribeToType('special', handler);

      const ping = {
        id: 'm1',
        channelId,
        senderId: 'bob',
        recipientId: 'alice',
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };
      const special = { ...ping, id: 'm2', type: 'special' };

      alice.handleMessage(ping);
      alice.handleMessage(special);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // handleMessage
  // -------------------------------------------------------------------------

  describe('handleMessage', () => {
    it('returns delivered ack for correct recipient', () => {
      const msg = {
        id: 'msg3',
        channelId,
        senderId: 'bob',
        recipientId: 'alice',
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };

      const ack = alice.handleMessage(msg);
      expect(ack.status).toBe('delivered');
      expect(ack.recipientId).toBe('alice');
    });

    it('returns failed ack if not intended recipient', () => {
      const msg = {
        id: 'msg4',
        channelId,
        senderId: 'alice',
        recipientId: 'carol',
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };

      const ack = bob.handleMessage(msg);
      expect(ack.status).toBe('failed');
    });

    it('emits message:received', () => {
      const listener = vi.fn();
      alice.on('message:received', listener);
      const msg = {
        id: 'msg5',
        channelId,
        senderId: 'bob',
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };
      alice.handleMessage(msg as any);
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Acknowledgement
  // -------------------------------------------------------------------------

  describe('handleAck', () => {
    it('removes pending message on delivered ack', () => {
      const msg = alice.send(channelId, 'bob', 'ping', {})!;
      expect(alice.getPendingCount()).toBe(1);

      alice.handleAck({
        messageId: msg.id,
        recipientId: 'bob',
        status: 'delivered',
        timestamp: Date.now(),
      });
      expect(alice.getPendingCount()).toBe(0);
    });

    it('removes pending message on read ack', () => {
      const msg = alice.send(channelId, 'bob', 'ping', {})!;
      alice.handleAck({
        messageId: msg.id,
        recipientId: 'bob',
        status: 'read',
        timestamp: Date.now(),
      });
      expect(alice.getPendingCount()).toBe(0);
    });

    it('ignores ack for unknown message id', () => {
      alice.handleAck({
        messageId: 'ghost-msg',
        recipientId: 'bob',
        status: 'delivered',
        timestamp: Date.now(),
      });
      // Should not throw
    });
  });

  describe('markAsRead', () => {
    it('returns a read ack', () => {
      const ack = alice.markAsRead('some-msg-id');
      expect(ack.status).toBe('read');
      expect(ack.messageId).toBe('some-msg-id');
      expect(ack.recipientId).toBe('alice');
    });
  });

  // -------------------------------------------------------------------------
  // Encryption
  // -------------------------------------------------------------------------

  describe('initializeEncryption', () => {
    it('returns ECDH key pair', () => {
      const keys = alice.initializeEncryption();
      expect(keys.publicKey).toBeTruthy();
      expect(keys.privateKey).toBeTruthy();
    });

    it('getPublicKey returns the public key after init', () => {
      alice.initializeEncryption();
      expect(alice.getPublicKey()).toBeTruthy();
    });

    it('getPublicKey returns null before init', () => {
      expect(alice.getPublicKey()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe('cleanupExpired', () => {
    it('returns 0 when no messages are expired', () => {
      alice.send(channelId, 'bob', 'ping', {});
      expect(alice.cleanupExpired()).toBe(0);
    });
  });

  describe('clearSubscriptions', () => {
    it('removes all handlers', () => {
      const handler = vi.fn();
      alice.subscribe(channelId, handler);
      alice.clearSubscriptions();

      const msg = {
        id: 'mx',
        channelId,
        senderId: 'bob',
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
        encrypted: false,
        priority: 'normal' as const,
        status: 'sent' as const,
      };
      alice.handleMessage(msg as any);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('clears all subscriptions and pending messages', () => {
      alice.send(channelId, 'bob', 'ping', {});
      alice.subscribe(channelId, vi.fn());
      alice.dispose();
      expect(alice.getPendingCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getPendingMessage
  // -------------------------------------------------------------------------

  describe('getPendingMessage', () => {
    it('retrieves the pending message by id', () => {
      const msg = alice.send(channelId, 'bob', 'ping', { data: 'test' })!;
      const pending = alice.getPendingMessage(msg.id);
      expect(pending).not.toBeNull();
      expect(pending!.id).toBe(msg.id);
    });

    it('returns null for unknown message id', () => {
      expect(alice.getPendingMessage('ghost')).toBeNull();
    });
  });
});
