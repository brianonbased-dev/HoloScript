import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialGraph, SocialUser } from '../SocialGraph';
import { FriendManager } from '../FriendManager';
import { PresenceManager } from '../PresenceManager';

// Create a mock that satisfies the WebRTCTransport shape expected by the constructors
function createMockTransport() {
  return {
    onSocialMessage: vi.fn(),
    sendSocialMessage: vi.fn(),
    // Other methods if needed by integration
  } as any;
}

describe('Social System', () => {
  let graph: SocialGraph;
  let friends: FriendManager;
  let presence: PresenceManager;
  let mockTransport: any;

  const userA: SocialUser = {
    id: 'u1',
    username: 'alice',
    displayName: 'Alice',
    status: 'online',
    lastSeen: 0,
  };
  const userB: SocialUser = {
    id: 'u2',
    username: 'bob',
    displayName: 'Bob',
    status: 'offline',
    lastSeen: 0,
  };

  beforeEach(() => {
    graph = new SocialGraph('local-user');
    mockTransport = createMockTransport();
    friends = new FriendManager(graph, mockTransport);
    presence = new PresenceManager(graph, mockTransport);
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
      expect(mockTransport.sendSocialMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SOCIAL_STATUS',
          payload: expect.objectContaining({ status: 'away' }),
        })
      );
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
