/**
 * ConversationManager — Production Test Suite
 *
 * Tests message sending/receiving, history management, read marking,
 * blocked user filtering, and event emission.
 * Mocks WebRTCTransport and FriendManager.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationManager } from '../ConversationManager';
import { FriendManager } from '../FriendManager';
import { SocialGraph, SocialUser } from '../SocialGraph';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

function makeTransportMock() {
  const listeners: Array<(packet: any) => void> = [];
  return {
    onSocialMessage: vi.fn((cb: (packet: any) => void) => listeners.push(cb)),
    sendSocialMessage: vi.fn(),
    _deliver: (packet: any) => listeners.forEach((l) => l(packet)),
  };
}

function makeUser(id: string): SocialUser {
  return { id, username: id, displayName: id, status: 'online', lastSeen: Date.now() };
}

describe('ConversationManager — Production', () => {
  let graph: SocialGraph;
  let friendManager: FriendManager;
  let transport: ReturnType<typeof makeTransportMock>;
  let manager: ConversationManager;

  beforeEach(() => {
    graph = new SocialGraph('me');
    friendManager = new FriendManager(graph);
    transport = makeTransportMock();
    manager = new ConversationManager(graph as any, friendManager, transport as any);
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs and registers network listener', () => {
    expect(manager).toBeDefined();
    expect(transport.onSocialMessage).toHaveBeenCalled();
  });

  // ─── getHistory ────────────────────────────────────────────────────────
  it('getHistory returns empty array for unknown user', () => {
    expect(manager.getHistory('nobody')).toEqual([]);
  });

  // ─── sendMessage ─────────────────────────────────────────────────────
  it('sendMessage adds message to local history', () => {
    manager.sendMessage('alice', 'Hello!');
    const history = manager.getHistory('alice');
    expect(history.length).toBe(1);
    expect(history[0].text).toBe('Hello!');
  });

  it('sendMessage sets read=true (my own messages)', () => {
    manager.sendMessage('alice', 'Hi');
    const history = manager.getHistory('alice');
    expect(history[0].read).toBe(true);
  });

  it('sendMessage emits message_sent event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.sendMessage('alice', 'Hi');
    expect(events).toContain('message_sent');
  });

  it('sendMessage calls transport.sendSocialMessage', () => {
    manager.sendMessage('alice', 'Hello');
    expect(transport.sendSocialMessage).toHaveBeenCalled();
  });

  it('sendMessage throws if target is blocked', () => {
    friendManager.blockUser(makeUser('blocked-user'));
    expect(() => manager.sendMessage('blocked-user', 'test')).toThrow('blocked');
  });

  it('sendMessage gives message a unique id', () => {
    manager.sendMessage('alice', 'Msg1');
    manager.sendMessage('alice', 'Msg2');
    const history = manager.getHistory('alice');
    const ids = history.map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });

  // ─── receiveMessage (via network) ─────────────────────────────────────
  it('receives message from network and stores in history', () => {
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'bob', text: 'Hey!', id: 'msg-1', timestamp: Date.now() },
    });
    const history = manager.getHistory('bob');
    expect(history.length).toBe(1);
    expect(history[0].text).toBe('Hey!');
  });

  it('received message has read=false', () => {
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'charlie', text: 'Yo', id: 'msg-2', timestamp: Date.now() },
    });
    expect(manager.getHistory('charlie')[0].read).toBe(false);
  });

  it('received message emits message_received event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'dan', text: 'Hello', id: 'msg-3', timestamp: Date.now() },
    });
    expect(events).toContain('message_received');
  });

  it('blocks messages from blocked users', () => {
    friendManager.blockUser(makeUser('eve'));
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'eve', text: 'Not welcome', id: 'msg-9', timestamp: Date.now() },
    });
    expect(manager.getHistory('eve')).toHaveLength(0);
  });

  // ─── markAsRead ─────────────────────────────────────────────────────
  it('markAsRead marks all messages as read', () => {
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'frank', text: 'Msg1', id: 'a', timestamp: 1 },
    });
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'frank', text: 'Msg2', id: 'b', timestamp: 2 },
    });
    manager.markAsRead('frank');
    const history = manager.getHistory('frank');
    expect(history.every((m) => m.read)).toBe(true);
  });

  it('markAsRead emits conversation_read event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'grace', text: 'Hi', id: 'c', timestamp: Date.now() },
    });
    manager.markAsRead('grace');
    expect(events).toContain('conversation_read');
  });

  it('markAsRead on empty history does nothing', () => {
    expect(() => manager.markAsRead('nobody')).not.toThrow();
  });

  // ─── History ordering ─────────────────────────────────────────────────
  it('messages are ordered by timestamp', () => {
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'hank', text: 'Second', id: 'x2', timestamp: 200 },
    });
    transport._deliver({
      type: 'SOCIAL_MESSAGE',
      payload: { senderId: 'hank', text: 'First', id: 'x1', timestamp: 100 },
    });
    const history = manager.getHistory('hank');
    expect(history[0].text).toBe('First');
    expect(history[1].text).toBe('Second');
  });

  // ─── Multiple conversations ────────────────────────────────────────────
  it('manages separate conversations per user', () => {
    manager.sendMessage('alice', 'Hi Alice');
    manager.sendMessage('bob', 'Hi Bob');
    expect(manager.getHistory('alice').length).toBe(1);
    expect(manager.getHistory('bob').length).toBe(1);
    expect(manager.getHistory('alice')[0].text).toBe('Hi Alice');
    expect(manager.getHistory('bob')[0].text).toBe('Hi Bob');
  });
});
