/**
 * SocialUIPanel.ts
 *
 * Main Social UI Panel.
 * Manages tabs (Friends, Requests, Search) and detailed profile views.
 */

import { SocialGraph } from '../../social/SocialGraph';
import { FriendManager } from '../../social/FriendManager';
import { FriendList } from './FriendList';
import { UserProfileCard } from './UserProfileCard';
import { createPanel, createButton } from '../UIComponents';
import { HSPlusNode } from '../../types/HoloScriptPlus';

export class SocialUIPanel {
  private friendListRenderer = new FriendList();
  private profileRenderer = new UserProfileCard();
  
  constructor(
    private graph: SocialGraph, 
    private friendManager: FriendManager
  ) {}

  create(): HSPlusNode {
    const mainPanel = createPanel({
        width: 1.0, 
        height: 0.8,
        color: '#1e272e'
    });

    // Sidebar / Tabs
    const tabContainer = createPanel({
        width: 0.3,
        height: 0.75,
        position: { x: -0.33, y: 0, z: 0.01 },
        color: '#2d3436'
    });
    mainPanel.children?.push(tabContainer);

    // "Friends" Tab Button
    tabContainer.children?.push(createButton({
        text: 'Friends',
        width: 0.25,
        height: 0.1,
        position: { x: 0, y: 0.3, z: 0.01 }
    }));

    // "Requests" Tab Button
    tabContainer.children?.push(createButton({
        text: 'Requests',
        width: 0.25,
        height: 0.1,
        position: { x: 0, y: 0.18, z: 0.01 }
    }));


    // Content Area (Friend List by default)
    const contentArea = createPanel({
        id: 'social_content_area',
        width: 0.65,
        height: 0.75,
        position: { x: 0.15, y: 0, z: 0.01 },
        color: '#34495e' // Placeholder BG
    });
    mainPanel.children?.push(contentArea);

    // Render Friend List into Content Area
    const friends = this.graph.getFriends();
    const listNode = this.friendListRenderer.create(friends, (userId) => {
        console.log('Selected user:', userId);
        // Logic to swap contentArea to ProfileCard would go here
        // For a declarative scene graph, we'd regenerate the tree or use a reactive binding.
        // Since we are generating a static tree snapshot here for the runtime:
    });
    
    // Position the list inside content area
    // Note: ScrollView centers itself, so we might need localized positioning
    if (listNode.properties?.position) {
        listNode.properties.position = { x: 0, y: 0, z: 0.01 };
    }
    contentArea.children?.push(listNode);

    return mainPanel;
  }
}
