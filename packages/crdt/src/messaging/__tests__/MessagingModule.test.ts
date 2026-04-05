/**
 * Messaging Module Tests
 * Sprint 4 Priority 6 - Agent Communication Channels
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChannelManager,
  AgentMessaging,
  MessagingTraitManager,
  createMessagingTrait,
  generateMessageId,
  generateChannelId,
  validateMessageSchema,
  DEFAULT_CHANNEL_CONFIG,
  Message,
  MessageAck,
  BroadcastMessage,
  JSONSchema,
} from '../index';

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('Messaging Utilities', () => {
  describe('generateMessageId', () => {
    it('should generate unique message IDs', () => {
      const id1 = generateMessageId('agent-1');
      const id2 = generateMessageId('agent-1');
      const id3 = generateMessageId('agent-2');

      expect(id1).toContain('agent-1');
      expect(id2).toContain('agent-1');
      expect(id3).toContain('agent-2');
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateChannelId', () => {
    it('should generate unique channel IDs', () => {
      const id1 = generateChannelId('owner-1');
      const id2 = generateChannelId('owner-1');

      expect(id1).toContain('owner-1');
      expect(id1).not.toBe(id2);
    });
  });

  describe('validateMessageSchema', () => {
    it('should validate valid messages', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
        },
        required: ['name', 'value'],
      };

      const result = validateMessageSchema({ name: 'test', value: 42 }, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid messages', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const result = validateMessageSchema({ value: 42 }, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate type constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: { type: 'number' },
        },
      };

      const valid = validateMessageSchema({ count: 10 }, schema);
      const invalid = validateMessageSchema({ count: 'ten' }, schema);

      expect(valid.valid).toBe(true);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('DEFAULT_CHANNEL_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CHANNEL_CONFIG.encryption).toBe('none');
      expect(DEFAULT_CHANNEL_CONFIG.maxMessageSize).toBe(1024 * 1024);
      expect(DEFAULT_CHANNEL_CONFIG.messageTTL).toBe(60000);
      expect(DEFAULT_CHANNEL_CONFIG.requireAck).toBe(false);
      expect(DEFAULT_CHANNEL_CONFIG.retryCount).toBe(3);
    });
  });
});

// =============================================================================
// CHANNEL MANAGER TESTS
// =============================================================================

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe('Channel Creation', () => {
    it('should create a channel', () => {
      const channel = manager.createChannel('owner-1', ['agent-2', 'agent-3']);

      expect(channel.id).toBeDefined();
      expect(channel.ownerId).toBe('owner-1');
      expect(channel.participants).toContain('owner-1');
      expect(channel.participants).toContain('agent-2');
      expect(channel.participants).toContain('agent-3');
      expect(channel.participants).toHaveLength(3);
    });

    it('should apply custom config', () => {
      const channel = manager.createChannel('owner-1', ['agent-2'], {
        name: 'Test Channel',
        encryption: 'aes-256',
      });

      expect(channel.name).toBe('Test Channel');
      expect(channel.encryption).toBe('aes-256');
    });

    it('should emit channel:created event', () => {
      const listener = vi.fn();
      manager.on('channel:created', listener);

      const channel = manager.createChannel('owner-1', ['agent-2']);

      expect(listener).toHaveBeenCalledWith(channel);
    });
  });

  describe('Channel Retrieval', () => {
    it('should get channel by ID', () => {
      const created = manager.createChannel('owner-1', ['agent-2']);
      const retrieved = manager.getChannel(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent channel', () => {
      const channel = manager.getChannel('non-existent');
      expect(channel).toBeNull();
    });

    it('should get all channels', () => {
      manager.createChannel('owner-1', ['agent-2']);
      manager.createChannel('owner-2', ['agent-3']);

      const channels = manager.getAllChannels();
      expect(channels).toHaveLength(2);
    });

    it('should get channels for an agent', () => {
      manager.createChannel('owner-1', ['agent-2', 'agent-3']);
      manager.createChannel('owner-1', ['agent-2']);
      manager.createChannel('owner-2', ['agent-3']);

      const agent2Channels = manager.getAgentChannels('agent-2');
      expect(agent2Channels).toHaveLength(2);

      const agent3Channels = manager.getAgentChannels('agent-3');
      expect(agent3Channels).toHaveLength(2);
    });
  });

  describe('Membership', () => {
    it('should check membership', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      expect(manager.isMember(channel.id, 'owner-1')).toBe(true);
      expect(manager.isMember(channel.id, 'agent-2')).toBe(true);
      expect(manager.isMember(channel.id, 'agent-3')).toBe(false);
    });

    it('should get members', () => {
      const channel = manager.createChannel('owner-1', ['agent-2', 'agent-3']);
      const members = manager.getMembers(channel.id);

      expect(members).toHaveLength(3);
      expect(members.find((m) => m.agentId === 'owner-1')?.role).toBe('owner');
      expect(members.find((m) => m.agentId === 'agent-2')?.role).toBe('member');
    });

    it('should allow joining open channels', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);
      manager.updateChannel(channel.id, 'owner-1', { isOpen: true });

      const joined = manager.joinChannel(channel.id, 'agent-3');

      expect(joined).toBe(true);
      expect(manager.isMember(channel.id, 'agent-3')).toBe(true);
    });

    it('should allow leaving channels', () => {
      const channel = manager.createChannel('owner-1', ['agent-2', 'agent-3']);

      const left = manager.leaveChannel(channel.id, 'agent-2');

      expect(left).toBe(true);
      expect(manager.isMember(channel.id, 'agent-2')).toBe(false);
    });

    it('should prevent owner from leaving', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      const left = manager.leaveChannel(channel.id, 'owner-1');

      expect(left).toBe(false);
      expect(manager.isMember(channel.id, 'owner-1')).toBe(true);
    });
  });

  describe('Kick Functionality', () => {
    it('should allow owner to kick members', () => {
      const channel = manager.createChannel('owner-1', ['agent-2', 'agent-3']);
      const listener = vi.fn();
      manager.on('member:kicked', listener);

      const kicked = manager.kickMember(channel.id, 'owner-1', 'agent-2', 'Spam');

      expect(kicked).toBe(true);
      expect(manager.isMember(channel.id, 'agent-2')).toBe(false);
      expect(listener).toHaveBeenCalledWith(channel.id, 'agent-2', 'Spam');
    });

    it('should prevent kicking owner', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      const kicked = manager.kickMember(channel.id, 'agent-2', 'owner-1', 'Test');

      expect(kicked).toBe(false);
    });

    it('should only allow owner/admin to kick', () => {
      const channel = manager.createChannel('owner-1', ['agent-2', 'agent-3']);

      const kicked = manager.kickMember(channel.id, 'agent-2', 'agent-3', 'Test');

      expect(kicked).toBe(false);
    });
  });

  describe('Channel Updates', () => {
    it('should update channel name', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      manager.updateChannel(channel.id, 'owner-1', { name: 'New Name' });

      const updated = manager.getChannel(channel.id);
      expect(updated?.name).toBe('New Name');
    });

    it('should only allow owner to update', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      const result = manager.updateChannel(channel.id, 'agent-2', {
        name: 'New Name',
      });

      expect(result).toBe(false);
    });
  });

  describe('Role Management', () => {
    it('should promote member to admin', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      manager.promoteToAdmin(channel.id, 'owner-1', 'agent-2');

      const member = manager.getMember(channel.id, 'agent-2');
      expect(member?.role).toBe('admin');
    });

    it('should demote admin to member', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);
      manager.promoteToAdmin(channel.id, 'owner-1', 'agent-2');

      manager.demoteToMember(channel.id, 'owner-1', 'agent-2');

      const member = manager.getMember(channel.id, 'agent-2');
      expect(member?.role).toBe('member');
    });
  });

  describe('Channel Closure', () => {
    it('should close channel', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);
      const listener = vi.fn();
      manager.on('channel:closed', listener);

      const closed = manager.closeChannel(channel.id, 'owner-1');

      expect(closed).toBe(true);
      expect(manager.getChannel(channel.id)).toBeNull();
      expect(listener).toHaveBeenCalledWith(channel.id);
    });

    it('should only allow owner to close', () => {
      const channel = manager.createChannel('owner-1', ['agent-2']);

      const closed = manager.closeChannel(channel.id, 'agent-2');

      expect(closed).toBe(false);
      expect(manager.getChannel(channel.id)).not.toBeNull();
    });
  });

  describe('Encryption Keys', () => {
    it('should store and retrieve public keys', () => {
      const channel = manager.createChannel('owner-1', ['agent-2'], {
        encryption: 'aes-256',
      });

      manager.setPublicKey(channel.id, 'owner-1', 'pub_key_1');

      expect(manager.getPublicKey(channel.id, 'owner-1')).toBe('pub_key_1');
    });

    it('should get all public keys', () => {
      const channel = manager.createChannel('owner-1', ['agent-2'], {
        encryption: 'e2e',
      });

      manager.setPublicKey(channel.id, 'owner-1', 'pub_1');
      manager.setPublicKey(channel.id, 'agent-2', 'pub_2');

      const keys = manager.getAllPublicKeys(channel.id);
      expect(keys.size).toBe(2);
    });
  });
});

// =============================================================================
// AGENT MESSAGING TESTS
// =============================================================================

describe('AgentMessaging', () => {
  let channelManager: ChannelManager;
  let agent1: AgentMessaging;
  let agent2: AgentMessaging;

  beforeEach(() => {
    channelManager = new ChannelManager();
    agent1 = new AgentMessaging('agent-1', channelManager);
    agent2 = new AgentMessaging('agent-2', channelManager);
  });

  describe('Channel Operations', () => {
    it('should create a channel', () => {
      const channel = agent1.createChannel(['agent-2']);

      expect(channel.ownerId).toBe('agent-1');
      expect(channel.participants).toContain('agent-2');
    });

    it('should join a channel', () => {
      const channel = agent1.createChannel(['agent-2']);

      const joined = agent2.joinChannel(channel.id);

      expect(joined).toBe(true);
    });

    it('should get owned channels', () => {
      agent1.createChannel(['agent-2']);
      agent1.createChannel(['agent-3']);

      const channels = agent1.getChannels();
      expect(channels).toHaveLength(2);
    });

    it('should leave a channel', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const left = agent2.leaveChannel(channel.id);

      expect(left).toBe(true);
    });
  });

  describe('Messaging', () => {
    it('should send a message', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const message = agent1.send(channel.id, 'agent-2', 'greeting', {
        text: 'Hello',
      });

      expect(message).not.toBeNull();
      expect(message?.senderId).toBe('agent-1');
      expect(message?.recipientId).toBe('agent-2');
      expect(message?.type).toBe('greeting');
    });

    it('should broadcast a message', () => {
      const channel = agent1.createChannel(['agent-2', 'agent-3']);

      const broadcast = agent1.broadcast(channel.id, 'announcement', {
        content: 'Hello all',
      });

      expect(broadcast).not.toBeNull();
      expect(broadcast?.recipients).toContain('agent-2');
      expect(broadcast?.recipients).toContain('agent-3');
      expect(broadcast?.recipients).not.toContain('agent-1');
    });

    it('should not send to non-member', () => {
      const channel = agent1.createChannel(['agent-2']);

      // Add error handler to prevent Node from throwing
      agent1.on('error', () => {});

      const message = agent1.send(channel.id, 'agent-3', 'test', {});

      expect(message).toBeNull();
    });

    it('should fail for non-existent channel', () => {
      // Add error handler to prevent Node from throwing
      agent1.on('error', () => {});

      const message = agent1.send('fake-channel', 'agent-2', 'test', {});
      expect(message).toBeNull();
    });
  });

  describe('Message Handling', () => {
    it('should handle received messages', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const message = agent1.send(channel.id, 'agent-2', 'test', {
        data: 'hello',
      })!;

      const ack = agent2.handleMessage(message);

      expect(ack.status).toBe('delivered');
      expect(ack.messageId).toBe(message.id);
    });

    it('should invoke channel handlers', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const handler = vi.fn();
      agent2.subscribe(channel.id, handler);

      const message = agent1.send(channel.id, 'agent-2', 'test', {
        data: 'hello',
      })!;
      agent2.handleMessage(message);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: message.id,
          type: 'test',
        }),
        expect.anything()
      );
    });

    it('should invoke type handlers', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const handler = vi.fn();
      agent2.subscribeToType('alert', handler);

      const message = agent1.send(channel.id, 'agent-2', 'alert', {
        level: 'high',
      })!;
      agent2.handleMessage(message);

      expect(handler).toHaveBeenCalled();
    });

    it('should unsubscribe handlers', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const handler = vi.fn();
      const unsubscribe = agent2.subscribe(channel.id, handler);

      unsubscribe();

      const message = agent1.send(channel.id, 'agent-2', 'test', {})!;
      agent2.handleMessage(message);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Message Priority', () => {
    it('should set message priority', () => {
      const channel = agent1.createChannel(['agent-2']);

      const normal = agent1.send(channel.id, 'agent-2', 'test', {});
      const urgent = agent1.send(channel.id, 'agent-2', 'test', {}, 'urgent');

      expect(normal?.priority).toBe('normal');
      expect(urgent?.priority).toBe('urgent');
    });
  });

  describe('Schema Validation', () => {
    it('should validate messages against schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          action: { type: 'string' },
        },
        required: ['action'],
      };

      const channel = agent1.createChannel(['agent-2'], {
        messageSchema: schema,
      });

      // Add error handler for invalid message
      agent1.on('error', () => {});

      const valid = agent1.send(channel.id, 'agent-2', 'test', {
        action: 'start',
      });
      const invalid = agent1.send(channel.id, 'agent-2', 'test', {
        other: 'data',
      });

      expect(valid).not.toBeNull();
      expect(invalid).toBeNull();
    });
  });

  describe('Encryption', () => {
    it('should initialize encryption keys', () => {
      const keys = agent1.initializeEncryption();

      expect(keys.publicKey).toBeDefined();
      expect(keys.privateKey).toBeDefined();
      expect(agent1.getPublicKey()).toBe(keys.publicKey);
    });

    it('should encrypt messages on encrypted channels', () => {
      agent1.initializeEncryption();
      agent2.initializeEncryption();

      const channel = agent1.createChannel(['agent-2'], {
        encryption: 'aes-256',
      });
      agent2.joinChannel(channel.id);

      const message = agent1.send(channel.id, 'agent-2', 'secret', {
        code: '1234',
      });

      expect(message?.encrypted).toBe(true);
    });
  });

  describe('Reply', () => {
    it('should reply to a message', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent2.joinChannel(channel.id);

      const original = agent1.send(channel.id, 'agent-2', 'question', {
        q: 'How are you?',
      })!;

      const reply = agent2.reply(original, 'answer', { a: 'Fine!' });

      expect(reply?.senderId).toBe('agent-2');
      expect(reply?.recipientId).toBe('agent-1');
      expect(reply?.type).toBe('answer');
    });
  });

  describe('Acknowledgement', () => {
    it('should track pending messages', () => {
      const channel = agent1.createChannel(['agent-2']);

      agent1.send(channel.id, 'agent-2', 'test', {});
      agent1.send(channel.id, 'agent-2', 'test2', {});

      expect(agent1.getPendingCount()).toBe(2);
    });

    it('should handle ack and remove from pending', () => {
      const channel = agent1.createChannel(['agent-2']);

      const message = agent1.send(channel.id, 'agent-2', 'test', {})!;

      expect(agent1.getPendingCount()).toBe(1);

      const ack: MessageAck = {
        messageId: message.id,
        recipientId: 'agent-2',
        status: 'delivered',
        timestamp: Date.now(),
      };

      agent1.handleAck(ack);

      expect(agent1.getPendingCount()).toBe(0); // Message was acked
    });

    it('should mark message as read', () => {
      const ack = agent2.markAsRead('msg-123');

      expect(ack.status).toBe('read');
      expect(ack.messageId).toBe('msg-123');
    });
  });

  describe('Cleanup', () => {
    it('should clear subscriptions', () => {
      const channel = agent1.createChannel(['agent-2']);
      const handler = vi.fn();
      agent2.subscribe(channel.id, handler);

      agent2.clearSubscriptions();

      // Handler should not be called after clearing
      const message = agent1.send(channel.id, 'agent-2', 'test', {})!;
      agent2.handleMessage(message);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should dispose messaging', () => {
      const channel = agent1.createChannel(['agent-2']);
      agent1.send(channel.id, 'agent-2', 'test', {});

      agent1.dispose();

      expect(agent1.getPendingCount()).toBe(0);
    });
  });
});

// =============================================================================
// MESSAGING TRAIT TESTS
// =============================================================================

describe('MessagingTrait', () => {
  let channelManager: ChannelManager;

  beforeEach(() => {
    channelManager = new ChannelManager();
  });

  describe('createMessagingTrait', () => {
    it('should create trait with all methods', () => {
      const trait = createMessagingTrait('entity-1', channelManager);

      expect(trait.createChannel).toBeDefined();
      expect(trait.joinChannel).toBeDefined();
      expect(trait.send).toBeDefined();
      expect(trait.broadcast).toBeDefined();
      expect(trait.subscribe).toBeDefined();
    });

    it('should allow entity to create channels', () => {
      const trait = createMessagingTrait('entity-1', channelManager);

      const channel = trait.createChannel(['entity-2']);

      expect(channel.ownerId).toBe('entity-1');
    });

    it('should allow entity to send messages', () => {
      const trait1 = createMessagingTrait('entity-1', channelManager);
      const trait2 = createMessagingTrait('entity-2', channelManager);

      const channel = trait1.createChannel(['entity-2']);
      trait2.joinChannel(channel.id);

      const message = trait1.send(channel.id, 'entity-2', 'test', {
        data: 'hello',
      });

      expect(message).not.toBeNull();
    });
  });

  describe('MessagingTraitManager', () => {
    it('should create manager with channel manager', () => {
      const manager = new MessagingTraitManager(channelManager);

      expect(manager.getChannelManager()).toBe(channelManager);
    });

    it('should get or create trait for entity', () => {
      const manager = new MessagingTraitManager(channelManager);

      const trait1 = manager.getOrCreate('entity-1');
      const trait2 = manager.getOrCreate('entity-1');

      expect(trait1).toBe(trait2); // Same instance
    });

    it('should remove trait for entity', () => {
      const manager = new MessagingTraitManager(channelManager);

      const trait = manager.getOrCreate('entity-1');
      trait.createChannel(['entity-2']);

      manager.remove('entity-1');

      expect(manager.get('entity-1')).toBeUndefined();
    });

    it('should get all traits', () => {
      const manager = new MessagingTraitManager(channelManager);

      manager.getOrCreate('entity-1');
      manager.getOrCreate('entity-2');
      manager.getOrCreate('entity-3');

      const traits = manager.getAllTraits();
      expect(traits.size).toBe(3);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Messaging Integration', () => {
  it('should support multi-agent conversation', () => {
    const channelManager = new ChannelManager();
    const agent1 = new AgentMessaging('agent-1', channelManager);
    const agent2 = new AgentMessaging('agent-2', channelManager);
    const agent3 = new AgentMessaging('agent-3', channelManager);

    // Create a group channel
    const channel = agent1.createChannel(['agent-2', 'agent-3'], {
      name: 'Team Chat',
    });

    agent2.joinChannel(channel.id);
    agent3.joinChannel(channel.id);

    // Set up message tracking
    const receivedMessages: Message<unknown>[] = [];
    agent2.subscribe(channel.id, (msg) => receivedMessages.push(msg));
    agent3.subscribe(channel.id, (msg) => receivedMessages.push(msg));

    // Agent 1 sends to agent 2
    const msg1 = agent1.send(channel.id, 'agent-2', 'greeting', {
      text: 'Hello agent 2!',
    })!;
    agent2.handleMessage(msg1);

    // Agent 1 broadcasts to all
    const broadcast = agent1.broadcast(channel.id, 'announcement', {
      text: 'Hello everyone!',
    })!;

    // Simulate delivery
    for (const recipientId of broadcast.recipients) {
      const msg: Message<unknown> = {
        ...broadcast,
        recipientId,
      };
      if (recipientId === 'agent-2') {
        agent2.handleMessage(msg);
      } else if (recipientId === 'agent-3') {
        agent3.handleMessage(msg);
      }
    }

    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle encrypted communication', () => {
    const channelManager = new ChannelManager();
    const alice = new AgentMessaging('alice', channelManager);
    const bob = new AgentMessaging('bob', channelManager);

    // Initialize encryption
    alice.initializeEncryption();
    bob.initializeEncryption();

    // Create encrypted channel
    const channel = alice.createChannel(['bob'], {
      name: 'Secure Channel',
      encryption: 'e2e',
    });

    bob.joinChannel(channel.id);

    // Register keys
    channelManager.setPublicKey(channel.id, 'alice', alice.getPublicKey()!);
    channelManager.setPublicKey(channel.id, 'bob', bob.getPublicKey()!);

    // Send encrypted message
    const message = alice.send(channel.id, 'bob', 'secret', {
      password: 'hunter2',
    })!;

    expect(message.encrypted).toBe(true);

    // Bob receives and decrypts
    const ack = bob.handleMessage(message);
    expect(ack.status).toBe('delivered');
  });

  it('should work with trait manager', () => {
    const manager = new MessagingTraitManager();

    const entity1 = manager.getOrCreate('entity-1');
    const entity2 = manager.getOrCreate('entity-2');

    // Create channel via trait
    const channel = entity1.createChannel(['entity-2']);
    entity2.joinChannel(channel.id);

    // Message via trait
    const message = entity1.send(channel.id, 'entity-2', 'action', {
      type: 'move',
      x: 10,
      y: 20,
    });

    expect(message).not.toBeNull();
    expect(message?.type).toBe('action');

    // Handle via trait
    const ack = entity2.handleMessage(message!);
    expect(ack.status).toBe('delivered');
  });
});
