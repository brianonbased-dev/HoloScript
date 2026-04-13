import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FriendManager } from '@holoscript/mesh';
import { SocialGraph, SocialUser } from '@holoscript/mesh';

// =============================================================================
// HELPERS
// =============================================================================

function makeUser(id: string, name = id): SocialUser {
  return { id, name, status: 'online', lastSeen: Date.now() };
}

// =============================================================================
// TESTS
// =============================================================================

describe('FriendManager', () => {
  let graph: SocialGraph;
  let fm: FriendManager;
  let events: Array<[string, any]>;

  beforeEach(() => {
    graph = new SocialGraph('me');
    fm = new FriendManager(graph); // no transport — offline mode
    events = [];
    fm.onEvent((evt, data) => events.push([evt, data]));
  });

  // ---------- Send Request ----------
  it('sends a friend request', () => {
    fm.sendRequest(makeUser('alice'));
    expect(events.some(([e]) => e === 'request_sent')).toBe(true);
    expect(graph.getRelationship('alice')).toBe('pending_outgoing');
  });

  it('throws when requesting an existing friend', () => {
    graph.updateUser(makeUser('bob'));
    graph.setRelationship('bob', 'friend');
    expect(() => fm.sendRequest(makeUser('bob'))).toThrow('already a friend');
  });

  it('throws when requesting a blocked user', () => {
    graph.updateUser(makeUser('carl'));
    graph.setRelationship('carl', 'blocked');
    expect(() => fm.sendRequest(makeUser('carl'))).toThrow('blocked');
  });

  it('does not duplicate pending_outgoing', () => {
    fm.sendRequest(makeUser('dave'));
    events.length = 0;
    fm.sendRequest(makeUser('dave')); // should no-op
    expect(events.length).toBe(0); // no second event
  });

  // ---------- Receive Request ----------
  it('receives a friend request', () => {
    fm.receiveRequest(makeUser('eve'));
    expect(events.some(([e]) => e === 'request_received')).toBe(true);
    expect(graph.getRelationship('eve')).toBe('pending_incoming');
  });

  it('ignores request from blocked user', () => {
    graph.updateUser(makeUser('frank'));
    graph.setRelationship('frank', 'blocked');
    fm.receiveRequest(makeUser('frank'));
    expect(events.filter(([e]) => e === 'request_received').length).toBe(0);
    expect(graph.getRelationship('frank')).toBe('blocked'); // unchanged
  });

  // ---------- Accept / Reject ----------
  it('accepts a friend request', () => {
    fm.receiveRequest(makeUser('gina'));
    fm.acceptRequest('gina');
    expect(graph.getRelationship('gina')).toBe('friend');
    expect(events.some(([e]) => e === 'friend_added')).toBe(true);
  });

  it('throws when accepting non-pending user', () => {
    expect(() => fm.acceptRequest('nobody')).toThrow('No pending request');
  });

  it('rejects a friend request', () => {
    fm.receiveRequest(makeUser('hank'));
    fm.rejectRequest('hank');
    expect(events.some(([e]) => e === 'request_rejected')).toBe(true);
    // Relationship should be removed
    expect(graph.getRelationship('hank')).toBe('none');
  });

  it('silently ignores reject for non-pending user', () => {
    fm.rejectRequest('nobody');
    expect(events.length).toBe(0);
  });

  // ---------- Remove Friend ----------
  it('removes a friend', () => {
    graph.updateUser(makeUser('iris'));
    graph.setRelationship('iris', 'friend');
    fm.removeFriend('iris');
    expect(events.some(([e]) => e === 'friend_removed')).toBe(true);
    expect(graph.getRelationship('iris')).toBe('none');
  });

  // ---------- Block / Unblock ----------
  it('blocks a user', () => {
    fm.blockUser(makeUser('john'));
    expect(fm.isBlocked('john')).toBe(true);
    expect(events.some(([e]) => e === 'user_blocked')).toBe(true);
  });

  it('unblocks a user', () => {
    fm.blockUser(makeUser('kate'));
    fm.unblockUser('kate');
    expect(fm.isBlocked('kate')).toBe(false);
    expect(events.some(([e]) => e === 'user_unblocked')).toBe(true);
  });

  it('isBlocked returns false for unknown user', () => {
    expect(fm.isBlocked('nobody')).toBe(false);
  });
});
