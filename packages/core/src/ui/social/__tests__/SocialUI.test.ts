import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialGraph, SocialUser } from '../../../social/SocialGraph';
import { FriendManager } from '../../../social/FriendManager';
import { SocialUIPanel } from '../SocialUIPanel';
import { FriendList } from '../FriendList';
import { UserProfileCard } from '../UserProfileCard';

describe('Social UI', () => {
  let graph: SocialGraph;
  let friends: FriendManager;

  const userA: SocialUser = { id: 'u1', username: 'alice', displayName: 'Alice', status: 'online', lastSeen: 0 };
  const userB: SocialUser = { id: 'u2', username: 'bob', displayName: 'Bob', status: 'offline', lastSeen: 0 };

  beforeEach(() => {
    graph = new SocialGraph('local-user');
    friends = new FriendManager(graph);
    graph.updateUser(userA);
    graph.updateUser(userB);
    graph.setRelationship('u1', 'friend');
  });

  describe('FriendList', () => {
    it('should generate scroll view with items', () => {
      const list = new FriendList();
      const node = list.create([userA, userB], vi.fn());

      expect(node.traits?.has('scrollable')).toBe(true);
      // userA is friend, userB is not (but passed to list), so 2 items
      // Check children count (2 buttons)
      expect(node.children).toHaveLength(2);
      
      const btn1 = node.children![0];
      const btn2 = node.children![1];
      
      // Check text (Button has text child)
      const text1 = (btn1.children![0] as any).properties.text;
      expect(text1).toContain('Alice');
    });
  });

  describe('UserProfileCard', () => {
    it('should show correct buttons for friend', () => {
      const card = new UserProfileCard();
      const node = card.create({
          user: userA,
          isFriend: true,
          isPending: false,
          isBlocked: false,
          onMessage: vi.fn(),
          onRemoveFriend: vi.fn()
      });

      // Find buttons by iterating children
      const buttons = node.children!.filter(c => 
          c.traits?.has('pressable') && 
          (c.children![0] as any).properties.text === 'Message'
      );
      expect(buttons).toHaveLength(1);
    });

    it('should show Add Friend for non-friend', () => {
      const card = new UserProfileCard();
      const node = card.create({
          user: userB,
          isFriend: false,
          isPending: false,
          isBlocked: false,
          onAddFriend: vi.fn()
      });

      const buttons = node.children!.filter(c => 
          c.traits?.has('pressable') && 
          (c.children![0] as any).properties.text === 'Add Friend'
      );
      expect(buttons).toHaveLength(1);
    });
  });

  describe('SocialUIPanel', () => {
    it('should construct main layout', () => {
      const panel = new SocialUIPanel(graph, friends);
      const node = panel.create();

      expect(node.children).toBeDefined();
      // Should have Tab Container and Content Area
      expect(node.children?.length).toBeGreaterThanOrEqual(2);
    });
  });
});
