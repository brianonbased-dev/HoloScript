/**
 * FriendManager — Production Test Suite
 *
 * Tests friend request lifecycle (send/receive/accept/reject),
 * blocking, unblocking, removal, and event emission.
 * Uses SocialGraph directly and mocks WebRTCTransport as optional.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FriendManager } from '../FriendManager';
import { SocialGraph, SocialUser } from '../SocialGraph';

function makeUser(id: string, username = 'user'): SocialUser {
  return { id, username, displayName: username, status: 'online', lastSeen: Date.now() };
}

function makeGraph(localId = 'local-user'): SocialGraph {
  return new SocialGraph(localId);
}

describe('FriendManager — Production', () => {
  let graph: SocialGraph;
  let manager: FriendManager;

  beforeEach(() => {
    graph = makeGraph('me');
    manager = new FriendManager(graph); // no transport (offline mode)
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs without transport (offline mode)', () => {
    expect(manager).toBeDefined();
  });

  // ─── sendRequest ─────────────────────────────────────────────────────
  it('sendRequest sets pending_outgoing relationship', () => {
    const alice = makeUser('alice');
    manager.sendRequest(alice);
    expect(graph.getRelationship('alice')).toBe('pending_outgoing');
  });

  it('sendRequest emits request_sent event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.sendRequest(makeUser('bob'));
    expect(events).toContain('request_sent');
  });

  it('sendRequest throws if user is already a friend', () => {
    graph.updateUser(makeUser('carol'));
    graph.setRelationship('carol', 'friend');
    expect(() => manager.sendRequest(makeUser('carol'))).toThrow('already a friend');
  });

  it('sendRequest throws if user is blocked', () => {
    const dave = makeUser('dave');
    manager.blockUser(dave);
    expect(() => manager.sendRequest(makeUser('dave'))).toThrow('blocked');
  });

  it('sendRequest is idempotent if already pending_outgoing', () => {
    const eve = makeUser('eve');
    manager.sendRequest(eve);
    expect(() => manager.sendRequest(eve)).not.toThrow();
    expect(graph.getRelationship('eve')).toBe('pending_outgoing');
  });

  // ─── receiveRequest ────────────────────────────────────────────────────
  it('receiveRequest sets pending_incoming relationship', () => {
    manager.receiveRequest(makeUser('frank'));
    expect(graph.getRelationship('frank')).toBe('pending_incoming');
  });

  it('receiveRequest emits request_received event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.receiveRequest(makeUser('grace'));
    expect(events).toContain('request_received');
  });

  it('receiveRequest from blocked user is ignored', () => {
    const hank = makeUser('hank');
    manager.blockUser(hank);
    manager.receiveRequest(hank); // should be silently ignored
    expect(graph.getRelationship('hank')).toBe('blocked');
  });

  it('receiveRequest from existing friend is ignored', () => {
    graph.updateUser(makeUser('ivy'));
    graph.setRelationship('ivy', 'friend');
    manager.receiveRequest(makeUser('ivy'));
    expect(graph.getRelationship('ivy')).toBe('friend');
  });

  // ─── acceptRequest ─────────────────────────────────────────────────────
  it('acceptRequest upgrades pending_incoming to friend', () => {
    manager.receiveRequest(makeUser('jack'));
    manager.acceptRequest('jack');
    expect(graph.getRelationship('jack')).toBe('friend');
  });

  it('acceptRequest emits friend_added event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.receiveRequest(makeUser('kate'));
    manager.acceptRequest('kate');
    expect(events).toContain('friend_added');
  });

  it('acceptRequest throws if no pending request', () => {
    expect(() => manager.acceptRequest('nobody')).toThrow('No pending request');
  });

  // ─── rejectRequest ─────────────────────────────────────────────────────
  it('rejectRequest removes pending_incoming relationship', () => {
    manager.receiveRequest(makeUser('liam'));
    manager.rejectRequest('liam');
    expect(graph.getRelationship('liam')).toBe('none');
  });

  it('rejectRequest emits request_rejected event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.receiveRequest(makeUser('mia'));
    manager.rejectRequest('mia');
    expect(events).toContain('request_rejected');
  });

  it('rejectRequest on non-pending is a no-op (no error)', () => {
    expect(() => manager.rejectRequest('nobody')).not.toThrow();
  });

  // ─── removeFriend ─────────────────────────────────────────────────────
  it('removeFriend removes friend relationship', () => {
    graph.updateUser(makeUser('noah'));
    graph.setRelationship('noah', 'friend');
    manager.removeFriend('noah');
    expect(graph.getRelationship('noah')).toBe('none');
  });

  it('removeFriend emits friend_removed event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    graph.updateUser(makeUser('olivia'));
    graph.setRelationship('olivia', 'friend');
    manager.removeFriend('olivia');
    expect(events).toContain('friend_removed');
  });

  // ─── blockUser ────────────────────────────────────────────────────────
  it('blockUser sets blocked relationship', () => {
    manager.blockUser(makeUser('pete'));
    expect(graph.getRelationship('pete')).toBe('blocked');
  });

  it('blockUser emits user_blocked event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.blockUser(makeUser('quinn'));
    expect(events).toContain('user_blocked');
  });

  // ─── unblockUser ──────────────────────────────────────────────────────
  it('unblockUser removes blocked relationship', () => {
    manager.blockUser(makeUser('rose'));
    manager.unblockUser('rose');
    expect(graph.getRelationship('rose')).toBe('none');
  });

  it('unblockUser emits user_unblocked event', () => {
    const events: string[] = [];
    manager.onEvent((ev) => events.push(ev));
    manager.blockUser(makeUser('sam'));
    manager.unblockUser('sam');
    expect(events).toContain('user_unblocked');
  });

  // ─── isBlocked ────────────────────────────────────────────────────────
  it('isBlocked returns true for blocked users', () => {
    manager.blockUser(makeUser('eve'));
    expect(manager.isBlocked('eve')).toBe(true);
  });

  it('isBlocked returns false for non-blocked users', () => {
    expect(manager.isBlocked('nobody')).toBe(false);
  });

  // ─── onEvent ─────────────────────────────────────────────────────────
  it('multiple event listeners all receive events', () => {
    const log1: string[] = [];
    const log2: string[] = [];
    manager.onEvent((ev) => log1.push(ev));
    manager.onEvent((ev) => log2.push(ev));
    manager.sendRequest(makeUser('test'));
    expect(log1).toContain('request_sent');
    expect(log2).toContain('request_sent');
  });
});
