import { bench, describe } from 'vitest';
import { SocialGraph, SocialUser } from '@holoscript/core';
import { FriendManager } from '@holoscript/core';
import { PresenceManager } from '@holoscript/core';

describe('Social System Performance', () => {
  const graph = new SocialGraph('local-user');
  const friendManager = new FriendManager(graph);

  // Populate graph with 10,000 users
  const userCount = 10000;
  const users: SocialUser[] = [];

  for (let i = 0; i < userCount; i++) {
    const user: SocialUser = {
      id: `user-${i}`,
      username: `user${i}`,
      displayName: `User ${i}`,
      status: 'offline',
      lastSeen: Date.now(),
    };
    users.push(user);
    graph.updateUser(user);

    // Randomly assign relationships
    if (i % 2 === 0) graph.setRelationship(user.id, 'friend');
    else if (i % 3 === 0) graph.setRelationship(user.id, 'pending_incoming');
  }

  bench('SocialGraph.getFriends (Filter 10k)', () => {
    graph.getFriends();
  });

  bench('SocialGraph.getPendingIncoming (Filter 10k)', () => {
    graph.getPendingIncoming();
  });

  bench('SocialGraph.updateUser (Map Set)', () => {
    const randomIdx = Math.floor(Math.random() * userCount);
    graph.updateUser(users[randomIdx]);
  });
});
