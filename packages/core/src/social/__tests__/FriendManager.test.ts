/**
 * FriendManager Unit Tests
 *
 * Tests friend request lifecycle: send/accept/reject/remove/block.
 * Tests event emissions and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FriendManager } from '../FriendManager';
import { SocialGraph, type SocialUser } from '../SocialGraph';

function makeUser(id: string, overrides: Partial<SocialUser> = {}): SocialUser {
  return {
    id,
    username: `user_${id}`,
    displayName: `User ${id}`,
    status: 'online',
    lastSeen: Date.now(),
    ...overrides,
  };
}

describe('FriendManager', () => {
  let graph: SocialGraph;
  let manager: FriendManager;
  let listener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    graph = new SocialGraph('local-user');
    manager = new FriendManager(graph); // No transport, offline mode
    listener = vi.fn();
    manager.onEvent(listener);
  });

  describe('sendRequest', () => {
    it('should send a friend request and emit event', () => {
      const user = makeUser('remote-1');
      manager.sendRequest(user);

      expect(graph.getRelationship('remote-1')).toBe('pending_outgoing');
      expect(listener).toHaveBeenCalledWith('request_sent', { userId: 'remote-1' });
    });

    it('should throw if user is already a friend', () => {
      const user = makeUser('friend-1');
      graph.updateUser(user);
      graph.setRelationship('friend-1', 'friend');

      expect(() => manager.sendRequest(user)).toThrow('already a friend');
    });

    it('should throw if user is blocked', () => {
      const user = makeUser('blocked-1');
      graph.updateUser(user);
      graph.setRelationship('blocked-1', 'blocked');

      expect(() => manager.sendRequest(user)).toThrow('blocked');
    });

    it('should no-op if request already pending', () => {
      const user = makeUser('pending-1');
      manager.sendRequest(user);
      listener.mockClear();
      manager.sendRequest(user); // duplicate send
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('receiveRequest', () => {
    it('should mark as pending_incoming and emit event', () => {
      const user = makeUser('remote-2');
      manager.receiveRequest(user);

      expect(graph.getRelationship('remote-2')).toBe('pending_incoming');
      expect(listener).toHaveBeenCalledWith('request_received', expect.objectContaining({ user }));
    });

    it('should ignore requests from blocked users', () => {
      const user = makeUser('blocked-2');
      graph.updateUser(user);
      graph.setRelationship('blocked-2', 'blocked');

      manager.receiveRequest(user);
      expect(listener).not.toHaveBeenCalledWith('request_received', expect.anything());
    });

    it('should ignore requests from existing friends', () => {
      const user = makeUser('friend-2');
      graph.updateUser(user);
      graph.setRelationship('friend-2', 'friend');

      manager.receiveRequest(user);
      expect(listener).not.toHaveBeenCalledWith('request_received', expect.anything());
    });
  });

  describe('acceptRequest', () => {
    it('should promote pending_incoming to friend', () => {
      const user = makeUser('remote-3');
      manager.receiveRequest(user);
      listener.mockClear();

      manager.acceptRequest('remote-3');

      expect(graph.getRelationship('remote-3')).toBe('friend');
      expect(listener).toHaveBeenCalledWith('friend_added', { userId: 'remote-3' });
    });

    it('should throw if no pending request exists', () => {
      expect(() => manager.acceptRequest('nonexistent')).toThrow('No pending request');
    });
  });

  describe('rejectRequest', () => {
    it('should remove relationship and emit event', () => {
      const user = makeUser('remote-4');
      manager.receiveRequest(user);
      listener.mockClear();

      manager.rejectRequest('remote-4');

      expect(graph.getRelationship('remote-4')).toBe('none');
      expect(listener).toHaveBeenCalledWith('request_rejected', { userId: 'remote-4' });
    });

    it('should no-op if no pending request', () => {
      manager.rejectRequest('nonexistent'); // should not throw
      expect(listener).not.toHaveBeenCalledWith('request_rejected', expect.anything());
    });
  });

  describe('removeFriend', () => {
    it('should remove friend and emit event', () => {
      const user = makeUser('friend-3');
      graph.updateUser(user);
      graph.setRelationship('friend-3', 'friend');

      manager.removeFriend('friend-3');

      expect(graph.getRelationship('friend-3')).toBe('none');
      expect(listener).toHaveBeenCalledWith('friend_removed', { userId: 'friend-3' });
    });
  });

  describe('blockUser / unblockUser / isBlocked', () => {
    it('should block a user and emit event', () => {
      const user = makeUser('troll-1');
      manager.blockUser(user);

      expect(graph.getRelationship('troll-1')).toBe('blocked');
      expect(manager.isBlocked('troll-1')).toBe(true);
      expect(listener).toHaveBeenCalledWith('user_blocked', { userId: 'troll-1' });
    });

    it('should unblock a user and emit event', () => {
      const user = makeUser('troll-2');
      manager.blockUser(user);
      listener.mockClear();

      manager.unblockUser('troll-2');

      expect(graph.getRelationship('troll-2')).toBe('none');
      expect(manager.isBlocked('troll-2')).toBe(false);
      expect(listener).toHaveBeenCalledWith('user_unblocked', { userId: 'troll-2' });
    });
  });
});
