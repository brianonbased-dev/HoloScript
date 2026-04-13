/**
 * UserProfileCard.ts
 *
 * Creates a UI card displaying a user's profile and action buttons.
 */

import { SocialUser } from '@holoscript/mesh';
import { createPanel, createButton } from '../UIComponents';
import { HSPlusNode } from '../../types/HoloScriptPlus';

export interface UserProfileCardConfig {
  user: SocialUser;
  onAddFriend?: (userId: string) => void;
  onRemoveFriend?: (userId: string) => void;
  onBlock?: (userId: string) => void;
  onMessage?: (userId: string) => void;
  isFriend: boolean;
  isPending: boolean;
  isBlocked: boolean;
}

export class UserProfileCard {
  create(config: UserProfileCardConfig): HSPlusNode {
    const { user, isFriend, isPending, isBlocked } = config;

    const panel = createPanel({
      width: 0.4,
      height: 0.5,
      color: '#2d3436',
    });

    // Avatar (Placeholder)
    // @ts-expect-error
    panel.children?.push({
      type: 'entity',
      properties: { position: [0, 0.15, 0.01] },
      traits: new Map([
        ['render', { type: 'sphere', color: '#0984e3', radius: 0.05 }], // Simple avatar
      ]),
    } as unknown);

    // Name
    // @ts-expect-error
    panel.children?.push({
      type: 'text',
      properties: {
        text: user.displayName,
        position: [0, 0.08, 0.01],
        fontSize: 0.05,
        color: '#ffffff',
      },
    } as unknown);

    // Status
    const statusColors: Record<string, string> = {
      online: '#00b894',
      offline: '#636e72',
      away: '#fdcb6e',
      busy: '#d63031',
      playing: '#a29bfe',
    };

    // @ts-expect-error
    panel.children?.push({
      type: 'text',
      properties: {
        text: `${user.status} ${user.currentActivity ? '- ' + user.currentActivity : ''}`,
        position: [0, 0.04, 0.01],
        fontSize: 0.03,
        color: statusColors[user.status] || '#b2bec3',
      },
    } as unknown);

    // Actions
    let actionY = -0.05;
    const btnHeight = 0.08;
    const gap = 0.02;

    const addButton = (text: string, onClick?: (id: string) => void) => {
      if (!onClick) return;
      const btn = createButton({
        text,
        width: 0.3,
        height: btnHeight,
        position: [0, actionY, 0.01],
        color: '#636e72',
      });
      // In a real system, we'd bind the onClick event properly.
      // For now, we assume the runtime handles the event mapping via ID or a specific trait property we'd set here.
      // We'll simulate it by attaching a custom property or just verifying the structure.
      // @ts-expect-error
      (btn.properties as unknown).onClickHandler = () => onClick(user.id);

      panel.children?.push(btn);
      actionY -= btnHeight + gap;
    };

    if (isBlocked) {
      addButton('Unblock', config.onBlock); // Reuse onBlock for unblock toggle logic or separate
    } else if (isFriend) {
      addButton('Message', config.onMessage);
      addButton('Unfriend', config.onRemoveFriend);
    } else if (isPending) {
      addButton('Pending...', undefined);
    } else {
      addButton('Add Friend', config.onAddFriend);
    }

    if (!isBlocked) {
      addButton('Block', config.onBlock);
    }

    return panel;
  }
}
