import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresenceManager } from '@holoscript/mesh';
import { ConversationManager } from '@holoscript/mesh';
import { SocialGraph } from '@holoscript/mesh';
import { FriendManager } from '@holoscript/mesh';

// =============================================================================
// MOCK TRANSPORT
// =============================================================================

function createMockTransport() {
  const handlers: Array<(packet: any) => void> = [];
  return {
    onSocialMessage: vi.fn((handler: (packet: any) => void) => handlers.push(handler)),
    sendSocialMessage: vi.fn(),
    // Simulate receiving a packet
    _receive(packet: any) {
      handlers.forEach((h) => h(packet));
    },
  };
}

function createSeededGraph(localUserId = 'me') {
  const graph = new SocialGraph(localUserId);
  graph.updateUser({ id: 'alice', name: 'Alice', status: 'online', lastSeen: Date.now() });
  graph.updateUser({ id: 'bob', name: 'Bob', status: 'online', lastSeen: Date.now() });
  return graph;
}

// =============================================================================
// PRESENCE MANAGER
// =============================================================================

describe('PresenceManager', () => {
  let graph: SocialGraph;
  let transport: ReturnType<typeof createMockTransport>;
  let presence: PresenceManager;

  beforeEach(() => {
    graph = createSeededGraph();
    transport = createMockTransport();
    presence = new PresenceManager(graph, transport as any);
  });

  it('starts with online status', () => {
    expect(presence.getLocalStatus()).toBe('online');
  });

  it('broadcasts status change over transport', () => {
    presence.setLocalStatus('busy', 'coding');
    expect(presence.getLocalStatus()).toBe('busy');
    expect(transport.sendSocialMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SOCIAL_STATUS',
        payload: expect.objectContaining({ status: 'busy', activity: 'coding' }),
      })
    );
  });

  it('handles incoming presence updates', () => {
    transport._receive({
      type: 'SOCIAL_STATUS',
      payload: { userId: 'alice', status: 'away', activity: 'afk' },
    });
    const alice = graph.getUser('alice');
    expect(alice?.status).toBe('away');
  });

  it('does not crash on unknown user presence', () => {
    // Unknown user should be silently ignored
    expect(() => {
      transport._receive({
        type: 'SOCIAL_STATUS',
        payload: { userId: 'unknown-999', status: 'online' },
      });
    }).not.toThrow();
  });

  it('starts and stops heartbeat', () => {
    vi.useFakeTimers();
    presence.startHeartbeat(100);
    vi.advanceTimersByTime(350);
    // Should have sent 3 heartbeats
    expect(transport.sendSocialMessage.mock.calls.length).toBeGreaterThanOrEqual(3);
    presence.stopHeartbeat();
    transport.sendSocialMessage.mockClear();
    vi.advanceTimersByTime(300);
    // After stopping, no more calls
    expect(transport.sendSocialMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// =============================================================================
// CONVERSATION MANAGER
// =============================================================================

describe('ConversationManager', () => {
  let graph: SocialGraph;
  let transport: ReturnType<typeof createMockTransport>;
  let friendManager: FriendManager;
  let convo: ConversationManager;
  let events: Array<[string, any]>;

  beforeEach(() => {
    graph = createSeededGraph();
    transport = createMockTransport();
    friendManager = new FriendManager(graph, transport as any);
    convo = new ConversationManager(graph, friendManager, transport as any);
    events = [];
    convo.onEvent((evt, data) => events.push([evt, data]));
  });

  it('sends a message and stores in local history', () => {
    convo.sendMessage('alice', 'hello!');
    const history = convo.getHistory('alice');
    expect(history.length).toBe(1);
    expect(history[0].text).toBe('hello!');
    expect(history[0].read).toBe(true);
    expect(transport.sendSocialMessage).toHaveBeenCalled();
  });

  it('emits message_sent event', () => {
    convo.sendMessage('alice', 'hi');
    expect(events.some(([e]) => e === 'message_sent')).toBe(true);
  });

  it('receives incoming messages from network', () => {
    transport._receive({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'alice', text: 'hey there', id: 'msg-1', timestamp: Date.now() },
    });

    const history = convo.getHistory('alice');
    expect(history.length).toBe(1);
    expect(history[0].text).toBe('hey there');
    expect(history[0].read).toBe(false);
    expect(events.some(([e]) => e === 'message_received')).toBe(true);
  });

  it('blocks messages from blocked users', () => {
    // Block bob
    graph.setRelationship('bob', 'blocked');
    transport._receive({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'bob', text: 'spam', id: 'msg-2', timestamp: Date.now() },
    });
    // Message should not be stored
    expect(convo.getHistory('bob').length).toBe(0);
  });

  it('prevents sending to blocked users', () => {
    graph.setRelationship('alice', 'blocked');
    expect(() => convo.sendMessage('alice', 'hello')).toThrow('Cannot message blocked user');
  });

  it('marks conversation as read', () => {
    transport._receive({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'alice', text: 'msg1', id: 'r1', timestamp: 100 },
    });
    transport._receive({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'alice', text: 'msg2', id: 'r2', timestamp: 200 },
    });

    expect(convo.getHistory('alice').every((m) => !m.read)).toBe(true);
    convo.markAsRead('alice');
    expect(convo.getHistory('alice').every((m) => m.read)).toBe(true);
    expect(events.some(([e]) => e === 'conversation_read')).toBe(true);
  });

  it('orders messages by timestamp', () => {
    transport._receive({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'alice', text: 'second', id: 'a', timestamp: 200 },
    });
    transport._receive({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'alice', text: 'first', id: 'b', timestamp: 100 },
    });

    const history = convo.getHistory('alice');
    expect(history[0].text).toBe('first');
    expect(history[1].text).toBe('second');
  });
});

// =============================================================================
// SOCIAL GRAPH
// =============================================================================

describe('SocialGraph Integration', () => {
  let graph: SocialGraph;

  beforeEach(() => {
    graph = createSeededGraph();
    graph.setRelationship('alice', 'friend');
    graph.setRelationship('bob', 'pending_incoming');
  });

  it('returns friends list', () => {
    const friends = graph.getFriends();
    expect(friends.length).toBe(1);
    expect(friends[0].id).toBe('alice');
  });

  it('returns pending incoming requests', () => {
    const pending = graph.getPendingIncoming();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('bob');
  });

  it('caches and invalidates correctly', () => {
    const friends1 = graph.getFriends();
    // Promote bob to friend
    graph.setRelationship('bob', 'friend');
    const friends2 = graph.getFriends();
    expect(friends1.length).toBe(1);
    expect(friends2.length).toBe(2);
  });

  it('handles blocked users', () => {
    graph.setRelationship('bob', 'blocked');
    const blocked = graph.getBlocked();
    expect(blocked.length).toBe(1);
    expect(blocked[0].id).toBe('bob');
    // Bob should no longer be in pending
    expect(graph.getPendingIncoming().length).toBe(0);
  });
});
