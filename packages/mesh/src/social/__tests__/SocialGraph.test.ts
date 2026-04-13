import { describe, it, expect } from 'vitest';
import { SocialGraph, type SocialUser } from '@holoscript/core';

function makeUser(id: string, name = `user_${id}`): SocialUser {
  return { id, username: name, displayName: name, status: 'online', lastSeen: Date.now() };
}

describe('SocialGraph', () => {
  it('starts empty', () => {
    const g = new SocialGraph('me');
    expect(g.getFriends()).toEqual([]);
    expect(g.getPendingIncoming()).toEqual([]);
    expect(g.getPendingOutgoing()).toEqual([]);
    expect(g.getBlocked()).toEqual([]);
  });

  it('updateUser adds user', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    expect(g.getUser('u1')!.username).toBe('user_u1');
  });

  it('updateUser merges existing', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.updateUser({ ...makeUser('u1'), status: 'away' });
    expect(g.getUser('u1')!.status).toBe('away');
  });

  it('getUser returns undefined for unknown', () => {
    const g = new SocialGraph('me');
    expect(g.getUser('nope')).toBeUndefined();
  });

  it('setRelationship + getRelationship', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'friend');
    expect(g.getRelationship('u1')).toBe('friend');
  });

  it('getRelationship returns none for unknown', () => {
    const g = new SocialGraph('me');
    expect(g.getRelationship('unknown')).toBe('none');
  });

  it('getFriends returns only friends', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.updateUser(makeUser('u2'));
    g.updateUser(makeUser('u3'));
    g.setRelationship('u1', 'friend');
    g.setRelationship('u2', 'blocked');
    g.setRelationship('u3', 'friend');
    expect(g.getFriends().length).toBe(2);
  });

  it('getPendingIncoming filters correctly', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'pending_incoming');
    expect(g.getPendingIncoming().length).toBe(1);
    expect(g.getPendingIncoming()[0].id).toBe('u1');
  });

  it('getPendingOutgoing filters correctly', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'pending_outgoing');
    expect(g.getPendingOutgoing().length).toBe(1);
  });

  it('getBlocked filters correctly', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'blocked');
    expect(g.getBlocked().length).toBe(1);
  });

  it('removeRelationship clears relationship', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'friend');
    g.removeRelationship('u1');
    expect(g.getRelationship('u1')).toBe('none');
  });

  it('removeRelationship is safe for unknown', () => {
    const g = new SocialGraph('me');
    expect(() => g.removeRelationship('nope')).not.toThrow();
  });

  it('setRelationship only updates on change', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'friend');
    // Get cache populated
    g.getFriends();
    // Set same relationship — cache should NOT be invalidated
    g.setRelationship('u1', 'friend');
    // We just test it doesn't throw and is still friend
    expect(g.getRelationship('u1')).toBe('friend');
  });

  it('invalidatedCaches causes re-computation', () => {
    const g = new SocialGraph('me');
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'friend');
    const friends1 = g.getFriends();
    g.invalidatedCaches();
    const friends2 = g.getFriends();
    expect(friends2.length).toBe(friends1.length);
    expect(friends2).not.toBe(friends1); // Different array instances
  });
});
