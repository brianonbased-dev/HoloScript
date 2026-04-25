/**
 * FriendList.ts
 *
 * Generates a scrollable list of friends with status indicators.
 */

import { createScrollView, createButton } from '../UIComponents';
import type { HSPlusNode } from '@holoscript/core';

type SocialUser = {
  id: string;
  displayName: string;
  status: 'online' | 'offline' | 'away' | 'busy';
};

export class FriendList {
  create(friends: SocialUser[], onSelect: (userId: string) => void): HSPlusNode {
    const itemHeight = 0.1;
    const padding = 0.01;
    const viewportHeight = 0.6;
    const contentHeight = Math.max(
      viewportHeight,
      friends.length * (itemHeight + padding) + padding * 2
    );

    const scrollView = createScrollView({
      width: 0.5,
      viewportHeight,
      contentHeight,
      color: '#1e272e',
    });

    let currentY = contentHeight / 2 - itemHeight / 2 - padding;

    friends.forEach((friend) => {
      const item = createButton({
        text: `${friend.displayName} (${friend.status})`,
        width: 0.45,
        height: itemHeight,
        position: { x: 0, y: currentY, z: 0.005 },
        color: friend.status === 'online' ? '#2d3436' : '#2d3436', // darker for offline?
      });

      // Add status dot
      const dotColor = friend.status === 'online' ? '#00b894' : '#636e72';
      item.children?.push({
        type: 'entity',
        properties: { position: { x: -0.2, y: 0, z: 0.01 } },
        traits: new Map([['render', { type: 'sphere', radius: 0.015, color: dotColor }]]),
      });

      if (item.properties) {
        (item.properties as Record<string, unknown>).onClickHandler = () => onSelect(friend.id);
      }

      scrollView.children?.push(item);
      currentY -= itemHeight + padding;
    });

    return scrollView;
  }
}
