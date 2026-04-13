import { describe, it, expect, beforeEach } from 'vitest';
import { SocialUIPanel } from '../ui/social/SocialUIPanel';
import { SocialGraph, SocialUser } from '@holoscript/mesh/social/SocialGraph';
import { FriendManager } from '@holoscript/mesh/social/FriendManager';

function makeUser(id: string): SocialUser {
  return {
    id,
    username: `user_${id}`,
    displayName: `User ${id}`,
    status: 'online',
    lastSeen: Date.now(),
  };
}

describe('SocialUIPanel', () => {
  let graph: SocialGraph;
  let fm: FriendManager;
  let panel: SocialUIPanel;

  beforeEach(() => {
    graph = new SocialGraph('me');
    fm = new FriendManager(graph);
    panel = new SocialUIPanel(graph, fm);
  });

  it('creates a root panel node', () => {
    const root = panel.create();
    expect(root).toBeDefined();
    expect(root.type).toBeDefined();
  });

  it('includes tab buttons as children', () => {
    const root = panel.create();
    // root has children (tab container + content area)
    expect(root.children).toBeDefined();
    expect(root.children!.length).toBeGreaterThanOrEqual(2);
  });

  it('includes Friends tab button', () => {
    const root = panel.create();
    const allNodes = flattenChildren(root);
    const friendsBtn = allNodes.find((n) => n.properties?.text === 'Friends');
    expect(friendsBtn).toBeDefined();
  });

  it('includes Requests tab button', () => {
    const root = panel.create();
    const allNodes = flattenChildren(root);
    const requestsBtn = allNodes.find((n) => n.properties?.text === 'Requests');
    expect(requestsBtn).toBeDefined();
  });

  it('includes a content area', () => {
    const root = panel.create();
    const allNodes = flattenChildren(root);
    const content = allNodes.find((n) => n.id === 'social_content_area');
    expect(content).toBeDefined();
  });

  it('renders friend list when friends exist', () => {
    graph.updateUser(makeUser('alice'));
    graph.setRelationship('alice', 'friend');

    const root = panel.create();
    const allNodes = flattenChildren(root);
    // Content area should have at least one child (the friend list)
    const content = allNodes.find((n) => n.id === 'social_content_area');
    expect(content).toBeDefined();
    expect(content!.children?.length).toBeGreaterThan(0);
  });

  it('renders empty list correctly with no friends', () => {
    const root = panel.create();
    // Should still create the UI without errors
    expect(root).toBeDefined();
  });
});

// Helper: flatten all descendants
function flattenChildren(node: any): any[] {
  const result: any[] = [node];
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenChildren(child));
    }
  }
  return result;
}
