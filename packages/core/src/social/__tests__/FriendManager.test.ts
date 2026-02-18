import { describe, it, expect, vi } from 'vitest';
import { FriendManager } from '../FriendManager';
import { SocialGraph, type SocialUser } from '../SocialGraph';

function makeUser(id: string): SocialUser {
  return { id, username: `user_${id}`, displayName: `User ${id}`, status: 'online', lastSeen: Date.now() };
}

function makeGraph() {
  return new SocialGraph('me');
}

describe('FriendManager', () => {
  it('sendRequest sets pending_outgoing', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.sendRequest(makeUser('u1'));
    expect(g.getRelationship('u1')).toBe('pending_outgoing');
  });

  it('sendRequest emits request_sent', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    const cb = vi.fn();
    fm.onEvent(cb);
    fm.sendRequest(makeUser('u1'));
    expect(cb).toHaveBeenCalledWith('request_sent', { userId: 'u1' });
  });

  it('sendRequest throws if already friend', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'friend');
    expect(() => fm.sendRequest(makeUser('u1'))).toThrow('already a friend');
  });

  it('sendRequest throws if blocked', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'blocked');
    expect(() => fm.sendRequest(makeUser('u1'))).toThrow('blocked');
  });

  it('sendRequest is no-op if already pending_outgoing', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    const cb = vi.fn();
    fm.onEvent(cb);
    fm.sendRequest(makeUser('u1'));
    fm.sendRequest(makeUser('u1')); // second call
    expect(cb).toHaveBeenCalledTimes(1); // only first emits
  });

  it('receiveRequest sets pending_incoming', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.receiveRequest(makeUser('u1'));
    expect(g.getRelationship('u1')).toBe('pending_incoming');
  });

  it('receiveRequest ignores if blocked', () => {
    const g = makeGraph();
    g.updateUser(makeUser('u1'));
    g.setRelationship('u1', 'blocked');
    const fm = new FriendManager(g);
    fm.receiveRequest(makeUser('u1'));
    expect(g.getRelationship('u1')).toBe('blocked');
  });

  it('acceptRequest promotes to friend', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.receiveRequest(makeUser('u1'));
    const cb = vi.fn();
    fm.onEvent(cb);
    fm.acceptRequest('u1');
    expect(g.getRelationship('u1')).toBe('friend');
    expect(cb).toHaveBeenCalledWith('friend_added', { userId: 'u1' });
  });

  it('acceptRequest throws if no pending', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    expect(() => fm.acceptRequest('u1')).toThrow('No pending request');
  });

  it('rejectRequest removes relationship', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.receiveRequest(makeUser('u1'));
    fm.rejectRequest('u1');
    expect(g.getRelationship('u1')).toBe('none');
  });

  it('removeFriend removes relationship', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.receiveRequest(makeUser('u1'));
    fm.acceptRequest('u1');
    fm.removeFriend('u1');
    expect(g.getRelationship('u1')).toBe('none');
  });

  it('blockUser sets blocked', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.blockUser(makeUser('u1'));
    expect(fm.isBlocked('u1')).toBe(true);
  });

  it('unblockUser clears blocked', () => {
    const g = makeGraph();
    const fm = new FriendManager(g);
    fm.blockUser(makeUser('u1'));
    fm.unblockUser('u1');
    expect(fm.isBlocked('u1')).toBe(false);
  });
});
