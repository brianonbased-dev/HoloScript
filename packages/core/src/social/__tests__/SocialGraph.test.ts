/**
 * SocialGraph Unit Tests
 *
 * Tests user CRUD, relationship management, caching,
 * and filtered queries (friends, pending, blocked).
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

describe('SocialGraph', () => {
  let graph: SocialGraph;

  beforeEach(() => {
    graph = new SocialGraph('local-user');
  });

  describe('updateUser / getUser', () => {
    it('should add a new user', () => {
      const user = makeUser('u1');
      graph.updateUser(user);
      expect(graph.getUser('u1')).toEqual(user);
    });

    it('should update an existing user', () => {
      graph.updateUser(makeUser('u1', { status: 'online' }));
      graph.updateUser(makeUser('u1', { status: 'away' }));
      expect(graph.getUser('u1')?.status).toBe('away');
    });

    it('should return undefined for unknown user', () => {
      expect(graph.getUser('nonexistent')).toBeUndefined();
    });
  });

  describe('setRelationship / getRelationship', () => {
    it('should set and get a relationship', () => {
      graph.setRelationship('u1', 'friend');
      expect(graph.getRelationship('u1')).toBe('friend');
    });

    it('should return none for unknown user', () => {
      expect(graph.getRelationship('unknown')).toBe('none');
    });

    it('should update existing relationship', () => {
      graph.setRelationship('u1', 'pending_incoming');
      graph.setRelationship('u1', 'friend');
      expect(graph.getRelationship('u1')).toBe('friend');
    });
  });

  describe('getFriends', () => {
    it('should return only friends', () => {
      graph.updateUser(makeUser('f1'));
      graph.updateUser(makeUser('f2'));
      graph.updateUser(makeUser('b1'));
      graph.setRelationship('f1', 'friend');
      graph.setRelationship('f2', 'friend');
      graph.setRelationship('b1', 'blocked');

      const friends = graph.getFriends();
      expect(friends).toHaveLength(2);
      expect(friends.map(f => f.id)).toContain('f1');
      expect(friends.map(f => f.id)).toContain('f2');
    });

    it('should use cache on second call', () => {
      graph.updateUser(makeUser('f1'));
      graph.setRelationship('f1', 'friend');
      const first = graph.getFriends();
      const second = graph.getFriends();
      expect(first).toBe(second); // Same reference = cached
    });
  });

  describe('getPendingIncoming', () => {
    it('should return only incoming requests', () => {
      graph.updateUser(makeUser('p1'));
      graph.updateUser(makeUser('p2'));
      graph.setRelationship('p1', 'pending_incoming');
      graph.setRelationship('p2', 'pending_outgoing');

      const incoming = graph.getPendingIncoming();
      expect(incoming).toHaveLength(1);
      expect(incoming[0].id).toBe('p1');
    });
  });

  describe('getPendingOutgoing', () => {
    it('should return only outgoing requests', () => {
      graph.updateUser(makeUser('p1'));
      graph.setRelationship('p1', 'pending_outgoing');

      const outgoing = graph.getPendingOutgoing();
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].id).toBe('p1');
    });
  });

  describe('getBlocked', () => {
    it('should return blocked users', () => {
      graph.updateUser(makeUser('b1'));
      graph.setRelationship('b1', 'blocked');

      const blocked = graph.getBlocked();
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe('b1');
    });
  });

  describe('removeRelationship', () => {
    it('should remove a relationship', () => {
      graph.setRelationship('u1', 'friend');
      graph.removeRelationship('u1');
      expect(graph.getRelationship('u1')).toBe('none');
    });

    it('should invalidate caches on removal', () => {
      graph.updateUser(makeUser('f1'));
      graph.setRelationship('f1', 'friend');
      graph.getFriends(); // populate cache
      graph.removeRelationship('f1');
      expect(graph.getFriends()).toHaveLength(0);
    });

    it('should be a no-op for nonexistent relationship', () => {
      graph.removeRelationship('nonexistent'); // should not throw
      expect(graph.getRelationship('nonexistent')).toBe('none');
    });
  });

  describe('invalidatedCaches', () => {
    it('should force re-computation on next query', () => {
      graph.updateUser(makeUser('f1'));
      graph.setRelationship('f1', 'friend');
      const first = graph.getFriends();
      graph.invalidatedCaches();
      const second = graph.getFriends();
      expect(first).not.toBe(second); // Different reference
      expect(second).toHaveLength(1); // Same content
    });
  });
});
