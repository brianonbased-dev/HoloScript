import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialGraph, SocialUser } from '../SocialGraph';
import { FriendManager } from '../FriendManager';
import { PresenceManager } from '../PresenceManager';

describe('Social System', () => {
  let graph: SocialGraph;
  let friends: FriendManager;
  let presence: PresenceManager;
  let mockBroadcast: any;

  const userA: SocialUser = { id: 'u1', username: 'alice', displayName: 'Alice', status: 'online', lastSeen: 0 };
  const userB: SocialUser = { id: 'u2', username: 'bob', displayName: 'Bob', status: 'offline', lastSeen: 0 };

  beforeEach(() => {
    graph = new SocialGraph('local-user');
    friends = new FriendManager(graph);
    mockBroadcast = vi.fn();
    presence = new PresenceManager(graph, mockBroadcast);
  });

  describe('SocialGraph', () => {
    it('should store and retrieve users', () => {
      graph.updateUser(userA);
      expect(graph.getUser('u1')).toEqual(userA);
    });

    it('should manage relationships', () => {
      graph.updateUser(userA);
      graph.setRelationship('u1', 'friend');
      expect(graph.getRelationship('u1')).toBe('friend');
      expect(graph.getFriends()).toHaveLength(1);
    });
  });

  describe('FriendManager', () => {
    it('should send friend request', () => {
      const listener = vi.fn();
      friends.onEvent(listener);

      friends.sendRequest(userB);

      expect(graph.getRelationship('u2')).toBe('pending_outgoing');
      expect(listener).toHaveBeenCalledWith('request_sent', { userId: 'u2' });
    });

    it('should accept incoming request', () => {
      // Simulate receiving request
      friends.receiveRequest(userA);
      expect(graph.getRelationship('u1')).toBe('pending_incoming');

      // Accept
      const listener = vi.fn();
      friends.onEvent(listener);
      friends.acceptRequest('u1');

      expect(graph.getRelationship('u1')).toBe('friend');
      expect(listener).toHaveBeenCalledWith('friend_added', { userId: 'u1' });
    });

    it('should block user', () => {
      friends.blockUser(userB);
      expect(graph.getRelationship('u2')).toBe('blocked');
      expect(graph.getBlocked()).toHaveLength(1);
    });
  });

  describe('PresenceManager', () => {
    it('should broadcast local status', () => {
      presence.setLocalStatus('away');
      expect(mockBroadcast).toHaveBeenCalledWith('away');
    });

    it('should update friend status', () => {
      graph.updateUser(userA); // Add user first
      
      presence.handlePresenceUpdate('u1', 'busy', 'Coding');
      
      const updatedUser = graph.getUser('u1');
      expect(updatedUser?.status).toBe('busy');
      expect(updatedUser?.currentActivity).toBe('Coding');
    });
  });
});
