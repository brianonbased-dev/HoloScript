import { describe, it, expect, beforeEach } from 'vitest';
import { SocialGraph, SocialUser } from '@holoscript/mesh/social/SocialGraph';

function makeUser(id: string, overrides?: Partial<SocialUser>): SocialUser {
  return {
    id,
    username: `user_${id}`,
    displayName: `User ${id}`,
    status: 'online',
    lastSeen: Date.now(),
    ...overrides,
  };
}

describe('SocialGraph', () => {
  let graph: SocialGraph;

  beforeEach(() => {
    graph = new SocialGraph('local-user');
  });

  // ---------- User management ----------
  it('adds and retrieves a user', () => {
    graph.updateUser(makeUser('alice'));
    const user = graph.getUser('alice');
    expect(user).toBeDefined();
    expect(user!.displayName).toBe('User alice');
  });

  it('updates existing user in-place', () => {
    graph.updateUser(makeUser('bob'));
    graph.updateUser(makeUser('bob', { status: 'away' }));
    expect(graph.getUser('bob')!.status).toBe('away');
  });

  it('returns undefined for unknown user', () => {
    expect(graph.getUser('nobody')).toBeUndefined();
  });

  // ---------- Relationships ----------
  it('sets and gets a relationship', () => {
    graph.updateUser(makeUser('charlie'));
    graph.setRelationship('charlie', 'friend');
    expect(graph.getRelationship('charlie')).toBe('friend');
  });

  it('returns none for unknown relationship', () => {
    expect(graph.getRelationship('nobody')).toBe('none');
  });

  it('removes a relationship', () => {
    graph.updateUser(makeUser('dave'));
    graph.setRelationship('dave', 'friend');
    graph.removeRelationship('dave');
    expect(graph.getRelationship('dave')).toBe('none');
  });

  // ---------- Friend lists ----------
  it('returns friends list', () => {
    graph.updateUser(makeUser('eve'));
    graph.updateUser(makeUser('frank'));
    graph.setRelationship('eve', 'friend');
    graph.setRelationship('frank', 'blocked');

    const friends = graph.getFriends();
    expect(friends.length).toBe(1);
    expect(friends[0].id).toBe('eve');
  });

  it('caches friends list', () => {
    graph.updateUser(makeUser('a'));
    graph.setRelationship('a', 'friend');
    const first = graph.getFriends();
    const second = graph.getFriends();
    expect(first).toBe(second); // Same reference = cached
  });

  it('invalidates cache on relationship change', () => {
    graph.updateUser(makeUser('b'));
    graph.setRelationship('b', 'friend');
    graph.getFriends();
    graph.setRelationship('b', 'blocked');
    const friends = graph.getFriends();
    expect(friends.length).toBe(0);
  });

  // ---------- Pending / Blocked ----------
  it('returns pending incoming', () => {
    graph.updateUser(makeUser('gina'));
    graph.setRelationship('gina', 'pending_incoming');
    expect(graph.getPendingIncoming().length).toBe(1);
    expect(graph.getPendingIncoming()[0].id).toBe('gina');
  });

  it('returns pending outgoing', () => {
    graph.updateUser(makeUser('hank'));
    graph.setRelationship('hank', 'pending_outgoing');
    expect(graph.getPendingOutgoing().length).toBe(1);
  });

  it('returns blocked users', () => {
    graph.updateUser(makeUser('iris'));
    graph.setRelationship('iris', 'blocked');
    expect(graph.getBlocked().length).toBe(1);
    expect(graph.getBlocked()[0].id).toBe('iris');
  });

  it('does not duplicate on same setRelationship type', () => {
    graph.updateUser(makeUser('john'));
    graph.setRelationship('john', 'friend');
    graph.setRelationship('john', 'friend'); // same
    expect(graph.getFriends().length).toBe(1);
  });
});
